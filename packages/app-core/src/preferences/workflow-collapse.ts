/**
 * Which of a board's workflow groups a person has collapsed or expanded, by
 * hand, remembered per user and per project.
 *
 * Owner request, 2026-09-23: *"in the board, the workflow is collapsible. if the
 * workflow has no tickets in it, it is shown collapsed by default."* — and, on
 * being asked whether the choice should survive a reload, *"by persist i didnt
 * mean to database/server. only on the local storage, clientside"*.
 *
 * ## This is `new-ticket-start.ts`'s pattern, one question over
 *
 * That file is the shape to copy and it is copied rather than reinvented, which
 * is the same instruction IT followed for `apps/web/src/use-last-workspace.ts`.
 * Every part below was paid for once already:
 *
 * - **The record is KEYED BY USER, and by project too.** `localStorage` outlives
 *   a session. Sign out, hand the laptop over, and a bare key would collapse the
 *   next person's workflow groups — the same defect `useLastWorkspace`'s own
 *   docblock records for the workspace NAME, and case 11.169 for the inbox
 *   count. It is not cleared on sign-out; it is simply not honoured, which also
 *   survives the case where sign-out never runs at all. The PROJECT half is a
 *   second scope and not a duplicate of the first: collapse is per workflow
 *   group WITHIN a project, and two projects can hold the same workflow at the
 *   same version, so a record keyed by user alone would share one collapsed set
 *   between two boards.
 * - **Every storage access is wrapped.** A browser with site data blocked throws
 *   on the ACCESSOR, not on the value, so a `try`/`catch` around the access is
 *   the only shape that survives it. A lost memory is a lost convenience; a
 *   board that refused to render because it could not read one would be worse,
 *   so every failure answers the default.
 * - **The default is carried out, not assumed.** `NO_COLLAPSE_CHOICES` — nobody
 *   has chosen anything — is what every failure returns and what the board's own
 *   empty-group rule sits on top of. A viewer whose storage is unreadable still
 *   gets the owner's default behaviour; they lose only the memory of their own
 *   clicks.
 *
 * ## What it does NOT do
 *
 * It does not touch the server, and it does not go through `UserPreferences`.
 * An earlier ruling sent this at `ProjectViewPrefs` and the server-owned
 * document; the owner corrected that, and the correction is worth keeping: view
 * preferences there are a SERVER row with a versioned document and a `.strict()`
 * door on both sides, and a collapse is a piece of one person's local UI state
 * that no other device needs and no replica replays.
 *
 * ## The shape, and the one thing it must be able to tell apart
 *
 * The stored value holds ONLY the groups a person chose, each mapped to the
 * state they chose: `true` expanded, `false` collapsed. A group that is ABSENT
 * has no choice recorded, and the board derives its state from the group itself
 * (empty groups rest collapsed).
 *
 * That absence is load-bearing, not tidiness. A group with no choice is one the
 * board may open BY ITSELF when a ticket arrives in it (the owner's rule: *"a
 * collapsed group that stops being empty auto-expands, and that expansion
 * persists"*), while a group carrying `false` was collapsed by a person and must
 * stay collapsed. A shape that seeded every group with its resolved state would
 * erase the difference and the auto-expand would silently undo a manual
 * collapse — the exact hazard the ruling named, answered here by storing choices
 * rather than states.
 */

/**
 * The one key. Exported so the cases that assert the stored SHAPE — and that a
 * record belonging to another user, or to another project, is not honoured — can
 * read the bytes this module wrote rather than a second spelling of the key that
 * could drift from it.
 */
export const WORKFLOW_COLLAPSE_KEY = 'gn-board-workflow-collapse';

/**
 * One project's choices: a workflow group key (`${workflowId}@${version}`, the
 * identity `board.tsx`'s `groupKey` forms) mapped to the state a person chose.
 * An absent key is "nobody chose", which is NOT the same as `false`.
 */
export type WorkflowCollapseChoices = Record<string, boolean>;

/**
 * Nobody has chosen anything. Frozen, and returned for every failure mode below
 * rather than a fresh `{}`: a caller comparing two reads (or an effect
 * depending on one) must not see a new object identity every time it asks.
 */
export const NO_COLLAPSE_CHOICES: WorkflowCollapseChoices = Object.freeze({});

/** The stored document, as this build writes and reads it. */
type StoredCollapse = {
  userId: string;
  /** Per project id, that project's choices. A project with none is absent. */
  projects: Record<string, WorkflowCollapseChoices>;
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
function isChoices(value: unknown): value is WorkflowCollapseChoices {
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
export function readWorkflowCollapse(userId: string, projectId: string): WorkflowCollapseChoices {
  if (userId === '') return NO_COLLAPSE_CHOICES;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(WORKFLOW_COLLAPSE_KEY);
  } catch {
    return NO_COLLAPSE_CHOICES;
  }
  if (raw === null) return NO_COLLAPSE_CHOICES;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_COLLAPSE_CHOICES;
  }
  if (typeof parsed !== 'object' || parsed === null) return NO_COLLAPSE_CHOICES;

  const { userId: storedUserId, projects } = parsed as { userId?: unknown; projects?: unknown };
  if (typeof storedUserId !== 'string') return NO_COLLAPSE_CHOICES;
  // SOMEONE ELSE'S. See the docblock — this is the whole reason for the key's
  // shape, and it is checked before the value is handed back, never after.
  if (storedUserId !== userId) return NO_COLLAPSE_CHOICES;
  if (typeof projects !== 'object' || projects === null || Array.isArray(projects)) {
    return NO_COLLAPSE_CHOICES;
  }

  const forProject = (projects as Record<string, unknown>)[projectId];
  if (!isChoices(forProject)) return NO_COLLAPSE_CHOICES;

  // A record whose every value was refused down to nothing is the default, and
  // handing back a fresh `{}` here instead of the shared constant would give a
  // caller a new identity for the same fact on every read.
  return Object.keys(forProject).length === 0 ? NO_COLLAPSE_CHOICES : forProject;
}

/**
 * Remembers one project's choices for this user, replacing whatever was there
 * for that project and leaving every OTHER project's record alone.
 *
 * A no-op with no session, for the reason `readWorkflowCollapse` answers the
 * default: nothing is remembered FOR anybody, so nothing is written.
 *
 * The merge is read-modify-write rather than a blind overwrite because the key
 * holds every project this person has boards for; writing only this project must
 * not erase the others. Nothing else writes this key, so there is no lost-update
 * window worth ordering against — a second tab's write is the last one, and both
 * tabs agree about the projects they share.
 */
export function rememberWorkflowCollapse(
  userId: string,
  projectId: string,
  choices: WorkflowCollapseChoices,
): void {
  if (userId === '') return;

  let projects: Record<string, WorkflowCollapseChoices> = {};
  try {
    const raw = window.localStorage.getItem(WORKFLOW_COLLAPSE_KEY);
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
          projects = { ...(stored as Record<string, WorkflowCollapseChoices>) };
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
    // see this module's docblock on why absence is load-bearing.
    delete next[projectId];
  } else {
    next[projectId] = choices;
  }

  const document: StoredCollapse = { userId, projects: next };
  try {
    window.localStorage.setItem(WORKFLOW_COLLAPSE_KEY, JSON.stringify(document));
  } catch {
    // The toggle still moved and the board still reflects it for this session;
    // only the memory of it is lost, and a board that refused the toggle would
    // be worse.
  }
}
