import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { NoteScopeMode } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { getNoteStateFromDb } from '../projections/notes.js';
import {
  getNoteDetail,
  getNoteVersionBody,
  listNoteComments,
  listNoteHistory,
  listNotes,
  listNotesForTicket,
} from '../read/notes.js';
import { isClosedOrErasedDraft, noteEventVisibleTo } from '../visibility/can-open.js';
import { NOT_FOUND_BODY, toEventView, type LedgerRow } from './tickets.js';

/**
 * The note read routes (notes series, Plan 1 of 6, spec §6.4).
 *
 * Written: NONE. Every route here is a GET; notes are created and changed by
 * submitting events through `/v1/events`, exactly as tickets are.
 *
 * ## Every 404 is the same 404
 *
 * `NOT_FOUND_BODY` is imported from `routes/tickets.js` rather than re-declared,
 * so "an unreadable note" and "a note that does not exist" cannot drift apart
 * into an existence oracle. Three things return it, and they must keep doing so:
 * a note the predicate excludes, a note id nothing was ever filed against, and a
 * version id that is not a version of that note.
 *
 * ## The workspace is LEARNED, not taken from the URL
 *
 * `/v1/notes/:noteId` has no workspace in its path, so the handler asks the note
 * for its own workspace before it can resolve a role. That is deliberate rather
 * than convenient: an effective role is per-workspace, and taking a workspace id
 * from a query parameter would let a caller answer a question about workspace B
 * with a role held in workspace A — the exact confusion `canSee`'s docblock
 * exists to prevent. The note's row is the only authority on which workspace it
 * lives in.
 */
