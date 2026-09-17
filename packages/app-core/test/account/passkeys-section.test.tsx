import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasskeysSection } from '../../src/account/passkeys-section.js';

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
        passkeys={[
          { id: 'p1', name: 'MacBook Touch ID' },
          { id: 'p2', name: 'YubiKey' },
        ]}
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
});
