import { Readable } from 'node:stream';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { newUlid } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/require-session.js';
import { canSee, getResolvedVisibility } from '../visibility/can-see.js';
import { insertAttachment } from '../attachments/attachment-repo.js';
import { sanitizeFilename } from '../attachments/filename.js';
import { readAtMost } from '../attachments/read-limited.js';
import { sniffAllowedMime } from '../attachments/sniff.js';
import type { ObjectStore } from '../attachments/object-store.js';

/** 25 MiB. The one number; `maxBytes` exists so tests can prove the refusal cheaply. */
export const ATTACHMENT_MAX_BYTES = 26_214_400;

export type AttachmentRouteDeps = {
  pool: Pool;
  store: ObjectStore;
  auth: Auth;
  maxBytes?: number;
};

/** The body for "no such ticket" and "not yours to see" — one constant, so they cannot drift apart. */
const NOT_FOUND_BODY = { error: 'not-found' } as const;

/**
 * One 404 for "does not exist" and "you may not see it".
 *
 * Existence must be indistinguishable from invisibility (spec §6 discipline
 * applied to files). Returning the same OBJECT from one place is the cheap
 * half; the half that matters is that no refusal above adds a header or a
 * reason the other does not have — which is why the visibility check runs
 * before anything that could vary (see the refusal-order note on the handler).
 * `attachments-upload.test.ts` compares status, parsed body, RAW body and every
 * header but `date` between the two, behind a 201 positive control.
 *
 * ## What is NOT claimed here: equal timing
 *
 * An earlier draft of this comment said the two refusals differ by no "timing
 * difference" either. Nothing measured that, and it is false as written. A
 * nonexistent ticket costs exactly one query — `getResolvedVisibility` returns
 * null and short-circuits the `||` — while a real-but-invisible ticket costs
 * that query plus `canSee`, which re-runs `getResolvedVisibility` and then
 * `resolveEffectiveRole` (`visibility/can-see.ts`). Three round-trips against
 * one, and the asymmetry runs in the direction an attacker would want: the real
 * ticket is the slow one.
 *
 * The constraint this plan imposes is BYTE-IDENTITY of the answer, and that is
 * met and tested. The timing channel is real but unmeasured and unclosed here:
 * closing it means making the two paths do the same number of queries, which is
 * a change to the shared visibility layer every read route in the product goes
 * through, not to this route. **RECORDED, not fixed. Owner: whichever task
 * hardens `visibility/can-see.ts`** — none is scheduled, so it is raised in
 * this task's report rather than silently inherited by Task 10's download half,
 * which copies this function.
 */
function replyNotFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send(NOT_FOUND_BODY);
}

/**
 * The parser refusals `@fastify/multipart` raises before the handler owns the
 * request, translated into this route's own vocabulary.
 *
 * MEASURED against `@fastify/multipart@9.4.0`, not read off the README:
 * `FST_PARTS_LIMIT` is `createError(code, message, 413)`, so left alone Fastify
 * answers 413 with the LIBRARY's body (`{statusCode, code, error, message}`)
 * and the route's published `{error, reason}` shape silently stops applying to
 * one of its own status codes. Catching it is what makes "413 is this product's
 * own answer, with its own body" true for every 413 the door can emit rather
 * than only for the one `readAtMost` produces.
 *
 * ONE code, not the three the plugin defines. `FST_FILES_LIMIT` and
 * `FST_FIELDS_LIMIT` cannot be raised by the limits this route configures, and
 * a branch no request can reach is the same check-that-cannot-fail the register
 * call below cites when it deletes `files: 1`. Breadth here would have been
 * untested breadth. If either limit is ever reintroduced, this set widens in
 * the same change set as the limit, with the test that reaches it.
 */
const MULTIPART_PARTS_LIMIT_CODE = 'FST_PARTS_LIMIT';

