import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { getAttachment } from '../../src/attachments/attachment-repo.js';
import { registerAttachmentRoutes } from '../../src/routes/attachments.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { applyAll, seedMember, seedProject, seedTicket } from '../helpers/seed.js';
import { notesProjection } from '../../src/projections/notes.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Note-owned file attachments (notes series, Plan 1 of 6, spec §4.4).
 *
 * ## What is different about a note's door, stated before the cases
 *
 * A TICKET's upload authority IS its read authority — a viewer who can see a
 * ticket may attach to it — so the ticket branch answers one question and hides
 * both failures behind one anonymous 404. A NOTE's does not: the author writes,
 * every reader reads, and a reader asking to upload is making a legitimate
 * request they are not entitled to. So this door has TWO refusals where the
 * ticket door has one, and the cases below pin both shapes:
 *
 * - a note that does not exist → the anonymous 404, the SAME body the ticket
 *   branch gives (the oracle rule, unchanged);
 * - a note that exists and this person READS but may not write → 403 with a
 *   sentence naming who may. Telling a reader "that note does not exist" while
 *   they are looking at it would be a lie the ticket branch never has to tell.
 *
 * ## Real sessions and a real object store, as the sibling upload file does
 *
 * `createAuth` + `signInWithPhone`, and a `LocalDiskStore` on a temp directory,
 * so "the bytes landed" is a claim about a file rather than about a mock. The
 * note rows are seeded through the LEDGER — `appendTestEvent` writes the event
 * and `notesProjection` folds it — rather than by inserting into `proj_notes`:
 * the authorisation under test reads the projection, and a fixture that wrote
 * the row directly would be asserting against its own SQL.
 *
 * ⚠ **`applyAll` is NOT used for them, and that cost a full red run.**
 * `helpers/seed.ts`'s `applyAll` folds exactly FOUR projections — projects,
 * memberships, invites, visibility — and a projection silently ignores the event
 * types it does not handle, so a `note.created` handed to it goes nowhere and
 * reports nothing. Seeding through it left `proj_notes` empty, and every note
 * upload answered the anonymous 404 with the fixture looking correct. Its own
 * docblock forbids widening it, for a measured reason, so this file applies
 * `notesProjection` to its own event.
 */

const WS = newUlid();
const PRJ = newUlid();

/** Real magic bytes: a 16-byte png prefix is enough for `file-type`. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function multipartBody(parts: Array<{ name: string; value?: string; filename?: string; data?: Buffer }>): {
  payload: Buffer;
  headers: Record<string, string>;
} {
  const boundary = 'gisik-note-owner-boundary';
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `content-disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `content-type: application/octet-stream\r\n\r\n`,
        ),
      );
      chunks.push(part.data ?? Buffer.alloc(0));
    } else {
      chunks.push(Buffer.from(`content-disposition: form-data; name="${part.name}"\r\n\r\n`));
      chunks.push(Buffer.from(part.value ?? ''));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

let db: TestDatabase;
let app: FastifyInstance;
let storeRoot: string;
let authorToken = '';
let authorId = '';
let readerToken = '';
let readerId = '';
let ticketId = '';
let privateNoteId = '';
/** A workspace-scope note, readable by both people — the 18.040 positive control. */
let sharedNoteId = '';

async function upload(
  token: string,
  owner: { ticketId?: string; noteId?: string } | { both: true } | { neither: true },
) {
  const fields: Array<{ name: string; value: string }> = [];
  if (!('both' in owner) && !('neither' in owner)) {
    if (owner.ticketId !== undefined) fields.push({ name: 'ticketId', value: owner.ticketId });
    if (owner.noteId !== undefined) fields.push({ name: 'noteId', value: owner.noteId });
  }
  if ('both' in owner) {
    fields.push({ name: 'ticketId', value: ticketId }, { name: 'noteId', value: privateNoteId });
  }
  const { payload, headers } = multipartBody([
    ...fields,
    // The file part LAST, so a field is present when the handler reads it — the
    // published ordering contract, and the shape `inject` can always satisfy.
    { name: 'file', filename: 'receipt.png', data: PNG },
  ]);
  return app.inject({
    method: 'POST',
    url: '/v1/attachments',
    headers: { ...headers, authorization: `Bearer ${token}` },
    payload,
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  storeRoot = await mkdtemp(join(tmpdir(), 'gisik-note-owner-'));
  const store = new LocalDiskStore(storeRoot);

  const otp = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
    webOrigin: 'http://localhost:3001',
  });

  app = Fastify();
  registerAuthRoutes(app, auth);
  await registerAttachmentRoutes(app, { pool: db.pool, store, auth });
  await app.ready();

  const author = await signInWithPhone(app, otp, '+919000000201');
  const reader = await signInWithPhone(app, otp, '+919000000202');
  authorId = author.userId;
  authorToken = author.token;
  readerId = reader.userId;
  readerToken = reader.token;

  await seedProject(db.pool, WS, PRJ);
  await seedMember(db.pool, WS, authorId, 'member', [{ projectId: PRJ }]);
  await seedMember(db.pool, WS, readerId, 'member', [{ projectId: PRJ }]);
  ticketId = newUlid();
  await seedTicket(db.pool, { workspaceId: WS, projectId: PRJ, ticketId });

  privateNoteId = newUlid();
  sharedNoteId = newUlid();
  const client = await db.pool.connect();
  try {
    for (const [id, title, mode] of [
      [privateNoteId, 'Private note', 'private'],
      [sharedNoteId, 'Shared note', 'workspace'],
    ] as const) {
      const env = testEnvelope({
        workspaceId: WS,
        entity: { kind: 'note', id },
        type: 'note.created',
        payload: { title, homeProjectId: PRJ, scope: { mode } },
        actorId: authorId,
      });
      await appendTestEvent(db.pool, env);
      // `notesProjection` APPLIED BY HAND, and the reason is `applyAll`'s own
      // docblock: that helper folds exactly FOUR projections — projects,
      // memberships, invites, visibility — and a projection silently ignores
      // the event types it does not handle, so a `note.created` handed to it
      // goes nowhere and reports nothing. This cost a full red run: every note
      // upload answered the anonymous 404 because `proj_notes` was empty and
      // `getNoteStateFromDb` said the note did not exist. The projection is
      // applied to its OWN event here rather than by widening `applyAll`, which
      // its docblock forbids for a measured reason.
      await notesProjection.apply(env, client);
    }
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await app.close();
  await rm(storeRoot, { recursive: true, force: true });
  await db.drop();
});

