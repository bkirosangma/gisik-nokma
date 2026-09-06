import { createHash } from 'node:crypto';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachmentUploadedPayload, newUlid } from '@gisik-nokma/domain';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { getAttachment, listTicketAttachments } from '../../src/attachments/attachment-repo.js';
import { ATTACHMENT_MAX_BYTES, registerAttachmentRoutes } from '../../src/routes/attachments.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedTicket } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 7 Task 9 — `POST /v1/attachments`.
 *
 * ## Real sessions, not a stub `Auth`
 *
 * The plan text hand-rolled a `stubAuth()` that cast an object literal through
 * `as unknown as Auth` and answered any `Bearer 01J9…`. That is a fixture
 * shaped like the thing it replaces, and it can only prove the handler reads
 * whatever the stub wrote. This file mounts the REAL better-auth instance and
 * signs both users in over the wire with `signInWithPhone`, so the identity the
 * handler attributes an upload to is one the auth system actually issued.
 *
 * A consequence worth naming: `signInWithPhone` authenticates with a BEARER
 * token, so nothing here exercises the cookie path, and nothing here should be
 * read as a statement about HTTP-Origin (the browser `Origin` HEADER — CSRF —
 * as distinct from `EventEnvelope.origin`, the provenance enum). The route's
 * position on HTTP-Origin is a documented decision in
 * `src/routes/attachments.ts` pointing at `routes/events.ts`, and the mechanism
 * it rests on — `SameSite=Lax` — is pinned by `test/auth/sign-in-flows.test.ts`,
 * not here.
 *
 * ## Every refusal asserts that nothing was stored
 *
 * "415" alone is a status code; the property is that the bytes did not land.
 * The plan's test was NAMED "and nothing is stored" and never asserted it —
 * this series' signature defect. So each refusal counts the objects on disk
 * before and after and asks the attachments table what it has for that ticket.
 *
 * ## A fresh ticket per test
 *
 * Rows are never deleted here, so "the table holds nothing for this ticket" is
 * only a crisp assertion when the ticket belongs to one test. `freshTicket()`
 * mints one. Nothing asserts on `created_at`, so no assertion in this file
 * depends on a clock or a zone.
 *
 * ## Two things this file deliberately does NOT test, having measured why
 *
 * **Field ordering.** The published contract says field parts must precede the
 * file part. It cannot be tested here: with the whole body already in memory,
 * busboy parses ahead and a trailing `ticketId` is visible to the handler
 * anyway — measured at 16 B, 3 kB, 100 kB and 1 MB, all four accepted. A test
 * asserting 400 would be asserting a race. See the handler's note.
 *
 * **The sanitizer's path branch.** busboy reduces a filename to its basename
 * before the handler sees it (`../../etc/passwd` arrives as `passwd`, measured
 * for both separators), so no route-level assertion can reach that branch.
 * `test/attachments/filename.test.ts` owns it and can fail on it.
 *
 * ## `maxBytes` is 4096 here, and 25 MiB in exactly one test
 *
 * The size refusal is proven cheaply at the HTTP boundary by running this
 * file's app at a 4096 ceiling; that the refusal happens DURING the stream
 * rather than after buffering is proven against a counting source in
 * `test/attachments/read-limited.test.ts`, which is the only place it is
 * observable. The one test that pays for real 25 MiB bodies is the ceiling
 * test, and it pays because a one-sided assertion there cannot tell
 * `ATTACHMENT_MAX_BYTES` from any larger number — see its own comment.
 *
 * ## The parser's limits are refusals too, and they are tested as such
 *
 * `@fastify/multipart` is configured with `fieldSize` and `parts`, and both can
 * refuse a request before the handler decides anything. They are covered here
 * rather than left to the library's reputation, because measurement showed the
 * two behave completely differently — one truncates silently and one raises a
 * 413 with a body that is not this route's — and because two further limits
 * this route once carried were removed on the strength of that measurement.
 * The register call in `src/routes/attachments.ts` records what each does.
 */

const WS = newUlid();
const PRJ = newUlid();
const OTHER_PRJ = newUlid();

/** Real magic bytes. A 16-byte png prefix is enough for `file-type`. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
/** `MZ` + padding: a DOS/PE executable, whatever it is called. */
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62)]);

