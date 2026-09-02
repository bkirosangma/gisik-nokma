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
 * half; the half that matters is that no refusal above adds a header, a
 * reason, or a timing difference the other does not have — which is why the
 * visibility check runs before anything that could vary (see the refusal-order
 * note on the handler).
 */
function replyNotFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send(NOT_FOUND_BODY);
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
 * ## The size limit is enforced during the stream
 *
 * `readAtMost` refuses at the byte that crosses the ceiling and tears the
 * source down there; nothing beyond `maxBytes` is ever pulled. `@fastify/
 * multipart`'s own `limits.fileSize` is deliberately NOT configured, because
 * two limits at the same threshold means one of them can never fire and a
 * defect planted in it would survive unnoticed. See `read-limited.ts` for the
 * full argument and the test that measures the claim.
 *
 * ## Refusal ORDER is load-bearing, not incidental
 *
 * Session → ticket named → ticket visible → size → sniff. The visibility 404
 * comes before every refusal that depends on the FILE, and it must stay there:
 * if size or sniff ran first, a guest could learn which ticket ids exist by
 * uploading rubbish to each and reading 415 (ticket real, file bad) against
 * 404 (ticket not theirs). The oracle would be the refusal they got, not the
 * one they were meant to get. A refactor that reorders these lines re-opens
 * that channel, and `attachments-upload.test.ts` compares a guest's answer to
 * a nonexistent ticket's answer field by field to catch it.
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

  // No `fileSize` here on purpose — see the size-limit note above. The other
  // limits are hygiene against an unbounded field: busboy buffers field VALUES
  // whole, so an uncapped `fieldSize` is a memory hole that no file limit
  // covers.
  await app.register(multipart, {
    limits: { files: 1, fields: 4, fieldSize: 256, parts: 8 },
  });

  const requireSession = makeRequireSession(deps.auth);

  app.post('/v1/attachments', { preHandler: requireSession }, async (request, reply) => {
    const data = await request.file();
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
    const ticketId =
      ticketField && ticketField.type === 'field' && typeof ticketField.value === 'string'
        ? ticketField.value
        : null;
    if (!ticketId) {
      discardUnreadFile(data.file);
      return reply.code(400).send({
        error: 'bad-request',
        reason: 'a "ticketId" field is required before the file part',
      });
    }

    // The ticket's OWN workspace, read from `proj_visibility` — the same row
    // `canSee` decides on. The plan text read `proj_tickets` for this, which
    // would put existence and permission on two different tables: a ticket
    // present in one and absent from the other would be answerable or
    // deniable depending on which query ran first. One source, one answer.
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
