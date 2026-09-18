import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceMember } from '@gisik-nokma/app-core';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The ticket-type editor is inlined on `/settings` (owner feedback,
 * 2026-09-09: "the ticket type edit is opening in a separate route. it
 * should open directly in the same route, same as the prototype").
 *
 * Two things a looser check would miss:
 *
 * - "the editor appears" is true on a separate route too — the assertion
 *   that actually discriminates is the PUSHED URL's pathname staying at
 *   `/settings`, and the rendered sidebar (`nav[aria-label="Settings
 *   sections"]`) staying mounted alongside the form.
 * - `typeId` is a THIRD query param layered under `tab=ticket-types`
 *   (`app/settings/page.tsx`'s own docblock on `typeEditHref`), read only
 *   inside that tab's branch so the Workflows/MCP tokens sidebar links can
 *   never resurrect a stale editor. The last case here pins that directly:
 *   a `typeId` left over in the query is inert on any other tab.
 */

const push = vi.fn();
const WORKSPACE = '01J9WORKSPACE0000000000000';
const ME = '01J9USER000000000000000000';

const { query } = vi.hoisted(() => ({ query: { current: new URLSearchParams() } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/settings',
  useSearchParams: () => query.current,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import SettingsPage from '../app/settings/page.js';

function rosterWhereIAm(role: WorkspaceMember['role']): WorkspaceMember[] {
  return [{ userId: ME, displayName: 'Anselma Marak', role }];
}

const TYPES = [{ id: 'defect', name: 'Defect', icon: 'flag', rank: 2, workflowId: 'wf-1', fields: [] }];
const WORKFLOWS = [
  { id: 'wf-1', version: 1, name: 'Delivery v4', initialStateId: 's1', states: [], transitions: [] },
];

function setQuery(pairs: Record<string, string>): void {
  query.current = new URLSearchParams(pairs);
}

afterEach(() => {
  push.mockClear();
  query.current = new URLSearchParams();
});

describe('the ticket-type editor is inlined on /settings, not a separate route', () => {
  /**
   * 10.71 — clicking `Edit <type>` on `/settings` pushes a URL whose PATHNAME stays `/settings` and carries `typeId` — the assertion that discriminates the fix from "an editor appeared somewhere", which the old separate-route push would satisfy too.
   */
  it('clicking Edit on a ticket type pushes a URL that stays on /settings and carries typeId', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    const editButton = await screen.findByRole('button', { name: 'Edit Defect' });
    await userEvent.click(editButton);

    expect(push).toHaveBeenCalledTimes(1);
    const pushed = new URL(String(push.mock.calls[0]?.[0]), 'https://example.test');
    // The assertion that DISCRIMINATES: "an editor appeared somewhere" would
    // pass just as well against the old separate-route push. Staying on this
    // pathname is the actual fix.
    expect(pushed.pathname).toBe('/settings');
    expect(pushed.searchParams.get('tab')).toBe('ticket-types');
    expect(pushed.searchParams.get('typeId')).toBe('defect');
  });

  /**
   * 10.72 — clicking `New ticket type` does the same, with `typeId=new`.
   */
  it('clicking New ticket type pushes typeId=new on the same route', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    const newButton = await screen.findByRole('button', { name: 'New ticket type' });
    await userEvent.click(newButton);

    const pushed = new URL(String(push.mock.calls[0]?.[0]), 'https://example.test');
    expect(pushed.pathname).toBe('/settings');
    expect(pushed.searchParams.get('typeId')).toBe('new');
  });

  /**
   * 10.73 — a `typeId` in the query renders the editor WITH the settings sidebar still present (`nav[aria-label="Settings sections"]`) — "still inside the shell" is the claim under test, and the form alone is not proof of that.
   */
  it('a typeId in the query renders the editor WITH the settings sidebar still present', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types', typeId: 'defect' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(await screen.findByRole('textbox', { name: 'Type name' })).toBeInTheDocument();
    // "Still inside the shell" is the claim under test — the form alone is
    // not proof of that; a separate route renders the same form. Scoped to
    // the sidebar itself: the pane's OWN "Ticket types" breadcrumb carries
    // the same accessible name, so an unscoped query is ambiguous.
    const sidebar = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(sidebar).getByRole('link', { name: 'Ticket types' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: 'Workflows' })).toBeInTheDocument();
  });

  /**
   * 10.74 — `typeId=new` opens a blank editor inline, the same shape as editing an existing type.
   */
  it('typeId=new opens a blank editor inline, same shape as an existing type', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types', typeId: 'new' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => [],
              listWorkflows: async () => [],
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(await screen.findByRole('heading', { name: 'New ticket type', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
  });

  /**
   * 10.75 — CONTROL carrying 10.67's milder gate into the inline pane: a MEMBER hitting `typeId=new` inline still gets the read-only sentence and a link back, never a blank form.
   */
  it('a MEMBER hitting typeId=new inline still gets the read-only sentence, not a blank form', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types', typeId: 'new' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('member'),
              listTicketTypes: async () => [],
              listWorkflows: async () => [],
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(
      await screen.findByRole('link', { name: 'Back to the ticket types' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Type name' })).not.toBeInTheDocument();
  });

  /**
   * 10.76 — a `typeId` left over in the query from a prior visit is INERT on any other tab (`tab=workflows`) — read only inside the `tab === 'ticket-types'` branch, so the sidebar's links can never resurrect a stale editor.
   */
  it('a leftover typeId is inert on any OTHER tab — the sidebar links never carry it forward', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'workflows', typeId: 'defect' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(await screen.findByRole('heading', { name: 'Workflows', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Type name' })).not.toBeInTheDocument();
  });
});

/**
 * IMPORTANT 3 (Task 7 fix round 1) — same gap as the workspace-home case:
 * the CSS-scan tests for `.gn-workspace-list__role--pinned` only prove the
 * RULE exists, never that THIS page's workspace-name subtitle carries it.
 * `getMyWorkspaces` is left un-stubbed by every other case in this file
 * (`useWorkspaceName` then fails silently and the subtitle never renders at
 * all), so this is the one case in the file that has to stub it.
 */
describe('the workspace-name subtitle keeps its pinned size (ROUTED 3)', () => {
  it('carries both the base role class and the pinned-size modifier', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types' });
    render(
      <Providers
        services={stubServices(
          {
            getMyWorkspaces: async () => [
              {
                id: WORKSPACE,
                name: 'Garo Hills Logistics',
                role: 'admin',
                memberCount: 1,
                nameRestrictedProjectCount: 0,
                projects: [],
              },
            ],
          },
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    // `{ selector: '.gn-workspace-list__role' }` disambiguates from `AppNav`'s
    // OWN workspace-name nav link — it reads the same `useWorkspaceName` hook
    // and renders the identical text as an `<a>`, so a bare `getByText` here
    // matches two elements once the fixture actually resolves a name.
    const subtitle = await screen.findByText('Garo Hills Logistics', {
      selector: '.gn-workspace-list__role',
    });
    expect(subtitle).toHaveClass('gn-workspace-list__role', 'gn-workspace-list__role--pinned');
  });
});

/**
 * Second wave, Task 6 — the `/settings?tab=workspace` tab.
 *
 * The task's plan named this as `13.629`; that id was taken, so these are
 * `13.716` (the block `13.700`–`13.759` is this executor's, and `13.713`–`13.712`
 * were already minted by Tasks 5 and 6's own domain/projection/mapper cases).
 *
 * What these cases are FOR, said plainly: the form is the first surface in the
 * product that can set `autoCloseAfterDays`, and the one thing it must get right
 * is that `null` — "off" — is a value it can send, distinct from "leave it
 * alone". The partial-update assertion below ("and NOTHING else") is the other
 * half: a form that re-sent all three knobs on every save would silently reset
 * whichever ones the user did not touch, and the projection's CASE cannot save
 * it, because a claim that names a knob with its OLD value is a real claim.
 */
describe('13.716 the Workspace settings tab', () => {
  const SETTINGS = {
    staleDays: 3,
    dueSoonDays: 14,
    autoCloseAfterDays: 30,
    provenance: {
      actorId: ME,
      actorName: 'Anselma Marak',
      clientTime: '2026-09-18T04:00:00.000Z',
      serverTime: '2026-09-18T04:00:01.000Z',
    },
  };

  /**
   * A `Providers` tree whose data source CAPTURES ingests and answers them
   * `committed`, so a case can assert what the form submitted AND that the
   * form's own success path ran. The stock `stubServices` data source answers
   * `[]`, which the form (correctly, per Ruling 27) reads as silence rather
   * than as success — so a case that asserted on the captured call alone would
   * never exercise `onSaved`.
   */
  function renderTab(
    role: WorkspaceMember['role'],
    settings: typeof SETTINGS | null,
    captured: SubmittedEvent[][],
  ): void {
    const services = stubServices(
      {
        getWorkspaceSettings: async () => settings ?? SETTINGS,
      },
      {
        authoring: {
          listMembers: async () => rosterWhereIAm(role),
          listTicketTypes: async () => TYPES,
          listWorkflows: async () => WORKFLOWS,
        },
      },
    );
    const dataSource = {
      ...services.dataSource,
      ingest: async (events: SubmittedEvent[]) => {
        captured.push(events);
        return events.map((event) => ({
          status: 'committed' as const,
          eventId: event.id,
          seq: 1,
          serverTime: '2026-09-18T04:00:02.000Z',
        }));
      },
    };
    setQuery({ workspaceId: WORKSPACE, tab: 'workspace' });
    render(
      <Providers services={{ ...services, dataSource }}>
        <SettingsPage />
      </Providers>,
    );
  }

  /**
   * 13.716 — the tab renders all three knobs with the SERVER's current values,
   * the sidebar link marks itself `aria-current`, and Save is disabled until
   * something actually changes (the schema refuses the empty claim, so an
   * enabled no-op Save would be a button whose only outcome is a refusal).
   */
  it('13.716 renders the three knobs at their current values and disables Save until something changes', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab('admin', SETTINGS, captured);

    expect(await screen.findByLabelText('Stale after')).toHaveValue(3);
    expect(screen.getByLabelText('Due soon within')).toHaveValue(14);
    expect(screen.getByLabelText('Auto-close after')).toHaveValue(30);

    // The sidebar link exists and is the current page — the shell's own claim.
    const link = screen.getByRole('link', { name: 'Workspace' });
    expect(link).toHaveAttribute('aria-current', 'page');

    // Nothing typed yet: Save is inert, and nothing was submitted.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(captured).toHaveLength(0);
  });

  /**
   * 13.716 — changing ONLY `Auto-close after` and saving ingests exactly ONE
   * `workspace.settings_set` whose payload carries `autoCloseAfterDays` and
   * NOTHING else.
   *
   * "And nothing else" is the assertion that matters. A form that echoed the
   * other two knobs back would submit `{staleDays: 3, dueSoonDays: 14,
   * autoCloseAfterDays: 14}`, which the projection would apply faithfully — so
   * the bug would be invisible in the row it wrote and would only surface when
   * two people edited different knobs at once.
   */
  it('13.716 saving only the auto-close change ingests one claim carrying that field alone', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab('admin', SETTINGS, captured);

    const autoClose = await screen.findByLabelText('Auto-close after');
    await userEvent.clear(autoClose);
    await userEvent.type(autoClose, '14');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByLabelText('Auto-close after');
    expect(captured).toHaveLength(1);
    const batch = captured[0] ?? [];
    expect(batch).toHaveLength(1);
    const event = batch[0]!;
    expect(event.type).toBe('workspace.settings_set');
    expect(event.entity).toEqual({ kind: 'workspace', id: WORKSPACE });
    // EXACTLY the one key that changed. `toEqual` on the whole payload is what
    // makes "nothing else" a measurement rather than a hope.
    expect(event.payload).toEqual({ autoCloseAfterDays: 14 });
  });

  /**
   * 13.716 — ticking `Off` sends `null`, and that is NOT the same payload as
   * sending nothing.
   *
   * This is the client end of the task's correctness core. The projection
   * distinguishes "the claim named the field and set it to null" from "the claim
   * did not name the field" with a CASE; a form that omitted the key when Off
   * was ticked would produce the second, and the workspace would stay ON while
   * the user watched the box they just ticked. So the assertion is `null` by
   * value AND the key being present.
   */
  it('13.716 ticking Off sends an explicit null, not an omitted key', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab('admin', SETTINGS, captured);

    await screen.findByLabelText('Auto-close after');
    await userEvent.click(screen.getByLabelText('Off'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByLabelText('Auto-close after');
    expect(captured).toHaveLength(1);
    const event = captured[0]?.[0];
    expect(event).toBeDefined();
    expect(event!.payload).toEqual({ autoCloseAfterDays: null });
    // Present-with-null, not omitted: the same distinction the projection's CASE
    // consumes. `toEqual({autoCloseAfterDays: null})` above would already fail
    // on `{}`, so this pins the VALUE rather than the key's existence alone.
    expect(Object.hasOwn(event!.payload as object, 'autoCloseAfterDays')).toBe(true);
  });

  /**
   * 13.716 — a member sees the values read-only, with the sentence that says
   * why, and NO Save control at all.
   *
   * The absence of the button is asserted rather than a disabled one shown:
   * `check-permission.ts:582` refuses this event from a non-admin, and offering
   * a control whose only outcome is a refusal teaches a user that the product
   * is broken rather than that they lack the role.
   */
  it('13.716 a member sees the current values read-only, with no Save', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab('member', SETTINGS, captured);

    // The values are still SHOWN — the honest thing to show someone who cannot
    // change a setting is the setting.
    expect(await screen.findByLabelText('Stale after')).toHaveValue(3);
    expect(screen.getByLabelText('Due soon within')).toHaveValue(14);
    expect(screen.getByLabelText('Auto-close after')).toHaveValue(30);

    expect(
      screen.getByText('Only a workspace admin can change these.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(captured).toHaveLength(0);
  });
});
