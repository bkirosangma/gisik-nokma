import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { makeSubmittedFactory } from '../../src/submit.js';
import type { TicketRead } from '../../src/view-types.js';
import { placeUnderEvent } from '../../src/views/draft-side-events.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import { TicketLinksSection, type TicketLinksSectionProps } from '../../src/views/ticket-links-section.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { useLiveQuery } from '../../src/views/use-live-query.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

/**
 * Case 28.173, the draft-side clause (planner ruling A, 2026-10-04): no event on a published ticket's stream names a
 * draft. On a draft's sheet a link whose stored source is the other ticket, its removal, and a parent placed under the
 * draft are filed on the DRAFT's stream; the same actions on a published sheet file as they always did.
 */
afterEach(cleanup);

const D = '01JDRAFT00000000000000000D';
const S = '01JPUBL1C0000000000000000S';
const C = '01JCH1LD00000000000000000C';
const P = '01JPARENT0000000000000000P';
const make = makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });
const committed = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' } as const;
// `createFakeDataSource(overrides, ingestScript)`: the ingest answer is the SECOND argument, not a query override.
const committing = (overrides: Parameters<typeof createFakeDataSource>[0] = {}): FakeDataSource =>
  createFakeDataSource(overrides, (events) => events.map(() => committed));
// `ingested` is `SubmittedEvent[][]`, one array per `ingest` call, so every read flattens it.
const filed = (source: FakeDataSource) => source.ingested.flat().map((e) => [e.entity.id, e.type, e.payload]);

/** `ticket-links-section.test.tsx`'s Harness: the section reads the `links` query the sheet owns. */
function Harness(props: Omit<TicketLinksSectionProps, 'links'>) {
  const links = useLiveQuery(props.dataSource, props.workspaceId, `${props.ticketId}:links`, () =>
    props.dataSource.query.getTicketLinks(props.workspaceId, props.ticketId),
  );
  return <TicketLinksSection {...props} links={links} />;
}

/** Add "Is blocked by S" (stored source S), remove it from the row the reload draws, then press the toast's Undo. */
async function addThenRemoveBlockedBy(ticketId: string, isDraft: boolean): Promise<FakeDataSource> {
  let linked = false;
  const source = createFakeDataSource(
    {
      getTicketLinks: async () =>
        linked ? [{ kind: 'blocks', direction: 'in', ticket: { id: S, projectId: 'p', key: 'RP-9', title: 'Survey', stateCategory: 'open' } }] : [],
    },
    (events) => {
      linked = events[0]!.type === 'ticket.link_added';
      return events.map(() => committed);
    },
  );
  const user = userEvent.setup();
  render(
    <Harness dataSource={source} workspaceId={WS} ticketId={ticketId} canEdit make={make} isDraft={isDraft}
      queryTickets={async () => [{ ticketId: S, projectId: 'p', key: 'RP-9', title: 'Survey' }]} />,
  );
  await user.click(await screen.findByRole('button', { name: 'Add link' }));
  await user.click(screen.getByRole('button', { name: /Link type/ }));
  await user.click(await screen.findByRole('option', { name: 'Is blocked by' }));
  await user.type(screen.getByLabelText('Find a ticket'), 'Su');
  await user.click(await screen.findByRole('button', { name: 'RP-9 Survey' }));
  await user.click(await screen.findByRole('button', { name: 'Remove: is blocked by RP-9' }));
  await waitFor(() => expect(source.ingested).toHaveLength(2));
  await user.click(await screen.findByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(source.ingested).toHaveLength(3));
  cleanup();
  return source;
}

const editorSlot: EditorSlotComponent = (props) => <textarea aria-label={props.mode} placeholder={props.placeholder} readOnly />;
function sheetRead(draft: boolean): TicketRead {
  return {
    ticket: ticketStateSeed(draft ? { stateId: 'backlog', stateCategory: 'open' } : {}),
    title: 'Pave the lane',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: draft ? null : 'RP-1',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
    ...(draft ? { draft: true as const } : {}),
  };
}

/** The sheet's Add subtask, typed and pressed; the subtask's `parentId` is the sheet's `ticketId` prop. */
async function addSubtaskOn(draft: boolean): Promise<FakeDataSource> {
  const source = committing({
    getTicket: async () => sheetRead(draft),
    getWorkflowDef: async () => WF_ERRAND,
    getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
    getTicketTypes: async () => [
      { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] },
      { id: 'sub-task', name: 'Sub-task', icon: 'list', rank: 4, workflowId: 'wf-errand', fields: [] },
    ],
  });
  render(
    <TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={() => {}}
      editorSlot={editorSlot} workspaceName="Roads Co" projectName="Roads" />,
  );
  const user = userEvent.setup();
  await user.type(await screen.findByTestId('sheet-subtask-title'), 'Pour the base');
  await user.click(screen.getByTestId('sheet-subtask-add'));
  await waitFor(() => expect(source.ingested.flat().length).toBeGreaterThan(0));
  cleanup();
  return source;
}

