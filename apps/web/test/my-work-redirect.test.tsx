import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * My work moved to ONE global route, `/my-work` (my-work-global T4, cases 30.040 and 30.043).
 *
 * - **30.040:** the old per-workspace route answers with a client redirect, so a bookmark or a
 *   link somebody pasted still lands. A deep link keeps its ticket, and gains the workspace the
 *   old path carried: the global page's sheet needs both (`?ticket=<id>&ws=<workspaceId>`).
 * - **30.043:** every door that sent a person to the old route now names the new one. The
 *   rendering doors are pinned in their own suites (app-nav 11.171, bottom-bar 30.043, invite
 *   13.x, empty-states 23.195); this file is the census over the six source files the plan
 *   names, plus the whole web tree, so a seventh door cannot keep the old shape unseen.
 */

const W1 = '01J9WSALPHA000000000000000';

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useParams: () => ({ workspaceId: W1 }),
  usePathname: () => `/w/${W1}/my-work`,
  useSearchParams: () => searchParams,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u1', name: 'Anselma Marak' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import OldMyWorkRoute from '../app/w/[workspaceId]/my-work/page.js';

function renderOld() {
  return render(
    <Providers services={stubServices({})}>
      <OldMyWorkRoute />
    </Providers>,
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  searchParams = new URLSearchParams();
});

describe('30.040 /w/<id>/my-work redirects to /my-work', () => {
  it('30.040 the bare old route REPLACES itself with /my-work (no history entry to bounce back into)', async () => {
    renderOld();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/my-work'));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('30.040 a deep link keeps its ticket and gains the workspace: ?ticket=T → /my-work?ticket=T&ws=W1', async () => {
    searchParams = new URLSearchParams({ ticket: '01J9TICKET0000000000000000' });
    renderOld();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/my-work?ticket=01J9TICKET0000000000000000&ws=${W1}`),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('30.040 the ticket is carried ENCODED, so a value with & or = cannot smuggle a second parameter', async () => {
    searchParams = new URLSearchParams({ ticket: 'a&ws=evil' });
    renderOld();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/my-work?ticket=a%26ws%3Devil&ws=${W1}`));
  });
});

const REPO = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(REPO, path), 'utf8');

/** The old shape: a template literal that builds `/w/${…}/my-work`. */
const OLD_DOOR = /\/w\/\$\{[^}]*\}\/my-work/;
/** The new one: `/my-work` as a whole string literal, or the start of one with a query. */
const NEW_DOOR = /[`'"]\/my-work[`'"?]/;

const ENTRY_POINTS = [
  'apps/web/src/app-nav.tsx',
  'apps/web/src/bottom-bar.tsx',
  'apps/web/app/inbox/page.tsx',
  'apps/web/app/invite/[token]/page.tsx',
  'apps/web/app/workspaces/page.tsx',
  'apps/web/app/w/[workspaceId]/page.tsx',
];

describe('30.043 every entry point links to /my-work', () => {
  it('30.043 control: the census sees the old template and the new literal, and ignores a lookalike', () => {
    expect(OLD_DOOR.test('router.push(`/w/${workspaceId}/my-work`);')).toBe(true);
    expect(OLD_DOOR.test('href={`/w/${remembered.workspaceId}/my-work`}')).toBe(true);
    expect(NEW_DOOR.test('router.push("/my-work");')).toBe(true);
    expect(NEW_DOOR.test("const path = '/my-work';")).toBe(true);
    expect(NEW_DOOR.test('`/my-work?ticket=${id}`')).toBe(true);
    expect(NEW_DOOR.test("'/my-workshop'")).toBe(false);
  });

  it.each(ENTRY_POINTS)('30.043 %s names /my-work and builds no /w/<id>/my-work', (path) => {
    const source = read(path);
    expect(source).toMatch(NEW_DOOR);
    expect(source).not.toMatch(OLD_DOOR);
  });

  it('30.043 no file under apps/web/{app,src} or app-core/src builds the old path any more', async () => {
    const { execFileSync } = await import('node:child_process');
    const listed = execFileSync('git', ['ls-files', 'apps/web/app', 'apps/web/src', 'packages/app-core/src'], {
      cwd: REPO,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((file) => /\.(ts|tsx)$/.test(file));
    expect(listed.length).toBeGreaterThan(100);
    const offenders = listed.filter((file) => OLD_DOOR.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
