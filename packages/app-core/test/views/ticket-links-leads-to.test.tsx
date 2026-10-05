import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '../../src/submit.js';
import { createFakeDataSource, type FakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { TICKET, WS } from '../helpers/seed.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';
import { TicketLinksSection, type TicketLinksSectionProps } from '../../src/views/ticket-links-section.js';
import { useLiveQuery } from '../../src/views/use-live-query.js';
import type { TicketLinkView } from '../../src/view-types.js';

/**
 * Cases 29.128-29.133 (workflow-timeline-graphs Part 2 T3): "Leads to" / "Comes after" in the ticket sheet's Links
 * section, the branch label, relabel and its compensation. The sheet-level leg of 29.130 (the sheet passes
 * `isDecision` from the ticket's type) is in `ticket-sheet.test.tsx`. Helpers as `ticket-links-section.test.tsx`'s.
 */

const OTHER = '01J9GTKB000000000000000000';
const SIBLING = '01J9GTKC000000000000000000';
const row = (kind: TicketLinkView['kind'], direction: 'out' | 'in', key: string, label?: string, id = OTHER): TicketLinkView => ({
  kind,
  direction,
  ...(label === undefined ? {} : { label }),
  ticket: { id, projectId: 'p', key, title: `Title ${key}`, stateCategory: 'open' },
});

/** Mirrors `TicketSheet`'s own lift: the section reads the `links` query the sheet owns. A published Task's sheet by default. */
function Harness(props: Omit<TicketLinksSectionProps, 'links' | 'isDraft' | 'isDecision'> & { isDraft?: boolean; isDecision?: boolean }) {
  const links = useLiveQuery(props.dataSource, props.workspaceId, `${props.ticketId}:links`, () =>
    props.dataSource.query.getTicketLinks(props.workspaceId, props.ticketId),
  );
  return <TicketLinksSection isDraft={false} isDecision={false} {...props} links={links} />;
}

const make = makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });
const COMMIT: IngestScript = (events) =>
  events.map((e) => ({ status: 'committed', eventId: e.id, seq: 1, serverTime: '2026-10-03T10:00:00.000Z' }));
const CHILLER = async () => [{ ticketId: OTHER, projectId: 'p', key: 'GN-133', title: 'Chiller' }];
const REQUIRED = 'Name the branch: a link from a Decision needs a label, such as "Yes" or "No".';

/** `board-phone.test.tsx`'s matchMedia stub, reduced to the phone query. */
function viewport(options: { phone: boolean }): void {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_BOARD_QUERY ? options.phone : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  viewport({ phone: false });
});

/** An ingest the test releases by hand, so a second click lands while the first is still IN FLIGHT. */
function deferredIngest(onCommit: (events: Parameters<IngestScript>[0]) => void) {
  const releases: Array<() => void> = [];
  const script: IngestScript = (events) =>
    new Promise((resolve) => {
      releases.push(() => {
        onCommit(events);
        resolve(COMMIT(events) as IngestResult[]);
      });
    });
  return {
    script,
    releaseAll: async () => {
      await act(async () => {
        for (const r of releases.splice(0)) r();
      });
    },
  };
}

/** Every filed event, flat: `[type, stream, payload]`. */
const triples = (source: FakeDataSource): Array<[string, string, unknown]> =>
  source.ingested.flat().map((e) => [e.type, e.entity.id, e.payload]);
/** The same, one array per `ingest` call: a relabel is ONE call holding two events. */
const calls = (source: FakeDataSource): Array<Array<[string, string, unknown]>> =>
  source.ingested.map((batch) => batch.map((e) => [e.type, e.entity.id, e.payload] as [string, string, unknown]));

