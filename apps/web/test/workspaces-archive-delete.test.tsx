import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import {
  ARCHIVED_CHIP_LABEL,
  ARCHIVE_LABEL,
  DELETE_TRIGGER_LABEL,
  RESTORE_LABEL,
  WORKSPACE_MENU_LABEL,
  archivedDoorName,
  archivedToggleName,
  archivedToggleText,
  deletedNotice,
  moreActionsFor,
  typeNameLabel,
  type WorkspaceRef,
} from '@gisik-nokma/app-core';
import WorkspacesPage from '../app/workspaces/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/** Trash series Plan 4, Task 8. Cases 19.245–19.249 (`test-cases/19-trash.md` §19.26). */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/workspaces',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

function ws(over: Partial<WorkspaceRef> & { id: string; name: string }): WorkspaceRef {
  return { prefix: 'CC', role: 'owner', archived: false, memberCount: 3, nameRestrictedProjectCount: 0, projects: [], ...over };
}
const CC = ws({ id: 'ws1', name: 'Convenience Corner' });
const GH = ws({ id: 'ws2', name: 'Garo Hills Logistics' });

function mount(reads: WorkspaceRef[][]) {
  let ingests = 0;
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({ getMyWorkspaces: async () => reads[Math.min(ingests, reads.length - 1)]! }, {});
  services.dataSource.ingest = async (events) => {
    sent.push(events);
    ingests += 1;
    return events.map(
      (event): IngestResult => ({ status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-09-29T10:00:00.000Z' }),
    );
  };
  render(
    <Providers services={services}>
      <WorkspacesPage />
    </Providers>,
  );
  return { sent };
}
const types = (batch: SubmittedEvent[] | undefined) => (batch ?? []).map((event) => event.type);

describe('19.245–19.249 archive and delete on the workspace cards', () => {
  it('19.245 an owner card: one link, one button outside it; CONTROL: an admin card has no button', async () => {
    mount([[CC, ws({ id: 'ws3', name: 'Admin Only', role: 'admin' })]]);
    const card = await screen.findByTestId('workspace-card-ws1');
    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(1);
    const buttons = within(card).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(moreActionsFor('Convenience Corner'));
    expect(links[0]!.contains(buttons[0]!)).toBe(false);
    expect(within(screen.getByTestId('workspace-card-ws3')).queryAllByRole('button')).toHaveLength(0);
  });

  it('19.246 the menu: named, first item focused, arrows, Escape returns focus; CONTROL: aria-expanded', async () => {
    const user = userEvent.setup();
    mount([[CC]]);
    const trigger = await screen.findByRole('button', { name: moreActionsFor('Convenience Corner') });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: WORKSPACE_MENU_LABEL });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([ARCHIVE_LABEL, DELETE_TRIGGER_LABEL]);
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('19.247 Archive posts workspace.archived and the card moves to the Archived group; CONTROL: the other card stays live', async () => {
    const user = userEvent.setup();
    const { sent } = mount([[CC, GH], [{ ...CC, archived: true }, GH]]);
    await user.click(await screen.findByRole('button', { name: moreActionsFor('Convenience Corner') }));
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: ARCHIVE_LABEL }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({ type: 'workspace.archived', workspaceId: 'ws1', entity: { kind: 'workspace', id: 'ws1' }, payload: {} });
    await waitFor(() => expect(screen.queryByTestId('workspace-card-ws1')).toBeNull());
    expect(screen.getByRole('button', { name: archivedToggleName(false) })).toHaveTextContent(archivedToggleText(1, false));
    expect(screen.getByTestId('workspace-card-ws2')).toBeInTheDocument();
  });

  it('19.248 the Archived group: collapsed, then dimmed and chipped, Restore; CONTROL: Hide collapses', async () => {
    const user = userEvent.setup();
    const { sent } = mount([[GH, { ...CC, archived: true }]]);
    const toggle = await screen.findByRole('button', { name: archivedToggleName(false) });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('workspace-card-ws1')).toBeNull();
    await user.click(toggle);
    const card = screen.getByTestId('workspace-card-ws1');
    expect(within(card).getByText(ARCHIVED_CHIP_LABEL)).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveAccessibleName(archivedDoorName('Convenience Corner'));
    expect(card.querySelector('.gn-workspace-card--archived')).not.toBeNull();

    await user.click(within(card).getByRole('button', { name: moreActionsFor('Convenience Corner') }));
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: RESTORE_LABEL }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(types(sent[0])).toEqual(['workspace.restored']);

    await user.click(screen.getByRole('button', { name: archivedToggleName(true) }));
    expect(screen.queryByTestId('workspace-card-ws1')).toBeNull();
  });

  it('19.249 Delete… needs the name, posts workspace.deleted, and says where it went; CONTROL: nothing before typing', async () => {
    const user = userEvent.setup();
    const { sent } = mount([[CC, GH], [GH]]);
    await user.click(await screen.findByRole('button', { name: moreActionsFor('Convenience Corner') }));
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: DELETE_TRIGGER_LABEL }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete workspace “Convenience Corner”?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete workspace' });
    expect(confirm).toBeDisabled();
    expect(sent).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(typeNameLabel('Convenience Corner')), 'Convenience Corner');
    await user.click(confirm);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]![0]).toMatchObject({ type: 'workspace.deleted', workspaceId: 'ws1', entity: { kind: 'workspace', id: 'ws1' } });
    await waitFor(() => expect(screen.queryByTestId('workspace-card-ws1')).toBeNull());
    expect(screen.getByTestId('trash-notice')).toHaveTextContent(deletedNotice('workspace', 'Convenience Corner', false));
  });
});
