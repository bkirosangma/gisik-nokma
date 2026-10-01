import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttentionItem, AttentionKind } from '../../src/view-types.js';
import { AttentionStrip } from '../../src/views/attention-strip.js';

/**
 * NP-06 (audit 2026-10-01): "Due soon · Needed by 2026-08-17 — due within 7 days" over a date long
 * past. The server now says `overdue` (`apps/server/test/routes/attention-due.test.ts`, 21.242–21.243);
 * this is how the strip draws it.
 */

const itemOf = (kind: AttentionKind, ticketId: string, reason: string, title = `Ticket ${ticketId}`): AttentionItem => ({
  kind,
  ticketId,
  projectId: 'project-1',
  title,
  reason,
  claim: null,
});

const OVERDUE = 'was due 17 Aug (45 days ago)';
const SOON = 'due 5 Oct (in 4 days)';

/** The rows, as the person reads them: chip word + reason. */
const rows = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.gn-attention__item')].map((li) => li.textContent ?? '');

describe('21.242 overdue is its own label and leads the strip', () => {
  it('21.242 an overdue item reads "Overdue" + "was due 17 Aug (45 days ago)" in the danger tone and is sorted FIRST; CONTROL: a due-soon item still reads "Due soon" + "due 5 Oct (in 4 days)" and keeps its place after it', () => {
    const { container } = render(
      <AttentionStrip
        items={[
          itemOf('due-soon', 'T1', SOON),
          itemOf('blocked', 'T2', 'In "Waiting" — a blocked state.'),
          itemOf('overdue', 'T3', OVERDUE),
        ]}
        onOpenTicket={() => {}}
      />,
    );
    const lines = rows(container);
    expect(lines).toHaveLength(3);
    // first: the overdue row — the WORD carries it, not the colour
    expect(lines[0]).toContain('Overdue');
    expect(lines[0]).toContain(OVERDUE);
    expect(lines[0]).not.toContain('Due soon');
    expect(container.querySelector('.gn-attention__item')?.querySelector('.gn-chip')?.className).toContain('gn-chip--blocked');
    // the others keep their relative order after it
    expect(lines[1]).toContain('Due soon');
    expect(lines[1]).toContain(SOON);
    expect(lines[1]).not.toContain('Overdue');
    expect(lines[2]).toContain('Blocked');
    expect(screen.queryByText(/due within 7 days/)).toBeNull();
  });
});

describe('21.244 a ticket that is overdue and stale is ONE row, the overdue one', () => {
  it('21.244 the same ticket as stale and overdue appears once with the Overdue reason; CONTROLS: a stale-only ticket still shows, and a ticket that is overdue and BLOCKED keeps both rows (only the stale pair collapses)', () => {
    const { container } = render(
      <AttentionStrip
        items={[
          itemOf('stale', 'T1', 'In an active state since 2026-08-01 — past the 7-day staleness threshold.', 'Late and stale'),
          itemOf('overdue', 'T1', OVERDUE, 'Late and stale'),
          itemOf('stale', 'T2', 'In an active state since 2026-08-02 — past the 7-day staleness threshold.', 'Only stale'),
          itemOf('blocked', 'T3', 'In "Waiting" — a blocked state.', 'Late and blocked'),
          itemOf('overdue', 'T3', OVERDUE, 'Late and blocked'),
        ]}
        onOpenTicket={() => {}}
      />,
    );
    expect(screen.getAllByText('Late and stale')).toHaveLength(1);
    const lateAndStale = screen.getByText('Late and stale').closest('li');
    expect(lateAndStale).not.toBeNull();
    expect(within(lateAndStale as HTMLElement).getByText('Overdue')).toBeTruthy();
    expect(lateAndStale?.textContent).not.toContain('Stale');
    // control: not dropped wholesale
    expect(screen.getAllByText('Only stale')).toHaveLength(1);
    expect(screen.getAllByText('Late and blocked')).toHaveLength(2);
    expect(rows(container)).toHaveLength(4);
    // and the overdue rows lead
    expect(rows(container)[0]).toContain('Overdue');
    expect(rows(container)[1]).toContain('Overdue');
  });
});
