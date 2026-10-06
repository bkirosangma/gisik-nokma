import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AttentionItem, AttentionKind } from '../../src/view-types.js';
import { AttentionStrip } from '../../src/views/attention-strip.js';

/**
 * UX fixes Task 9, case 23.163 (audit NP-05): "Needs your attention" shows at most five rows, each
 * ticket ONCE with its strongest reason, then "Show all N".
 */
const itemOf = (kind: AttentionKind, ticketId: string, title = `Ticket ${ticketId}`): AttentionItem => ({
  kind,
  workspaceId: 'w',
  ticketId,
  projectId: 'project-1',
  title,
  reason: `reason for ${kind}`,
  claim: null,
});
const titles = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.gn-attention__title')].map((node) => node.textContent ?? '');
const chipsOf = (row: HTMLElement): string[] => [...row.querySelectorAll('.gn-chip')].map((chip) => chip.textContent ?? '');

describe('23.163 My Work attention: five rows, one per ticket, strongest reason', () => {
  it('23.163 a ticket on several lists shows once with its strongest reason (overdue > blocked > stale > due-soon > contested); CONTROL: a ticket on one list keeps its only reason', () => {
    const { container } = render(
      <AttentionStrip
        items={[
          itemOf('contested', 'A', 'All five'),
          itemOf('due-soon', 'A', 'All five'),
          itemOf('stale', 'A', 'All five'),
          itemOf('blocked', 'A', 'All five'),
          itemOf('overdue', 'A', 'All five'),
          itemOf('stale', 'B', 'Stale and soon'),
          itemOf('due-soon', 'B', 'Stale and soon'),
          itemOf('due-soon', 'C', 'Soon and contested'),
          itemOf('contested', 'C', 'Soon and contested'),
          itemOf('blocked', 'D', 'Only blocked'),
          itemOf('stale', 'E', 'Stale and blocked'), // stale listed FIRST: input order cannot pass the blocked > stale pair
          itemOf('blocked', 'E', 'Stale and blocked'),
        ]}
        onOpenTicket={() => {}}
      />,
    );
    expect(titles(container)).toHaveLength(5); // 5 tickets (the cap), so nothing is hidden yet
    expect(screen.getAllByText('All five')).toHaveLength(1);
    expect(chipsOf(screen.getByText('All five').closest('li') as HTMLElement)).toEqual(['Overdue']);
    expect(chipsOf(screen.getByText('Stale and soon').closest('li') as HTMLElement)).toEqual(['Stale']);
    expect(chipsOf(screen.getByText('Soon and contested').closest('li') as HTMLElement)).toEqual(['Due soon']);
    expect(chipsOf(screen.getByText('Stale and blocked').closest('li') as HTMLElement)).toEqual(['Blocked']);
    // control: the one-reason ticket
    expect(chipsOf(screen.getByText('Only blocked').closest('li') as HTMLElement)).toEqual(['Blocked']);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull(); // nothing hidden, nothing to show
  });

  it('23.163 more than five tickets: five rows (the most severe) and "Show all N"; the button lists all N, still one row per ticket; CONTROL: exactly five shows no button', async () => {
    const user = userEvent.setup();
    const seven = Array.from({ length: 7 }, (_, index) => `T${index + 1}`);
    const items = [
      ...seven.map((id) => itemOf('due-soon', id)), // every ticket is due soon…
      ...seven.map((id) => itemOf('stale', id)), // …and stale: still one row each
      itemOf('overdue', 'T7'), // the last one is the most severe, so it must make the first five
    ];
    const { container, rerender } = render(<AttentionStrip items={items} onOpenTicket={() => {}} />);
    expect(titles(container)).toHaveLength(5);
    expect(titles(container)[0]).toBe('Ticket T7'); // severity decides who is shown
    const more = screen.getByRole('button', { name: 'Show all 7' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(titles(container)).toHaveLength(7);
    expect(new Set(titles(container)).size).toBe(7); // still de-duplicated
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(titles(container)).toHaveLength(5);

    // CONTROL: exactly five tickets → five rows, no disclosure
    rerender(<AttentionStrip items={items.filter((item) => ['T1', 'T2', 'T3', 'T4', 'T5'].includes(item.ticketId))} onOpenTicket={() => {}} />);
    expect(titles(container)).toHaveLength(5);
    expect(within(container).queryByRole('button', { name: /^Show all/ })).toBeNull();
  });
});