describe('28.173 draft-side filing', () => {
  it("28.173 a draft sheet files links and parents on the draft's stream only; control: a published sheet files normally", async () => {
    // Draft sheet: "Is blocked by S" (stored source S), then remove it.
    const draft = await addThenRemoveBlockedBy(D, true);
    expect(filed(draft)).toEqual([
      [D, 'ticket.link_added', { kind: 'blocks', targetId: D, from: S }],
      [D, 'ticket.link_removed', { kind: 'blocks', targetId: D, from: S }],
      [D, 'ticket.link_added', { kind: 'blocks', targetId: D, from: S }], // the Undo, built at click time
    ]);
    expect(draft.ingested.flat().map((e) => e.entity.id)).not.toContain(S); // the other ticket's stream gets no event
    // Set a parent: a published C under the draft D.
    expect(placeUnderEvent(make, WS, { parentId: D, parentIsDraft: true, childId: C })).toMatchObject({
      entity: { kind: 'ticket', id: D },
      type: 'ticket.reparented',
      payload: { newParentId: D, childId: C },
    });
    // Add subtask on the draft's sheet: the child is the author's own draft, in Backlog.
    const child = (await addSubtaskOn(true)).ingested.flat().at(-1)!;
    expect(child).toMatchObject({ type: 'ticket.created', payload: { draft: true, start: 'backlog', parentId: TICKET } });
    expect(child.entity.id).not.toBe(TICKET);
    // The exact key set (`addSubtask` never sends a stateId, so a `not.toHaveProperty('stateId')` could not fail).
    expect(Object.keys(child.payload as object).sort()).toEqual(['draft', 'parentId', 'projectId', 'start', 'title', 'typeId']);

    // CONTROL: the same three actions on a published sheet file normally.
    const pub = await addThenRemoveBlockedBy(P, false);
    expect(filed(pub)).toEqual([
      [S, 'ticket.link_added', { kind: 'blocks', targetId: P }],
      [S, 'ticket.link_removed', { kind: 'blocks', targetId: P }],
      [S, 'ticket.link_added', { kind: 'blocks', targetId: P }],
    ]);
    const placed = placeUnderEvent(make, WS, { parentId: P, parentIsDraft: false, childId: C });
    expect(placed).toMatchObject({ entity: { kind: 'ticket', id: C }, type: 'ticket.reparented', payload: { newParentId: P } });
    expect(placed.payload).not.toHaveProperty('childId');
    const pubChild = (await addSubtaskOn(false)).ingested.flat().at(-1)!;
    expect(pubChild.payload).toMatchObject({ parentId: TICKET, start: 'focus' });
    expect(pubChild.payload).not.toHaveProperty('draft');
  });

  it('28.173 a draft-side Undo still in flight keeps a re-Add of the same link from filing twice (its key names the other ticket, from `from`)', async () => {
    let linked = true;
    const held: Array<() => void> = [];
    const source = createFakeDataSource(
      {
        getTicketLinks: async () =>
          linked ? [{ kind: 'blocks', direction: 'in', ticket: { id: S, projectId: 'p', key: 'RP-9', title: 'Survey', stateCategory: 'open' } }] : [],
      },
      (events) => {
        if (events[0]!.type === 'ticket.link_removed') {
          linked = false;
          return events.map(() => committed);
        }
        // Every add is held, so the Undo is still IN FLIGHT when the same link is added again.
        return new Promise((resolve) => held.push(() => { linked = true; resolve(events.map(() => committed)); }));
      },
    );
    const user = userEvent.setup();
    render(
      <Harness dataSource={source} workspaceId={WS} ticketId={D} canEdit make={make} isDraft
        queryTickets={async () => [{ ticketId: S, projectId: 'p', key: 'RP-9', title: 'Survey' }]} />,
    );
    await user.click(await screen.findByRole('button', { name: 'Remove: is blocked by RP-9' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    const adds = () => filed(source).filter(([, type]) => type === 'ticket.link_added');
    await waitFor(() => expect(adds()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.click(screen.getByRole('button', { name: /Link type/ }));
    await user.click(await screen.findByRole('option', { name: 'Is blocked by' }));
    await user.type(screen.getByLabelText('Find a ticket'), 'Su');
    await user.click(await screen.findByRole('button', { name: 'RP-9 Survey' }));
    // The re-Add met the Undo's in-flight key and filed nothing: one link_added for S, the Undo's own.
    expect(adds()).toEqual([[D, 'ticket.link_added', { kind: 'blocks', targetId: D, from: S }]]);
    await act(async () => { for (const release of held.splice(0)) release(); });
    expect(adds()).toHaveLength(1);
  });

  it("28.173 a draft's OUTGOING link is already on its own stream (no from); the sheet hands the Links section its draft flag", async () => {
    const user = userEvent.setup();
    const pickS = async (kind: string) => {
      await user.click(await screen.findByRole('button', { name: 'Add link' }));
      await user.click(screen.getByRole('button', { name: /Link type/ }));
      await user.click(await screen.findByRole('option', { name: kind }));
      await user.type(screen.getByLabelText('Find a ticket'), 'Su');
      await user.click(await screen.findByRole('button', { name: 'RP-9 Survey' }));
    };
    const hits = async () => [{ ticketId: S, projectId: 'p', key: 'RP-9', title: 'Survey' }];
    // "Blocks S" from the draft: the stored source is the draft itself, so the ordinary form, on D, with no `from`.
    const out = committing({ getTicketLinks: async () => [] });
    render(<Harness dataSource={out} workspaceId={WS} ticketId={D} canEdit make={make} isDraft queryTickets={hits} />);
    await pickS('Blocks');
    await waitFor(() => expect(filed(out)).toEqual([[D, 'ticket.link_added', { kind: 'blocks', targetId: S }]]));
    cleanup();
    // Through the SHEET (not the section alone): a draft's sheet files "Is blocked by S" on the draft's stream.
    const sheet = committing({
      getTicket: async () => sheetRead(true),
      getTicketLinks: async () => [],
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
      getTicketTypes: async () => [{ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] }],
    });
    render(
      <TicketSheet dataSource={sheet} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={() => {}}
        editorSlot={editorSlot} workspaceName="Roads Co" projectName="Roads" queryTickets={hits} />,
    );
    await pickS('Is blocked by');
    await waitFor(() => expect(filed(sheet)).toEqual([[TICKET, 'ticket.link_added', { kind: 'blocks', targetId: TICKET, from: S }]]));
  });
});
