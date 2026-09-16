import { useState, type ReactNode } from 'react';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Avatar, Button, Card, Chip } from '@gisik-nokma/ui';
import type { ClientStateCache } from '../cache.js';
import type { DataSource } from '../data-source.js';
import { precheckEvent, type PrecheckResult } from '../precheck.js';
import { actorLabel, formatStateProvenance } from '../provenance.js';
import { makeSubmittedFactory } from '../submit.js';
import type {
  BoardCard as BoardCardData,
  BoardGroup,
  BoardView as BoardViewData,
} from '../view-types.js';
import { arrowTarget } from './board-arrows.js';
import { moveOutcome } from './board-moves.js';
import { formatRollup } from './rollup-text.js';
import { TransitionDialog, type TransitionSubmission } from './transition-dialog.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';

export type BoardProps = {
  board: BoardViewData;
  onOpenTicket: (ticketId: string) => void;
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
   */
  onCreateTicket?: () => void;
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
   * The per-card `‹ ›` move arrows (board-prototype-port Task 13). OPTIONAL,
   * the SAME precedent `onCreateTicket` and `isNarrowed` already set on this
   * type immediately above: a mount with nothing to submit through passes
   * nothing, and `Board` renders exactly as it did before this capability
   * existed — no arrows drawn at all, never dead ones with no `dataSource`
   * behind them.
   */
  moves?: BoardMoveCapability;
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
  uploadEvidence?: (file: File) => Promise<{ attachmentId: string }>;
};

/**
 * The words an empty board says instead of drawing nothing.
 *
 * Pinned copy (Plan 6 Task 15b, item 4). Exported so the shell's own tests can
 * assert the same string this renders rather than a re-typed copy of it — two
 * spellings of one sentence is how a copy change passes a test it broke.
 */
export const EMPTY_BOARD_COPY = 'No tickets here yet — create one.';

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
 * (`filter/board-filter.ts`) narrowed it to zero". The narrowing pass that
 * would know the difference runs above this component, in the shell that
 * builds `boardNarrowing`, and it already discloses an active filter through
 * the `N of M shown` count and its removable chips. Re-stating that
 * disclosure here, per column, with data this component was never given,
 * would risk a second, unsynchronised copy of the same fact — so the
 * sentence says only what is true in both cases, exactly the discipline
 * `EMPTY_BOARD_COPY`'s own docblock already holds itself to.
 */
export const EMPTY_COLUMN_COPY = 'No tickets in this column yet.';

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
export function Board({ board, onOpenTicket, onCreateTicket, isNarrowed, moves }: BoardProps) {
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
        <p className="gn-board__empty-copy">{EMPTY_BOARD_COPY}</p>
        {onCreateTicket !== undefined ? (
          <button type="button" className="gn-board__empty-create" onClick={onCreateTicket}>
            Create a ticket
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
    <div className="gn-board">
      {emptyBanner}
      {board.groups.map((group) => {
        const key = `${group.workflowId}@${group.workflowVersion}`;
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
            groupCount={board.groups.length}
            onOpenTicket={onOpenTicket}
            onCreateTicket={onCreateTicket}
            moves={moves}
          />
        ) : (
          <BoardGroupSection
            key={key}
            group={group}
            groupCount={board.groups.length}
            onOpenTicket={onOpenTicket}
            onCreateTicket={onCreateTicket}
            arrows={null}
          />
        );
      })}
    </div>
  );
}

/**
 * The column rail for ONE workflow group — extracted from `Board`'s own
 * render (board-prototype-port Task 13) so the exact same JSX serves both
 * the plain read-only board and `BoardGroupWithMoves` below. `arrows` is the
 * ONLY axis of difference between the two paths: precomputed by the caller
 * as `(card, fromStateId) => ReactNode`, or `null` when no move capability
 * is wired, so this component itself stays hook-free and renders identically
 * either way except for what `arrows` hands back per card.
 */
