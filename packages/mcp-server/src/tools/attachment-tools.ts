import { z } from 'zod';
import { collectImageAttachmentIds, isEmbeddableImageMime } from '@gisik-nokma/domain';
import { spliceDoc, type DocJson } from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { parentOf } from './markdown-io.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs, readOrNotFound } from './reads.js';
import { ToolReply } from './reply.js';
import { envelopeFor, submitOne } from './submit.js';

/** 10 MiB per call (M-E5); the product's own limit stays 25 MiB (`apps/server/src/routes/attachments.ts`). */
export const MCP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** The longest base64 string that can decode to the limit: checked BEFORE decoding, so no huge buffer is allocated. */
export const MAX_BASE64_CHARS = 4 * Math.ceil(MCP_ATTACHMENT_MAX_BYTES / 3);
const TOO_BIG = 'This file is over the 10 MB an assistant can send in one call (the app itself takes up to 25 MB). Attach it in the app instead.';
const IMAGE_NAME = /\.(png|jpe?g|gif|webp)$/i;
const NOTE_IMAGES_ONLY = 'A note holds images only, shown in its body. Attach other files to a ticket.';
const id = z.string().min(1);
const fileArg = z.object({ name: z.string().min(1).max(255), base64: z.string().min(1) });
const enc = encodeURIComponent;

function decode(base64: string): Uint8Array {
  if (base64.length > MAX_BASE64_CHARS) throw new Error(TOO_BIG);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) throw new Error('file.base64 is not valid base64');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MCP_ATTACHMENT_MAX_BYTES) throw new Error(TOO_BIG);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

type Uploaded = { attachmentId: string; mime: string; filename: string; size: number; sha256: string };

/**
 * `POST /v1/attachments` with the owner field FIRST (the route's published contract), the refusal in the server's
 * own words: its `{ error, reason }` body, and a 404 as the one not-found sentence.
 */
async function upload(session: Session, parent: { kind: 'ticket' | 'note'; id: string }, name: string, bytes: Uint8Array): Promise<Uploaded> {
  try {
    return (await session.postMultipart('/v1/attachments', { [parent.kind === 'ticket' ? 'ticketId' : 'noteId']: parent.id }, { name, bytes })) as Uploaded;
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.status === 404) throw new Error(`${parent.kind} not found or not visible to you`);
    const b = (error.body ?? {}) as { error?: unknown; reason?: unknown };
    if (typeof b.reason === 'string') throw new Error(typeof b.error === 'string' ? `${b.error}: ${b.reason}` : b.reason);
    throw error;
  }
}

const addShape = { workspaceId: id, ticketId: id.optional(), noteId: id.optional(), file: fileArg };
const listShape = { workspaceId: id, ticketId: id.optional(), noteId: id.optional(), ...pageArgs };

export function attachmentTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_attachments',
      description: "A ticket's files (ticketId), or the images in a note's body (noteId) — a note's files are the images it shows.",
      inputSchema: listShape,
      handler: async (args) => {
        const a = z.object(listShape).parse(args);
        const parent = parentOf(a, 'list_attachments');
        if (parent.kind === 'ticket') {
          const path = `/v1/workspaces/${enc(a.workspaceId)}/tickets/${enc(parent.id)}/attachments`;
          const { attachments } = (await readOrNotFound(session, path, 'ticket')) as { attachments: unknown[] };
          const { items, nextCursor } = page(attachments, a.cursor, a.limit);
          return { attachments: items, nextCursor };
        }
        const { note } = (await readOrNotFound(session, `/v1/notes/${enc(parent.id)}`, 'note')) as { note: { body: unknown } };
        const { items, nextCursor } = page(collectImageAttachmentIds(note.body).map((attachmentId) => ({ attachmentId })), a.cursor, a.limit);
        return { images: items, nextCursor, note: "A note's files are the images in its body." };
      },
    },
    {
      name: 'get_attachment',
      description: 'Read one attachment, up to 10 MB: a text file as text, an image as an image, anything else as its name, type and size with a note to open it in the app.',
      inputSchema: { attachmentId: id },
      handler: async (args) => {
        const { attachmentId } = z.object({ attachmentId: id }).parse(args);
        let got;
        try {
          got = await session.getBytes(`/v1/attachments/${enc(attachmentId)}`);
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) throw new Error('attachment not found or not visible to you');
          throw error;
        }
        const meta = { attachmentId, filename: got.filename, mime: got.contentType, size: got.bytes.length };
        if (got.bytes.length > MCP_ATTACHMENT_MAX_BYTES) return { ...meta, note: 'This file is over 10 MB; open it in the app.' };
        if (got.contentType.startsWith('text/')) return { ...meta, text: new TextDecoder().decode(got.bytes) };
        if (got.contentType.startsWith('image/')) {
          return new ToolReply([
            { type: 'text', text: JSON.stringify(meta) },
            { type: 'image', data: Buffer.from(got.bytes).toString('base64'), mimeType: got.contentType },
          ]);
        }
        return { ...meta, note: 'This kind of file cannot be shown here; open it in the app.' };
      },
    },
    {
      name: 'add_attachment',
      description:
        'Attach a file you have, as base64, to a ticket (ticketId) or — images only — to a note (noteId), where it is added to the end of the body. ' +
        'At most 10 MB per call. The server reads the file to decide its type. To share a link, write it in a comment or note as Markdown instead.',
      inputSchema: addShape,
      handler: async (args) => {
        const a = z.object(addShape).parse(args);
        const parent = parentOf(a, 'add_attachment');
        if (parent.kind === 'note' && !IMAGE_NAME.test(a.file.name)) throw new Error(NOTE_IMAGES_ONLY);
        const bytes = decode(a.file.base64);
        const up = await upload(session, parent, a.file.name, bytes);
        if (parent.kind === 'ticket') {
          return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'attachment.added', {
            kind: 'upload', attachmentId: up.attachmentId, filename: up.filename, mime: up.mime, size: up.size, sha256: up.sha256,
          }));
        }
        // The SNIFFED type decides: a `.png` that is a PDF is refused here. The uploaded object stays an orphan no row
        // names — the route's own documented residue.
        if (!isEmbeddableImageMime(up.mime)) throw new Error(NOTE_IMAGES_ONLY);
        const { note } = (await readOrNotFound(session, `/v1/notes/${enc(parent.id)}`, 'note')) as { note: { workspaceId: string; body: unknown } };
        const image: DocJson = { type: 'doc', content: [{ type: 'image', attrs: { attachmentId: up.attachmentId, wrap: 'block', alt: up.filename } }] };
        const spliced = spliceDoc(note.body, image, { mode: 'append' });
        if ('problem' in spliced) throw new Error(spliced.problem);
        return submitOne(session, envelopeFor(session, note.workspaceId, parent, 'note.body_set', { body: spliced.doc }));
      },
    },
  ];
}
