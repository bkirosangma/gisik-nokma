import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '../../src/submit.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { TICKET, WS } from '../helpers/seed.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';
import { TicketLinksSection, type TicketLinksSectionProps } from '../../src/views/ticket-links-section.js';
import { useLiveQuery } from '../../src/views/use-live-query.js';
import type { TicketLinkView } from '../../src/view-types.js';

/**
 * Cases 27.065-27.073: the ticket sheet's Links section (typed links, spec A §3.1). The sheet-level
 * cases 27.074-27.076 live in `ticket-sheet.test.tsx`.
 */

const OTHER = '01J9GTKB000000000000000000';
const row = (kind: TicketLinkView['kind'], direction: 'out' | 'in', key: string, id = `id_${key}`): TicketLinkView => ({
  kind,
  direction,
  ticket: { id, projectId: 'p', key, title: `Title ${key}`, stateCategory: 'open' },
});

/** Mirrors `TicketSheet`'s own lift: the section reads the `links` query the sheet owns. */
function Harness(props: Omit<TicketLinksSectionProps, 'links'>) {
  const links = useLiveQuery(props.dataSource, props.workspaceId, `${props.ticketId}:links`, () =>
    props.dataSource.query.getTicketLinks(props.workspaceId, props.ticketId),
  );
  return <TicketLinksSection {...props} links={links} />;
}

const make = makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });
const COMMIT: IngestScript = (events) =>
  events.map((e) => ({ status: 'committed', eventId: e.id, seq: 1, serverTime: '2026-10-03T10:00:00.000Z' }));
