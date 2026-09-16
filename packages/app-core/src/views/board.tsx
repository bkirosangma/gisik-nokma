import { useState } from 'react';
import { Avatar, Button, Card, Chip } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { actorLabel, formatStateProvenance } from '../provenance.js';
import type { BoardCard as BoardCardData, BoardView as BoardViewData } from '../view-types.js';
import { formatRollup } from './rollup-text.js';
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
export function Board({ board, onOpenTicket, onCreateTicket, isNarrowed }: BoardProps) {
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
      {board.groups.map((group) => (
        <section key={`${group.workflowId}@${group.workflowVersion}`} className="gn-board__group">
          {board.groups.length > 1 ? <h3 className="gn-board__workflow">{group.workflowName}</h3> : null}
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
      ))}
    </div>
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
 */
function BoardCardView({
  card,
  stateName,
  onOpen,
}: {
  card: BoardCardData;
  stateName: string;
  onOpen: () => void;
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
    </Card>
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