describe('18.039 uploading into a note', () => {
  it('18.039 the author uploads; a reader who cannot write is 403; a ticket upload is unchanged', async () => {
    // CONTROL FIRST: the ticket path still works, so the two refusals below are
    // about the note branch and not about this door having stopped working.
    const onTicket = await upload(readerToken, { ticketId });
    expect(onTicket.statusCode, onTicket.body).toBe(201);

    // THE AUTHOR may put a file into their own private note.
    const byAuthor = await upload(authorToken, { noteId: privateNoteId });
    expect(byAuthor.statusCode, byAuthor.body).toBe(201);
    const attachmentId = (byAuthor.json() as { attachmentId: string }).attachmentId;

    // The row is owned by the NOTE and by nothing else. Asserted on the ROW
    // rather than through a reader, because the write half and the read half are
    // separate failures and this is the one the upload door decides.
    const row = await getAttachment(db.pool, attachmentId);
    expect(row).not.toBeNull();
    expect(row?.noteId).toBe(privateNoteId);
    expect(row?.ticketId).toBeNull();

    // A READER of the workspace on the same project, who cannot read THIS note
    // (it is private) and therefore certainly cannot write to it.
    const byReader = await upload(readerToken, { noteId: privateNoteId });
    expect(byReader.statusCode, byReader.body).toBe(403);
    expect(byReader.json()).toEqual({
      error: 'forbidden',
      reason: 'Only the note’s author, an admin who can read it, or the workspace owner can add files to it.',
    });

    // AND the 404 half of the same branch is unchanged: a note that does not
    // exist answers the anonymous body, NOT the 403 — or the difference between
    // "no such note" and "not yours to write" would be an existence oracle.
    const absent = await upload(authorToken, { noteId: newUlid() });
    expect(absent.statusCode).toBe(404);
    expect(absent.json()).toEqual({ error: 'not-found' });
  });
});

describe('18.040 downloading a note-owned file', () => {
  it('18.040 a reader gets 200, a non-reader gets the same 404 an unknown id gets', async () => {
    // On the SHARED note, so the reader is a genuine reader rather than the
    // author again — the point of the case is that the DOWNLOAD predicate is
    // `canReadNoteById` and not "uploaded by me".
    const uploaded = await upload(authorToken, { noteId: sharedNoteId });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const { attachmentId } = uploaded.json() as { attachmentId: string };

    const asReader = await app.inject({
      method: 'GET',
      url: `/v1/attachments/${attachmentId}`,
      headers: { authorization: `Bearer ${readerToken}` },
    });
    expect(asReader.statusCode).toBe(200);
    expect(asReader.rawPayload.equals(PNG)).toBe(true);

    // A different private note, uploaded by the author, downloaded by the
    // reader: refused, and byte-identically to an id that names nothing.
    const privateUpload = await upload(authorToken, { noteId: privateNoteId });
    const privateAttachmentId = (privateUpload.json() as { attachmentId: string }).attachmentId;
    const refused = await app.inject({
      method: 'GET',
      url: `/v1/attachments/${privateAttachmentId}`,
      headers: { authorization: `Bearer ${readerToken}` },
    });
    const unknown = await app.inject({
      method: 'GET',
      url: `/v1/attachments/${newUlid()}`,
      headers: { authorization: `Bearer ${readerToken}` },
    });
    expect([refused.statusCode, unknown.statusCode]).toEqual([404, 404]);
    expect(refused.body).toBe(unknown.body);
    // The header the handler itself only ever adds on a SUCCESSFUL stream — the
    // one that means something about the handler, per the download door's own
    // docblock (in the assembled app `x-content-type-options` is on every
    // response, so its absence is not evidence here).
    expect(refused.headers['content-disposition']).toBeUndefined();

    // CONTROL: the author, reading the same attachment, gets 200 — so the 404
    // above is the predicate answering and not the file having gone missing.
    const asAuthor = await app.inject({
      method: 'GET',
      url: `/v1/attachments/${privateAttachmentId}`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    expect(asAuthor.statusCode).toBe(200);
  });
});

describe('18.041 exactly one owner', () => {
  it('18.041 both owners, or neither, is 400', async () => {
    const both = await upload(authorToken, { both: true });
    expect(both.statusCode).toBe(400);
    expect(both.json()).toEqual({
      error: 'bad-request',
      reason: 'exactly one of "ticketId" or "noteId" is required, before the file part',
    });
    const neither = await upload(authorToken, { neither: true });
    expect(neither.statusCode).toBe(400);
    expect(neither.json()).toEqual({
      error: 'bad-request',
      reason: 'exactly one of "ticketId" or "noteId" is required, before the file part',
    });
    // CONTROL: each owner ALONE is 201, from the same caller in the same run, so
    // the two 400s above are the pair rule and not the fields being unusable.
    expect((await upload(authorToken, { ticketId })).statusCode).toBe(201);
    expect((await upload(authorToken, { noteId: sharedNoteId })).statusCode).toBe(201);
  });
});
