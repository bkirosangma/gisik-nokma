import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * The comment thread — `GET /v1/workspaces/:workspaceId/tickets/:ticketId/comments`.
 *
 * ## The read `comment.added` has never had
 *
 * The event was fully wired (vocabulary, reducer, mention fan-out, sync, a
 * `require-comment` seed rule) and reached no surface. The only place a
 * comment's text landed was `proj_search.comments` — a CONCATENATED TEXT column
 * built for full-text search, with no author, no time and no per-comment
 * identity. It cannot serve a thread and is not press-ganged into one.
 *
 * ## Every fact this file is about goes through the PRODUCT'S OWN DOOR
 *
 * `POST /v1/workspaces` for the workspace (that is what runs the founding
 * sequence and publishes the built-in types), then `POST /v1/events` for the
 * project, the tickets and every comment — each asserted `committed`, so the
 * projection under test is the one the ingest transaction runs.
 *
 * **`seedTicket` was the first attempt here and it was WRONG, in a way worth
 * naming:** it writes `proj_tickets` by hand and leaves `proj_entity_heads`
 * empty, so the `ticket.deleted` this file needs was refused `unknown-ticket` —
 * the engine resolves a ticket through its HEAD row (`engine-context.ts:275-286`),
 * not through `proj_tickets`. A fixture built on the seed helper would have
 * proved the third guard against a ticket the engine does not believe exists.
 *
 * **The two exceptions are labelled where they occur** — the unresolvable
 * attachment id and the cross-ticket one. Both are REFUSED by the
 * `image-embed-gate` at the door (one rule, `attachment.embed-unknown`, covers
 * "nothing anywhere" and "belongs to another ticket", because the two must be
 * indistinguishable to an actor), so the row is written by hand. A read that
 * could not be tested for those shapes would be an untested branch pretending to
 * be unreachable.
 *
 * ## What this file is FOR, said plainly
 *
 * A door returning every comment in the database would pass a "contains these"
 * assertion, so two tickets in ONE workspace are held to a SET DIFFERENCE. And
 * the files half is the shape most likely to be got wrong quietly: a comment's
 * files come from ITS OWN DOCUMENT, never from the ticket's `attachment.added`
 * events — see `read/ticket-comments.ts` for the measurement — so the two file
 * cases pin the two ways that could leak.
 *
 * ## ⚠ NO CASE ID IS MINTED IN THIS FILE, AND THAT IS DELIBERATE
 *
 * The controller ruled on 2026-09-20 (mid-task) that executor 2 has no free
 * ids: its own block `16.41`–`16.60` is fully minted, `16.63`–`16.80` and
 * `16.91`–`16.99` are executor 1's by the block table in
 * `test-cases/16-remaining-doors.md`, and the *"this lane's id block is
 * `16.88`–`16.99`"* line in this lane's handoff and in §16 contradicts that
 * table with no reallocation recorded anywhere. The allocation is with the
 * owner, and the request is filed.
 *
 * **So the ids are OWED, not omitted.** Each case below is written to take one
 * the moment a block is ruled — the case text is already in its own words here —
 * and the catalogue half is HELD, which is why `test-cases/` is untouched by
 * this change set. The PR body names the same thing.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let app: FastifyInstance;
let memberToken = '';
let memberUserId = '';
/** Signed in, and a member of no workspace this file uses — the invisible arm. */
let strangerToken = '';
let strangerUserId = '';

let WS = '';
let PRJ = '';
let OTHER_WS = '';

/** The ticket the thread cases read. */
let TICKET = '';
/** A SECOND ticket in the same workspace — the set-difference control. */
let SIBLING = '';
/** A visible ticket with no comments at all. */
let EMPTY_TICKET = '';
/** A ticket that is soft-deleted, through the door, exactly once. */
let DELETED_TICKET = '';
/** A real ticket in a workspace the member does not belong to. */
let FOREIGN_TICKET = '';
/** An id that names no ticket anywhere. */
const GHOST = newUlid();

/**
 * A `clientTime` far enough in the past that mistaking it for the recorded
 * instant is unmissable. See the fixture's own note.
 */
const OLD_CLIENT_TIME = '2020-01-02T03:04:05.000Z';
/** The envelope's `serverTime` for COMMENT_ONE, as the door reported it. */
let COMMENT_ONE_SERVER_TIME = '';

