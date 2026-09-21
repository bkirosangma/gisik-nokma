import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsSection } from '../../src/account/notifications-section.js';

/**
 * Account/help-screens plan, Task 6. `NotificationsSection` is framework-free
 * (no HTTP, no `useAppServices`) — it renders `mutedKinds` and calls
 * `onToggle`, so these cases drive it directly rather than through
 * `/account`. The wiring from `useAppServices().notificationPreferences`
 * through to this component is case 11.208 in
 * `apps/web/test/account-page.test.tsx`.
 */
describe('NotificationsSection', () => {
  it('11.205 renders one checked-by-default row per real notification kind', () => {
    render(<NotificationsSection mutedKinds={[]} onToggle={vi.fn()} />);
    // Five, not a hand-copied number: NOTIFICATION_KINDS is the domain's own
    // list, and this count is what pins the section to it rather than to a
    // constant this file guessed.
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeChecked();
    }
  });

  it('11.206 a muted kind renders unchecked, and only that one', () => {
    render(<NotificationsSection mutedKinds={['mention']} onToggle={vi.fn()} />);
    expect(screen.getByLabelText(/mentioned/i)).not.toBeChecked();
    const checked = screen.getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked);
    expect(checked).toHaveLength(4);
  });

  it('11.207 clicking a row calls onToggle with that kind, and does not flip local state itself', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<NotificationsSection mutedKinds={[]} onToggle={onToggle} />);
    const mentionRow = screen.getByLabelText(/mentioned/i);
    await user.click(mentionRow);
    expect(onToggle).toHaveBeenCalledWith('mention');
    // Controlled, not local: with `mutedKinds` unchanged by the click (this
    // component owns no state of its own), the box reports back checked —
    // the caller is what would flip it, by passing new props.
    expect(mentionRow).toBeChecked();
  });

  /**
   * 11.216 — RULING E5-13's component half. The page-level wiring (a failed
   * read must never fabricate `{ mutedKinds: [] }`) is case 11.215 in
   * `apps/web/test/account-page.test.tsx`; this is the component's own
   * contract — every row disabled and the refusal stated — independent of
   * the caller.
   */
  it('11.216 an error disables every row and states the refusal, rather than rendering a togglable guess', () => {
    render(
      <NotificationsSection
        mutedKinds={[]}
        onToggle={vi.fn()}
        error="Your preferences could not be loaded"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Your preferences could not be loaded');
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeDisabled();
    }
  });

  /**
   * 11.217 — RULING E2-24(a)'s component half. Distinct from `error`
   * (11.216, a READ failure that disables every row): a refused SAVE is
   * stated as its own refusal WITHOUT disabling anything, because the data
   * is still current once the optimistic flip has reverted — only the last
   * attempted change did not stick.
   */
  it('11.217 a save refusal states the outcome without disabling the rows, unlike a read failure', () => {
    render(
      <NotificationsSection
        mutedKinds={[]}
        onToggle={vi.fn()}
        saveError="Your change could not be saved. It has been reverted."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your change could not be saved. It has been reverted.',
    );
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).not.toBeDisabled();
    }
  });
});
