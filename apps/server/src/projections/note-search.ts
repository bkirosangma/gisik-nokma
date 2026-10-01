import type { PoolClient } from 'pg';
import {
  NOTE_EVENT_TYPES,
  docToPlainText,
  foldSearchText,
  ticketKey,
  type LedgerEvent,
} from '@gisik-nokma/domain';
import { ticketNumbers } from '../read/ticket-numbers.js';
import { projectPrefixesInWorkspace } from '../read/visible-projects.js';
import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
import { purgedResolverFor } from '../purge/purged-lookup.js';
import type { Projection } from './registry.js';

/**
 * `proj_note_search` and `proj_note_lexemes` — the notes search index (spec
 * §7.3, Plan 3 of 6).
 *
 * ## Why it is a projection, and `search_note_chunks` is not
 *
 * Every column here is a pure function of the ledger: the title, the body
 * FLATTENED to text and FOLDED, and the keys and titles of the tickets the note
 * is attached to. `tools/verify-projections.ts` can therefore rebuild it and
 * diff it with EXCEPT, which is what a projection means in this repository. The
 * chunk table (migration 1790300000000) cannot say that about itself — its
 * embedding column is the output of a model BINARY — which is why it is a cache
 * with `source_seq`/`model` provenance and carries no `proj_` prefix.
 *
 * ## Reading OTHER projections is what makes its POSITION load-bearing
 *
 * `apply` reads `proj_notes` and `proj_note_attachments` (for the note),
 * `proj_tickets` (for each attached ticket's project and title) and
 * `proj_projects` (for a project's key prefix). All four are written by
 * projections registered ABOVE this one, and the ordering matters in three
 * places that are easy to forget because only one of them is the obvious one:
 *
 *  1. the ingest transaction, where the note's own row must already be updated;
 *  2. `rebuildProjection`, which replays this projection alone against the live
 *     note and ticket tables;
 *  3. `tools/verify-projections.ts`, which rebuilds every projection into
 *     `verify_shadow` with `search_path = verify_shadow, public` — so the tables
 *     read here are the SHADOW copies, and they are complete only because
 *     `proj_projects`, `proj_tickets` and `proj_notes` were replayed first.
 *
 * `events`, which the three key helpers read, has no shadow copy and resolves
 * to `public.events` in that run — which is correct rather than a leak: the
 * ledger is not rebuilt, and both the live table and the rebuild are reading
 * the same rows.
 *
 * ## The ticket key, and why the note carries it
 *
 * `ticket_text` is `"<key> <title>"` per attached ticket, because a person
 * searching for a ticket's work types the KEY. The key is composed here with
 * the product's one composer — `workspaceIdentityFromLedger`,
 * `projectPrefixesInWorkspace` and `ticketNumbers`, all of which are pure
 * functions of the ledger — and a ticket whose number or prefix is unavailable
 * contributes an empty key rather than dropping the line: `ticket-numbers.ts`'s
 * own ruling is that a key is not worth refusing a read over, and dropping the
 * line would hide a ticket the reader can see.
 *
 * **A prefix change re-indexes too** (prefixes and groups plan Task 5, FD7). The
 * key baked into `ticket_text` is the one in force when the row was last
 * derived, so `project.updated` carrying a `prefix` re-derives the notes
 * attached to that project's tickets, and `workspace.prefix_changed` re-derives
 * every note in the workspace with an attachment. Without it a note is found by
 * a key the ticket no longer wears, and for the workspace prefix
 * `verify-projections` drifts: the rebuild reads the whole ledger's prefix
 * (`events` has no shadow copy) while the live row kept the old one. Only the
 * NEW key is indexed: the old one still finds the TICKET through the key search
 * (plan Task 4, FD1), which covers tickets and not notes.
 *
 * **The vocabulary is re-derived too, and that is not optional.** Lexemes are
 * never deleted, so the old key's words (`ccre`) would stay in
 * `proj_note_lexemes` live; a `verify-projections` rebuild reads every other
 * projection's table (and the workspace prefix in `events`) in its FINAL state
 * and never produces them, so the diff reports them as extra. A prefix change is
 * the one event that retires words wholesale, so it ends with
 * `rederiveWorkspaceLexemes` — exactly what the rebuild yields. (A ticket
 * rename that drops a word has the same latent drift; it is not changed here.)
 *
 * **The cost is named rather than hidden.** Those three reads run on every note
 * event that HAS an attachment, and `ticketNumbers` scans the workspace's
 * `ticket.created` events. A note with no attachments — the common case —
 * short-circuits before any of them.
 *
 * ## Lexemes are inserted, never deleted
 *
 * The vocabulary feeds trigram spelling correction (spec §7.5), and a word that
 * no longer appears anywhere is the one a misspelling is most likely to be a
 * misspelling OF. Leaving them is also what keeps the table deterministic: a
 * rebuild replays the same events, so it produces the same set, and `reset`
 * truncates both tables so the replay starts from nothing.
 */

