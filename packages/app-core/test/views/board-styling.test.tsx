import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, WF_ERRAND, boardCardSeed } from '../helpers/seed.js';

/**
 * Styling refresh Plan A, Task 6 — cases 20.051–20.052 (§20.6). The owner's
 * rulings on the mockup: "if parent is present, separate with >", "the tick
 * button shouldnt be there", and every field the card shows today stays.
 */
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

describe('20.051 the keys row separates the parent from the key with ›', () => {
  it('20.051 parent badge, then an aria-hidden ›, then the key; CONTROL: no parent, and a parent that IS the epic, draw no ›', () => {
    const first = render(
      <Board
        board={boardWith('todo', boardCardSeed({ key: 'GN-15', parent: { ticketId: 'p_17', key: 'GN-17' } }))}
        onOpenTicket={() => {}}
      />,
    );
    const badge = screen.getByRole('button', { name: 'Open parent GN-17' });
    const sep = badge.nextElementSibling as HTMLElement;
    expect(sep).toHaveClass('gn-board-card__parent-sep');
    expect(sep).toHaveTextContent('›');
    expect(sep).toHaveAttribute('aria-hidden', 'true');
    expect(sep.nextElementSibling).toHaveTextContent('GN-15');
    expect(sep.nextElementSibling).toHaveClass('gn-board-card__key');
    // The accessible text is unchanged: the separator adds nothing to the badge's name.
    expect(badge).toHaveAccessibleName('Open parent GN-17');
    first.unmount();

    const noParent = render(<Board board={boardWith('todo', boardCardSeed({ key: 'GN-15' }))} onOpenTicket={() => {}} />);
    expect(document.querySelector('.gn-board-card__parent-sep')).toBeNull();
    noParent.unmount();

    // 13.1458 — the parent IS the epic, so the badge is suppressed and so is its separator.
    render(
      <Board
        board={boardWith(
          'todo',
          boardCardSeed({
            key: 'GN-15',
            parent: { ticketId: 'p_17', key: 'GN-17' },
            epic: { ticketId: 'p_17', key: 'GN-17', title: 'Filings' },
          }),
        )}
        onOpenTicket={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Open parent GN-17' })).toBeNull();
    expect(document.querySelector('.gn-board-card__parent-sep')).toBeNull();
  });
});

describe('20.052 a terminal card has no tick, and its footer holds who·when then the arrows', () => {
  async function buttonsOf(stateId: string): Promise<string[]> {
    render(<Board board={boardWith(stateId, boardCardSeed())} onOpenTicket={() => {}} moves={moves()} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
    const card = document.querySelector('.gn-board-card') as HTMLElement;
    return within(card)
      .getAllByRole('button')
      .map((button) => button.className);
  }

  it('20.052 title, provenance, previous, next, Move to…, Close — in that order, nothing else', async () => {
    expect(await buttonsOf('done')).toEqual([
      'gn-board-card__title',
      'gn-board-card__provenance',
      'gn-board-card__move',
      'gn-board-card__move',
      'gn-board-card__move gn-board-card__move-to', // amended 2026-10-01 by 21.060: the footer gains Move to…
      'gn-board-card__close',
    ]);
    const footer = document.querySelector('.gn-board-card__footer') as HTMLElement;
    expect(footer.firstElementChild).toHaveClass('gn-board-card__provenance');
    expect(footer.querySelector('.gn-board-card__moves')).not.toBeNull();
    expect(document.querySelector('.gn-board-card')?.textContent).not.toMatch(/[✓✔]/);
  });

  it('20.052 CONTROL — a non-terminal card has no Close', async () => {
    expect(await buttonsOf('doing')).toEqual([
      'gn-board-card__title',
      'gn-board-card__provenance',
      'gn-board-card__move',
      'gn-board-card__move',
      'gn-board-card__move gn-board-card__move-to', // amended 2026-10-01 by 21.060
    ]);
  });
});
