import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConceptView, GraphItemView } from '@gisik-nokma/domain';
import type { DataSourceQuery } from '../src/data-source.js';
import { makeSubmittedFactory } from '../src/submit.js';
import type { TicketHistoryEvent } from '../src/view-types.js';
import { ConceptInspector } from '../src/views/concept-inspector.js';
import { createFakeDataSource } from './helpers/fake-data-source.js';

/*
 * Knowledge Graph spec D §6 (KG-D Task 9): a confirmed concept's History in the inspector, case 27.545
 * (`test-cases/27-knowledge-graph.md`). The harness is `concept-inspector.test.tsx`'s (27.521–27.538); the sentences
 * are `describeEvent`'s concept arms (`history-copy.ts`, KG-D Task 3), resolved against the loaded concept's items.
 */
const WS = 'ws_gn';
const CP = '01J9CONCEPTSCROLL000000000';
const AMA = 'u_ama';
const TP = '01J9TICKETSCROLLJUMPS00000';
const UNKNOWN = '01J9TICKETNOTINTHECONCEPT0'; // a real-looking ULID the concept does not hold (not a redaction)
const T_AT = '2026-10-05T04:00:00.000Z';

afterEach(() => cleanup());

const CONCEPT: ConceptView = {
  id: CP,
  workspaceId: WS,
  name: 'Scroll position on phone sheets',
  summary: '',
  itemCount: 1,
  createdBy: AMA,
  origin: 'web',
  createdAt: T_AT,
  fromSuggestion: null,
  items: [{ kind: 'ticket', id: TP, label: 'GN-12 Scroll jumps', taggedBy: AMA, taggedAt: T_AT, origin: 'mcp' }],
  links: [{ otherId: 'CW', otherName: 'Workflows', relation: 'related', direction: 'related' }],
};
const ITEM: GraphItemView = { ref: `concept:${CP}`, kind: 'concept', id: CP, workspaceId: WS, projectId: null, label: CONCEPT.name, title: null, category: null, hop: 1, out: false, suggested: false };

let seq = 0;
function event(type: string, payload: unknown, origin = 'web'): TicketHistoryEvent {
  seq += 1;
  return { id: `e${seq}`, type, version: 1, payload, actorId: AMA, origin, clientTime: T_AT, serverTime: T_AT, seq };
}
const TAG_BY_MCP = event('concept.item_tagged', { itemKind: 'ticket', itemId: TP }, 'mcp');
const REDACTED = event('concept.item_untagged', { itemKind: 'ticket', itemId: '' });
const UNHELD = event('concept.item_untagged', { itemKind: 'ticket', itemId: UNKNOWN });
const HELD = event('concept.item_untagged', { itemKind: 'ticket', itemId: TP });
// the held ticket's id under the other kind: an item is matched on kind AND id
const OTHER_KIND = event('concept.item_untagged', { itemKind: 'note', itemId: TP });
const LINKED = event('concept.linked', { otherId: 'CW', relation: 'related' });
const LINKED_GONE = event('concept.linked', { otherId: 'C_GONE', relation: 'related' }); // not among the concept's links