type NoteSourceRow = {
  note_id: string;
  workspace_id: string;
  home_project_id: string;
  title: string;
  body: unknown;
  deleted: boolean;
};

type AttachedTicketRow = { ticket_id: string; project_id: string; title: string | null };

/**
 * The ticket events that can change a `ticket_text` line.
 *
 * `ticket.field_set` is here for ONE field, filtered in `apply` rather than
 * here: a ticket has many fields and only its TITLE is part of the line, so a
 * projection that re-derived on every field claim would do a workspace-wide
 * scan of the ledger every time somebody set a priority.
 */
const TICKET_TEXT_EVENTS = new Set(['ticket.field_set', 'ticket.deleted', 'ticket.restored']);

/** The three-or-more-letter word rule (spec §7.3). */
const MIN_LEXEME_LENGTH = 3;

export const noteSearchProjection: Projection = {
  name: 'proj_note_search',
  tables: ['proj_note_search', 'proj_note_lexemes'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (event.entity.kind === 'note') {
      // The same pair of guards `proj_notes` uses, for the same reason:
      // `comment.added` IS in NOTE_EVENT_TYPES and is folded by neither, and
      // re-deriving a row for it would be a write per comment that changes
      // nothing indexed.
      if (!(NOTE_EVENT_TYPES as readonly string[]).includes(event.type)) return;
      if (event.type === 'comment.added') return;
      await reindexNote(tx, event.entity.id);
      return;
    }

    // A prefix change re-keys tickets without any note or ticket event, so the
    // `ticket_text` that baked the old key is re-derived here (FD7).
    if (event.type === 'workspace.prefix_changed') {
      await reindexNotesAttachedInWorkspace(tx, event.workspaceId);
      return;
    }
    if (event.type === 'project.updated') {
      if ((event.payload as { prefix?: unknown }).prefix !== undefined) {
        await reindexNotesAttachedInProject(tx, event.workspaceId, event.entity.id);
      }
      return;
    }

    if (event.entity.kind !== 'ticket' || !TICKET_TEXT_EVENTS.has(event.type)) return;
    if (event.type === 'ticket.field_set' && (event.payload as { fieldId?: unknown }).fieldId !== 'title') return;
    await reindexNotesAttachedTo(tx, event.entity.id);
  },

  async reset(tx: PoolClient): Promise<void> {
    // TRUNCATE, not DELETE, matching every shipped projection. Both tables,
    // because `tables` names both and `reset` must empty what it declares.
    await tx.query('TRUNCATE proj_note_search, proj_note_lexemes');
  },
};

/**
 * The note's whole indexed row, from the tables the projections above have
 * already written. A note that is absent or deleted loses its row rather than
 * being written with an empty one: `proj_note_search` exists to be SEARCHED, and
 * a row that can never match is a row that costs an index probe to prove it.
 */
export async function reindexNote(tx: PoolClient, noteId: string): Promise<void> {
  const { rows } = await tx.query<NoteSourceRow>(
    `SELECT note_id, workspace_id, home_project_id, title, body, deleted
       FROM proj_notes WHERE note_id = $1`,
    [noteId],
  );
  const note = rows[0];
  if (note === undefined || note.deleted) {
    await tx.query('DELETE FROM proj_note_search WHERE note_id = $1', [noteId]);
    return;
  }

  const title = foldSearchText(note.title);
  const bodyText = foldSearchText(docToPlainText(note.body, { isPurged: await purgedResolverFor(tx, [note.body]) }));
  const ticketText = foldSearchText(await ticketTextOf(tx, note.workspace_id, noteId));

  await tx.query(
    `INSERT INTO proj_note_search (note_id, workspace_id, home_project_id, title, body_text, ticket_text)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (note_id) DO UPDATE SET
       workspace_id = EXCLUDED.workspace_id, home_project_id = EXCLUDED.home_project_id,
       title = EXCLUDED.title, body_text = EXCLUDED.body_text, ticket_text = EXCLUDED.ticket_text`,
    [note.note_id, note.workspace_id, note.home_project_id, title, bodyText, ticketText],
  );

  await insertLexemes(tx, note.workspace_id, `${title} ${bodyText} ${ticketText}`);
}

/** Every live note attached to one ticket — the notes a ticket edit invalidates. */
async function reindexNotesAttachedTo(tx: PoolClient, ticketId: string): Promise<void> {
  const { rows } = await tx.query<{ note_id: string }>(
    'SELECT note_id FROM proj_note_attachments WHERE ticket_id = $1',
    [ticketId],
  );
  for (const row of rows) {
    await reindexNote(tx, row.note_id);
  }
}