export function registerNoteRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  /**
   * The effective role for a note-addressed route: read the note's own
   * workspace, or answer `null` and let the handler 404.
   *
   * `null` for a note that does not exist — the caller has nothing to be told
   * apart from "you may not read it".
   */
  async function effForNote(userId: string, noteId: string) {
    const state = await getNoteStateFromDb(deps.pool, noteId);
    if (state === null) return null;
    return resolveEffectiveRole(deps.pool, userId, state.workspaceId);
  }

  app.get<{ Params: { workspaceId: string }; Querystring: Record<string, string | undefined> }>(
    '/v1/workspaces/:workspaceId/notes',
    { preHandler: requireSession },
    async (request) => {
      const userId = request.currentUserId;
      const workspaceId = request.params.workspaceId;
      const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
      const q = request.query;
      // An ABSENT parameter is not a filter; an EMPTY one is. `?home=` means
      // "notes filed at workspace level" (`home_project_id = ''`), which is a
      // real answer, so the check is `!== undefined` and never a falsy test.
      const notes = await listNotes(deps.pool, eff, userId, workspaceId, {
        ...(q['home'] !== undefined ? { homeProjectId: q['home'] } : {}),
        ...(q['author'] !== undefined ? { authorId: q['author'] } : {}),
        ...(q['scope'] !== undefined ? { scopeMode: q['scope'] as NoteScopeMode } : {}),
        ...(q['deleted'] === '1' ? { deleted: true } : {}),
      });
      return { notes };
    },
  );

  app.get<{ Params: { noteId: string } }>('/v1/notes/:noteId', { preHandler: requireSession }, async (request, reply) => {
    const eff = await effForNote(request.currentUserId, request.params.noteId);
    if (eff === null) return reply.code(404).send(NOT_FOUND_BODY);
    const note = await getNoteDetail(deps.pool, eff, request.currentUserId, request.params.noteId);
    if (note === null) return reply.code(404).send(NOT_FOUND_BODY);
    return { note };
  });

  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/notes',
    { preHandler: requireSession },
    async (request) => {
      const userId = request.currentUserId;
      const { workspaceId, ticketId } = request.params;
      const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
      // Another person's draft, or an erased one, has no notes for this caller: the answer an unknown id already gets.
      if (await isClosedOrErasedDraft(deps.pool, userId, ticketId)) return { notes: [] };
      return { notes: await listNotesForTicket(deps.pool, eff, userId, workspaceId, ticketId) };
    },
  );

  app.get<{ Params: { noteId: string } }>(
    '/v1/notes/:noteId/comments',
    { preHandler: requireSession },
    async (request, reply) => {
      const userId = request.currentUserId;
      const { noteId } = request.params;
      const eff = await effForNote(userId, noteId);
      if (eff === null) return reply.code(404).send(NOT_FOUND_BODY);
      // The readability check lives HERE rather than inside `listNoteComments`:
      // the note's own detail read is the predicate's answer, and asking it once
      // through the one function that applies it is what keeps this route from
      // owning a second copy of "may this person read it".
      if ((await getNoteDetail(deps.pool, eff, userId, noteId)) === null) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      return { comments: await listNoteComments(deps.pool, noteId) };
    },
  );

  app.get<{ Params: { noteId: string } }>(
    '/v1/notes/:noteId/history',
    { preHandler: requireSession },
    async (request, reply) => {
      const userId = request.currentUserId;
      const { noteId } = request.params;
      const eff = await effForNote(userId, noteId);
      if (eff === null) return reply.code(404).send(NOT_FOUND_BODY);
      if ((await getNoteDetail(deps.pool, eff, userId, noteId)) === null) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      return { versions: await listNoteHistory(deps.pool, noteId) };
    },
  );

  /**
   * One note's ledger — the pull a device makes when a `reach-granted` notice
   * named a note it does not hold (notes series, Plan 2 of 6, spec §5.1).
   *
   * ## Why this is not `/v1/sync/bootstrap/note`
   *
   * The ticket equivalent SPLITS: `GET /v1/sync/bootstrap/ticket` is the sync
   * door and carries a snapshot plus a tail, while
   * `/v1/workspaces/:ws/tickets/:ticketId/events` is the READ door and carries
   * the whole row-shaped ledger. Notes have no snapshot table (spec §5.3 — a
   * note's whole history is its events), so there is nothing for a sync-shaped
   * door to add and one route serves both callers. It lives HERE and in the
   * READ shape for that reason, not by inattention, and the case that pins the
   * shape (18.075) is what keeps the client's parser and this route in step.
   *
   * ## Ordering is `seq`, the note's own history order
   *
   * The same `ORDER BY seq` the ticket-events route uses, and for the same
   * reason: `seq` is the sequence WITHIN this entity, so it is this note's
   * history in the order it was made. `workspace_seq` would order one note's
   * events identically — the two agree inside an entity by construction — but
   * the column that MEANS "this entity's history" is the honest one to write.
   *
   * ## `comment.added` is included, and must be
   *
   * A comment is filed against the note (`NOTE_EVENT_TYPES` names it for
   * exactly this reason), so it is part of the note's ledger and part of what a
   * device needs to rebuild the note's comment list. This route does not
   * classify: it reads `entity_id = the note` and takes every row.
   *
   * The 404s are `effForNote`'s and the detail read's, in that order, and both
   * send `NOT_FOUND_BODY` — an unreadable note and a note id nothing was ever
   * filed against are the same answer, which is this file's opening rule.
   */
  app.get<{ Params: { noteId: string } }>(
    '/v1/notes/:noteId/events',
    { preHandler: requireSession },
    async (request, reply) => {
      const userId = request.currentUserId;
      const { noteId } = request.params;
      const eff = await effForNote(userId, noteId);
      if (eff === null) return reply.code(404).send(NOT_FOUND_BODY);
      if ((await getNoteDetail(deps.pool, eff, userId, noteId)) === null) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      const { rows } = await deps.pool.query<LedgerRow>(
        `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
                actor_id, origin, client_time, server_time, seq, workspace_seq
         FROM events
         WHERE entity_kind = 'note' AND entity_id = $1
         ORDER BY seq`,
        [noteId],
      );
      // A `note.attached` / `note.detached` naming another person's draft is the author's alone (drafts R66);
      // one naming an erased draft is nobody's (planner ruling 2026-10-04, follow-up).
      const visible: LedgerRow[] = [];
      for (const row of rows) {
        if (await noteEventVisibleTo(deps.pool, userId, row)) visible.push(row);
      }
      return { events: visible.map(toEventView) };
    },
  );

  app.get<{ Params: { noteId: string; eventId: string } }>(
    '/v1/notes/:noteId/history/:eventId',
    { preHandler: requireSession },
    async (request, reply) => {
      const userId = request.currentUserId;
      const { noteId, eventId } = request.params;
      const eff = await effForNote(userId, noteId);
      if (eff === null) return reply.code(404).send(NOT_FOUND_BODY);
      if ((await getNoteDetail(deps.pool, eff, userId, noteId)) === null) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      const body = await getNoteVersionBody(deps.pool, noteId, eventId);
      if (body === null) return reply.code(404).send(NOT_FOUND_BODY);
      return { body };
    },
  );
}