const CHILLER = async () => [{ ticketId: OTHER, projectId: 'p', key: 'GN-133', title: 'Chiller' }];

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
function deferredIngest(
  onCommit: (events: Parameters<IngestScript>[0]) => void,
  answer: (events: Parameters<IngestScript>[0]) => IngestResult[] = (events) => COMMIT(events) as IngestResult[],
) {
  const releases: Array<() => void> = [];
  const script: IngestScript = (events) =>
    new Promise((resolve) => {
      releases.push(() => {
        onCommit(events);
        resolve(answer(events));
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

type Ingested = Array<[string, string, unknown]>;
const triples = (batches: Array<Array<{ type: string; entity: { id: string }; payload: unknown }>>): Ingested =>
  batches.flat().map((e) => [e.type, e.entity.id, e.payload]);

async function openPicker(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Add link' }));
}
async function chooseKind(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: /Link type/ }));
  await user.click(await screen.findByRole('option', { name: label }));
}
async function findTicket(user: ReturnType<typeof userEvent.setup>, label = 'GN-133 Chiller'): Promise<void> {
  await user.type(screen.getByLabelText('Find a ticket'), 'Ch');
  await user.click(await screen.findByRole('button', { name: label }));
}

describe('Links section', () => {
  it('27.065 groups by reading in GROUP_ORDER, each row a link with Remove; control: an empty group is not drawn, an empty read says "No links yet."', async () => {
    const data = [row('relates', 'in', 'GN-3'), row('blocks', 'out', 'GN-1'), row('blocks', 'in', 'GN-2'), row('relates', 'out', 'GN-4')];
    const source = createFakeDataSource({ getTicketLinks: async () => data });
    const { unmount } = render(
      <Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} resolveTicketHref={({ ticketId }) => `/t/${ticketId}`} />,
    );
    await screen.findByText('Title GN-1');
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Blocks', 'Is blocked by', 'Relates to']);
    const relates = within(screen.getByRole('region', { name: 'Relates to' }));
    expect(relates.getByRole('link', { name: 'GN-3' })).toHaveAttribute('href', '/t/id_GN-3');
    expect(relates.getByRole('link', { name: 'GN-4' })).toHaveAttribute('href', '/t/id_GN-4');
    expect(relates.getByRole('button', { name: 'Remove: relates to GN-3' })).toBeInTheDocument();
    expect(relates.getByRole('button', { name: 'Remove: relates to GN-4' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Is blocked by' })).getByRole('button', { name: 'Remove: is blocked by GN-2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Links (4)' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Duplicates' })).toBeNull(); // the control: three groups drawn, the fourth not
    expect(screen.queryByRole('region', { name: 'Is duplicated by' })).toBeNull();
    unmount();

    render(<Harness dataSource={createFakeDataSource({ getTicketLinks: async () => [] })} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    expect(await screen.findByText('No links yet.')).toBeInTheDocument();
    expect(screen.queryAllByRole('region')).toEqual([]);
  });

  it('27.066 "Is blocked by" files on the OTHER stream with an optimistic busy row in its group; control: "Blocks" files on this ticket', async () => {
    let stored: TicketLinkView[] = [];
    const ingest = deferredIngest((events) => {
      const p = events[0]!.payload as { kind: TicketLinkView['kind']; targetId: string };
      stored = p.targetId === TICKET ? [{ ...row(p.kind, 'in', 'GN-133', OTHER) }] : [row(p.kind, 'out', 'GN-133', OTHER)];
    });
    const source = createFakeDataSource({ getTicketLinks: async () => stored }, ingest.script);
    const user = userEvent.setup();
    const { container } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    await chooseKind(user, 'Is blocked by');
    await findTicket(user);
    const region = await screen.findByRole('region', { name: 'Is blocked by' });
    expect(region.querySelector('[aria-busy="true"]')).not.toBeNull(); // inside its group, not merely somewhere
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    expect(triples(source.ingested)).toEqual([['ticket.link_added', OTHER, { kind: 'blocks', targetId: TICKET }]]);
    await ingest.releaseAll();
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(within(screen.getByRole('region', { name: 'Is blocked by' })).getByText('Title GN-133')).toBeInTheDocument();
    expect(screen.getByText('Linked: is blocked by GN-133')).toBeInTheDocument();

    await openPicker(user); // control: "Blocks" files on this ticket's stream
    await chooseKind(user, 'Blocks');
    await findTicket(user);
    expect(triples(source.ingested).slice(1)).toEqual([['ticket.link_added', TICKET, { kind: 'blocks', targetId: OTHER }]]);
    await ingest.releaseAll();
  });

  it('27.067 a server refusal removes the pending row and shows its sentence beside Add link; a precheck refusal files nothing; control: a commit clears the alert', async () => {
    const sentence = '"Chiller" already blocks "Ice maker".';
    let refuse = true;
    const ingest = deferredIngest(
      () => {},
      (events) =>
        refuse
          ? [{ status: 'refused', eventId: events[0]!.id, rule: 'link.reverse', reason: sentence }]
          : (COMMIT(events) as IngestResult[]),
    );
    const source = createFakeDataSource({ getTicketLinks: async () => [] }, ingest.script);
    const user = userEvent.setup();
    const { container, rerender } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    await findTicket(user);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull(); // present before the answer
    await ingest.releaseAll();
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(screen.getByRole('alert')).toHaveTextContent(sentence);
    expect(screen.getByRole('alert').textContent).toBe(sentence);

    refuse = false; // control: the next Add that commits clears the alert
    await openPicker(user);
    await findTicket(user);
    await ingest.releaseAll();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

    // precheck variant: a separate render whose precheck refuses; nothing is sent.
    const source2 = createFakeDataSource({ getTicketLinks: async () => [] });
    rerender(
      <Harness
        dataSource={source2}
        workspaceId={WS}
        ticketId={TICKET}
        canEdit
        make={make}
        queryTickets={CHILLER}
        precheck={async () => ({ kind: 'refused', rule: 'link.self', reason: 'A ticket cannot be linked to itself.' })}
      />,
    );
    await openPicker(user);
    await findTicket(user);
    expect((await screen.findByRole('alert')).textContent).toBe('A ticket cannot be linked to itself.');
    expect(source2.ingested).toEqual([]);
    cleanup();

    // the other two non-commit answers speak in their own words, exactly
    const silent = createFakeDataSource({ getTicketLinks: async () => [] }, () => []);
    const { unmount } = render(<Harness dataSource={silent} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await openPicker(user);
    await findTicket(user);
    expect((await screen.findByRole('alert')).textContent).toBe('The server did not answer this change.');
    unmount();
    const invalid = createFakeDataSource({ getTicketLinks: async () => [] }, (events) => [
      { status: 'invalid', eventId: events[0]!.id, code: 'malformed', message: 'That link was malformed.' } as IngestResult,
    ]);
    render(<Harness dataSource={invalid} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await openPicker(user);
    await findTicket(user);
    expect((await screen.findByRole('alert')).textContent).toBe('That link was malformed.');
  });

  it('27.066 the busy row stays visible beside a loaded link to the same ticket of another kind, direction or id; control: it does not double the loaded row it becomes', async () => {
    const user = userEvent.setup();
    for (const stored of [row('relates', 'out', 'GN-133', OTHER), row('blocks', 'in', 'GN-133', OTHER), row('blocks', 'out', 'GN-9', 'id_other')]) {
      const ingest = deferredIngest(() => {});
      const source = createFakeDataSource({ getTicketLinks: async () => [stored] }, ingest.script);
      const { container, unmount } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
      await screen.findByText(`Title ${stored.ticket.key}`);
      await openPicker(user);
      await findTicket(user); // "Blocks" OTHER, outgoing
      expect(within(await screen.findByRole('region', { name: 'Blocks' })).getByText('Chiller')).toBeInTheDocument();
      expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
      await ingest.releaseAll();
      unmount();
    }
    // control: the same link already loaded is drawn once, not twice
    const same = row('blocks', 'out', 'GN-133', OTHER);
    const ingest = deferredIngest(() => {});
    const source = createFakeDataSource({ getTicketLinks: async () => [same] }, ingest.script);
    const { container } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await screen.findByText('Title GN-133');
    await openPicker(user);
    await findTicket(user);
    expect(container.querySelectorAll('.gn-ticket-sheet__link-row')).toHaveLength(1);
    await ingest.releaseAll();
  });

  it('27.068 one remove per double click; Undo re-adds once; control: the row is gone from the reloaded list', async () => {
    let stored = [row('blocks', 'out', 'GN-142', OTHER)];
    const ingest = deferredIngest((events) => {
      stored = events[0]!.type === 'ticket.link_removed' ? [] : [row('blocks', 'out', 'GN-142', OTHER)];
    });
    const source = createFakeDataSource({ getTicketLinks: async () => stored }, ingest.script);
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    const remove = await screen.findByRole('button', { name: 'Remove: blocks GN-142' });
    await userEvent.dblClick(remove); // both clicks land before the first ingest settles: only the inFlight guard stops the second
    expect(triples(source.ingested)).toEqual([['ticket.link_removed', TICKET, { kind: 'blocks', targetId: OTHER }]]);
    await ingest.releaseAll();
    await screen.findByText('Removed link: blocks GN-142');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove: blocks GN-142' })).toBeNull()); // the reload dropped it
    await userEvent.dblClick(screen.getByRole('button', { name: 'Undo' }));
    expect(triples(source.ingested).slice(1)).toEqual([['ticket.link_added', TICKET, { kind: 'blocks', targetId: OTHER }]]); // ONE add, same stream, same payload
    await ingest.releaseAll();
    await screen.findByRole('button', { name: 'Remove: blocks GN-142' }); // the re-add reloads the row
  });

  it('27.069 removing an INCOMING row files on its stream with targetId = this ticket; control: an outgoing row files on this stream', async () => {
    const incoming = createFakeDataSource({ getTicketLinks: async () => [row('blocks', 'in', 'GN-133', OTHER)] });
    const { unmount } = render(<Harness dataSource={incoming} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove: is blocked by GN-133' }));
    expect(triples(incoming.ingested)).toEqual([['ticket.link_removed', OTHER, { kind: 'blocks', targetId: TICKET }]]);
    unmount();

    const outgoing = createFakeDataSource({ getTicketLinks: async () => [row('blocks', 'out', 'GN-142', OTHER)] });
    render(<Harness dataSource={outgoing} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove: blocks GN-142' }));
    expect(triples(outgoing.ingested)).toEqual([['ticket.link_removed', TICKET, { kind: 'blocks', targetId: OTHER }]]);
  });

  it('27.070 on a phone the picker is the bottom-sheet Dialog "Add link" and Add works; control: on desktop it is the Popover', async () => {
    viewport({ phone: true });
    const source = createFakeDataSource({ getTicketLinks: async () => [] });
    const user = userEvent.setup();
    const { unmount } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={CHILLER} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    const sheet = screen.getByRole('dialog', { name: 'Add link' });
    expect(sheet).toHaveClass('gn-dialog');
    await findTicket(user);
    expect(triples(source.ingested)).toEqual([['ticket.link_added', TICKET, { kind: 'blocks', targetId: OTHER }]]);
    unmount();

    viewport({ phone: false });
    render(<Harness dataSource={createFakeDataSource({ getTicketLinks: async () => [] })} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    await openPicker(user);
    const popover = screen.getByRole('dialog', { name: 'Add link' });
    expect(popover).toHaveClass('gn-popover');
    expect(popover).not.toHaveClass('gn-dialog');
  });

  it('27.071 with canEdit false there is no Add link and no Remove; control: with canEdit both show', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [row('blocks', 'out', 'GN-142')] });
    const { rerender } = render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit={false} make={make} />);
    await screen.findByText('Title GN-142');
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    rerender(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    expect(screen.getByRole('button', { name: 'Add link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove: blocks GN-142' })).toBeInTheDocument();
  });

  it('27.072 a failed read says so and never "No links yet."; control: a settled empty read says "No links yet."', async () => {
    const failing = createFakeDataSource({
      getTicketLinks: async () => {
        throw new Error('boom');
      },
    });
    const { unmount } = render(<Harness dataSource={failing} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      "This ticket's links could not be read: boom. That is a failure of this read, not a statement about the ticket: it may answer on a retry.",
    );
    expect(screen.queryByText('No links yet.')).toBeNull();
    unmount();

    render(<Harness dataSource={createFakeDataSource({ getTicketLinks: async () => [] })} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    expect(await screen.findByText('No links yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('27.073 the picker never offers this ticket itself; control: other results are offered', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [] });
    const user = userEvent.setup();
    render(
      <Harness
        dataSource={source}
        workspaceId={WS}
        ticketId={TICKET}
        canEdit
        make={make}
        queryTickets={async () => [
          { ticketId: TICKET, projectId: 'p', key: 'GN-1', title: 'Ice maker' },
          { ticketId: OTHER, projectId: 'p', key: 'GN-133', title: 'Chiller' },
        ]}
      />,
    );
    await screen.findByText('No links yet.');
    await openPicker(user);
    await user.type(screen.getByLabelText('Find a ticket'), 'I');
    await screen.findByRole('button', { name: 'GN-133 Chiller' });
    const options = within(screen.getByRole('listbox', { name: 'Tickets' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['GN-133 Chiller']);
  });

  it('27.073 a slow earlier search never overwrites a later answer; control: the later answer is shown', async () => {
    const source = createFakeDataSource({ getTicketLinks: async () => [] });
    const user = userEvent.setup();
    let releaseSlow: () => void = () => {};
    const queryTickets = async (q: string) => {
      if (q === 'C') {
        await new Promise<void>((resolve) => {
          releaseSlow = resolve;
        });
        return [{ ticketId: 'old', projectId: 'p', key: 'GN-OLD', title: 'Stale' }];
      }
      return [{ ticketId: OTHER, projectId: 'p', key: 'GN-133', title: 'Chiller' }];
    };
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} queryTickets={queryTickets} />);
    await screen.findByText('No links yet.');
    await openPicker(user);
    await user.type(screen.getByLabelText('Find a ticket'), 'Ch');
    await screen.findByRole('button', { name: 'GN-133 Chiller' });
    await act(async () => releaseSlow());
    expect(screen.queryByRole('button', { name: 'GN-OLD Stale' })).toBeNull();
    expect(screen.getByRole('button', { name: 'GN-133 Chiller' })).toBeInTheDocument();
  });
});
