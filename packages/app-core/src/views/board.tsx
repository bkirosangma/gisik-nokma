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
};

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
export function Board({ board, onOpenTicket }: BoardProps) {
  return (
    <div className="gn-board">
      {board.groups.map((group) => (
        <section key={`${group.workflowId}@${group.workflowVersion}`} className="gn-board__group">
          {board.groups.length > 1 ? <h3 className="gn-board__workflow">{group.workflowName}</h3> : null}
          <div className="gn-board__columns">
            {group.columns.map((column) => (
              <section
                key={column.stateId}
                role="region"
                aria-label={column.name}
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
                    <li key={card.ticketId} className="gn-board__card-slot">
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
    <Card className="gn-board-card">
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
