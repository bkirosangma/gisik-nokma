import type { EventEnvelope } from './envelope.js';
import {
  noteAttachedPayload,
  noteBodySetPayload,
  noteCreatedPayload,
  noteDetachedPayload,
  noteMovedPayload,
  noteRenamedPayload,
  noteScopeSetPayload,
} from './events/note-events.js';

/**
 * The note reducer (notes series, Plan 1 of 6, spec §3.3).
 *
 * One pure function folds the whole note vocabulary, and BOTH the server's
 * projection and the client's replica call it. That is the same arrangement
 * `applyTicketEvent` has, and for the same reason: a note's head row on the
 * server and a note's local row on a device must be the same function of the
 * same events, or two people reading "the same" note read different things.
 *
 * ## Refusals are throws, and that is the contract
 *
 * Every precondition in the table below throws an `Error` naming the event type
 * and the reason. The server's submission path turns a reducer throw into a
 * rejected event, and a client runs the reducer BEFORE enqueueing, so a
 * client-reachable illegal transition never reaches the ledger. A refusal here
 * is therefore not a validation a caller may skip: it is the only statement of
 * the rule, and the write path is built to consume it.
 *
 * ## What is NOT here
 *
 * Everything that needs the database. Does the ticket in `attachTicketId`
 * exist, is it in this workspace, is it deleted; does the project in
 * `homeProjectId` exist and is it un-archived — spec §3.3 lists them as
 * server-only, and they live in `checkNotePermission` (Plan 1 Task 5) because a
 * pure fold cannot ask them. The reducer's own preconditions are exactly the
 * ones answerable from the state it was handed.
 */
export const NOTE_SCOPE_MODES = ['private', 'workspace', 'project', 'inherit', 'explicit'] as const;
export type NoteScopeMode = (typeof NOTE_SCOPE_MODES)[number];
export type NoteScope =
  | { mode: 'private' }
  | { mode: 'workspace' }
  | { mode: 'project' }
  | { mode: 'inherit' }
  | { mode: 'explicit'; userIds: string[] };

/**
 * The document an empty note holds, and the reason this literal is duplicated
 * here rather than imported.
 *
 * `packages/domain` must not import `packages/editor` — the dependency runs the
 * other way (`packages/editor/package.json` depends on `@gisik-nokma/domain`),
 * so importing `emptyDoc()` would be a cycle. This is a COPY of the literal
 * that function returns, and a copy with no witness is a second answer waiting
 * to disagree: `packages/editor/test/empty-doc-parity.test.ts` (case 18.013)
 * asserts the two are deep-equal, so a change to either that is not made to
 * both is a red.
 *
 * `schemaVersion` matches `DOC_SCHEMA_VERSION` (2) at this commit: Plan 4 of the
 * series raised the editor's version to 2 and raised this copy with it. A
 * further raise must move both again, or case 18.013 goes red.
 */
export const EMPTY_NOTE_DOC = {
  type: 'doc',
  attrs: { schemaVersion: 2 },
  content: [{ type: 'paragraph' }],
} as const;

/**
 * A note's head state — every fact a note has, folded from its own events.
 *
 * `scopeBeforeInherit` is the D4 memory (spec §0.3): an `inherit`-scoped note
 * records the scope it had BEFORE it became `inherit`, so that removing the
 * last attachment can put it back rather than guessing. It is `null` whenever
 * the note is not on `inherit`, and a note BORN in `inherit` has none — which is
 * why the detach rule falls back to `private` instead of to a remembered value
 * that never existed.
 *
 * `lastBodyEventId` names the event the current `body` came from, so history can
 * show which save a reader is looking at without comparing documents.
 */
export type NoteState = {
  noteId: string;
  workspaceId: string;
  authorId: string;
  title: string;
  body: unknown;
  homeProjectId: string;
  scope: NoteScope;
  scopeBeforeInherit: NoteScope | null;
  attachedTicketIds: string[];
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  lastBodyEventId: string;
  seq: number;
};

/**
 * Every type this reducer folds, `comment.added` included.
 *
 * `comment.added` is here although it moves no note state: it is a claim on a
 * note's history and the projection that stores it keys on the note, so a
 * reader iterating this list must not skip it. It is also the ONE type in the
 * list the registry admits against a second kind (`vocabulary.ts`), which is
 * why the reducer's first act is a kind check rather than a type lookup alone.
 */
export const NOTE_EVENT_TYPES = [
  'note.created',
  'note.renamed',
  'note.body_set',
  'note.scope_set',
  'note.moved',
  'note.attached',
  'note.detached',
  'note.deleted',
  'note.restored',
  'comment.added',
] as const;

