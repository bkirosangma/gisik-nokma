import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MCP_ASSISTANT_LABEL } from '@gisik-nokma/domain';
import { attributionLabel } from '../src/provenance.js';
import type { TicketHistoryEvent } from '../src/view-types.js';
import { HistoryList } from '../src/views/history-list.js';

/**
 * 27.519 (KG-D Task 7, spec D §5.2, D2): History names an MCP write "Assistant, for Ama Rangsa". The ledger records
 * `origin: 'mcp'` and the session's user, never which assistant, so the assistant is one label,
 * `MCP_ASSISTANT_LABEL` (domain). `'mobile'` and `'server'` legs as well as `'web'`: a `'web'` control alone cannot
 * tell `origin === 'mcp'` from `origin !== 'web'` (`ORIGINS`, `packages/domain/src/envelope.ts`).
 */
const MCP_EVENT: TicketHistoryEvent = {
  id: '01J9ZQ8Y6N4V2K7M3H5T1R0W8F',
  type: 'ticket.transitioned',
  version: 1,
  payload: { to: 'done' },
  actorId: 'user_ama',
  origin: 'mcp',
  clientTime: '2026-10-05T09:00:00.000Z',
  serverTime: '2026-10-05T09:00:00.100Z',
  seq: 1,
};

/** The text of the one actor span `HistoryList` renders for `event`. */
function actorOf(event: TicketHistoryEvent, nameOf: (userId: string) => string): string | null | undefined {
  const { container, unmount } = render(<HistoryList events={[event]} nameOf={nameOf} />);
  const text = container.querySelector('.gn-history__actor')?.textContent;
  unmount();
  return text;
}

describe('27.519 History names an MCP write "Assistant, for <name>"', () => {
  it('27.519 attributionLabel prefixes the assistant for origin mcp only, and HistoryList renders it over the actorLabel floor', () => {
    expect(MCP_ASSISTANT_LABEL).toBe('Assistant');
    expect(attributionLabel('Ama Rangsa', 'mcp')).toBe('Assistant, for Ama Rangsa');
    expect(attributionLabel('Ama Rangsa', 'mobile')).toBe('Ama Rangsa');
    expect(attributionLabel('Ama Rangsa', 'server')).toBe('Ama Rangsa');
    expect(attributionLabel('Ama Rangsa', 'web')).toBe('Ama Rangsa');

    expect(actorOf(MCP_EVENT, () => 'Ama Rangsa')).toBe('Assistant, for Ama Rangsa');
    expect(actorOf({ ...MCP_EVENT, origin: 'web' }, () => 'Ama Rangsa')).toBe('Ama Rangsa'); // control
    // The inner `actorLabel` floor still applies: a roster that names nobody, or answers with the id itself.
    expect(actorOf(MCP_EVENT, () => '')).toBe('Assistant, for Unknown person');
    expect(actorOf(MCP_EVENT, (id) => id)).toBe('Assistant, for Unknown person');
  });
});
