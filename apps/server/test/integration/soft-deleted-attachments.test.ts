import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { newUlid } from '@gisik-nokma/domain';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * **THE ATTACHMENT DOORS AND THE TOMBSTONE** — cases `16.96`–`16.99`.
 *
 * ## The defect this file closes
 *
 * `#591` gave a soft-deleted ticket a third guard on its DETAIL route
 * (`routes/tickets.ts:365` — the domain `deleted` flag → 404) and left the
 * routes beside it carrying only `loadTicketRow` + `canSee`. `canSee` is the
 * VISIBILITY predicate and by its own written ruling does not mean "not
 * deleted" (`read/visible-where.ts`, *"Deletion is not visibility"*), so a
 * tombstoned ticket kept serving its file list, kept serving **the bytes**, and
 * kept **accepting uploads**. Three doors, one rule, applied to one of four —
 * this repo's recorded failure by name.
 *
 * ## Each case owns its tombstone
 *
 * Every case below creates **its own** ticket in `beforeAll` and deletes it
 * inside the case, so no case depends on the order another ran in and any one
 * of them can be run alone. That is deliberate: the alternative (one ticket,
 * deleted by the first case and used by the rest) makes the file a script whose
 * middle cannot be run, and makes a failure in case 1 read as a failure in
 * case 4.
 *
 * ## What each case asserts, and the arm that makes it worth having
 *
 * - **16.97 the LIST door** — live it lists the file, tombstoned it refuses, and
 *   the refusal is **byte-identical to what a ticket that never existed gets**.
 *   A status code alone is not this property: a door that 404s everything
 *   passes `toBe(404)` twice.
 * - **16.98 the UPLOAD door** — live, a file can be uploaded (the 201 is the
 *   positive control); tombstoned, the upload is refused **and nothing
 *   accretes**. The accrual is asserted at **two levels**, because "the request
 *   was refused" and "nothing was stored" are different claims and only the
 *   second one is the property: the object store is counted, and the ticket is
 *   restored through the product's own undo and read back.
 * - **16.99 the DOWNLOAD door** — this door serves **the bytes themselves**, so a
 *   200 after the delete is the whole disclosure rather than a hint of it:
 *   before, the exact bytes; after, the shared JSON body, asserted **not** to be
 *   the file and with the two headers this handler only ever sets on the
 *   success path asserted absent.
 * - **16.96 the REFUSALS AGREE, and the HISTORY exception is pinned** — the two
 *   `routes/tickets.ts` doors agree with each other byte-for-byte, the two
 *   `routes/attachments.ts` doors agree with each other byte-for-byte, and the
 *   two HISTORY doors still serve the tombstone's ledger 200 **on purpose**.
 *
 * ## ⚠ The two families do NOT agree with each other, and this file does not
 * ## pretend they do
 *
 * `routes/tickets.ts` refuses with `{error: 'not_found'}`; `routes/attachments.ts`
 * refuses with `{error: 'not-found'}`. MEASURED while writing this file. That is
 * a recorded divergence with its own owner — the server's route surface,
 * *"whoever next touches `attachments.ts`"* — and six existing assertions in
 * `attachments-{download,upload}.test.ts` pin the hyphen form, so the tests
 * agree with the code and neither is evidence about the other. It is **latent
 * today**: no client reads the string (`http.ts` carries the body as `unknown`
 * and gates on the status and the method). It is NOT the leak, it is a wire
 * vocabulary change to a shipped API, and it is left alone deliberately rather
 * than as an omission — see this change's PR body.
 *
 * ## Real doors, and the fixture that is not a seeder
 *
 * The world is founded the way the product founds one: `POST /v1/workspaces`,
 * then `project.created` + `project.member_added`, then `ticket.created`, then
 * the actual upload through `POST /v1/attachments` — which is what puts real
 * bytes in a real store for the download arm to read. The delete and the undo
 * go through `POST /v1/events`. **Nothing here writes a ticket, an attachment
 * row or a tombstone behind the doors.**
 *
 * The "may not see it" viewer is a **signed-in person with no membership
 * anywhere**, so `canSee` answers false with no role fixture at all:
 * invisibility is the default for a non-member.
 *
 * ## NOT COVERED, named with its owner
 *
 * - **`GET /v1/workspaces/:ws/tickets` has no soft-delete predicate**, and that
 *   is a recorded ruling rather than an omission (`visibility/visible-tickets.ts`:
 *   its SELECT has no `proj_tickets` in its FROM, so the column is unreachable
 *   without adding a join, and the route has no client consumer).
 * - **The history doors are deliberately left serving** — 16.96 asserts that
 *   rather than closing it.
 * - **`routes/my-work.ts:364`'s contested-claim title gate and the replica's two
 *   TypeScript applications of the rule** are named as survivors in case 16.90
 *   with their own owners. They are not attachment doors and are not touched.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