function isPartCountRefusal(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  return (err as { code: unknown }).code === MULTIPART_PARTS_LIMIT_CODE;
}

/**
 * Stop pulling an upload we have already decided to refuse.
 *
 * Every early return happens BEFORE the body is read, which is the point — a
 * guest probing a ticket id must not get to push 25 MiB through us first. The
 * unread file stream is destroyed rather than drained for the same reason:
 * draining would read exactly the bytes we refused to accept.
 */
function discardUnreadFile(file: Readable): void {
  file.destroy();
}

/**
 * The upload door: bytes arrive here, and the server decides what they are.
 *
 * ## The mime is decided by the bytes, and by nothing the client said
 *
 * A multipart part carries a filename and a `Content-Type`, and both are
 * strings the uploader chose. Neither reaches the mime decision:
 * `sniffAllowedMime` reads magic bytes, and its answer is what gets stored,
 * what gets returned, and what the client is required to echo into its
 * `attachment.added` event. `holiday-photo.png` whose bytes begin `MZ` is
 * refused 415 as the executable it is — `test/routes/attachments-upload.test.ts`
 * pins that in both directions, including the case where the honest file is a
 * png the client mislabelled as an executable and the server believes the
 * bytes anyway.
 *
 * The filename survives, sanitized, for display alone.
 *
 * ## The size limit on the FILE is enforced during the stream
 *
 * `readAtMost` refuses at the byte that crosses the ceiling and tears the
 * source down there; nothing beyond `maxBytes` is ever pulled. It is the only
 * decision about the file's size, and the parser's competing one is switched
 * OFF explicitly at the register call below — not left unset, which is a
 * different thing and used to be a 1 MiB silent truncation. See
 * `read-limited.ts` for why one decision rather than two, and the register call
 * for what "unset" actually did.
 *
 * "One size decision" is a claim about the FILE BYTES and nothing else. The
 * parser also caps a field VALUE at 256 bytes, and that is a second size
 * decision — see the register call below, where it is made loud instead of
 * silent.
 *
 * ## Refusal ORDER is load-bearing, not incidental
 *
 * In the order they can actually fire:
 *
 *   1. no session → 401 (`requireSession`, a preHandler, before this body runs)
 *   2. too many parts → 413, raised INSIDE `await request.file()` by the parser
 *      and translated to this route's body
 *   3. no `file` part → 400
 *   4. no usable `ticketId` field (absent, or truncated by `fieldSize`) → 400
 *   5. ticket not visible, or not there → 404
 *   6. file over `maxBytes` → 413
 *   7. bytes not an accepted type → 415
 *
 * Steps 2–4 are listed because they DO precede the visibility 404 and an
 * earlier version of this note left them out, which made the order look like a
 * shorter list than the code has. None of them is an existence oracle: each is
 * decided on the shape of the request alone, before any ticket id is read from
 * a field or looked up, so the answer is identical for a ticket that exists,
 * one that does not, and one the caller may not see.
 *
 * Step 5 before steps 6 and 7 is the part that matters and must stay: if size
 * or sniff ran first, a guest could learn which ticket ids exist by uploading
 * rubbish to each and reading 415 (ticket real, file bad) against 404 (ticket
 * not theirs). The oracle would be the refusal they got, not the one they were
 * meant to get. A refactor that reorders these lines re-opens that channel, and
 * `attachments-upload.test.ts` compares a guest's answer to a nonexistent
 * ticket's answer field by field to catch it, and separately sends an invisible
 * ticket a body that is over-size AND unsniffable so both of steps 6 and 7 are
 * pinned behind step 5 rather than only the one.
 *
 * ## HTTP-Origin on this route: no, and by decision rather than by omission
 *
 * **"HTTP-Origin" here means the browser `Origin` request HEADER — the CSRF
 * question. It is NOT `EventEnvelope.origin`, the provenance enum the ingest
 * gate reads.** The two words meet on cookie-authenticated mutations like this
 * one, and conflating them is how somebody writes a header check and believes
 * they have closed an envelope-forgery window.
 *
 * `POST /v1/attachments` is a cookie-authenticated product mutation, so the
 * question genuinely lands here. The answer is the same as `POST /v1/events`,
 * for the same reasons, and `routes/events.ts` carries the argument in full:
 * better-auth's `originCheckMiddleware` binds `/api/auth/*` only, there is no
 * global HTTP-Origin middleware to inherit, the mechanism is `SameSite=Lax`
 * set deliberately at `auth/auth.ts` and pinned whole by
 * `test/auth/sign-in-flows.test.ts`, and a cross-site browser POST therefore
 * arrives with no cookie and meets `requireSession`'s 401 one step later.
 *
 * This route adds no Origin check. Doing so would CHANGE WHAT THE DOOR ACCEPTS
 * — a deployment-hardening decision that needs `trustedOrigins`/`WEB_ORIGIN`
 * to mean anything — and it belongs to the same owner as the events door's
 * copy of it. **RECORDED, not fixed. Owner: Plan 11's deployment hardening**
 * (`routes/events.ts` named "Plan 4 Task 13 or Plan 11, whichever is first";
 * Plan 4 Task 13 has since merged without it, so Plan 11 is the owner).
 *
 * ## This endpoint appends NOTHING to the ledger
 *
 * Bytes arriving is not a claim about a ticket. The client emits
 * `attachment.added` through `POST /v1/events` afterwards, carrying the mime
 * and size THIS response returned (amendment 15). Two consequences worth
 * stating: an upload nobody follows with an event is an orphaned object, not a
 * half-recorded fact; and the honesty of the recorded mime depends on the
 * client echoing rather than re-deciding, which is why the response returns
 * the sniffed truth rather than leaving the client to describe the file it
 * just sent.
 *
 * ## `requireSession`, and the rule it discharges
 *
 * The handler reads `request.currentUserId`, so it registers the preHandler
 * that writes it — the rule stated in `../auth/require-session.ts`. Here that
 * is discharged by taking `auth` in the deps and building the preHandler
 * below: there is no way to call this function without supplying the identity
 * source, exactly as `registerEventRoutes` cannot be called without the
 * preHandler itself. (This function takes `auth` rather than the preHandler
 * the other routes take, because that is the cross-plan signature Task 10's
 * download half is written against.)
 */
