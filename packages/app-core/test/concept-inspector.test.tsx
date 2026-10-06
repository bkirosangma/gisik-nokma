import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConceptAudienceResponse, ConceptView, GraphItemView, IngestResult, SubmittedEvent, SuggestionView } from '@gisik-nokma/domain';
import type { DataSourceQuery } from '../src/data-source.js';
import { HttpError } from '../src/online/http.js';
import { makeSubmittedFactory, type MakeSubmitted } from '../src/submit.js';
import { ConceptInspector } from '../src/views/concept-inspector.js';
import { createFakeDataSource, type IngestScript } from './helpers/fake-data-source.js';

/*
 * Knowledge Graph spec D §6 and §4.2 (KG-D Task 8): the concept inspector, cases 27.521–27.526 and 27.536–27.538
 * (`test-cases/27-knowledge-graph.md`). The data source is the app-core fake; `ingest` is scripted per case, and the
 * fake records every batch it was handed (`ingested`).
 */
const WS = 'ws_gn';
const CP = '01J9CONCEPTSCROLL000000000';
const AMA = 'u_ama';
const T_AT = '2026-10-05T04:00:00.000Z';

function concept(over: Partial<ConceptView> = {}): ConceptView {
  return {
    id: CP,
    workspaceId: WS,
    name: 'Scroll position on phone sheets',
    summary: 'Why sheets on phone jump back to the top.',
    itemCount: 2,
    createdBy: AMA,
    origin: 'web',
    createdAt: T_AT,
    fromSuggestion: null,
    items: [
      { kind: 'ticket', id: 'TP', label: 'CCRE-1 Renew the trade licence', taggedBy: AMA, taggedAt: T_AT, origin: 'web' },
      { kind: 'note', id: 'NN', label: 'Field notes', taggedBy: AMA, taggedAt: T_AT, origin: 'web' },
    ],
    links: [
      { otherId: 'C0', otherName: 'Mobile web', relation: 'broader', direction: 'broader' },
      { otherId: 'CW', otherName: 'Workflows', relation: 'related', direction: 'related' },
    ],
    ...over,
  };
}
const SUG: SuggestionView = {
  id: 'sug_drag',
  label: 'drag · column · board',
  terms: ['drag', 'column', 'board'],
  score: 0.82,
  computedAt: T_AT,
  // the door's shapes (`suggestion-events.ts`): a 64-hex signature and 3–12 32-hex item hashes, none the suggestion's id
  signature: '7f3a'.repeat(16),
  itemHashes: ['a1'.repeat(16), 'b2'.repeat(16), 'c3'.repeat(16)],
  items: [
    { kind: 'ticket', id: 'T160', label: 'GN-160 Drag a card between columns' },
    { kind: 'note', id: 'N4', label: 'Board notes' },
    { kind: 'ticket', id: 'T157', label: 'GN-157 Columns reflow on drop' },
  ],
};
const OTHER_SUG: SuggestionView = { ...SUG, id: 'sug_other', label: 'other', terms: ['other'], signature: '0e'.repeat(32) };

const confirmedItem = (over: Partial<GraphItemView> = {}): GraphItemView => ({
  ref: `concept:${CP}`, kind: 'concept', id: CP, workspaceId: WS, projectId: null, label: 'Scroll position on phone sheets', title: null, category: null, hop: 1, out: false, suggested: false, ...over,
});
const suggestedItem = (over: Partial<GraphItemView> = {}): GraphItemView =>
  confirmedItem({ ref: `concept:${SUG.id}`, id: SUG.id, label: SUG.label, suggested: true, ...over });

const committed = (event: SubmittedEvent, seq = 1): IngestResult => ({ status: 'committed', eventId: event.id, seq, serverTime: T_AT });
const refused = (event: SubmittedEvent, rule: string, reason: string): IngestResult => ({ status: 'refused', eventId: event.id, rule, reason });
/** An ingest that answers only when the test says so, so "at once" (before the server answers) can be told from "after". */
function deferredIngest() {
  const pending: Array<{ events: SubmittedEvent[]; answer: (r: IngestResult[]) => void }> = [];
  const script: IngestScript = (events) => new Promise<IngestResult[]>((answer) => pending.push({ events, answer }));
  return { script, pending };
}

