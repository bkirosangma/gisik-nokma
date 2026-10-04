import type { Readable as ReadableStream_ } from 'node:stream';
import { Readable } from 'node:stream';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { EMBEDDABLE_IMAGE_MIME, newUlid } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth.js';
import { makeRequireSession } from '../auth/require-session.js';
import { getResolvedVisibility } from '../visibility/can-see.js';
import { canOpen } from '../visibility/can-open.js';
import { canReadNoteById } from '../visibility/can-read-note.js';
import { getNoteStateFromDb } from '../projections/notes.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { ticketIsOpenable } from '../read/live-ticket.js';
import { getAttachment, insertAttachment } from '../attachments/attachment-repo.js';
import { sha256Hex } from '../attachments/content-hash.js';
import { sanitizeFilename } from '../attachments/filename.js';
import { readAtMost } from '../attachments/read-limited.js';
import { sniffAllowedMime } from '../attachments/sniff.js';
import { ObjectNotFoundError, type ObjectStore } from '../attachments/object-store.js';

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
 * The one 403 on this surface: a reader of a note who may not put a file into
 * it (notes series, spec §4.4).
 *
 * It is NOT the anonymous 404, and the asymmetry with the ticket branch above is
 * deliberate. A ticket's upload authority IS its read authority — a viewer who
 * can see a ticket may attach to it — so there the two questions collapse and
 * one answer serves both. A note's does not: the author writes, every reader
 * comments, and a reader asking to upload is making a legitimate request they
 * are not entitled to, which deserves to be told apart from "the note you are
 * looking at does not exist".
 *
 * A note that does not exist still gets `NOT_FOUND_BODY`: that half of the
 * oracle rule is unchanged, and it is why the 404 is checked BEFORE this.
 */
