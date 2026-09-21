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
  usePathname: () => '/workspaces',
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
 * workspaces yet, make one". **⚠ CORRECTED 2026-09-20:** this read *"Against the
 * shipped server that arm is UNREACHABLE: `getMyWorkspaces` is one of the refusing
 * reads (four of them since ruling P25 clause 1; this is still one), so the page
 * resolves to the refusal branch every time, and a form nested in the empty arm
 * would be a form nobody could ever open."* `getMyWorkspaces` ANSWERS — rulings
 * P32/P38; register empty since 2026-09-19 — **so the premise that made that arm
 * unreachable has expired. Whether the form should now move inside it is a product
 * decision this correction does NOT take:** *owner, whoever next touches this page.*
 * The person who cannot be told which
 * workspaces they are in is exactly the person who most needs to found one.
 */
describe('3.124 the founding form is reachable when the workspace list REFUSES', () => {
  it('renders the form beside the refusal, not instead of it', async () => {
    mount({});
    // The refusal is on screen — the default stub refuses `getMyWorkspaces`
    // with the REAL serving-gap table.
    expect(await screen.findByRole('status')).toHaveTextContent('could not be loaded');
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

  /**
   * 13.394 (the `/workspaces` half) — this form is `.gn-workspace-founding`, a
   * bare column, and NOT `.gn-project-founding` (the raised card the home
   * page's "New project" row carries — see `workspace-home.test.tsx`'s own
   * 13.394). Owner feedback item 3, verbatim: *"The create workspace card
   * shouldnt be that big."*
   */
  it('13.394 is a bare column, .gn-workspace-founding, not a raised card', async () => {
    mount({});
    const field = await screen.findByLabelText('Name');
    const form = field.closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveClass('gn-workspace-founding');
    expect(form).not.toHaveClass('gn-project-founding');
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

  it('13.1032 — the new-workspace form authors the PREFIX, upper-cases it, and passes undefined when untouched', async () => {
    // Owner spec 2026-09-20: *"i can enter up to 3 letters for the workspace"* —
    // `CC` in `CCSO-1183`. The assertion is on the ARGUMENT the gateway
    // receives, because that is the whole of this form's part in it.
    const calls: Array<{ name: string; prefix: string | undefined }> = [];
    mount({
      foundWorkspace: async (name, prefix) => {
        calls.push({ name, prefix });
        return { workspaceId: '01J9WORKSPACE0000000000000' };
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Convenience Corner');
    // Typed in LOWER CASE on purpose: `prefixSchema` refuses lower case rather
    // than normalising it, so the upper-casing has to happen here, at the
    // keyboard. Delete it from the `onChange` and this line fails on `cc`.
    await user.type(screen.getByLabelText('Prefix (optional)'), 'cc');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ name: 'Convenience Corner', prefix: 'CC' });
  });

  it('13.1033 — an UNTOUCHED prefix box passes undefined, never an empty string', async () => {
    // Not folded into 13.1032, because the two claims fail for different
    // reasons: the one above fails if the upper-casing goes, this one fails if
    // the box starts feeding `''` into the gateway — and `''` would reach the
    // door's body schema as a present-but-wrong value rather than as "nobody
    // entered one".
    const calls: Array<{ name: string; prefix: string | undefined }> = [];
    mount({
      foundWorkspace: async (name, prefix) => {
        calls.push({ name, prefix });
        return { workspaceId: '01J9WORKSPACE0000000000000' };
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Convenience Corner');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ name: 'Convenience Corner', prefix: undefined });
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