function mount(opts: { item?: GraphItemView; query?: Partial<DataSourceQuery>; ingest?: IngestScript; readOnly?: boolean; make?: MakeSubmitted } = {}) {
  const ds = createFakeDataSource(
    {
      getConcept: async () => concept(),
      getSuggestions: async () => [OTHER_SUG, SUG],
      getConceptAudience: async (): Promise<ConceptAudienceResponse> => ({ conceptId: null, members: 9, before: 9, after: 9 }),
      ...opts.query,
    },
    opts.ingest,
  );
  const onChanged = vi.fn();
  const onRefusal = vi.fn();
  const make = opts.make ?? makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' });
  const nameOf = (id: string) => (id === AMA ? 'Ama Rangsa' : id);
  render(
    <ConceptInspector
      item={opts.item ?? confirmedItem()}
      workspaceId={WS}
      dataSource={ds}
      make={make}
      nameOf={nameOf}
      onChanged={onChanged}
      onRefusal={onRefusal}
      readOnly={opts.readOnly}
    />,
  );
  return { ds, onChanged, onRefusal, user: userEvent.setup() };
}
const panel = () => document.querySelector('.gn-kg-concept-inspector') as HTMLElement;
const itemRows = () => [...document.querySelectorAll('.gn-kg-concept__items > li')].map((li) => li.querySelector('.gn-kg-concept__label')?.textContent);
const linkRows = () => [...document.querySelectorAll('.gn-kg-concept-links > li')].map((li) => li.querySelector('.gn-kg-concept__label')?.textContent);
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));

describe('27.521–27.523 a confirmed concept', () => {
  it('27.521 renders its name, summary, "Created by" through attributionLabel, one row per item, the links and Rename / Delete; control: no items says "No items yet"', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' })).toBeInTheDocument();
    expect(screen.getByText('Why sheets on phone jump back to the top.')).toBeInTheDocument();
    expect(screen.getByText('Created by Ama Rangsa')).toBeInTheDocument();
    // exactly two rows, each with its own label and its own Remove
    expect(itemRows()).toEqual(['CCRE-1 Renew the trade licence', 'Field notes']);
    expect(screen.getAllByRole('button', { name: 'Remove from concept' })).toHaveLength(2);
    expect(linkRows()).toEqual(['Broader: Mobile web', 'Related: Workflows']);
    expect(within(document.querySelector('.gn-kg-concept-links') as HTMLElement).getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByText('No items yet')).toBeNull();
  });

  it('27.521 an MCP concept reads "Created by Assistant, for Ama Rangsa"; a narrower link reads "Narrower: …"; control: no items says "No items yet"', async () => {
    mount({ query: { getConcept: async () => concept({ origin: 'mcp', items: [], links: [{ otherId: 'CN', otherName: 'Sheets', relation: 'broader', direction: 'narrower' }] }) } });
    expect(await screen.findByText('Created by Assistant, for Ama Rangsa')).toBeInTheDocument();
    expect(linkRows()).toEqual(['Narrower: Sheets']);
    expect(screen.getByText('No items yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from concept' })).toBeNull();
  });

  it('27.521 an item\'s button SHOWS "Remove" (the label keeps its room in a 300 px column) and is NAMED "Remove from concept", its item as the description; control: a link\'s button is named just "Remove"', async () => {
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
    const [first] = screen.getAllByRole('button', { name: 'Remove from concept' });
    expect(first).toHaveAccessibleDescription('CCRE-1 Renew the trade licence');
    const shown = [...first!.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('gn-visually-hidden'))).map((n) => n.textContent).join('');
    expect(shown).toBe('Remove');
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });

  it('27.521 untagging an item or removing a link is a quiet ghost button, as the ticket sheet\'s link Remove is; only Delete, which ends the concept, is in danger red (23.022)', async () => {
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
    const removes = [...screen.getAllByRole('button', { name: 'Remove from concept' }), ...screen.getAllByRole('button', { name: 'Remove' })];
    expect(removes).toHaveLength(4);
    for (const b of removes) {
      expect(b).toHaveClass('gn-button--ghost');
      expect(b).not.toHaveClass('gn-button--danger-quiet');
    }
    // control: the concept's own Delete keeps the in-list danger variant
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('gn-button--danger-quiet');
  });

  it('27.522 "Remove from concept" ingests ONE concept.item_untagged and the row goes at once; a refusal puts it back, reports exactly that refusal and does not call onChanged', async () => {
    const d = deferredIngest();
    const { ds, onChanged, onRefusal, user } = mount({ ingest: d.script });
    await screen.findByText('CCRE-1 Renew the trade licence');
    await user.click(screen.getAllByRole('button', { name: 'Remove from concept' })[0]!);
    expect(ds.ingested).toHaveLength(1);
    expect(ds.ingested[0]).toHaveLength(1);
    expect(ds.ingested[0]![0]).toMatchObject({ workspaceId: WS, entity: { kind: 'concept', id: CP }, type: 'concept.item_untagged', payload: { itemKind: 'ticket', itemId: 'TP' } });
    // optimistic: gone while the server has not answered
    expect(d.pending).toHaveLength(1);
    expect(itemRows()).toEqual(['Field notes']);
    await act(async () => d.pending[0]!.answer([refused(d.pending[0]!.events[0]!, 'concept.not-tagged', 'That item is not in this concept.')]));
    expect(itemRows()).toEqual(['CCRE-1 Renew the trade licence', 'Field notes']);
    expect(onRefusal).toHaveBeenCalledTimes(1);
    expect(onRefusal).toHaveBeenCalledWith({ rule: 'concept.not-tagged', reason: 'That item is not in this concept.' });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('27.522 control: a committed untag calls onChanged once and the row stays gone', async () => {
    const d = deferredIngest();
    const { onChanged, onRefusal, user } = mount({ ingest: d.script });
    await screen.findByText('CCRE-1 Renew the trade licence');
    await user.click(screen.getAllByRole('button', { name: 'Remove from concept' })[1]!);
    await act(async () => d.pending[0]!.answer([committed(d.pending[0]!.events[0]!)]));
    await settle();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onRefusal).not.toHaveBeenCalled();
    expect(itemRows()).toEqual(['CCRE-1 Renew the trade licence']);
  });

  it('27.523 Rename saves the TYPED name and Save is disabled while blank', async () => {
    const { ds, user } = mount();
    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'Concept name' });
    expect(field).toHaveValue('Scroll position on phone sheets');
    await user.clear(field);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(field, '   ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'Scroll on phones');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(ds.ingested).toHaveLength(1);
    expect(ds.ingested[0]![0]).toMatchObject({ entity: { kind: 'concept', id: CP }, type: 'concept.renamed', payload: { name: 'Scroll on phones' } });
  });

  it('27.523 Delete asks first: Cancel ingests nothing, Delete ingests concept.deleted {} and says it was deleted', async () => {
    const { ds, user, onChanged } = mount();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete concept' });
    expect(dialog).toHaveTextContent('Delete the concept Scroll position on phone sheets? Its items stay; only the grouping goes.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(ds.ingested).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Delete concept' })).getByRole('button', { name: 'Delete' }));
    expect(ds.ingested).toHaveLength(1);
    expect(ds.ingested[0]).toHaveLength(1);
    expect(ds.ingested[0]![0]).toMatchObject({ entity: { kind: 'concept', id: CP }, type: 'concept.deleted', payload: {} });
    expect(await screen.findByText('Concept deleted. Its items are unchanged.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("27.523 a link's Remove ingests concept.unlinked with that link's own otherId and relation (the SECOND link)", async () => {
    const { ds, user } = mount();
    await screen.findByText('Related: Workflows');
    const links = document.querySelector('.gn-kg-concept-links') as HTMLElement;
    await user.click(within(links).getAllByRole('button', { name: 'Remove' })[1]!);
    expect(ds.ingested).toHaveLength(1);
    expect(ds.ingested[0]![0]).toMatchObject({ entity: { kind: 'concept', id: CP }, type: 'concept.unlinked', payload: { otherId: 'CW', relation: 'related' } });
  });
});