const NOTE_UPLOAD_FORBIDDEN_BODY = {
  error: 'forbidden',
  reason: 'Only the note’s author, an admin who can read it, or the workspace owner can add files to it.',
} as const;

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
 * that query plus `canOpen`: `canSee`, which re-runs `getResolvedVisibility` and
 * then `resolveEffectiveRole` (`visibility/can-see.ts`), and on its false answer
 * the draft head read of `isOpenableDraft` (drafts T9, G10; `visibility/can-open.ts`).
 * Four round-trips against one, and the asymmetry runs in the direction an
 * attacker would want: the real ticket is the slow one.
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
 *   5. ticket not openable (`canOpen`: not visible, and not the caller's own
 *      draft, drafts T9 G10), or not there → 404
 *   6. ticket SOFT-DELETED → 404, the SAME body as step 5 (added 2026-09-20)
 *   7. file over `maxBytes` → 413
 *   8. bytes not an accepted type → 415
 *
 * Steps 2–4 are listed because they DO precede the visibility 404 and an
 * earlier version of this note left them out, which made the order look like a
 * shorter list than the code has. None of them is an existence oracle: each is
 * decided on the shape of the request alone, before any ticket id is read from
 * a field or looked up, so the answer is identical for a ticket that exists,
 * one that does not, and one the caller may not see.
 *
 * ⚠ **Step 6 is a SECOND, DISTINCT 404 reason and was missing from this list
 * until 2026-09-20** — the tombstone guard, added after step 5 rather than
 * folded into it because it is a different question (`canOpen`, like the
 * `canSee` it asks first, is visibility and does not mean "not deleted"). It sits BELOW step 5 on purpose: a caller who
 * may not see the ticket must get step 5's answer whether or not the ticket is
 * also deleted, or the deleted-ness would be an inference they were never owed.
 * It is above steps 7 and 8 for the same reason step 5 is: a deleted ticket
 * must not become detectable by uploading rubbish to it.
 *
 * Steps 5 and 6 before steps 7 and 8 is the part that matters and must stay: if
 * size or sniff ran first, a guest could learn which ticket ids exist by
 * uploading rubbish to each and reading 415 (ticket real, file bad) against 404
 * (ticket not theirs). The oracle would be the refusal they got, not the one
 * they were meant to get. A refactor that reorders these lines re-opens that
 * channel, and `attachments-upload.test.ts` compares a guest's answer to a
 * nonexistent ticket's answer field by field to catch it, and separately sends
 * an invisible ticket a body that is over-size AND unsniffable so both of steps
 * 7 and 8 are pinned behind step 5 rather than only the one.
 *
 * ⚠ **The renumbering is the 2026-09-20 addition's second effect and it is
 * stated because a reader comparing this list to an older copy will find the
 * numbers moved.** What did NOT move is the property: the tombstone 404 sits
 * beside the visibility 404 in the same band, above every refusal that is
 * decided on the BYTES.
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

  const requireSession = makeRequireSession(deps.auth, deps.pool);

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
    // A field part's value, or `null` when it is absent, truncated or the wrong
    // shape. `valueTruncated` is the flag `fieldSize` sets INSTEAD of erroring.
    // Reading `.value` without it is how a size decision fails invisibly: a
    // 300-byte id would arrive as its first 256 bytes and be looked up as though
    // the client had sent that. The effect today is benign — no 256-character
    // string is a ULID, so it lands on the same 404 — but "benign because of a
    // fact two files away" is exactly the shape that stops being benign when one
    // of the two files changes. A truncated field is treated as no field.
    const fieldValue = (name: string): string | null => {
      const raw = data.fields[name];
      const part = Array.isArray(raw) ? raw[0] : raw;
      return part &&
        part.type === 'field' &&
        typeof part.value === 'string' &&
        !part.valueTruncated
        ? part.value
        : null;
    };
    const ticketId = fieldValue('ticketId');
    const noteId = fieldValue('noteId');

    // EXACTLY ONE owner (spec §4.4). Neither is 400 — the request names nothing
    // to file against — and BOTH is 400 rather than a silent preference, because
    // a client that sent both meant something this door cannot honour, and
    // choosing one would file their bytes under an owner they may not have
    // intended while answering 201. The message names the rule rather than the
    // field, since either field could be the one to remove.
    if ((ticketId === null) === (noteId === null)) {
      discardUnreadFile(data.file);
      return reply.code(400).send({
        error: 'bad-request',
        reason: 'exactly one of "ticketId" or "noteId" is required, before the file part',
      });
    }

    // The ticket's OWN workspace, read from `proj_visibility` — the same table
    // `canSee` decides on (`canOpen`'s first question, drafts T9 G10). The
    // plan text read `proj_tickets` for this, which would put existence and
    // permission on two different tables: a ticket
    // present in one and absent from the other would be answerable or deniable
    // depending on which query ran first.
    //
    // One TABLE, and — stated precisely, because the first draft of this
    // comment said "one source, one answer" and meant something stronger than
    // it delivered — two READS of it. `canOpen` asks `canSee`, which calls
    // `getResolvedVisibility` itself, so `visibility.workspaceId` below comes from this read while the
    // permission answer comes from that one. A projection rewriting the row
    // between them would file the object under the workspace of read #1 having
    // been permitted by read #2. Not a hole worth a transaction here, but Task
    // 10 copies this shape and should copy the caveat with it.
    // THE OWNER'S WORKSPACE, and who may put a file into it. Two branches, one
    // per owner kind, and both end with `workspaceId` settled so everything
    // below this point is owner-agnostic.
    let workspaceId: string;
    if (ticketId !== null) {
      const visibility = await getResolvedVisibility(deps.pool, ticketId);
      // G10 (drafts spec R56): `canOpen`, not `canSee`. The author of a draft may upload to it; everyone else gets the
      // not-found answer an unknown ticket gets.
      if (visibility === null || !(await canOpen(deps.pool, request.currentUserId, ticketId))) {
        discardUnreadFile(data.file);
        return replyNotFound(reply);
      }

      // A TOMBSTONED ticket takes no new files, and this is the door where the
      // refusal matters most: the read doors DISCLOSE, this one lets content
      // ACCRETE onto a ticket the product has removed from every view. `canOpen`
      // above cannot answer it — the visibility predicate deliberately does not
      // mean "not deleted" (`read/visible-where.ts`) — so the rule is asked
      // separately, in its one spelling.
      //
      // `discardUnreadFile` runs on this path for the same reason as the refusal
      // above it: the multipart file stream must be drained or destroyed before
      // a handler returns, or the request is left holding a part nobody reads.
      if (!(await ticketIsOpenable(deps.pool, visibility.workspaceId, ticketId))) {
        discardUnreadFile(data.file);
        return replyNotFound(reply);
      }
      workspaceId = visibility.workspaceId;
    } else {
      // `noteId !== null` is guaranteed by the exactly-one check above, and this
      // is written as a non-null assertion ONLY because that check is four lines
      // up in the same function; a helper would be the honest fix if a third
      // owner kind ever lands.
      const note = await getNoteStateFromDb(deps.pool, noteId!);
      // 404 for a note that does not exist — the SAME anonymous answer the
      // ticket branch gives, and for the same reason: an upload door that told
      // a stranger "that note exists but is not yours" would be an existence
      // oracle over the whole workspace.
      if (note === null) {
        discardUnreadFile(data.file);
        return replyNotFound(reply);
      }
      const eff = await resolveEffectiveRole(deps.pool, request.currentUserId, note.workspaceId);
      // AUTHOR, ADMIN-READER, OR OWNER (spec §4.4) — and MEMBERSHIP first, on
      // top of the plan's expression. `note.authorId === userId` alone would
      // admit an author who has since been REMOVED from the workspace, and
      // `canReadNote`'s own first rule is that a non-member reads nothing; this
      // door's authority may not be wider than the reader predicate's.
      const isMember = eff.workspaceRole !== null;
      const isAuthor = note.authorId === request.currentUserId;
      const isOwner = eff.workspaceRole === 'owner';
      const isAdminReader =
        eff.workspaceRole === 'admin' && (await canReadNoteById(deps.pool, request.currentUserId, noteId!));
      if (!isMember || !(isAuthor || isOwner || isAdminReader)) {
        discardUnreadFile(data.file);
        // 403 and NOT the anonymous 404 the ticket branch gives, and the
        // difference is deliberate rather than an inconsistency: a note's
        // upload authority is the author's, so the person asking is often a
        // reader who simply may not write here — and telling a reader "that
        // note does not exist" while they are looking at it would be a lie the
        // ticket branch never has to tell, because there a readable ticket is
        // an uploadable one.
        return reply.code(403).send(NOTE_UPLOAD_FORBIDDEN_BODY);
      }
      workspaceId = note.workspaceId;
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
    const objectKey = `w/${workspaceId}/a/${attachmentId}`;
    const filename = sanitizeFilename(data.filename);

    // Hash the exact buffer that is about to be stored — not the client's
    // claim about it, and not a re-read (a re-read could hash something else).
    const sha256 = sha256Hex(read.bytes);

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
      workspaceId,
      // The exactly-one check above guarantees one of these is a string; the
      // other is spelled NULL rather than left absent, so the row cannot carry
      // an undefined through a parameter array.
      ...(ticketId !== null ? { ticketId, noteId: null } : { ticketId: null, noteId: noteId! }),
      uploaderId: request.currentUserId,
      filename,
      mime: sniffed.mime,
      size: read.bytes.length,
      objectKey,
      sha256,
    });

    return reply.code(201).send({
      attachmentId,
      url: `/v1/attachments/${attachmentId}`,
      mime: sniffed.mime,
      filename,
      size: read.bytes.length,
      sha256,
    });
  });

  /**
   * The download door: bytes leave here, and `canOpen` on the OWNING TICKET
   * decides who gets to ask for them at all (drafts T9, G10: a reader `canSee`
   * admits, or the author of a draft).
   *
   * ## Same 404, three different reasons, deliberately
   *
   * This is the highest-risk handler in the step: the property is BYTE
   * IDENTITY between "this does not exist" and "you may not see it", and that
   * property has already produced disclosure rulings on this project (P19,
   * P22, P23) that no `status === 404` assertion caught, because a status code
   * alone does not test byte-identity — a route that 404s everything passes
   * that assertion too. `replyNotFound` is the same shared function the POST
   * handler above uses, which is what keeps the two doors' 404s from drifting
   * into two different shapes over time; see its docblock for the fuller
   * argument and its stated timing caveat, which this handler inherits
   * unchanged (this lookup costs one query more than the nonexistent-id path,
   * same direction, same "recorded not fixed" status).
   *
   * FOUR cases collapse into it:
   *
   *   (a) the row exists but its ticket is invisible to this viewer — `canOpen`
   *       returns false;
   *   (b) the id names no row at all — `getAttachment` returns null;
   *   (c) the row exists, `canOpen` passes, but the OBJECT is gone from the
   *       store — `store.getStream` throws `ObjectNotFoundError`;
   *   (d) the row exists and `canOpen` passes, but its TICKET is soft-deleted —
   *       `ticketIsOpenable` returns false. This is the case the door was missing
   *       until 2026-09-20, and it is the sharpest of the four: what leaves is
   *       the file itself, so a 200 here is not a hint of a leak but the whole
   *       content, on a ticket whose own detail route already answers 404.
   *
   * (a), (b) and (d) must be indistinguishable by construction: all three reach
   * `replyNotFound` having added nothing case-specific to the response. (d) is
   * the ticket's rule and not this row's — the lookup resolves through
   * `row.ticketId` — which is why it is asked here at all: an attachment id is
   * addressed on its own, so a caller holding a URL from before the delete
   * never passes a ticket-scoped route.
   *
   * (c) is NOT a visibility refusal — a caller who can see the ticket asking
   * for a real attachment id has done nothing wrong; the product has simply
   * lost the bytes it promised. It would be defensible to answer that
   * differently (a 500, or a distinct body naming the inconsistency) to the
   * viewer who is allowed to know it. This handler does not: it logs the
   * inconsistency loudly server-side (`request.log.error`, with the
   * attachment id and object key an operator needs) and answers the caller
   * the same anonymous 404 as (a) and (b). Two reasons, stated:
   *
   *   - A distinct answer here is one more bit of information leaking through
   *     an attachment id than the rest of this door leaks through a ticket
   *     id, for a caller who is not the one who can fix it (the object store
   *     is broken; the requesting browser cannot repair that).
   *   - Folding it into `replyNotFound` costs nothing extra to test: the same
   *     "compare full response to a known-nonexistent id" assertion this
   *     file's test suite already runs for (a) vs (b) covers (c) for free,
   *     rather than needing a fourth response shape to reason about.
   *
   * `attachments-download.test.ts` proves (a)≡(b) with a positive control
   * ahead of both, and separately proves (c)≡(b) — see its docblock for why
   * this is a DECISION rather than a default.
   *
   * ## Headers set only on the path that already knows the object exists
   *
   * `content-type`, `content-length`, `content-disposition` and
   * `x-content-type-options` are set AFTER the `getStream` call succeeds —
   * never before. Setting `content-type` from `row.mime` earlier (it is read
   * from the database row before the store call) would leak the stored mime
   * on a case-(c) 404 even though the bytes it describes do not exist.
   *
   * What the test suite actually proves, precisely, not "all four headers
   * vanish": MEASURED against Fastify 5.12.1 with this route's exact 404
   * shape (`reply.code(404).send({error:'not-found'})`), `content-type` and
   * `content-length` are never absent on a 404 — Fastify itself sets them
   * from the JSON body (`application/json; charset=utf-8`, `21`), and the
   * test suite asserts that fixed VALUE, not absence, for `content-type`.
   * `content-disposition` and `x-content-type-options` are the two headers
   * this handler itself only ever adds after `getStream` succeeds, so those
   * two are the ones the suite asserts are entirely absent on every 404 —
   * explicitly, for all three cases (a), (b) and (c).
   *
   * ⚠ **That assertion is a reading of the ROUTE-ISOLATED app, and it does not
   * hold of the assembled one** — measured 2026-09-20 while adding case (d).
   * `http/security-headers.ts:51` sets `x-content-type-options: nosniff` on
   * EVERY response the shipped app makes, so in a test built on
   * `buildTestApp` that header is present on this door's 404 too and says
   * nothing about this handler. `content-disposition` is the one header whose
   * absence is evidence about the handler in either environment. A gate result
   * is not evidence unless it names its environment — the same rule this repo
   * applies to the Node version.
   */
  app.get('/v1/attachments/:id', { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getAttachment(deps.pool, id);
    if (!row) return replyNotFound(reply);
    // THE OWNER DECIDES WHO MAY ASK, and the two kinds ask different questions.
    // A ticket-owned attachment is authorised by `canOpen` on its ticket, plus
    // the tombstone guard below; a note-owned one by `canReadNoteById`, which
    // is the ONE reader predicate every other note read goes through. Nothing
    // here is a second spelling of either rule.
    if (row.noteId !== null) {
      if (!(await canReadNoteById(deps.pool, request.currentUserId, row.noteId))) {
        return replyNotFound(reply);
      }
    } else if (row.ticketId !== null) {
      if (!(await canOpen(deps.pool, request.currentUserId, row.ticketId))) {
        return replyNotFound(reply);
      }
      // The ticket this attachment belongs to is ASKED FOR BY ID — a caller who
      // already holds a URL from before the delete reaches this door without
      // passing any ticket-scoped route — so the guard has to be asked here as
      // well as at the list door. It IS the ticket's rule: the lookup resolves
      // through `row.ticketId`, and the tombstone makes the bytes leave nothing,
      // exactly as the ticket's own detail route refuses its name.
      if (!(await ticketIsOpenable(deps.pool, row.workspaceId, row.ticketId))) {
        return replyNotFound(reply);
      }
    } else {
      // Unreachable through any door — `attachments_one_owner_check` refuses a
      // row owned by neither — and answered as the anonymous 404 rather than
      // thrown, so a hand-edited row cannot turn a download into a 500 that
      // names the row's shape to the caller. That the branch is unreachable is
      // the point: it costs one comparison and removes the only way this
      // handler could dereference a null owner.
      return replyNotFound(reply);
    }

    let stream: ReadableStream_;
    try {
      stream = await deps.store.getStream(row.objectKey);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        // Metadata without bytes is an internal inconsistency: log the
        // detail loudly here, answer the same anonymous 404 out there
        // (CODING_STANDARDS: detailed internally, generic externally).
        request.log.error(
          { attachmentId: id, objectKey: row.objectKey },
          'attachment bytes missing from object store',
        );
        return replyNotFound(reply);
      }
      throw err;
    }

    const disposition = EMBEDDABLE_IMAGE_MIME.has(row.mime)
      ? 'inline'
      : `attachment; filename="${sanitizeFilename(row.filename)}"`;
    return reply
      .header('content-type', row.mime)
      .header('content-length', String(row.size))
      .header('content-disposition', disposition)
      .header('x-content-type-options', 'nosniff')
      .send(stream);
  });
}
