import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionsSection } from '../../src/account/sessions-section.js';
import type { DeviceSummary } from '../../src/account/sessions-client.js';

/**
 * `SessionsSection` is framework-free (no `authClient`, no HTTP) - these cases drive it directly, the
 * way `NotificationsSection`'s suite does. **Amended 2026-09-30 by the devices plan (Task 6):** the section
 * now lists DEVICES (one row per `gn_device`), not sessions; the session-row cases below were rewritten on
 * the new model and keep their E2-24(b) / hedged-empty-state / append-only-note claims. The wiring from
 * `GET /v1/me/devices` through to this component is proven in `apps/web/test/account-page.test.tsx`.
 *
 * Owner ruling FD3 = A (2026-09-30): the list splits into "Active in the last 24 hours" and a collapsed
 * "Signed in, idle (N)" group; the heading reads "Sign-in and devices (N signed in, M active)".
 */
const NOW = new Date('2026-10-01T00:00:00Z');
const device = (over: Partial<DeviceSummary> & Pick<DeviceSummary, 'key'>): DeviceSummary => ({
  tag: 'AAAA',
  label: 'Chrome on Mac',
  isCurrent: false,
  lastSeenAt: '2026-09-30T20:00:00Z', // 4 h before NOW: active
  firstSignedInAt: '2026-09-12T10:00:00Z',
  sessionCount: 1,
  legacy: false,
  ...over,
});
const CURRENT = device({ key: 'k1', tag: '7F3K', isCurrent: true, lastSeenAt: '2026-09-30T23:58:00Z' });
const ACTIVE = device({ key: 'k2', tag: 'Q2ZA', label: 'Firefox on Windows', sessionCount: 3 });
const IDLE = device({ key: 'k3', tag: 'M5NB', label: 'Safari on iPhone', lastSeenAt: '2026-09-29T10:00:00Z' });
const LEGACY = device({ key: 'legacy:x', tag: null, legacy: true, label: 'Safari on iPad', lastSeenAt: '2026-09-28T10:00:00Z' });

function mount(devices: DeviceSummary[], extra: { error?: string | null } = {}) {
  const onSignOutDevice = vi.fn();
  const onSignOutOthers = vi.fn();
  render(<SessionsSection devices={devices} onSignOutDevice={onSignOutDevice} onSignOutOthers={onSignOutOthers} now={NOW} {...extra} />);
  return { onSignOutDevice, onSignOutOthers };
}

