import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceMember } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { AuthoringReadRefused } from '../src/authoring/data-source-gateway.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * # The two `new` routes, and the role gate the coordination doc assigned here
 *
 * `TemplateGallery` takes no session and applies no role check — `props.onPick`
 * is unconditional. Inside `app-core` nothing can reach it but a list screen's
 * `onNew`, which is `canAuthor ? … : null`. The exposure is a ROUTE, recorded
 * against "Plan 8 Task 13" and closed in the same commit as the pages.
 *
 * Every case here comes in a PAIR: the thing that must be absent for a member,
 * and the SAME thing present for an admin in the same file. A `not.toBeInTheDocument()`
 * on its own passes just as well against a page that never had the element, or
 * against a typo — which is the check that cannot fail.
 *
 * `Providers` is the REAL one with stub services injected, so `useAppServices`,
 * `useSessionStatus` and `useBuilderWiring` are all under test rather than
 * replaced by the harness.
 */

const push = vi.fn();
const WORKSPACE = '01J9WORKSPACE0000000000000';
const ME = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE }),
  usePathname: () => `/w/${WORKSPACE}/settings/workflows/new`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import NewWorkflowPage from '../app/w/[workspaceId]/settings/workflows/new/page.js';
import NewTicketTypePage from '../app/w/[workspaceId]/settings/ticket-types/new/page.js';
import WorkflowsPage from '../app/w/[workspaceId]/settings/workflows/page.js';

afterEach(() => {
  push.mockClear();
});

/** The roster the wiring reads the caller's OWN role out of. */
function rosterWhereIAm(role: WorkspaceMember['role']): WorkspaceMember[] {
  return [
    { userId: ME, displayName: 'Anselma Marak', role },
    { userId: '01J9USER111111111111111111', displayName: 'Bikash Sangma', role: 'admin' },
  ];
}

const READ_ONLY_COPY =
  'You can look, not touch — only a workspace owner or admin can change workflows and ticket types.';

describe('the template gallery is a route-level authoring entry point, and a member is not offered it', () => {
  it('a MEMBER typing /settings/workflows/new gets the read-only sentence and no gallery', async () => {
    render(
      <Providers
        services={stubServices({}, { authoring: { listMembers: async () => rosterWhereIAm('member') } })}
      >
        <NewWorkflowPage />
      </Providers>,
    );

    expect(await screen.findByText(READ_ONLY_COPY)).toBeInTheDocument();
    // Named in advance, both halves of the gallery: the template cards and the
    // blank-start button. Neither may be on screen.
    expect(screen.queryByRole('button', { name: /^Use this template/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start blank' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the workflows' })).toBeInTheDocument();
  });

  it('CONTROL — an ADMIN gets exactly those buttons on the same page', async () => {
    render(
      <Providers
        services={stubServices({}, { authoring: { listMembers: async () => rosterWhereIAm('admin') } })}
      >
        <NewWorkflowPage />
      </Providers>,
    );

    expect(await screen.findByRole('button', { name: 'Start blank' })).toBeInTheDocument();
    // Printed, not counted: a failure names the templates that went missing.
    const templates = screen
      .getAllByRole('button', { name: /^Use this template/ })
      .map((node) => node.getAttribute('aria-label'));
    expect(templates.length).toBeGreaterThan(0);
    expect(screen.queryByText(READ_ONLY_COPY)).not.toBeInTheDocument();
  });

  it('a MEMBER typing /settings/ticket-types/new gets the sentence and no editor form', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('member'),
              // Stubbed and never reached: the editor screen's mount effect
              // calls both, so leaving them un-stubbed would let a REJECTION
              // produce the same blank screen the gate produces, and the case
              // would pass for the wrong reason.
              listWorkflows: async () => [],
              listTicketTypes: async () => [],
            },
          },
        )}
      >
        <NewTicketTypePage />
      </Providers>,
    );

    expect(await screen.findByText(READ_ONLY_COPY)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Type name' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the ticket types' })).toBeInTheDocument();
  });

  it('CONTROL — an ADMIN gets the editor form on the same page', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listWorkflows: async () => [],
              listTicketTypes: async () => [],
            },
          },
        )}
      >
        <NewTicketTypePage />
      </Providers>,
    );

    expect(await screen.findByRole('textbox', { name: 'Type name' })).toBeInTheDocument();
    expect(screen.queryByText(READ_ONLY_COPY)).not.toBeInTheDocument();
  });
});

/**
 * The wiring's third arm. A role that could not be READ is not a role, and the
 * tempting default — treat them as a member and show read-only — would put a
 * banner saying "you may not change this" in front of an owner on the strength
 * of a 500.
 */
describe('a role read that FAILS is a refusal on screen, never a quietly read-only page', () => {
  it('a rejected roster read renders the cause’s own words and mounts no screen', async () => {
    render(
      <Providers
        services={stubServices(
          {},
          { authoring: { listMembers: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/x/members')) } },
        )}
      >
        <WorkflowsPage />
      </Providers>,
    );

    // Awaited on the REFUSAL's own words, not on `role="status"`: the loading
    // arm is also a status, so `findByRole('status')` resolves on the spinner
    // and the case would assert against the wrong element.
    const refusal = await screen.findByText(/cannot be shown yet/);
    expect(refusal.closest('p')).toHaveTextContent('Your role in this workspace cannot be shown yet.');
    expect(refusal.closest('p')).toHaveTextContent('HTTP 500 for /v1/workspaces/x/members');
    // The pair: the screen that would otherwise stand in its place is absent.
    expect(screen.queryByRole('heading', { name: 'Workflows', level: 2 })).not.toBeInTheDocument();
  });

  it('CONTROL — the SAME refusal shape, but the one the door really sends, is a GUEST and not a failure', async () => {
    // `AuthoringReadRefused` is what the adapter throws for a 404, which is what
    // the no-guests door answers a guest. That one IS an answer: read-only.
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: () => Promise.reject(new AuthoringReadRefused('/v1/workspaces/x/members')),
              listWorkflows: async () => [],
            },
          },
        )}
      >
        <WorkflowsPage />
      </Providers>,
    );

    expect(await screen.findByText(READ_ONLY_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/cannot be shown yet/)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument();
    });
  });
});