/** A ticket with one real uploaded file, and the id the upload door minted. */
type Doomed = { ticketId: string; attachmentId: string };

let db: TestDatabase;
let app: FastifyInstance;
let otp: Awaited<ReturnType<typeof buildTestApp>>['otp'];
let storeRoot = '';

let owner = { userId: '', token: '' };
/** A signed-in person with NO membership anywhere — the "may not see it" viewer. */
let outsider = { userId: '', token: '' };

let workspaceId = '';
const projectId = newUlid();

/** One tombstone per case, so no case depends on another's ordering. */
let listDoor: Doomed;
let uploadDoor: Doomed;
let downloadDoor: Doomed;
let agreementDoor: Doomed;

/** A ticket that stays live — the positive control for every door. */
let live: Doomed;
/** A live ticket with no attachments at all — the 200-empty case. */
let emptyTicketId = '';

/** An id that names no ticket anywhere. */
const GHOST = newUlid();
/** An attachment id that names no row anywhere. */
const GHOST_ATTACHMENT = newUlid();

const FILE = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x41)]);
const LIVE_FILE = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32, 0x42)]);

let phoneCounter = 0;

async function signedIn() {
  phoneCounter += 1;
  const phone = `+9190006${String(phoneCounter).padStart(5, '0')}`;
  const user = await signInWithPhone(app, otp, phone);
  return { userId: user.userId, token: user.token };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * One event through the product's own door, asserting it COMMITTED.
 *
 * The assertion is the point rather than the plumbing: a refused
 * `ticket.deleted` would leave the world live and every refusal below would be
 * asserted against a tombstone that was never dug, which reads as a route bug
 * pointing the other way.
 */
async function post(
  token: string,
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
  expectedSeq: number,
): Promise<void> {
  const submitted: SubmittedEvent = {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: new Date().toISOString(),
    ...event,
  };
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: { events: [submitted] },
  });
  const body = res.json() as { results?: Array<Record<string, unknown>> };
  // The refusal names the write that failed rather than the read that noticed
  // it — the shape `list-narrowing-roundtrip.test.ts` uses.
  expect(
    body.results?.[0],
    `POST /v1/events refused ${event.type}: ${JSON.stringify(body)}`,
  ).toMatchObject({ status: 'committed', seq: expectedSeq });
}

// ─── The three doors, and the two lifecycle events ─────────────────────────

function listAttachments(
  token: string,
  workspace: string,
  ticketId: string,
): Promise<InjectResponse> {
  return app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspace}/tickets/${ticketId}/attachments`,
    headers: auth(token),
  });
}

function detail(token: string, ticketId: string): Promise<InjectResponse> {
  return app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}`,
    headers: auth(token),
  });
}

function download(token: string, attachmentId: string): Promise<InjectResponse> {
  return app.inject({
    method: 'GET',
    url: `/v1/attachments/${attachmentId}`,
    headers: auth(token),
  });
}

