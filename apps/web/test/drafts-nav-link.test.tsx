import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRow } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

/** The session is a per-case value, as in `inbox-nav-link.test.tsx`: the link's gate is `useSessionStatus`. */
let session: { data?: { user: { id: string; name: string } }; isPending?: boolean } = {};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { DraftsNavLink } from '../src/drafts-nav-link.js';

/** Case 28.177 (drafts T8): the nav's Drafts link and its count. */
const draftRow = (id: string): DraftRow => ({
  ticketId: id, projectId: 'p', projectName: 'P', typeId: 'task', title: id, parentId: null,
  updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount: 0, pending: false,
});
const mount = (rows: DraftRow[], getMyDrafts = vi.fn(async () => rows)) => {
  // `stubServices(overrides, gateways)`: the query overrides are the FIRST argument.
  render(<Providers services={stubServices({ getMyDrafts })}><DraftsNavLink workspaceId="ws1" /></Providers>);
  return getMyDrafts;
};

beforeEach(() => {
  session = { data: { user: { id: 'u_kiro', name: 'Kiro' } } };
});
afterEach(cleanup);

describe('28.177 the Drafts link', () => {
  it('28.177 links to the page and carries the count in its name and on screen', async () => {
    mount([draftRow('a'), draftRow('b'), draftRow('c')]);
    const link = await screen.findByRole('link', { name: 'Drafts, 3 drafts' });
    expect(link).toHaveAttribute('href', '/w/ws1/drafts');
    expect(link.querySelector('.gn-nav__count')?.textContent).toBe('3');
  });
  it('28.177 one draft is singular; none is a bare Drafts with no count', async () => {
    mount([draftRow('a')]);
    expect(await screen.findByRole('link', { name: 'Drafts, 1 draft' })).toBeInTheDocument();
    cleanup();
    const read = mount([]);
    const link = await screen.findByRole('link', { name: 'Drafts' });
    // The count is also absent WHILE LOADING (`data` is null → 0), so the empty answer must land first.
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(link.querySelector('.gn-nav__count')).toBeNull();
    expect(link).toHaveAccessibleName('Drafts');
  });
  it('28.177 a hundred drafts draw 99+ and keep the real count in the name', async () => {
    mount(Array.from({ length: 100 }, (_, i) => draftRow(`d${String(i)}`)));
    const link = await screen.findByRole('link', { name: 'Drafts, 100 drafts' });
    expect(link.querySelector('.gn-nav__count')?.textContent).toBe('99+');
    cleanup();
    mount(Array.from({ length: 99 }, (_, i) => draftRow(`d${String(i)}`)));
    expect((await screen.findByRole('link', { name: 'Drafts, 99 drafts' })).querySelector('.gn-nav__count')?.textContent).toBe('99');
  });
  it('28.177 the count follows a reload of the list (a stream frame re-reads it)', async () => {
    let rows = [draftRow('a')];
    const services = stubServices({ getMyDrafts: async () => rows });
    const listeners: Array<(item: unknown) => void> = [];
    services.dataSource.subscribe = ((_ws: string, _after: number, cb: (item: unknown) => void) => {
      listeners.push(cb);
      return () => undefined;
    }) as typeof services.dataSource.subscribe;
    render(<Providers services={services}><DraftsNavLink workspaceId="ws1" /></Providers>);
    await screen.findByRole('link', { name: 'Drafts, 1 draft' });
    rows = [draftRow('a'), draftRow('b')];
    await act(async () => {
      for (const cb of listeners) cb({ type: 'event', envelope: { id: 'e1', workspaceId: 'ws1', entity: { kind: 'ticket', id: 'b' }, type: 'ticket.created', version: 1, payload: {}, actorId: 'u_kiro', origin: 'web', clientTime: '2026-10-03T08:00:00.000Z', serverTime: '2026-10-03T08:00:00.000Z', seq: 2, workspaceSeq: 2 } });
    });
    expect(await screen.findByRole('link', { name: 'Drafts, 2 drafts' }, { timeout: 3000 })).toBeInTheDocument();
  });
  it('28.177 a signed-out session renders the link and reads nothing', async () => {
    session = {};
    const getMyDrafts = mount([draftRow('a')]);
    expect(await screen.findByRole('link', { name: 'Drafts' })).toHaveAttribute('href', '/w/ws1/drafts');
    await act(async () => { await Promise.resolve(); });
    expect(getMyDrafts).not.toHaveBeenCalled();
  });
});