function BoardGroupSection({
  group,
  groupCount,
  onOpenTicket,
  onCreateTicket,
  arrows,
}: {
  group: BoardGroup;
  groupCount: number;
  onOpenTicket: (ticketId: string) => void;
  onCreateTicket?: () => void;
  arrows: ((card: BoardCardData, fromStateId: string) => ReactNode) | null;
}) {
  return (
    <section className="gn-board__group">
      {groupCount > 1 ? <h3 className="gn-board__workflow">{group.workflowName}</h3> : null}
      <div className="gn-board__rail">
        {group.columns.map((column) => (
          <section
            key={column.stateId}
            role="region"
            aria-label={column.name}
            data-testid={`board-column-${column.stateId}`}
            className={
              column.blocked ? 'gn-board__column gn-board__column--blocked' : 'gn-board__column'
            }
          >
            <header className="gn-board__column-header">
              <Chip tone={column.blocked ? 'blocked' : column.category}>{column.name}</Chip>
              <span className="gn-board__count">{column.cards.length}</span>
            </header>
            <ul className="gn-board__cards">
              {column.cards.map((card) => (
                <li
                  key={card.ticketId}
                  className="gn-board__card-slot"
                  data-testid={`ticket-card-${card.ticketId}`}
                >
                  <BoardCardView
                    card={card}
                    stateName={column.name}
                    onOpen={() => onOpenTicket(card.ticketId)}
                    arrows={arrows === null ? null : arrows(card, column.stateId)}
                  />
                </li>
              ))}
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
             * The action reuses `onCreateTicket` UNSCOPED — the same
             * handler `emptyBanner`'s button already calls, with no
             * column argument, because `BoardProps` carries none to
             * pass and adding one is outside this task. Labelled "Add a
             * ticket" rather than repeating `emptyBanner`'s "Create a
             * ticket" for two reasons: it matches the prototype's own
             * per-column copy, and a board can render both an
             * `emptyBanner` button and one of these per empty column at
             * once (R6) — an identical accessible name on every one of
             * them would be indistinguishable by role and name alike.
             * Different wording does NOT claim the created ticket lands
             * in THIS column; the handler has no way to place it there,
             * and that is unchanged by this task.
             */}
            {column.cards.length === 0 ? (
              <div className="gn-board__column-empty">
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
                <p className="gn-board__column-empty-copy">{EMPTY_COLUMN_COPY}</p>
                {onCreateTicket !== undefined ? (
                  <Button onClick={onCreateTicket}>Add a ticket</Button>
                ) : null}
              </div>
            ) : null}
          </section>
        ))}
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
  groupCount,
  onOpenTicket,
  onCreateTicket,
  moves,
}: {
  group: BoardGroup;
  groupCount: number;
  onOpenTicket: (ticketId: string) => void;
  onCreateTicket?: () => void;
  moves: BoardMoveCapability;
}) {
  const workflowKey = `${group.workflowId}@${group.workflowVersion}`;
  const workflow = useLiveQuery(moves.dataSource, moves.workspaceId, workflowKey, () =>
    moves.dataSource.query.getWorkflowDef(moves.workspaceId, group.workflowId, group.workflowVersion),
  );
  // `group.columns` order IS `def.states` order for this pinned version —
  // `arrowTarget`'s own docblock cites the server code that guarantees it —
  // so this is the rendered column list, not a second derivation from `def`.
  const columnOrder = group.columns.map((column) => column.stateId);
  const workflowDef = workflow.data;
  return (
    <BoardGroupSection
      group={group}
      groupCount={groupCount}
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
              />
            )
      }
    />
  );
}

