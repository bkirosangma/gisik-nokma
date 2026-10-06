import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEMANTIC_KEY, type ConceptSummary, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSourceQuery } from '../src/data-source.js';
import { HttpError } from '../src/online/http.js';
import { makeSubmittedFactory } from '../src/submit.js';
import type { TicketRead } from '../src/view-types.js';
import { ConceptsRow } from '../src/views/concepts-row.js';
import type { KnowledgeGraphSlotComponent } from '../src/views/editor-slot.js';
import { TicketSheet } from '../src/views/ticket-sheet.js';
import { PHONE_BOARD_QUERY } from '../src/views/use-phone-board.js';
import { createFakeDataSource, type IngestScript } from './helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from './helpers/seed.js';

/*
 * Knowledge Graph spec D §6 (KG-D Task 9): the Concepts row on a ticket's and a note's Details, cases 27.540–27.544
 * and 27.549 (`test-cases/27-knowledge-graph.md`). The note half of 27.543/27.544 is the web's
 * (`apps/web/test/concepts-row-note.test.tsx`). The data source is the app-core fake; `ingest` is scripted per case.
 */
const CP: ConceptSummary = { id: '01J9CONCEPTSCROLL000000000', name: 'Scroll position on phone sheets', summary: '', itemCount: 2, createdBy: 'u_ama', origin: 'web' };
const CW: ConceptSummary = { id: '01J9CONCEPTWORKFLOWS0000000', name: 'Workflows', summary: '', itemCount: 4, createdBy: 'u_ama', origin: 'mcp' };
const T = TICKET;
const T_AT = '2026-10-06T04:00:00.000Z';

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(SEMANTIC_KEY);
  Reflect.deleteProperty(window, 'matchMedia');
});

const committed = (event: SubmittedEvent): IngestResult => ({ status: 'committed', eventId: event.id, seq: 1, serverTime: T_AT });
const refused = (event: SubmittedEvent, rule: string, reason: string): IngestResult => ({ status: 'refused', eventId: event.id, rule, reason });
/** An ingest that answers only when the test says so, so "at once" (before the server answers) can be told from "after". */
function deferredIngest() {
  const pending: Array<{ events: SubmittedEvent[]; answer: (r: IngestResult[]) => void; fail: (e: unknown) => void }> = [];
  const script: IngestScript = (events) => new Promise<IngestResult[]>((answer, fail) => pending.push({ events, answer, fail }));
  return { script, pending };
}
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));

type RowProps = Parameters<typeof ConceptsRow>[0];
function mount(opts: { query?: Partial<DataSourceQuery>; ingest?: IngestScript; item?: RowProps['item']; extra?: Partial<RowProps> } = {}) {
  const getItemConcepts = vi.fn<DataSourceQuery['getItemConcepts']>(async () => [CP, CW]);
  const ds = createFakeDataSource({ getItemConcepts, ...opts.query }, opts.ingest);
  const onRefusal = vi.fn();
  const make = makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' });
  const props = (item: RowProps['item']): RowProps => ({ workspaceId: WS, item, dataSource: ds, make, onRefusal, ...opts.extra });
  const view = render(<ConceptsRow {...props(opts.item ?? { kind: 'ticket', id: T })} />);
  return { ds, getItemConcepts, onRefusal, user: userEvent.setup(), rerender: (item: RowProps['item']) => view.rerender(<ConceptsRow {...props(item)} />) };
}
const row = () => document.querySelector<HTMLElement>('.gn-concepts-row');
const pillNames = () => [...document.querySelectorAll('.gn-concept-pill')].map((li) => li.querySelector('.gn-concept-pill__name')?.textContent);
const removeButton = (name: string) => screen.getByRole('button', { name: `Remove from concept ${name}` });

