import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import {
  BACKLOG_STATE_ID,
  stateCategoryOf,
  statesWithBacklog,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import { Avatar, Button, Card, Chip, FireIcon, FlagIcon, LeafIcon, PlusIcon, SnowflakeIcon, useScrollEdges } from '@gisik-nokma/ui';
import type { ClientStateCache } from '../cache.js';
import type { DataSource } from '../data-source.js';
import { precheckEvent, type PrecheckResult } from '../precheck.js';
import { writeFailureCopy, writeFailureRefusalClass } from '../session-expired.js';
import { actorLabel, formatCardProvenance, formatDate } from '../provenance.js';
import { makeSubmittedFactory } from '../submit.js';
import type {
  BoardCard as BoardCardData,
  BoardColumn,
  BoardGroup,
  BoardView as BoardViewData,
} from '../view-types.js';
import { allBoardTargets, arrowTargets } from './board-arrows.js';
import { BoardPhonePicker, useActiveColumn, useFollowOpenMove } from './board-phone-picker.js';
import { usePhoneBoard } from './use-phone-board.js';
import { setCardDragImage } from './board-drag-image.js';
import { moveOutcome } from './board-moves.js';
import {
  EMPTY_SESSION,
  MoveStateContext,
  applyPendingCreates,
  applyPendingMoves,
  landingIndex,
  useMoveState,
  type FlightRect,
  type MoveState,
  type PendingCreate,
} from './board-move-state.js';
import {
  FLIGHT_MAX_AGE_MS,
  SPRING_DELAY_MS,
  createEdgeScroller,
  isOffscreen,
  prefersReducedMotion,
} from './board-motion.js';
import {
  NO_COLLAPSE_CHOICES,
  readWorkflowCollapse,
  rememberWorkflowCollapse,
  type WorkflowCollapseChoices,
} from '../preferences/workflow-collapse.js';
import {
  NO_COLUMN_CHOICES,
  columnCollapseKey,
  readColumnCollapse,
  rememberColumnCollapse,
  type ColumnCollapseChoices,
} from '../preferences/column-collapse.js';
import { BulkCloseDialog, type BulkCloseTicket } from './bulk-close-dialog.js';
import { formatRollup } from './rollup-text.js';
import { TransitionDialog, transitionOptions, type TransitionSubmission } from './transition-dialog.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';

export type BoardProps = {
  board: BoardViewData;
  onOpenTicket: (ticketId: string) => void;
  /**
   * Tickets whose `ticket.created` is in flight (smoothness T7, spec S5): each is drawn at once as a dimmed ghost
   * card with the key `…` at the end of its column, and replaced by the real card when the read shows the id
   * (`applyPendingCreates`). The shell owns the list and removes an entry when the write is refused.
   */
  pendingCreates?: readonly PendingCreate[];
  /**
   * The create affordance the empty board offers, and the reason it is
   * OPTIONAL rather than required.
   *
   * The words come first: an empty board must say something even where the
   * shell above it has no create flow to hand down. A required prop would force
   * every mount to pass one, and the mount with nothing to pass would pass a
   * no-op — a button that looks like a way out of an empty project and is not.
   * So the copy is unconditional and the button is not, and both arms are
   * tested (`board.test.tsx`): with a handler the button is there and clicking
   * it calls the handler; without one there is no button and the sentence is
   * still on screen.
   *
   * `selection` is OPTIONAL on every call (starting-status design, 2026-09-23):
   * the whole-board button (`emptyBanner`) and the empty-board banner call it
   * with none, exactly as before this parameter existed. A creatable
   * empty-COLUMN's own "Create ticket" calls it WITH one — `{workflowId,
   * stateId}`, that column's own identity — so the shell can pre-fill the
   * New-ticket dialog's type and status. Widening an existing required-arity
   * callback rather than adding a second prop: every call site already reads
   * `onCreateTicket === undefined` to decide whether the affordance renders at
   * all, and a second prop would have to agree with the first about that
   * every time either one changed.
   */
  onCreateTicket?: (selection?: { workflowId: string; stateId: string }) => void;
  /**
   * Whether `board` is a NARROWED view — the shell's client-side board filter
   * (`boardNarrowing` in `page.tsx`) has dropped some of this project's real
   * cards out of it — rather than the project's true, complete state.
   * OPTIONAL, following `onCreateTicket`'s own precedent immediately above: a
   * mount with nothing to say about narrowing passes nothing, and `Board`
   * behaves exactly as it did before this prop existed (Ruling 19 treats
   * `undefined` the same as `false`).
   *
   * Why it has to be a PROP rather than something `Board` derives on its own
   * (board-prototype-port Task 7 fix, Ruling 19, 2026-09-16 — found in review,
   * a cross-task interaction R6 and Task 4's narrowing each missed on their
   * own). `Board` never receives the unfiltered data: `page.tsx` hands it
   * `boardNarrowing.view`, already passed through `matchesBoardCard`. Task 4's
   * narrowing drops CARDS only, never a column or a group, so pre-R6 this was
   * harmless — the old gate read `board.groups.length`, which a card filter
   * never touches, so the narrowed-to-zero state could never reach it. R6's
   * `totalCards` fold reads the NARROWED cards, so without this prop a search
   * matching nothing would render `EMPTY_BOARD_COPY` — "No tickets here
   * yet — create one." — over a project that holds real tickets one row
   * beneath a strip reading "0 of 10 shown" with a removable chip: the page
   * contradicting itself on one screen, and "create one" pointing at exactly
   * the wrong remedy (the fix is clearing the filter, not adding a ticket).
   * `BoardColumn` (`view-types.ts`) carries no signal distinguishing these two
   * cases either, which is why `EMPTY_COLUMN_COPY`'s own docblock above
   * already gives up on a column-scoped answer — this prop is the whole-board
   * equivalent of that same admission, made where the wrong answer is loud
   * ("create one") rather than neutral ("no tickets in this column yet").
   *
   * Narrowed AND zero cards ⇒ suppress `EMPTY_BOARD_COPY`; the narrowing
   * strip above the board is already the true statement, and the rail still
   * draws with its per-column empty states. Not narrowed and zero cards ⇒ R6
   * exactly as built. `EMPTY_BOARD_COPY`'s text is unchanged either way — this
   * only changes WHEN it shows, never what it says.
   */
  isNarrowed?: boolean;
  /**
   * Whether the ONLY reason this board drew no cards is the epic rule (owner ruling,
   * 2026-09-20). OPTIONAL, the SAME precedent `onCreateTicket` and `isNarrowed` set
   * immediately above: **absent means `EMPTY_BOARD_COPY`**, so every mount written before
   * this prop existed reads exactly as it did, and a mount with nothing to say passes
   * nothing.
   *
   * ⚠ **IT EXISTS BECAUSE THE COMPONENT CANNOT WORK IT OUT, AND THAT IS MEASURED RATHER
   * THAN ASSUMED.** An all-epic board and a genuinely empty one reach `emptyBanner` with
   * **identical** state: the epic is dropped before `total` increments, so `totalCards`
   * is `0` for both, and `isNarrowed` is `false` for both because `#602` deliberately
   * chose not to call the epic drop a narrowing ("a permanently-false narrowing claim is
   * worse than the residual it buys"). A page spec rendering both fixtures asserts the
   * same constant from the same gate, with a one-task-card control proving the fixture
   * can produce a different outcome — so this is a real indirection, not a skipped
   * derivation. The caller holds it because it has `board.data` AND the narrowed view.
   *
   * **Only meaningful together with `totalCards === 0 && isNarrowed !== true`**, which is
   * where it is read: with the board drawing no cards and no filter in force, a dropped
   * epic is the whole explanation for the emptiness.
   */
  epicsHidden?: boolean;
  /**
   * The per-card `‹ ›` move arrows (board-prototype-port Task 13). OPTIONAL,
   * the SAME precedent `onCreateTicket` and `isNarrowed` already set on this
   * type immediately above: a mount with nothing to submit through passes
   * nothing, and `Board` renders exactly as it did before this capability
   * existed — no arrows drawn at all, never dead ones with no `dataSource`
   * behind them.
   */
  moves?: BoardMoveCapability;
  /**
   * TODAY, as an IST day string (`YYYY-MM-DD`), for the one thing on this
   * board that is a relation to the present rather than a claim about the
   * ticket: whether a card's due date has PASSED (ruling E5-2, 2026-09-21).
   *
   * OPTIONAL, the SAME precedent `onCreateTicket`, `isNarrowed` and
   * `epicsHidden` set above — and here the absence has a precise meaning
   * rather than merely a conservative one: **no clock, no late tone.** A mount
   * that passes nothing draws the due label in the ordinary tone, which is
   * what the List already does and for the reason its own CSS records
   * (`packages/ui/src/ui.css`, `.gn-list__due`): a danger tone with no clock
   * behind it would paint every past date the same colour as every future one.
   * Narrower than the truth, never wrong about it — the same direction the
   * replica's missing `cause` argues for.
   *
   * **WHY A PROP AND NOT A `new Date()` HERE.** The neighbouring date views do
   * not read a clock either: `calendar-view.tsx` and `timeline-view.tsx` are
   * HANDED `today` by the shell, and the surfaces that decide which day a claim
   * belongs to are held clock-free by `CLOCK_FREE_ROOTS`
   * (`test/helpers/clock-scan.ts`). A card's lateness is that same question one
   * surface over, so it joins the clock `apps/web`'s project page already owns
   * — one `istToday()` per render — rather than growing a second one that could
   * disagree with the Calendar and Timeline tabs about which day it is.
   */
  today?: string;
  /**
   * WHO is looking, for the ONE thing on this board that is remembered locally
   * (`preferences/workflow-collapse.ts`): which workflow groups they have
   * collapsed or expanded by hand.
   *
   * OPTIONAL, the SAME precedent `onCreateTicket`, `isNarrowed`, `epicsHidden`
   * and `today` set above, and here the absence is a decision rather than a
   * gap: **no person, no memory.** A mount that passes nothing reads no stored
   * record and writes none, which is what the storage module's own
   * signed-out sentinel (`''`) already means — so a mount with nobody attached
   * behaves exactly as this component did before the collapse existed, rather
   * than remembering a choice for whoever opens the board next.
   *
   * ⚠ **WHY `Board` IS HANDED THIS RATHER THAN TAKING IT FROM `moves`.** The
   * `moves` capability carries a `currentUserId` too, and reading it from there
   * would have been one prop cheaper — and wrong. It is present only on the
   * movable path, so the memory would then work on a board with move arrows
   * wired and silently not on the read-only one: two boards that look identical
   * and remember different things. This is the same shape `arrows`/`onDropCard`/
   * `bulkCloseFor` already take, where absence tracks a CAPABILITY; here the
   * capability is the session, and the session is not the move arrows.
   */
  currentUserId?: string;
};

/**
 * What a card's move arrows need in order to actually submit something,
 * bundled so `BoardProps` gains one optional field rather than five required
 * ones. Mirrors `TicketSheet`'s own `dataSource`/`cache`/`uploadEvidence`
 * props (`ticket-sheet.tsx`) — the SAME write path, reached from the board
 * instead of the sheet, so it needs the same inputs.
 *
 * `onMoved` is required (once `moves` itself is supplied) rather than relying
 * solely on `useLiveQuery`'s own stream-triggered refetch: `TicketSheet`'s
 * `submitTransition` calls `read.reload()` on success for the identical
 * reason — an explicit reload is immediate, where the debounced stream
 * refetch can lag up to 200ms behind a claim the person just watched
 * succeed.
 *
 * `BoardCard` carries no `fields: Record<string, FieldClaim>` — unlike
 * `ListRow`, which does. This is not an oversight this task introduces; the
 * port's own design spec says so in as many words, about the identical gap
 * ("Writes go through the transition gate" §, step 4): "the dialog needs
 * `ticketFields`... and `BoardCard` does not carry them." So every
 * `moveOutcome`/`TransitionDialog` call this capability drives passes `{}`
 * for `ticketFields` — see `MoveArrows`'s own docblock for why that is the
 * conservative direction, never the dangerous one.
 */
export type BoardMoveCapability = {
  dataSource: DataSource;
  workspaceId: string;
  currentUserId: string;
  onMoved: () => void;
  cache?: ClientStateCache;
  /**
   * ⚠ **THIS ONE TAKES A `ticketId`, AND `TicketSheetProps.uploadEvidence` DOES
   * NOT — the difference is forced, not stylistic.**
   *
   * `TicketSheet` is mounted for ONE ticket, so its host can close over the id
   * and the prop needs no parameter: `apps/web` supplies
   * `(file) => uploadAttachmentHttp(file, openTicketId)`. **`Board` is mounted
   * for the whole board and carries ONE capability object for every card.** A
   * closure over "the ticket" cannot exist here — there is no single ticket —
   * so an upload performed from a card's own `Move…` dialog has no way to name
   * what it is uploading TO unless the capability is told.
   *
   * **The ticket matters and is not incidental:** `POST /v1/attachments` takes
   * `ticketId` in its form body, the server writes `attachments.ticket_id` from
   * it, and the EVIDENCE GATE admits an upload as evidence only when
   * `attachments.id = $1 AND ticket_id = $2` — the id AND the ticket
   * (`apps/server/src/gates/evidence-gate.ts:44-50`). An uploader that guessed
   * the wrong ticket would not merely mis-file the bytes: the move it was
   * meant to unblock would be refused `attachment.evidence-unknown`.
   *
   * `MoveArrows` binds it per card (`card.ticketId`), so `TransitionDialog`'s
   * own prop stays `(file) => …` at both mounts and the dialog never learns
   * what a ticket id is.
   */
  uploadEvidence?: (file: File, ticketId: string) => Promise<{ attachmentId: string }>;
};

/**
 * The words an empty board says instead of drawing nothing.
 *
 * Pinned copy (Plan 6 Task 15b, item 4). Exported so the shell's own tests can
 * assert the same string this renders rather than a re-typed copy of it — two
 * spellings of one sentence is how a copy change passes a test it broke.
 */
export const EMPTY_BOARD_COPY = 'No tickets here yet. Create one.';

/**
 * The words an empty board says when NOBODY WIRED THE CREATE AFFORDANCE (E5… V1,
 * round-2 ruling, 2026-09-21).
 *
 * `EMPTY_BOARD_COPY` instructs — *"create one"* — and the button that would let a
 * person do it renders only when `onCreateTicket` is passed. **A call site that
 * passed nothing therefore told the reader to do something the mount made
 * impossible**, and at the time of the ruling that was every mount in the
 * product: `grep -rn 'onCreateTicket=' apps/web/app apps/web/src` answered 0
 * across 63 files, while the string appeared 18 times in this module. The
 * sentence is therefore chosen by whether the control exists, exactly as the
 * epics arm below is chosen by whether the epic rule is the reason.
 *
 * The alternative the ruling also allowed — wiring the shell's create region
 * through — is still the better end state and is NOT ruled out by this constant:
 * a mount that wires the handler gets `EMPTY_BOARD_COPY` back, and this string
 * then renders nowhere. What the constant prevents is a THIRD state, where the
 * copy instructs and the control is missing.
 */
export const EMPTY_BOARD_UNWIRED_COPY = 'No tickets here yet.';

/**
 * The words an empty board says when the ONLY reason it is empty is the epic rule
 * (owner ruling, 2026-09-20: *"epics should never show up in the board, timeline and
 * calendar views. they can only be in the list views"*).
 *
 * **A DIFFERENT SENTENCE FROM `EMPTY_BOARD_COPY` ABOVE, AND THE DIFFERENCE IS THE WHOLE
 * POINT.** *"No tickets here yet — create one."* is FALSE over an all-epic project: the
 * project is not ticket-less, it holds a ticket this view will not draw, and *"create
 * one"* names the one action that cannot help. This sentence names the cause instead,
 * and names where the work actually went — which is the same discipline the calendar's
 * two empty-month sentences already keep: **an absence must say which absence it is.**
 *
 * **IT MAY NOT BE REACHED BY A PROJECT THAT IS SIMPLY EMPTY.** An all-epic board and a
 * genuinely empty one are the SAME state at this component — the epic is dropped before
 * `total` increments, so both fold to zero cards and `isNarrowed` is false in both
 * (`#602` deliberately does not call the epic drop a narrowing). So the distinction is
 * carried in on the `epicsHidden` prop, computed one layer up where `board.data` and the
 * narrowed view are both in hand; **absent means the OLD sentence**, which keeps every
 * mount written before this prop existed reading exactly as it did. Reachability is
 * witnessed both ways: `13.1043` (all-epic) and `13.303`/`13.466` (genuinely empty).
 */
export const EMPTY_BOARD_EPICS_COPY = 'No tickets in this view. Epics appear in the List.';

/**
 * The words a single COLUMN says when it holds no cards of its own — a
 * different granularity from `EMPTY_BOARD_COPY` above (board-prototype-port
 * Task 7, R6). Deliberately not a re-spelling of it: both can render on the
 * same screen at once (R6, below), and a `getByText(EMPTY_BOARD_COPY)` query
 * must still resolve to exactly one element when they do.
 *
 * The text names no reason. `BoardColumn` (`view-types.ts`) carries only
 * `stateId`/`name`/`category`/`blocked`/`cards` — nothing distinguishing "this
 * state genuinely holds no tickets" from "the client-side board filter
 * (`filter/board-filter.ts`) narrowed it to zero".
 *
 * CORRECTED (final whole-branch review, Finding 3, 2026-09-16): this used to
 * say the narrowing pass "runs above this component... with data this
 * component was never given" — no longer true. `Board` itself HAS that
 * signal, since Ruling 19 (`isNarrowed`, `:79` above): the shell's
 * `boardNarrowing` already discloses an active filter through the `N of M
 * shown` count and its removable chips, and passes whether the view it
 * handed `Board` was narrowed. What is still true is narrower than the old
 * claim: `Board` does not thread `isNarrowed` down past itself into
 * `BoardGroupSection` (`:325-345`), which is what actually renders this
 * copy, once per empty column — so from THIS component's own vantage point
 * the data remains unavailable, even though it is no longer unavailable to
 * `Board` as a whole. Threading it the rest of the way is unscoped follow-up
 * work, not a structural impossibility; re-stating the shell's disclosure
 * here before that wiring exists would risk a second, unsynchronised copy of
 * the same fact — so the sentence says only what is true whether or not a
 * filter is active, exactly the discipline `EMPTY_BOARD_COPY`'s own docblock
 * already holds itself to.
 */
export const EMPTY_COLUMN_COPY = 'No tickets in this column.';

/**
 * The words an empty COLUMN says when the only reason it is empty is the epic rule
 * (owner ruling, 2026-09-20). The whole-board sentence one level up has its own twin —
 * see `EMPTY_BOARD_EPICS_COPY` — and the two are deliberately NOT re-spellings of each
 * other for the reason `EMPTY_COLUMN_COPY`'s own docblock already gives: both can render
 * on one screen, and a `getByText` query must still resolve to exactly one element.
 *
 * ⚠ **THIS SENTENCE HAS THE HARDEST REACHABILITY OF THE FOUR, AND THE REASON IS THE ONE
 * `EMPTY_COLUMN_COPY`'s DOCBLOCK ALREADY RECORDS.** That docblock concedes the column's
 * text names no reason because `BoardColumn` carries nothing distinguishing "this state
 * genuinely holds no tickets" from "a filter narrowed it to zero" — and justifies the
 * silence by saying the text is true *"whether or not a filter is active"*. The epic rule
 * breaks that justification, because it is not a filter and nothing on screen discloses
 * it: over an all-epic project there is no strip, no chip and no count. So the column
 * needs its own signal, and `BoardColumn` gains an OPTIONAL `epicsHidden` — additive, so
 * every existing constructor and every mount written before it still compiles and still
 * renders the old sentence.
 *
 * **IT FIRES ONLY WHEN NOTHING ELSE WAS REMOVED FROM THIS COLUMN.** A column emptied by
 * a filter AND by the epic rule takes the OLD text: "epics are why this is empty" would
 * be a half-truth, and `EMPTY_COLUMN_COPY` is the one written to survive not knowing.
 */
export const EMPTY_COLUMN_EPICS_COPY = 'No tickets in this column. Epics appear in the List.';

/**
 * The `dataTransfer` format a dragged card's ticket id travels under
 * (board-prototype-port Task 14, 2026-09-16). Exported for the same reason
 * `EMPTY_BOARD_COPY` above is: a test that hand-types `'text/plain'` on both
 * the `dragStart` and `drop` sides is one edit away from two spellings of
 * the same fact. Plain `'text/plain'` rather than a bespoke MIME-ish
 * string — every browser accepts it with no allowlist to maintain, and this
 * payload genuinely is nothing more than the ticket id as text.
 */
export const DRAG_TICKET_FORMAT = 'text/plain';

/**
 * A second, card-only `dataTransfer` type (styling refresh Plan A Task 5A).
 * `DRAG_TICKET_FORMAT` is `'text/plain'`, and any text selection dragged across
 * the page carries `text/plain` too. During `dragenter` a page can read a
 * drag's `types` but not its data, so the column highlight cannot ask "is this
 * a ticket id?" — it keys on this marker instead, which `dragstart` sets with
 * an empty value. The drop still reads the ticket id from
 * `DRAG_TICKET_FORMAT`, exactly as before.
 */
export const DRAG_CARD_MARKER = 'application/x-gisik-card';

/**
 * Ticket id → the exact `attemptMove` closure that card's own `MoveArrows`
 * instance built for its `‹ ›` buttons (board-prototype-port Task 14).
 *
 * **This is the whole drop mechanism, and it is deliberately not a second
 * decision point.** A drop's target (`toStateId`) comes from whichever
 * column it lands on — `BoardGroupWithMoves`'s own `handleDrop`, below —
 * and needs somewhere to submit through. Rather than re-deriving
 * `moveOutcome`/refusal/dialog/transport-error handling a second time for
 * drops, the dragged card's OWN `MoveArrows` registers its real
 * `attemptMove` here on every render (`MoveArrows`'s own `registerAttempt`
 * effect), and the column's drop handler looks it up by ticket id and calls
 * it — the identical function an arrow click calls, with the identical
 * state (`refusal`/`serverRefusal`/`transportError`/`dialog`) rendering
 * in the identical place, under that same card. A drop and an arrow can
 * therefore never disagree: they are one code path, reached from two input
 * events.
 *
 * Held by `Board`, not by each `BoardGroupWithMoves`, so a drag that starts
 * in one workflow group and ends on a column belonging to a DIFFERENT group
 * (a mixed-workflow board, more than one group) still finds the dragged card's
 * real registration — `attemptMove`'s own closure already carries that
 * card's TRUE workflow and `fromStateId`, so `moveOutcome` there correctly
 * names the alternatives from the ticket's OWN workflow rather than doing
 * nothing, which would be exactly the "drag failed for no reason" the
 * design spec's writes section forbids (a silent snap-back).
 *
 * A ticket id the registry has never seen (a stray `drop` with no real
 * `dragstart` behind it, or a card whose `MoveArrows` never mounted) is a
 * silent, inert no-op — `Map.get` on a missing key answers `undefined`, and
 * `handleDrop` does nothing further. There is no card to attach a refusal
 * to in that case, so this is the one outcome this feature does not
 * narrate; it is inert rather than wrong.
 */
type MoveRegistry = Map<string, (toStateId: string, from?: FlightRect) => void>;

/**
 * Does this workflow group hold a ticket anywhere?
 *
 * Asked of the GROUP'S OWN DATA — the `BoardColumn.cards` arrays `Board` was
 * handed — and never of the DOM. A `querySelectorAll` over rendered cards would
 * answer a different question with the same words ("no tickets in it"): it
 * would report a group as empty on the render where its columns are collapsed
 * for any other reason, which is the first render of every group that starts
 * collapsed. The view is the authority on what the group holds; the rendering
 * is what this decides.
 *
 * A group with NO columns answers `true` — `.every` over an empty array — and
 * that is the right answer rather than a degenerate one: a group declaring no
 * states holds no tickets, so it is exactly the case the owner's rule is
 * about, and `board.test.tsx`'s mixed-workflow fixture has one.
 */
function groupIsEmpty(group: BoardGroup): boolean {
  return group.columns.every((column) => column.cards.length === 0);
}

/**
 * The key a group's collapse choice is stored under. Exactly the key `Board`
 * gives the group in its own `.map()` — one group, one key, so a board that
 * re-fetches and re-orders its groups keeps each group's choice with the group
 * rather than with a position.
 */
function groupKey(group: BoardGroup): string {
  return `${group.workflowId}@${group.workflowVersion}`;
}

/**
 * `useLayoutEffect` in the browser, `useEffect` where there is no `document`.
 *
 * The standard alias, and it is here for the two reasons `Board`'s hydration
 * effect gives at length: the board is server-rendered, so a layout effect would
 * make React warn during SSR, and the memory it applies must land BEFORE the
 * first paint or an empty group is drawn open and then jumps shut.
 */
const useHydrationLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Columns are exactly the attached workflow's states — empty ones render too,
 * and a project mixing workflows gets one group per workflow, because merging
 * column sets would invent columns no definition declares (spec §7).
 *
 * Grouping here is a REARRANGEMENT, never a filter: every card the view was
 * given is rendered exactly once, whether the project's tickets sit under one
 * workflow or several. A grouping that drops a card is a filter wearing a
 * grouping's name, and the ticket it dropped is gone with nothing saying so.
 */
export function Board({ board: realBoard, onOpenTicket, pendingCreates, onCreateTicket, isNarrowed, epicsHidden, moves, today, currentUserId }: BoardProps) {
  /**
   * The shared drop registry (`MoveRegistry`'s own docblock above) —
   * created HERE, unconditionally, before any early return, because React's
   * Rule of Hooks requires every hook to run in the same order on every
   * render; gating this behind `moves !== undefined` would make the hook
   * itself conditional the moment a single mount ever toggled that prop.
   * Unused (never read, never written) on the `moves === undefined`
   * read-only path — a harmless empty `Map` sitting behind a ref nobody
   * reaches — the same shape `moves` itself is on that path.
   */
  const moveRegistryRef = useRef<MoveRegistry>(new Map());

  /**
   * THE OPTIMISTIC LAYER (owner, 2026-10-01: *"assume it is already a success and show the card to move to
   * the new column, if it fails for some reason, move it back"*). `realBoard` is what the read says;
   * `board` is what is drawn: the same view with every in-flight move already laid over it
   * (`applyPendingMoves`, pure). The overlay is view state only — nothing is written to the live query — and
   * `useMoveState` retires an entry only when `realBoard` shows the card in its target (or the write failed),
   * so a refetch that is merely stale can never flash a card back to its source. The move lifecycle (dialog,
   * refusal, latch) is held there too, because the card that started it is unmounted and remounted in the
   * target column. `board` shadows the read everywhere below; `realBoard` is named only where the DATA is
   * meant (the auto-expand rule).
   */
  const move = useMoveState(realBoard);
  const board = useMemo(
    () => applyPendingCreates(applyPendingMoves(realBoard, move.pending), pendingCreates ?? []),
    [realBoard, move.pending, pendingCreates],
  );
  /** Edge auto-scroll for a live drag (`board-motion.ts`): begun on a card's `dragstart`, ended by the drop, the dragend or unmount. */
  const scrollerRef = useRef<ReturnType<typeof createEdgeScroller> | null>(null);
  scrollerRef.current ??= createEdgeScroller();
  useEffect(() => () => scrollerRef.current?.end(), []);

  /**
   * What the LAST run of the auto-expand effect saw, per group: `true` where the
   * group was collapsed by its own default (empty, on a board with more than one
   * workflow). A ref rather than state, deliberately — this is bookkeeping about
   * a previous render, and putting it in state would make the rule's own memory
   * a second render with its own effects.
   */
  const collapseWasDefaultRef = useRef<Map<string, boolean>>(new Map());

  /**
   * THE COLUMN-LEVEL BULK CLOSE (`Close all (N)`, spec §8.3's Board bullet,
   * second wave Task 10). `null` = no opening; otherwise the tickets THAT
   * OPENING is about, snapshotted at click time so a later board reload cannot
   * rewrite a dialog already on screen.
   *
   * Declared HERE, above the `board.groups.length === 0` early return below,
   * for the Rule of Hooks reason `moveRegistryRef`'s own docblock gives: the
   * hook must run on every render, including the zero-groups one that returns
   * before the main JSX.
   */
  const [bulkClose, setBulkClose] = useState<BulkCloseTicket[] | null>(null);

  /**
   * THE WORKFLOW GROUPS' COLLAPSE CHOICES (owner request, 2026-09-23: *"in the
   * board, the workflow is collapsible. if the workflow has no tickets in it,
   * it is shown collapsed by default."*). The value is the state the person
   * CHOSE for that group — `true` expanded, `false` collapsed — keyed by
   * `groupKey`.
   *
   * ## What is held, and what is deliberately absent
   *
   * ONLY the choices a person made. A group nobody has touched has no entry
   * here at all, and its state is DERIVED from the group itself: an empty group
   * on a board with more than one workflow rests collapsed, everything else
   * rests expanded. The two are kept apart on purpose, and the reason is one
   * case — an EMPTY group that a ticket arrives in. A default collapse is not a
   * decision, so the arrival wins and the group opens, revealing the new work; a
   * collapse the person clicked IS a decision, so it holds, and the ticket waits
   * behind a heading they can open. Seeding this record with every group's
   * resolved state instead would erase the difference and force ONE answer onto
   * both, and either answer would be wrong for the other case (cases `13.1415`
   * and `13.1416` are the two arms).
   *
   * ## It is persisted, and to `localStorage` — not to the server
   *
   * `preferences/workflow-collapse.ts` owns the memory; this holds what it
   * returned and writes back through it. **The server is deliberately not
   * involved**: `ProjectViewPrefs` is a versioned, `.strict()`, server-owned
   * per-user document shared by the List and the Board, and an earlier reading
   * of this request sent the collapse there. The owner corrected it — *"by
   * persist i didnt mean to database/server. only on the local storage,
   * clientside"* — and the correction is worth stating rather than only
   * obeying: a collapse is one person's arrangement of one screen, needs no
   * other device, and replays on no replica, which is the same argument
   * amendment 14 makes one level up for view preferences as a whole.
   *
   * Declared HERE, above the `board.groups.length === 0` early return below,
   * for the Rule of Hooks reason `moveRegistryRef`'s own docblock gives.
   */
  const [groupChoices, setGroupChoices] = useState<WorkflowCollapseChoices>(NO_COLLAPSE_CHOICES);
  /**
   * The COLUMNS a person collapsed to a strip (styling refresh Plan A Task 5B;
   * owner ruling 2026-09-29, "all columns are collapsible"), keyed by
   * `columnCollapseKey(workflowId, stateId)`. Choices only, like `groupChoices`
   * and for the same reason, and a separate memory: collapsing every column
   * never collapses the group, and collapsing the group never touches these.
   * There is no default rule here — an absent key is an expanded column.
   */
  const [columnChoices, setColumnChoices] = useState<ColumnCollapseChoices>(NO_COLUMN_CHOICES);

  /**
   * Reads the memory ONCE per project, and the two choices here are both about
   * the fact that this tree is server-rendered:
   *
   *   - **NOT a `useState` initialiser.** `window` is not there on the server, so
   *     the server would answer the default and the browser's FIRST render would
   *     answer the stored record — two different trees, and React hydrating one
   *     against the other.
   *   - **NOT a passive `useEffect`.** Passive effects run after the browser may
   *     have painted, so an empty group would be drawn open and then jump shut,
   *     which is the flicker defect class case `13.1385` records on this very
   *     page. A LAYOUT effect runs before paint, so the first paint already
   *     shows what the person will keep looking at.
   *
   * `useHydrationLayoutEffect` is `useEffect` where there is no `window`, for
   * the ordinary reason: React warns about a layout effect during SSR and this
   * one has nothing to do there anyway.
   *
   * `currentUserId` is `undefined` on a mount with no session wired, and `''` is
   * this shell's signed-out sentinel; the storage module answers the default for
   * both and writes for neither, so a board with no person attached reads and
   * remembers nothing rather than remembering it for whoever comes next.
   */
  useHydrationLayoutEffect(() => {
    setGroupChoices(readWorkflowCollapse(currentUserId ?? '', board.projectId));
    setColumnChoices(readColumnCollapse(currentUserId ?? '', board.projectId));
  }, [currentUserId, board.projectId]);

  /** Records the person's choice for ONE column (`expanded` is the state they asked for) and writes it through. */
  const toggleColumn = (workflowId: string, stateId: string, expanded: boolean): void => {
    const next = { ...columnChoices, [columnCollapseKey(workflowId, stateId)]: expanded };
    setColumnChoices(next);
    rememberColumnCollapse(currentUserId ?? '', board.projectId, next);
  };

  /**
   * Is this group collapsed BY ITS DEFAULT — i.e. by the owner's rule and not by
   * anybody's choice?
   *
   * TWO terms, and the second one is the newer ruling's. An empty group rests
   * collapsed only where there is another workflow to distinguish it from: the
   * owner's answer on 2026-09-23 was *"single workflow → UNCOLLAPSED, including
   * when it is empty"*, because a lone empty workflow collapsed would be a board
   * showing a heading and nothing else, hiding the per-column `Create ticket`
   * buttons that are the only thing to act on there. A LONE group is therefore
   * never collapsed by default — and note that this is about the DEFAULT only:
   * a person may collapse a lone workflow by hand, and case `13.1413` holds both
   * halves of that apart.
   *
   * It reads the group's own `cards` and never the DOM, and it needs no
   * `useMemo`: it is two array reads per group.
   */
  const defaultCollapsed = (group: BoardGroup): boolean =>
    board.groups.length > 1 && groupIsEmpty(group);

  /** The state ONE group is shown in: the person's choice first, the default second. */
  const expandedFor = (group: BoardGroup): boolean =>
    groupChoices[groupKey(group)] ?? !defaultCollapsed(group);

  /**
   * Records the person's OPPOSITE choice for one group and writes it through.
   *
   * The next value is built from `expandedFor` — the same expression the render
   * reads — rather than from a second derivation, so a toggle can never disagree
   * with what was on screen when it was clicked.
   */
  const toggleGroup = (group: BoardGroup): void => {
    const next = { ...groupChoices, [groupKey(group)]: !expandedFor(group) };
    setGroupChoices(next);
    rememberWorkflowCollapse(currentUserId ?? '', board.projectId, next);
  };

  /**
   * The auto-expand rule (owner ruling, 2026-09-23): *"when a ticket arrives in
   * a group that is collapsed-because-empty, the group expands itself, and that
   * expansion is written through like any other."*
   *
   * ## One shot, and the guard is the point
   *
   * This is a TRANSITION rule, not a rule about a state: the condition it fires
   * on stops holding the moment it fires, because the group it opens is no
   * longer empty. Two guards hold that independently, and both are needed —
   * `previous` is what the last effect run SAW (so a re-read of the same board,
   * which a stream frame triggers constantly, cannot re-fire), and the
   * `Object.hasOwn` term is what the write itself leaves behind (the adopted
   * `true` is now a choice, so the group is out of this rule for good). Without
   * the first, every frame of the stream would call `localStorage.setItem`; a
   * write storm against a synchronous, main-thread store is the same defect the
   * server-door version of this rule would have had, without the network to
   * slow it down.
   *
   * ## It cannot undo a person's collapse, and the SHAPE is what guarantees it
   *
   * The `Object.hasOwn(groupChoices, key)` term is not a second opinion about
   * emptiness — it is the reconciliation the ruling asked for by name: *"if your
   * stored shape cannot tell collapsed by the default from collapsed
   * deliberately by a person, say so and propose one that can."* The shape does
   * tell them apart, because `groupChoices` holds ONLY choices: a group absent
   * from it was never collapsed by anybody, and a group present with `false` was.
   * So a deliberate collapse has a key here and this rule never touches it,
   * while an empty-default collapse has none and is exactly what the rule is
   * for. A shape that stored resolved states would have erased the difference
   * and this rule would have silently reopened a group the person had shut.
   *
   * ## A lone group is out of scope by construction
   *
   * `defaultCollapsed` already requires `groups.length > 1`, and the rule reads
   * that same predicate rather than re-deriving emptiness: a lone group is never
   * collapsed by default, so a ticket arriving in one is not a transition this
   * rule has anything to say about.
   */
  useEffect(() => {
    const previous = collapseWasDefaultRef.current;
    const next = new Map<string, boolean>();
    let adopted: WorkflowCollapseChoices | null = null;

    for (const group of realBoard.groups) {
      const key = groupKey(group);
      const wasCollapsedByDefault = previous.get(key) === true;
      next.set(key, defaultCollapsed(group));
      if (
        wasCollapsedByDefault &&
        !groupIsEmpty(group) &&
        !Object.hasOwn(groupChoices, key)
      ) {
        adopted = { ...(adopted ?? groupChoices), [key]: true };
      }
    }

    collapseWasDefaultRef.current = next;
    if (adopted === null) return;
    setGroupChoices(adopted);
    rememberWorkflowCollapse(currentUserId ?? '', board.projectId, adopted);
    // `groupChoices` is a dependency and not a stale capture: the adopt branch
    // reads it, and the effect must see the version the render it ran under saw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realBoard, groupChoices, currentUserId]);

  /**
   * Opens the dialog on ONE column's cards, in the column's own render order —
   * and does NOTHING while an opening is already on screen.
   *
   * ## Why the swap is refused rather than served
   *
   * `BulkCloseDialog` states its own precondition at the top of its docblock:
   * *"a parent that swaps `tickets` while the dialog stays OPEN (no `open`
   * transition) is not covered by the reset … **Both consumers this task names
   * open and close it, so it cannot arise for them.**"* That second sentence is
   * a claim about THIS component, and before this guard it was false. `open` is
   * `bulkClose !== null`, so writing a second column's tickets into a non-null
   * `bulkClose` is a swap with no `open` transition: the dialog's
   * `useEffect(…, [open])` never fires, and the PREVIOUS opening's `closedIds`
   * and `failures` survive against a ticket list they do not describe. The
   * concrete failure is a FULL success that does not clear — column B closes
   * completely, but `closedIds` from column A still holds, so those stale ids
   * are subtracted from B's `pending`, `committed.length < tickets.length`, and
   * the dialog stays mounted with a `Could not close` row naming a ticket from
   * the other column and no confirm left to press.
   *
   * ## Why not the two obvious alternatives
   *
   * **A `key` on the dialog — REMOUNTING IS WORSE HERE, not merely different.**
   * A fresh mount DOES reset `closedIds`/`failures`, and that is exactly what
   * makes it tempting. But the attempt token lives in `attemptRef`, on the
   * INSTANCE; a remount destroys that instance and nothing bumps its token, so
   * an answer still in flight from the old opening passes its own (unchanged)
   * token check and calls the OLD closure's `onClosed` — the precise defect case
   * 13.787 exists to prevent, and the very thing the dialog's docblock says a
   * fresh mount cannot fix (*"the stale closure still holds the OLD `onClosed`
   * prop and calls it"*). A fix for one stale-state bug that re-opens the
   * late-callback bug is not a fix.
   *
   * **Closing through `null` first — does not work.** Two `setState` calls in
   * one handler are batched into one render, so `bulkClose` goes straight from
   * A's tickets to B's with `open` true throughout. The transition has to be a
   * rendered `open: true → false → true`, which one click cannot produce.
   *
   * So the swap is refused, and refusing it is the honest reading of what the
   * surface IS: `Dialog` renders `aria-modal="true"` over a full-viewport scrim
   * that owns the screen. A column action reached while a dialog is open has
   * been reached *behind a modal* — a keyboard-focus escape, not a legitimate
   * second interaction — and the correct response to that is to ignore it, not
   * to serve it and corrupt the open dialog's state. Case 13.793 holds it.
   *
   * (Dropping `aria-modal`'s focus escape itself is the shared `Dialog`'s
   * business — it ships no focus trap and no portal — and is recorded as a
   * named follow-on rather than repaired from here.)
   */
  const openBulkClose = (column: BoardColumn): void => {
    setBulkClose((current) => {
      if (current !== null) return current;
      return column.cards.map((card) => ({ ticketId: card.ticketId, title: card.title }));
    });
  };

  /**
   * WHAT A CLOSE DOES TO `bulkClose` — AND WHY THE CLEAR IS CONDITIONAL.
   *
   * `BulkCloseDialog` never dismisses itself (its own docblock: the consumer
   * owns the dismissal), so the board has to decide, and the decision has two
   * halves that pull in opposite directions:
   *
   *   - ON A FULL SUCCESS the dialog must LEAVE. `moves.onMoved()` alone
   *     reloads the board and leaves the dialog mounted and empty — every
   *     ticket closed, `pending` empty, nothing but a Cancel left to press.
   *     Clearing `bulkClose` is what turns `open` false.
   *   - ON A PARTIAL CLOSE it must STAY. Spec §8.3's Board bullet is one
   *     sentence carrying both halves: *"Per-ticket refusals … stay listed;
   *     the rest close and the board reloads."* Clearing here would unmount the
   *     dialog and destroy the `Could not close` rows the same sentence
   *     requires it to keep on screen.
   *
   * `onClosed` fires for BOTH (it is called whenever at least one ticket
   * committed, so a partial always reaches this handler), which is exactly why
   * the test cannot be "was `onClosed` called". It is `closedIds.length ===
   * tickets.length`: every ticket this opening listed came back committed.
   *
   * The reload is UNCONDITIONAL — "the rest close and the board reloads" holds
   * on both outcomes, and the committed tickets are gone from the server's
   * board whether or not their siblings refused.
   *
   * Recorded at this length because the plan's text says only `onClosed` →
   * `moves.onMoved()`, and the task's own dispatch said to clear `bulkClose`
   * unconditionally: an unconditional clear satisfies both and silently deletes
   * half of §8.3 from this surface. Case 13.792 is the witness that holds it.
   */
  const handleBulkClosed = (closedIds: string[]): void => {
    moves?.onMoved();
    setBulkClose((current) =>
      current !== null && closedIds.length === current.length ? null : current,
    );
  };

  /**
   * THE WHOLE-BOARD SENTENCE IS GATED ON ZERO CARDS, NOT ZERO GROUPS — AND NOT
   * ON A NARROWED VIEW (board-prototype-port Task 7, Ruling R6, 2026-09-16,
   * widening Plan 6 Task 15b item 4's original `board.groups.length === 0`
   * gate; Ruling 19, same day, adding the `isNarrowed` guard).
   *
   * `groups.length === 0` implies `totalCards === 0` — an empty `groups` array
   * folds to zero regardless of what its (nonexistent) columns would have held
   * — so gating on the total is a strict SUPERSET of the old gate, never a
   * replacement of its meaning: the zero-groups case below still takes this
   * branch, for the exact reason it always did, and `EMPTY_BOARD_COPY` is
   * unchanged.
   *
   * What the superset ADDS: a project with a workflow attached and zero
   * tickets in it — `groups.length === 1`, every column empty — used to skip
   * the sentence and draw a silent rail of empty column trays. Columns are
   * exactly the attached workflow's states (`:38` below) and empty ones render
   * too, so nothing on screen ever said "no tickets" for that project; a page
   * that had loaded, had refused nothing, and said nothing, one layer under
   * the case this branch was first written to catch. R6 closes it: the
   * sentence renders whenever `totalCards === 0`, regardless of `groups.length`.
   *
   * `&& isNarrowed !== true` (Ruling 19) is not part of the superset — it is a
   * correction to it. `totalCards` folds `board`, which `page.tsx` hands over
   * ALREADY narrowed (`boardNarrowing.view`, cards dropped by the client-side
   * filter, never columns or groups). R6 as first built could not tell "this
   * project truly has no tickets" from "a filter hid all of them", and said
   * `EMPTY_BOARD_COPY` — "create one" — for both, which is actively wrong in
   * the second case: the remedy is clearing the filter, sitting right there in
   * the narrowing strip's removable chip, not creating a ticket. `isNarrowed`
   * is `Board`'s only way to tell the two apart, since neither `BoardView` nor
   * `BoardColumn` carries the distinction on its own — see the prop's own
   * docblock above.
   */
  const totalCards = board.groups.reduce(
    (sum, group) => sum + group.columns.reduce((count, column) => count + column.cards.length, 0),
    0,
  );
  const emptyBanner =
    totalCards === 0 && isNarrowed !== true ? (
      <>
        {/*
          WHICH SENTENCE, AND WHY IT IS A PROP RATHER THAN A DERIVATION. `epicsHidden` is
          the ONLY thing separating "this project holds nothing" from "this project holds
          an epic this view will not draw" — the two are otherwise identical here (see the
          prop's own docblock). Absent ⇒ the original sentence, unchanged.
        */}
        <p className="gn-board__empty-copy">
          {epicsHidden === true
            ? EMPTY_BOARD_EPICS_COPY
            : onCreateTicket === undefined
              ? EMPTY_BOARD_UNWIRED_COPY
              : EMPTY_BOARD_COPY}
        </p>
        {onCreateTicket !== undefined ? (
          // NOT `onClick={onCreateTicket}` (starting-status design, 2026-09-23):
          // `onCreateTicket` now takes an optional `selection`, and a bare
          // handler reference would hand React's click event to that
          // parameter instead. This button has no column to name, so it calls
          // with no argument at all, exactly as it did before the parameter
          // existed.
          <button
            type="button"
            className="gn-board__empty-create"
            onClick={() => onCreateTicket()}
          >
            {/* The same `+` the header's Create buttons carry (P-T13, 22.245), so every Create action reads alike.
                Still NOT primary: the header's Create ticket is the view's one (22.150). */}
            <PlusIcon />
            Create ticket
          </button>
        ) : null}
      </>
    ) : null;

  /**
   * ZERO GROUPS IS A SENTENCE, NOT AN EMPTY DIV (Plan 6 Task 15b, item 4).
   *
   * `mapBoardView` builds groups by folding the server's flat `columns` array,
   * so a response with `columns: []` yields `groups: []` — and that response is
   * ORDINARY rather than exceptional. `GET /v1/projects/:projectId/board`
   * answers 200 with an empty board to a workspace member who is not on a
   * project-mode project (`routes/board.ts`, the gate's docblock says so at
   * length), and to any project whose tickets this viewer cannot see. Before
   * this branch, `board.groups.map` over `[]` rendered an empty `<div
   * class="gn-board">`: a page that had loaded, had refused nothing, and said
   * nothing — indistinguishable from a board still painting.
   *
   * The copy says "no tickets", NOT "no columns" and not "no workflow". The
   * board's columns come from the attached workflow, and Plan 5's Open question
   * 7 settled that the server will not invent default columns for a project
   * whose workflows this viewer may not read — inventing them would leak a
   * restricted project's structure. So the client cannot tell "this project has
   * no work in it" from "this viewer sees none of it", and the sentence is
   * written to be true of both: it reports what is on this screen and makes no
   * claim about the project.
   *
   * This is the ONLY case with no rail — there are no columns to draw. R6's new
   * case (`groups.length > 0`, `totalCards === 0`) renders `emptyBanner` ABOVE
   * a rail that still draws every column, below.
   */
  if (board.groups.length === 0) {
    return <div className="gn-board gn-board--empty">{emptyBanner}</div>;
  }
  return (
    <MoveStateContext.Provider value={move}>
    <div
      className="gn-board"
      onDragStart={(event) => {
        if (isCardDrag(event)) scrollerRef.current?.begin();
      }}
    >
      {emptyBanner}
      {board.groups.map((group) => {
        const key = groupKey(group);
        /**
         * The group's state on this render: the person's choice if they made
         * one, and otherwise the default derived from the group's own data —
         * `expandedFor`'s own docblock carries why the two are kept apart.
         */
        const expanded = expandedFor(group);
        // TWO PATHS, not a prop threaded through one component — see
        // `BoardGroupWithMoves`'s own docblock for why: it calls a hook
        // (`useLiveQuery`) to fetch this group's `WorkflowDef`, and a hook
        // cannot live inside `Board`'s own `.map()` body, conditionally or
        // otherwise. Which path runs is decided ONCE here, from `moves`
        // itself — never per group — so this is an ordinary branch between
        // two components, not a hook called conditionally within one.
        return moves !== undefined ? (
          <BoardGroupWithMoves
            key={key}
            group={group}
            expanded={expanded}
            onToggleWorkflow={() => toggleGroup(group)}
            columnChoices={columnChoices}
            onToggleColumn={toggleColumn}
            onOpenTicket={onOpenTicket}
            onCreateTicket={onCreateTicket}
            moves={moves}
            moveRegistry={moveRegistryRef}
            bulkCloseFor={openBulkClose}
            today={today}
          />
        ) : (
          <BoardGroupSection
            key={key}
            group={group}
            expanded={expanded}
            onToggleWorkflow={() => toggleGroup(group)}
            columnChoices={columnChoices}
            onToggleColumn={toggleColumn}
            onOpenTicket={onOpenTicket}
            onCreateTicket={onCreateTicket}
            arrows={null}
            onDropCard={null}
            canDropOn={null}
            bulkCloseFor={null}
            today={today}
          />
        );
      })}
      {/*
       * ONE dialog for the whole board, not one per column — the plan's own
       * "renders `BulkCloseDialog` once", and the shape `BulkCloseDialog`'s
       * attempt-token docblock assumes (it survives a dismissal and is toggled
       * by `open`, rather than being unmounted and remounted).
       *
       * NOT rendered at all on the `moves`-less path: the dialog needs a
       * `dataSource`, a `workspaceId` and a `currentUserId`, and `moves` is the
       * only thing `Board` carries that knows them. That path has no
       * `Close all` button either (`bulkCloseFor` is `null` below), so the two
       * absences are the same absence.
       */}
      {moves !== undefined ? (
        <BulkCloseDialog
          open={bulkClose !== null}
          tickets={bulkClose ?? []}
          dataSource={moves.dataSource}
          workspaceId={moves.workspaceId}
          currentUserId={moves.currentUserId}
          onClose={() => setBulkClose(null)}
          onClosed={handleBulkClosed}
        />
      ) : null}
    </div>
    </MoveStateContext.Provider>
  );
}

/**
 * The column rail for ONE workflow group — extracted from `Board`'s own
 * render (board-prototype-port Task 13) so the exact same JSX serves both
 * the plain read-only board and `BoardGroupWithMoves` below. `arrows` is the
 * ONLY axis of difference between the two paths: precomputed by the caller
 * as `(card, fromStateId) => ReactNode`, or `null` when no move capability
 * is wired, so it renders identically either way except for what `arrows` hands
 * back per card. (It holds one piece of view state, the column being dragged
 * over — Task 5A — which is inert without `onDropCard`.)
 */
/** True when a drag carries a board card (the marker `dragstart` sets), not merely `text/plain`. */
/**
 * The card being dragged, as its OWN workflow group knows it (board drag fixes
 * D2, owner 2026-09-30). During `dragover`/`dragenter` a browser hides a drag's
 * DATA and shows only its `types`, so a target column cannot ask which card is
 * over it, or how tall — the source slot tells the group at `dragstart`, and the
 * group clears it on `drop` and `dragend`. `height` is measured BEFORE the source
 * turns into a placeholder, so the target's placeholder is the card's own size.
 */
type BoardDrag = { ticketId: string; fromStateId: string; height: number };

function isCardDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types ?? []).includes(DRAG_CARD_MARKER);
}

function BoardGroupSection({
  group,
  expanded,
  onToggleWorkflow,
  columnChoices,
  onToggleColumn,
  onOpenTicket,
  onCreateTicket,
  arrows,
  onDropCard,
  canDropOn,
  bulkCloseFor,
  today,
}: {
  group: BoardGroup;
  /**
   * Whether this group's columns are on screen. OWNED BY `Board` and threaded
   * through unchanged — the state does not live here, and must not: the
   * default depends on emptiness, and the two paths below would then each have
   * to derive it.
   */
  expanded: boolean;
  /** The person's opposite choice. `Board`'s `toggleGroup` owns what that means. */
  onToggleWorkflow: () => void;
  /**
   * The person's COLUMN choices (Task 5B), owned by `Board` for the reason
   * `expanded` is: one memory, and both render paths must agree. `false` under
   * `columnCollapseKey(workflowId, stateId)` is a column collapsed to a strip.
   */
  columnChoices: ColumnCollapseChoices;
  /** `expanded` is the state the person asked for. `Board`'s `toggleColumn` records and remembers it. */
  onToggleColumn: (workflowId: string, stateId: string, expanded: boolean) => void;
  onOpenTicket: (ticketId: string) => void;
  onCreateTicket?: (selection?: { workflowId: string; stateId: string }) => void;
  arrows: ((card: BoardCardData, fromStateId: string) => ReactNode) | null;
  /**
   * Board-prototype-port Task 14. `null` on the plain, `moves`-less path —
   * the SAME "capability absent, not a dead stub" precedent `arrows` itself
   * already sets immediately above. Non-null, a column becomes a real drop
   * target: `BoardGroupSection` knows nothing about
   * `moveOutcome` or the registry — it only has somewhere to hand the event
   * and a `toStateId`, mirroring exactly how it already treats `arrows`.
   */
  onDropCard: ((event: DragEvent<HTMLElement>, toStateId: string) => void) | null;
  /**
   * Whether a card in `fromStateId` may move to `toStateId` at all (board drag
   * fixes D2) — `moveOutcome`'s own availability, the decision the arrows use,
   * handed over as a question so this component still knows nothing about
   * workflows. `null` where `onDropCard` is (no workflow definition yet, or no
   * move capability): a column then cannot tell a legal target from an illegal
   * one and draws neither a placeholder nor a refusal.
   */
  canDropOn: ((fromStateId: string, toStateId: string) => boolean) | null;
  /**
   * The column-level bulk close (spec §8.3's Board bullet, second wave Task
   * 10). `null` on the plain, `moves`-less path — the SAME "capability absent,
   * not a dead stub" precedent `arrows` and `onDropCard` set above, and the
   * same absence: the dialog `Board` opens needs a `dataSource`/`workspaceId`/
   * `currentUserId` that only `moves` carries, so a board with no move
   * capability has nothing to open a bulk close WITH. Non-null, every TERMINAL
   * column holding at least one card gains one `Close all (N)` button, and
   * `BoardGroupSection` still knows nothing about the dialog itself: it hands
   * back the whole column and lets the caller decide, exactly as `onDropCard`
   * hands back an event and a `stateId`.
   */
  bulkCloseFor: ((column: BoardColumn) => void) | null;
  /** `Board`'s own `today`, threaded through unchanged — see its prop docblock. */
  today?: string;
}) {
  /**
   * The column being dragged over (Task 5A) — OUTLINED, and (board drag fixes
   * D2, owner 2026-09-30, superseding plan D25's "outline only": the landing slot
   * is knowable, see `landingIndex`) a LEGAL target also holds a same-size
   * placeholder at that slot, while an illegal one draws the "can't drop here"
   * state instead. `dragleave` fires whenever the pointer moves onto a child, so
   * entering is counted per column and all of it clears only when the count
   * returns to zero.
   */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const depthRef = useRef(new Map<string, number>());
  /** The card being dragged from THIS group, or `null` (another group's drag shows nothing here). */
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  /** What a column is to the drag over it: its own column, a legal target, an illegal one, or unknown. */
  const verdictOf = (stateId: string): 'own' | 'legal' | 'refused' | 'unknown' =>
    drag === null || canDropOn === null
      ? 'unknown'
      : drag.fromStateId === stateId
        ? 'own'
        : canDropOn(drag.fromStateId, stateId)
          ? 'legal'
          : 'refused';
  /**
   * Focus follows a column toggle (Task 5B): the control that was pressed
   * unmounts with its branch, so focus would fall to `<body>`. The handler
   * records where it should land; the layout effect below moves it after the
   * branch has swapped.
   */
  const pendingFocusRef = useRef<{
    stateId: string;
    target: 'strip' | 'collapse';
    /** Where the page and the rail were BEFORE the toggle (board drag fixes D3). */
    scrollX: number;
    scrollY: number;
    railLeft: number;
  } | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  // The rail scrolls sideways: `.gn-scroll-fade` reads these two attributes so a column running off an edge shows it.
  const railEdgesRef = useScrollEdges<HTMLDivElement>('x', railRef);
  // Mobile plan FD8: on a phone the rail shows one column at a time (CSS scroll-snap) with a picker above it, and
  // the column collapse is not applied — a collapsed column renders a strip INSTEAD of its cards, so only the
  // DOM can expand it. The person's stored choices are left alone: the same memory collapses the column again
  // the moment the screen is wide enough.
  const phone = usePhoneBoard();
  const { activeStateId, pick: pickColumn } = useActiveColumn(
    railRef,
    group.columns.map((column) => column.stateId),
  );
  // U-T7 fix 1 (23.126): the column that holds a card with an open Move dialog or a notice is the one shown, so
  // neither is ever in a `hidden`, `inert` column. `Dialog` does not portal and the card is drawn in its landing column.
  const sessions = useContext(MoveStateContext)?.sessions;
  const heldIn = !phone || sessions === undefined
    ? null
    : (group.columns.find((column) =>
        column.cards.some((card) => {
          const held = sessions[card.ticketId];
          return held !== undefined && (held.dialog !== null || held.refusal !== null || held.serverRefusal !== null || held.transportError !== null);
        }),
      )?.stateId ?? null);
  useFollowOpenMove(heldIn, activeStateId, pickColumn);
  useHydrationLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) return;
    pendingFocusRef.current = null;
    const section = [...(railRef.current?.querySelectorAll('section') ?? [])].find(
      (candidate) => candidate.getAttribute('data-testid') === `board-column-${pending.stateId}`,
    );
    const control = section?.querySelector(
      pending.target === 'strip' ? '.gn-board__column-strip' : '.gn-board__column-collapse',
    );
    // `preventScroll`: a bare `focus()` scrolls the new control into view, and a strip
    // stretches to the rail's height — so collapsing a column scrolled the page (owner, 2026-09-30).
    if (control instanceof HTMLElement) control.focus({ preventScroll: true });
    // Belt and braces: the swap itself can shift the layout under the page. Put back what moved
    // (and only what moved — a page nothing touched is not scrolled at all).
    if (window.scrollY !== pending.scrollY) window.scrollTo({ left: pending.scrollX, top: pending.scrollY, behavior: 'instant' });
    const rail = railRef.current;
    if (rail !== null && rail.scrollLeft !== pending.railLeft) rail.scrollLeft = pending.railLeft;
  });
  const setColumnExpanded = (stateId: string, expandedNow: boolean): void => {
    pendingFocusRef.current = {
      stateId,
      target: expandedNow ? 'collapse' : 'strip',
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      railLeft: railRef.current?.scrollLeft ?? 0,
    };
    onToggleColumn(group.workflowId, stateId, expandedNow);
  };
  /**
   * SPRING-LOADED COLUMNS (owner, 2026-10-01: *"if dragged over a collapsed column and remained for a bit,
   * the column should temporarily open up. if the drag is moved out of the column it may be collapsed
   * again. if it is dropped there, keep column open"*). The one column a drag has held open, or `null`.
   * It is NOT the collapse memory: nothing is written until a card is dropped there.
   *
   * `armed` is the column the drag is over when that column is collapsed BY CHOICE and a drop there is
   * legal — an illegal column shows "can't drop" as it always did and never springs. The effect re-runs only
   * when `armed` changes, which is exactly "moved into / out of a collapsed column": it re-collapses
   * whatever was open (`setSpringOpen(null)`), and starts a fresh `SPRING_DELAY_MS` wait for the new one. A
   * leave before the wait is over clears the timer in the cleanup, so nothing opens.
   */
  const armed =
    dropTarget !== null &&
    columnChoices[columnCollapseKey(group.workflowId, dropTarget)] === false &&
    verdictOf(dropTarget) === 'legal'
      ? dropTarget
      : null;
  // Clearing `dropTarget` (leave, drop, Esc, dragend) is what puts a sprung column back: `armed` goes null and this
  // effect's first line closes whatever was open. Nothing else needs to reach `setSpringOpen`.
  const [springOpen, setSpringOpen] = useState<string | null>(null);
  useEffect(() => {
    setSpringOpen(null);
    if (armed === null) return;
    const timer = setTimeout(() => setSpringOpen(armed), SPRING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  // A drag that ends without reaching this rail's own `onDragEnd` — Esc in ANOTHER workflow group, or a
  // drop whose source card unmounted optimistically (so its `dragend` fires on a detached node) — still
  // has to put the springs and the outline away.
  useEffect(() => {
    if (dropTarget === null && springOpen === null && drag === null) return;
    const clear = (): void => {
      depthRef.current.clear();
      setDropTarget(null);
      setDrag(null);
    };
    document.addEventListener('dragend', clear);
    document.addEventListener('drop', clear);
    return () => {
      document.removeEventListener('dragend', clear);
      document.removeEventListener('drop', clear);
    };
  }, [dropTarget, springOpen, drag]);

  /**
   * The rail's id, which the heading's button points at with `aria-controls`.
   * Built from the group's own identity rather than from an index, so a
   * re-ordered board cannot leave a button pointing at a sibling's rail.
   */
  const railId = `board-rail-${group.workflowId}-${group.workflowVersion}`;
  /**
   * ⚠ DECISION 1 OF 3, MADE HERE: **every group gets a heading, a lone workflow
   * included** — so a lone workflow has something to click.
   *
   * The heading used to render only where a board had more than one workflow
   * group, and that gate is GONE rather than moved. The owner's ruling on
   * 2026-09-23 is that the group is
   * collapsible even when it is the only one (*"whether a lone workflow now
   * grows a heading where it had none is still yours, but it must end up with
   * something to click, since it is collapsible"*), and the heading IS the
   * control: the alternative was a second control beside an unnamed column set,
   * with its own label and its own idiom, for a workflow the board would then
   * never name. One idiom serves both cases, and the lone workflow gains the
   * name it never had.
   *
   * ⚠ **WHAT THE DEFAULT IS, AND WHAT IT IS NOT.** Widening the gate does NOT
   * widen the empty-group rule: a lone group rests EXPANDED even when it is
   * empty (`Board`'s `defaultCollapsed` carries the two-term default and why).
   * The trap the brief named — a project with one workflow and no tickets
   * collapsing to a heading over nothing — is answered there rather than here,
   * and it is answered TWICE over: this component renders the columns whenever
   * `expanded` is true, and `Board` never derives `false` for a lone group.
   *
   * The heading is still a disclosure, so it is still a `<button>` inside the
   * `<h2>` — the WAI-ARIA pattern, and this file still renders exactly ONE
   * heading of the workflow family, which `heading-outline.test.ts` counts in
   * the raw source. ⚠ That count is over the FILE, comments included, so this
   * docblock must not spell the heading tag and its class together — the prose
   * would be counted as a second heading and the case would read it as one.
   */
  return (
    <section className="gn-board__group">
      <h2 className="gn-board__workflow">
          {/*
            A real `<button>`, not a clickable heading: `aria-expanded` on a
            plain element is a claim nothing implements, and this repo's own
            precedent for the control is `.gn-list__columns-toggle`, a
            `<button>` pairing `aria-expanded` with a caret DRAWN through a
            `::after` on a separate element so the accessible name stays exactly
            the heading's text (`.gn-board__workflow-caret`, ui.css). A glyph
            typed into this button's own text node would put "▸ Onboarding" in
            the accessible name — the defect that rule exists to avoid, and
            case `13.1417`.
          */}
          <button
            type="button"
            className="gn-board__workflow-toggle"
            aria-expanded={expanded}
            aria-controls={railId}
            onClick={onToggleWorkflow}
          >
            <span className="gn-board__workflow-caret" aria-hidden="true" />
            {group.workflowName}
          </button>
      </h2>
      {/*
        `hidden`, and the attribute is only half of it: `ui.css` carries
        `.gn-board__rail[hidden]` because this rail is `display: flex`, and an
        author rule outranks the UA sheet's own `hidden` — without it the tray
        is permanently open and the attribute is decorative. That pair is
        asserted as a pair (`13.1418`), which is the shape case `13.671` gave
        the List's tray.

        Collapsed hides the RAIL, which is the whole point of the control: the
        request was to reclaim the row, so a state that hid the cards and left
        four empty columns standing would not answer it. Hiding the rail takes
        the columns, their per-column empty copy and their `Create ticket` with
        it (`13.1409`).
      */}
      {phone && expanded && activeStateId !== null ? (
        <BoardPhonePicker
          columns={group.columns.map((column) => ({ stateId: column.stateId, name: column.name, count: column.cards.length }))}
          activeStateId={activeStateId}
          onPick={pickColumn}
        />
      ) : null}
      <div
        className="gn-board__rail gn-scroll-fade"
        id={railId}
        ref={railEdgesRef}
        hidden={!expanded}
        // A card's `dragend` bubbles here from its slot: that covers Esc and a
        // drop outside every column, neither of which fires `drop`.
        onDragEnd={() => {
          depthRef.current.clear();
          setDropTarget(null);
          setDrag(null);
        }}
      >
        {group.columns.map((column) => {
          // No `column.category` test: every column collapses (plan D27, resolved).
          const collapsed =
            !phone && columnChoices[columnCollapseKey(group.workflowId, column.stateId)] === false && springOpen !== column.stateId;
          const cardsId = `board-cards-${group.workflowId}-${column.stateId}`;
          // Does this column carry `Close all (N)`? ONE answer for the header's class (F-2, 23.334) and the button, so they cannot
          // drift: the three terms are explained in the docblock above the button.
          const canBulkClose = bulkCloseFor !== null && column.category === 'terminal' && column.cards.length > 0;
          const over = column.stateId === dropTarget;
          const verdict = over ? verdictOf(column.stateId) : 'unknown';
          // A placeholder only in a list that exists (a strip has none) and only for a legal move.
          const slotAt = over && verdict === 'legal' && !collapsed && drag !== null ? landingIndex(column.cards, drag.ticketId) : null;
          const cardSlots = column.cards.map((card) => (
            <BoardCardSlot
              key={card.ticketId}
              card={card}
              stateName={column.name}
              onOpen={() => onOpenTicket(card.ticketId)}
              onOpenTicket={onOpenTicket}
              arrows={arrows === null ? null : arrows(card, column.stateId)}
              onDragBegin={(height) => setDrag({ ticketId: card.ticketId, fromStateId: column.stateId, height })}
              today={today}
            />
          ));
          if (slotAt !== null && drag !== null) {
            cardSlots.splice(
              slotAt,
              0,
              <li
                key="drop-placeholder"
                className="gn-board__drop-placeholder"
                data-testid={`board-drop-placeholder-${column.stateId}`}
                aria-hidden="true"
                style={{ height: `${drag.height}px` }}
              />,
            );
          }
          return (
          <section
            key={column.stateId}
            role="region"
            aria-label={column.name}
            data-testid={`board-column-${column.stateId}`}
            data-state-id={column.stateId}
            // UX fixes T7 (BRD-01): on a phone only the column the picker chose is in the page. `inert` takes the
            // others out of the tab order and the accessibility tree; `hidden` (with `.gn-board__column[hidden]`
            // in `ui.css`) takes them out of the layout, so the rail is as tall as the shown column. `tabIndex`
            // lets the picker land focus on an EMPTY column, which has no card to receive it.
            {...(phone && column.stateId !== activeStateId ? { inert: true, hidden: true } : {})}
            tabIndex={phone ? -1 : undefined}
            className={
              (column.blocked ? 'gn-board__column gn-board__column--blocked' : 'gn-board__column') +
              (collapsed ? ' gn-board__column--collapsed' : '') +
              (over ? (verdict === 'refused' ? ' gn-board__column--drop-refused' : ' gn-board__column--drop-target') : '')
            }
            /*
             * Board-prototype-port Task 14. `preventDefault()` on
             * `dragOver` is not decoration — a browser's DEFAULT action for
             * `dragover` is to DISALLOW dropping, so without this call
             * `onDrop` below never fires at all, for any target. Only
             * wired when `onDropCard` is non-null, the same gate `onDrop`
             * itself uses immediately below.
             */
            onDragOver={
              onDropCard === null
                ? undefined
                : (event) => {
                    event.preventDefault();
                    // An illegal target: the cursor says no (a browser may then cancel the drop, so the
                    // refusal is still reachable through the arrows — `handleDrop` refuses if one does fire).
                    if (verdictOf(column.stateId) === 'refused') event.dataTransfer.dropEffect = 'none';
                  }
            }
            onDragEnter={
              onDropCard === null
                ? undefined
                : (event) => {
                    if (!isCardDrag(event)) return;
                    depthRef.current.set(column.stateId, (depthRef.current.get(column.stateId) ?? 0) + 1);
                    setDropTarget(column.stateId);
                  }
            }
            onDragLeave={
              onDropCard === null
                ? undefined
                : (event) => {
                    if (!isCardDrag(event)) return;
                    const depth = (depthRef.current.get(column.stateId) ?? 0) - 1;
                    // Where the pointer went, when the browser says: a target OUTSIDE this column is a real
                    // leave whatever the count holds. The count drifts when a column opens under the pointer
                    // (the strip button it was over is removed without a `dragleave`), and this is what
                    // stops such a column staying "over" — and open — after the drag has gone.
                    const next = event.relatedTarget;
                    const leftForGood = next instanceof Node && !event.currentTarget.contains(next);
                    if (depth > 0 && !leftForGood) {
                      depthRef.current.set(column.stateId, depth);
                      return;
                    }
                    depthRef.current.delete(column.stateId);
                    setDropTarget((current) => (current === column.stateId ? null : current));
                  }
            }
            onDrop={
              onDropCard === null
                ? undefined
                : (event) => {
                    depthRef.current.delete(column.stateId);
                    setDropTarget(null);
                    setDrag(null);
                    // Dropped on a column the drag itself held open: keep it open, and remember that (Task 5B's
                    // store, through `onToggleColumn` and not `setColumnExpanded` — the latter queues a focus and a
                    // scroll restore that would fight the landing slot's own scroll into view).
                    if (springOpen === column.stateId) onToggleColumn(group.workflowId, column.stateId, true);
                    setSpringOpen(null);
                    onDropCard(event, column.stateId);
                  }
            }
          >
            {collapsed ? (
              /* THE STRIP (Task 5B): the same section, still a drop target, holding one
                 control. The name is `aria-hidden` because the button's own name already
                 says it; there is no `aria-controls`, since the list it would control is
                 not rendered. */
              <button
                type="button"
                className="gn-board__column-strip"
                aria-expanded="false"
                aria-label={`Expand ${column.name}, ${column.cards.length} ${column.cards.length === 1 ? 'ticket' : 'tickets'}`}
                onClick={() => setColumnExpanded(column.stateId, true)}
              >
                <span className="gn-board__count">{column.cards.length}</span>
                <span className="gn-board__column-strip-name" aria-hidden="true">
                  {column.name}
                </span>
              </button>
            ) : (
              <>
            <header
              className={
                // Neo follow-up F-2 (case 23.334): a phone shows the column's name and count in the picker above the rail, so the
                // header's own chip row is hidden there; with no `Close all (N)` to carry it has nothing left and the phone arm
                // drops the whole row (`--bare`).
                canBulkClose
                  ? 'gn-board__column-header'
                  : 'gn-board__column-header gn-board__column-header--bare'
              }
            >
              <Chip tone={column.blocked ? 'waiting' : column.category}>{column.name}</Chip>
              <span className="gn-board__count">{column.cards.length}</span>
              {/*
               * `Close all (N)` — spec §8.3's Board bullet: "A TERMINAL
               * column's header gains Close all (N) (N = cards in the
               * column)."
               *
               * `canBulkClose` (hoisted above, so the header's `--bare` class reads
               * the same answer) has THREE terms, and each excludes a different
               * way of rendering a control that cannot work:
               *   - `bulkCloseFor !== null` — no `moves`, no dialog to open
               *     (see the prop's own docblock). Not merely "disabled": there
               *     is no handler to call.
               *   - `category === 'terminal'` — spec §8.3 says a TERMINAL
               *     column, and `ticket.closed` is refused from anywhere else
               *     (`close-requires-terminal`), so offering it elsewhere would
               *     be offering a write the engine rejects. A column holding
               *     cards is still not a candidate on this axis — the negative
               *     case 13.789 asserts holds a card for exactly that reason.
               *   - `cards.length > 0` — "N = cards in the column", so N = 0
               *     is not a thing this action has to say. Nothing to close,
               *     no button; case 13.790.
               *
               * The accessible name carries the COLUMN as well as the count
               * (`Close all 2 in Done`): a board shows several columns at once
               * and a page-level duplicate name would make the control
               * unaddressable by role and name. The visible text stays exactly
               * the spec's `Close all (N)`.
               */}
              {canBulkClose ? (
                <button
                  type="button"
                  className="gn-board__column-action"
                  aria-label={`Close all ${column.cards.length} in ${column.name}`}
                  onClick={() => bulkCloseFor(column)}
                >
                  Close all ({column.cards.length})
                </button>
              ) : null}
              <button
                type="button"
                className="gn-board__column-collapse"
                aria-expanded="true"
                aria-controls={cardsId}
                aria-label={`Collapse ${column.name}`}
                onClick={() => setColumnExpanded(column.stateId, false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.5 6.5 9 12l5.5 5.5" />
                </svg>
              </button>
            </header>
            <ul className="gn-board__cards" id={cardsId}>
              {cardSlots}
            </ul>
            {/*
             * The PER-COLUMN empty state (board-prototype-port Task 7,
             * spec Board `:354-399`'s "Empty column"/"Empty icon"/"Empty
             * copy"/"Empty action" rows) — a different granularity from
             * `emptyBanner` above: this renders for one empty column
             * inside a board that is not itself empty (siblings hold
             * cards), and both may render together when the whole board
             * is empty too (R6).
             *
             * The icon is decorative only (`aria-hidden`, `currentColor`
             * stroke resolving from `.gn-board__column-empty-icon`'s own
             * `color` — the established idiom, see
             * `inbox/icons.tsx`'s `NotificationIcon`) and carries no
             * information text does not already say.
             *
             * The action reuses `onCreateTicket`, now SCOPED to this column
             * (starting-status design, 2026-09-23 — the docblock's old claim
             * that scoping it was "outside this task" is what this task closes):
             * `{workflowId: group.workflowId, stateId: column.stateId}`, this
             * column's own identity, so the shell can pre-fill the New-ticket
             * dialog's type and status. Its VISIBLE text is "Create ticket" like every
             * other entry point (BRD-19, 22.155: one action, one name), and its
             * ACCESSIBLE name adds the column — "Create ticket in <column>" — because
             * a board can render both an `emptyBanner` button and one of these per
             * empty column at once (R6), and an identical accessible name on every
             * one of them would be indistinguishable by role and name alike. The
             * visible text is contained in the name, so a voice-control user who
             * says what they see still reaches it.
             *
             * GATED ON `column.creatable`, not merely on `onCreateTicket` being
             * passed (starting-status design): a state a workflow forbids
             * creating tickets in shows no Add button even when empty and even
             * when the shell has wired the handler — `EMPTY_COLUMN_COPY` alone
             * says the column is empty, without inviting an action the engine
             * would refuse. `isCreatableState` is the one place that decides
             * this, read off the column by the server/mapper/replica sites that
             * build it, never re-derived here.
             */}
            {column.cards.length === 0 ? (
              <div className="gn-board__column-empty">
                {/* V1: the `+` is the one part of an empty column that reads as
                    a CONTROL, and it must never render unaccompanied — a glyph
                    that looks pressable with nothing behind it is the dead
                    affordance this board refuses elsewhere. Gated on the same
                    condition the button below is. */}
                {onCreateTicket !== undefined && column.creatable ? (
                  <span className="gn-board__column-empty-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M12 5.5v13M5.5 12h13" />
                  </svg>
                  </span>
                ) : null}
                <p className="gn-board__column-empty-copy">
                  {column.epicsHidden === true ? EMPTY_COLUMN_EPICS_COPY : EMPTY_COLUMN_COPY}
                </p>
                {onCreateTicket !== undefined && column.creatable ? (
                  <Button
                    aria-label={`Create ticket in ${column.name}`}
                    onClick={() =>
                      onCreateTicket({ workflowId: group.workflowId, stateId: column.stateId })
                    }
                  >
                    Create ticket
                  </Button>
                ) : null}
              </div>
            ) : null}
              </>
            )}
          </section>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The hook-owning half of the split `BoardGroupSection`'s own docblock
 * explains. Fetches this group's pinned `WorkflowDef` — `getWorkflowDef`
 * exists on `DataSource` and `BoardGroup` already carries both arguments it
 * needs (`workflowId`, `workflowVersion`); mirrors `TicketSheet`'s identical
 * `useLiveQuery(..., getWorkflowDef(...))` call over the ticket's own pinned
 * version, for the same reason given there: a ticket (here, a card) pins the
 * version it was created under, and asking for `latest` could return a
 * definition that no longer contains this state at all.
 *
 * `workflow.data === null` covers BOTH "still loading" and "the read found
 * nothing" — the same non-distinction `TicketSheet` accepts for its own
 * `TransitionDialog` mount (`workflow.data != null ? <TransitionDialog ...
 * /> : null`). Arrows simply do not render meanwhile; there is no separate
 * loading affordance for them, matching that precedent rather than inventing
 * a new one.
 */
function BoardGroupWithMoves({
  group,
  expanded,
  onToggleWorkflow,
  columnChoices,
  onToggleColumn,
  onOpenTicket,
  onCreateTicket,
  moves,
  moveRegistry,
  bulkCloseFor,
  today,
}: {
  group: BoardGroup;
  /**
   * Decision 2 — the collapse state, OWNED BY `Board` and forwarded straight
   * through to `BoardGroupSection`. Forwarded rather than derived here for the
   * reason the split itself exists: this half owns a hook (`useLiveQuery`) and
   * the other half owns the markup, so a group's collapse must not depend on
   * which of the two paths rendered it. Adding a prop to `Board`'s call sites
   * and forgetting this one leaves the read-only board collapsing and the
   * movable one not — nothing in either file would say so, and case `13.1419`
   * is the arm that catches it.
   */
  expanded: boolean;
  /** See the prop of the same name on `BoardGroupSection`. */
  onToggleWorkflow: () => void;
  /** See the props of the same names on `BoardGroupSection` — forwarded for the reason `expanded` is. */
  columnChoices: ColumnCollapseChoices;
  onToggleColumn: (workflowId: string, stateId: string, expanded: boolean) => void;
  onOpenTicket: (ticketId: string) => void;
  onCreateTicket?: (selection?: { workflowId: string; stateId: string }) => void;
  moves: BoardMoveCapability;
  /** Board-prototype-port Task 14 — see `MoveRegistry`'s own docblock. Owned by `Board`, threaded through unchanged. */
  moveRegistry: MutableRefObject<MoveRegistry>;
  /** Second Wave Task 10 — `Board`'s own opener, threaded through unchanged; see `BoardGroupSection`'s prop. */
  bulkCloseFor: (column: BoardColumn) => void;
  /** Ruling E5-2 — `Board`'s own `today`, threaded through unchanged; see its prop docblock. */
  today?: string;
}) {
  const moveState = useContext(MoveStateContext);
  const workflowKey = `${group.workflowId}@${group.workflowVersion}`;
  const workflow = useLiveQuery(moves.dataSource, moves.workspaceId, workflowKey, () =>
    moves.dataSource.query.getWorkflowDef(moves.workspaceId, group.workflowId, group.workflowVersion),
  );
  // `group.columns` order IS `def.states` order for this pinned version —
  // `arrowTarget`'s own docblock cites the server code that guarantees it —
  // so this is the rendered column list, not a second derivation from `def`.
  const columnOrder = group.columns.map((column) => column.stateId);
  const workflowDef = workflow.data;

  /**
   * Registers ONE card's real `attemptMove` (board-prototype-port Task 14) —
   * called from `MoveArrows`'s own effect, never from here directly, so this
   * stays a plain setter with no opinion about WHEN a card registers.
   * Returns the cleanup `MoveArrows` runs on unmount / re-render; guarded
   * against clobbering a NEWER registration with a stale cleanup
   * (`current.get(ticketId) === attempt`) in case React ever runs an old
   * effect's cleanup after a newer effect's setup for the same ticket id —
   * StrictMode's synthetic double-invoke is exactly this shape.
   */
  const registerAttempt = (ticketId: string, attempt: (toStateId: string, from?: FlightRect) => void): (() => void) => {
    moveRegistry.current.set(ticketId, attempt);
    return () => {
      if (moveRegistry.current.get(ticketId) === attempt) {
        moveRegistry.current.delete(ticketId);
      }
    };
  };

  /**
   * A column's whole drop contract (board-prototype-port Task 14): read the
   * dragged ticket id off `event.dataTransfer` (set by the card's own
   * `onDragStart`, above, on the `<li>` render), look up that ticket's real
   * `attemptMove` in the shared registry, and call it with THIS column's
   * `stateId` — the identical function, and the identical `moveOutcome`
   * dispatch, an arrow click on that same card would have called. `null`
   * while `workflowDef` has not resolved, mirroring `arrows` immediately
   * below: no `MoveArrows` has mounted yet to register anything, so a drop
   * here could only ever find an empty registry.
   */
  const handleDrop =
    workflowDef === null
      ? null
      : (event: DragEvent<HTMLElement>, toStateId: string) => {
          event.preventDefault();
          const ticketId = event.dataTransfer.getData(DRAG_TICKET_FORMAT);
          // A drop on the card's OWN column is a no-op (owner, 2026-09-30): `moveOutcome` refuses a
          // self-transition, and the refusal read "Can't move there" under a card that never moved.
          // Read off THIS group's data, so a card of another workflow whose state merely shares the
          // id is still a real (refused) attempt.
          const currentStateId = group.columns.find((column) =>
            column.cards.some((card) => card.ticketId === ticketId),
          )?.stateId;
          if (currentStateId === toStateId) return;
          const attempt = moveRegistry.current.get(ticketId);
          // Where the card's corner was when it was let go — the pointer at the drop, less where it grabbed
          // the card — so the optimistic card can fly from THERE to its landing slot.
          const grab = moveState?.grab.current;
          const from =
            grab?.ticketId === ticketId && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
              ? { left: event.clientX - grab.offsetX, top: event.clientY - grab.offsetY, at: Date.now() }
              : undefined;
          if (attempt !== undefined) attempt(toStateId, from);
        };

  return (
    <BoardGroupSection
      group={group}
      expanded={expanded}
      onToggleWorkflow={onToggleWorkflow}
      columnChoices={columnChoices}
      onToggleColumn={onToggleColumn}
      onOpenTicket={onOpenTicket}
      onCreateTicket={onCreateTicket}
      arrows={
        workflowDef === null
          ? null
          : (card, fromStateId) => (
              <MoveArrows
                card={card}
                workflow={workflowDef}
                fromStateId={fromStateId}
                columnOrder={columnOrder}
                moves={moves}
                registerAttempt={registerAttempt}
              />
            )
      }
      onDropCard={handleDrop}
      // `moveOutcome`'s own answer, so a column and an arrow can never disagree; `{}` fields
      // because only `refused` is asked, and refusal never reads them (they split direct from dialog).
      canDropOn={
        workflowDef === null
          ? null
          : (fromStateId, toStateId) => moveOutcome(workflowDef, fromStateId, toStateId, {}).kind !== 'refused'
      }
      bulkCloseFor={bulkCloseFor}
      today={today}
    />
  );
}

/**
 * Anything inside the card that is a control of its own, or belongs to the
 * `TransitionDialog` `MoveArrows` mounts INSIDE the card (`Dialog` in
 * `packages/ui` does not portal). A click landing on any of these is that
 * thing's click, never the card's — see `BoardCardSlot`.
 */
const CARD_CLICK_BAIL_SELECTOR =
  'button, a, input, select, textarea, label, [role="dialog"], .gn-dialog__scrim';

/**
 * The `<li>` around one card — one component per card (as `MoveArrows`
 * already is) rather than JSX inlined in `BoardGroupSection`'s `.map()`,
 * because it needs a ref of its own.
 *
 * ## The whole card opens the ticket (owner request, 2026-09-17)
 *
 * The title stays a real `<button>` with `onOpen` — it is the keyboard path
 * and the accessible name, and `Card` (`packages/ui`) is documented "never
 * itself interactive", so the listener lives HERE, on the slot, not on the
 * card container and not in `packages/ui`. No `role="button"`/`tabindex` on
 * this `<li>`: it already contains buttons, and nesting interactive roles is
 * the one thing that would make the accessible tree worse than before.
 *
 * `onClick` bails in two cases, and both are the point:
 *
 * 1. **The click belongs to something else.** `CARD_CLICK_BAIL_SELECTOR`
 *    covers the title button itself (whose own `onClick` already opened the
 *    ticket — without this bail one click would open it TWICE), the
 *    provenance toggle, the `‹ ›` arrows, and the `TransitionDialog`
 *    subtree. The dialog matters most: its scrim closes the dialog on click
 *    WITHOUT stopping propagation (`dialog.tsx`), so absent this bail,
 *    closing the dialog by clicking outside it would open the ticket sheet
 *    in the same gesture. `13.522` reaches that scrim through a real arrow
 *    click and proves it.
 *
 * 2. **The click is the tail of a drag.** Every browser this product
 *    targets withholds `click` after a completed native drag, so in the
 *    field `draggedRef` is belt-and-braces; in jsdom, which drags nothing,
 *    it is the only observable proof (`13.521`). Set on `dragstart`, cleared
 *    on the NEXT `mousedown` — not on `dragend`, and not on a timer:
 *    `dragend` precedes any stray `click` the same gesture could produce,
 *    so clearing there would defeat the guard in exactly the case it exists
 *    for, and a timer would put the test on the clock. A fresh press is the
 *    unambiguous start of a new gesture.
 *
 * 3. **The click did not land in this slot's DOM at all.** React synthetic
 *    events bubble through the REACT tree, and `Select` (`packages/ui`)
 *    portals its dropdown panel to `document.body` — so a click on that
 *    panel's own padding reaches this `onClick` while `closest()`, which
 *    walks the DOM, finds nothing there to bail on (`13.535` establishes the
 *    portal; `13.537` the click). `event.currentTarget.contains(target)`
 *    is the generic answer: a target that is not a DOM descendant of the
 *    slot is not this card's click, whatever the React tree says, and it
 *    names no library's internals. Today `Dialog`'s own `<section
 *    role="dialog" onClick={stopPropagation}>` ALSO swallows that click on
 *    its way up (measured: with that one line mutated away and this guard
 *    absent, `13.537` fails; with this guard present it passes either way)
 *    — but that line exists for the scrim's sake, in another package, and a
 *    card's click guard should not be correct only by courtesy of it. An
 *    OPTION click never arrives at all — react-aria's `usePress` stops it
 *    (`13.536`, the positive control, named honestly as such).
 *
 * `draggable`/`onDragStart` are unchanged from board-prototype-port Task 14
 * — gated on the SAME `arrows !== null` check, deliberately not a second,
 * parallel boolean: a card whose write path is not wired (no `moves`
 * capability, or this group's workflow still loading) has no `MoveArrows`
 * instance to register an `attemptMove` for, so a drop starting from it
 * could only ever land in the registry's inert no-op — and a grab cursor
 * promising otherwise is exactly the affordance-that-lies shape Ruling 15
 * already named. `.gn-board__card-slot[draggable="true"]` in `ui.css` is the
 * ONLY place `cursor: grab` is declared, keyed off this literal attribute
 * rather than a second class; the bare `.gn-board__card-slot` rule beside it
 * carries `cursor: pointer` for the read-only path, where a card can be
 * opened but not dragged.
 */
function BoardCardSlot({
  card,
  stateName,
  onOpen: openCard,
  onOpenTicket,
  arrows: cardArrows,
  onDragBegin,
  today,
}: {
  card: BoardCardData;
  stateName: string;
  onOpen: () => void;
  /**
   * `Board`'s own `onOpenTicket`, threaded through UNCHANGED from `onOpen`
   * above (owner request, 2026-09-23: parent-key badge, epic chip). `onOpen`
   * opens THIS card's own ticket and is what the `<li>`'s bail-guarded click
   * handler calls; the parent badge and the epic chip open a DIFFERENT
   * ticket, which needs the raw function rather than a closure already bound
   * to `card.ticketId`.
   */
  onOpenTicket: (ticketId: string) => void;
  arrows: ReactNode;
  /**
   * Tells the workflow group a drag of THIS card began, with the card's measured
   * height (board drag fixes D2) — the one thing a target column cannot read
   * from a `dragover`. Called before the source turns into a placeholder.
   */
  onDragBegin: (height: number) => void;
  /** Ruling E5-2 — `Board`'s own `today`, threaded through unchanged; see its prop docblock. */
  today?: string;
}) {
  // A ghost (a create in flight, smoothness T7) is not a ticket yet: it cannot be opened, moved or dragged.
  const creating = card.pendingCreate === true;
  const arrows = creating ? null : cardArrows;
  const onOpen = creating ? (): void => {} : openCard;
  const draggedRef = useRef(false);
  // The placeholder (Task 5A): the source slot, one frame after `dragstart`.
  const [placeholder, setPlaceholder] = useState(false);
  const frameRef = useRef<number | null>(null);
  const moveState = useContext(MoveStateContext);
  const slotRef = useRef<HTMLLIElement | null>(null);
  // Where this card flies from, when it has just been drawn in a new place (see the layout effect below).
  const [flight, setFlight] = useState<{ dx: number; dy: number } | null>(null);
  const phase = moveState?.pending[card.ticketId]?.phase;
  // A Close in flight (T7 F2): the card stays where it is, dimmed and busy, until the answer — it cannot be dragged
  // (the Move and Close buttons are already disabled by `submitting`). Once committed the overlay hides it instead.
  const closing = moveState?.pending[card.ticketId]?.closes === true && phase !== 'committed';
  const movable = arrows !== null && !closing;

  // Let the board find this slot by ticket id, to measure where the card is drawn right now.
  const slots = moveState?.slots;
  useLayoutEffect(() => {
    const element = slotRef.current;
    if (slots === undefined || element === null) return;
    slots.current.set(card.ticketId, element);
    return () => {
      if (slots.current.get(card.ticketId) === element) slots.current.delete(card.ticketId);
    };
  }, [slots, card.ticketId]);

  /**
   * A card that mounts while a FLIGHT is waiting for it has just been moved — optimistically into its target
   * column, or back to its source after a failure. Two things, both before the browser paints: scroll it into
   * view if it landed outside the window or the rail, and start the glide from where it was (the drop point,
   * its old slot, or the slot it was drawn in) to where it is. The glide is a CSS animation on the motion
   * tokens (`.gn-board__card-slot--flight`), so `prefers-reduced-motion` switches it off in the stylesheet; it
   * is also not started here under reduced motion, and not while this card has a dialog open (a transform
   * on an ancestor would drag the dialog's fixed scrim along with it).
   */
  useLayoutEffect(() => {
    const element = slotRef.current;
    const flights = moveState?.flights;
    if (element === null || flights === undefined) return;
    const from = flights.current.get(card.ticketId);
    if (from === undefined || from.sibling === true) return;
    flights.current.delete(card.ticketId);
    if (Date.now() - from.at > FLIGHT_MAX_AGE_MS) return;
    const rect = element.getBoundingClientRect();
    const reduced = prefersReducedMotion();
    const rail = element.closest('.gn-board__rail');
    if (
      typeof element.scrollIntoView === 'function' &&
      isOffscreen(rect, { width: window.innerWidth, height: window.innerHeight }, rail?.getBoundingClientRect())
    ) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
    if (reduced || moveState?.sessions[card.ticketId]?.dialog != null) return;
    const dx = from.left - rect.left;
    const dy = from.top - rect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    setFlight({ dx, dy });
    // Once per mount: the flight is consumed by the card that mounts for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A card the move SHIFTED (below the mover in its source column, or in the target column on an arrow move or a release) is already mounted: after the render that moved
   * it, it glides from where it was drawn to where it is — the same FLIP, the same `flights` map and the same
   * `.gn-board__card-slot--flight` class as the landing card, never a scroll. Consumed once; a stale entry, reduced
   * motion and an open dialog (a transform would drag its fixed scrim) each mean it simply snaps.
   */
  const pendingMoves = moveState?.pending;
  useLayoutEffect(() => {
    const element = slotRef.current;
    const flights = moveState?.flights;
    if (element === null || flights === undefined) return;
    const from = flights.current.get(card.ticketId);
    if (from === undefined || from.sibling !== true) return;
    flights.current.delete(card.ticketId);
    if (Date.now() - from.at > FLIGHT_MAX_AGE_MS) return;
    if (prefersReducedMotion() || moveState?.sessions[card.ticketId]?.dialog != null) return;
    const rect = element.getBoundingClientRect();
    const dx = from.left - rect.left;
    const dy = from.top - rect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    setFlight({ dx, dy });
    // Keyed on the overlay: the render that moves a sibling is always one that changed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMoves]);

  const slotClass = [
    'gn-board__card-slot',
    placeholder ? 'gn-board__card-slot--placeholder' : '',
    phase === 'awaiting' ? 'gn-board__card-slot--waiting' : '',
    creating ? 'gn-board__card-slot--creating' : '',
    closing ? 'gn-board__card-slot--closing' : '',
    flight !== null ? 'gn-board__card-slot--flight' : '',
  ]
    .filter((name) => name !== '')
    .join(' ');
  return (
    <li
      ref={slotRef}
      className={slotClass}
      style={
        flight === null
          ? undefined
          : ({ '--gn-flip-x': `${flight.dx}px`, '--gn-flip-y': `${flight.dy}px` } as CSSProperties)
      }
      data-move-phase={phase}
      aria-busy={creating || closing ? 'true' : undefined}
      onAnimationEnd={flight === null ? undefined : () => setFlight(null)}
      data-testid={`ticket-card-${card.ticketId}`}
      draggable={movable}
      onDragStart={
        !movable
          ? undefined
          : (event) => {
              draggedRef.current = true;
              event.dataTransfer.setData(DRAG_TICKET_FORMAT, card.ticketId);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData(DRAG_CARD_MARKER, '');
              const cardElement = event.currentTarget.firstElementChild;
              const cardRect = (cardElement instanceof HTMLElement ? cardElement : event.currentTarget).getBoundingClientRect();
              onDragBegin(cardRect.height);
              // Where the pointer took hold of the card, so a drop can be turned back into the card's corner.
              if (moveState !== null) {
                moveState.grab.current = {
                  ticketId: card.ticketId,
                  offsetX: (event.clientX || 0) - cardRect.left,
                  offsetY: (event.clientY || 0) - cardRect.top,
                };
              }
              if (cardElement instanceof HTMLElement) setCardDragImage(event, cardElement);
              // One frame later, NOT now: restyling the source synchronously would put the
              // hidden card into the browser's snapshot (Chromium can cancel the drag).
              frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                setPlaceholder(true);
              });
            }
      }
      // Fires on a drop, on Esc and on a refused drop. `draggedRef` is NOT touched
      // here: it is cleared on the next `mousedown`, never on `dragend` (docblock above).
      onDragEnd={
        !movable
          ? undefined
          : () => {
              if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
              frameRef.current = null;
              setPlaceholder(false);
            }
      }
      onMouseDown={() => {
        draggedRef.current = false;
      }}
      onClick={(event) => {
        if (draggedRef.current) return;
        if (!event.currentTarget.contains(event.target as Node)) return;
        if ((event.target as Element).closest(CARD_CLICK_BAIL_SELECTOR) !== null) return;
        onOpen();
      }}
    >
      <BoardCardView
        card={card}
        stateName={stateName}
        onOpen={onOpen}
        onOpenTicket={onOpenTicket}
        arrows={arrows}
        today={today}
      />
    </li>
  );
}

/**
 * A card never renders a state as a standing fact. It says what happened — "Moved to
 * Doing by Anselma Marak on 19 Aug" (UX fixes T7, audit BRD-03; it was a "who · when" placeholder) — through
 * `formatCardProvenance`, which is the module that knows a nameless claim still names its actor
 * and that every instant this product shows goes through the domain's one `formatIstInstant`.
 * Pressing the line unfolds it to the same sentence with the year. Inlining either half here
 * would give the board a second clock and a second idea of anonymity.
 *
 * `pending` is a CLIENT-SIDE view flag on `BoardCard` — true only between
 * submit and the server's answer. It is deliberately NOT a fourth
 * `IngestResult` status: the server answers committed, invalid or refused, and
 * a claim in flight is a fact about this browser, not about the ledger.
 *
 * `arrows` (board-prototype-port Task 13) is a fully-rendered `ReactNode`,
 * precomputed by `BoardGroupSection`'s caller — `null` when no move
 * capability is wired (the whole feature absent, mirroring `onCreateTicket`
 * undefined), and `<MoveArrows .../>` when it is. `BoardCardView` itself
 * knows nothing about `moveOutcome`, `WorkflowDef`s or submission — it only
 * has somewhere to put the node it is handed.
 */
function BoardCardView({
  card,
  stateName,
  onOpen,
  onOpenTicket,
  arrows,
  today,
}: {
  card: BoardCardData;
  stateName: string;
  onOpen: () => void;
  /** `BoardCardSlot`'s own prop, threaded through unchanged; see its docblock. */
  onOpenTicket: (ticketId: string) => void;
  arrows: ReactNode;
  today?: string;
}) {
  const [unfolded, setUnfolded] = useState(false);
  /**
   * Ruling E5-2 — the DUE LABEL, which this card drew none of until 2026-09-21
   * while the sheet, the List, `my-work`, the Calendar and the Timeline all
   * carried the date, and the Board is the project's DEFAULT tab. The export
   * draws it in the card's meta line and colours it
   * `di.late ? "var(--danger)" : "var(--label2)"`; both halves are reproduced
   * here rather than only the date, because a date nobody can see has passed is
   * the fact the ruling is about.
   *
   * `late` is a plain STRING comparison of two IST day strings — the same
   * comparison `filter/list-filter.ts` uses for its `dueBefore`/`dueAfter` axes,
   * and the reason no clock or zone arithmetic appears here: `YYYY-MM-DD` sorts
   * lexicographically in calendar order, so `due < today` needs neither a
   * `Date` nor a timezone. A ticket due TODAY is not late, which is what `<`
   * rather than `<=` says.
   *
   * With no `today` the label still draws, in the ordinary tone — see the
   * `today` prop's docblock on `BoardProps` for why the absence is honest.
   *
   * The ATTRIBUTION is a `title`, not a second line: the export's meta line is
   * one bit and a board card is the densest surface in the product, so the
   * claimant rides along the way `Chip`'s own `title` does immediately above.
   * The visible text is the date alone, exactly as the export draws it.
   */
  const late = card.dueDate !== null && today !== undefined && card.dueDate.date < today;
  /**
   * The priority badge's icon and tone (owner request, 2026-09-23: red fire
   * P1, green leaf P2, frozen-blue snowflake P3). Every level is DRAWN — the
   * level is a fact on every card, so there is no absence arm, exactly as
   * spec 2026-09-22 already established — and now every level ALSO takes its
   * own tone and icon, superseding that spec's "only P1 takes the tone"
   * (a dense grid where every card is tinted by its own priority no longer
   * has a reason to single P1 out; the tint IS the interruption).
   */
  const priorityIcon =
    card.priority.value === 'P1' ? (
      <FireIcon size={14} />
    ) : card.priority.value === 'P2' ? (
      <LeafIcon size={14} />
    ) : (
      <SnowflakeIcon size={14} />
    );
  const priorityLevel = card.priority.value.toLowerCase();
  /**
   * The immediate parent's badge, SUPPRESSED when it names the same ticket
   * the epic chip already does (owner request, 2026-09-23: "when the
   * immediate parent IS the epic, do not repeat it as a parent-key badge —
   * the epic chip already says it"). The data stays honest either way —
   * `card.parent` always names the true immediate parent (`BoardCard.parent`'s
   * own docblock) — this is a VIEW-layer dedup, not a data-layer one, so every
   * door that builds a `BoardCard` gets the rule for free without having to
   * know about it.
   *
   * `parent.key === null` also does not draw: the same "a null key draws no
   * separator and no placeholder" rule `card.key` itself already follows
   * (the ledger holds no prefix, or — offline — the replica cannot compose
   * one at all; `replica-data-source.ts`'s own `boardHierarchyOf` records
   * that as narrower-than-the-truth on purpose).
   */
  const showParentBadge =
    card.parent !== null &&
    card.parent.key !== null &&
    (card.epic === null || card.parent.ticketId !== card.epic.ticketId);
  return (
    <Card
      className={[
        'gn-board-card',
        `gn-board-card--${priorityLevel}`,
        card.pending ? 'gn-board-card--pending' : null,
      ]
        .filter((name): name is string => name !== null)
        .join(' ')}
    >
      {/* The epic chip (owner ruling, 2026-09-23): the card's TOP LINE, above
          the title — epics are never drawn on the board as cards of their own
          (owner ruling 2026-09-20), so this is the board's only way to say
          which one a card belongs to. Absent when the card has none. */}
      {card.epic !== null ? (
        <button
          type="button"
          className="gn-board-card__epic"
          aria-label={`Open epic ${card.epic.title}`}
          onClick={() => onOpenTicket((card.epic as NonNullable<BoardCardData['epic']>).ticketId)}
        >
          <FlagIcon size={12} />
          <span className="gn-board-card__epic-title" aria-hidden="true">
            {card.epic.title}
          </span>
        </button>
      ) : null}
      <button type="button" className="gn-board-card__title" onClick={onOpen}>
        {card.title}
      </button>
      <div className="gn-board-card__meta">
        {card.assignee !== null ? (
          <Avatar name={actorLabel(card.assignee.id, card.assignee.name)} size="small" />
        ) : null}
        {card.pending ? <Chip tone="pending">claim in transit</Chip> : null}
        {card.cause !== null ? (
          <Chip tone="active" title="This parent was reopened because it acquired live work">
            reopened, live work added
          </Chip>
        ) : null}
        {card.rollup !== null ? (
          <span className="gn-board-card__progress">{formatRollup(card.rollup)}</span>
        ) : null}
      </div>
      {/* The prototype's META LINE (`desktop.dc.html:2496-2504`: `bits = [t.id, …,
          dueLabel].join(" · ")`), key first (owner, 2026-09-22) — now "the KEYS
          ROW" (owner request, 2026-09-23): `[parent key badge] key [priority
          badge]`, then the due label. The priority badge MOVED here from the
          chips row above — it is always present (spec 2026-09-22), so this row
          is no longer conditional on `key`/`dueDate` the way it used to be. A
          `null` card key still draws no separator and no placeholder.  */}
      <p className="gn-board-card__meta-line">
        {showParentBadge ? (
          <>
            <button
              type="button"
              className="gn-board-card__parent-key"
              aria-label={`Open parent ${card.parent?.key}`}
              onClick={() => onOpenTicket((card.parent as NonNullable<BoardCardData['parent']>).ticketId)}
            >
              {card.parent?.key}
            </button>
            {/* Owner ruling (2026-09-29, styling refresh): "if parent is
                present, separate with >" — the `›` the sheet's breadcrumb
                already uses. `aria-hidden`: the badge's own name ("Open parent
                GN-17") already says what it is, and a spoken "›" is noise. */}
            <span className="gn-board-card__parent-sep" aria-hidden="true">
              ›
            </span>
          </>
        ) : null}
        {card.key !== null ? <span className="gn-board-card__key">{card.key}</span> : null}
        <span
          className={`gn-board-card__priority gn-board-card__priority--${priorityLevel}`}
          title={card.pendingCreate === true ? undefined : `${actorLabel(card.priority.claim.actorId, card.priority.claim.actorName)}'s claim`}
        >
          {priorityIcon}
          {card.priority.value}
        </span>
        {card.dueDate !== null ? (
          /* ONE UNBREAKABLE UNIT (visual-fixes V1, 2026-09-30): the `,` and the
             due label wrap TOGETHER, so a separator is never left alone at the
             end of one line with its date at the start of the next. The
             markup's text is unchanged and the `,` stays `aria-hidden`. */
          <span className="gn-board-card__due-unit">
            <span className="gn-board-card__meta-sep" aria-hidden="true">{', '}</span>
            {/* Colour is never the only signal (UX fixes T6, 23.093): a past date SAYS "Overdue" as well as turning red. */}
            <span className={late ? 'gn-board-card__due-label gn-board-card__due-label--late' : 'gn-board-card__due-label'}>
              {late ? 'Overdue' : 'Due'}
            </span>{' '}
            <span
              className={late ? 'gn-board-card__due gn-board-card__due--late' : 'gn-board-card__due'}
              title={`${actorLabel(card.dueDate.claim.actorId, card.dueDate.claim.actorName)}'s claim`}
            >
              {formatDate(card.dueDate.date)}
            </span>
          </span>
        ) : null}
      </p>
      {/* The card's FOOTER (styling refresh Plan A Task 6): the provenance line and
          the move arrows share one row that reaches into the card's padding,
          so 44px targets do not grow the card. Above 1024px (neo follow-up F-1, 23.320) they are TWO rows instead:
          the provenance line, then the controls right-aligned. Layout only — both children are exactly what
          they were. */}
      <div className="gn-board-card__footer">
        {card.pendingCreate === true ? (
          // A ghost has no claim to unfold: nobody has stamped anything yet, so the line says what is happening.
          <span className="gn-board-card__provenance">Creating…</span>
        ) : (
          <button
            type="button"
            className="gn-board-card__provenance"
            aria-expanded={unfolded}
            onClick={() => setUnfolded((value) => !value)}
          >
            {formatCardProvenance(stateName, card.stateProvenance, today, unfolded)}
          </button>
        )}
        {arrows}
      </div>
    </Card>
  );
}

/**
 * `statesWithBacklog(workflow)[].name`, falling back to the raw id — the same
 * fallback `EMPTY_COLUMN_COPY`'s sibling components use rather than a blank.
 * `statesWithBacklog`, not `workflow.states` (backlog/closed spec §1.4,
 * 2026-09-17): since 13.582 the universal Backlog is a real `transitionOptions`
 * target, and `refusalCopy` below names alternatives straight off that list,
 * so a call naming `backlog` must resolve "Backlog" and not the bare id.
 */
function stateNameOf(workflow: WorkflowDef, stateId: string): string {
  return statesWithBacklog(workflow).find((state) => state.id === stateId)?.name ?? stateId;
}

/**
 * The refusal copy — REFUSAL NAMES THE REAL ALTERNATIVES, never just "you
 * can't do that". `available` is `moveOutcome`'s own `refused.available`
 * field, built for exactly this: naming what the state a wrong target came
 * from DOES declare, by NAME rather than raw id, so the person reads "Doing"
 * or "Done" rather than `s-doing`/`s-done`.
 *
 * Exported (mirroring `EMPTY_BOARD_COPY`/`EMPTY_COLUMN_COPY` above) because
 * an arrow click cannot organically drive `moveOutcome` into its `refused`
 * branch — `MoveArrows`'s own docblock proves why: both the arrow's target
 * and `moveOutcome`'s own check read `transitionOptions` off the identical
 * `(workflow, fromStateId)`, so a target this component ever actually
 * submits is always declared. This function is the one place a test CAN
 * exercise the real refusal pipeline end to end without contriving an
 * impossible click: feed `moveOutcome`'s own `available` output straight
 * into this, the exact same call `MoveRefusalNotice` below makes.
 *
 * **Backlog is never named here (controller ruling, Task 6 fix round 1).**
 * `available` is `moveOutcome`'s shared `refused.available`, and since
 * 13.582 `transitionOptions` offers Send-to-backlog from every non-terminal
 * state — a real move, just not one a BOARD drop can make: Backlog is never
 * a board column (spec §1.1), so a card dropped there has no column to land
 * in, and the only door for it is the dialog/sheet's own "Move to Backlog"
 * (spec §4). Filtering it out is a BOARD-surface decision and belongs here,
 * not in `moveOutcome`, which stays the one shared gate every surface reads.
 */
export function refusalCopy(workflow: WorkflowDef, available: string[]): string {
  const onBoard = available.filter((stateId) => stateId !== BACKLOG_STATE_ID);
  if (onBoard.length === 0) return "This ticket can't move from here.";
  const names = onBoard.map((stateId) => stateNameOf(workflow, stateId));
  return `Can't move there. Try ${names.join(' or ')}.`;
}

/**
 * The client-side refusal notice, as its own small component (rather than
 * inlined in `MoveArrows`) so it is independently renderable in a test: mount
 * it directly with a real `moveOutcome` `refused.available` list and assert
 * the rendered text NAMES the alternatives, which is the one thing Task 13's
 * own brief insists on ("assert the refusal names the available moves rather
 * than merely appearing"). Shares `.gn-refusal.gn-refusal--server`'s
 * existing danger-tinted style with `TransitionDialog`'s own server-refusal
 * paragraph — both are a hard "no", and reusing the rule means this task adds
 * no new CSS for the refusal box itself, only for the arrow buttons.
 */
export function MoveRefusalNotice({
  workflow,
  available,
}: {
  workflow: WorkflowDef;
  available: string[];
}) {
  return (
    <p role="alert" className="gn-refusal gn-refusal--server">
      {refusalCopy(workflow, available)}
    </p>
  );
}

/**
 * The per-card `‹ ›` move arrows (board-prototype-port Task 13) — the first
 * WRITE path in this port. Routes every click through `moveOutcome`
 * (`board-moves.ts`), Task 12's pure gate, and never re-derives its
 * three-way decision: refused / direct / needs-dialog.
 *
 * ## Where each arrow's TARGETS come from
 *
 * `arrowTargets` (`board-arrows.ts`) lists every DECLARED target in each
 * direction, nearest first, walking `columnOrder` outward from `fromStateId`
 * — never the literal adjacent column. See that module's own docblock for
 * the full argument and the canonical `todo -> done` example. A consequence
 * worth being explicit about: because both this component's arrow targets
 * AND `moveOutcome`'s own `refused` check read `transitionOptions` off the
 * identical `(workflow, fromStateId)`, a target this component ever
 * actually SUBMITS is, by construction, always a declared edge — clicking an
 * ENABLED arrow cannot itself land on `moveOutcome`'s `refused` branch in
 * ordinary operation. That branch is still built, still wired, and still
 * load-bearing: it is what a disabled arrow's absence is standing in for
 * (see `columnOrder`'s docblock on `arrowTarget` for the "unavailable, not
 * merely absent" rendering choice below), and it is what Task 14's
 * drag-and-drop reuses this exact same decision point for — a drop's target
 * comes from wherever the pointer lands, which `arrowTargets`'s scan never
 * filters. `board-arrows.test.ts` and the refusal-copy test below prove the
 * mechanism (the scan itself, and what renders when `moveOutcome` refuses)
 * directly, the same way `board-moves.test.ts` already proves `moveOutcome`
 * itself — proving a branch works is not the same claim as proving a live
 * click reaches it, and this docblock does not conflate the two.
 *
 * ## One target moves; several ask (owner request, 2026-09-17)
 *
 * Task 13 shipped the arrows on `arrowTarget` — the NEAREST declared target
 * — so a state with two declared targets one way (`WF_ERRAND`'s `doing`
 * forward: `waiting`, then `done`) silently took the nearer and left the
 * further unreachable by arrow at all. Now each arrow reads the whole
 * directional list: exactly one entry → `attemptMove(target)`, the Task 13
 * path unchanged (`direct` submits, `needs-dialog` opens the dialog); more
 * than one → the dialog opens as a PICKER, and its own `aria-label` says so
 * ("Move to next state — Waiting on counterparty or Done"). Nothing else
 * changes: the picker submits through the same `submitFromDialog` the gated
 * path uses, and `moveOutcome` is not asked a second time — the dialog
 * itself prompts for the chosen edge's rules, exactly as it always has.
 *
 * **The dialog only ever offers what the gesture meant.** `›` offers the
 * forward list, `‹` the backward list, a drop offers the dropped column —
 * `TransitionDialog`'s `offerStateIds`. When that list has exactly one
 * entry it is preselected (`initialToStateId`), so a gated single target
 * opens on its comment box, not on "Choose a state". `dialog` state below
 * carries both halves and is `null` while closed; the dialog is mounted only
 * while it is non-null, so every open is a fresh mount reading a fresh aim —
 * which is also what stops a cancelled pick surviving into the next open
 * (`13.532`).
 *
 * ## `ticketFields: {}` — the conservative reading of an honest absence
 *
 * `BoardCard` carries no field claims (`BoardMoveCapability`'s own docblock
 * cites the design spec saying so in as many words). `{}` is not a guess
 * standing in for missing data — `fieldAlreadyClaimed(ticketFields, field)`
 * on an empty object is `false` for every field, so every `require-field`
 * rule reads as UNMET here, which is the same direction `moveOutcome`
 * already takes for `require-comment`/`require-evidence`/`restrict-to`/
 * `require-different-user` (Ruling 25): never manufacture `direct` out of
 * something this client cannot verify. The failure mode is a needless
 * dialog open on an edge whose field the ticket already carries — a minor
 * UX cost — never a `direct` submit the server then refuses with nothing on
 * screen, which is the failure Ruling 25 exists to prevent. The dialog this
 * opens for `needs-dialog` is handed the SAME `{}`, for the SAME reason: it
 * will prompt for a field that might already be set, never skip one that
 * might not be.
 *
 * ## Unavailable, not absent
 *
 * Both arrows always render, one per direction. `arrowTargets` returning
 * `[]` disables (not removes) that button — `opacity:0.4;
 * cursor:not-allowed` per the metrics table's own "Move button, unavailable"
 * row. The design spec's "an arrow is absent where the workflow declares no
 * move that way" is true of the MOVE, not the DOM node: a fixed pair of
 * slots is what makes "there are exactly two arrows" true of every card, and
 * lets a screen-reader user discover via `aria-disabled`/`disabled` that a
 * direction genuinely has nothing behind it, rather than wondering why a
 * button that exists on other cards is missing from this one.
 */
function MoveArrows({
  card,
  workflow,
  fromStateId: displayedStateId,
  columnOrder,
  moves,
  registerAttempt,
}: {
  card: BoardCardData;
  workflow: WorkflowDef;
  fromStateId: string;
  columnOrder: string[];
  moves: BoardMoveCapability;
  /** Board-prototype-port Task 14 — see `MoveRegistry`'s own docblock above `Board`. */
  registerAttempt: (ticketId: string, attempt: (toStateId: string, from?: FlightRect) => void) => () => void;
}) {
  /**
   * THE EVIDENCE UPLOADER, BOUND TO THIS CARD.
   *
   * `BoardMoveCapability.uploadEvidence` takes a `ticketId` (see its own
   * docblock: ONE capability object serves every card, so it cannot close over
   * "the ticket"), and `TransitionDialog`'s prop takes none. This is the one
   * place the two meet, and this card is the one thing that knows which ticket
   * its dialog is moving.
   *
   * Captured into a local rather than read through `moves.` inside the JSX
   * callback: TypeScript does not carry a narrowing of a PROPERTY into a
   * closure, and the alternative here is a non-null assertion, which this file
   * uses nowhere.
   */
  const { uploadEvidence } = moves;
  const uploadEvidenceForCard =
    uploadEvidence === undefined
      ? undefined
      : (file: File): Promise<{ attachmentId: string }> => uploadEvidence(file, card.ticketId);

  // The whole attempt — refusal, dialog, latch — lives on the BOARD, keyed by ticket (`board-move-state.ts`):
  // this component is unmounted and remounted in another column the moment the move is shown optimistically.
  const moveState = useContext(MoveStateContext);
  if (moveState === null) throw new Error('MoveArrows renders inside a Board, which provides the move state.');
  const { pending } = moveState;
  const session = moveState.sessions[card.ticketId] ?? EMPTY_SESSION;
  // `transportError` is kept SEPARATE from `serverRefusal` on purpose (Ruling 27, 2026-09-16): `serverRefusal`
  // carries only what the engine actually said — a real `{rule, reason}` pair — while this carries a PLAIN
  // SENTENCE for the two cases where nobody adjudicated at all: `ingest` rejected, or answered with no result
  // for this event. Dressed as a rule/reason pair, a dropped connection would read as the server declining.
  // `TransitionDialog` has the identical `transportError` prop for its own submit path.
  const { refusal, serverRefusal, transportError, dialog, submitting } = session;
  const patchSession = (patch: Partial<typeof session>): void => moveState.patchSession(card.ticketId, patch);
  const setRefusal = (value: typeof refusal): void => patchSession({ refusal: value });
  const setServerRefusal = (value: typeof serverRefusal): void => patchSession({ serverRefusal: value });
  const setTransportError = (value: typeof transportError): void => patchSession({ transportError: value });
  const setDialog = (value: typeof dialog): void => patchSession({ dialog: value });
  const setSubmitting = (value: boolean): void => patchSession({ submitting: value });

  // Where the DATA says the card is while its move is unanswered — the card is DRAWN in the target column by
  // then, but the transition dialog and `moveOutcome` are asked about the move it is making, from its source.
  const entry = pending[card.ticketId];
  const fromStateId = entry !== undefined && entry.phase !== 'committed' ? entry.fromStateId : displayedStateId;
  const beginPending = (toStateId: string, phase: 'awaiting' | 'writing', from?: FlightRect, byArrow = false): void =>
    moveState.beginPending(
      { ticketId: card.ticketId, workflowId: workflow.id, fromStateId, toStateId, phase },
      from,
      byArrow,
    );

  /**
   * Ruling 28 (board-prototype-port coordinator, 2026-09-16) — scrolls a notice that renders following a
   * DROP into view, never following an arrow click. `.gn-board__rail` (`ui.css`) is `overflow-x: auto`, and
   * the notice always renders where `MoveArrows` already renders it — under the card in its SOURCE column (a
   * second rendering site nearer the drop point would be the "two products" fork this task exists to avoid).
   * After a rightward drag that column can scroll out of view before the person reads why their card went
   * back — the "silent snap-back" the design spec forbids (`:270-271`) for SIGHTED users; `role="alert"`
   * already announces it regardless of scroll position, so this scroll COMPLETES the disclosure.
   *
   * `session.source` is set at the very top of `attemptMove`, below, to whichever caller invoked it — the
   * arrow handlers pass nothing (`'arrow'`); the registry wrapper the drop path registers passes `'drop'`.
   * It lives in the board-level session now (not a ref here) because the notice is drawn by the card that
   * mounts AFTER the glide back, and that is a different instance from the one the drop reached.
   * `noticeRef` is attached to the single wrapper `<div>` around all three (mutually exclusive) notices, so
   * one ref and one effect cover `refusal`, `serverRefusal` AND `transportError` alike.
   */
  const noticeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (session.source !== 'drop') return;
    if (refusal === null && serverRefusal === null && transportError === null) return;
    noticeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [refusal, serverRefusal, transportError]);

  const previousTargets = arrowTargets(workflow, columnOrder, fromStateId, 'previous');
  const nextTargets = arrowTargets(workflow, columnOrder, fromStateId, 'next');
  // The Move button (mobile plan FD6, Task 5): every board destination, both directions, in one list — the same
  // `transitionOptions` the arrows read, so no second move rule. It is drawn at EVERY width: on a phone it is
  // the only way to move a card (the arrows are hidden there, FD13 — no touch drag-and-drop), above it a ghost
  // "Move to…" after the arrows.
  const boardTargets = allBoardTargets(workflow, fromStateId);
  const moveRefusalId = useId();
  /**
   * Backlog/closed spec §5.2 (2026-09-17) — "a card in a terminal column
   * gains a Close button beside the arrows." Derived HERE, from `workflow`
   * and `fromStateId` this component already holds, rather than threaded in
   * as a `column.category` prop the way an earlier draft of this task's
   * brief proposed — Ruling 35 (coordinator, 2026-09-17) corrected that:
   * `stateCategoryOf` (the same function `entity-state.ts`'s reducer uses to
   * stamp every `TicketState.stateCategory`) takes exactly the two
   * arguments already in scope, so a second prop carrying the identical fact
   * under a different name would be a second, driftable source for
   * something this component can derive for itself with no new data.
   */
  const category = stateCategoryOf(workflow, fromStateId);

  const make = makeSubmittedFactory({ actorId: moves.currentUserId, origin: 'web' });

  /**
   * THE POSITIVE CONTROL'S OWN PATH. A declared, rules-free edge —
   * `moveOutcome`'s `direct` — submits with no dialog, no extra events: one
   * `ticket.transitioned` in the SHIPPED spelling (`{to}`, not `{toStateId}`
   * — `ticket-sheet.tsx`'s own `submitTransition` is the precedent this
   * mirrors).
   *
   * **`submitting` is reset in a `finally`, not after the `await`, and a
   * REJECTED `ingest` is caught rather than left to become an unhandled
   * promise rejection.** This latch has no precedent in
   * `TicketSheet.submitTransition` — that function never disables its own
   * Move button while a submit is in flight, so a rejection there simply
   * leaves it live and retryable. `MoveArrows` adds the latch (to stop a
   * rapid double-click double-submitting through two arrows on the same
   * card), and a latch that is only cleared on the happy path is worse than
   * no latch at all: `ingest` is a network call, and a transport failure
   * would otherwise leave both arrows `disabled` FOREVER, with nothing on
   * screen saying why — a card silently bricked, caught in review before
   * this shipped. `results[0]` being `undefined` (typed, not expected —
   * `ingest` should answer one result per event submitted) gets the same
   * treatment as a real refusal rather than a silent `return`, for the
   * identical reason.
   */
  const submitDirect = async (toStateId: string): Promise<void> => {
    setSubmitting(true);
    try {
      const transition = make({
        workspaceId: moves.workspaceId,
        entity: { kind: 'ticket', id: card.ticketId },
        type: 'ticket.transitioned',
        payload: { to: toStateId },
      });
      const results = await moves.dataSource.ingest([transition]);
      const result = results[0];
      if (result === undefined) {
        // Ruling 27/36: silence, not a refusal — `transportError`, and
        // `serverRefusal` cleared alongside it, the same pairing `closeCard`
        // (below) already carries from Ruling 34 (case `13.588c`). Found in
        // review (Ruling 36, 2026-09-17) — this branch had never carried the
        // clear, even though `closeCard` was built to mirror it, which made
        // that docblock's "mirrors `submitDirect` almost exactly" claim not
        // quite true. REDUNDANT on this component specifically (`13.590a`'s
        // own docblock measures it): `attemptMove`, this function's one call
        // site, already clears `serverRefusal` unconditionally before every
        // new attempt, so a stale "Refused by the server: …" notice
        // surviving into a later silent answer is not reachable through the
        // arrows today either way. Kept for agreement with `closeCard` (which
        // has no such wrapper and DOES rely on this line) and as a second
        // line of defence if `attemptMove` ever stops clearing on its own.
        setServerRefusal(null);
        setTransportError('The server did not answer this move.');
        moveState.dropPending(card.ticketId);
        return;
      }
      if (result.status === 'committed') {
        // The entry stays (phase `committed`) until a read shows the card in its target: the refetch
        // `onMoved()` starts may still be in flight, and a stale one must not flash the card back.
        setServerRefusal(null);
        setTransportError(null);
        moveState.setPhase(card.ticketId, 'committed');
        moves.onMoved();
        return;
      }
      setTransportError(null);
      setServerRefusal(
        result.status === 'refused'
          ? { rule: result.rule, reason: result.reason }
          : { rule: result.code, reason: result.message },
      );
      moveState.dropPending(card.ticketId);
    } catch (cause) {
      // Ruling 27: a transport failure is not a refusal either — same
      // `transportError` channel, own sentence, never `serverRefusal`. E5-25:
      // a 401 is neither, and `writeFailureCopy` is the one place that is
      // decided.
      setTransportError(
        writeFailureCopy(cause, (message) => `We could not reach the server for this move: ${message}`),
      );
      moveState.dropPending(card.ticketId);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * THE CLOSE PATH (backlog/closed spec §5.2, 2026-09-17) — the terminal
   * column's own button, rendered beside the arrows (below, gated on
   * `category === 'terminal'` computed above) rather than replacing either
   * of them: the `›` arrow from a terminal state is already, always,
   * genuinely disabled (`nextTargets` is empty — nothing is declared past
   * the last column), so Close is the one control a terminal card actually
   * offers for leaving that column.
   *
   * `closeCard` mirrors `submitDirect` immediately above almost exactly —
   * same `make`/`ingest`/`results[0]` idiom, same `submitting` latch reset
   * in a `finally` rather than only after a successful `await`, same
   * Ruling-27 split of a real refusal (`serverRefusal`, carried verbatim)
   * from a transport failure or a silent non-answer (`transportError`, this
   * component's own plain-sentence channel, never dressed as the server's
   * own verdict) — because it is the SAME shape `ticket-sheet.tsx`'s own
   * `closeOrReopen` already proved out for this identical event
   * (`ticket.closed`, `payload: {}` — spec §1.2, the envelope alone carries
   * actor and time; cases `13.588a`–`13.588c` pin the latch, the transport
   * split and the silence-clears-`serverRefusal` pairing there). Two things
   * differ from `submitDirect`: the event itself (`ticket.closed`/`{}`
   * rather than `ticket.transitioned`/`{to: toStateId}`), and what a
   * `committed` answer does next — `submitDirect` leaves the card exactly
   * where the server placed it; `closeCard` calls the SAME `moves.onMoved()`
   * `submitDirect` calls, which reaches `board.reload()`. The server's own
   * `getBoard` excludes closed tickets (spec §3.2), so the reload is what ENDS
   * the card's life on the board — but it no longer waits for it to leave
   * (smoothness T7, spec S5): the card is DIMMED in place the moment Close is
   * pressed (a `closes` pending entry; the slot draws `aria-busy` and the dim),
   * hidden by `applyPendingMoves` once the server commits, retired when a read
   * no longer holds the card, and undimmed through `dropPending` when the write
   * is refused. The refusal
   * lives on the board-level session, so it is still there when the card
   * returns. This test suite asserts the ingest payload and the `onMoved` call
   * (`useBoard`/`board.reload()` are not this component's to fake a refetch
   * of) and, since T7, the card's dimming while the write is open (25.097). The copy strings say "this close",
   * never "this move" — the two sentences `submitDirect` uses become "The
   * server did not answer this close." and "We could not reach the server
   * for this close — …", the same word substitution `ticket-sheet.tsx` made
   * for its own "this change."
   *
   * **Deliberately does NOT `setRefusal(null)`.** `refusal` is `attemptMove`'s
   * own client-side `MoveRefusalNotice` state (an undeclared arrow/drop
   * target), and there IS one live path that could leave it stale under a
   * successful close: a drop onto an undeclared column (drops stay live on a
   * terminal card — `draggable` is gated on `arrows !== null`, not on
   * category) sets `refusal`, and a Close click straight after it never
   * touches that state on its way to `committed`. Left alone on purpose,
   * matching `submitDirect` itself — which clears `serverRefusal`/
   * `transportError` on success but never `refusal` either, for cross-arrow
   * clicks today — rather than giving `closeCard` alone a clearing Ruling 34
   * never asked for. The reload `moves.onMoved()` triggers removes the whole
   * card as soon as it lands, which is what actually resolves the stale
   * notice; a `setRefusal(null)` here would only shorten a window that is
   * already closed by the refetch, not fix a persisting one.
   */
  const closeCard = async (): Promise<void> => {
    setSubmitting(true);
    // The card is dimmed in place at once (T7 F2); a commit hides it, every other arm undims it.
    moveState.beginPending(
      { ticketId: card.ticketId, workflowId: workflow.id, fromStateId: displayedStateId, toStateId: displayedStateId, phase: 'writing', closes: true },
      undefined,
      false,
    );
    try {
      const closed = make({
        workspaceId: moves.workspaceId,
        entity: { kind: 'ticket', id: card.ticketId },
        type: 'ticket.closed',
        payload: {},
      });
      const results = await moves.dataSource.ingest([closed]);
      const result = results[0];
      if (result === undefined) {
        // Ruling 27/34: silence, not a refusal — `transportError`, and
        // `serverRefusal` cleared alongside it (Ruling 34's own pairing,
        // case `13.588c`): a REFUSED click followed by a SILENT one must not
        // leave the earlier "Refused by the server: …" notice standing
        // beside the new one, describing an answer that no longer holds.
        setServerRefusal(null);
        setTransportError('The server did not answer this close.');
        moveState.dropPending(card.ticketId);
        return;
      }
      if (result.status === 'committed') {
        setServerRefusal(null);
        setTransportError(null);
        moveState.setPhase(card.ticketId, 'committed');
        moves.onMoved();
        return;
      }
      setTransportError(null);
      setServerRefusal(
        result.status === 'refused'
          ? { rule: result.rule, reason: result.reason }
          : { rule: result.code, reason: result.message },
      );
      moveState.dropPending(card.ticketId);
    } catch (cause) {
      moveState.dropPending(card.ticketId);
      // Ruling 27: a transport failure is not a refusal either — same
      // `transportError` channel `submitDirect` uses, own sentence, never
      // `serverRefusal`. E5-25: the 401 arm joins it, one author.
      setTransportError(
        writeFailureCopy(cause, (message) => `We could not reach the server for this close: ${message}`),
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * THE REFUSAL PATH, built first (Task 13's own brief) because it is the
   * one a wrong target hits — see this component's own docblock for why a
   * live, enabled-arrow click cannot organically be that wrong target, and
   * why the branch is still real and still exercised (by the shared gate's
   * own tests, and by Task 14's drop).
   *
   * `source` (Ruling 28) carries NO decision-making weight whatsoever — it
   * never touches `moveOutcome`, never changes which branch runs, never
   * changes what is submitted. It exists purely to tell `noticeRef`'s own
   * effect, above, whether to scroll: `'arrow'` (the default, every existing
   * call site unchanged) never scrolls, since an arrow click cannot move the
   * origin column out of view; `'drop'` (passed only by the registry
   * wrapper `registerAttempt` below registers) can.
   */
  const attemptMove = (toStateId: string, source: 'arrow' | 'drop' = 'arrow', from?: FlightRect): void => {
    // Set AFTER the latch check — a call the latch blocks produces no new
    // refusal/serverRefusal/transportError, so the notice effect above
    // never re-runs for it regardless; but recording its source anyway
    // would still clobber the CORRECT source of an earlier, still in-flight
    // attempt whose async result has not resolved yet.
    if (submitting) return;
    patchSession({ source, refusal: null, serverRefusal: null, transportError: null });
    const outcome = moveOutcome(workflow, fromStateId, toStateId, {});
    if (outcome.kind === 'refused') {
      setRefusal({ available: outcome.available });
      return;
    }
    if (outcome.kind === 'direct') {
      // Assume it succeeds (owner, 2026-10-01): the card is drawn in its target NOW, at the slot the drop
      // placeholder showed; a refusal or a failure releases it and it glides back.
      beginPending(outcome.toStateId, 'writing', from, source === 'arrow');
      void submitDirect(outcome.toStateId);
      return;
    }
    // The gesture meant exactly this one state: offer it alone, already aimed. The card waits in the
    // landing slot, faded, until the dialog is confirmed or cancelled.
    beginPending(outcome.toStateId, 'awaiting', from, source === 'arrow');
    setDialog({ offer: [outcome.toStateId], preselect: outcome.toStateId });
  };

  /**
   * An arrow's own click: one declared target that way moves (or opens the
   * dialog aimed at it) through `attemptMove`, the Task 13 path; several
   * open the dialog as a picker over exactly those. Never `moveOutcome` for
   * the picker — nothing has been chosen yet for it to judge.
   */
  const arrowClick = (targets: string[]): void => {
    if (submitting) return;
    if (targets.length === 1) {
      attemptMove(targets[0]!);
      return;
    }
    if (targets.length > 1) {
      patchSession({ source: 'arrow', refusal: null, serverRefusal: null, transportError: null, dialog: { offer: targets, preselect: null } });
    }
  };

  /**
   * The Move button's own click: the dialog over EVERY destination, never `moveOutcome` (nothing has been chosen
   * yet for it to judge). One destination opens already aimed at it; several open on "Choose a state". The pick is
   * submitted by `submitFromDialog`, the path the arrows' picker already takes, so the card lands optimistically.
   */
  const moveClick = (): void => {
    if (submitting || boardTargets.length === 0) return;
    patchSession({
      source: 'arrow',
      refusal: null,
      serverRefusal: null,
      transportError: null,
      dialog: { offer: boardTargets, preselect: boardTargets.length === 1 ? (boardTargets[0] ?? null) : null, markRules: true },
    });
  };

  /** "Move to Doing" for one target; "Move to next state: Doing or Done" for a choice; the "unavailable" sentence for none. */
  const arrowLabel = (direction: 'previous' | 'next', targets: string[]): string => {
    if (targets.length === 0) return `Move to ${direction} state: unavailable`;
    if (targets.length === 1) return `Move to ${stateNameOf(workflow, targets[0]!)}`;
    const names = targets.map((stateId) => stateNameOf(workflow, stateId));
    return `Move to ${direction} state: ${names.join(' or ')}`;
  };

  /**
   * Publishes THIS card's real `attemptMove` into the shared drop registry
   * (board-prototype-port Task 14) on every render. `attemptMove` is a
   * fresh closure each render — it reads `submitting`/`fromStateId`/
   * `workflow` from this render's own scope, exactly like `submitDirect`
   * above — so a `useEffect` naming it in the dependency array re-registers
   * on every render regardless; writing the array out explicitly rather
   * than omitting it says so, rather than leaving it implicit. Cleanup
   * (unmount, or superseded by a fresher registration) is `registerAttempt`'s
   * own returned function — see its docblock in `BoardGroupWithMoves` for
   * why it is guarded rather than an unconditional delete.
   *
   * The registered function is a one-line wrapper, `(toStateId) =>
   * attemptMove(toStateId, 'drop')`, NOT `attemptMove` passed bare (Ruling
   * 28) — the ONLY difference from Task 14's original wiring, and it changes
   * no dispatch: it exists solely so `attemptMove`'s own `session.source`
   * write, above, can tell a drop-triggered notice from an arrow-triggered
   * one, for the scroll-into-view effect. Every arrow `onClick` below
   * reaches `attemptMove(target)` through `arrowClick` with no second
   * argument — unchanged.
   *
   * **`useLayoutEffect`, not `useEffect` (2026-09-17, case `13.534`).** A
   * passive effect is a macrotask React schedules AFTER the commit that
   * painted this card `draggable="true"`; a layout effect runs synchronously
   * INSIDE that commit. With the passive form there was a window — the
   * DOM already showing a draggable card, the registry not yet holding its
   * handler — in which a drop was `handleDrop`'s silent no-op. Invisible to
   * a person (a drag takes longer than the window) but real to a test that
   * fires the drop the instant the arrows appear: three drag-drop cases
   * flaked exactly that way under load, and `13.534` fires the drop from a
   * MutationObserver callback (the same microtask slot `waitFor` observes
   * from) to reproduce it deterministically. Ruling 15's own principle from
   * the other side: an affordance the DOM shows must be live the instant it
   * is shown. Nothing else about the registration changes — same wrapper,
   * same deps, same guarded cleanup.
   */
  useLayoutEffect(() => {
    const attemptFromDrop = (toStateId: string, from?: FlightRect): void => attemptMove(toStateId, 'drop', from);
    return registerAttempt(card.ticketId, attemptFromDrop);
  }, [registerAttempt, card.ticketId, attemptMove]);

  /** Mirrors `TicketSheet.precheck` exactly — `cache` optional, absence answers `not-evaluated` rather than manufacturing `passed`. */
  const precheck = async (
    toStateId: string,
    evidenceAttachmentId?: string | null,
  ): Promise<PrecheckResult> => {
    if (moves.cache === undefined) return { kind: 'not-evaluated', why: 'missing-local-state' };
    // Same reason as `TicketSheet`'s twin: the candidate carries what the
    // submission will carry, or `require-evidence` refuses a move the person
    // has just satisfied. See `TransitionDialogProps.precheck`.
    const payload: Record<string, unknown> = { to: toStateId };
    if (evidenceAttachmentId !== undefined && evidenceAttachmentId !== null) {
      payload['evidenceAttachmentId'] = evidenceAttachmentId;
    }
    const candidate = make({
      workspaceId: moves.workspaceId,
      entity: { kind: 'ticket', id: card.ticketId },
      type: 'ticket.transitioned',
      payload,
    });
    return precheckEvent(candidate, moves.cache);
  };

  /**
   * A dialog write has failed. If the dialog is still open the card goes back to WAITING in its landing slot,
   * for a retry or a Cancel. If it was closed while the write was open (the board passes the dialog no
   * `submitting`, so Cancel and Esc stay live) nobody is left to retry or cancel, and a card washed and
   * waiting forever would be stuck: release it, and it glides back with the reason under it. The session is
   * read through `sessionOf` — this closure is from the render that began the write.
   */
  const settleFailedDialogWrite = (): void => {
    if (moveState.sessionOf(card.ticketId).dialog === null) moveState.dropPending(card.ticketId);
    else moveState.setPhase(card.ticketId, 'awaiting');
  };
  /**
   * Mirrors `TicketSheet.submitTransition`'s ORDERING exactly — field claims
   * first, the transition last, one ordered batch, the shipped payload
   * spelling — but deliberately NOT its unguarded shape.
   * `TicketSheet.submitTransition` lets a rejected `ingest` become an
   * unhandled promise rejection; this function does not, for the identical
   * reason `submitDirect`'s own `try/catch` exists (case `13.504`):
   * `TransitionDialog`'s `onSubmit` prop is `void`-typed and this
   * component's own call site (`onSubmit={(submission) =>
   * void submitFromDialog(submission)}`) is fire-and-forget, so nothing else
   * in the tree would ever see a transport failure here — the dialog would
   * stay open with nothing on screen saying why, the same user-visible
   * symptom `13.504` fixed for the arrows, just behind the dialog instead.
   * `TransitionDialog` already renders `serverRefusal` internally through its
   * own `serverRefusal` prop (`transition-dialog.tsx:311-314`); Ruling 27
   * (board-prototype-port, 2026-09-16) added the sibling `transportError` prop
   * for exactly the case this `catch` reaches — a dropped connection is not a
   * refusal, so it renders through that separate prop, its own sentence, its
   * own CSS class, never dressed as the server's own verdict.
   */
  const submitFromDialog = async (submission: TransitionSubmission): Promise<void> => {
    const fieldEvents = Object.entries(submission.fieldValues).map(([fieldId, value]) =>
      make({
        workspaceId: moves.workspaceId,
        entity: { kind: 'ticket', id: card.ticketId },
        type: 'ticket.field_set',
        payload: { fieldId, value },
      }),
    );
    const transitionPayload: Record<string, unknown> = { to: submission.toStateId };
    if (submission.comment !== undefined) transitionPayload['comment'] = { text: submission.comment };
    if (submission.evidenceAttachmentId !== undefined) {
      transitionPayload['evidenceAttachmentId'] = submission.evidenceAttachmentId;
    }
    const transition = make({
      workspaceId: moves.workspaceId,
      entity: { kind: 'ticket', id: card.ticketId },
      type: 'ticket.transitioned',
      payload: transitionPayload,
    });
    // Confirming is the moment the card's target is certain (a picker offered several): lay the entry now
    // (a no-op upsert when the gesture already aimed it), so the card settles into the slot while it writes.
    // (a picker is reached by the arrows only: a drop aims a dialog at one state and has laid its entry already)
    beginPending(submission.toStateId, 'writing', undefined, true);
    try {
      const results = await moves.dataSource.ingest([...fieldEvents, transition]);
      const failed = results.find((result) => result.status !== 'committed');
      if (failed === undefined) {
        setServerRefusal(null);
        setTransportError(null);
        setDialog(null);
        moveState.setPhase(card.ticketId, 'committed');
        moves.onMoved();
        return;
      }
      setTransportError(null);
      setServerRefusal(
        failed.status === 'refused'
          ? { rule: failed.rule, reason: failed.reason }
          : { rule: failed.code, reason: failed.message },
      );
      settleFailedDialogWrite();
    } catch (cause) {
      // Ruling 27: `transportError`, never a hand-built `serverRefusal`.
      // E5-25: a 401 goes to the session sentence through the same author.
      setTransportError(
        writeFailureCopy(cause, (message) => `We could not reach the server for this move: ${message}`),
      );
      settleFailedDialogWrite();
    }
  };

  return (
    <div className="gn-board-card__moves">
      {/* The controls are ONE group (neo follow-up F-1, case 23.320): above 1024px the stylesheet makes it the footer's
          second row, right-aligned and never wrapping, while the notice below stays outside it so a refusal can still
          take its own line. Below that the group is `display: contents`, so the footer lays out as it always did. */}
      <div className="gn-board-card__controls">
        <button
          type="button"
          className="gn-board-card__move"
          disabled={previousTargets.length === 0 || submitting}
          aria-label={arrowLabel('previous', previousTargets)}
          onClick={() => arrowClick(previousTargets)}
        >
          ‹
        </button>
        <button
          type="button"
          className="gn-board-card__move"
          disabled={nextTargets.length === 0 || submitting}
          aria-label={arrowLabel('next', nextTargets)}
          onClick={() => arrowClick(nextTargets)}
        >
          ›
        </button>
        <button
          type="button"
          className="gn-board-card__move gn-board-card__move-to"
          disabled={boardTargets.length === 0 || submitting}
          aria-label="Move to another state"
          aria-describedby={boardTargets.length === 0 ? moveRefusalId : undefined}
          onClick={moveClick}
        >
          {/* The word differs by width — "Move" on a phone, "Move to…" above — and the stylesheet picks one
              (`.gn-board-card__move-label--*`). Both are `aria-hidden`: the accessible name is the one `aria-label`
              at every width, and a visible word read on top of it would be said twice. */}
          <span className="gn-board-card__move-label--phone" aria-hidden="true">
            Move
          </span>
          <span className="gn-board-card__move-label--wide" aria-hidden="true">
            Move to…
          </span>
        </button>
        {/* Backlog/closed spec §5.2 — terminal columns only; `category` is
            computed once above, alongside `previousTargets`/`nextTargets`. */}
        {category === 'terminal' ? (
          <button
            type="button"
            className="gn-board-card__close"
            aria-label={`Close ${card.title}`}
            disabled={submitting}
            onClick={() => void closeCard()}
          >
            Close
          </button>
        ) : null}
      </div>
      {boardTargets.length === 0 ? (
        // Disabled, never absent (as the arrows are): the reason is the board's own refusal sentence, read
        // off the same `transitionOptions` list `moveOutcome` would name — `refusalCopy` drops Backlog itself.
        <span id={moveRefusalId} hidden>
          {refusalCopy(
            workflow,
            transitionOptions(workflow, fromStateId).map((option) => option.toStateId),
          )}
        </span>
      ) : null}
      {/*
       * Ruling 28 (coordinator, 2026-09-16) — `ref={noticeRef}` on this
       * wrapper, never on any one notice individually, is what lets ONE
       * scroll-into-view effect (above `attemptMove`'s own definition)
       * cover all three mutually-exclusive notices below with no per-kind
       * duplication. `display: contents` (`ui.css`) keeps this `<div>`
       * invisible to `.gn-board-card__moves`'s own flex layout — a plain
       * wrapping box would otherwise become a new flex item where three
       * conditional siblings used to be.
       */}
      <div className="gn-board-card__notice" ref={noticeRef}>
        {refusal !== null ? <MoveRefusalNotice workflow={workflow} available={refusal.available} /> : null}
        {serverRefusal !== null && dialog === null ? (
          <p role="alert" className="gn-refusal gn-refusal--server">
            {`Refused by the server: ${serverRefusal.rule}: ${serverRefusal.reason}`}
          </p>
        ) : null}
        {/*
         * Ruling 27 — a distinct sentence and a distinct class from the block
         * immediately above; never the words "Refused by the server".
         *
         * These two blocks are MUTUALLY EXCLUSIVE BY CONSTRUCTION, not by a
         * guard here — every setter that sets one of `serverRefusal`/
         * `transportError` also nulls the other (`attemptMove`, and both
         * terminal branches of `submitDirect`/`submitFromDialog`), so they are
         * never both non-null at once. Worth stating plainly: `getByRole(
         * 'alert')` (singular) in this file's own tests would throw on
         * ambiguity, not fail cleanly, if that invariant ever broke — a state
         * bug that would read as a query bug.
         */}
        {transportError !== null && dialog === null ? (
          <p role="alert" className={writeFailureRefusalClass(transportError)}>
            {transportError}
          </p>
        ) : null}
      </div>
      {dialog !== null ? (
        <TransitionDialog
          open
          workflow={workflow}
          fromStateId={fromStateId}
          ticketFields={{}}
          offerStateIds={dialog.offer}
          initialToStateId={dialog.preselect}
          markRules={dialog.markRules}
          onClose={() => {
            patchSession({ dialog: null, serverRefusal: null, transportError: null });
            // Cancel: the card glides back out of the landing slot. (A committed entry is left to its read.)
            if (entry?.phase === 'awaiting') moveState.dropPending(card.ticketId);
          }}
          onSubmit={(submission) => void submitFromDialog(submission)}
          precheck={precheck}
          serverRefusal={serverRefusal}
          transportError={transportError}
          uploadEvidence={uploadEvidenceForCard}
        />
      ) : null}
    </div>
  );
}

export function useBoard(
  source: DataSource,
  workspaceId: string,
  projectId: string,
): LiveQueryResult<BoardViewData> {
  // `projectId` is both the query key and the query's argument, because it is
  // exactly what changes when the board is pointed somewhere else. Passing it
  // as the key is what makes a project switch refetch at all — see the two
  // effects in `useLiveQuery`.
  return useLiveQuery(source, workspaceId, projectId, () => source.query.getBoard(projectId));
}
