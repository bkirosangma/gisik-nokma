import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ts from 'typescript';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspacesPage from '../app/workspaces/page.js';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Prefixes/groups Task 8 — Create workspace, Create project and Create ticket are
 * primary icon buttons that open their forms (cases 22.150–22.155).
 *
 * ## WHAT COULD MAKE EVERY CASE IN THIS FILE PASS FOR THE WRONG REASON
 *
 * 1. **A button that is named right but is not the primary.** Each case counts
 *    `.gn-button--primary` in the region the button lives in, so a second primary
 *    (or the old one left beside the new) reddens it.
 * 2. **A form that is "behind" a button but still rendered.** 22.151/22.152 assert
 *    the form's own inputs are ABSENT before the click and PRESENT inside the
 *    `dialog` after it — absence alone would pass an empty page.
 * 3. **A source grep over prose.** 22.155 walks the TypeScript AST and reads only
 *    string literals, template literals and JSX text, so a docblock that still
 *    mentions "Add a ticket" is not a failure and a user-visible one is.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const KIRO = '01J9USER000000000000000000';

// One mutable route so the three pages share a file: `useParams` is read at render.
const route = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  path: '/workspaces',
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => route.params,
  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: KIRO, name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

beforeEach(() => {
  cleanup();
  push.mockClear();
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
});

const COMMITTED = (event: SubmittedEvent): IngestResult => ({
  status: 'committed',
  eventId: event.id,
  seq: 1,
  serverTime: '2026-10-02T10:00:00.000Z',
});

function workspaceAs(role: string, projects: WorkspaceRef['projects']): WorkspaceRef {
  return {
    id: WORKSPACE,
    name: 'Convenience Corner',
    prefix: 'CC',
    role,
    archived: false,
    memberCount: 5,
    nameRestrictedProjectCount: 0,
    projects,
  };
}

const SHOP = {
  id: 'p1',
  name: 'Shop operations',
  prefix: 'SO',
  archived: false,
  ticketCount: 9,
  blockedCount: 3,
};

function mountHome(
  role: string,
  projects: WorkspaceRef['projects'] = [SHOP],
  ingest: (event: SubmittedEvent) => IngestResult = COMMITTED,
) {
  route.params = { workspaceId: WORKSPACE };
  route.path = `/w/${WORKSPACE}`;
  const services = stubServices({
    getMyWorkspaces: async () => [workspaceAs(role, projects)],
    getGroups: async () => [],
  });
  services.dataSource.ingest = async (events) => events.map(ingest);
  render(
    <Providers services={services}>
      <WorkspaceHomePage />
    </Providers>,
  );
}

const iconsIn = (el: Element) => el.querySelectorAll('svg[aria-hidden="true"]');

