import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasskeysSection } from '../../src/account/passkeys-section.js';
import type { PasskeySummary } from '../../src/account/passkey-client.js';

const NOW = new Date('2026-10-01T00:00:00Z');
/** A passkey as `GET /v1/me/passkeys` serves it (devices plan Task 5), with overrides. */
const pk = (over: Partial<PasskeySummary> & Pick<PasskeySummary, 'id'>): PasskeySummary => ({
  name: 'MacBook Touch ID',
  provider: 'iCloud Keychain',
  createdAt: '2026-09-18T10:00:00Z',
  lastUsedAt: '2026-09-30T10:00:00Z',
  notUsedRecently: false,
  ...over,
});

/**
 * Account/help-screens plan, Task 8. `PasskeysSection` is framework-free
 * (no `authClient`, no WebAuthn, no HTTP) — these cases drive it directly,
 * the same way `SessionsSection`'s and `NotificationsSection`'s own suites
 * drive theirs. The wiring from `authClient.passkey.*` through to this
 * component is proven at the page level in
 * `apps/web/test/account-page.test.tsx`.
 */
describe('PasskeysSection', () => {
  it('shows the named empty state with nothing registered', () => {
    render(<PasskeysSection passkeys={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('You have no passkeys yet.')).toBeInTheDocument();
  });

  it('lists a registered passkey with a delete control named for that passkey', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <PasskeysSection
        passkeys={[pk({ id: 'p1' }), pk({ id: 'p2', name: 'YubiKey', provider: 'Security key or other' })]}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('MacBook Touch ID')).toBeInTheDocument();
    expect(screen.queryByText('You have no passkeys yet.')).not.toBeInTheDocument();
    // TWO rows, and the click is addressed by the per-row accessible name. A
    // single-row fixture would pass against a component that rendered ONE
    // delete control for the whole list and wired it to `passkeys[0]` — the
    // row-identity property would be unwitnessed. `onRemove` is asserted to
    // have been called with the SECOND row's id, which only a per-row control
    // carrying its own `aria-label` can satisfy.
    await user.click(screen.getByRole('button', { name: 'Delete passkey YubiKey' }));
    expect(onRemove).toHaveBeenCalledWith('p2');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('adding a passkey submits the typed name, then clears the field', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<PasskeysSection passkeys={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    const field = screen.getByLabelText('Passkey name');
    await user.type(field, 'Work laptop');
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(onAdd).toHaveBeenCalledWith('Work laptop');
    // The field is cleared so a second add does not silently re-submit the
    // first name — asserted rather than assumed, because the clear is a
    // separate statement from the callback and a mutation dropping it would
    // leave every assertion above green.
    expect(field).toHaveValue('');
  });

  it('a refusal renders verbatim in a role="alert"', () => {
    render(
      <PasskeysSection
        passkeys={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        error="This authenticator is already registered"
      />,
    );
    // Verbatim, not a paraphrase — the same treatment `ProfileSection`'s save
    // refusal gets, and for the same reason: better-auth's own message is the
    // only thing that can tell the person WHICH refusal this is.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This authenticator is already registered',
    );
  });

  it('renders no alert at all when there is no refusal', () => {
    // The negative half. Without it the case above is satisfied by a component
    // that renders a `role="alert"` unconditionally and merely happens to be
    // empty — an alert with no refusal in it is an empty accusation on screen.
    render(<PasskeysSection passkeys={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * RULING E2-23 — a failed LIST read used to collapse to `[]`, and this
   * component then asserted "You have no passkeys yet." over a read that
   * never actually confirmed that. `listFailed` is the fourth state the
   * finding's own remedy asked for: independent of `error` (an add/remove
   * refusal), it states the read failure instead of the empty-state claim.
   */
  it('states a failed list read instead of asserting the named empty state, when listFailed is set', () => {
    render(<PasskeysSection passkeys={[]} onAdd={vi.fn()} onRemove={vi.fn()} listFailed />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your passkeys could not be loaded.');
    expect(screen.queryByText('You have no passkeys yet.')).not.toBeInTheDocument();
  });

  it('listFailed does not suppress a real list — an unrelated add/remove refusal can still coexist with rows', () => {
    // The negative control for the case above: `listFailed` governs only the
    // empty-state assertion, not the rows themselves, so a caller that has
    // real passkeys AND a currently-failing list poll (a stale prop update)
    // still shows what it already knows rather than hiding it.
    render(
      <PasskeysSection
        passkeys={[pk({ id: 'p1' })]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        listFailed
      />,
    );
    expect(screen.getByText('MacBook Touch ID')).toBeInTheDocument();
    expect(screen.queryByText('Your passkeys could not be loaded.')).not.toBeInTheDocument();
  });
});

describe('20.363 the passkeys add action is quiet — Account has one primary', () => {
  it('20.363 Add a passkey is a ghost Button, not a primary', () => {
    render(<PasskeysSection passkeys={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    const add = screen.getByRole('button', { name: 'Add a passkey' });
    // CONTROL — still a Button, still named for its action.
    expect(add.tagName).toBe('BUTTON');
    expect(add).toHaveClass('gn-button');
    expect(add).toHaveClass('gn-button--ghost');
    expect(add).not.toHaveClass('gn-button--primary');
  });
});

describe('6.335/6.336 passkeys grouped by provider (devices plan Task 7)', () => {
  const passkeys = [
    pk({ id: 'p3', name: 'YubiKey', provider: 'Security key or other', createdAt: '2026-09-01T10:00:00Z', lastUsedAt: '2026-09-02T10:00:00Z' }),
    pk({ id: 'p1' }),
    pk({ id: 'p2', name: null, createdAt: '2026-06-01T10:00:00Z', lastUsedAt: null, notUsedRecently: true }),
    pk({ id: 'p4', name: 'Work', provider: '1Password', lastUsedAt: '2026-09-30T23:58:00Z' }),
  ];
  const mount = (list: PasskeySummary[], onRemove = vi.fn()) =>
    render(<PasskeysSection passkeys={list} onAdd={vi.fn()} onRemove={onRemove} now={NOW} />);

  it('6.335 passkeys sit under their provider heading with a count ("iCloud Keychain · 2"), providers alphabetical and "Security key or other" last; control: a single provider still shows its heading', () => {
    mount(passkeys);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['1Password · 1', 'iCloud Keychain · 2', 'Security key or other · 1']);
    // a row sits inside ITS provider's group
    const group = screen.getByRole('heading', { name: 'iCloud Keychain · 2' }).parentElement!;
    expect(within(group).getByText('MacBook Touch ID')).toBeInTheDocument();
    expect(within(group).getByText('Unnamed passkey')).toBeInTheDocument();
    expect(within(group).queryByText('YubiKey')).toBeNull();
    cleanup();
    mount([pk({ id: 'only', provider: 'Windows Hello' })]);
    expect(screen.getByRole('heading', { name: 'Windows Hello · 1' })).toBeInTheDocument();
  });

  it('6.335 each row reads its name (or "Unnamed passkey"), "Added <date>" and "Last used <relative>" or "Never used"; control: a just-now use reads "Last used just now", an old one the date', () => {
    mount(passkeys);
    expect(screen.getAllByText('Added 18 Sep 2026')).toHaveLength(2); // p1 and p4
    expect(screen.getByText('Added 1 Jun 2026')).toBeInTheDocument();
    expect(screen.getByText('Last used 14 hours ago')).toBeInTheDocument();
    expect(screen.getByText('Never used')).toBeInTheDocument();
    expect(screen.getByText('Last used 2 Sep 2026')).toBeInTheDocument(); // p3: 2 Sep is 28 days before NOW, so the date form
    expect(screen.getByText('Last used just now')).toBeInTheDocument(); // p4: 2 minutes
  });

  it('6.336 a passkey with notUsedRecently shows "Not used recently" beside its Delete button; control: a recently used one does not, and the delete control keeps its per-row name', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    mount(passkeys, onRemove);
    expect(screen.getAllByText('Not used recently')).toHaveLength(1);
    const unnamed = screen.getByText('Unnamed passkey').closest('li')!;
    expect(within(unnamed).getByText('Not used recently')).toBeInTheDocument();
    const recent = screen.getByText('MacBook Touch ID').closest('li')!;
    expect(within(recent).queryByText('Not used recently')).toBeNull();
    // an unnamed row still has a name of its own, distinguishable from a second unnamed one by its added date
    await user.click(within(unnamed).getByRole('button', { name: /^Delete passkey Unnamed passkey/ }));
    expect(onRemove).toHaveBeenCalledWith('p2');
  });
});
