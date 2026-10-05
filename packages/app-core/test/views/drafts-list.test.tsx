import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineAcceptError } from '../../src/replica/replica-data-source.js';
import { DraftsList } from '../../src/views/drafts-list.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import type { DraftRow } from '../../src/view-types.js';

/** Cases 28.162-28.169 (drafts T8): the Drafts list, its Publish and Discard, the confirm and the phone row menu. */
afterEach(cleanup);

const WS = 'ws1';
const committed = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' } as const;
const row = (ticketId: string, extra: Partial<DraftRow> = {}): DraftRow => ({
  ticketId, projectId: 'p1', projectName: 'Roads', typeId: 'task', title: `Draft ${ticketId}`, parentId: null,
  updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount: 0, pending: false, ...extra,
});
const listRows = { getTickets: async () => ({ projectId: 'p1', rows: [{ ticketId: 'a', stateId: 'backlog', rank: 'a0' }] }) as never };

function mount(drafts: DraftRow[], opts: { phone?: boolean; ingest?: (e: never[]) => unknown } = {}) {
  const source = createFakeDataSource(listRows, (opts.ingest ?? ((e: unknown[]) => e.map(() => committed))) as never);
  const onOpenTicket = vi.fn();
  const onChanged = vi.fn();
  render(
    <DraftsList drafts={drafts} dataSource={source} workspaceId={WS} currentUserId="u1" typeName={(id) => (id === 'task' ? 'Task' : id)}
      {...(opts.phone === undefined ? {} : { phone: opts.phone })} onOpenTicket={onOpenTicket} onChanged={onChanged} />,
  );
  return { source, onOpenTicket, onChanged };
}

describe('28.162 rows', () => {
  it('28.162 type chip, title, project, parent, actions, order kept, never a key, pending labelled', () => {
    // The given order [Parent (d2), Child (d1)] is neither title order nor id order, so a list that sorted by
    // either would red the order leg. (The old pair, Child/d2 then Parent/d1, was already in title order.)
    mount([row('d2', { title: 'Parent', pending: true }), row('d1', { parentId: 'd2', title: 'Child' })]);
    const rows = screen.getAllByRole('listitem');
    // The accessible name, not `textContent`: the visually hidden "Open " prefix is in the text too, so the old
    // `.textContent` leg read "Open Child" and failed on the plan's own markup.
    expect(rows.map((r) => within(r).getByRole('button', { name: /^Open / }))).toEqual([
      within(rows[0]!).getByRole('button', { name: 'Open Parent' }),
      within(rows[1]!).getByRole('button', { name: 'Open Child' }),
    ]);
    expect(within(rows[1]!).getByText('Task')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Roads')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('under Parent')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText(/^under /)).toBeNull(); // a root draft names no parent
    expect(within(rows[1]!).getByRole('button', { name: 'Publish Child' })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: 'Discard Child' })).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Waiting to sync')).toBeInTheDocument();
    expect(within(rows[1]!).queryByText('Waiting to sync')).toBeNull();
    expect(screen.getByRole('list', { name: 'Drafts' }).textContent).not.toMatch(/\b[A-Z]{2,}-\d+\b/);
  });
});