describe('27.540 the Concepts row', () => {
  it('27.540 reads "Concepts" and one pill per concept, each with its own remove button named for it; the read is exactly (ws, the row\'s item)', async () => {
    const { getItemConcepts } = mount();
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    expect(within(row()!).getByRole('heading', { name: 'Concepts' })).toBeInTheDocument();
    const pills = [...document.querySelectorAll<HTMLElement>('.gn-concept-pill')];
    // each button is named for ITS pill's concept, and sits in that pill
    expect(within(pills[0]!).getByRole('button', { name: `Remove from concept ${CP.name}` })).toBeInTheDocument();
    expect(within(pills[1]!).getByRole('button', { name: `Remove from concept ${CW.name}` })).toBeInTheDocument();
    expect(getItemConcepts).toHaveBeenCalledTimes(1);
    expect(getItemConcepts).toHaveBeenCalledWith(WS, { kind: 'ticket', id: T });
  });

  it('27.540 CONTROL: an answer of [] renders nothing at all (no empty heading), and neither does a 404', async () => {
    const empty = vi.fn(async () => []);
    mount({ query: { getItemConcepts: empty } });
    await settle();
    expect(empty).toHaveBeenCalledTimes(1); // precondition: the read was made and answered
    expect(row()).toBeNull();
    expect(screen.queryByText('Concepts')).toBeNull();
    cleanup();
    const missing = vi.fn(async () => Promise.reject(new HttpError(404, `/v1/workspaces/${WS}/concepts`)));
    mount({ query: { getItemConcepts: missing } });
    await settle();
    expect(missing).toHaveBeenCalledTimes(1); // precondition: the read was made and refused
    expect(row()).toBeNull();
  });
});