async function openPicker(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Add link' }));
}
async function chooseKind(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: /Link type/ }));
  await user.click(await screen.findByRole('option', { name: label }));
}
async function findTicket(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Find a ticket'), 'Ch');
  await user.click(await screen.findByRole('button', { name: 'GN-133 Chiller' }));
}
/** The text of the paragraph the Link label input names in `aria-describedby`. */
function hint(): string | null {
  const id = screen.getByLabelText('Link label').getAttribute('aria-describedby');
  return id === null ? null : (document.getElementById(id)?.textContent ?? null);
}

/**
 * Opens "Edit label" on one row, sets "New label" (`null`: leave the form's value as it opened), and presses Save once.
 * The ingest commits everything.
 */
async function relabelTo(rows: TicketLinkView[], isDecision: boolean, button: string, next: string | null): Promise<FakeDataSource> {
  const source = createFakeDataSource({ getTicketLinks: async () => rows }, COMMIT);
  const user = userEvent.setup();
  render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit isDecision={isDecision} make={make} />);
  await user.click(await screen.findByRole('button', { name: button }));
  const input = screen.getByLabelText('New label');
  if (next !== null) {
    await user.clear(input);
    if (next !== '') await user.type(input, next);
  }
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => {});
  return source;
}

describe('Links section: leads-to links (wtg2 T3)', () => {
  it('29.128 "Leads to" files on THIS stream with the label trimmed, its busy row in "Leads to" with the chip and no Edit label; control: "Comes after" with no label files on the OTHER stream with no label member', async () => {
    const ingest = deferredIngest(() => {});
    const source = createFakeDataSource({ getTicketLinks: async () => [] }, ingest.script);
    const user = userEvent.setup();
    const { container } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    await chooseKind(user, 'Leads to');
    await user.type(screen.getByLabelText('Link label'), '  Yes ');
    await findTicket(user);
    expect(triples(source)).toEqual([['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Yes' }]]);
    const busy = container.querySelector<HTMLElement>('[aria-busy="true"]')!;
    expect(screen.getByRole('region', { name: 'Leads to' }).contains(busy)).toBe(true);
    expect(busy.querySelector('.gn-ticket-sheet__link-label')?.textContent).toBe('Yes');
    expect(within(busy).queryByRole('button', { name: /^Edit label/ })).toBeNull(); // a busy row cannot be relabelled
    await ingest.releaseAll();
    expect(await screen.findByText('Linked: leads to GN-133 (Yes)')).toBeInTheDocument();

    await openPicker(user); // control: "Comes after", nothing typed
    await chooseKind(user, 'Comes after');
    expect(screen.getByLabelText('Link label')).toHaveValue(''); // the first add took its label with it
    await findTicket(user);
    const second = source.ingested.flat()[1]!;
    expect([second.type, second.entity.id, second.payload]).toEqual(['ticket.link_added', OTHER, { kind: 'leads_to', targetId: TICKET }]);
    expect('label' in (second.payload as object)).toBe(false);
    await ingest.releaseAll();
    expect(await screen.findByText('Linked: comes after GN-133')).toBeInTheDocument();
  });

  it('29.128 a label typed under "Leads to" is not sent once the kind is "Blocks", and a whitespace-only label sends no label member; control: the Link label input shows for the leads-to kinds only', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [] }, COMMIT);
    const user = userEvent.setup();
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    expect(screen.queryByLabelText('Link label')).toBeNull(); // "Blocks", the default: no label input
    await chooseKind(user, 'Leads to');
    await user.type(screen.getByLabelText('Link label'), 'Yes');
    await chooseKind(user, 'Blocks');
    expect(screen.queryByLabelText('Link label')).toBeNull();
    await findTicket(user);
    expect(triples(source)).toEqual([['ticket.link_added', TICKET, { kind: 'blocks', targetId: OTHER }]]);

    await openPicker(user);
    await chooseKind(user, 'Leads to');
    await user.clear(screen.getByLabelText('Link label'));
    await user.type(screen.getByLabelText('Link label'), '   ');
    await findTicket(user);
    const payload = source.ingested.flat()[1]!.payload as object;
    expect(payload).toEqual({ kind: 'leads_to', targetId: OTHER });
    expect('label' in payload).toBe(false);
  });

  it("29.128 on a draft's sheet \"Comes after\" files the from-form, label included, on the DRAFT's stream and nothing on the published ticket's (owner ruling O1); control: \"Leads to\" from the draft files its plain payload there", async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [] }, COMMIT);
    const user = userEvent.setup();
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit isDraft make={make} queryTickets={CHILLER} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    await chooseKind(user, 'Comes after');
    await user.type(screen.getByLabelText('Link label'), 'Yes');
    await findTicket(user);
    expect(triples(source)).toEqual([['ticket.link_added', TICKET, { kind: 'leads_to', targetId: TICKET, from: OTHER, label: 'Yes' }]]);
    await screen.findByText('Linked: comes after GN-133 (Yes)');

    await openPicker(user);
    await chooseKind(user, 'Leads to');
    await user.type(screen.getByLabelText('Link label'), 'No');
    await findTicket(user);
    expect(triples(source)[1]).toEqual(['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'No' }]);
    expect(source.ingested.flat().some((e) => e.entity.id === OTHER)).toBe(false); // nothing reaches the published ticket's stream
  });

  it('29.129 leads-to rows group under "Leads to" and "Comes after" after the other kinds, the label is a chip, Remove and its toast name it, and Undo re-adds the link WITH its label and takes the toast down; control: a label-free row has no chip and keeps its name', async () => {
    const stored = [row('blocks', 'out', 'GN-9', undefined, 'id_GN-9'), row('leads_to', 'out', 'GN-147', 'Yes'), row('leads_to', 'in', 'GN-133', undefined, SIBLING)];
    const source = createFakeDataSource({ getTicketLinks: async () => stored }, COMMIT);
    const user = userEvent.setup();
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    await screen.findByText('Title GN-147');
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Blocks', 'Leads to', 'Comes after']);
    const leads = screen.getByRole('region', { name: 'Leads to' });
    const comes = screen.getByRole('region', { name: 'Comes after' });
    expect(within(leads).getByText('Title GN-147')).toBeInTheDocument();
    expect(within(comes).getByText('Title GN-133')).toBeInTheDocument();
    const chip = leads.querySelector('.gn-ticket-sheet__link-label');
    expect(chip?.textContent).toBe('Yes');
    expect(chip).toHaveClass('gn-chip'); // the house badge, so each style draws it its own way
    expect(comes.querySelector('.gn-ticket-sheet__link-label')).toBeNull(); // control: no label, no chip
    expect(within(comes).getByRole('button', { name: 'Remove: comes after GN-133' })).toBeInTheDocument();

    await user.click(within(leads).getByRole('button', { name: 'Remove: leads to GN-147 (Yes)' }));
    expect(triples(source)).toEqual([['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: OTHER }]]); // a removal names no label
    await screen.findByText('Removed link: leads to GN-147 (Yes)');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(triples(source)[1]).toEqual(['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Yes' }]);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()); // the committed Undo took its toast down
  });

  it('29.130 on a Decision the "Leads to" result stays disabled while the label is empty or only spaces, the hint says why, nothing is sent; typing "Yes" enables it and files ONE add with the label', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [] }, COMMIT);
    const user = userEvent.setup();
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit isDecision make={make} queryTickets={CHILLER} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    await chooseKind(user, 'Leads to');
    const input = screen.getByLabelText('Link label');
    expect(input).toHaveAttribute('maxlength', '60');
    expect(input).toHaveAttribute('placeholder', 'For example Yes or No');
    expect(hint()).toBe('Required: name this branch, for example Yes or No.');
    await user.type(screen.getByLabelText('Find a ticket'), 'Ch');
    const result = await screen.findByRole('button', { name: 'GN-133 Chiller' });
    expect(result).toBeDisabled();
    await user.click(result);
    expect(source.ingested).toEqual([]);
    await user.type(input, '   ');
    expect(result).toBeDisabled(); // only spaces name nothing
    await user.clear(input);
    await user.type(input, 'Yes');
    expect(result).toBeEnabled();
    await user.click(result);
    expect(triples(source)).toEqual([['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Yes' }]]);
  });

  it('29.130 control: on a Task "Leads to" is enabled with no label ("Optional."); on a Decision "Comes after" is enabled (its own hint) and an engine label-required refusal shows beside Add link', async () => {
    const task = createFakeDataSource({ getTicketLinks: async () => [] }, COMMIT);
    const user = userEvent.setup();
    const first = render(<Harness dataSource={task} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await openPicker(user);
    await chooseKind(user, 'Leads to');
    expect(hint()).toBe('Optional.');
    await findTicket(user);
    expect(triples(task)).toEqual([['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER }]]);
    first.unmount();

    const refusing = createFakeDataSource({ getTicketLinks: async () => [] }, (events) =>
      events.map((e) => ({ status: 'refused', eventId: e.id, rule: 'link.label-required', reason: REQUIRED })) as IngestResult[],
    );
    render(<Harness dataSource={refusing} workspaceId={WS} ticketId={TICKET} canEdit isDecision make={make} queryTickets={CHILLER} />);
    await openPicker(user);
    await chooseKind(user, 'Comes after');
    expect(hint()).toBe('Optional. Required when the other ticket is a Decision.');
    await findTicket(user);
    expect(triples(refusing)).toEqual([['ticket.link_added', OTHER, { kind: 'leads_to', targetId: TICKET }]]);
    expect((await screen.findByRole('alert')).textContent).toBe(REQUIRED);
  });

  it('29.131 Edit label shows on a leads-to row the viewer can edit; control: never on a blocks row, and not with canEdit false', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [row('blocks', 'out', 'GN-9', undefined, 'id_GN-9'), row('leads_to', 'out', 'GN-147', 'Yes')] });
    const { rerender } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit={false} make={make} />);
    await screen.findByText('Title GN-147');
    expect(screen.queryByRole('button', { name: /^Edit label/ })).toBeNull();
    rerender(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    expect(screen.getByRole('button', { name: 'Edit label: leads to GN-147' })).toHaveTextContent('Edit label');
    expect(screen.getAllByRole('button', { name: /^Edit label/ })).toHaveLength(1); // not on the blocks row
  });

  it('29.131 relabel is ONE remove+add call, in that order, once per double click, toasted, and its Undo restores the old label the same way and takes the toast down; control: an unchanged Save files nothing, closes the form and gives focus back', async () => {
    let stored = [row('leads_to', 'out', 'GN-147', 'Yes')];
    const ingest = deferredIngest((events) => {
      const added = events.find((e) => e.type === 'ticket.link_added');
      stored = [row('leads_to', 'out', 'GN-147', (added?.payload as { label?: string } | undefined)?.label)];
    });
    const source = createFakeDataSource({ getTicketLinks: async () => stored }, ingest.script);
    const user = userEvent.setup();
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    const edit = await screen.findByRole('button', { name: 'Edit label: leads to GN-147' });
    await user.click(edit);
    const opened = screen.getByLabelText('New label');
    expect(opened).toHaveValue('Yes');
    expect(opened).toHaveAttribute('maxlength', '60');
    expect(document.activeElement).toBe(opened); // the form takes focus
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' })); // control: unchanged
    expect(source.ingested).toHaveLength(0);
    expect(screen.queryByLabelText('New label')).toBeNull(); // the form closes on an unchanged Save
    expect(document.activeElement).toBe(edit); // and hands focus back to its button

    await user.click(edit);
    const input = screen.getByLabelText('New label');
    await user.clear(input);
    await user.type(input, ' Maybe ');
    await user.dblClick(screen.getByRole('button', { name: 'Save' })); // both clicks land while the first call is held
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument(); // precondition: still in flight, the form is mounted
    expect(calls(source)).toEqual([
      [
        ['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: OTHER }],
        ['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Maybe' }],
      ],
    ]);
    await ingest.releaseAll();
    expect(await screen.findByText('Relabelled: leads to GN-147 (Maybe)')).toBeInTheDocument();
    expect(screen.queryByLabelText('New label')).toBeNull();
    await waitFor(() => expect(document.querySelector('.gn-ticket-sheet__link-label')?.textContent).toBe('Maybe')); // the reload

    await user.dblClick(screen.getByRole('button', { name: 'Undo' }));
    expect(calls(source).slice(1)).toEqual([
      [
        ['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: OTHER }],
        ['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Yes' }],
      ],
    ]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument(); // control: the toast is up while the Undo is in flight
    await ingest.releaseAll();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
    expect(screen.queryByText(/^Relabelled/)).toBeNull();
    expect(calls(source)).toHaveLength(2);
  });

  it('29.131 Cancel closes the form without filing and hands focus back; an unchanged Save compares the stored label trimmed (" Yes " saved as is files nothing)', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [row('leads_to', 'out', 'GN-147', 'Yes')] }, COMMIT);
    const user = userEvent.setup();
    const { unmount } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    const edit = await screen.findByRole('button', { name: 'Edit label: leads to GN-147' });
    await user.click(edit);
    await user.type(screen.getByLabelText('New label'), ' and more');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('New label')).toBeNull();
    expect(document.activeElement).toBe(edit);
    expect(source.ingested).toEqual([]);
    unmount();

    const padded = await relabelTo([row('leads_to', 'out', 'GN-147', ' Yes ')], false, 'Edit label: leads to GN-147', null);
    expect(padded.ingested).toEqual([]);
  });

  it('29.131 a label given to a label-free row is undone back to NO label; control: the relabel itself carries the new label', async () => {
    const source = await relabelTo([row('leads_to', 'out', 'GN-147')], false, 'Edit label: leads to GN-147', 'Yes');
    expect(calls(source)[0]![1]).toEqual(['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Yes' }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(calls(source)[1]).toEqual([
      ['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: OTHER }],
      ['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER }],
    ]);
  });

  it("29.131 an incoming row's relabel files the pair on the OTHER stream; on a draft's sheet the pair and its Undo stay on the DRAFT's stream as the from-form, the label on the add only (owner ruling O1)", async () => {
    const published = await relabelTo([row('leads_to', 'in', 'GN-133', 'Yes')], false, 'Edit label: comes after GN-133', 'Maybe');
    expect(calls(published)).toEqual([
      [
        ['ticket.link_removed', OTHER, { kind: 'leads_to', targetId: TICKET }],
        ['ticket.link_added', OTHER, { kind: 'leads_to', targetId: TICKET, label: 'Maybe' }],
      ],
    ]);
    expect(await screen.findByText('Relabelled: comes after GN-133 (Maybe)')).toBeInTheDocument();
    cleanup();

    const source = createFakeDataSource({ getTicketLinks: async () => [row('leads_to', 'in', 'GN-133', 'Yes')] }, COMMIT);
    const user = userEvent.setup();
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit isDraft make={make} />);
    await user.click(await screen.findByRole('button', { name: 'Edit label: comes after GN-133' }));
    await user.clear(screen.getByLabelText('New label'));
    await user.type(screen.getByLabelText('New label'), 'Maybe');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    expect(calls(source)).toEqual([
      [
        ['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: TICKET, from: OTHER }],
        ['ticket.link_added', TICKET, { kind: 'leads_to', targetId: TICKET, from: OTHER, label: 'Maybe' }],
      ],
      [
        ['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: TICKET, from: OTHER }],
        ['ticket.link_added', TICKET, { kind: 'leads_to', targetId: TICKET, from: OTHER, label: 'Yes' }],
      ],
    ]);
  });

  it("29.132 a relabel to a label a sibling branch has (trim, case folded) is refused locally with the engine's sentence and sends nothing; control: a case-only change of the row's own label is sent, clears the refusal, and its Undo is sent back", async () => {
    const two = [row('leads_to', 'out', 'GN-147', 'Yes'), row('leads_to', 'out', 'GN-150', 'No', SIBLING)];
    const local = createFakeDataSource({ getTicketLinks: async () => two }, COMMIT);
    const user = userEvent.setup();
    render(<Harness dataSource={local} workspaceId={WS} ticketId={TICKET} canEdit isDecision make={make} />);
    await user.click(await screen.findByRole('button', { name: 'Edit label: leads to GN-150' }));
    await user.clear(screen.getByLabelText('New label'));
    await user.type(screen.getByLabelText('New label'), ' YES'); // folded on BOTH sides: the stored "Yes" and the typed "YES"
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This Decision already has a branch labelled "YES".');
    expect(local.ingested).toHaveLength(0);
    // control: a case-only change of the row's OWN label is no clash with itself (the form stays open after a local refusal)
    await user.clear(screen.getByLabelText('New label'));
    await user.type(screen.getByLabelText('New label'), 'no');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(local.ingested).toHaveLength(1));
    expect(calls(local)[0]![1]).toEqual(['ticket.link_added', TICKET, { kind: 'leads_to', targetId: SIBLING, label: 'no' }]);
    await screen.findByText('Relabelled: leads to GN-150 (no)');
    expect(screen.queryByRole('alert')).toBeNull(); // the commit cleared the local refusal
    // its Undo goes back to "No" although the reloaded row (still "No" here) folds to the same key: the row is not its own sibling
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(local.ingested).toHaveLength(2));
    expect(calls(local)[1]![1]).toEqual(['ticket.link_added', TICKET, { kind: 'leads_to', targetId: SIBLING, label: 'No' }]);
  });

  it("29.132 when the server commits the removal and refuses the add, the original link is filed again and the server's reason shows; control: a refused or unanswered REMOVAL is one call with its reason", async () => {
    const REASON = 'This Decision already has a branch labelled "Maybe".';
    const refuseAdd: IngestScript = (events) =>
      events.map((e, i) =>
        i === 0
          ? { status: 'committed', eventId: e.id, seq: 1, serverTime: '2026-10-03T10:00:00.000Z' }
          : { status: 'refused', eventId: e.id, rule: 'link.label-duplicate', reason: REASON },
      ) as IngestResult[];
    const yes = [row('leads_to', 'out', 'GN-147', 'Yes')];
    const user = userEvent.setup();
    let reads = 0;
    const server = createFakeDataSource(
      {
        getTicketLinks: async () => {
          reads += 1;
          return yes;
        },
      },
      (events) => (events.length === 2 ? refuseAdd(events) : COMMIT(events)),
    );
    render(<Harness dataSource={server} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    await user.click(await screen.findByRole('button', { name: 'Edit label: leads to GN-147' }));
    await user.clear(screen.getByLabelText('New label'));
    await user.type(screen.getByLabelText('New label'), 'Maybe');
    const before = reads;
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(server.ingested).toHaveLength(2));
    expect(calls(server)[1]).toEqual([['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'Yes' }]]);
    expect((await screen.findByRole('alert')).textContent).toBe(REASON);
    await waitFor(() => expect(reads).toBeGreaterThan(before)); // the list is read again after the compensation
    expect(screen.getByLabelText('New label')).toBeInTheDocument(); // the form stays open for another label
    cleanup();

    const ABSENT = 'This ticket holds no such link, so there is nothing to remove.';
    for (const [script, sentence] of [
      [(events) => events.map((e) => ({ status: 'refused', eventId: e.id, rule: 'link.absent', reason: ABSENT })) as IngestResult[], ABSENT],
      [() => [], 'The server did not answer this change.'],
    ] as Array<[IngestScript, string]>) {
      const source = createFakeDataSource({ getTicketLinks: async () => yes }, script);
      render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
      await user.click(await screen.findByRole('button', { name: 'Edit label: leads to GN-147' }));
      await user.clear(screen.getByLabelText('New label'));
      await user.type(screen.getByLabelText('New label'), 'Maybe');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect((await screen.findByRole('alert')).textContent).toBe(sentence);
      await act(async () => {});
      expect(source.ingested).toHaveLength(1);
      cleanup();
    }
  });

  it("29.132 the Decision rules bind only a Decision's own outgoing branches: blank is refused there; control: blank is sent on a Task and on an incoming row, a Task may repeat a sibling's label, and an incoming row is no sibling", async () => {
    const yes = row('leads_to', 'out', 'GN-147', 'Yes');
    const blank = await relabelTo([yes], true, 'Edit label: leads to GN-147', '');
    expect(screen.getByRole('alert').textContent).toBe(REQUIRED);
    expect(blank.ingested).toEqual([]);
    cleanup();

    const taskBlank = await relabelTo([yes], false, 'Edit label: leads to GN-147', '');
    expect(calls(taskBlank)).toEqual([
      [
        ['ticket.link_removed', TICKET, { kind: 'leads_to', targetId: OTHER }],
        ['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER }],
      ],
    ]);
    expect('label' in (taskBlank.ingested[0]![1]!.payload as object)).toBe(false);
    expect(await screen.findByText('Relabelled: leads to GN-147')).toBeInTheDocument();
    cleanup();

    const incomingBlank = await relabelTo([row('leads_to', 'in', 'GN-133', 'Yes')], true, 'Edit label: comes after GN-133', '');
    expect(calls(incomingBlank)[0]![1]).toEqual(['ticket.link_added', OTHER, { kind: 'leads_to', targetId: TICKET }]);
    cleanup();

    const siblings = [yes, row('leads_to', 'out', 'GN-150', 'No', SIBLING)];
    const taskRepeat = await relabelTo(siblings, false, 'Edit label: leads to GN-150', 'yes');
    expect(calls(taskRepeat)[0]![1]).toEqual(['ticket.link_added', TICKET, { kind: 'leads_to', targetId: SIBLING, label: 'yes' }]);
    cleanup();

    const mixed = [yes, row('leads_to', 'in', 'GN-133', 'Maybe', SIBLING)];
    const outToIncomingLabel = await relabelTo(mixed, true, 'Edit label: leads to GN-147', 'maybe');
    expect(calls(outToIncomingLabel)[0]![1]).toEqual(['ticket.link_added', TICKET, { kind: 'leads_to', targetId: OTHER, label: 'maybe' }]);
    cleanup();

    const incomingToOutLabel = await relabelTo(mixed, true, 'Edit label: comes after GN-133', 'Yes');
    expect(calls(incomingToOutLabel)[0]![1]).toEqual(['ticket.link_added', SIBLING, { kind: 'leads_to', targetId: TICKET, label: 'Yes' }]);
  });

  it('29.133 on a phone the relabel form opens in the row and the Link label input sits in the "Add link" bottom sheet; control: on desktop the same controls are in the row and the Popover', async () => {
    const user = userEvent.setup();
    for (const phone of [true, false]) {
      viewport({ phone });
      const source = createFakeDataSource({ getTicketLinks: async () => [row('leads_to', 'out', 'GN-147', 'Yes')] });
      const { unmount } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
      const line = (await screen.findByText('Title GN-147')).closest('li')!;
      await user.click(within(line).getByRole('button', { name: 'Edit label: leads to GN-147' }));
      expect(within(line).getByLabelText('New label')).toHaveValue('Yes');
      await user.click(within(line).getByRole('button', { name: 'Cancel' }));
      await openPicker(user);
      const picker = screen.getByRole('dialog', { name: 'Add link' });
      expect(picker).toHaveClass(phone ? 'gn-dialog' : 'gn-popover');
      await chooseKind(user, 'Leads to');
      expect(within(picker).getByLabelText('Link label')).toBeInTheDocument();
      unmount();
    }
  });
});