describe('28.163 empty', () => {
  it('28.163 the empty sentence and no list; rows show no such sentence', () => {
    const { unmount } = render(
      <DraftsList drafts={[]} dataSource={createFakeDataSource()} workspaceId={WS} currentUserId="u1" typeName={String} onOpenTicket={vi.fn()} />,
    );
    expect(screen.getByText('No drafts. A draft is a ticket only you can see, until you publish it.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    unmount();
    mount([row('d1')]);
    expect(screen.queryByText(/No drafts\./)).toBeNull();
  });
});

describe('28.164 open', () => {
  it('28.164 the title button opens that row; the actions do not', async () => {
    const { onOpenTicket } = mount([row('d1'), row('d2')]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open Draft d2' }));
    expect(onOpenTicket).toHaveBeenCalledExactlyOnceWith('d2');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish Draft d1' }));
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
  });
});

describe('28.165 Publish', () => {
  it('28.165 hides the row at once, sends the events, calls onChanged on a commit', async () => {
    let answer!: (r: unknown[]) => void;
    const { source, onChanged } = mount([row('d1'), row('d2')], { ingest: () => new Promise((r) => { answer = r as never; }) });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish Draft d1' }));
    expect(screen.queryByText('Draft d1')).toBeNull();
    expect(screen.getByText('Draft d2')).toBeInTheDocument();
    await act(async () => { answer([committed, committed]); });
    expect(source.ingested[0]!.map((e) => e.type)).toEqual(['ticket.published', 'ticket.ranked']);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  it('28.165 a refusal restores the row with the reason under it; an unanswered publish says the plan sentence', async () => {
    mount([row('d1'), row('d2')], { ingest: () => [{ status: 'refused', rule: 'draft.parent-unpublished', reason: 'Publish the parent first' }] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish Draft d2' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Publish the parent first');
    expect(alert.closest('li')).toBe(screen.getByText('Draft d2').closest('li'));
    expect(screen.getByText('Draft d1')).toBeInTheDocument();
    document.body.innerHTML = '';
    mount([row('d1')], { ingest: () => { throw new Error('socket'); } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish Draft d1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not publish this draft. Check your connection and try again.');
    expect(screen.getByText('Draft d1')).toBeInTheDocument();
  });
});

describe('28.166 Publish offline', () => {
  it('28.166 a queued publish keeps the row, shows no alert, and asks the list to re-read', async () => {
    const { onChanged } = mount([row('d1')], { ingest: () => { throw new OfflineAcceptError([{ status: 'pending', eventId: 'e1' }]); } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish Draft d1' }));
    expect(await screen.findByText('Draft d1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe('28.167 the Discard confirm', () => {
  const family = [row('d1', { attachmentCount: 1 }), row('d2', { parentId: 'd1', attachmentCount: 1 }), row('d3', { parentId: 'd2' }), row('lone')];
  it('28.167 names the question, the title, the counts, the notes line and the button; focus starts on Cancel', async () => {
    const { source } = mount(family);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Discard Draft d1' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Discard draft' });
    expect(within(dialog).getByText("Discard this draft? It is erased and can't be recovered.")).toBeInTheDocument();
    expect(within(dialog).getByText('Draft d1')).toBeInTheDocument();
    expect(within(dialog).getByText('2 sub-drafts will be erased too')).toBeInTheDocument();
    expect(within(dialog).getByText('2 attachments uploaded to this draft will be permanently deleted')).toBeInTheDocument();
    expect(within(dialog).getByText('Linked notes are kept and unlinked.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Discard draft' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull(); // Escape answered (a dialog that ignored it would leave "sent nothing" vacuous)
    expect(source.ingested).toHaveLength(0);
    expect(screen.getByText('Draft d1')).toBeInTheDocument();
    // Cancel, the other way out, also sends nothing.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Discard Draft d1' }));
    await userEvent.setup().click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(source.ingested).toHaveLength(0);
  });
  it('28.167 zero counts omit their lines; an unknown attachment count says so without a number', async () => {
    mount([row('lone')]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Discard Draft lone' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).queryByText(/sub-draft/)).toBeNull();
    expect(within(dialog).queryByText(/attachments? uploaded to this draft will be/)).toBeNull();
    expect(within(dialog).getByText('Linked notes are kept and unlinked.')).toBeInTheDocument();
    document.body.innerHTML = '';
    mount([row('lone', { attachmentCount: null })]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Discard Draft lone' }));
    expect(screen.getByText('Attachments uploaded to this draft, if any, will be permanently deleted')).toBeInTheDocument();
  });
});

describe('28.168 Discard commits once', () => {
  it('28.168 one ticket.discarded; the draft and its sub-drafts leave at once; the unrelated one stays', async () => {
    let answer!: (r: unknown[]) => void;
    const { source, onChanged } = mount([row('d1'), row('d2', { parentId: 'd1' }), row('lone')], { ingest: () => new Promise((r) => { answer = r as never; }) });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Discard Draft d1' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard draft' }));
    expect(screen.queryByText('Draft d1')).toBeNull();
    expect(screen.queryByText('Draft d2')).toBeNull();
    expect(screen.getByText('Draft lone')).toBeInTheDocument();
    await act(async () => { answer([committed]); });
    expect(source.ingested).toHaveLength(1);
    expect(source.ingested[0]!.map((e) => [e.type, e.entity.id])).toEqual([['ticket.discarded', 'd1']]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  it('28.168 a refusal restores all of them with the reason under the draft', async () => {
    mount([row('d1'), row('d2', { parentId: 'd1' })], { ingest: () => [{ status: 'refused', rule: 'purge.failed', reason: 'The erase did not finish' }] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Discard Draft d1' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard draft' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The erase did not finish');
    expect(alert.closest('li')).toBe(screen.getByText('Draft d1').closest('li')); // under the DRAFT's row, not its sub-draft's
    expect(screen.getByText('Draft d1')).toBeInTheDocument();
    expect(screen.getByText('Draft d2')).toBeInTheDocument();
  });
});

describe('28.169 phone', () => {
  it('28.169 one menu button per row; both actions are menu items; Escape closes; Publish publishes', async () => {
    const { source } = mount([row('d1')], { phone: true });
    expect(screen.queryByRole('button', { name: 'Publish Draft d1' })).toBeNull();
    const menu = screen.getByRole('button', { name: 'Actions for Draft d1' });
    expect(menu).toHaveAttribute('aria-haspopup', 'menu');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    const user = userEvent.setup();
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    // The menu is named for its row (13.1059: no unnamed `role="menu"` in product source).
    expect(within(screen.getByRole('menu', { name: 'Actions for Draft d1' })).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Publish', 'Discard']);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(menu);
    await user.click(screen.getByRole('menuitem', { name: 'Publish' }));
    expect(source.ingested[0]![0]!.type).toBe('ticket.published');
  });
  it('28.169 without phone both are buttons and there is no menu', () => {
    mount([row('d1')]);
    expect(screen.getByRole('button', { name: 'Publish Draft d1' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for Draft d1' })).toBeNull();
  });
});