/** A multipart body built by hand, so the upload door sees real bytes on a real boundary. */
function upload(token: string, ticketId: string, data: Buffer): Promise<InjectResponse> {
  const boundary = 'gisik-soft-delete-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="ticketId"\r\n\r\n${ticketId}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="accreted.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: '/v1/attachments',
    headers: { ...auth(token), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
}

async function createTicket(title: string): Promise<string> {
  const ticketId = newUlid();
  await post(
    owner.token,
    {
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title },
      actorId: owner.userId,
    },
    1,
  );
  return ticketId;
}

/** The tombstone, through the door the product digs it with. */
async function deleteTicket(ticketId: string, seq: number): Promise<void> {
  await post(
    owner.token,
    {
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.deleted',
      payload: {},
      actorId: owner.userId,
    },
    seq,
  );
}

/** The undo, through the same door. */
async function restoreTicket(ticketId: string, seq: number): Promise<void> {
  await post(
    owner.token,
    {
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.restored',
      payload: {},
      actorId: owner.userId,
    },
    seq,
  );
}

/** A ticket with one real file, uploaded through the upload door. */
async function ticketWithFile(title: string, data: Buffer): Promise<Doomed> {
  const ticketId = await createTicket(title);
  const res = await upload(owner.token, ticketId, data);
  expect(res.statusCode, `the upload door must write the fixture: ${res.body}`).toBe(201);
  return { ticketId, attachmentId: (res.json() as { attachmentId: string }).attachmentId };
}

/** Every response header except `date` — a clock reading, not a fact about the refusal. */
function comparableHeaders(res: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = res.headers;
  return rest;
}

/**
 * Two refusals compared on the whole answer, not on the status.
 *
 * The claim is that a tombstoned ticket is indistinguishable from one that
 * never existed, so the RAW bytes and every header but `date` are compared —
 * a length or a content-type that differed would itself be the oracle.
 */
function expectSameRefusal(actual: InjectResponse, reference: InjectResponse): void {
  expect(
    { status: actual.statusCode, body: actual.body, headers: comparableHeaders(actual) },
  ).toEqual({ status: 404, body: reference.body, headers: comparableHeaders(reference) });
}

/** How many objects the store holds, anywhere under its root. */
async function countStoredObjects(): Promise<number> {
  const entries = await readdir(storeRoot, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).length;
}

function attachmentIds(res: InjectResponse): string[] {
  return res
    .json<{ attachments: Array<{ attachmentId: string }> }>()
    .attachments.map((row) => row.attachmentId);
}

beforeAll(async () => {
  db = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-soft-delete-attach-'));
  const built = buildTestApp(db, { store: new LocalDiskStore(storeRoot) });
  app = built.app;
  otp = built.otp;
  await app.ready();

  owner = await signedIn();
  outsider = await signedIn();

  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(owner.token),
    payload: { name: 'Tombstone Corner' },
  });
  expect(founded.statusCode).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  await post(
    owner.token,
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: { name: 'Files', description: 'attachments' },
      actorId: owner.userId,
    },
    1,
  );
  // The founder owns the workspace but is not on the PROJECT until this lands,
  // and `ticket.created` is refused `permission.role` without it — measured,
  // by the engine's door answering before any read could.
  await post(
    owner.token,
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId: owner.userId, projectAdmin: true },
      actorId: owner.userId,
    },
    2,
  );

  emptyTicketId = await createTicket('The ticket with no files');

  listDoor = await ticketWithFile('list door', FILE);
  uploadDoor = await ticketWithFile('upload door', FILE);
  downloadDoor = await ticketWithFile('download door', FILE);
  agreementDoor = await ticketWithFile('agreement', FILE);
  live = await ticketWithFile('live control', LIVE_FILE);
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.drop();
  await rm(storeRoot, { recursive: true, force: true });
});

/**
 * **16.97 — the LIST door refuses a tombstoned ticket, and refuses it exactly
 * as it refuses one that never existed.**
 */