type MultipartPart = {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
};

function multipartBody(parts: MultipartPart[]): {
  payload: Buffer;
  headers: Record<string, string>;
} {
  const boundary = 'gisik-test-boundary';
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      // Quoted-string escaping, as a correct client does it. Without this a
      // filename containing `"` would terminate the header value early and the
      // server would receive a TRUNCATED name — the test would then pass or
      // fail on the builder's behaviour rather than the sanitizer's.
      const quoted = part.filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${quoted}"\r\n` +
            `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
      );
      chunks.push(part.data ?? Buffer.alloc(0));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}`,
        ),
      );
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

function post(parts: MultipartPart[], token?: string): Promise<InjectResponse> {
  const { payload, headers } = multipartBody(parts);
  return app.inject({
    method: 'POST',
    url: '/v1/attachments',
    payload,
    headers: token === undefined ? headers : { ...headers, authorization: `Bearer ${token}` },
  });
}

function upload(
  token: string,
  ticketId: string,
  file: { filename: string; contentType: string; data: Buffer },
): Promise<InjectResponse> {
  return post(
    [
      { name: 'ticketId', value: ticketId },
      { name: 'file', filename: file.filename, contentType: file.contentType, data: file.data },
    ],
    token,
  );
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two responses for a reason that is not about visibility.
 */
function comparableHeaders(res: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = res.headers;
  return rest;
}

/** How many objects the store holds, anywhere under its root. */
async function countStoredObjects(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).length;
}

let db: TestDatabase;
let app: FastifyInstance;
let storeRoot = '';
let store: LocalDiskStore;
let memberToken = '';
let memberId = '';
let guestToken = '';
/** The same auth instance both apps in this file resolve sessions through. */
let sharedAuth: ReturnType<typeof createAuth>;

/** A ticket only the calling test uses, so "nothing was stored" is exact. */
async function freshTicket(projectId: string = PRJ): Promise<string> {
  const ticketId = newUlid();
  await seedTicket(db.pool, { workspaceId: WS, projectId, ticketId });
  return ticketId;
}

beforeAll(async () => {
  db = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-upload-'));
  store = new LocalDiskStore(storeRoot);

  const otp = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
    // The browser's origin, so better-auth trusts the product's own client.
    webOrigin: 'http://localhost:3001',
  });

  sharedAuth = auth;
  app = Fastify();
  registerAuthRoutes(app, auth);
  await registerAttachmentRoutes(app, {
    pool: db.pool,
    store,
    auth,
    maxBytes: 4096, // small ceiling so the oversize refusal is cheap to prove
  });
  await app.ready();

  const member = await signInWithPhone(app, otp, '+919000000101');
  const guest = await signInWithPhone(app, otp, '+919000000102');
  memberToken = member.token;
  memberId = member.userId;
  guestToken = guest.token;

  await seedMember(db.pool, WS, member.userId, 'member', [{ projectId: PRJ }]);
  await seedGuest(db.pool, WS, guest.userId);
});

afterAll(async () => {
  await app.close();
  await rm(storeRoot, { recursive: true, force: true });
  await db.drop();
});

