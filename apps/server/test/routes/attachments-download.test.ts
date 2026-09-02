import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { registerAttachmentRoutes } from '../../src/routes/attachments.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedTicket } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 7 Task 10 — `GET /v1/attachments/:id`.
 *
 * ## Two departures from the plan text's fixture, both forced
 *
 * 1. **`stubAuth()` is not used.** The plan hand-rolled `{ api: { getSession:
 *    async (...) => ... } } as unknown as Auth`, exactly the fixture Task 9's
 *    test (`attachments-upload.test.ts`) already rejected in its own docblock
 *    as "shaped like the thing it replaces". This file mounts the same real
 *    `createAuth` instance Task 9 uses and signs both callers in over the wire
 *    with `signInWithPhone`, so `requireSession` is exercised against a session
 *    better-auth actually issued, not a string prefix a stub happened to check.
 *
 * 2. **The plan's literal ids do not survive `ULID_REGEX`.** `01J9GUSM…`,
 *    `01J9GUSG…` and `01J9GNON…` each contain a letter Crockford Base32
 *    excludes — `U` in the first two, `O` in the third — and
 *    `ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/` (`packages/domain/src/ids.ts`)
 *    rejects all three. MEASURED, not assumed: running the plan's literals
 *    verbatim throws `ZodError: must be a ULID` out of
 *    `membershipGrantedPayload.parse` inside `seedMember`, before the route
 *    under test is ever reached. Every id here is `newUlid()` instead — the
 *    same fix `attachments-upload.test.ts` already applies for the same
 *    reason.
 *
 * ## The three-case shape, mirrored from `tickets-read.test.ts`
 *
 * `comparableHeaders` drops only `date` and keeps `content-type`,
 * `content-length` and `content-disposition` — a length that differed would
 * itself be the oracle even if both bodies parsed to the same object. The
 * positive control (a visible id, 200) runs first, so a route that 404s
 * everything cannot pass this file. Case (a) invisible-ticket and case (b)
 * nonexistent-id are asserted byte-identical below.
 *
 * ## Case (c): bytes missing from the store is NOT a visibility refusal, and
 * is folded into the same 404 anyway — deliberately
 *
 * `attachments.ts`'s handler treats `ObjectNotFoundError` from
 * `store.getStream` as an internal inconsistency (a row whose bytes are gone),
 * logs it loudly server-side, and answers the caller with the same
 * `replyNotFound`. The decision: a caller who CAN see the ticket and asks for
 * a real attachment id learns nothing more than "not found" even when the
 * reason is "we lost the bytes" rather than "you may not look" — a 500, or a
 * distinct 404 body, would tell a member their own attachment exists but is
 * broken, which is one bit more than an outside caller should be able to
 * distinguish from ordinary absence, and is meaningless to the guest case this
 * file also proves. The `request.log.error` call is where the operational
 * signal actually goes. Proven below against `insertAttachment` with no
 * matching `store.put`.
 *
 * ## `comparableHeaders` is now the ELEVENTH local definition
 *
 * SWEPT, not recalled, from the repo root — `grep -rl 'function
 * comparableHeaders' .` excluding `node_modules`, `dist`, `.next`,
 * `reference` and `.git` — finds ten prior copies, none outside
 * `apps`/`packages`: `tickets-read.test.ts:92`, `my-work.test.ts:415`,
 * `preferences.test.ts:169`, `board.test.ts:152`, `builder-reads.test.ts:113`,
 * `search.test.ts:353`, `ticket-history.test.ts:130`, `attention.test.ts:571`,
 * `list.test.ts:307` and `attachments-upload.test.ts:175` (Task 9, same
 * step) — all byte-identical two-line bodies; this file's is the eleventh.
 * RECORDED, not hoisted here: a shared `test/helpers/http-compare.ts` is a
 * one-file change with no functional stakes, and duplicating a two-line pure
 * function eleven times is a readability cost, not a correctness one. An
 * earlier version of this note put the count at five and set the escalation
 * trigger at "past five" — the count was wrong even then (it undercounted
 * the priors that already existed), and either way the trigger has silently
 * not fired for six copies past where it should have. Owner: whichever task
 * next touches one of these eleven files for an unrelated reason, or a
 * dedicated cleanup task — no further count-based trigger is set here, since
 * the last one demonstrated that a number embedded in prose does not get
 * re-checked as the count grows.
 */

const WS = newUlid();
const PRJ = newUlid();

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF_BYTES = Buffer.from('%PDF-1.7 body');
const UNSAFE_BYTES = Buffer.from('%PDF-1.7 unsafe-name body');