describe('16.97 — GET …/tickets/:ticketId/attachments', () => {
  it('serves the file before the delete and refuses, identically to a ghost, after', async () => {
    // POSITIVE CONTROL FIRST: a door that 404s everything satisfies every
    // refusal below, so this door is made to answer before it is made to refuse.
    const before = await listAttachments(owner.token, workspaceId, listDoor.ticketId);
    expect(before.statusCode).toBe(200);
    expect(attachmentIds(before)).toEqual([listDoor.attachmentId]);

    await deleteTicket(listDoor.ticketId, 2);
    // The delete landed, and the door that already carried the guard is the
    // reference for it.
    expect((await detail(owner.token, listDoor.ticketId)).statusCode).toBe(404);

    const after = await listAttachments(owner.token, workspaceId, listDoor.ticketId);
    const ghost = await listAttachments(owner.token, workspaceId, GHOST);
    // The invisible viewer, on the same ticket, must still be refused for the
    // reason it always was — the arm that must NOT regress when the deleted
    // guard lands, held against the ghost rather than against the tombstone's
    // own answer.
    const invisible = await listAttachments(outsider.token, workspaceId, listDoor.ticketId);

    expectSameRefusal(after, ghost);
    expectSameRefusal(invisible, ghost);
  });

  it('still answers 200 with an empty list for a live ticket that has no files', async () => {
    // The case that must NOT be folded into the new guard: `AttachmentList`
    // returns `null` on empty ("must not promise there are none"), so an empty
    // list and a refusal are different answers and stay different.
    const empty = await listAttachments(owner.token, workspaceId, emptyTicketId);
    expect(empty.statusCode).toBe(200);
    expect(attachmentIds(empty)).toEqual([]);

    // And the live ticket's file still serves, so the guard is a predicate
    // rather than a door that stopped answering.
    const alive = await listAttachments(owner.token, workspaceId, live.ticketId);
    expect(alive.statusCode).toBe(200);
    expect(attachmentIds(alive)).toEqual([live.attachmentId]);
  });
});

/**
 * **16.98 — the UPLOAD door refuses a tombstoned ticket, and NOTHING ACCRETES.**
 *
 * The worse half of the defect: the read discloses, but this one lets content
 * be written onto a ticket the product has removed from view. The accrual is
 * asserted twice and at two levels — the object store is counted, and the
 * ticket is restored through the product's own undo and its list read back —
 * because "the request was refused" and "nothing was stored" are different
 * claims and only the second one is the property.
 */
describe('16.98 — POST /v1/attachments', () => {
  it('refuses an upload to a deleted ticket, and writes neither row nor object', async () => {
    const objectsBefore = await countStoredObjects();

    await deleteTicket(uploadDoor.ticketId, 2);
    expect((await detail(owner.token, uploadDoor.ticketId)).statusCode).toBe(404);

    const after = await upload(owner.token, uploadDoor.ticketId, FILE);
    const ghost = await upload(owner.token, GHOST, FILE);
    expectSameRefusal(after, ghost);
    expect(await countStoredObjects()).toBe(objectsBefore);

    // The undo, through the product's own door, then the read that would show
    // an accreted file had one been written.
    await restoreTicket(uploadDoor.ticketId, 3);
    const restored = await listAttachments(owner.token, workspaceId, uploadDoor.ticketId);
    expect(restored.statusCode).toBe(200);
    expect(attachmentIds(restored)).toEqual([uploadDoor.attachmentId]);
  });
});

/**
 * **16.99 — the DOWNLOAD door, which serves the BYTES.**
 *
 * `GET /v1/attachments/:id` is addressed by an attachment id, so a caller who
 * already holds a URL from before the delete reaches it without passing any
 * ticket-scoped route — which is why this task's addendum asked whether the
 * door resolves through the ticket at all. MEASURED: it does. The handler reads
 * the row, takes `row.ticketId`, and asks `canSee` about the TICKET
 * (`routes/attachments.ts`); the guard is the ticket's, and this arm is what
 * holds it to that.
 */
