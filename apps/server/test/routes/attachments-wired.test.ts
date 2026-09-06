import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { getAttachment } from '../../src/attachments/attachment-repo.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedTicket } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * The composition root actually registers the attachment routes — and does it
 * in a way that leaves every other door alone.
 *
 * ## Why a THIRD attachment suite exists
 *
 * `attachments-upload.test.ts` and `attachments-download.test.ts` cover the
 * route's behaviour thoroughly, and both were green on the day
 * `registerAttachmentRoutes` was reachable from NOTHING in `src/`: each mounts a
 * bare `Fastify()` and calls the register function BY HAND
 * (`attachments-upload.test.ts:220`, `attachments-download.test.ts:160`). That
 * is the right shape for testing a route and exactly the wrong shape for
 * testing that the route is wired: a suite that registers the thing itself
 * cannot notice that the shipped server does not. A fourth copy of that
 * arrangement would prove nothing this pair does not already prove.
 *
 * So this file registers NOTHING. It goes through `buildTestApp`, which calls
 * the real `buildApp` — the one composition path `src/index.ts` also takes — and
 * asks the assembled server the two questions the wiring can get wrong.
 *
 * Registering by hand here would not merely be redundant, it would throw:
 * `@fastify/multipart` decorates the instance, and a second registration in an
 * overlapping scope raises `FST_ERR_DEC_ALREADY_PRESENT`.
 *
 * ## Property 1 — the ROW, not the status code
 *
 * The failure this file exists to catch is "the `attachments` table can never
 * gain a row", so the assertion is on the ROW. A 201 alone would also be
 * answered by a route wired over a store that silently discarded its bytes, or
 * over a pool that wrote nowhere this test can read; `getAttachment(db.pool, id)`
 * against the same database the app was assembled over is what makes the pass
 * mean the writer ran.
 *
 * ## Property 2 — the encapsulation, which nothing else in this repo could see
 *
 * `registerAttachmentRoutes` registers `@fastify/multipart`. Registered at the
 * ROOT instance instead of inside its own encapsulated scope, that parser
 * applies to every route in the server: measured, a `multipart/form-data` POST
 * to `/v1/events` stops answering 415 ("this server has no parser for that") and
 * starts answering `400 FST_ERR_VALIDATION` "body must be object", with
 * `request.body` undefined. That is a silent change to what a completely
 * different door says, produced by a one-word difference in how this one is
 * registered.
 *
 * Before this file, no test in the repo could have noticed: swept, the only
 * test file mentioning `multipart/form-data` at all was the upload suite, whose
 * app has no `/v1/events` on it. The 415 case below is the whole reason the
 * encapsulation claim in `src/app.ts` is a check that can fail.
 *
 * The 415 request is SIGNED IN deliberately. Fastify parses the content type
 * before `preHandler` runs, so an anonymous multipart POST answers 415 too —
 * and a token-less assertion could not tell the parser's refusal from an auth
 * refusal that happened to share a status code. With a real session the 415 is
 * unambiguously the content-type answer.
 */

const WS = newUlid();
const PRJ = newUlid();

/** Real magic bytes — a 16-byte png prefix is all `file-type` needs. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const BOUNDARY = 'gisik-wired-boundary';

/**
 * A minimal multipart body, deliberately COPIED rather than imported from
 * `attachments-upload.test.ts` (where the equivalent lives privately at
 * lines 87-143). Exporting it from there means editing a green suite whose
 * docblock is load-bearing, to serve a file that needs two parts and no
 * filename escaping. The duplication is recorded in this task's report.
 */
function multipartUpload(
  ticketId: string,
  data: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const payload = Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="ticketId"\r\n\r\n${ticketId}\r\n`,
    ),
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="pinned.png"\r\n` +
        `Content-Type: image/png\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
  return {
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

let db: TestDatabase;
let app: FastifyInstance;
let storeRoot = '';
let token = '';
let userId = '';

beforeAll(async () => {
  db = await createTestDatabase();
  // A temp root, not the default `var/attachments`: this suite completes a real
  // upload, and the default is a RELATIVE path that would write the stored
  // object into the repository working tree and leave it there.
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-wired-'));

  const built = buildTestApp(db, { store: new LocalDiskStore(storeRoot) });
  app = built.app;
  await app.ready();

  const member = await signInWithPhone(app, built.otp, '+919000000501');
  token = member.token;
  userId = member.userId;
  await seedMember(db.pool, WS, userId, 'member', [{ projectId: PRJ }]);
});

afterAll(async () => {
  await app.close();
  await rm(storeRoot, { recursive: true, force: true });
  await db.drop();
});

describe('the composition root wires the attachment routes', () => {
  /**
   * 9.240 — the COMPOSITION ROOT registers the upload route: an upload through the app `buildApp` assembles answers `201` AND leaves a row in `attachments` for the named ticket.
   */
  it('an upload through the ASSEMBLED app lands a row in `attachments`', async () => {
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId });

    const { payload, headers } = multipartUpload(ticketId, PNG);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/attachments',
      payload,
      headers: { ...headers, authorization: `Bearer ${token}` },
    });

    // 404 here is the unwired server: `buildApp` declaring no such route.
    expect(res.statusCode, `POST /v1/attachments answered ${res.body}`).toBe(201);
    const body = res.json() as { attachmentId: string; mime: string; size: number };
    expect(body.mime).toBe('image/png');

    // THE assertion. The status code alone would pass against a route wired
    // over a store or a pool that wrote nowhere this test can read.
    const row = await getAttachment(db.pool, body.attachmentId);
    expect(row, `no attachments row for ${body.attachmentId}`).not.toBeNull();
    expect(row?.ticketId).toBe(ticketId);
    expect(row?.workspaceId).toBe(WS);
    expect(row?.uploaderId).toBe(userId);
    expect(row?.mime).toBe('image/png');
    expect(row?.size).toBe(PNG.length);
  });

  /**
   * 9.241 — registering `@fastify/multipart` for the upload route does not change what the OTHER `/v1/events` door says: a multipart POST there still answers `415` on the same assembled app.
   */
  it('registering multipart does NOT change what `/v1/events` says to a multipart body', async () => {
    // Same assembled app, a different door. 415 is "this server has no parser
    // for that content type" — the answer every route but the upload one must
    // keep. Root-registered multipart turns this into 400 FST_ERR_VALIDATION.
    const { payload, headers } = multipartUpload(newUlid(), PNG);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload,
      headers: { ...headers, authorization: `Bearer ${token}` },
    });

    expect(
      res.statusCode,
      `POST /v1/events answered ${res.statusCode} ${res.body} — a 400 here means the multipart parser escaped its scope`,
    ).toBe(415);
  });
});