describe('SessionsSection', () => {
  it('6.331 one row per device: "<browser> on <os> (TAG)", "This device" on the current one only, relative activity, first signed in and the sign-in count when more than one; control: a legacy group reads "Older sign-in" with no tag', () => {
    mount([CURRENT, ACTIVE, LEGACY]);
    expect(screen.getByText('Chrome on Mac (7F3K)')).toBeInTheDocument();
    expect(screen.getByText('Firefox on Windows (Q2ZA)')).toBeInTheDocument();
    expect(screen.getAllByText('This device')).toHaveLength(1);
    expect(within(screen.getByText('Chrome on Mac (7F3K)').closest('li')!).getByText('This device')).toBeInTheDocument();
    expect(screen.getByText('Active now')).toBeInTheDocument(); // the current device, 2 minutes before NOW
    expect(screen.getByText('4 hours ago')).toBeInTheDocument();
    expect(screen.getAllByText('First signed in 12 Sep 2026')).toHaveLength(2);
    expect(screen.getByText('3 sign-ins')).toBeInTheDocument();
    expect(screen.queryByText('1 sign-ins')).toBeNull();
    expect(screen.queryByText('1 sign-in')).toBeNull();
    // Control: the legacy group is in the idle group, so it shows once that is opened.
    expect(screen.queryByText('Older sign-in (Safari on iPad)')).toBeNull();
  });

  it('6.331 a legacy group, once its group is open, reads "Older sign-in (<label>)" with no tag', async () => {
    mount([CURRENT, LEGACY]);
    await userEvent.click(screen.getByRole('button', { name: /Signed in, idle \(1\)/ }));
    expect(screen.getByText('Older sign-in (Safari on iPad)')).toBeInTheDocument();
    expect(screen.queryByText(/Safari on iPad ·/)).toBeNull();
  });

  it('6.332 the heading counts devices and the active ones: "Sign-in and devices (N signed in, M active)"; control: N counts devices, not sessions', () => {
    mount([CURRENT, ACTIVE, IDLE, LEGACY]); // ACTIVE alone carries 3 sessions
    expect(screen.getByRole('heading', { name: 'Sign-in and devices (4 signed in, 2 active)' })).toBeInTheDocument();
  });

  it('6.332 a device seen exactly 24 hours ago is idle, 23 h 59 min ago is active', () => {
    const edge = device({ key: 'e1', tag: 'EDGE', lastSeenAt: '2026-09-30T00:00:00Z' }); // exactly 24 h before NOW
    const inside = device({ key: 'e2', tag: 'INSD', lastSeenAt: '2026-09-30T00:01:00Z' });
    mount([CURRENT, edge, inside]);
    expect(screen.getByRole('heading', { name: 'Sign-in and devices (3 signed in, 2 active)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Signed in, idle \(1\)/ })).toBeInTheDocument();
  });

  it('6.339 devices seen within 24 h sit under "Active in the last 24 hours"; older ones are in a COLLAPSED "Signed in, idle (N)" group that expands to show its rows', async () => {
    mount([CURRENT, ACTIVE, IDLE, LEGACY]);
    expect(screen.getByText('Active in the last 24 hours')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Signed in, idle (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: the idle rows are not rendered at all.
    expect(screen.queryByText('Safari on iPhone (M5NB)')).toBeNull();
    expect(screen.queryByText('Older sign-in (Safari on iPad)')).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Safari on iPhone (M5NB)')).toBeInTheDocument();
    expect(screen.getByText('Older sign-in (Safari on iPad)')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByText('Safari on iPhone (M5NB)')).toBeNull();
  });

  it('6.339 control: with every device active there is no idle group; the current device is always active even with an old stamp', () => {
    mount([CURRENT, ACTIVE]);
    expect(screen.queryByText(/Signed in, idle/)).toBeNull();
    const staleCurrent = device({ key: 'c', tag: 'CCCC', isCurrent: true, lastSeenAt: '2026-09-01T00:00:00Z' });
    mount([staleCurrent, IDLE]);
    const heading = screen.getAllByRole('heading', { level: 2 }).at(-1)!;
    expect(heading).toHaveTextContent('Sign-in and devices (2 signed in, 1 active)');
    expect(within(heading.closest('section')!).getByText('Chrome on Mac (CCCC)')).toBeInTheDocument();
  });

  it('6.339 a NON-current device that was never seen (lastSeenAt null, a pre-migration session the 5-minute stamp has not touched) is IDLE: under "Signed in, idle (1)", not in "M active"; control: the same device with a recent stamp is active', () => {
    const never = device({ key: 'n', tag: 'NNNN', label: 'Edge on Linux', lastSeenAt: null });
    mount([CURRENT, never]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign-in and devices (2 signed in, 1 active)');
    expect(screen.getByRole('button', { name: 'Signed in, idle (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Edge on Linux (NNNN)')).toBeNull();
    cleanup();
    mount([CURRENT, { ...never, lastSeenAt: '2026-09-30T23:00:00Z' }]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign-in and devices (2 signed in, 2 active)');
    expect(screen.queryByText(/Signed in, idle/)).toBeNull();
    expect(screen.getByText('Edge on Linux (NNNN)')).toBeInTheDocument();
  });

  it('6.339 when NO device is active and none is current (a list with no isCurrent) the "Active in the last 24 hours" heading and list are absent and the heading reads "0 active"; control: one active device shows the group', () => {
    mount([IDLE, LEGACY]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign-in and devices (2 signed in, 0 active)');
    expect(screen.queryByText('Active in the last 24 hours')).toBeNull();
    expect(screen.getByRole('button', { name: 'Signed in, idle (2)' })).toBeInTheDocument();
    cleanup();
    mount([IDLE, ACTIVE]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign-in and devices (2 signed in, 1 active)');
    expect(screen.getByText('Active in the last 24 hours')).toBeInTheDocument();
  });

  it('6.333 "Sign out this device" is on every row except the current one and calls signOutDevice(key); "Sign out all other devices" shows once and calls signOutOthers()', async () => {
    const { onSignOutDevice, onSignOutOthers } = mount([CURRENT, ACTIVE]);
    const rowButtons = screen.getAllByRole('button', { name: /^Sign out this device/ });
    expect(rowButtons).toHaveLength(1);
    expect(rowButtons[0]).toHaveAccessibleName('Sign out this device: Firefox on Windows (Q2ZA)');
    await userEvent.click(rowButtons[0]!);
    expect(onSignOutDevice).toHaveBeenCalledWith('k2');
    expect(screen.getAllByRole('button', { name: 'Sign out all other devices' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out all other devices' }));
    expect(onSignOutOthers).toHaveBeenCalledTimes(1);
  });

  it('6.333 an idle row signs out too once opened; control: a single device shows neither action', async () => {
    const { onSignOutDevice } = mount([CURRENT, IDLE]);
    await userEvent.click(screen.getByRole('button', { name: /Signed in, idle/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Sign out this device: Safari on iPhone/ }));
    expect(onSignOutDevice).toHaveBeenCalledWith('k3');
  });

  it('6.333 control: one device shows no sign-out action at all', () => {
    mount([CURRENT]);
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
  });

  /**
   * The hedged wording is the point: `/account`'s own effect collapses a FAILED read to `[]`, so this
   * component cannot tell "no devices" from "the read did not answer". "You have no other devices" would
   * be a claim the empty array does not establish.
   */
  it('renders a hedged empty state rather than a bare heading when no devices are listed', () => {
    mount([]);
    expect(screen.getByText('No signed-in devices to show.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign-in and devices' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
  });

  it('states that signing a device out does not remove what it recorded', () => {
    mount([CURRENT, ACTIVE]);
    expect(screen.getByText(/does not remove what it recorded/)).toBeInTheDocument();
  });

  it('11.220 a sign-out refusal renders verbatim in a role="alert" (E2-24(b))', () => {
    mount([CURRENT, ACTIVE], { error: 'That device could not be signed out. Try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('That device could not be signed out. Try again.');
  });

  it('renders no alert at all when there is no refusal', () => {
    mount([CURRENT, ACTIVE]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('6.348 per-row sign-out names are unique (controller browser pass, devices-2)', () => {
  const legacy = (key: string, over: Partial<DeviceSummary> = {}) =>
    device({ key, tag: null, legacy: true, label: 'Chrome on Mac', lastSeenAt: '2026-09-28T10:00:00Z', ...over });
  const openIdle = async () => userEvent.click(screen.getByRole('button', { name: /Signed in, idle/ }));
  const signOutNames = () => screen.getAllByRole('button', { name: /^Sign out this device/ }).map((b) => b.getAttribute('aria-label'));

  it('6.348 two rows with the SAME title are told apart by their last activity, and the second is clicked by its own name; control: a third row with a different title keeps the plain name', async () => {
    const { onSignOutDevice } = mount([
      CURRENT,
      legacy('legacy:a'),
      legacy('legacy:b', { lastSeenAt: '2026-09-25T10:00:00Z' }),
      IDLE,
    ]);
    await openIdle();
    const names = signOutNames();
    expect(names).toEqual([
      'Sign out this device: Older sign-in (Chrome on Mac), last active 2 days ago',
      'Sign out this device: Older sign-in (Chrome on Mac), last active 5 days ago',
      'Sign out this device: Safari on iPhone (M5NB)',
    ]);
    expect(new Set(names).size).toBe(names.length);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out this device: Older sign-in (Chrome on Mac), last active 5 days ago' }));
    expect(onSignOutDevice).toHaveBeenCalledWith('legacy:b');
  });

  it('6.348 when the last activity is ALSO equal, the first sign-in date tells them apart; a device that was never seen reads "never active"; control: rows that differ on activity do not gain the date', async () => {
    const { onSignOutDevice } = mount([
      CURRENT,
      legacy('legacy:a', { firstSignedInAt: '2026-09-01T10:00:00Z' }),
      legacy('legacy:b', { firstSignedInAt: '2026-09-10T10:00:00Z' }),
      legacy('legacy:c', { lastSeenAt: null }),
    ]);
    await openIdle();
    const names = signOutNames();
    expect(names).toEqual([
      'Sign out this device: Older sign-in (Chrome on Mac), last active 2 days ago, first signed in 1 Sep 2026',
      'Sign out this device: Older sign-in (Chrome on Mac), last active 2 days ago, first signed in 10 Sep 2026',
      'Sign out this device: Older sign-in (Chrome on Mac), never active',
    ]);
    expect(new Set(names).size).toBe(3);
    await userEvent.click(screen.getByRole('button', { name: /first signed in 10 Sep 2026$/ }));
    expect(onSignOutDevice).toHaveBeenCalledWith('legacy:b');
  });

  it('6.348 rows identical in every shown respect still get distinct names (an ordinal), so every button stays addressable', async () => {
    const { onSignOutDevice } = mount([CURRENT, legacy('legacy:a'), legacy('legacy:b')]);
    await openIdle();
    const names = signOutNames();
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names[1]).toMatch(/2 of 2$/);
    await userEvent.click(screen.getByRole('button', { name: names[1]! }));
    expect(onSignOutDevice).toHaveBeenCalledWith('legacy:b');
  });
});