describe('27.541 removing a pill, and Undo', () => {
  it('27.541 Remove ingests concept.item_untagged on CP for the row\'s item, the pill goes at once, then a toast whose Undo tags the same item back', async () => {
    const { script, pending } = deferredIngest();
    const { user } = mount({ ingest: script });
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    await user.click(removeButton(CP.name));
    expect(pending).toHaveLength(1);
    const [untag] = pending[0]!.events;
    expect(pending[0]!.events).toHaveLength(1);
    expect(untag).toMatchObject({ workspaceId: WS, entity: { kind: 'concept', id: CP.id }, type: 'concept.item_untagged', payload: { itemKind: 'ticket', itemId: T } });
    // at once: the server has not answered yet
    expect(pillNames()).toEqual([CW.name]);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    await act(async () => pending[0]!.answer([committed(untag!)]));
    expect(screen.getByText(`Removed from ${CP.name}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(pending).toHaveLength(2);
    const [tag] = pending[1]!.events;
    expect(tag).toMatchObject({ workspaceId: WS, entity: { kind: 'concept', id: CP.id }, type: 'concept.item_tagged', payload: { itemKind: 'ticket', itemId: T } });
    expect(pillNames()).toEqual([CW.name]); // back only on the commit
    await act(async () => pending[1]!.answer([committed(tag!)]));
    expect(pillNames()).toEqual([CP.name, CW.name]);
  });

  it('27.541 CONTROL: a refusal puts the pill back, reports the server\'s exact rule and reason, and shows no toast', async () => {
    const { script, pending } = deferredIngest();
    const { user, onRefusal } = mount({ ingest: script });
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    await user.click(removeButton(CP.name));
    expect(pillNames()).toEqual([CW.name]);
    const [untag] = pending[0]!.events;
    await act(async () => pending[0]!.answer([refused(untag!, 'concept.hidden_item', 'You cannot see every item in this concept.')]));
    expect(pillNames()).toEqual([CP.name, CW.name]);
    expect(onRefusal).toHaveBeenCalledTimes(1);
    expect(onRefusal).toHaveBeenCalledWith({ rule: 'concept.hidden_item', reason: 'You cannot see every item in this concept.' });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByText(`Removed from ${CP.name}`)).toBeNull();
  });

  it('27.541 an invalid answer is reported with its code and message, and the pill comes back', async () => {
    const { script, pending } = deferredIngest();
    const { user, onRefusal } = mount({ ingest: script });
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    await user.click(removeButton(CW.name));
    const [untag] = pending[0]!.events;
    await act(async () => pending[0]!.answer([{ status: 'invalid', eventId: untag!.id, code: 'invalid-payload', message: 'itemId must be a ULID.' }]));
    expect(pillNames()).toEqual([CP.name, CW.name]);
    expect(onRefusal).toHaveBeenCalledWith({ rule: 'invalid-payload', reason: 'itemId must be a ULID.' });
  });
});

describe('27.542 the semantic layer switch (D6)', () => {
  it('27.542 Off: no row, and getItemConcepts is never called', async () => {
    window.localStorage.setItem(SEMANTIC_KEY, 'off');
    const { getItemConcepts } = mount();
    await settle();
    expect(getItemConcepts).not.toHaveBeenCalled();
    expect(row()).toBeNull();
  });

  it('27.542 On, and unset (the default), render the row', async () => {
    window.localStorage.setItem(SEMANTIC_KEY, 'on');
    mount();
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    cleanup();
    window.localStorage.removeItem(SEMANTIC_KEY);
    mount();
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
  });

  it('27.542 a store that throws (Safari with site data blocked) means the default, On', async () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    try {
      expect(() => window.localStorage).toThrow(); // precondition: the store really throws
      mount();
      await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    } finally {
      Object.defineProperty(window, 'localStorage', real);
    }
  });

  it('27.542 a row loaded On and re-rendered after the switch turns Off renders nothing', async () => {
    window.localStorage.setItem(SEMANTIC_KEY, 'on');
    const { rerender } = mount();
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    window.localStorage.setItem(SEMANTIC_KEY, 'off');
    rerender({ kind: 'ticket', id: T });
    expect(row()).toBeNull();
  });
});

describe('27.549 the row\'s edges', () => {
  it('27.549 switching to another ticket drops the old pills at once, and a late answer for the old ticket is ignored', async () => {
    const answers = new Map<string, (c: ConceptSummary[]) => void>();
    const getItemConcepts = vi.fn((_ws: string, item: { kind: 'ticket' | 'note'; id: string }) => new Promise<ConceptSummary[]>((resolve) => answers.set(item.id, resolve)));
    const { rerender } = mount({ query: { getItemConcepts } });
    await act(async () => answers.get(T)!([CP]));
    expect(pillNames()).toEqual([CP.name]);
    rerender({ kind: 'ticket', id: 'T_OTHER' });
    expect(pillNames()).toEqual([]); // the old ticket's pill is not drawn on the new one
    expect(getItemConcepts).toHaveBeenLastCalledWith(WS, { kind: 'ticket', id: 'T_OTHER' });
    // the old ticket's read answers again, late: a stale answer must not land on the new ticket
    rerender({ kind: 'ticket', id: 'T_THIRD' });
    await act(async () => answers.get('T_OTHER')!([CW]));
    expect(pillNames()).toEqual([]);
    await act(async () => answers.get('T_THIRD')!([CW]));
    expect(pillNames()).toEqual([CW.name]);
  });

  it('27.549 a transport that throws, or answers nothing, puts the pill back and reports it', async () => {
    const { script, pending } = deferredIngest();
    const { user, onRefusal } = mount({ ingest: script });
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    await user.click(removeButton(CP.name));
    await act(async () => pending[0]!.fail(new TypeError('Failed to fetch')));
    expect(pillNames()).toEqual([CP.name, CW.name]);
    expect(onRefusal).toHaveBeenLastCalledWith({ rule: 'transport', reason: 'The server did not answer this change.' });
    await user.click(removeButton(CW.name));
    await act(async () => pending[1]!.answer([]));
    expect(pillNames()).toEqual([CP.name, CW.name]);
    expect(onRefusal).toHaveBeenCalledTimes(2);
  });

  it('27.549 a refused Undo is reported and the pill stays removed', async () => {
    const { script, pending } = deferredIngest();
    const { user, onRefusal } = mount({ ingest: script });
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    await user.click(removeButton(CP.name));
    await act(async () => pending[0]!.answer([committed(pending[0]!.events[0]!)]));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await act(async () => pending[1]!.answer([refused(pending[1]!.events[0]!, 'concept.narrows', 'Tagging it would hide the concept from 2 people.')]));
    expect(pillNames()).toEqual([CW.name]);
    expect(onRefusal).toHaveBeenCalledWith({ rule: 'concept.narrows', reason: 'Tagging it would hide the concept from 2 people.' });
  });

  it('27.549 a reader who may not write sees the pills with no remove button; CONTROL: the name opens the concept only when the host can', async () => {
    const onOpenConcept = vi.fn();
    mount({ extra: { readOnly: true, onOpenConcept } });
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    expect(screen.queryAllByRole('button', { name: /^Remove from concept/ })).toHaveLength(0);
    await userEvent.setup().click(screen.getByRole('button', { name: CW.name }));
    expect(onOpenConcept).toHaveBeenCalledWith(CW.id);
    cleanup();
    mount();
    await waitFor(() => expect(pillNames()).toEqual([CP.name, CW.name]));
    expect(screen.getAllByRole('button', { name: /^Remove from concept/ })).toHaveLength(2);
    // no host handler: the name is text, not a button that does nothing
    expect(screen.queryByRole('button', { name: CW.name })).toBeNull();
  });
});

/*
 * The ticket-sheet host. The harness is `ticket-sheet-phone-order.test.tsx`'s (`viewport`, `read`, `renderSheet`,
 * cases 23.125), with `getItemConcepts` stubbed and an optional Knowledge Graph slot.
 */
function viewport(phone: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_BOARD_QUERY ? phone : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
function read(): TicketRead {
  return {
    ticket: ticketStateSeed(),
    title: 'File the GST return',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: 'CCSO-1183',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  } as TicketRead;
}
async function renderSheet(concepts: ConceptSummary[], slot?: KnowledgeGraphSlotComponent) {
  const getItemConcepts = vi.fn(async () => concepts);
  const source = createFakeDataSource({
    getTicket: async () => read(),
    getWorkflowDef: async () => WF_ERRAND,
    getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
    getTicketHistory: async () => [],
    getTickets: async (projectId) => ({ projectId, rows: [] }),
    getTicketTypes: async () => [{ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] }],
    getItemConcepts,
  });
  render(
    <TicketSheet
      dataSource={source}
      workspaceId={WS}
      ticketId={TICKET}
      currentUserId="user_kiro"
      onClose={vi.fn()}
      editorSlot={() => <div />}
      {...(slot === undefined ? {} : { knowledgeGraphSlot: slot })}
    />,
  );
  await waitFor(() => expect(screen.getByTestId('ticket-notes')).toBeInTheDocument());
  await waitFor(() => expect(getItemConcepts).toHaveBeenCalled());
  await settle();
  return { getItemConcepts };
}

describe('27.543 the ticket sheet mounts the row directly above Notes', () => {
  it('27.543 the row is present and the Notes section follows it, next', async () => {
    viewport(false);
    const { getItemConcepts } = await renderSheet([CP]);
    const notes = screen.getByTestId('ticket-notes');
    expect(row()).not.toBeNull(); // precondition: both present
    expect(row()!.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(row()!.nextElementSibling).toBe(notes);
    expect(getItemConcepts).toHaveBeenCalledWith(WS, { kind: 'ticket', id: TICKET });
  });

  it('27.543 CONTROL: a ticket with no concepts shows no row, and Notes is still there', async () => {
    viewport(false);
    await renderSheet([]);
    expect(screen.getByTestId('ticket-notes')).toBeInTheDocument();
    expect(row()).toBeNull();
  });

  it('27.549 the sheet\'s concept name opens its Knowledge Graph tab (the concept is on the ticket\'s first ring)', async () => {
    viewport(false);
    const slot: KnowledgeGraphSlotComponent = () => <div data-testid="kg-slot" />;
    await renderSheet([CP], slot);
    expect(screen.queryByTestId('kg-slot')).toBeNull(); // precondition: Details is the open tab
    await userEvent.setup().click(within(row()!).getByRole('button', { name: CP.name }));
    expect(screen.getByTestId('kg-slot')).toBeInTheDocument();
  });
});

describe('27.544 the phone ticket sheet', () => {
  it('27.544 at phone width the row is a direct child of the column that holds the Notes section', async () => {
    viewport(true);
    await renderSheet([CP, CW]);
    const notes = screen.getByTestId('ticket-notes');
    expect(row()).not.toBeNull();
    expect(pillNames()).toEqual([CP.name, CW.name]);
    expect(row()!.parentElement).toBe(notes.parentElement);
  });
});
