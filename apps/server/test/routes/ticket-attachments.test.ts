import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedTicket } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * The attachments read — `GET /v1/workspaces/:workspaceId/tickets/:ticketId/attachments`.
 *
 * ## The route this replaces nothing with, and the door it rides
 *
 * `listTicketAttachments` (`attachments/attachment-repo.ts:76`) was written and
 * tested by Plan 7 and had **zero production callers**: the only references in
 * the tree were its own test file and the upload/download doors' fixtures. A
 * ticket's attachments therefore reached no surface at all — `TicketSheetProps`
 * has accepted an `attachments` prop since Plan 6, and the single mount in the
 * product (`apps/web`'s project page) never passed it.
 *
 * **THE VISIBILITY PREDICATE IS THE ONE THE EVENTS DOOR ALREADY USES, and this
 * file proves it by AGREEMENT rather than by reading.** The events door
 * (`routes/tickets.ts`, `/v1/workspaces/:workspaceId/tickets/:ticketId/events`)
 * guards with `loadTicketRow` → 404, then `canSee` → 404. This route is
 * registered beside it with the same two guards, in the same order, answering
 * the same `NOT_FOUND_BODY` — and case 16.52 asserts the two doors answer
 * identically for an invisible ticket and for a nonexistent one, with a
 * positive control proving neither door is simply 404ing everything. A second,
 * weaker answer to "may this caller see this ticket" is the failure this shape
 * exists to make impossible: there is one predicate, `canSee`, and both doors
 * call it.
 *
 * ⚠ **THIS ROUTE NOW CARRIES A THIRD GUARD THE EVENTS DOOR DOES NOT**, added
 * 2026-09-20: `ticketIsLive` → 404, which refuses a SOFT-DELETED ticket. The
 * events door keeps serving a tombstone on purpose (*"Its history is retained,
 * because other events cite it"*), so the two doors are no longer identical in
 * guard count and this file's 16.52 cases — which are about VISIBILITY, and use
 * live tickets throughout — still hold unchanged. The deleted arms are cases
 * 16.96–16.99 in `test/integration/soft-deleted-attachments.test.ts`, which
 * also pins the history doors' exception rather than leaving it to be
 * discovered.
 *
 * ## Why the fixture asserts ROWS ARE ABSENT, not just present
 *
 * A door returning every attachment in the database would pass a
 * "contains these two rows" assertion. Case 16.48 therefore builds TWO tickets
 * with attachments in the SAME workspace and holds each door to a SET
 * DIFFERENCE against the other's ids — the shape that catches a missing
 * `ticket_id` predicate, which is the one way this route could leak a file from
 * a ticket the caller cannot see into a list for one they can.
 *
 * ## What is NOT here
 *
 * No `store` is constructed: this route serves rows and never touches bytes, so
 * a fixture that put objects in a store would be exercising the download door's
 * dependency for nothing. The bytes-missing case (c) that
 * `attachments-download.test.ts` proves belongs to the door that reads them.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

const WS = newUlid();
const PRJ = newUlid();
const OTHER_WS = newUlid();
const OTHER_PRJ = newUlid();

let db: TestDatabase;
let app: FastifyInstance;
let memberToken = '';
let guestToken = '';

/** The ticket the positive controls use. Two rows, in this creation order. */
let TICKET = '';
const FIRST_ID = newUlid();
const SECOND_ID = newUlid();
/** A row whose stored filename `sanitizeFilename` changes — see case 16.53. */
const UNSAFE_ID = newUlid();
const UNSAFE_FILENAME = 'bad"name.pdf';
/** A SECOND ticket in the same workspace, with its own attachment. */
let SIBLING = '';
const SIBLING_ID = newUlid();
/** A visible ticket with no attachments at all — the empty case. */
let EMPTY_TICKET = '';
/** A ticket in ANOTHER workspace, probed through this one's path. */
let FOREIGN_TICKET = '';
const FOREIGN_ATTACHMENT_ID = newUlid();
/** An id that names no ticket anywhere. */
const GHOST = newUlid();

const INVISIBLE = newUlid();

function list(token: string, workspaceId: string, ticketId: string) {
  return app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}/attachments`,
    headers: { cookie: `better-auth.session_token=${token}` },
  });
}

async function attach(id: string, ticketId: string, overrides: Record<string, unknown> = {}) {
  await insertAttachment(db.pool, {
    id,
    workspaceId: WS,
    ticketId,
    uploaderId: '01J9GUSA000000000000000000',
    filename: `${id}.pdf`,
    mime: 'application/pdf',
    size: 48211,
    objectKey: `w/${WS}/a/${id}`,
    ...overrides,
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  const otp = built.otp;
  await app.ready();

  const member = await signInWithPhone(app, otp, '+919000000301');
  const guest = await signInWithPhone(app, otp, '+919000000302');
  memberToken = member.token;
  guestToken = guest.token;

  await seedMember(db.pool, WS, member.userId, 'member', [{ projectId: PRJ }]);
  await seedGuest(db.pool, WS, guest.userId);

  TICKET = newUlid();
  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId: TICKET });
  await attach(FIRST_ID, TICKET, { filename: 'gst-receipt.pdf' });
  await attach(SECOND_ID, TICKET, { filename: 'shelf.png', mime: 'image/png' });
  // A row this route's own upload path did NOT write — the shape
  // `attachments-download.test.ts` calls "a row some other writer put there".
  await attach(UNSAFE_ID, TICKET, { filename: UNSAFE_FILENAME });

  SIBLING = newUlid();
  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId: SIBLING });
  await attach(SIBLING_ID, SIBLING);

  EMPTY_TICKET = newUlid();
  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId: EMPTY_TICKET });

  // A workspace this member does NOT belong to, holding a ticket they may not
  // see even though its id is well-formed and its rows are real.
  FOREIGN_TICKET = newUlid();
  await seedMember(db.pool, OTHER_WS, member.userId, 'member', [{ projectId: OTHER_PRJ }]);
  await seedTicket(db.pool, {
    workspaceId: OTHER_WS,
    projectId: OTHER_PRJ,
    ticketId: FOREIGN_TICKET,
  });
  await insertAttachment(db.pool, {
    id: FOREIGN_ATTACHMENT_ID,
    workspaceId: OTHER_WS,
    ticketId: FOREIGN_TICKET,
    uploaderId: '01J9GUSA000000000000000000',
    filename: 'other-workspace.pdf',
    mime: 'application/pdf',
    size: 12,
    objectKey: `w/${OTHER_WS}/a/${FOREIGN_ATTACHMENT_ID}`,
  });

  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId: INVISIBLE });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('GET /v1/workspaces/:workspaceId/tickets/:ticketId/attachments', () => {
  /**
   * 16.47 — the door serves THIS ticket's attachments, in creation order, in the
   * shape the client's `AttachmentListEntry` asks for; and an unauthenticated
   * caller is refused before any of it.
   */
  it('serves the ticket’s own rows in creation order, and refuses an unauthenticated caller', async () => {
    const anon = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/${TICKET}/attachments`,
    });
    expect(anon.statusCode).toBe(401);

    const res = await list(memberToken, WS, TICKET);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ attachments: unknown[] }>().attachments).toEqual([
      {
        attachmentId: FIRST_ID,
        filename: 'gst-receipt.pdf',
        mime: 'application/pdf',
        size: 48211,
        sha256: null,
      },
      {
        attachmentId: SECOND_ID,
        filename: 'shelf.png',
        mime: 'image/png',
        size: 48211,
        sha256: null,
      },
      {
        attachmentId: UNSAFE_ID,
        filename: 'badname.pdf',
        mime: 'application/pdf',
        size: 48211,
        sha256: null,
      },
    ]);
  });

  /**
   * 16.48 — a second ticket's rows are ABSENT, proved by set difference in both
   * directions rather than by a containment assertion over one ticket.
   */
  it('never serves another ticket’s rows — set difference, both directions', async () => {
    const first = await list(memberToken, WS, TICKET);
    const sibling = await list(memberToken, WS, SIBLING);
    const idsOf = (res: InjectResponse): string[] =>
      res.json<{ attachments: Array<{ attachmentId: string }> }>().attachments.map((a) => a.attachmentId);

    expect(idsOf(sibling)).toEqual([SIBLING_ID]);
    expect(idsOf(first).filter((id) => id === SIBLING_ID)).toEqual([]);
    expect(idsOf(sibling).filter((id) => id === FIRST_ID)).toEqual([]);
  });

  /**
   * 16.49 — AN EMPTY LIST AND A REFUSAL DO NOT ANSWER ALIKE. This is the
   * property `AttachmentList`'s null-on-empty docblock depends on: the component
   * promises nothing when it has no entries, so the one thing the read must
   * never do is answer `[]` for a ticket nobody may look at. The control runs in
   * the same case, because "the ghost 404s" alone is passed by a door that 404s
   * everything.
   */
  it('answers an empty list for a visible ticket with no attachments — not a refusal', async () => {
    const empty = await list(memberToken, WS, EMPTY_TICKET);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ attachments: [] });

    // The control: the SAME call, for a ticket that does not exist, is a refusal.
    const ghost = await list(memberToken, WS, GHOST);
    expect(ghost.statusCode).toBe(404);
    expect(ghost.json()).toEqual({ error: 'not_found' });
  });

  /**
   * 16.50 — an invisible ticket and a nonexistent one are byte-identical: status,
   * parsed body, RAW body, and the two headers Fastify derives from the body.
   * A status-code assertion twice is not this property — a route that 404s
   * everything passes it.
   */
  it('answers an invisible ticket exactly as it answers a nonexistent one', async () => {
    const visible = await list(memberToken, WS, TICKET);
    expect(visible.statusCode).toBe(200); // positive control for the pair below

    const invisible = await list(guestToken, WS, INVISIBLE);
    const ghost = await list(guestToken, WS, GHOST);

    expect(invisible.statusCode).toBe(404);
    expect(invisible.rawPayload.equals(ghost.rawPayload)).toBe(true);
    expect(invisible.headers['content-type']).toBe(ghost.headers['content-type']);
    expect(invisible.headers['content-length']).toBe(ghost.headers['content-length']);
  });

  /**
   * 16.51 — a real ticket in a DIFFERENT workspace, probed through THIS
   * workspace's path, is refused with the same bytes as the ghost. The member
   * belongs to both workspaces; what makes this ticket invisible HERE is the
   * workspace the path names, which is the guard `loadTicketRow` supplies and
   * `canSee` alone cannot see.
   */
  it('refuses a ticket that belongs to another workspace, with the same bytes', async () => {
    const foreign = await list(memberToken, WS, FOREIGN_TICKET);
    const ghost = await list(memberToken, WS, GHOST);

    expect(foreign.statusCode).toBe(404);
    expect(foreign.rawPayload.equals(ghost.rawPayload)).toBe(true);
    // Positive control, same caller, same workspace: the ticket IS readable at
    // its own workspace's path, so the refusal above is about the path and not
    // about the viewer.
    const atHome = await list(memberToken, OTHER_WS, FOREIGN_TICKET);
    expect(atHome.statusCode).toBe(200);
    expect(
      atHome.json<{ attachments: Array<{ attachmentId: string }> }>().attachments.map(
        (a) => a.attachmentId,
      ),
    ).toEqual([FOREIGN_ATTACHMENT_ID]);
  });

  /**
   * 16.52 — THE SAME PREDICATE, PROVED BY AGREEMENT. The events door on the same
   * ticket is the door this route was told to ride, and the claim is that the
   * two answer one question with one answer. Asserted for both refusing
   * situations, with the positive control that both doors DO answer for a
   * visible ticket — otherwise "they agree" is satisfied by two doors that
   * refuse everything.
   */
  it('agrees with the events door about who may see the ticket', async () => {
    const events = (token: string, ticketId: string) =>
      app.inject({
        method: 'GET',
        url: `/v1/workspaces/${WS}/tickets/${ticketId}/events`,
        headers: { cookie: `better-auth.session_token=${token}` },
      });

    // Positive control: both doors answer for a ticket this caller may see.
    expect((await events(memberToken, TICKET)).statusCode).toBe(200);
    expect((await list(memberToken, WS, TICKET)).statusCode).toBe(200);

    for (const [token, ticketId] of [
      [guestToken, INVISIBLE],
      [memberToken, GHOST],
      [memberToken, FOREIGN_TICKET],
    ] as const) {
      const asked = await list(token, WS, ticketId);
      const beside = await events(token, ticketId);
      expect(asked.statusCode).toBe(beside.statusCode);
      expect(asked.rawPayload.equals(beside.rawPayload)).toBe(true);
    }
  });

  /**
   * 16.53 — the filename this door serves is the one the DOWNLOAD door uses.
   *
   * The stored row here was written by no upload path — a foreign writer's row,
   * which is the same fixture `attachments-download.test.ts` uses to prove its
   * own re-sanitization. Without this, the list would show `bad"name.pdf` while
   * the download names the same object `badname.pdf`: two surfaces of one row
   * disagreeing about what it is called.
   */
  it('serves the sanitized filename, the same name the download door uses', async () => {
    const res = await list(memberToken, WS, TICKET);
    const row = res
      .json<{ attachments: Array<{ attachmentId: string; filename: string }> }>()
      .attachments.find((a) => a.attachmentId === UNSAFE_ID);
    expect(row?.filename).toBe('badname.pdf');
    expect(row?.filename).not.toBe(UNSAFE_FILENAME);
  });
});
