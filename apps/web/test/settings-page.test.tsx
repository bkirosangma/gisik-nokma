import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  // `AppNav` mounts `LastProjectNav`, which reads the route's project id to
  // know which project the bar is about (2026-09-18). A mock is a MODULE, not a
  // subset: leaving a member the component calls off it throws
  // `useParams is not a function` at render, which took all fourteen cases in
  // this file down together rather than failing one of them.
  useParams: () => ({}),
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
   * 10.72 — clicking `New type` does the same, with `typeId=new`.
   */
  it('clicking New type pushes typeId=new on the same route', async () => {
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

    const newButton = await screen.findByRole('button', { name: 'New type' });
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
   * 13.716 — switching auto-close OFF sends `null`, and that is NOT the same
   * payload as sending nothing.
   *
   * This is the client end of the task's correctness core. The projection
   * distinguishes "the claim named the field and set it to null" from "the claim
   * did not name the field" with a CASE; a form that omitted the key when the
   * switch was turned off would produce the second, and the workspace would stay
   * ON while the user watched the control they had just switched. So the
   * assertion is `null` by value AND the key being present.
   *
   * **The control changed on 2026-09-18 and the SEMANTICS did not.** Where this
   * clicked an `Off` checkbox (ticked = off), it now clicks a switch whose
   * `checked` means ON — so the gesture that produces `null` is the opposite
   * one. Case 13.895 pins that polarity directly; this case pins the payload it
   * produces.
   */
  it('13.716 switching auto-close off sends an explicit null, not an omitted key', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab('admin', SETTINGS, captured);

    await screen.findByLabelText('Auto-close after');
    await userEvent.click(screen.getByLabelText('Close tickets automatically'));
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

/**
 * Fix round, after the independent review. Two of these close SURVIVING MUTANTS
 * the reviewer proved live (`Off` coercion; the `invalid` gate) — a survivor is
 * evidence about the TESTS rather than about the code, and a docblock claiming a
 * property no test pins is the shape this series keeps recording.
 */
describe('13.718-13.720 the Workspace settings tab — what the review found unpinned', () => {
  /**
   * Re-declared rather than shared: the block above declares its own `SETTINGS`
   * INSIDE its `describe` callback, so it is not in scope here. The first run of
   * these cases failed with `Unable to find a label with the text of: Stale
   * after` — a ReferenceError inside the stub surfacing as a missing form, i.e.
   * a case failing for a reason unrelated to the property it names. The
   * auto-close `30` is what makes this the ON fixture; 13.719 below uses the OFF
   * one.
   */
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
  const OFF_SETTINGS = {
    staleDays: 3,
    dueSoonDays: 14,
    autoCloseAfterDays: null,
    provenance: null,
  };

  /**
   * 13.718 — **the form shows the SERVER's values after a save, even when the
   * server's answer differs from what was submitted.**
   *
   * This is the review's Important finding (F1) and it was a REAL defect, not a
   * false comment: the draft and the `Off` box are `useState` initialisers, which
   * React runs ONCE, so `onSaved`'s `settings.reload` gave the page new data and
   * the form kept rendering the user's stale draft. The page's own comment
   * promised "a projection that clamped, or a claim the engine adjusted, becomes
   * visible on this screen" — and it did not.
   *
   * The fixture is built so the divergence is VISIBLE, which is the whole point:
   * the second read answers `30` where the user submitted `14`. A form that
   * tracked the server shows 30; a form that kept its draft shows 14. The
   * assertion is on the server's number, so this case fails against the
   * pre-fix code and cannot pass for the wrong reason.
   */
  it('13.718 adopts the server values after a save, even when they differ from what was sent', async () => {
    const captured: SubmittedEvent[][] = [];
    const services = stubServices(
      {
        // First read: what the user sees and edits. Second read (after the
        // save): the server's own answer, deliberately DIFFERENT.
        getWorkspaceSettings: (() => {
          let call = 0;
          return async () => {
            call += 1;
            return call === 1 ? SETTINGS : { ...SETTINGS, autoCloseAfterDays: 30 };
          };
        })(),
      },
      {
        authoring: {
          listMembers: async () => rosterWhereIAm('admin'),
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

    const autoClose = await screen.findByLabelText('Auto-close after');
    await userEvent.clear(autoClose);
    await userEvent.type(autoClose, '14');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The submit happened…
    expect(captured).toHaveLength(1);
    expect(captured[0]?.[0]?.payload).toEqual({ autoCloseAfterDays: 14 });
    // …and the field now shows the SERVER'S 30, not the submitted 14.
    await waitFor(() => {
      expect(screen.getByLabelText('Auto-close after')).toHaveValue(30);
    });
  });

  /**
   * 13.719 — **turning auto-close off on a workspace that is ALREADY off is not
   * a change**, and Save stays disabled.
   *
   * The review proved this line unpinned by mutation (M9): making the off branch
   * claim `null` unconditionally left all 11 cases green, because every existing
   * fixture starts at `autoCloseAfterDays: 30` with the control UNTICKED. The
   * already-off workspace was never exercised. It is the state most workspaces
   * are in, since `null` is the default.
   *
   * The mutant was proved live rather than assumed harmless: on this fixture the
   * real code leaves Save disabled and the mutant enables it.
   *
   * **Updated for the switch (2026-09-18).** "Already off" now means the switch
   * mounts UNCHECKED — the inverse of the box this replaced, which mounted
   * ticked. That inversion is itself the assertion: a binding carried across
   * unchanged would mount it checked here and fail this line.
   */
  it('13.719 the switch is off on an already-off workspace, and toggling it is not a change', async () => {
    const captured: SubmittedEvent[][] = [];
    const services = stubServices(
      { getWorkspaceSettings: async () => OFF_SETTINGS },
      {
        authoring: {
          listMembers: async () => rosterWhereIAm('admin'),
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

    // The switch mounts OFF, because the workspace is already off.
    const autoCloseSwitch = await screen.findByLabelText('Close tickets automatically');
    expect(autoCloseSwitch).not.toBeChecked();
    expect(screen.getByLabelText('Auto-close after')).toBeDisabled();
    // Nothing has changed, so there is nothing to submit.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    // Turning it on and back off is still not a change.
    await userEvent.click(autoCloseSwitch);
    await userEvent.click(autoCloseSwitch);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(captured).toHaveLength(0);
  });

  /**
   * 13.720 — **an unparseable draft disables Save and submits nothing.**
   *
   * The reviewer proved the `invalid` gate unpinned by mutation (M12): removing
   * it from BOTH the `save()` early return and the button's `disabled` left all
   * 11 cases green, because no case ever constructed an invalid draft.
   *
   * The second half of the finding is why the docblock above the gate was
   * REWRITTEN rather than left alone: it claimed the user "sees that something
   * is wrong", and the reviewer measured that no alert appears — the only signal
   * is the greyed-out button. The comment now says that, because a comment
   * describing a signal the product does not emit is the same defect class as a
   * test asserting a property nothing pins.
   */
  it('13.720 an emptied number field disables Save and ingests nothing', async () => {
    const captured: SubmittedEvent[][] = [];
    const services = stubServices(
      { getWorkspaceSettings: async () => SETTINGS },
      {
        authoring: {
          listMembers: async () => rosterWhereIAm('admin'),
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

    const stale = await screen.findByLabelText('Stale after');
    await userEvent.clear(stale);
    // A change elsewhere does NOT rescue it: the form refuses to submit a claim
    // that silently omits the field the user emptied.
    await userEvent.clear(screen.getByLabelText('Auto-close after'));
    await userEvent.type(screen.getByLabelText('Auto-close after'), '14');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(captured).toHaveLength(0);
  });
});

/**
 * The 2026-09-18 restyle of the Workspace tab — owner's instruction: *"the
 * settings -> workspace tab, needs to be a better UI. also have an info icon
 * near the fields to give a brief explanation (hover/focus/click …). save
 * button on a new row. auto close on/off -> make it a radio rather than
 * checkbox (check the account page on the styling of the radio.) and be mindful
 * of the spacings."*
 *
 * The control question was settled by the owner after two wrong guesses: the
 * thing on `/account` is a SWITCH (`notifications-section.tsx:44-49`), not a
 * radio group — so `Off` became a switch, and the CSS behind it was extracted
 * into `@gisik-nokma/ui` rather than copied. Cases 13.899/13.900 (in
 * `packages/ui`) are the other half of that.
 *
 * What these four cases are FOR, said plainly: the switch INVERTS the polarity
 * of the control it replaced, and an inverted binding looks correct and saves
 * the opposite claim. So the polarity is pinned in both directions, and the
 * third state — a blank window — is pinned as neither of them.
 */
describe('13.895-13.898 the Workspace settings tab — the restyle', () => {
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
  const OFF_SETTINGS = { staleDays: 3, dueSoonDays: 14, autoCloseAfterDays: null, provenance: null };

  function renderTab(
    settings: typeof SETTINGS | typeof OFF_SETTINGS,
    captured: SubmittedEvent[][],
  ): void {
    const services = stubServices(
      { getWorkspaceSettings: async () => settings },
      {
        authoring: {
          listMembers: async () => rosterWhereIAm('admin'),
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
   * 13.895 — **the switch's CHECKED state means ON, which is the inverse of the
   * `Off` checkbox it replaced.**
   *
   * This is the case that exists because of the swap. The old control was a
   * checkbox labelled `Off` whose TICKED state meant off; the shared `Switch`
   * follows `/account`'s convention, where `checked` means ON. A binding carried
   * across unchanged — `checked={autoCloseOff}` — renders a control that looks
   * entirely correct and submits `null` for every workspace that is ON and a
   * number for every workspace that is OFF.
   *
   * Both directions are asserted rather than one, and the fixture is chosen to
   * make that discriminating: a workspace at `30` must mount CHECKED. The
   * inverted mutant mounts it unchecked and fails on the first line, where a
   * single "click then check the payload" case would pass against it half the
   * time — the same half-the-time blind spot `13.897`'s click path records.
   */
  it('13.895 the switch reads ON for a workspace that is on, and turning it off is what claims null', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab(SETTINGS, captured);

    const autoCloseSwitch = await screen.findByLabelText('Close tickets automatically');
    expect(autoCloseSwitch).toBeChecked();
    // ON means the window is a real, editable number.
    expect(screen.getByLabelText('Auto-close after')).toBeEnabled();

    await userEvent.click(autoCloseSwitch);
    expect(autoCloseSwitch).not.toBeChecked();
    // OFF means the window is not editable — the claim is that there is no
    // window, so offering a number field beside it would be a lie.
    expect(screen.getByLabelText('Auto-close after')).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(captured).toHaveLength(1);
    expect(captured[0]?.[0]?.payload).toEqual({ autoCloseAfterDays: null });
  });

  /**
   * 13.896 — **the blank window is a THIRD state, and it is neither "off" nor a
   * window.**
   *
   * The old docblock's whole reason for a separate control was that `null`
   * ("off") and `''` ("not filled in yet") are different, and that a blank
   * number box cannot tell them apart. Turning the switch ON over a blank box
   * must not resolve that ambiguity by fiat: it leaves the box blank, sends
   * nothing, and keeps Save disabled. A third switch position, or a blank box
   * silently read as "off", would each destroy the distinction the control
   * exists to carry.
   */
  it('13.896 switching ON over a blank window is not a claim — nothing is sent and Save stays disabled', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab(OFF_SETTINGS, captured);

    const autoCloseSwitch = await screen.findByLabelText('Close tickets automatically');
    expect(autoCloseSwitch).not.toBeChecked();
    const window = screen.getByLabelText('Auto-close after');
    expect(window).toBeDisabled();
    expect(window).toHaveValue(null);

    await userEvent.click(autoCloseSwitch);

    // ON, and the field is now editable — but still EMPTY.
    expect(autoCloseSwitch).toBeChecked();
    expect(window).toBeEnabled();
    expect(window).toHaveValue(null);
    // Empty is not a window, so there is no complete claim on this field and
    // nothing to submit. Note the polarity here: the switch is ON, and the
    // absence of a number does NOT make it off.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(captured).toHaveLength(0);
  });

  /**
   * 13.897 — **the info icon opens on hover, on focus and on click.**
   *
   * All three were asked for by name, so all three are asserted separately: any
   * one of them alone would leave the other two untested, and the CLICK path in
   * particular is the one a plausible implementation gets wrong — a click
   * focuses the button first, so a toggling `onClick` reads the state `onFocus`
   * has just set and closes the panel straight away.
   */
  it('13.897 each field has an info icon that opens on hover, on focus and on click, and closes on Escape', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab(SETTINGS, captured);

    await screen.findByLabelText('Stale after');
    const trigger = screen.getByRole('button', { name: 'About Stale after' });
    // Closed to begin with — otherwise "it opened" is unmeasurable.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('note')).toBeNull();

    await userEvent.hover(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent('active state');
    await userEvent.unhover(trigger);
    expect(screen.queryByRole('note')).toBeNull();

    // FOCUS — the keyboard path, which hover cannot cover.
    act(() => trigger.focus());
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('note')).toBeNull();

    // CLICK — see the docblock for why this is not redundant with focus.
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent('active state');

    // Every field has one, and each names what IT explains — three buttons all
    // called "About" would be a single accessible name for three different
    // disclosures, which is the ambiguity the field labels already avoid.
    expect(screen.getByRole('button', { name: 'About Due soon within' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About Auto-close after' })).toBeInTheDocument();
  });

  /**
   * 13.898 — **Save is on its own row below the fields, not a fourth control in
   * the field column.**
   *
   * Asserted as a RELATIONSHIP rather than by class name: the row must not be
   * inside `.gn-workspace-settings__fields`, and it must be a sibling of it
   * under the same card. A rule that merely renamed the wrapper would satisfy a
   * "has class X" assertion and fail this one — and "on a new row" is the
   * owner's actual instruction.
   */
  it('13.898 Save sits on its own row, outside the field column', async () => {
    const captured: SubmittedEvent[][] = [];
    renderTab(SETTINGS, captured);

    const save = await screen.findByRole('button', { name: 'Save' });
    const row = save.closest('.gn-workspace-settings__actions');
    expect(row, 'Save is not inside a row of its own').not.toBeNull();
    // The discriminating half: a Save left inside the column would still be
    // found by `closest('.gn-workspace-settings__actions')` if a wrapper had
    // been added AROUND each field.
    expect(row!.closest('.gn-workspace-settings__fields'), 'Save is inside the field column').toBeNull();

    const card = row!.parentElement;
    expect(card?.querySelector('.gn-workspace-settings__fields')).not.toBeNull();
    expect(card?.className).toContain('gn-workspace-settings__card');
  });
});
