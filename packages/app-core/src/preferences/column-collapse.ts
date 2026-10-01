/**
 * Which of a board's COLUMNS a person has collapsed to a labelled strip, by
 * hand, remembered per user and per project (styling refresh Plan A Task 5B;
 * owner rulings 2026-09-29: single columns collapse, then "all columns are
 * collapsible" — plan D27, resolved).
 *
 * This is `workflow-collapse.ts`'s shape one level down, copied rather than
 * reinvented, and its docblock carries the reasoning this one does not repeat:
 * the record is keyed by user AND project, another user's record is never
 * honoured on read or on write, every storage access is wrapped so every
 * failure answers the default, the value holds CHOICES and never resolved
 * states, and `''`/`undefined` means no session, so nothing is read or written.
 * The owner's instruction is the same one: *"only on the local storage,
 * clientside"*.
 *
 * ## The one difference
 *
 * There is no auto-expand rule. The default is EXPANDED for every column,
 * whatever its category, so nobody's board changes until they press a control;
 * an absent key means "nobody chose" and reads as expanded. `false` is a column
 * a person collapsed; `true` is one a person expanded again (kept as a choice,
 * not deleted, so the memory of the click survives).
 *
 * The key is `columnCollapseKey(workflowId, stateId)` — by workflow and NOT by
 * version, so a new version of the same workflow keeps the person's choice for a
 * state it still has. It is a separate document from the workflow-group memory:
 * the two are independent, and a column write never touches the other key.
 */

/**
 * The one key. Exported so the cases that assert the stored SHAPE — and that a
 * record belonging to another user, or to another project, is not honoured — can
 * read the bytes this module wrote rather than a second spelling of the key that
 * could drift from it.
 */
export const COLUMN_COLLAPSE_KEY = 'gn-board-column-collapse';

/**
 * The identity one column's choice is stored under. By workflow and state, NOT
 * by version (see the module docblock), and it needs both halves: two workflows
 * in one project can share a state id (`todo`), and a key on `stateId` alone
 * would collapse a column in a workflow the person never touched (20.117).
 */
export function columnCollapseKey(workflowId: string, stateId: string): string {
  return `${workflowId}:${stateId}`;
}

/**
 * One project's choices: a `columnCollapseKey` (`${workflowId}:${stateId}`)
 * mapped to the state a person chose — `true` expanded, `false` collapsed.
 * An absent key is "nobody chose", which is NOT the same as `false`.
 */
export type ColumnCollapseChoices = Record<string, boolean>;

/**
 * Nobody has chosen anything. Frozen, and returned for every failure mode below
 * rather than a fresh `{}`: a caller comparing two reads (or an effect
 * depending on one) must not see a new object identity every time it asks.
 */
export const NO_COLUMN_CHOICES: ColumnCollapseChoices = Object.freeze({});

/** The stored document, as this build writes and reads it. */
type StoredColumnCollapse = {
  userId: string;
  /** Per project id, that project's choices. A project with none is absent. */
  projects: Record<string, ColumnCollapseChoices>;
};

/**
 * Is this value a choices record this build can honour?
 *
 * EVERY value must be a boolean. A `{"<key>": "yes"}` — hand-edited, or written
 * by a shape of this key that no longer exists — is refused WHOLE rather than
 * filtered down to its well-formed entries, because a partially-honoured record
 * is a board that collapses some of what a person chose and silently ignores the
 * rest. The precedent's own words for this: the union is the door.
 */
function isChoices(value: unknown): value is ColumnCollapseChoices {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'boolean');
}

/**
 * The remembered choices for this user and project, or the default.
 *
 * Answers the default for all seven ways there is nothing to return: no session,
 * a throwing accessor, a missing key, unparseable text, a document that is not
 * an object, a document whose owner is somebody else, and a project whose record
 * this build does not recognise. Collapsing them costs nothing — the caller's
 * only move on any of them is to show the default — and it means the failure
 * modes cannot come back wearing a new meaning later.
 */
export function readColumnCollapse(userId: string, projectId: string): ColumnCollapseChoices {
  if (userId === '') return NO_COLUMN_CHOICES;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(COLUMN_COLLAPSE_KEY);
  } catch {
    return NO_COLUMN_CHOICES;
  }
  if (raw === null) return NO_COLUMN_CHOICES;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_COLUMN_CHOICES;
  }
  if (typeof parsed !== 'object' || parsed === null) return NO_COLUMN_CHOICES;

  const { userId: storedUserId, projects } = parsed as { userId?: unknown; projects?: unknown };
  if (typeof storedUserId !== 'string') return NO_COLUMN_CHOICES;
  // SOMEONE ELSE'S. See the docblock — this is the whole reason for the key's
  // shape, and it is checked before the value is handed back, never after.
  if (storedUserId !== userId) return NO_COLUMN_CHOICES;
  if (typeof projects !== 'object' || projects === null || Array.isArray(projects)) {
    return NO_COLUMN_CHOICES;
  }

  const forProject = (projects as Record<string, unknown>)[projectId];
  if (!isChoices(forProject)) return NO_COLUMN_CHOICES;

  // A record whose every value was refused down to nothing is the default, and
  // handing back a fresh `{}` here instead of the shared constant would give a
  // caller a new identity for the same fact on every read.
  return Object.keys(forProject).length === 0 ? NO_COLUMN_CHOICES : forProject;
}

/**
 * Remembers one project's choices for this user, replacing whatever was there
 * for that project and leaving every OTHER project's record alone.
 *
 * A no-op with no session, for the reason `readColumnCollapse` answers the
 * default: nothing is remembered FOR anybody, so nothing is written.
 *
 * The merge is read-modify-write rather than a blind overwrite because the key
 * holds every project this person has boards for; writing only this project must
 * not erase the others. Nothing else writes this key, so there is no lost-update
 * window worth ordering against — a second tab's write is the last one, and both
 * tabs agree about the projects they share.
 */
export function rememberColumnCollapse(
  userId: string,
  projectId: string,
  choices: ColumnCollapseChoices,
): void {
  if (userId === '') return;

  let projects: Record<string, ColumnCollapseChoices> = {};
  try {
    const raw = window.localStorage.getItem(COLUMN_COLLAPSE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const { userId: storedUserId, projects: stored } = parsed as {
          userId?: unknown;
          projects?: unknown;
        };
        // Only a document belonging to THIS user is a base to merge into. A
        // previous person's projects must not be carried forward under this
        // person's id — that is the keyed-by-user rule applied to the WRITE, not
        // only to the read.
        if (storedUserId === userId && typeof stored === 'object' && stored !== null) {
          projects = { ...(stored as Record<string, ColumnCollapseChoices>) };
        }
      }
    }
  } catch {
    // A private window, blocked site data, or text this build cannot parse.
    // Starting from an empty document is the honest base: the alternative is
    // refusing to remember today's choice because yesterday's is unreadable.
    projects = {};
  }

  const next = { ...projects };
  if (Object.keys(choices).length === 0) {
    // "Nothing chosen" is the absence of a record, not a record of nothing —
    // see this module's docblock: an absent key is "nobody chose".
    delete next[projectId];
  } else {
    next[projectId] = choices;
  }

  const document: StoredColumnCollapse = { userId, projects: next };
  try {
    window.localStorage.setItem(COLUMN_COLLAPSE_KEY, JSON.stringify(document));
  } catch {
    // The toggle still moved and the board still reflects it for this session;
    // only the memory of it is lost, and a board that refused the toggle would
    // be worse.
  }
}