/** An image ON `TICKET`, embedded by one comment's own document. */
const PROOF_ID = newUlid();
/** An image ON `SIBLING`, named by a comment filed against `TICKET`. */
const CROSS_TICKET_ID = newUlid();
/** An id named by a comment's document that resolves NOWHERE. */
const GHOST_IMAGE_ID = newUlid();

const COMMENT_ONE = newUlid();
const COMMENT_TWO = newUlid();
const COMMENT_WITH_FILE = newUlid();
/** Written straight into the projection — the door refuses this shape. */
const COMMENT_GHOST_FILE = newUlid();
const COMMENT_CROSS_TICKET = newUlid();
const COMMENT_ON_SIBLING = newUlid();
/** On the ticket that is deleted — so the refusal has content to refuse. */
const COMMENT_ON_DELETED = newUlid();

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function docWithImage(text: string, attachmentId: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text },
          { type: 'image', attrs: { attachmentId } },
        ],
      },
    ],
  };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** One claimed event through the product's own door, asserted committed. */
async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
  eventId: string = newUlid(),
  clientTime: string = new Date().toISOString(),
): Promise<{ serverTime: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: eventId,
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime,
        },
      ],
    },
  });
  const results = res.json<{
    results: Array<{ status: string; rule?: string; reason?: string; serverTime?: string }>;
  }>().results;
  expect(
    results[0]?.status,
    `${type} answered ${res.statusCode} ${res.body} — ${results[0]?.rule ?? ''} ${results[0]?.reason ?? ''}`,
  ).toBe('committed');
  const serverTime = results[0]?.serverTime;
  expect(serverTime, `${type} committed with no serverTime`).toBeDefined();
  return { serverTime: serverTime as string };
}

/** One comment through the product's own door, under the id the caller names. */
async function postComment(
  eventId: string,
  workspaceId: string,
  ticketId: string,
  body: unknown,
  token: string,
  actorId: string,
  clientTime?: string,
): Promise<{ serverTime: string }> {
  return post(
    workspaceId,
    { kind: 'ticket', id: ticketId },
    'comment.added',
    { body },
    actorId,
    token,
    eventId,
    clientTime,
  );
}

