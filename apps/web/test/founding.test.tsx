import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundingError } from '@gisik-nokma/app-core/online';
import WorkspacesPage from '../app/workspaces/page.js';
import { Providers } from '../src/providers.js';
import { stubServices, type GatewayStubs } from './helpers/stub-services.js';

/**
 * The founding screen (Plan 6 Task 15b, item 1). Cases 3.124–3.128.
 *
 * `POST /v1/workspaces` — `apps/server/src/routes/workspaces.ts:74`, Plan 4
 * Task 13's door.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } },
      isPending: false,
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

function mount(founding: GatewayStubs['founding'], workspaces?: () => Promise<never> | Promise<[]>) {
  render(
    <Providers
      services={stubServices(
        workspaces === undefined ? {} : { getMyWorkspaces: workspaces },
        { founding },
      )}
    >
      <WorkspacesPage />
    </Providers>,
  );
}

beforeEach(() => push.mockClear());

/**
 * 3.124 THE PLANTED DEFECT THIS FILE EXISTS FOR.
 *
 * The natural place for a founding form is inside the empty-state arm — "no
 * workspaces yet, make one". Against the shipped server that arm is
 * UNREACHABLE: `getMyWorkspaces` is one of the refusing reads (four of them
 * since ruling P25 clause 1; this is still one), so the page
 * resolves to the refusal branch every time, and a form nested in the empty arm
 * would be a form nobody could ever open. The person who cannot be told which
 * workspaces they are in is exactly the person who most needs to found one.
 */
describe('3.124 the founding form is reachable when the workspace list REFUSES', () => {
  it('renders the form beside the refusal, not instead of it', async () => {
    mount({});
    // The refusal is on screen — the default stub refuses `getMyWorkspaces`
    // with the REAL serving-gap table.
    expect(await screen.findByRole('status')).toHaveTextContent('cannot be shown yet');
    // …and so is the form.
    expect(screen.getByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeInTheDocument();
  });

  it('3.125 the empty state offers the second sentence it always needed', async () => {
    mount({}, async () => []);
    const empty = await screen.findByText(/No workspaces yet/);
    expect(empty).toHaveTextContent('Ask an admin for an invite link — or create your own.');
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeInTheDocument();
  });
});

describe('3.126 founding — the happy path', () => {
  it('posts the name and routes the founder into their new workspace', async () => {
    const names: string[] = [];
    mount({
      foundWorkspace: async (name) => {
        names.push(name);
        return { workspaceId: '01J9WORKSPACE0000000000000' };
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Convenience Corner');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/01J9WORKSPACE0000000000000/my-work'));
    expect(names).toEqual(['Convenience Corner']);
  });

  /**
   * 3.127 PLANTED DEFECT — the name is submitted AS TYPED.
   *
   * A `name.trim()` in the form would silently repair a claim the person made,
   * and it would make the door's own 400 unreachable for the one input it
   * exists to refuse: `minLength: 1` admits `'   '`, which names nothing while
   * looking like a name everywhere it is displayed.
   */
  it('3.127 does not trim the name before submitting it', async () => {
    const names: string[] = [];
    mount({
      foundWorkspace: async (name) => {
        names.push(name);
        return { workspaceId: '01J9WORKSPACE0000000000000' };
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(names).toEqual(['   ']));
  });
});

/**
 * 3.128 PLANTED DEFECT — the door's own words, both shapes.
 *
 * Before `HttpError` carried the parsed body, the most this form could have
 * rendered was `HTTP 422 for /v1/workspaces` — a number, on the founding path,
 * to a person who has no other way in.
 */
describe('3.128 founding — both refusal shapes render verbatim', () => {
  it('shows the 400 whitespace-name sentence and does NOT route', async () => {
    const message = 'A workspace needs a name. Whitespace alone is not one.';
    mount({ foundWorkspace: async () => Promise.reject(new FoundingError(400, message)) });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(push).not.toHaveBeenCalled();
    // The form is still usable — a refusal is not a dead end.
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeEnabled();
  });

  it('3.128 shows the 422 engine reason verbatim', async () => {
    const reason = 'This claim was refused by the ingest gate.';
    mount({ foundWorkspace: async () => Promise.reject(new FoundingError(422, reason)) });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Corner');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
  });

  it('3.128 says the server gave no reason rather than rendering a blank alert', async () => {
    mount({ foundWorkspace: async () => Promise.reject(new FoundingError(500, null)) });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Corner');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('the server did not say why');
    expect(alert.textContent?.trim()).not.toBe('');
  });
});