/**
 * A card never renders a state as a standing fact. The state is folded behind
 * "who · when" and unfolds to the whole claim — WHO marked it and WHEN —
 * through `formatStateProvenance`, which is the module that knows a nameless
 * claim still names its actor by id and that every instant this product shows
 * goes through the domain's one `formatIstInstant`. Inlining either half here
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
  arrows,
}: {
  card: BoardCardData;
  stateName: string;
  onOpen: () => void;
  arrows: ReactNode;
}) {
  const [unfolded, setUnfolded] = useState(false);
  return (
    <Card className={card.pending ? 'gn-board-card gn-board-card--pending' : 'gn-board-card'}>
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
            reopened — live work added
          </Chip>
        ) : null}
        {card.rollup !== null ? (
          <span className="gn-board-card__progress">{formatRollup(card.rollup)}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="gn-board-card__provenance"
        aria-expanded={unfolded}
        onClick={() => setUnfolded((value) => !value)}
      >
        {unfolded ? formatStateProvenance(stateName, card.stateProvenance) : 'who · when'}
      </button>
      {arrows}
    </Card>
  );
}

/** `WorkflowDef.states[].name`, falling back to the raw id — the same fallback `EMPTY_COLUMN_COPY`'s sibling components use rather than a blank. */
function stateNameOf(workflow: WorkflowDef, stateId: string): string {
  return workflow.states.find((state) => state.id === stateId)?.name ?? stateId;
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
 */
export function refusalCopy(workflow: WorkflowDef, available: string[]): string {
  if (available.length === 0) return "This ticket can't move from here.";
  const names = available.map((stateId) => stateNameOf(workflow, stateId));
  return `Can't move there — try ${names.join(' or ')}.`;
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
 * ## Where each arrow's TARGET comes from
 *
 * `arrowTarget` (`board-arrows.ts`) resolves the nearest DECLARED target in
 * each direction, walking `columnOrder` outward from `fromStateId` — never
 * the literal adjacent column. See that module's own docblock for the full
 * argument and the canonical `todo -> done` example. A consequence worth
 * being explicit about: because both this component's arrow targets AND
 * `moveOutcome`'s own `refused` check read `transitionOptions` off the
 * identical `(workflow, fromStateId)`, a target this component ever
 * actually SUBMITS is, by construction, always a declared edge — clicking an
 * ENABLED arrow cannot itself land on `moveOutcome`'s `refused` branch in
 * ordinary operation. That branch is still built, still wired, and still
 * load-bearing: it is what a disabled arrow's absence is standing in for
 * (see `columnOrder`'s docblock on `arrowTarget` for the "unavailable, not
 * merely absent" rendering choice below), and it is what Task 14's
 * drag-and-drop reuses this exact same decision point for — a drop's target
 * comes from wherever the pointer lands, which `arrowTarget`'s scan never
 * filters. `board-arrows.test.ts` and the refusal-copy test below prove the
 * mechanism (the scan itself, and what renders when `moveOutcome` refuses)
 * directly, the same way `board-moves.test.ts` already proves `moveOutcome`
 * itself — proving a branch works is not the same claim as proving a live
 * click reaches it, and this docblock does not conflate the two.
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
 * Both arrows always render, one per direction. `arrowTarget` returning
 * `null` disables (not removes) that button — `opacity:0.4;
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
  fromStateId,
  columnOrder,
  moves,
}: {
  card: BoardCardData;
  workflow: WorkflowDef;
  fromStateId: string;
  columnOrder: string[];
  moves: BoardMoveCapability;
}) {
  const [refusal, setRefusal] = useState<{ available: string[] } | null>(null);
  const [serverRefusal, setServerRefusal] = useState<{ rule: string; reason: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const previousTarget = arrowTarget(workflow, columnOrder, fromStateId, 'previous');
  const nextTarget = arrowTarget(workflow, columnOrder, fromStateId, 'next');

  const make = makeSubmittedFactory({ actorId: moves.currentUserId, origin: 'web' });

  /**
   * THE POSITIVE CONTROL'S OWN PATH. A declared, rules-free edge —
   * `moveOutcome`'s `direct` — submits with no dialog, no extra events: one
   * `ticket.transitioned` in the SHIPPED spelling (`{to}`, not `{toStateId}`
   * — `ticket-sheet.tsx`'s own `submitTransition` is the precedent this
   * mirrors).
   */
  const submitDirect = async (toStateId: string): Promise<void> => {
    setSubmitting(true);
    const transition = make({
      workspaceId: moves.workspaceId,
      entity: { kind: 'ticket', id: card.ticketId },
      type: 'ticket.transitioned',
      payload: { to: toStateId },
    });
    const results = await moves.dataSource.ingest([transition]);
    setSubmitting(false);
    const result = results[0];
    if (result === undefined) return;
    if (result.status === 'committed') {
      setServerRefusal(null);
      moves.onMoved();
      return;
    }
    setServerRefusal(
      result.status === 'refused'
        ? { rule: result.rule, reason: result.reason }
        : { rule: result.code, reason: result.message },
    );
  };

  /**
   * THE REFUSAL PATH, built first (Task 13's own brief) because it is the
   * one a wrong target hits — see this component's own docblock for why a
   * live, enabled-arrow click cannot organically be that wrong target, and
   * why the branch is still real and still exercised (by the shared gate's
   * own tests, and by Task 14's drop).
   */
  const attemptMove = (toStateId: string): void => {
    if (submitting) return;
    setRefusal(null);
    setServerRefusal(null);
    const outcome = moveOutcome(workflow, fromStateId, toStateId, {});
    if (outcome.kind === 'refused') {
      setRefusal({ available: outcome.available });
      return;
    }
    if (outcome.kind === 'direct') {
      void submitDirect(outcome.toStateId);
      return;
    }
    setDialogOpen(true);
  };

  /** Mirrors `TicketSheet.precheck` exactly — `cache` optional, absence answers `not-evaluated` rather than manufacturing `passed`. */
  const precheck = async (toStateId: string): Promise<PrecheckResult> => {
    if (moves.cache === undefined) return { kind: 'not-evaluated', why: 'missing-local-state' };
    const candidate = make({
      workspaceId: moves.workspaceId,
      entity: { kind: 'ticket', id: card.ticketId },
      type: 'ticket.transitioned',
      payload: { to: toStateId },
    });
    return precheckEvent(candidate, moves.cache);
  };

  /** Mirrors `TicketSheet.submitTransition` exactly — field claims first, the transition last, one ordered batch, the shipped payload spelling. */
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
    const results = await moves.dataSource.ingest([...fieldEvents, transition]);
    const failed = results.find((result) => result.status !== 'committed');
    if (failed === undefined) {
      setServerRefusal(null);
      setDialogOpen(false);
      moves.onMoved();
      return;
    }
    setServerRefusal(
      failed.status === 'refused'
        ? { rule: failed.rule, reason: failed.reason }
        : { rule: failed.code, reason: failed.message },
    );
  };

  return (
    <div className="gn-board-card__moves">
      <button
        type="button"
        className="gn-board-card__move gn-board-card__move--previous"
        disabled={previousTarget === null || submitting}
        aria-label={
          previousTarget === null
            ? 'Move to previous state — unavailable'
            : `Move to ${stateNameOf(workflow, previousTarget)}`
        }
        onClick={() => {
          if (previousTarget !== null) attemptMove(previousTarget);
        }}
      >
        ‹
      </button>
      <button
        type="button"
        className="gn-board-card__move gn-board-card__move--next"
        disabled={nextTarget === null || submitting}
        aria-label={
          nextTarget === null
            ? 'Move to next state — unavailable'
            : `Move to ${stateNameOf(workflow, nextTarget)}`
        }
        onClick={() => {
          if (nextTarget !== null) attemptMove(nextTarget);
        }}
      >
        ›
      </button>
      {refusal !== null ? <MoveRefusalNotice workflow={workflow} available={refusal.available} /> : null}
      {serverRefusal !== null && !dialogOpen ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {`Refused by the server — ${serverRefusal.rule}: ${serverRefusal.reason}`}
        </p>
      ) : null}
      <TransitionDialog
        open={dialogOpen}
        workflow={workflow}
        fromStateId={fromStateId}
        ticketFields={{}}
        onClose={() => {
          setDialogOpen(false);
          setServerRefusal(null);
        }}
        onSubmit={(submission) => void submitFromDialog(submission)}
        precheck={precheck}
        serverRefusal={serverRefusal}
        uploadEvidence={moves.uploadEvidence}
      />
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
