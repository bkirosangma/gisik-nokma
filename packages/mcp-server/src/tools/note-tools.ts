import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { collectImageAttachmentIds, EMPTY_NOTE_DOC, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { spliceDoc, type BodyEdit } from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { bodyAsMarkdown, markdownBody, MARKDOWN_SYNTAX_HELP } from './markdown-io.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs } from './reads.js';
import { envelopeFor, submitBatch, submitOne } from './submit.js';

/** The `{ note }` of `GET /v1/notes/:id` (`routes/notes.ts`). */
export type NoteDetailWire = {
  noteId: string; workspaceId: string; homeProjectId: string; authorId: string; title: string; scope: unknown;
  attachedTickets: unknown[]; deleted: boolean; createdAt: string; updatedAt: string; body: unknown;
};
const NOT_FOUND = 'note not found or not visible to you';
const VERSION_NOT_FOUND = 'note version not found or not visible to you';
const DELETED_NOTE = 'This note is in Deleted items. Bring it back with restore_note first, then restore a version.';
const enc = encodeURIComponent;
const id = z.string().min(1);
const SCOPES = ['private', 'workspace', 'project', 'inherit', 'explicit'] as const;
type Scope = (typeof SCOPES)[number];
const mode = z.enum(['replace', 'append', 'replace_section']).optional();

/** One note, or the uniform "not found or not visible" for a 404 (a note you cannot read looks the same as one that is not there). */
export async function readNote(session: Session, noteId: string): Promise<NoteDetailWire> {
  try {
    return ((await session.get(`/v1/notes/${enc(noteId)}`)) as { note: NoteDetailWire }).note;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(NOT_FOUND);
    throw error;
  }
}

/**
 * The stored body of one LISTED version of a note, copied and never converted (MCP sweep 2 §4.1). The version must be in
 * the note's own history list (RV-2: an id of a rename event is not one); the body route answers 404 for a version born
 * without a body (`read/notes.ts:369`), and the document the reducer folds in for that version is the empty one
 * (`note-state.ts:139`), so that is what is restored (RV-3).
 */
async function versionBody(session: Session, noteId: string, versionId: string): Promise<unknown> {
  let listed: Array<{ eventId: string }>;
  try {
    listed = ((await session.get(`/v1/notes/${enc(noteId)}/history`)) as { versions: Array<{ eventId: string }> }).versions;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(NOT_FOUND);
    throw error;
  }
  if (!listed.some((version) => version.eventId === versionId)) throw new Error(VERSION_NOT_FOUND);
  try {
    return ((await session.get(`/v1/notes/${enc(noteId)}/history/${enc(versionId)}`)) as { body: unknown }).body;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return EMPTY_NOTE_DOC;
    throw error;
  }
}

function scopePayload(scope: Scope, userIds: string[] | undefined): Record<string, unknown> {
  if (scope !== 'explicit') return { mode: scope };
  if (userIds === undefined || userIds.length === 0) {
    throw new Error('scope "explicit" needs explicitUserIds (at least one person; find them with list_members)');
  }
  return { mode: 'explicit', userIds };
}

function edit(m: z.infer<typeof mode>, section: string | undefined): BodyEdit {
  if (m === 'replace_section') {
    if (section === undefined || section.trim() === '') throw new Error('mode "replace_section" needs `section`: the exact text of one heading');
    return { mode: 'replace_section', section };
  }
  return { mode: m ?? 'replace' };
}

export function noteTools(session: Session): ToolDefinition[] {
  const listShape = {
    workspaceId: id,
    projectId: z.string().optional(),
    authorId: id.optional(),
    scope: z.enum(SCOPES).optional(),
    include: z.array(z.enum(['deleted'])).optional(),
    ...pageArgs,
  };
  const createShape = {
    workspaceId: id, title: z.string().min(1).max(500), markdown: z.string().optional(), projectId: z.string().optional(),
    scope: z.enum(SCOPES).optional(), explicitUserIds: z.array(id).optional(), attachTicketId: id.optional(),
  };
  const updateShape = {
    noteId: id, title: z.string().min(1).max(500).optional(), markdown: z.string().optional(), mode, section: z.string().optional(),
    scope: z.enum(SCOPES).optional(), explicitUserIds: z.array(id).optional(), projectId: z.string().optional(),
  };
  const linkShape = { noteId: id, ticketId: id, action: z.enum(['attach', 'detach']) };
  const deleteShape = { noteId: id, confirm_name: z.string().optional() };
  const historyShape = { noteId: id, versionId: id.optional() };
  return [
    {
      name: 'list_notes',
      description:
        'The notes you can read in a workspace, newest first. Filter by projectId ("" = filed at workspace level), authorId ("me" for yours) ' +
        'or scope; include: ["deleted"] lists deleted notes you may restore instead. Pages with cursor/limit (default 50, max 200).',
      inputSchema: listShape,
      handler: async (args) => {
        const a = z.object(listShape).parse(args);
        const q = new URLSearchParams();
        if (a.projectId !== undefined) q.set('home', a.projectId);
        if (a.authorId !== undefined) q.set('author', a.authorId === 'me' ? session.userId() : a.authorId);
        if (a.scope !== undefined) q.set('scope', a.scope);
        if (a.include?.includes('deleted') === true) q.set('deleted', '1');
        const qs = q.toString();
        const { notes } = (await session.get(`/v1/workspaces/${enc(a.workspaceId)}/notes${qs === '' ? '' : `?${qs}`}`)) as { notes: unknown[] };
        const { items, nextCursor } = page(notes, a.cursor, a.limit);
        return { notes: items, nextCursor };
      },
    },
    {
      name: 'get_note',
      description:
        'Read one note: title, scope, where it is filed, attached tickets, the image attachments its body shows, and its body as Markdown ' +
        '(`lossy` names anything Markdown cannot show; replacing the whole body would drop it).',
      inputSchema: { noteId: id },
      handler: async (args) => {
        const note = await readNote(session, z.object({ noteId: id }).parse(args).noteId);
        const { body, ...meta } = note;
        return { ...meta, ...bodyAsMarkdown(body), images: collectImageAttachmentIds(body) };
      },
    },
    {
      name: 'create_note',
      description:
        'Create a note. projectId files it under a project ("" or absent = workspace level). scope: private (default), workspace, project, ' +
        'explicit (with explicitUserIds) or inherit (only with attachTicketId — it then follows that ticket\'s audience, and is the default ' +
        `when attachTicketId is given). ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: createShape,
      handler: async (args) => {
        const a = z.object(createShape).parse(args);
        const noteId = newUlid();
        const scope = scopePayload(a.scope ?? (a.attachTicketId === undefined ? 'private' : 'inherit'), a.explicitUserIds);
        const payload = {
          title: a.title,
          homeProjectId: a.projectId ?? '',
          scope,
          ...(a.markdown === undefined || a.markdown.trim() === '' ? {} : { body: await markdownBody(session, a.workspaceId, a.markdown) }),
          ...(a.attachTicketId === undefined ? {} : { attachTicketId: a.attachTicketId }),
        };
        const committed = await submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'note', id: noteId }, 'note.created', payload));
        return { noteId, ...(committed as object) };
      },
    },
    {
      name: 'update_note',
      description:
        'Change a note: title; body (markdown, with mode "replace" (default) the whole body, "append" to the end, or "replace_section" ' +
        'the content under the heading named in `section`, keeping everything else exactly); scope (+explicitUserIds); or projectId to move it. ' +
        `Only the author, an admin who can read it, or the owner can. ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: updateShape,
      handler: async (args) => {
        const a = z.object(updateShape).parse(args);
        if (a.title === undefined && a.markdown === undefined && a.scope === undefined && a.projectId === undefined) {
          throw new Error('update_note needs at least one of title, markdown, scope or projectId');
        }
        const note = await readNote(session, a.noteId);
        const entity = { kind: 'note' as const, id: a.noteId };
        const events: SubmittedEvent[] = [];
        let dropped: string[] = [];
        if (a.title !== undefined) events.push(envelopeFor(session, note.workspaceId, entity, 'note.renamed', { title: a.title }));
        if (a.markdown !== undefined) {
          const e = edit(a.mode, a.section);
          const incoming = await markdownBody(session, note.workspaceId, a.markdown);
          const spliced = spliceDoc(note.body, incoming, e);
          if ('problem' in spliced) throw new Error(spliced.problem);
          if (e.mode === 'replace') dropped = bodyAsMarkdown(note.body).lossy;
          events.push(envelopeFor(session, note.workspaceId, entity, 'note.body_set', { body: spliced.doc }));
        }
        if (a.scope !== undefined) events.push(envelopeFor(session, note.workspaceId, entity, 'note.scope_set', scopePayload(a.scope, a.explicitUserIds)));
        if (a.projectId !== undefined) events.push(envelopeFor(session, note.workspaceId, entity, 'note.moved', { homeProjectId: a.projectId }));
        const results = await submitBatch(session, events);
        return { results, ...(dropped.length === 0 ? {} : { dropped, note: 'The old body had these, which Markdown cannot carry; they are gone.' }) };
      },
    },
    {
      name: 'link_note',
      description: 'Attach a note to a ticket (action "attach") or detach it ("detach"). You must be able to see both, and the ticket must be in the note\'s workspace.',
      inputSchema: linkShape,
      handler: async (args) => {
        const a = z.object(linkShape).parse(args);
        const note = await readNote(session, a.noteId);
        return submitOne(
          session,
          envelopeFor(session, note.workspaceId, { kind: 'note', id: a.noteId }, a.action === 'attach' ? 'note.attached' : 'note.detached', { ticketId: a.ticketId }),
        );
      },
    },
    {
      name: 'delete_note',
      description:
        'Move a note to Deleted items (restorable for 15 days with restore_note — nothing is erased). confirm_name must be the note\'s exact ' +
        'current title; without it you get a preview and nothing changes.',
      inputSchema: deleteShape,
      handler: async (args) => {
        const a = z.object(deleteShape).parse(args);
        const note = await readNote(session, a.noteId);
        const preview = await confirmOrPreview(note.title, a.confirm_name, async () => ({
          sentence: `Moves the note "${note.title}" to Deleted items; it can be restored for 15 days.`,
        }));
        if (preview !== null) return preview;
        return submitOne(session, envelopeFor(session, note.workspaceId, { kind: 'note', id: a.noteId }, 'note.deleted', {}));
      },
    },
    {
      name: 'restore_note',
      description: 'Bring a deleted note back from Deleted items.',
      inputSchema: { noteId: id },
      handler: async (args) => {
        const { noteId } = z.object({ noteId: id }).parse(args);
        const note = await readNote(session, noteId);
        return submitOne(session, envelopeFor(session, note.workspaceId, { kind: 'note', id: noteId }, 'note.restored', {}));
      },
    },
    {
      name: 'restore_note_version',
      description:
        'Put an earlier saved version of a note back as its current body (versionId from get_note_history). The stored document is copied exactly, so ' +
        'nothing that Markdown cannot carry is lost; the version it replaces stays in the history, so a restore is undone by restoring that version. ' +
        'Only the note\'s author, an admin who can read it, or the owner can. A deleted note must be brought back with restore_note first. ' +
        'Mentions that the restored text adds notify those people.',
      inputSchema: { noteId: id, versionId: id },
      handler: async (args) => {
        const a = z.object({ noteId: id, versionId: id }).parse(args);
        const note = await readNote(session, a.noteId);
        if (note.deleted) throw new Error(DELETED_NOTE);
        const body = await versionBody(session, a.noteId, a.versionId);
        // Both sides are jsonb, so their key order agrees; `isDeepStrictEqual` does not rely on it.
        if (isDeepStrictEqual(body, note.body)) return { noteId: a.noteId, restoredFrom: a.versionId, restored: false, reason: 'already the current body' };
        const committed = await submitOne(session, envelopeFor(session, note.workspaceId, { kind: 'note', id: a.noteId }, 'note.body_set', { body }));
        return { noteId: a.noteId, restoredFrom: a.versionId, restored: true, ...(committed as object) };
      },
    },
    {
      name: 'get_note_history',
      description: 'A note\'s saved versions (who, when). With versionId, that version\'s body as Markdown.',
      inputSchema: historyShape,
      handler: async (args) => {
        const a = z.object(historyShape).parse(args);
        try {
          if (a.versionId === undefined) return await session.get(`/v1/notes/${enc(a.noteId)}/history`);
          const { body } = (await session.get(`/v1/notes/${enc(a.noteId)}/history/${enc(a.versionId)}`)) as { body: unknown };
          return { versionId: a.versionId, ...bodyAsMarkdown(body) };
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) throw new Error(a.versionId === undefined ? NOT_FOUND : VERSION_NOT_FOUND);
          throw error;
        }
      },
    },
  ];
}
