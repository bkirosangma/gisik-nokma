import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, WF_ERRAND, boardCardSeed } from '../helpers/seed.js';

/**
 * Neo follow-up F-1 (2026-10-02), case 23.321's DOM half — the card footer's controls are ONE group
 * (`.gn-board-card__controls`) inside `.gn-board-card__moves`, so the stylesheet can make them a single right-aligned,
 * non-wrapping row above 1024px (the CSS half: `packages/ui/test/neo-f1-card-footer.test.ts`). The notice and the
 * hidden refusal reason stay OUTSIDE it, so a refusal can still take its own line. jsdom has no layout: the painted
 * half is 23.322's frame.
 */
afterEach(cleanup);

function boardWith(stateId: string, card: BoardCard): BoardView {
  const cardsFor = (column: string) => (column === stateId ? [card] : []);
  return {
    projectId: 'prj_1',
    groups: [
      {
        workflowId: 'wf-errand',
        workflowVersion: 1,
        workflowName: 'Errand',
        columns: [
          { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: cardsFor('todo') },
          { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: cardsFor('doing') },
          { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: cardsFor('done') },
        ],
      },
    ],
  };
}

function moves(workflow: WorkflowDef = WF_ERRAND): BoardMoveCapability {
  return {
    dataSource: createFakeDataSource({ getWorkflowDef: async () => workflow }),
    workspaceId: WS,
    currentUserId: 'user_kiro',
    onMoved: vi.fn(),
  };
}

async function renderCard(stateId: string): Promise<{ moves: HTMLElement; controls: HTMLElement }> {
  render(<Board board={boardWith(stateId, boardCardSeed())} onOpenTicket={() => {}} moves={moves()} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
  const movesRow = document.querySelector('.gn-board-card__moves') as HTMLElement;
  return { moves: movesRow, controls: movesRow.querySelector('.gn-board-card__controls') as HTMLElement };
}

describe('23.321 the footer controls are one group, and the notice is not in it', () => {
  it('23.321 ‹, ›, Move to… and Close are the children of ONE group; the notice is a sibling of it', async () => {
    const { moves: row, controls } = await renderCard('done');
    expect(controls).not.toBeNull();
    expect([...controls.querySelectorAll('button')].map((button) => button.className)).toEqual([
      'gn-board-card__move',
      'gn-board-card__move',
      'gn-board-card__move gn-board-card__move-to',
      'gn-board-card__close',
    ]);
    // Every button of the row is in the group, and the notice (where a refusal renders) is NOT.
    expect(row.querySelectorAll('button')).toHaveLength(4);
    const notice = row.querySelector('.gn-board-card__notice') as HTMLElement;
    expect(notice.parentElement).toBe(row);
    expect(controls.contains(notice)).toBe(false);
    // CONTROL — the group is the moves row's child, not a second row of the footer.
    expect(controls.parentElement).toBe(row);
    expect(row.parentElement).toHaveClass('gn-board-card__footer');
  });

  it('23.321 a disabled arrow stays rendered inside the group (disabled, never absent)', async () => {
    const { controls } = await renderCard('todo');
    const previous = controls.querySelector('.gn-board-card__move') as HTMLButtonElement;
    expect(previous).toBeDisabled();
    expect(previous).toHaveAttribute('aria-label', expect.stringMatching(/^Previous/));
    // CONTROL — the next arrow of the same card is live, and a non-terminal card has no Close.
    expect(controls.querySelectorAll('.gn-board-card__move')[1]).toBeEnabled();
    expect(controls.querySelector('.gn-board-card__close')).toBeNull();
  });
});