/**
 * A filename `sanitizeFilename` (`attachments/filename.ts`) actually
 * changes: the `"` is in `UNSAFE_FILENAME_CHARS` and is stripped, leaving
 * `badname.pdf`. This is deliberately NOT the fixture the two
 * positive-download tests use (`shelf.png`, `gst-receipt.pdf` are both
 * already sanitary, so a route that skipped sanitization entirely would
 * still pass those). This one exists to prove the GET handler actually calls
 * `sanitizeFilename(row.filename)` — the composition, not the function,
 * which `test/attachments/filename.test.ts` already unit-tests directly —
 * for a row some other writer put there, not one this route's own POST path
 * sanitized on the way in.
 *
 * Quote-only, deliberately, not CR/LF: `sanitizeFilename` also strips CR/LF
 * (header-injection prevention), but MEASURED — planting `bad"name\r\n.pdf`
 * here and mutating the call site to `row.filename` — Node's http layer
 * rejects the raw CR/LF in the header value with `ERR_INVALID_CHAR` before
 * the response is ever sent, so the mutation reddens at `res.statusCode`
 * (`500`, not `200`) rather than at the `content-disposition` equality
 * below. That proves "an unsanitized CRLF filename crashes the route," a
 * real property but not this test's, and would leave the composition claim
 * — that the returned header VALUE is the sanitized string — with the same
 * unexecuted-assertion gap this fixture exists to close. A quote-only name
 * transmits fine either way, so the mutation is caught by the header-value
 * assertion itself.
 */
const UNSAFE_FILENAME = 'bad"name.pdf';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let app: FastifyInstance;
let storeRoot = '';
let memberToken = '';
let guestToken = '';
let TICKET = '';
let IMG_ID = '';
let PDF_ID = '';
let UNSAFE_ID = '';
let ORPHAN_ID = '';

beforeAll(async () => {
  db = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-download-'));
  const store = new LocalDiskStore(storeRoot);

  const otp = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
  });

  app = Fastify();
  registerAuthRoutes(app, auth);
  await registerAttachmentRoutes(app, { pool: db.pool, store, auth });
  await app.ready();

  const member = await signInWithPhone(app, otp, '+919000000201');
  const guest = await signInWithPhone(app, otp, '+919000000202');
  memberToken = member.token;
  guestToken = guest.token;

  await seedMember(db.pool, WS, member.userId, 'member', [{ projectId: PRJ }]);
  await seedGuest(db.pool, WS, guest.userId);

  TICKET = newUlid();
  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId: TICKET });

  IMG_ID = newUlid();
  await store.put(`w/${WS}/a/${IMG_ID}`, Readable.from(PNG_BYTES), {
    mime: 'image/png',
    size: PNG_BYTES.length,
  });
  await insertAttachment(db.pool, {
    id: IMG_ID,
    workspaceId: WS,
    ticketId: TICKET,
    uploaderId: member.userId,
    filename: 'shelf.png',
    mime: 'image/png',
    size: PNG_BYTES.length,
    objectKey: `w/${WS}/a/${IMG_ID}`,
  });

  PDF_ID = newUlid();
  await store.put(`w/${WS}/a/${PDF_ID}`, Readable.from(PDF_BYTES), {
    mime: 'application/pdf',
    size: PDF_BYTES.length,
  });
  await insertAttachment(db.pool, {
    id: PDF_ID,
    workspaceId: WS,
    ticketId: TICKET,
    uploaderId: member.userId,
    filename: 'gst-receipt.pdf',
    mime: 'application/pdf',
    size: PDF_BYTES.length,
    objectKey: `w/${WS}/a/${PDF_ID}`,
  });

  UNSAFE_ID = newUlid();
  await store.put(`w/${WS}/a/${UNSAFE_ID}`, Readable.from(UNSAFE_BYTES), {
    mime: 'application/pdf',
    size: UNSAFE_BYTES.length,
  });
  await insertAttachment(db.pool, {
    id: UNSAFE_ID,
    workspaceId: WS,
    ticketId: TICKET,
    uploaderId: member.userId,
    filename: UNSAFE_FILENAME,
    mime: 'application/pdf',
    size: UNSAFE_BYTES.length,
    objectKey: `w/${WS}/a/${UNSAFE_ID}`,
  });

  // Case (c): a row with no matching object in the store — deliberately no
  // `store.put` call for this one. The internal-inconsistency planted defect.
  ORPHAN_ID = newUlid();
  await insertAttachment(db.pool, {
    id: ORPHAN_ID,
    workspaceId: WS,
    ticketId: TICKET,
    uploaderId: member.userId,
    filename: 'lost.pdf',
    mime: 'application/pdf',
    size: 9,
    objectKey: `w/${WS}/a/${ORPHAN_ID}`,
  });
});

afterAll(async () => {
  await app.close();
  await rm(storeRoot, { recursive: true, force: true });
  await db.drop();
});