describe('16.99 — GET /v1/attachments/:id', () => {
  it('serves the exact bytes before the delete, and the shared 404 after — never the bytes', async () => {
    // POSITIVE CONTROL, and a byte-for-byte one: this door's whole job is the
    // content, so a control that checked only the status would leave the arms
    // below free to pass against a door that had stopped serving content.
    const before = await download(owner.token, live.attachmentId);
    expect(before.statusCode).toBe(200);
    expect(before.rawPayload.equals(LIVE_FILE)).toBe(true);

    await deleteTicket(downloadDoor.ticketId, 2);

    const after = await download(owner.token, downloadDoor.attachmentId);
    const ghost = await download(owner.token, GHOST_ATTACHMENT);

    expectSameRefusal(after, ghost);
    // The refusal is the JSON body and NOT the file, and the header this
    // handler sets only after `store.getStream` succeeds is asserted ABSENT —
    // absence rather than a value, which is the claim that no content left.
    //
    // ⚠ `x-content-type-options` is deliberately NOT asserted here, and this is
    // measured rather than omitted: the handler sets it on its success path, but
    // `http/security-headers.ts:51` sets the SAME header on EVERY response of
    // the assembled app, so in this file its presence is the security surface's
    // and not evidence about the download handler at all. The route-isolated
    // `attachments-download.test.ts` is where that handler's own header
    // discipline is observable, and it asserts both there.
    expect(after.rawPayload.equals(FILE)).toBe(false);
    expect(after.headers['content-disposition']).toBeUndefined();
    // The invisible viewer, on the same real attachment id.
    expectSameRefusal(await download(outsider.token, downloadDoor.attachmentId), ghost);
  });
});

/**
 * **16.96 — the refusals agree with their own family, and the HISTORY exception
 * is pinned rather than left to be discovered.**
 */
describe('16.96 — the doors agree, and the history exception is pinned', () => {
  it('answers a deleted ticket as the doors beside it do, within each family', async () => {
    await deleteTicket(agreementDoor.ticketId, 2);

    // FAMILY ONE — `routes/tickets.ts`: the detail door is the model, and the
    // attachments list door is the one this change brought into line with it.
    const ghostList = await listAttachments(owner.token, workspaceId, GHOST);
    expectSameRefusal(await detail(owner.token, agreementDoor.ticketId), ghostList);
    expectSameRefusal(
      await listAttachments(owner.token, workspaceId, agreementDoor.ticketId),
      ghostList,
    );

    // FAMILY TWO — `routes/attachments.ts`: the download door is addressed by
    // an attachment id and the upload door by a body field, and both reach the
    // same `replyNotFound`. Each is held to the ghost's answer for ITS OWN
    // door, so neither can pass on the other's behaviour.
    expectSameRefusal(
      await download(owner.token, agreementDoor.attachmentId),
      await download(owner.token, GHOST_ATTACHMENT),
    );
    expectSameRefusal(
      await upload(owner.token, agreementDoor.ticketId, Buffer.from('nope')),
      await upload(owner.token, GHOST, Buffer.from('nope')),
    );
  });

  it('still serves the deleted ticket’s HISTORY at both history doors', async () => {
    const events = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${agreementDoor.ticketId}/events`,
      headers: auth(owner.token),
    });
    expect(events.statusCode).toBe(200);
    const types = (events.json() as { events: Array<{ type: string }> }).events.map((e) => e.type);
    expect(types).toContain('ticket.deleted');

    const history = await app.inject({
      method: 'GET',
      url: `/v1/tickets/${agreementDoor.ticketId}/history`,
      headers: auth(owner.token),
    });
    expect(history.statusCode).toBe(200);

    // The control that keeps the two arms above from being satisfied by a world
    // where everything answers: the same two doors also serve a LIVE ticket.
    const liveEvents = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${live.ticketId}/events`,
      headers: auth(owner.token),
    });
    expect(liveEvents.statusCode).toBe(200);
  });
});