describe('22.150 the project page’s Create ticket is a primary icon button', () => {
  const TYPES = [
    { id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand', fields: [] },
  ] as unknown as TicketTypeDef[];

  it('is named exactly "Create ticket", carries one icon, is the header’s only primary, and opens a dialog of the same name', async () => {
    route.params = { workspaceId: WORKSPACE, projectId: PROJECT };
    route.path = `/w/${WORKSPACE}/p/${PROJECT}`;
    render(
      <Providers
        services={stubServices({
          getTickets: async () => ({ projectId: PROJECT, rows: [] }),
          getTicketTypes: async () => TYPES,
          getMyWorkspaces: async () => [
            workspaceAs('owner', [{ ...SHOP, id: PROJECT, name: 'Errand tracking', prefix: 'ET' }]),
          ],
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    const create = await screen.findByRole('button', { name: 'Create ticket' });
    expect(create).toHaveClass('gn-button--primary');
    expect(iconsIn(create)).toHaveLength(1);
    const header = document.querySelector('.gn-project__header');
    expect(header).not.toBeNull();
    // The ONLY primary in the header — a second one (mutation: two primaries) reddens this.
    expect(header!.querySelectorAll('.gn-button--primary')).toHaveLength(1);
    expect(header!.contains(create)).toBe(true);
    // The old name is gone.
    expect(screen.queryByRole('button', { name: 'New ticket' })).toBeNull();

    // CONTROL (the existing flow): pressing it opens the dialog, titled "Create ticket".
    await userEvent.click(create);
    expect(await screen.findByRole('dialog', { name: 'Create ticket' })).toBeInTheDocument();
  });
});

describe('22.151 /workspaces: Create workspace is a primary icon button that opens the founding dialog', () => {
  it('shows the button in the header row and NO always-visible form; the dialog carries name + prefix and founds the workspace', async () => {
    route.params = {};
    route.path = '/workspaces';
    const founded: Array<[string, string | undefined]> = [];
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          {
            founding: {
              foundWorkspace: async (name, prefix) => {
                founded.push([name, prefix]);
                return { workspaceId: WORKSPACE };
              },
            },
          },
        )}
      >
        <WorkspacesPage />
      </Providers>,
    );
    const head = await waitForHead();
    const button = within(head).getByRole('button', { name: 'Create workspace' });
    expect(button).toHaveClass('gn-button--primary');
    expect(iconsIn(button)).toHaveLength(1);
    // No always-visible founding form: no heading, no inputs, no second button of this name.
    expect(screen.queryByRole('heading', { name: 'New workspace' })).toBeNull();
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.queryByLabelText('Prefix (optional)')).toBeNull();
    expect(document.querySelector('.gn-workspace-founding')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Create workspace' })).toHaveLength(1);

    // CONTROL: the button opens the dialog and the dialog's own submit founds the workspace.
    await userEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Create workspace' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Convenience Corner');
    await userEvent.type(within(dialog).getByLabelText('Prefix (optional)'), 'cc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}`));
    expect(founded).toEqual([['Convenience Corner', 'CC']]);
  });
});

async function waitForHead(): Promise<HTMLElement> {
  return await vi.waitFor(() => {
    const head = document.querySelector<HTMLElement>('.gn-workspaces__head');
    if (head === null) throw new Error('no .gn-workspaces__head yet');
    return head;
  });
}

describe('22.152 the workspace home: Create project is a primary icon button in the Projects heading row', () => {
  it('an admin sees the button, no always-visible form; the dialog carries name, description, prefix and the group slot', async () => {
    mountHome('admin');
    const row = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('.gn-workspace-home__projects-heading');
      if (found === null) throw new Error('no projects heading row yet');
      return found;
    });
    const button = within(row).getByRole('button', { name: 'Create project' });
    expect(button).toHaveClass('gn-button--primary');
    expect(iconsIn(button)).toHaveLength(1);
    // No always-visible "New project" row.
    expect(screen.queryByPlaceholderText('e.g. Phase 2 rollout')).toBeNull();
    expect(screen.queryByText('New project')).toBeNull();
    expect(document.querySelector('.gn-project-founding')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Create project' })).toHaveLength(1);

    // CONTROL: it opens a dialog titled "Create project" with the four things.
    await userEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Create project' });
    expect(within(dialog).getByPlaceholderText('e.g. Phase 2 rollout')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('e.g. Sprint work for the rollout')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('e.g. SO')).toBeInTheDocument();
    // The group slot is filled by the picker (P-T13, 22.240), not an empty marker.
    expect(await within(dialog).findByLabelText('Level 1 group')).toBeInTheDocument();
  });

  it('a non-admin sees no button, and the refusal line reads "Only an owner or admin can create a project."', async () => {
    mountHome('member');
    expect(await screen.findByText('Only an owner or admin can create a project.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create project' })).toBeNull();
  });
});

