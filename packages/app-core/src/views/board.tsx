import { useState } from 'react';
import { Avatar, Card, Chip } from '@gisik-nokma/ui';
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
 * Columns are exactly the attached workflow's states — empty ones render too,
 * and a project mixing workflows gets one group per workflow, because merging
 * column sets would invent columns no definition declares (spec §7).
 *
 * Grouping here is a REARRANGEMENT, never a filter: every card the view was
 * given is rendered exactly once, whether the project's tickets sit under one
 * workflow or several. A grouping that drops a card is a filter wearing a
 * grouping's name, and the ticket it dropped is gone with nothing saying so.
 */
export function Board({ board, onOpenTicket, onCreateTicket }: BoardProps) {
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
   */
  if (board.groups.length === 0) {
    return (
      <div className="gn-board gn-board--empty">
        <p className="gn-board__empty-copy">{EMPTY_BOARD_COPY}</p>
        {onCreateTicket !== undefined ? (
          <button type="button" className="gn-board__empty-create" onClick={onCreateTicket}>
            Create a ticket
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="gn-board">
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