function download(token: string, id: string): Promise<InjectResponse> {
  return app.inject({
    method: 'GET',
    url: `/v1/attachments/${id}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for a reason that has nothing to do with what is being
 * compared. Everything else — `content-type`, `content-length` and
 * `content-disposition` above all — must match, because any one of them
 * differing would itself be the oracle even if both bodies parsed the same.
 */
function comparableHeaders(res: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = res.headers;
  return rest;
}

describe('GET /v1/attachments/:id', () => {
  it('a member streams the exact bytes with honest headers (positive control)', async () => {
    const res = await download(memberToken, IMG_ID);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(PNG_BYTES.length));
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.rawPayload.equals(PNG_BYTES)).toBe(true);
  });

  it('non-images download as attachments with the sanitized filename', async () => {
    const res = await download(memberToken, PDF_ID);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="gst-receipt.pdf"');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"\r\n]*"$/);
    expect(res.rawPayload.equals(PDF_BYTES)).toBe(true);
  });

  it('sanitizes a filename a row already holds unsanitized (composition, not the unit)', async () => {
    // Mutation that reddens this: replace `sanitizeFilename(row.filename)`
    // with `row.filename` at the call site in the GET handler. MEASURED:
    // with the mutation applied, `res.statusCode` stays `200` (the fixture
    // is quote-only, so Node's header transport accepts it unsanitized) and
    // the failure lands on the `content-disposition` equality below —
    // `attachment; filename="bad"name.pdf"`, the row's raw filename, not
    // `attachment; filename="badname.pdf"`. That is the composition claim
    // itself failing, not a status-code proxy for it.
    const res = await download(memberToken, UNSAFE_ID);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="badname.pdf"');
    expect(res.rawPayload.equals(UNSAFE_BYTES)).toBe(true);
  });

  it('case (a) vs (b): an unshared guest and a nonexistent id are byte-identical 404s', async () => {
    // Mutation that reddens this: give the `canSee` refusal inside the GET
    // handler any answer of its own — a distinct body, a 403, or an extra
    // header. MEASURED, not assumed: adding
    // `.header('x-refused', 'canSee')` to that branch's `replyNotFound` call
    // reddens exactly one assertion in this suite — the
    // `comparableHeaders(invisible)).toEqual(comparableHeaders(ghost))` line
    // below — while `invisible.statusCode`/`ghost.statusCode` and both
    // `.json()` calls above it stay green, because status and parsed body
    // are unchanged; only the header set differs. That is the byte-identity
    // property itself failing, not a proxy for it. Deleting the `canSee`
    // guard entirely reddens this test directly, at
    // `expect(invisible.statusCode).toBe(404)` two lines down (the guest
    // gets 200 instead of 404) — it does not need the positive control
    // above, which uses a different token (`memberToken`) and is unaffected
    // either way.
    const invisible = await download(guestToken, IMG_ID); // ticket exists, guest may not see it
    const ghost = await download(memberToken, newUlid()); // id never existed

    expect(invisible.statusCode).toBe(404);
    expect(ghost.statusCode).toBe(404);
    expect(invisible.json()).toEqual({ error: 'not-found' });
    expect(invisible.json()).toEqual(ghost.json());
    expect(comparableHeaders(invisible)).toEqual(comparableHeaders(ghost));
    // Body equality above is PARSED-object equality, which a re-serialization
    // (different key order, different whitespace) could satisfy while still
    // being a different byte-length response — itself an oracle. Raw bytes,
    // not just the parsed shape, must match.
    expect(invisible.rawPayload.equals(ghost.rawPayload)).toBe(true);

    // The streaming-specific leak surface the tickets precedent has no reason
    // to cover: none of these three headers survive onto the 404 path.
    for (const res of [invisible, ghost]) {
      expect(res.headers['content-disposition']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBeUndefined();
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    }
  });

  it('case (c): metadata without bytes answers the same 404 as (a) and (b), revealing nothing', async () => {
    // Mutation that reddens this: let the `ObjectNotFoundError` catch in the
    // handler fall through uncaught (removing the catch) turns this into an
    // unhandled rejection / 500 instead of a 404 — a caller who can see the
    // ticket would then learn "the object store is broken for this id" is a
    // DIFFERENT answer from "this id does not exist", which is exactly the
    // one extra bit case (c)'s docblock above says must not leak.
    const orphan = await download(memberToken, ORPHAN_ID); // canSee passes; store.getStream throws
    const ghost = await download(memberToken, newUlid());

    expect(orphan.statusCode).toBe(404);
    expect(orphan.json()).toEqual({ error: 'not-found' });
    expect(orphan.json()).toEqual(ghost.json());
    expect(comparableHeaders(orphan)).toEqual(comparableHeaders(ghost));
    expect(orphan.rawPayload.equals(ghost.rawPayload)).toBe(true);

    // Explicit, not just implied by the equality above: the two headers this
    // handler only ever adds after `getStream` succeeds must not survive
    // onto case (c) either — the row's bytes are gone, so nothing past that
    // call ran.
    expect(orphan.headers['content-disposition']).toBeUndefined();
    expect(orphan.headers['x-content-type-options']).toBeUndefined();
  });

  it('no session → 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/attachments/${IMG_ID}` });
    expect(res.statusCode).toBe(401);
  });
});