/** Every note attached to a ticket of one project — the notes a project prefix change re-keys. */
async function reindexNotesAttachedInProject(
  tx: PoolClient,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const { rows } = await tx.query<{ note_id: string }>(
    `SELECT DISTINCT na.note_id
       FROM proj_note_attachments na
       JOIN proj_tickets t ON t.ticket_id = na.ticket_id
      WHERE t.workspace_id = $1 AND t.project_id = $2
      ORDER BY na.note_id`,
    [workspaceId, projectId],
  );
  for (const row of rows) {
    await reindexNote(tx, row.note_id);
  }
  if (rows.length > 0) await rederiveWorkspaceLexemes(tx, workspaceId);
}

/** Every note with an attachment in one workspace — the notes a workspace prefix change re-keys. */
async function reindexNotesAttachedInWorkspace(tx: PoolClient, workspaceId: string): Promise<void> {
  const { rows } = await tx.query<{ note_id: string }>(
    `SELECT DISTINCT na.note_id
       FROM proj_note_attachments na
       JOIN proj_notes n ON n.note_id = na.note_id
      WHERE n.workspace_id = $1
      ORDER BY na.note_id`,
    [workspaceId],
  );
  for (const row of rows) {
    await reindexNote(tx, row.note_id);
  }
  if (rows.length > 0) await rederiveWorkspaceLexemes(tx, workspaceId);
}

/**
 * `"<key> <title>\n"` per attached LIVE ticket, in ticket-id order.
 *
 * A deleted ticket contributes nothing — its line is dropped rather than kept
 * and marked, because a search hit whose snippet names a ticket the reader
 * cannot open is worse than one that does not mention it.
 */
async function ticketTextOf(tx: PoolClient, workspaceId: string, noteId: string): Promise<string> {
  const { rows } = await tx.query<AttachedTicketRow>(
    `SELECT t.ticket_id, t.project_id, t.fields -> 'title' ->> 'value' AS title
       FROM proj_note_attachments na
       JOIN proj_tickets t ON t.ticket_id = na.ticket_id
      WHERE na.note_id = $1 AND ${LIVE_TICKET_WHERE}
      ORDER BY t.ticket_id`,
    [noteId],
  );
  // The common case, and the one worth short-circuiting: no attachments means
  // none of the three key reads below runs at all.
  if (rows.length === 0) return '';

  const identity = await workspaceIdentityFromLedger(tx, workspaceId);
  const prefixes = await projectPrefixesInWorkspace(tx, workspaceId);
  const numbers = await ticketNumbers(
    tx,
    workspaceId,
    rows.map((row) => row.ticket_id),
  );

  return rows
    .map((row) => {
      const projectPrefix = prefixes.get(row.project_id) ?? null;
      const number = numbers.get(row.ticket_id) ?? null;
      const key =
        identity.prefix === null || projectPrefix === null || number === null
          ? ''
          : ticketKey(identity.prefix, projectPrefix, number);
      return `${key} ${row.title ?? ''}\n`;
    })
    .join('');
}

/**
 * The workspace's vocabulary, from one note's folded text.
 *
 * Split on `[^\p{L}\p{N}]+` rather than on spaces — `cold-room` is two words
 * and `shop-7` is one word and one number, and a space split would file
 * `cold-room` as a lexeme no misspelling could ever reach. Tokens shorter than
 * three letters are dropped: they are the ones a trigram match would fire on
 * constantly and mean nothing.
 */
async function insertLexemes(tx: PoolClient, workspaceId: string, text: string): Promise<void> {
  const tokens = [
    ...new Set(text.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= MIN_LEXEME_LENGTH)),
  ];
  if (tokens.length === 0) return;
  await tx.query(
    `INSERT INTO proj_note_lexemes (workspace_id, lexeme)
     SELECT $1, unnest($2::text[])
     ON CONFLICT DO NOTHING`,
    [workspaceId, tokens],
  );
}

/**
 * Re-derives one workspace's lexemes from its CURRENT `proj_note_search` rows —
 * trash series Plan 2, deviation D3. The table has no note id, so an erased
 * note's words cannot be deleted by key. This is what a rebuild produces:
 * during a rebuild `reindexNote` reads each note's FINAL `proj_notes` row, so the
 * rebuilt vocabulary is the tokens of every surviving note's final text. It
 * narrows the "a lexeme is never deleted" property of
 * `migrations/1790200000000_note-search.sql:66-70` for a workspace that has had
 * a purge — recorded in the plan.
 */
export async function rederiveWorkspaceLexemes(tx: PoolClient, workspaceId: string): Promise<void> {
  await tx.query('DELETE FROM proj_note_lexemes WHERE workspace_id = $1', [workspaceId]);
  const { rows } = await tx.query<{ title: string; body_text: string; ticket_text: string }>(
    'SELECT title, body_text, ticket_text FROM proj_note_search WHERE workspace_id = $1 ORDER BY note_id',
    [workspaceId],
  );
  for (const row of rows) {
    await insertLexemes(tx, workspaceId, `${row.title} ${row.body_text} ${row.ticket_text}`);
  }
}