/** Throws, naming the event type and the reason — the shape `applyTicketEvent` uses. */
function refuse(env: EventEnvelope, reason: string): never {
  throw new Error(`applyNoteEvent: ${env.type} refused — ${reason}`);
}

export function applyNoteEvent(state: NoteState | null, env: EventEnvelope): NoteState {
  if (env.type === 'note.created') {
    if (state !== null) refuse(env, 'note.created on an existing note');
    const p = noteCreatedPayload.parse(env.payload);
    return {
      noteId: env.entity.id,
      workspaceId: env.workspaceId,
      authorId: env.actorId,
      title: p.title,
      body: p.body ?? EMPTY_NOTE_DOC,
      homeProjectId: p.homeProjectId,
      scope: p.scope,
      scopeBeforeInherit: null,
      attachedTicketIds: p.attachTicketId === undefined ? [] : [p.attachTicketId],
      deleted: false,
      createdAt: env.serverTime,
      updatedAt: env.serverTime,
      lastBodyEventId: env.id,
      seq: env.seq,
    };
  }
  if (state === null) refuse(env, 'no note.created precedes it');
  const next: NoteState = { ...state, updatedAt: env.serverTime, seq: env.seq };
  // `note.restored` is the ONE event legal on a deleted note — it is the undo —
  // so it is answered before the deleted guard below rather than after it.
  if (env.type === 'note.restored') {
    if (!state.deleted) refuse(env, 'the note is not deleted');
    return { ...next, deleted: false };
  }
  if (state.deleted) refuse(env, 'the note is deleted');
  switch (env.type) {
    case 'note.renamed':
      return { ...next, title: noteRenamedPayload.parse(env.payload).title };
    case 'note.body_set':
      return { ...next, body: noteBodySetPayload.parse(env.payload).body, lastBodyEventId: env.id };
    case 'note.scope_set': {
      const scope = noteScopeSetPayload.parse(env.payload) as NoteScope;
      if (scope.mode === 'inherit' && state.attachedTicketIds.length === 0) refuse(env, 'inherit needs an attachment');
      if (scope.mode === 'project' && state.homeProjectId === '') refuse(env, 'project scope needs a project home');
      // The D4 memory, written on the ENTERING transition only. Moving from one
      // non-inherit scope to another must not overwrite a memory that is not
      // being used: an `inherit` note whose scope was remembered as `project`
      // and is then re-scoped to `workspace` has no memory at all, because it
      // is no longer going to revert to anything.
      const scopeBeforeInherit =
        scope.mode === 'inherit' ? (state.scope.mode === 'inherit' ? state.scopeBeforeInherit : state.scope) : null;
      return { ...next, scope, scopeBeforeInherit };
    }
    case 'note.moved': {
      const { homeProjectId } = noteMovedPayload.parse(env.payload);
      if (homeProjectId === '' && state.scope.mode === 'project') {
        refuse(env, 'project scope cannot move to workspace level');
      }
      return { ...next, homeProjectId };
    }
    case 'note.attached': {
      const { ticketId } = noteAttachedPayload.parse(env.payload);
      // IDEMPOTENT: attaching twice is one attachment. A device that re-sends
      // its queue after a dropped ack must not double the list.
      if (state.attachedTicketIds.includes(ticketId)) return next;
      // SORTED, so two replicas that received the same attachments in different
      // orders hold byte-identical state — the property the projection's array
      // column and the parity test both depend on.
      return { ...next, attachedTicketIds: [...state.attachedTicketIds, ticketId].sort() };
    }
    case 'note.detached': {
      const { ticketId } = noteDetachedPayload.parse(env.payload);
      const attachedTicketIds = state.attachedTicketIds.filter((id) => id !== ticketId);
      // THE DETACH RULE (D4, spec §3.4). Only the LAST attachment reverts: an
      // inherit-scoped note with attachments left keeps inheriting from them.
      if (attachedTicketIds.length === 0 && state.scope.mode === 'inherit') {
        return {
          ...next,
          attachedTicketIds,
          scope: state.scopeBeforeInherit ?? { mode: 'private' },
          scopeBeforeInherit: null,
        };
      }
      return { ...next, attachedTicketIds };
    }
    case 'note.deleted':
      return { ...next, deleted: true };
    case 'comment.added':
      // Legal on a live note and moves nothing: the body lives in
      // `proj_note_comments`, filed by the comments projection, not in the
      // note's own head state.
      return next;
    default:
      return refuse(env, `unknown note event type`);
  }
}