describe('22.156 a refusal of Create project is announced once, inside the dialog that is open', () => {
  it('while the dialog is open exactly one role=alert carries the refusal and it is inside the dialog; once it closes the page’s own alert shows it', async () => {
    const REFUSED = (event: SubmittedEvent): IngestResult => ({
      status: 'refused',
      eventId: event.id,
      rule: 'project.prefix-taken',
      reason: 'that prefix is already in use',
    });
    mountHome('admin', [SHOP], REFUSED);
    const heading = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('.gn-workspace-home__projects-heading');
      if (found === null) throw new Error('no projects heading row yet');
      return found;
    });
    await userEvent.click(within(heading).getByRole('button', { name: 'Create project' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create project' });
    await userEvent.type(within(dialog).getByPlaceholderText('e.g. Phase 2 rollout'), 'Phase 2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    const text = 'project.prefix-taken: that prefix is already in use';
    await within(dialog).findByText(text);
    // ONE alert in the whole document, and it is the dialog's.
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(dialog).toContainElement(alerts[0]!);
    expect(alerts[0]).toHaveTextContent(text);

    // CONTROL: closing the dialog hands the same refusal to the page's own alert.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const after = screen.getAllByRole('alert');
    expect(after).toHaveLength(1);
    expect(after[0]).toHaveTextContent(text);
  });
});

describe('22.153 the empty state invites the first project without pointing "below"', () => {
  it('reads "No projects yet. Create the first one." for an admin of an empty workspace', async () => {
    mountHome('owner', []);
    const empty = await screen.findByText('No projects yet. Create the first one.');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).not.toMatch(/below/);
    // CONTROL: the button the sentence points at is there.
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });
});

/**
 * 22.155 (BRD-19) — one action, one name. The create-ticket flow's entry points all
 * say "Create ticket": the header button, the empty board's banner, the empty
 * column's button, the dialog's title and the dialog's submit.
 *
 * Read from the SOURCE through the TypeScript AST, so prose (docblocks, comments)
 * is never counted and only what a person can read in the product is.
 */
describe('22.155 every create-ticket entry point says "Create ticket"', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const ROOT = resolve(HERE, '../../..');

  const sourcesUnder = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === 'node_modules' || name === '.next' || name === 'dist') return [];
      if (statSync(path).isDirectory()) return sourcesUnder(path);
      return /\.tsx?$/.test(name) && !/\.generated\.ts$/.test(name) ? [path] : [];
    });

  /** Every string a person could read: literals, no-substitution templates, JSX text. */
  const visibleStrings = (path: string): string[] => {
    const text = readFileSync(path, 'utf8');
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const walk = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push(node.text);
      else if (ts.isJsxText(node)) found.push(node.text.replace(/\s+/g, ' ').trim());
      ts.forEachChild(node, walk);
    };
    walk(file);
    return found.filter((s) => s !== '');
  };

  const APP_CORE = join(ROOT, 'packages/app-core/src');
  const WEB = [join(ROOT, 'apps/web/app'), join(ROOT, 'apps/web/src')];
  const files = [APP_CORE, ...WEB].flatMap(sourcesUnder);
  const rel = (p: string) => p.slice(ROOT.length + 1);

  it('no source string says "Add a ticket", "Create a ticket", "New ticket" (the object, not "New ticket type") or a bare "Create" submit', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const s of visibleStrings(file)) {
        const bare = s === 'Create' && /new-ticket-dialog/.test(file);
        if (/Add a ticket|Create a ticket|New ticket(?! type)/.test(s) || bare) {
          offenders.push(`${rel(file)}: ${JSON.stringify(s)}`);
        }
      }
    }
    expect(offenders).toEqual([]);

    // CONTROL, same `it`: the scan is not blind — it reads the entry points it is about.
    const count = (suffix: string, wanted: string) =>
      visibleStrings(join(ROOT, suffix)).filter((s) => s === wanted).length;
    expect(count('packages/app-core/src/views/create-ticket-flow.tsx', 'Create ticket')).toBeGreaterThanOrEqual(1);
    expect(count('packages/app-core/src/views/new-ticket-dialog.tsx', 'Create ticket')).toBeGreaterThanOrEqual(2); // title + submit
    expect(count('packages/app-core/src/views/board.tsx', 'Create ticket')).toBeGreaterThanOrEqual(2); // banner + column
  });
});