export async function registerAttachmentRoutes(
  app: FastifyInstance,
  deps: AttachmentRouteDeps,
): Promise<void> {
  const maxBytes = deps.maxBytes ?? ATTACHMENT_MAX_BYTES;

  // `fileSize` is switched OFF here, explicitly, and the explicitness is the
  // whole point.
  //
  // This route shipped with no `fileSize` key at all, on the argument that not
  // configuring the library's limit leaves exactly one size decision — the loop
  // in `readAtMost`. MEASURED, and the argument was wrong about what omission
  // means: `@fastify/multipart` reads `options.limits?.fileSize ||
  // fastify.initialConfig.bodyLimit`, so an absent key inherits Fastify's
  // bodyLimit, which is 1 MiB. Worse, a route that consumes `data.file` as a
  // stream (this one) never reaches the `throwFileSizeLimit` check, which lives
  // in `toBuffer()`. So busboy TRUNCATED every upload at 1_048_576 bytes and
  // handed the short stream on: `readAtMost` saw a body under its ceiling, the
  // sniff passed on the real magic bytes, and a 3 MiB image was stored as a
  // 1 MiB corrupt file with a 201 and a row saying `size: 1048576`. The
  // published 25 MiB ceiling had never once applied. The boundary pair in
  // `attachments-upload.test.ts` — accept exactly ATTACHMENT_MAX_BYTES, refuse
  // one byte more — is what found it; the single one-sided assertion it
  // replaced could not, because 200_016 bytes fits under 1 MiB too.
  //
  // MAX_SAFE_INTEGER rather than `maxBytes`: putting the parser's limit at the
  // same threshold as ours is the "two guards, one of which can never fire"
  // shape `read-limited.ts` argues against. Off is a stance; absent was not.
  //
  // The other two are hygiene against an unbounded request: busboy buffers
  // field VALUES whole, so an uncapped `fieldSize` is a memory hole no file
  // limit covers, and an uncapped part COUNT is the same hole reached by
  // repetition. Each was MEASURED against @fastify/multipart@9.4.0 rather than
  // assumed, because the three settings behave completely differently and two
  // of the four this route originally carried were worse than nothing:
  //
  //   `parts: 8`     — when the ninth part arrives BEFORE the file part, the
  //                    parser rejects `await request.file()` with
  //                    `FST_PARTS_LIMIT` (statusCode 413). Caught below and
  //                    answered in this route's own body. `parts` bounds the
  //                    field count too, since fields are parts.
  //   `fieldSize`    — does NOT error. `onField` sets `valueTruncated: true`
  //                    and hands the SHORTENED value through, so a handler that
  //                    reads `.value` without reading that flag acts on a
  //                    string the client never sent. Read below, and refused.
  //   `fields: 4`    — REMOVED. Measured: a fifth field aborts the parse in a
  //                    way that surfaces as `ERR_STREAM_PREMATURE_CLOSE` while
  //                    the handler is reading the file, i.e. a 500 with
  //                    Fastify's own body, indistinguishable from a client that
  //                    hung up. `parts` already bounds the count, and does it
  //                    with an error this route can answer for.
  //   `files: 1`     — REMOVED. Measured: unobservable here. `request.file()`
  //                    resolves on the first file, so the limit can only fire
  //                    after this handler already has what it came for; two
  //                    files were accepted, 201, with the limit set and with it
  //                    unset alike. A knob no request can move is a check that
  //                    cannot fail.
  //
  // What bounds a SECOND file part, then, now that neither `files` nor a 1 MiB
  // default is there to truncate it? Not `parts`, which bounds the count and
  // says nothing about bytes. It is that the plugin never accumulates a file it
  // is not asked for — `onFile` hands out the stream and only `toBuffer()`
  // buffers — so an unconsumed trailing part exerts back-pressure instead of
  // growing. MEASURED over a real socket rather than `inject`, which cannot
  // show what comes off the wire: a client streaming a 60 MiB second file part
  // got the 201 for the first one after ~1 MiB and was then torn down, the same
  // ~1 MiB of kernel buffering seen with `files: 1` set and with the old
  // truncating default. Removing the limit loosened nothing.
  await app.register(multipart, {
    limits: { fileSize: Number.MAX_SAFE_INTEGER, fieldSize: 256, parts: 8 },
  });

  const requireSession = makeRequireSession(deps.auth);

  app.post('/v1/attachments', { preHandler: requireSession }, async (request, reply) => {
    let data;
    try {
      data = await request.file();
    } catch (err) {
      if (!isPartCountRefusal(err)) throw err;
      return reply.code(413).send({
        error: 'payload-too-large',
        reason: 'This request has too many parts.',
      });
    }
    if (!data) {
      return reply
        .code(400)
        .send({ error: 'bad-request', reason: 'a multipart "file" part is required' });
    }

    // `data.fields` holds the parts busboy has parsed by the time the file
    // part surfaces, which is why the published contract asks clients to send
    // field parts FIRST: over a real socket, a `ticketId` trailing a large
    // upload will not have been parsed when this line runs, and it is absent
    // rather than late.
    //
    // MEASURED, and not what the plan assumed: this is not an ORDERING
    // GUARANTEE the server enforces. When the whole request body is already in
    // memory — every `app.inject` test, and any small upload — busboy runs
    // ahead and a trailing `ticketId` IS visible here, so the upload succeeds.
    // The leniency is benign (the ticket is still resolved and still gated
    // before a byte is stored) but it means the ordering requirement is a
    // client contract this handler cannot answer 400 for reliably, and no test
    // in this repo can observe the difference through `inject`. Stated here so
    // nobody later writes the test that proves it and watches it flake.
    const rawTicketField = data.fields['ticketId'];
    const ticketField = Array.isArray(rawTicketField) ? rawTicketField[0] : rawTicketField;
    // `valueTruncated` is the flag `fieldSize` sets INSTEAD of erroring. Reading
    // `.value` without it is how a size decision fails invisibly: a 300-byte
    // `ticketId` would arrive as its first 256 bytes and be looked up as though
    // the client had sent that. The effect today is benign — no 256-character
    // string is a ULID, so it lands on the same 404 — but "benign because of a
    // fact two files away" is exactly the shape that stops being benign when
    // one of the two files changes. A truncated field is treated as no field.
    const ticketId =
      ticketField &&
      ticketField.type === 'field' &&
      typeof ticketField.value === 'string' &&
      !ticketField.valueTruncated
        ? ticketField.value
        : null;
    if (!ticketId) {
      discardUnreadFile(data.file);
      return reply.code(400).send({
        error: 'bad-request',
        reason: 'a "ticketId" field is required before the file part',
      });
    }

    // The ticket's OWN workspace, read from `proj_visibility` — the same table
    // `canSee` decides on. The plan text read `proj_tickets` for this, which
    // would put existence and permission on two different tables: a ticket
    // present in one and absent from the other would be answerable or deniable
    // depending on which query ran first.
    //
    // One TABLE, and — stated precisely, because the first draft of this
    // comment said "one source, one answer" and meant something stronger than
    // it delivered — two READS of it. `canSee` calls `getResolvedVisibility`
    // itself, so `visibility.workspaceId` below comes from this read while the
    // permission answer comes from that one. A projection rewriting the row
    // between them would file the object under the workspace of read #1 having
    // been permitted by read #2. Not a hole worth a transaction here, but Task
    // 10 copies this shape and should copy the caveat with it.
    const visibility = await getResolvedVisibility(deps.pool, ticketId);
    if (visibility === null || !(await canSee(deps.pool, request.currentUserId, ticketId))) {
      discardUnreadFile(data.file);
      return replyNotFound(reply);
    }

    const read = await readAtMost(data.file, maxBytes);
    if (!read.ok) {
      return reply.code(413).send({ error: 'payload-too-large', reason: read.reason });
    }

    const sniffed = await sniffAllowedMime(read.bytes);
    if (!sniffed.ok) {
      return reply.code(415).send({ error: 'unsupported-media-type', reason: sniffed.reason });
    }

    const attachmentId = newUlid();
    // ULID segments only: `assertValidObjectKey` inside every store re-checks
    // this, so a key is never trusted on the strength of where it was minted.
    const objectKey = `w/${visibility.workspaceId}/a/${attachmentId}`;
    const filename = sanitizeFilename(data.filename);

    // Bytes first, row second. The other order can leave a row pointing at an
    // object that does not exist, which reads to every later query as a file
    // the product has lost; this order can leave an object no row names, which
    // is invisible and collectable.
    await deps.store.put(objectKey, Readable.from(read.bytes), {
      mime: sniffed.mime,
      size: read.bytes.length,
    });
    await insertAttachment(deps.pool, {
      id: attachmentId,
      workspaceId: visibility.workspaceId,
      ticketId,
      uploaderId: request.currentUserId,
      filename,
      mime: sniffed.mime,
      size: read.bytes.length,
      objectKey,
    });

    return reply.code(201).send({
      attachmentId,
      url: `/v1/attachments/${attachmentId}`,
      mime: sniffed.mime,
      filename,
      size: read.bytes.length,
    });
  });
}