describe('27.524–27.526 a suggestion', () => {
  it('27.524 renders "Suggested", the label with the terms under it, the items, and no Rename / Delete / Remove', async () => {
    mount({ item: suggestedItem() });
    const heading = await screen.findByRole('heading', { level: 3, name: 'drag · column · board' });
    expect(within(panel()).getByText('Suggested')).toBeInTheDocument();
    expect(heading.nextElementSibling?.textContent).toBe('drag, column, board');
    expect(itemRows()).toEqual(['GN-160 Drag a card between columns', 'Board notes', 'GN-157 Columns reflow on drop']);
    for (const name of ['Rename', 'Delete', 'Remove', 'Remove from concept']) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('27.524 Confirm (name prefilled with the label, disabled while blank) ingests ONE batch on one fresh concept id that is not the suggestion\'s', async () => {
    const { ds, user, onChanged, onRefusal } = mount({ item: suggestedItem() });
    const field = await screen.findByRole('textbox', { name: 'Name' });
    expect(field).toHaveValue('drag · column · board');
    await user.clear(field);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await user.type(field, 'Board drag');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(ds.ingested).toHaveLength(1);
    const batch = ds.ingested[0]!;
    expect(batch).toHaveLength(1 + SUG.items.length);
    expect(batch.map((e) => [e.type, e.payload])).toEqual([
      ['concept.created', { name: 'Board drag', fromSuggestion: SUG.id }],
      ['concept.item_tagged', { itemKind: 'ticket', itemId: 'T160' }],
      ['concept.item_tagged', { itemKind: 'note', itemId: 'N4' }],
      ['concept.item_tagged', { itemKind: 'ticket', itemId: 'T157' }],
    ]);
    const ids = new Set(batch.map((e) => e.entity.id));
    expect(ids.size).toBe(1);
    expect(batch.every((e) => e.entity.kind === 'concept' && e.workspaceId === WS)).toBe(true);
    expect(ids.has(SUG.id)).toBe(false);
    await settle();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onRefusal).not.toHaveBeenCalled();
  });

  it('27.524 a batch is not atomic: committed, committed, refused calls onChanged once (the concept exists) AND reports the refusal', async () => {
    const script: IngestScript = (events) => [committed(events[0]!, 1), committed(events[1]!, 2), refused(events[2]!, 'concept.item-unknown', 'That item no longer exists.'), committed(events[3]!, 3)];
    const { user, onChanged, onRefusal } = mount({ item: suggestedItem(), ingest: script });
    await screen.findByRole('textbox', { name: 'Name' });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await settle();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onRefusal).toHaveBeenCalledTimes(1);
    expect(onRefusal).toHaveBeenCalledWith({ rule: 'concept.item-unknown', reason: 'That item no longer exists.' });
  });

  it('27.525 Reject ingests workspace.concept_suggestion_rejected on the workspace with a payload of EXACTLY the signature and hashes', async () => {
    const { ds, user } = mount({ item: suggestedItem() });
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(ds.ingested).toHaveLength(1);
    expect(ds.ingested[0]).toHaveLength(1);
    const event = ds.ingested[0]![0]!;
    expect(event.type).toBe('workspace.concept_suggestion_rejected');
    expect(event.entity).toEqual({ kind: 'workspace', id: WS });
    expect(event.workspaceId).toBe(WS);
    expect(event.payload).toEqual({ signature: '7f3a'.repeat(16), itemHashes: ['a1'.repeat(16), 'b2'.repeat(16), 'c3'.repeat(16)] });
  });

  it('27.526 before Confirm it asks the audience for a concept that does not exist yet and says who will see less, above the Confirm button', async () => {
    const audience = vi.fn(async (): Promise<ConceptAudienceResponse> => ({ conceptId: null, members: 9, before: 6, after: 3 }));
    mount({ item: suggestedItem(), query: { getConceptAudience: audience } });
    const sentence = await screen.findByText('Fewer people will see this concept: 3 of 9 members');
    expect(audience).toHaveBeenCalledTimes(1);
    expect(audience).toHaveBeenCalledWith(WS, null, SUG.items);
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(sentence.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('27.526 control: when nobody loses sight of it (after === before) no sentence is shown', async () => {
    const audience = vi.fn(async (): Promise<ConceptAudienceResponse> => ({ conceptId: null, members: 9, before: 6, after: 6 }));
    mount({ item: suggestedItem(), query: { getConceptAudience: audience } });
    await screen.findByRole('button', { name: 'Confirm' });
    await waitFor(() => expect(audience).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByText(/Fewer people will see this concept/)).toBeNull();
  });
});

describe('27.536–27.538 failures, a fresh read after a change, and a reader who may not write', () => {
  it('27.536 a concept the server refuses (its 404: deleted, or holding an item this reader cannot see) shows one line and nothing of the concept; control: another error offers Try again', async () => {
    mount({ query: { getConcept: async () => Promise.reject(new HttpError(404, `/v1/concepts/${CP}`)) } });
    expect(await screen.findByText('This concept is no longer available to you.')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    // control: a transport failure is not "unavailable", and can be retried
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      return concept();
    };
    cleanup();
    const { user } = mount({ query: { getConcept: flaky } });
    expect(await screen.findByText('This concept could not be loaded.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' })).toBeInTheDocument();
  });

  it('27.536 a suggestion that is no longer offered says so (never the wait for ever); a refused suggestions read says so; a refused audience read shows no sentence and Confirm still works', async () => {
    mount({ item: suggestedItem(), query: { getSuggestions: async () => [OTHER_SUG] } });
    expect(await screen.findByText('This suggestion is no longer offered.')).toBeInTheDocument();
    expect(screen.queryByText('Loading suggestion')).toBeNull();
    cleanup();
    mount({ item: suggestedItem(), query: { getSuggestions: async () => Promise.reject(new HttpError(404, `/v1/workspaces/${WS}/suggestions`)) } });
    expect(await screen.findByText('Suggestions could not be loaded.')).toBeInTheDocument();
    cleanup();
    const { ds, user } = mount({ item: suggestedItem(), query: { getConceptAudience: async () => Promise.reject(new HttpError(404, 'audience')) } });
    await settle();
    expect(screen.queryByText(/Fewer people/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(ds.ingested).toHaveLength(1);
  });

  it('27.537 a committed rename reads the concept again, so the heading shows the new name', async () => {
    let name = 'Scroll position on phone sheets';
    const { user, ds } = mount({ query: { getConcept: async () => concept({ name }) } });
    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'Concept name' });
    await user.clear(field);
    await user.type(field, 'Scroll on phones');
    name = 'Scroll on phones'; // what the server answers once the rename has committed
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(ds.ingested).toHaveLength(1);
    expect(await screen.findByRole('heading', { level: 3, name: 'Scroll on phones' })).toBeInTheDocument();
  });

  it('27.538 a reader who may not write (a guest) sees the concept and the suggestion with no write control; control: a member sees them', async () => {
    mount({ readOnly: true });
    await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
    expect(itemRows()).toEqual(['CCRE-1 Renew the trade licence', 'Field notes']);
    expect(linkRows()).toEqual(['Broader: Mobile web', 'Related: Workflows']);
    for (const name of ['Rename', 'Delete', 'Remove', 'Remove from concept']) expect(screen.queryByRole('button', { name })).toBeNull();
    cleanup();
    mount({ item: suggestedItem(), readOnly: true });
    await screen.findByRole('heading', { level: 3, name: 'drag · column · board' });
    expect(itemRows()).toEqual(['GN-160 Drag a card between columns', 'Board notes', 'GN-157 Columns reflow on drop']);
    for (const name of ['Confirm', 'Reject']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    // control
    cleanup();
    mount({ item: suggestedItem(), readOnly: false });
    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });
});

describe('27.522, 27.524, 27.536 the guards: no answer is not a change, one Confirm, and only the latest read answers', () => {
  it('27.522 an ingest that throws (the server never answered) puts the row back and reports the transport refusal, and is not a change; control: both rows before the click', async () => {
    const { user, onChanged, onRefusal } = mount({
      ingest: async () => {
        throw new Error('network down');
      },
    });
    await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
    expect(itemRows()).toEqual(['CCRE-1 Renew the trade licence', 'Field notes']);
    await user.click(screen.getAllByRole('button', { name: 'Remove from concept' })[0]!);
    await waitFor(() => expect(onRefusal).toHaveBeenCalledWith({ rule: 'transport', reason: 'The server did not answer this change.' }));
    expect(itemRows()).toEqual(['CCRE-1 Renew the trade licence', 'Field notes']);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('27.524 once Confirm has committed it stays disabled, so a second click makes no second concept; control: a batch where nothing committed enables it again', async () => {
    const { user, ds } = mount({ item: suggestedItem(), ingest: async (events) => events.map((e, i) => committed(e, i + 1)) });
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    await user.click(confirm);
    await waitFor(() => expect(ds.ingested).toHaveLength(1));
    await settle();
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    await settle();
    expect(ds.ingested).toHaveLength(1);
    // control: nothing committed, so the person may try again
    cleanup();
    const again = mount({ item: suggestedItem(), ingest: async (events) => events.map((e) => refused(e, 'concept-visibility', 'No.')) });
    const button = await screen.findByRole('button', { name: 'Confirm' });
    await again.user.click(button);
    await waitFor(() => expect(again.ds.ingested).toHaveLength(1));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('27.536 re-pointed at another concept, the inspector shows the wait until THAT concept\'s read answers, never the previous concept; a read that answers after a newer one is ignored', async () => {
    const reads = new Map<string, (v: ConceptView) => void>();
    const ds = createFakeDataSource({ getConcept: (id: string) => new Promise<ConceptView>((answer) => reads.set(id, answer)) });
    const props = { workspaceId: WS, dataSource: ds, make: makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' }), nameOf: (id: string) => id, onChanged: vi.fn(), onRefusal: vi.fn() };
    const at = (id: string, name: string) => confirmedItem({ ref: `concept:${id}`, id, label: name });
    const OTHER = '01J9CONCEPTOTHER0000000000';
    const THIRD = '01J9CONCEPTTHIRD0000000000';
    const { rerender } = render(<ConceptInspector item={confirmedItem()} {...props} />);
    act(() => reads.get(CP)!(concept()));
    // control: the first concept is shown once its read answers
    await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
    rerender(<ConceptInspector item={at(OTHER, 'Board performance')} {...props} />);
    expect(screen.queryByRole('heading', { name: 'Scroll position on phone sheets' })).toBeNull();
    expect(screen.getByText('Loading concept')).toBeInTheDocument();
    // OTHER's read is still out when the inspector moves on to THIRD, and it answers last
    rerender(<ConceptInspector item={at(THIRD, 'Release notes')} {...props} />);
    act(() => reads.get(THIRD)!(concept({ id: THIRD, name: 'Release notes' })));
    await screen.findByRole('heading', { level: 3, name: 'Release notes' });
    act(() => reads.get(OTHER)!(concept({ id: OTHER, name: 'Board performance' })));
    await settle();
    expect(screen.getByRole('heading', { level: 3, name: 'Release notes' })).toBeInTheDocument();
    expect(screen.queryByText('Loading concept')).toBeNull();
  });

  it('27.536 the wait for a concept or a suggestion is a skeleton region, busy and named once, with no loading sentence (spec S7, 25.121); control: once read, nothing is busy', async () => {
    let answer: (v: ConceptView) => void = () => undefined;
    mount({ query: { getConcept: () => new Promise<ConceptView>((r) => (answer = r)) } });
    const label = screen.getByText('Loading concept');
    expect(label).toHaveClass('gn-visually-hidden');
    expect(label.closest('[aria-busy="true"]')).toHaveClass('gn-skeleton-region');
    expect(document.body.textContent).not.toContain('…');
    act(() => answer(concept()));
    await screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    cleanup();
    mount({ item: suggestedItem(), query: { getSuggestions: () => new Promise<SuggestionView[]>(() => undefined) } });
    expect(screen.getByText('Loading suggestion').closest('[aria-busy="true"]')).toHaveClass('gn-skeleton-region');
    expect(document.body.textContent).not.toContain('…');
  });
});

/** The real factory, recording each event's type and payload BEFORE it builds (the factory refuses a blank name by throwing). */
function recordingMake() {
  const real = makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' });
  const built: Array<[string, unknown]> = [];
  const make: MakeSubmitted = (e) => {
    built.push([e.type, e.payload]);
    return real(e);
  };
  return { make, built };
}

describe('27.522–27.538 the clauses one path never reaches (the P11 census)', () => {
  const heading = () => screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
  const baseProps = () => ({ workspaceId: WS, make: makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' }), nameOf: (id: string) => id, onChanged: vi.fn(), onRefusal: vi.fn() });

  it('27.522 an INVALID answer (the server could not read the event) is reported by its code and message, and the row comes back', async () => {
    const { onRefusal, user } = mount({ ingest: (events) => [{ status: 'invalid', eventId: events[0]!.id, code: 'duplicate-event-id', message: 'That event was already written.' }] });
    await heading();
    await user.click(screen.getAllByRole('button', { name: 'Remove from concept' })[0]!);
    await waitFor(() => expect(onRefusal).toHaveBeenCalledWith({ rule: 'duplicate-event-id', reason: 'That event was already written.' }));
    expect(onRefusal).toHaveBeenCalledTimes(1);
    expect(itemRows()).toEqual(['CCRE-1 Renew the trade licence', 'Field notes']);
  });

  it('27.522 every event goes to the CONCEPT\'s own workspace, the one the server\'s view names, whatever the host passed', async () => {
    const { ds, user } = mount({ query: { getConcept: async () => concept({ workspaceId: 'ws_other' }) }, ingest: (events) => events.map((e) => committed(e)) });
    await heading();
    await user.click(screen.getAllByRole('button', { name: 'Remove from concept' })[0]!);
    await waitFor(() => expect(ds.ingested).toHaveLength(1));
    expect(ds.ingested[0]!.map((e) => e.workspaceId)).toEqual(['ws_other']);
  });

  it('27.523 a blank name submitted from the keyboard builds and writes nothing and keeps the form; control: a typed name submitted the same way is written', async () => {
    const { make, built } = recordingMake();
    const { ds, user } = mount({ ingest: (events) => events.map((e) => committed(e)), make });
    await heading();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Concept name' });
    await user.clear(input);
    await user.type(input, '   ');
    fireEvent.submit(input.closest('form')!);
    await settle();
    expect(built).toEqual([]);
    expect(ds.ingested).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Concept name' })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'Phone sheets');
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(ds.ingested).toHaveLength(1));
  });

  it('27.523 while renaming, Rename and Delete give way to Save and Cancel; control: Cancel brings them back', async () => {
    const { user } = mount();
    await heading();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('27.538 the Delete question goes when the panel turns read-only (a member made a guest meanwhile); control: it stays while still a member', async () => {
    const props = { ...baseProps(), item: confirmedItem(), dataSource: createFakeDataSource({ getConcept: async () => concept() }) };
    const { rerender } = render(<ConceptInspector {...props} />);
    await heading();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete concept' })).toBeInTheDocument();
    rerender(<ConceptInspector {...props} readOnly={false} />);
    expect(screen.getByRole('alertdialog', { name: 'Delete concept' })).toBeInTheDocument();
    rerender(<ConceptInspector {...props} readOnly />);
    expect(screen.queryByRole('alertdialog', { name: 'Delete concept' })).toBeNull();
  });

  it('27.524 the Confirm form submitted from the keyboard builds and writes nothing while the name is blank, and nothing again once a Confirm committed; control: a named submit writes one batch', async () => {
    const { make, built } = recordingMake();
    const { ds, user } = mount({ item: suggestedItem(), ingest: (events) => events.map((e) => committed(e)), make });
    const input = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(input);
    fireEvent.submit(input.closest('form')!);
    await settle();
    expect(built).toEqual([]);
    expect(ds.ingested).toEqual([]);
    await user.type(input, 'Board drag');
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(ds.ingested).toHaveLength(1));
    fireEvent.submit(input.closest('form')!);
    await settle();
    expect(ds.ingested).toHaveLength(1);
  });

  it('27.536 a read that fails with no reason at all (undefined, then null) says it could not be loaded, never the wait for ever', async () => {
    for (const reason of [undefined, null]) {
      mount({ query: { getConcept: () => Promise.reject(reason) } });
      expect(await screen.findByText('This concept could not be loaded.'), String(reason)).toBeInTheDocument();
      cleanup();
    }
  });

  it('27.536 a read that FAILS after a newer one answered is ignored too: the newer concept stays, with no failure line', async () => {
    const reads = new Map<string, { answer: (v: ConceptView) => void; fail: (e: unknown) => void }>();
    const ds = createFakeDataSource({ getConcept: (id: string) => new Promise<ConceptView>((answer, fail) => reads.set(id, { answer, fail })) });
    const props = { ...baseProps(), dataSource: ds };
    const OTHER = '01J9CONCEPTOTHER0000000000';
    const THIRD = '01J9CONCEPTTHIRD0000000000';
    const at = (id: string, name: string) => confirmedItem({ ref: `concept:${id}`, id, label: name });
    const { rerender } = render(<ConceptInspector item={at(OTHER, 'Board performance')} {...props} />);
    rerender(<ConceptInspector item={at(THIRD, 'Release notes')} {...props} />);
    act(() => reads.get(THIRD)!.answer(concept({ id: THIRD, name: 'Release notes' })));
    await screen.findByRole('heading', { level: 3, name: 'Release notes' });
    act(() => reads.get(OTHER)!.fail(new Error('the older read failed late')));
    await settle();
    expect(screen.getByRole('heading', { level: 3, name: 'Release notes' })).toBeInTheDocument();
    expect(screen.queryByText('This concept could not be loaded.')).toBeNull();
  });
});

describe('27.523, 27.536 focus follows the rename form and the Delete question, Esc stays in the panel, and an answer is shown only for the item it was read for', () => {
  const heading = () => screen.findByRole('heading', { level: 3, name: 'Scroll position on phone sheets' });
  const baseProps = () => ({ workspaceId: WS, make: makeSubmittedFactory({ actorId: 'u_kiro', origin: 'web' }), nameOf: (id: string) => id, onChanged: vi.fn(), onRefusal: vi.fn() });
  const OTHER = '01J9CONCEPTOTHER0000000000';
  const B = () => suggestedItem({ ref: `concept:${OTHER_SUG.id}`, id: OTHER_SUG.id, label: OTHER_SUG.label });

  it('27.523 keyboard focus follows Rename: into the "Concept name" field with its text selected, from the keyboard or a click; back on Rename after Cancel and after a committed Save; the Delete question\'s Cancel puts it back on Delete; control: the first draw takes no focus, and the question focuses its own Cancel', async () => {
    const { user, ds } = mount({ ingest: (events) => events.map((e) => committed(e)) });
    await heading();
    // control: neither the first draw nor the read landing takes focus (the view's keys stay with the page)
    expect(document.activeElement).toBe(document.body);
    // control: the Delete question focuses its Cancel; that Cancel puts focus back on Delete
    const del = screen.getByRole('button', { name: 'Delete' });
    await user.click(del);
    const ask = screen.getByRole('alertdialog', { name: 'Delete concept' });
    expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Cancel' }));
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(del);
    // Rename from the keyboard: the field takes focus with its text selected, so typing replaces the name
    screen.getByRole('button', { name: 'Rename' }).focus();
    await user.keyboard('{Enter}');
    const field = screen.getByRole('textbox', { name: 'Concept name' }) as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Scroll position on phone sheets'.length]);
    // Cancel puts it back on Rename
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename' })));
    // a click opens it the same way, and a committed Save (Enter in the field) puts focus back on Rename
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Concept name' }));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(ds.ingested).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename' })));
    expect(screen.queryByRole('textbox', { name: 'Concept name' })).toBeNull();
  });

  it('27.523 Esc in the rename form or in the Delete question cancels it, focus going back to Rename or Delete, and goes no further: it is consumed (a Sheet around the view keeps its own Escape) and reaches no handler outside the panel (the view\'s Back); control: Esc on Rename with nothing open is left to the page', async () => {
    const escapes = vi.fn();
    const ds = createFakeDataSource({ getConcept: async () => concept() });
    render(
      <div onKeyDown={(e) => (e.key === 'Escape' ? escapes() : undefined)}>
        <ConceptInspector item={confirmedItem()} {...baseProps()} dataSource={ds} />
      </div>,
    );
    await heading();
    const user = userEvent.setup();
    // control: with nothing open, Esc is not the panel's (fireEvent answers false when a handler prevented it)
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Rename' }), { key: 'Escape' })).toBe(true);
    expect(escapes).toHaveBeenCalledTimes(1);
    // the rename form: Esc abandons the typed name
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Concept name' }), ' typed');
    expect(fireEvent.keyDown(screen.getByRole('textbox', { name: 'Concept name' }), { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Concept name' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Scroll position on phone sheets' })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename' })));
    // the Delete question
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const cancel = within(screen.getByRole('alertdialog', { name: 'Delete concept' })).getByRole('button', { name: 'Cancel' });
    expect(fireEvent.keyDown(cancel, { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));
    // neither Esc left the panel, and nothing was written
    expect(escapes).toHaveBeenCalledTimes(1);
    expect(ds.ingested).toEqual([]);
  });

  it('27.536 a failed read is shown only for the concept it was read for: re-pointed after it, the inspector shows the wait until THAT concept answers, then that concept; control: the failure is shown for its own concept', async () => {
    const failures: Array<[unknown, string]> = [
      [new Error('network down'), 'This concept could not be loaded.'],
      [new HttpError(404, `/v1/concepts/${CP}`), 'This concept is no longer available to you.'],
    ];
    for (const [why, line] of failures) {
      const reads = new Map<string, { answer: (v: ConceptView) => void; fail: (e: unknown) => void }>();
      const ds = createFakeDataSource({ getConcept: (id: string) => new Promise<ConceptView>((answer, fail) => reads.set(id, { answer, fail })) });
      const props = { ...baseProps(), dataSource: ds };
      const { rerender } = render(<ConceptInspector item={confirmedItem()} {...props} />);
      act(() => reads.get(CP)!.fail(why));
      expect(await screen.findByText(line), line).toBeInTheDocument(); // control
      rerender(<ConceptInspector item={confirmedItem({ ref: `concept:${OTHER}`, id: OTHER, label: 'Board performance' })} {...props} />);
      await settle();
      expect(screen.queryByText(line), line).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' }), line).toBeNull();
      expect(screen.getByText('Loading concept'), line).toBeInTheDocument();
      act(() => reads.get(OTHER)!.answer(concept({ id: OTHER, name: 'Board performance' })));
      expect(await screen.findByRole('heading', { level: 3, name: 'Board performance' }), line).toBeInTheDocument();
      cleanup();
    }
  });

  it('27.536 a suggestion inspector re-pointed from A to B shows B even when A\'s list answers after B\'s; control: A alone, answered, shows A', async () => {
    const lists: Array<(v: SuggestionView[]) => void> = [];
    const ds = createFakeDataSource({
      getSuggestions: () => new Promise<SuggestionView[]>((answer) => lists.push(answer)),
      getConceptAudience: async (): Promise<ConceptAudienceResponse> => ({ conceptId: null, members: 9, before: 9, after: 9 }),
    });
    const props = { ...baseProps(), dataSource: ds };
    // control: A alone shows A
    const alone = render(<ConceptInspector item={suggestedItem()} {...props} />);
    act(() => lists[0]!([OTHER_SUG, SUG]));
    expect(await screen.findByRole('heading', { level: 3, name: SUG.label })).toBeInTheDocument();
    alone.unmount();
    lists.length = 0;
    const { rerender } = render(<ConceptInspector item={suggestedItem()} {...props} />);
    rerender(<ConceptInspector item={B()} {...props} />); // A's list is still out
    act(() => lists[1]!([OTHER_SUG, SUG])); // B's answers first
    expect(await screen.findByRole('heading', { level: 3, name: OTHER_SUG.label })).toBeInTheDocument();
    act(() => lists[0]!([OTHER_SUG, SUG])); // A's answers last
    await settle();
    expect(screen.getByRole('heading', { level: 3, name: OTHER_SUG.label })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: SUG.label })).toBeNull();
  });

  it('27.536 the narrowing preview answers only for the suggestion on screen: re-pointed from A to B, A\'s late preview neither writes its sentence under B nor, failing, clears B\'s; control: A alone shows its own sentence', async () => {
    const previews: Array<{ answer: (v: ConceptAudienceResponse) => void; fail: (e: unknown) => void }> = [];
    const ds = createFakeDataSource({
      getSuggestions: async () => [OTHER_SUG, SUG],
      getConceptAudience: () => new Promise<ConceptAudienceResponse>((answer, fail) => previews.push({ answer, fail })),
    });
    const props = { ...baseProps(), dataSource: ds };
    const seeing = (after: number): ConceptAudienceResponse => ({ conceptId: null, members: 9, before: 9, after });
    const fewer = (n: number) => `Fewer people will see this concept: ${String(n)} of 9 members`;
    // control: A alone shows its own sentence
    const alone = render(<ConceptInspector item={suggestedItem()} {...props} />);
    await waitFor(() => expect(previews).toHaveLength(1));
    act(() => previews[0]!.answer(seeing(3)));
    expect(await screen.findByText(fewer(3))).toBeInTheDocument();
    alone.unmount();
    // A's preview answers after B's, which narrows nothing: no sentence under B
    previews.length = 0;
    const one = render(<ConceptInspector item={suggestedItem()} {...props} />);
    await waitFor(() => expect(previews).toHaveLength(1)); // A on screen, its preview out
    one.rerender(<ConceptInspector item={B()} {...props} />);
    await waitFor(() => expect(previews).toHaveLength(2));
    await screen.findByRole('heading', { level: 3, name: OTHER_SUG.label });
    act(() => previews[1]!.answer(seeing(9)));
    act(() => previews[0]!.answer(seeing(3))); // A's, late
    await settle();
    expect(screen.queryByText(/Fewer people will see this concept/)).toBeNull();
    one.unmount();
    // A's preview FAILS after B's narrowed: B's sentence stays
    previews.length = 0;
    const two = render(<ConceptInspector item={suggestedItem()} {...props} />);
    await waitFor(() => expect(previews).toHaveLength(1));
    two.rerender(<ConceptInspector item={B()} {...props} />);
    await waitFor(() => expect(previews).toHaveLength(2));
    act(() => previews[1]!.answer(seeing(5)));
    expect(await screen.findByText(fewer(5))).toBeInTheDocument();
    act(() => previews[0]!.fail(new Error('the older preview failed late')));
    await settle();
    expect(screen.getByText(fewer(5))).toBeInTheDocument();
  });
});