function mount(getConceptHistory: DataSourceQuery['getConceptHistory']) {
  const history = vi.fn(getConceptHistory);
  const ds = createFakeDataSource({ getConcept: async () => CONCEPT, getConceptHistory: history });
  render(
    <ConceptInspector
      item={ITEM}
      workspaceId={WS}
      dataSource={ds}
      make={makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' })}
      nameOf={(id) => (id === AMA ? 'Ama Rangsa' : id)}
      onChanged={vi.fn()}
      onRefusal={vi.fn()}
    />,
  );
  return { history, user: userEvent.setup() };
}
const entries = () =>
  [...document.querySelectorAll('.gn-kg-concept__history .gn-history__event')].map((li) => ({
    headline: li.querySelector('.gn-history__type')?.textContent,
    actor: li.querySelector('.gn-history__actor')?.textContent,
  }));

describe('27.545 a concept\'s History in the inspector', () => {
  it('27.545 reads nothing until opened; then an MCP tag is "Added <label>" by "Assistant, for <name>", and an untag names only an item the concept holds', async () => {
    const { history, user } = mount(async () => [TAG_BY_MCP, REDACTED, UNHELD, HELD]);
    const summary = await screen.findByText('History', { selector: 'summary' });
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(history).not.toHaveBeenCalled(); // precondition: zero reads before the disclosure is opened
    await user.click(summary);
    await waitFor(() => expect(entries()).toHaveLength(4));
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith(CP);
    expect(entries()).toEqual([
      { headline: 'Added GN-12 Scroll jumps', actor: 'Assistant, for Ama Rangsa' },
      // a redacted item (Task 4's history redaction) and an id the concept does not hold both read as "a ticket"
      { headline: 'Removed a ticket from the concept', actor: 'Ama Rangsa' },
      { headline: 'Removed a ticket from the concept', actor: 'Ama Rangsa' },
      // CONTROL: the same event naming an item the concept holds is named; a `web` event's actor is the bare name
      { headline: 'Removed GN-12 Scroll jumps from the concept', actor: 'Ama Rangsa' },
    ]);
  });

  it('27.545 a link names the other concept from the concept\'s links (its id when the link is gone), and an item is matched on kind as well as id', async () => {
    const { user } = mount(async () => [LINKED, LINKED_GONE, OTHER_KIND]);
    await user.click(await screen.findByText('History', { selector: 'summary' }));
    await waitFor(() => expect(entries()).toHaveLength(3));
    expect(entries().map((e) => e.headline)).toEqual([
      'Linked the related concept Workflows',
      'Linked the related concept C_GONE',
      'Removed a note from the concept',
    ]);
  });

  it('27.545 the wait is a skeleton named "Loading history" once; CONTROL: once read, nothing is busy', async () => {
    let answer: (events: TicketHistoryEvent[]) => void = () => {};
    const { user } = mount(() => new Promise((r) => (answer = r)));
    await user.click(await screen.findByText('History', { selector: 'summary' }));
    const details = document.querySelector<HTMLElement>('.gn-kg-concept__history')!;
    const label = within(details).getByText('Loading history');
    expect(label.closest('[aria-busy="true"]')).toHaveClass('gn-skeleton-region');
    await act(async () => answer([HELD]));
    expect(within(details).queryByText('Loading history')).toBeNull();
    expect(details.querySelector('[aria-busy="true"]')).toBeNull();
    expect(entries()).toHaveLength(1);
  });

  it('27.545 a failed read says so and Try again reads it again', async () => {
    let fail = true;
    const { history, user } = mount(async () => {
      if (fail) throw new Error('offline');
      return [HELD];
    });
    await user.click(await screen.findByText('History', { selector: 'summary' }));
    const details = document.querySelector<HTMLElement>('.gn-kg-concept__history')!;
    expect(await within(details).findByText('The history could not be loaded.')).toBeInTheDocument();
    fail = false;
    await user.click(within(details).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(entries()).toEqual([{ headline: 'Removed GN-12 Scroll jumps from the concept', actor: 'Ama Rangsa' }]));
    expect(history).toHaveBeenCalledTimes(2);
  });
});

describe('27.545 the History follows the selected concept', () => {
  it('27.545 selecting another concept closes the disclosure and shows nothing the first one read', async () => {
    const OTHER: ConceptView = { ...CONCEPT, id: 'C_OTHER', name: 'Workflows', items: [] };
    const history = vi.fn(async (id: string) => (id === CP ? [HELD] : []));
    const ds = createFakeDataSource({ getConcept: async (id) => (id === CP ? CONCEPT : OTHER), getConceptHistory: history });
    const props = { workspaceId: WS, dataSource: ds, make: makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' }), nameOf: (id: string) => id, onChanged: vi.fn(), onRefusal: vi.fn() };
    const view = render(<ConceptInspector item={ITEM} {...props} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('History', { selector: 'summary' }));
    await waitFor(() => expect(entries()).toHaveLength(1));
    view.rerender(<ConceptInspector item={{ ...ITEM, ref: 'concept:C_OTHER', id: 'C_OTHER', label: 'Workflows' }} {...props} />);
    await screen.findByRole('heading', { name: 'Workflows' });
    expect(entries()).toEqual([]);
    expect(document.querySelector<HTMLDetailsElement>('.gn-kg-concept__history')!.open).toBe(false);
  });
});
