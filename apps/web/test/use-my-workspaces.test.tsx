import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers, resetLastKnownUser } from '../src/providers.js';
import { bumpProjectsVersion } from '../src/projects-version.js';
import { stubServices } from './helpers/stub-services.js';
import { clearMyWorkspacesCache, useMyWorkspaces } from '../src/use-my-workspaces.js';

let mockUser: { id: string; name: string } | null = { id: 'u_kiro', name: 'Kiro' };
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockUser === null ? null : { user: mockUser }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/workspaces',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

const ROW = (name: string): WorkspaceRef => ({
  id: `ws_${name}`,
  name,
  prefix: 'SH',
  role: 'owner',
  archived: false,
  memberCount: 1,
  projects: [],
  nameRestrictedProjectCount: 0,
});

function wrapperFor(getMyWorkspaces: () => Promise<WorkspaceRef[]>) {
  const services = stubServices({ getMyWorkspaces }, { notifications: { unreadCount: async () => 0 } });
  return ({ children }: { children: ReactNode }) => <Providers services={services}>{children}</Providers>;
}

describe('useMyWorkspaces: ONE read per person per page (audit SM-05; spec §3.2)', () => {
  beforeEach(() => {
    clearMyWorkspacesCache();
    resetLastKnownUser();
    mockUser = { id: 'u_kiro', name: 'Kiro' };
  });

  it('25.041 three consumers mounted together make one getMyWorkspaces call and all see the rows', async () => {
    const getMyWorkspaces = vi.fn(async () => [ROW('Shop')]);
    const wrapper = wrapperFor(getMyWorkspaces);
    const a = renderHook(() => useMyWorkspaces(), { wrapper });
    const b = renderHook(() => useMyWorkspaces(), { wrapper });
    const c = renderHook(() => useMyWorkspaces(), { wrapper });
    await waitFor(() => expect(c.result.current.rows?.[0]?.name).toBe('Shop'));
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Shop'));
    expect(a.result.current.rows).toBe(b.result.current.rows);
    // The control, in the same it(): a consumer mounted AFTER the read settled
    // joins it; it does not start a second one.
    const d = renderHook(() => useMyWorkspaces(), { wrapper });
    expect(d.result.current.rows?.[0]?.name).toBe('Shop');
    expect(getMyWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('25.044 another person signing in on the same device never sees the first person\'s rows', async () => {
    const first = vi.fn(async () => [ROW('Kiro only')]);
    const a = renderHook(() => useMyWorkspaces(), { wrapper: wrapperFor(first) });
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Kiro only'));
    // The control: the SAME person remounting gets the rows at once, so the
    // null below is the user switch and not a hook that never answers early.
    const same = renderHook(() => useMyWorkspaces(), { wrapper: wrapperFor(first) });
    expect(same.result.current.rows?.[0]?.name).toBe('Kiro only');
    a.unmount();
    same.unmount();
    mockUser = { id: 'u_other', name: 'Other' };
    const second = vi.fn(async () => [] as WorkspaceRef[]);
    const seen: Array<unknown> = [];
    const b = renderHook(
      () => {
        const value = useMyWorkspaces();
        seen.push(value.rows);
        return value;
      },
      { wrapper: wrapperFor(second) },
    );
    expect(b.result.current.rows).toBeNull(); // first render: nothing from u_kiro
    await waitFor(() => expect(b.result.current.rows).toEqual([]));
    // At no render, however late, did the first person's rows appear.
    expect(seen.flat().some((row) => (row as { name?: string } | null)?.name === 'Kiro only')).toBe(false);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('25.044 a signed-out visit clears the rows: the same person signing back in reads again', async () => {
    const read = vi.fn(async () => [ROW('Shop')]);
    const wrapper = wrapperFor(read);
    const a = renderHook(() => useMyWorkspaces(), { wrapper });
    await waitFor(() => expect(a.result.current.rows).not.toBeNull());
    mockUser = null;
    a.rerender();
    expect(a.result.current.rows).toBeNull();
    mockUser = { id: 'u_kiro', name: 'Kiro' };
    a.rerender();
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Shop'));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('25.044 the person changing IN PLACE (one mounted hook) is never painted the first person\'s rows, even for one render', async () => {
    const read = vi
      .fn<() => Promise<WorkspaceRef[]>>()
      .mockResolvedValueOnce([ROW('Kiro only')])
      .mockResolvedValueOnce([ROW('Other only')]);
    const names: Array<string | undefined> = [];
    const a = renderHook(
      () => {
        const value = useMyWorkspaces();
        names.push(value.rows?.[0]?.name);
        return value;
      },
      { wrapper: wrapperFor(read) },
    );
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Kiro only'));
    // The control: the first person's rows really were painted before the switch.
    expect(names).toContain('Kiro only');
    const before = names.length;
    mockUser = { id: 'u_other', name: 'Other' };
    a.rerender();
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Other only'));
    expect(names.slice(before)).not.toContain('Kiro only');
  });

  it('25.043 a refused read is reported once and is NOT sticky: the next mount asks again', async () => {
    const read = vi
      .fn<() => Promise<WorkspaceRef[]>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce([ROW('Shop')]);
    const wrapper = wrapperFor(read);
    const a = renderHook(() => useMyWorkspaces(), { wrapper });
    await waitFor(() => expect(a.result.current.error).toBe('down'));
    expect(a.result.current.rows).toBeNull();
    a.unmount();
    const b = renderHook(() => useMyWorkspaces(), { wrapper });
    await waitFor(() => expect(b.result.current.rows?.[0]?.name).toBe('Shop'));
    expect(b.result.current.error).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('25.047 a committed project write (the projects version) reads again, as the three hooks did before they shared', async () => {
    const read = vi
      .fn<() => Promise<WorkspaceRef[]>>()
      .mockResolvedValueOnce([ROW('Old')])
      .mockResolvedValueOnce([ROW('Renamed')]);
    const a = renderHook(() => useMyWorkspaces(), { wrapper: wrapperFor(read) });
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Old'));
    act(() => bumpProjectsVersion());
    await waitFor(() => expect(a.result.current.rows?.[0]?.name).toBe('Renamed'));
    expect(read).toHaveBeenCalledTimes(2);
  });
});