describe('POST /v1/attachments', () => {
  it('a member uploads a png: 201 with the server-sniffed truth, and the bytes land', async () => {
    const ticketId = await freshTicket();
    const res = await upload(memberToken, ticketId, {
      filename: 'photo.png',
      contentType: 'image/png',
      data: PNG,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      attachmentId: string;
      url: string;
      mime: string;
      filename: string;
      size: number;
    };
    expect(body.url).toBe(`/v1/attachments/${body.attachmentId}`);
    expect(body.mime).toBe('image/png');
    expect(body.filename).toBe('photo.png');
    expect(body.size).toBe(PNG.length);

    const row = await getAttachment(db.pool, body.attachmentId);
    expect(row).toMatchObject({
      ticketId,
      workspaceId: WS,
      uploaderId: memberId,
      mime: 'image/png',
      filename: 'photo.png',
      size: PNG.length,
      objectKey: `w/${WS}/a/${body.attachmentId}`,
    });

    // The bytes on disk are the bytes that were sent — not merely a row that
    // says so. A `put` that wrote an empty file would satisfy every assertion
    // above and fail this one.
    const chunks: Buffer[] = [];
    for await (const chunk of await store.getStream(row?.objectKey ?? '')) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).equals(PNG)).toBe(true);
  });

  it('planted defect: a renamed .exe is refused 415 by its bytes, and nothing is stored', async () => {
    const ticketId = await freshTicket();
    const before = await countStoredObjects(storeRoot);

    // The client says image/png and calls it a photo. Only the bytes disagree.
    const res = await upload(memberToken, ticketId, {
      filename: 'holiday-photo.png',
      contentType: 'image/png',
      data: EXE,
    });

    expect(res.statusCode).toBe(415);
    const body = res.json() as { error: string; reason: string };
    expect(body.error).toBe('unsupported-media-type');
    expect(body.reason).toContain('not accepted');

    // Named in the title, therefore asserted.
    expect(await countStoredObjects(storeRoot)).toBe(before);
    expect(await listTicketAttachments(db.pool, ticketId)).toEqual([]);
  });

  it('planted defect: the client-supplied content-type cannot make a png anything else', async () => {
    // The converse direction, and the one that proves the header is UNUSED
    // rather than merely overridden when it disagrees pessimistically: honest
    // png bytes, labelled by the client as an executable. A server that
    // believed the header would refuse this 415; the bytes say image/png and
    // the bytes decide.
    const ticketId = await freshTicket();
    const res = await upload(memberToken, ticketId, {
      filename: 'setup.exe',
      contentType: 'application/x-msdownload',
      data: PNG,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { mime: string; filename: string };
    expect(body.mime).toBe('image/png');
    // The name is display data and survives verbatim; it decided nothing.
    expect(body.filename).toBe('setup.exe');
  });

  it('planted defect: unidentifiable bytes are refused 415, and nothing is stored', async () => {
    const ticketId = await freshTicket();
    const before = await countStoredObjects(storeRoot);

    const res = await upload(memberToken, ticketId, {
      filename: 'notes.txt',
      contentType: 'text/plain',
      data: Buffer.alloc(64, 7),
    });

    expect(res.statusCode).toBe(415);
    expect((res.json() as { reason: string }).reason).toContain('never trusted');
    expect(await countStoredObjects(storeRoot)).toBe(before);
    expect(await listTicketAttachments(db.pool, ticketId)).toEqual([]);
  });

  it('planted defect: an oversize upload is refused 413, and nothing is stored', async () => {
    const ticketId = await freshTicket();
    const before = await countStoredObjects(storeRoot);

    // Real png bytes, so nothing but the SIZE can be the reason for refusal.
    const big = Buffer.concat([PNG, Buffer.alloc(8192)]);
    const res = await upload(memberToken, ticketId, {
      filename: 'big.png',
      contentType: 'image/png',
      data: big,
    });

    expect(res.statusCode).toBe(413);
    const body = res.json() as { error: string; reason: string };
    expect(body.error).toBe('payload-too-large');
    expect(body.reason).toContain('larger than');
    expect(await countStoredObjects(storeRoot)).toBe(before);
    expect(await listTicketAttachments(db.pool, ticketId)).toEqual([]);
  });

  // TIMEOUT, RAISED DELIBERATELY — 120s against this file's 30s default.
  //
  // This case moves ~50 MiB through the parser (two bodies of ATTACHMENT_MAX_BYTES
  // and one byte more), which is 5.4s on an idle machine and the slowest test in
  // the suite by an order of magnitude. On 2026-09-06 it hit the 30s default and
  // failed while five parallel lanes shared one 16 GB box — a TIMEOUT under
  // contention, not a defect: the assertions it makes are about sizes and status
  // codes, and neither depends on how long the box took.
  //
  // Raised rather than skipped, and rather than shrunk. Skipping it would remove
  // the ONLY comparison anywhere between what ships and 26_214_400. Shrinking the
  // bodies would destroy the boundary pair below, which is the entire reason this
  // test replaced an earlier one-sided version that a `?? 1_048_576` fallback
  // passed green. The cost of the raise is that a genuine hang here takes 120s to
  // report instead of 30s; the cost of the alternatives is a claim nothing checks.
  it('the shipped ceiling is 25 MiB, and a route with no maxBytes uses exactly that number', async () => {
    // Two separate claims, because pinning only the first leaves
    // `deps.maxBytes ?? SOMETHING_ELSE` free to ship. The constant is a Global
    // Constraints number; every other test in this file runs at 4096, so
    // without these lines nothing anywhere compares what ships to 26_214_400.
    expect(ATTACHMENT_MAX_BYTES).toBe(26_214_400);
    expect(ATTACHMENT_MAX_BYTES).toBe(25 * 1024 * 1024);

    // A BOUNDARY PAIR, and it has to be a pair. This test previously sent one
    // 200_016-byte body through a `maxBytes`-less app and read 201, which
    // proves only "the fallback is somewhere above 200_016" — every value in
    // (200_016, ∞) passes, so `deps.maxBytes ?? 1_048_576` would have shipped
    // green under a title saying it could not. (The planted defect that was
    // supposed to check this used 1024, which lands below the gap and therefore
    // told the implementer the whole claim was constrained.) Accepting exactly
    // ATTACHMENT_MAX_BYTES and refusing exactly one byte more pins the fallback
    // to a single value from both sides.
    const defaulted = Fastify();
    await registerAttachmentRoutes(defaulted, { pool: db.pool, store, auth: sharedAuth });
    await defaulted.ready();

    const atCeiling = async (
      totalBytes: number,
    ): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> => {
      const ticketId = await freshTicket();
      const { payload, headers } = multipartBody([
        { name: 'ticketId', value: ticketId },
        {
          name: 'file',
          filename: 'wide.png',
          contentType: 'image/png',
          // Real png magic bytes so SIZE is the only thing that can decide.
          data: Buffer.concat([PNG, Buffer.alloc(totalBytes - PNG.length)]),
        },
      ]);
      return defaulted.inject({
        method: 'POST',
        url: '/v1/attachments',
        payload,
        headers: { ...headers, authorization: `Bearer ${memberToken}` },
      });
    };

    try {
      const exact = await atCeiling(ATTACHMENT_MAX_BYTES);
      expect(exact.statusCode).toBe(201);
      expect((exact.json() as { size: number }).size).toBe(ATTACHMENT_MAX_BYTES);

      const over = await atCeiling(ATTACHMENT_MAX_BYTES + 1);
      expect(over.statusCode).toBe(413);
      // The refusal names the shipped ceiling in the shipped units — a fallback
      // of 1_048_576 would say "1 MB" here even if the pair above were dropped.
      expect(over.json()).toEqual({
        error: 'payload-too-large',
        reason: 'This file is larger than the 25 MB limit.',
      });
    } finally {
      await defaulted.close();
    }
  }, 120_000);

  it('planted defect: a ticketId truncated by the field-size cap is refused, not acted on', async () => {
    // `fieldSize: 256` does not error when a field value is too long — busboy
    // sets `valueTruncated` and hands the SHORTENED string through. A handler
    // reading `.value` alone would look up the first 256 bytes of what the
    // client sent, which is a size decision that fails invisibly, the exact
    // class the size argument in `read-limited.ts` claims to have removed.
    const ticketId = await freshTicket();
    const before = await countStoredObjects(storeRoot);

    const res = await post(
      [
        { name: 'ticketId', value: `${ticketId}${'x'.repeat(300)}` },
        { name: 'file', filename: 'p.png', contentType: 'image/png', data: PNG },
      ],
      memberToken,
    );

    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('bad-request');
    expect(await countStoredObjects(storeRoot)).toBe(before);
    expect(await listTicketAttachments(db.pool, ticketId)).toEqual([]);

    // POSITIVE CONTROL, and the one that makes the refusal about truncation
    // rather than about the prefix: the untruncated id, same file, is accepted.
    // Without it a handler that 400'd every upload would pass every line above.
    const ok = await upload(memberToken, ticketId, {
      filename: 'p.png',
      contentType: 'image/png',
      data: PNG,
    });
    expect(ok.statusCode).toBe(201);
  });

  it('planted defect: too many parts is refused 413 in THIS route’s body, not the parser’s', async () => {
    // The parser's own `FST_PARTS_LIMIT` is `createError(..., 413)`, so left
    // uncaught Fastify answers 413 with `{statusCode, code, error, message}` —
    // a shape no client of this route is told about, on a status code the route
    // publishes as its own. Nine parts, the ninth arriving before the file, is
    // where the parser rejects `request.file()`.
    const ticketId = await freshTicket();
    const before = await countStoredObjects(storeRoot);

    const filler = Array.from({ length: 8 }, (_, i) => ({ name: `pad${i}`, value: 'v' }));
    const res = await post(
      [
        { name: 'ticketId', value: ticketId },
        ...filler,
        { name: 'file', filename: 'p.png', contentType: 'image/png', data: PNG },
      ],
      memberToken,
    );

    expect(res.statusCode).toBe(413);
    // Asserted on the WHOLE body: `toMatchObject` would pass on the parser's
    // body too, since that also carries `statusCode: 413`.
    expect(res.json()).toEqual({
      error: 'payload-too-large',
      reason: 'This request has too many parts.',
    });
    expect(await countStoredObjects(storeRoot)).toBe(before);
    expect(await listTicketAttachments(db.pool, ticketId)).toEqual([]);

    // POSITIVE CONTROL: the same shape one part shorter is accepted, so the
    // 413 is the count and not the padding fields themselves.
    const ok = await post(
      [
        { name: 'ticketId', value: ticketId },
        ...filler.slice(0, 6),
        { name: 'file', filename: 'p.png', contentType: 'image/png', data: PNG },
      ],
      memberToken,
    );
    expect(ok.statusCode).toBe(201);
  });

  it('planted defect: a guest gets a 404 indistinguishable from a ticket that never existed', async () => {
    const ticketId = await freshTicket();

    // POSITIVE CONTROL FIRST: the same route, the same file, a viewer who may
    // see this ticket. Without it, a handler that 404'd every upload would
    // pass every assertion below.
    const allowed = await upload(memberToken, ticketId, {
      filename: 'p.png',
      contentType: 'image/png',
      data: PNG,
    });
    expect(allowed.statusCode).toBe(201);

    const invisible = await upload(guestToken, ticketId, {
      filename: 'p.png',
      contentType: 'image/png',
      data: PNG,
    });
    const ghost = await upload(memberToken, newUlid(), {
      filename: 'p.png',
      contentType: 'image/png',
      data: PNG,
    });

    expect(invisible.statusCode).toBe(404);
    expect(ghost.statusCode).toBe(404);
    expect(invisible.json()).toEqual({ error: 'not-found' });
    expect(invisible.json()).toEqual(ghost.json());
    expect(invisible.body).toBe(ghost.body);
    expect(comparableHeaders(invisible)).toEqual(comparableHeaders(ghost));

    // The guest's refusal stored nothing; only the member's upload did.
    expect(await listTicketAttachments(db.pool, ticketId)).toHaveLength(1);
  });

  it('a member cannot upload to a ticket in a project they are not on', async () => {
    // The same 404, reached through the OTHER half of the visibility table:
    // a real ticket, a real member, a project they were never added to.
    const ticketId = await freshTicket(OTHER_PRJ);
    const res = await upload(memberToken, ticketId, {
      filename: 'p.png',
      contentType: 'image/png',
      data: PNG,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not-found' });
    expect(await listTicketAttachments(db.pool, ticketId)).toEqual([]);
  });

  it('the visibility refusal comes before the file is even looked at', async () => {
    // Refusal ORDER, pinned. An invisible ticket carrying bytes that would
    // ALSO fail the sniff must still answer 404 — if the sniff ran first the
    // answer would be 415, and the difference between 415 and 404 is a
    // ticket-existence oracle any guest could query.
    const ticketId = await freshTicket();
    const res = await upload(guestToken, ticketId, {
      filename: 'thing.png',
      contentType: 'image/png',
      data: EXE,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not-found' });

    // The docblock names SIZE as well as sniff, and the case above cannot
    // reach it: 64 bytes is nowhere near the 4096 ceiling, so a
    // size-before-visibility reordering would leave this test green. The same
    // guest, the same invisible ticket, a body over the ceiling — and honest
    // png bytes, so size is the only thing left that could answer 413.
    const oversize = await upload(guestToken, ticketId, {
      filename: 'thing.png',
      contentType: 'image/png',
      data: Buffer.concat([PNG, Buffer.alloc(8192)]),
    });

    expect(oversize.statusCode).toBe(404);
    expect(oversize.json()).toEqual({ error: 'not-found' });

    // POSITIVE CONTROL: the identical oversize body from a viewer who MAY see
    // the ticket answers 413, so the 404 above is the visibility check winning
    // the race and not the size check having quietly stopped working.
    const seen = await upload(memberToken, ticketId, {
      filename: 'thing.png',
      contentType: 'image/png',
      data: Buffer.concat([PNG, Buffer.alloc(8192)]),
    });
    expect(seen.statusCode).toBe(413);
  });

  it('no session → 401 with the one unauthenticated body', async () => {
    const ticketId = await freshTicket();
    const anon = await post([
      { name: 'ticketId', value: ticketId },
      { name: 'file', filename: 'p.png', contentType: 'image/png', data: PNG },
    ]);

    expect(anon.statusCode).toBe(401);
    expect(anon.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(await listTicketAttachments(db.pool, ticketId)).toEqual([]);
  });

  it('a missing ticketId field → 400', async () => {
    const res = await post(
      [{ name: 'file', filename: 'p.png', contentType: 'image/png', data: PNG }],
      memberToken,
    );

    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('bad-request');
  });

  it('a filename that could break a Content-Disposition header is stored sanitized', async () => {
    // MEASURED, not assumed: busboy already reduces a path-shaped filename to
    // its basename, so `../../etc/passwd` arrives here as `passwd` and no
    // route-level assertion can observe `sanitizeFilename`'s path branch at
    // all. (`filename.test.ts` owns that branch and can fail on it.)
    //
    // What the transport does NOT strip, and what therefore reaches us intact,
    // is a quote — the `Content-Disposition` delimiter — and raw control
    // characters. Those are the two this test sends, because they are the two
    // where the sanitizer is the only thing standing between a hostile name
    // and the header Task 10 will write it into.
    const ticketId = await freshTicket();
    const hostile = `evil"${String.fromCharCode(7)}.png`;
    const res = await upload(memberToken, ticketId, {
      filename: hostile,
      contentType: 'image/png',
      data: PNG,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { attachmentId: string; filename: string };
    expect(body.filename).toBe('evil.png');

    const row = await getAttachment(db.pool, body.attachmentId);
    expect(row?.filename).toBe('evil.png');
    // The object key was never made of the filename in the first place.
    expect(row?.objectKey).toBe(`w/${WS}/a/${body.attachmentId}`);
  });

  it('the 201 body and the stored row carry the same SHA-256 of the stored bytes', async () => {
    const ticketId = await freshTicket();
    const res = await upload(memberToken, ticketId, {
      filename: 'photo.png',
      contentType: 'image/png',
      data: PNG,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      attachmentId: string;
      filename: string;
      mime: string;
      size: number;
      sha256: string;
    };
    expect(body.sha256).toBe(createHash('sha256').update(PNG).digest('hex'));

    // The client is required to echo the door's answer verbatim into
    // `attachment.added` (amendment 15). Pin the 201 body against the
    // ALREADY-LANDED wire schema — not a copy of its regex — so this test
    // reddens if the two ever disagree, rather than passing because both
    // sides independently agree with the same content.
    const wirePayload = attachmentUploadedPayload.parse({
      kind: 'upload',
      attachmentId: body.attachmentId,
      filename: body.filename,
      mime: body.mime,
      size: body.size,
      sha256: body.sha256,
    });
    expect(wirePayload.sha256).toBe(body.sha256);

    const row = await getAttachment(db.pool, body.attachmentId);
    expect(row?.sha256).toBe(body.sha256);
  });

  it('planted defect: two uploads differing by one byte get different hashes, and a lying content-type changes nothing', async () => {
    const ticketId = await freshTicket();
    const other = Buffer.concat([PNG, Buffer.from([0x01])]);

    const first = await upload(memberToken, ticketId, {
      filename: 'a.png',
      contentType: 'image/png',
      data: PNG,
    });
    const second = await upload(memberToken, ticketId, {
      filename: 'b.png',
      contentType: 'application/pdf',
      data: other,
    });

    const a = first.json() as { sha256: string };
    const b = second.json() as { sha256: string };
    expect(a.sha256).not.toBe(b.sha256);
    expect(b.sha256).toBe(createHash('sha256').update(other).digest('hex'));
  });
});