function list(token: string, workspaceId: string, ticketId: string) {
  return app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}/comments`,
    headers: auth(token),
  });
}

async function attach(id: string, workspaceId: string, ticketId: string, filename: string) {
  await insertAttachment(db.pool, {
    id,
    workspaceId,
    ticketId,
    uploaderId: memberUserId,
    filename,
    mime: 'image/png',
    size: 1024,
    objectKey: `w/${workspaceId}/a/${id}`,
    sha256: 'a'.repeat(64),
  });
}

/**
 * A comment row written STRAIGHT into the projection, under an id the caller
 * names.
 *
 * Used only for the two bodies whose attachment ids do not resolve ON THIS
 * TICKET — `image-embed-gate` refuses both at the door, so the door cannot build
 * the fixture. This is the same device `attachments-download.test.ts` names "a
 * row some other writer put there".
 */
async function writeCommentRow(commentId: string, ticketId: string, body: unknown): Promise<void> {
  await db.pool.query(
    `INSERT INTO proj_ticket_comments
       (comment_id, workspace_id, ticket_id, author_id, body, recorded_at, workspace_seq)
     VALUES ($1, $2, $3, $4, $5, now(), (SELECT COALESCE(MAX(workspace_seq), 0) + 1 FROM proj_ticket_comments))`,
    [commentId, WS, ticketId, memberUserId, JSON.stringify(body)],
  );
}

async function found(workspaceName: string, token: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(token),
    payload: { name: workspaceName },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ workspaceId: string }>().workspaceId;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  const otp = built.otp;
  await app.ready();

  const member = await signInWithPhone(app, otp, '+919000000401');
  memberToken = member.token;
  memberUserId = member.userId;
  const stranger = await signInWithPhone(app, otp, '+919000000402');
  strangerToken = stranger.token;
  strangerUserId = stranger.userId;

  // THE FOUNDING SEQUENCE, through the door that runs it: this is what publishes
  // the workspace's workflows and built-in ticket types, and what writes the
  // entity-head rows the engine resolves a ticket through.
  WS = await found('Comment thread', memberToken);

  PRJ = newUlid();
  await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'Comments' }, memberUserId, memberToken);
  await post(
    WS,
    { kind: 'project', id: PRJ },
    'project.member_added',
    { userId: memberUserId, projectAdmin: true },
    memberUserId,
    memberToken,
  );

  TICKET = newUlid();
  SIBLING = newUlid();
  EMPTY_TICKET = newUlid();
  DELETED_TICKET = newUlid();
  for (const [ticketId, title] of [
    [TICKET, 'The ticket the thread is read from'],
    [SIBLING, 'A second ticket in the same workspace'],
    [EMPTY_TICKET, 'A ticket with no comments'],
    [DELETED_TICKET, 'A ticket that will be deleted'],
  ] as const) {
    await post(
      WS,
      { kind: 'ticket', id: ticketId },
      'ticket.created',
      { typeId: 'task', projectId: PRJ, parentId: null, title },
      memberUserId,
      memberToken,
    );
  }

  // A REAL ticket in a REAL workspace this member is not in — founded by the
  // stranger, so the id is well-formed, the rows exist, and the refusal is about
  // visibility rather than about a missing row.
  OTHER_WS = await found('Another workspace', strangerToken);
  const otherProject = newUlid();
  await post(
    OTHER_WS,
    { kind: 'project', id: otherProject },
    'project.created',
    { name: 'Theirs' },
    strangerUserId,
    strangerToken,
  );
  // The stranger must JOIN their own project — founding the workspace does not
  // put them on a project, and there is no admin shortcut
  // (`permissions/check-permission.ts:129`: *"an admin joins the project first,
  // attributed"*). Without this the next line is refused `permission.role`, and
  // the refusal names the project rather than the missing event.
  await post(
    OTHER_WS,
    { kind: 'project', id: otherProject },
    'project.member_added',
    { userId: strangerUserId, projectAdmin: true },
    strangerUserId,
    strangerToken,
  );
  FOREIGN_TICKET = newUlid();
  await post(
    OTHER_WS,
    { kind: 'ticket', id: FOREIGN_TICKET },
    'ticket.created',
    { typeId: 'task', projectId: otherProject, parentId: null, title: 'Not yours' },
    strangerUserId,
    strangerToken,
  );

  // THE FILES. `PROOF_ID` is on `TICKET`; `CROSS_TICKET_ID` is on `SIBLING` —
  // one ticket away in the same workspace, the id a read without a ticket
  // predicate would happily resolve.
  await attach(PROOF_ID, WS, TICKET, 'gst-receipt.png');
  await attach(CROSS_TICKET_ID, WS, SIBLING, 'other-tickets-file.png');

  // Three comments on TICKET, in this order, then one on the sibling.
  //
  // ⚠ COMMENT_ONE IS CLAIMED WITH A DELIBERATELY WRONG CLOCK. The envelope
  // carries two (`clientTime` is the actor's claim, `serverTime` is assigned at
  // ingest) and the projection stores the SECOND; a fixture that sent `now`
  // would make the two indistinguishable, and the read's choice untestable.
  const claimedAt = await postComment(
    COMMENT_ONE,
    WS,
    TICKET,
    doc('The shared bucket is the availability defect.'),
    memberToken,
    memberUserId,
    OLD_CLIENT_TIME,
  );
  COMMENT_ONE_SERVER_TIME = claimedAt.serverTime;
  await postComment(COMMENT_WITH_FILE, WS, TICKET, docWithImage('Evidence attached.', PROOF_ID), memberToken, memberUserId);
  await postComment(COMMENT_TWO, WS, TICKET, doc('Confirmed — it is the proxy header.'), memberToken, memberUserId);
  await postComment(COMMENT_ON_SIBLING, WS, SIBLING, doc('A comment on the other ticket.'), memberToken, memberUserId);

  await writeCommentRow(COMMENT_GHOST_FILE, TICKET, docWithImage('Names a file that is gone.', GHOST_IMAGE_ID));
  await writeCommentRow(COMMENT_CROSS_TICKET, TICKET, docWithImage('Names a neighbour.', CROSS_TICKET_ID));

  // A thread on the ticket that will be deleted, so the third guard has content
  // to refuse. ⚠ **THE DELETE ITSELF IS NOT HERE** — it happens inside its own
  // case, because a control that runs after its fixture is not a control: the
  // first version of this file deleted in `beforeAll` and then asserted the
  // 200 "before" arm, which could only ever have been the 404 it was meant to
  // rule out. MEASURED: it failed `expected 404 to be 200`.
  await postComment(
    COMMENT_ON_DELETED,
    WS,
    DELETED_TICKET,
    doc('This thread exists until the ticket is deleted.'),
    memberToken,
    memberUserId,
  );
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

type WireComment = {
  commentId: string;
  authorId: string;
  body: unknown;
  recordedAt: string;
  files: Array<{ attachmentId: string; filename: string; mime: string | null }>;
};

function commentsOf(res: InjectResponse): WireComment[] {
  return res.json<{ comments: WireComment[] }>().comments;
}

describe('GET /v1/workspaces/:workspaceId/tickets/:ticketId/comments', () => {
  /**
   * The door serves this ticket's comments, OLDEST FIRST, in the shape the
   * client's view type asks for; an unauthenticated caller is refused before any
   * of it; a comment's body travels unaltered.
   */
  it('serves the thread in workspace_seq order, and refuses an unauthenticated caller', async () => {
    const anon = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/${TICKET}/comments`,
    });
    expect(anon.statusCode).toBe(401);

    const res = await list(memberToken, WS, TICKET);
    expect(res.statusCode).toBe(200);
    const comments = commentsOf(res);

    // Order is asserted by ID SEQUENCE, not by a length: a read that returned
    // the right rows in `recorded_at` order would satisfy a containment check.
    expect(comments.map((c) => c.commentId)).toEqual([
      COMMENT_ONE,
      COMMENT_WITH_FILE,
      COMMENT_TWO,
      COMMENT_GHOST_FILE,
      COMMENT_CROSS_TICKET,
    ]);
    expect(comments[0]?.body).toEqual(doc('The shared bucket is the availability defect.'));
    expect(comments[0]?.authorId).toBe(memberUserId);
    // ⚠ THE STORED INSTANT IS THE ENVELOPE'S `serverTime`, NOT THE ACTOR'S
    // `clientTime` — pinned against the value the door itself reported for that
    // event, so the two claims are distinguishable and the wrong one is named.
    // A `Date.parse(...)` smoke test would pass whichever clock was stored.
    expect(comments[0]?.recordedAt).toBe(COMMENT_ONE_SERVER_TIME);
    expect(comments[0]?.recordedAt).not.toBe(OLD_CLIENT_TIME);
  });

  /**
   * Another ticket's comments are ABSENT, proved by a set difference in both
   * directions rather than by a containment assertion over one ticket. This is
   * the shape that catches a dropped `ticket_id` predicate.
   */
  it('never serves another ticket’s comments — set difference, both directions', async () => {
    const idsOf = async (ticketId: string) =>
      commentsOf(await list(memberToken, WS, ticketId)).map((c) => c.commentId);

    const here = await idsOf(TICKET);
    const there = await idsOf(SIBLING);

    expect(there).toEqual([COMMENT_ON_SIBLING]);
    expect(here.filter((id) => id === COMMENT_ON_SIBLING)).toEqual([]);
    expect(there.filter((id) => id === COMMENT_ONE)).toEqual([]);

    // The empty case is an ANSWER — a ticket with no comments says so with an
    // empty list — asserted beside the positive control, so an empty response
    // cannot be read as the whole read having failed.
    const empty = await list(memberToken, WS, EMPTY_TICKET);
    expect(empty.statusCode).toBe(200);
    expect(commentsOf(empty)).toEqual([]);
  });

  /**
   * A comment's files are the attachments ITS OWN DOCUMENT embeds, in document
   * order, resolved to the stored name; and an id that resolves nowhere renders
   * ID-ONLY rather than being dropped.
   *
   * The second half is the one that matters: dropping it would render a comment
   * as carrying one file fewer than its document says — the drawn-absence
   * failure, a comment rendered as though it had no files.
   */
  it('joins files on the comment’s own document, and renders an unresolvable id as itself', async () => {
    const comments = commentsOf(await list(memberToken, WS, TICKET));
    const byId = new Map(comments.map((c) => [c.commentId, c]));

    expect(byId.get(COMMENT_WITH_FILE)?.files).toEqual([
      { attachmentId: PROOF_ID, filename: 'gst-receipt.png', mime: 'image/png' },
    ]);
    // The control for the fallback below: a real name IS resolved, so the
    // id-only case is about an unresolvable id and not about a broken lookup.
    expect(byId.get(COMMENT_ONE)?.files).toEqual([]);
    expect(byId.get(COMMENT_GHOST_FILE)?.files).toEqual([
      { attachmentId: GHOST_IMAGE_ID, filename: GHOST_IMAGE_ID, mime: null },
    ]);
  });

  /**
   * The file lookup is TICKET-SCOPED: a document naming an attachment that lives
   * on another ticket does not receive that attachment's name.
   *
   * The gate refuses this at the door with ONE rule for "nothing anywhere" and
   * "belongs to another ticket", precisely so an actor cannot use the door as an
   * existence oracle. The READ has to keep the same property for the same
   * reason, and this case measures it rather than assuming it — the row was
   * written by hand BECAUSE the door refuses it.
   */
  it('does not resolve an attachment that belongs to a different ticket', async () => {
    const found = commentsOf(await list(memberToken, WS, TICKET)).find(
      (c) => c.commentId === COMMENT_CROSS_TICKET,
    );
    expect(found?.files).toEqual([
      { attachmentId: CROSS_TICKET_ID, filename: CROSS_TICKET_ID, mime: null },
    ]);
    // The control: the SAME id, on its own ticket, resolves to its own name —
    // so the assertion above is about the scope and not about a broken lookup.
    const row = await db.pool.query<{ filename: string }>(
      'SELECT filename FROM attachments WHERE ticket_id = $1 AND id = $2',
      [SIBLING, CROSS_TICKET_ID],
    );
    expect(row.rows.map((r) => r.filename)).toEqual(['other-tickets-file.png']);
  });

  /**
   * THE THIRD GUARD. A soft-deleted ticket's comments are 404 — the same answer
   * an invisible ticket gets — with a live control taken through the same door
   * before the delete.
   */
  it('refuses a soft-deleted ticket’s comments, with a live control', async () => {
    // THE CONTROL FIRST, and the delete is inside this case for that reason: a
    // control that runs after its fixture is not a control. This is the same
    // door, the same ticket and the same caller as the refusal below, moments
    // apart, so a door that simply 404'd this ticket cannot satisfy both arms.
    const before = await list(memberToken, WS, DELETED_TICKET);
    expect(before.statusCode).toBe(200);
    // ...and the control is not an empty world: the thread really is there.
    expect(commentsOf(before).map((c) => c.commentId)).toEqual([COMMENT_ON_DELETED]);

    // THE DELETE, through the product's own door, exactly once, asserted.
    await post(WS, { kind: 'ticket', id: DELETED_TICKET }, 'ticket.deleted', {}, memberUserId, memberToken);

    // The ticket's own detail route carries the same rule by the same
    // mechanism, so it is read BESIDE this door rather than trusted: if the two
    // ever disagreed, one of them would be wrong and this is where it shows.
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/${DELETED_TICKET}`,
      headers: auth(memberToken),
    });
    expect(detail.statusCode).toBe(404);

    const after = await list(memberToken, WS, DELETED_TICKET);
    expect(after.statusCode).toBe(404);
    expect(after.json()).toEqual({ error: 'not_found' });
  });

  /**
   * The three refusals are ONE answer: a ticket the caller may not see, a ticket
   * that does not exist, and a ticket in a workspace the path does not name all
   * answer the same status and the same bytes, so the door is not an existence
   * oracle.
   */
  it('answers an invisible, a nonexistent and a foreign ticket identically', async () => {
    const cases: Array<[string, string, string]> = [
      // A signed-in user who is a member of no workspace this file uses.
      [strangerToken, WS, TICKET],
      // A well-formed id that names no ticket anywhere.
      [memberToken, WS, GHOST],
      // A REAL ticket, in a REAL workspace, asked for through this one's path.
      [memberToken, WS, FOREIGN_TICKET],
      // ...and the same ticket through its own workspace's path, where the
      // member is not a member at all.
      [memberToken, OTHER_WS, FOREIGN_TICKET],
    ];

    const bodies: string[] = [];
    for (const [token, workspaceId, ticketId] of cases) {
      const res = await list(token, workspaceId, ticketId);
      expect(res.statusCode, `${ticketId} answered ${res.body}`).toBe(404);
      bodies.push(res.body);
    }
    // One distinct body across all four, which is what "indistinguishable"
    // means — a status comparison alone would pass on four different reasons.
    expect(new Set(bodies).size).toBe(1);
  });
});
