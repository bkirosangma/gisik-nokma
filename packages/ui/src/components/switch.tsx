import type { ReactNode } from 'react';

export type SwitchProps = {
  checked: boolean;
  /**
   * Receives the NEXT state, not the event — the same shape `SegmentedControl`
   * hands its caller, so a caller never reaches into a DOM event to find out
   * what it just selected.
   */
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * The visible text, and therefore the control's accessible name: the `<label>`
   * below wraps the input, so `getByLabelText` and a screen reader both resolve
   * to whatever is written here. There is deliberately no separate `aria-label`,
   * which would let the two drift apart.
   */
  children: ReactNode;
  className?: string;
};

/**
 * A switch — the product's ONE on/off control.
 *
 * ## It is the `/account` notifications switch, extracted rather than copied
 *
 * That control shipped as a bare `<input type="checkbox">` restyled inside
 * `apps/web/app/globals.css` (`.gn-account__notification-row
 * input[type='checkbox']`), which meant it could only ever exist on a page
 * `globals.css` reaches. The Settings → Workspace tab needed the same switch,
 * and the ruling on that task was explicit: *"If the notification switch is not
 * factored into something reusable, extract it into a shared component and use
 * it in both places rather than copying its CSS; two toggles that drift is the
 * divergence this repo keeps paying for."*
 *
 * So the declarations moved to `ui.css` under `.gn-switch` and this component is
 * the one caller shape for both. **The CSS is the same CSS** — same 51×31 track,
 * same 27px knob, same `borderStrong` ring on the knob that pays WCAG 1.4.11's
 * 3:1 in BOTH states and BOTH themes. What changed is only who can reach it.
 *
 * ## Why a restyled checkbox and not `role="switch"`
 *
 * Kept from the original, and the reason is not nostalgia: a real
 * `<input type="checkbox">` already carries the label association, the checked
 * state, the disabled state and the keyboard behaviour. `notifications-section
 * .test.tsx` asserts through `getByLabelText(...).not.toBeChecked()`, and
 * `settings-page.test.tsx` toggles this control with `userEvent.click`. A
 * `role="switch"` div would have to re-implement all four to keep those honest.
 *
 * The trade is stated rather than hidden: **to assistive technology this is a
 * checkbox, not a `switch`.** That is the pre-existing position on `/account`
 * and this extraction does not change it; what it does change is that there is
 * now one place to change it in, if the owner ever wants the `switch` role.
 *
 * ## `order: 2`, and why the row is a flex container
 *
 * `.gn-switch` carries `order: 2` and `.gn-switch-row` is
 * `justify-content: space-between`. The text therefore stays FIRST in the DOM —
 * which is what a screen reader and a `getByLabelText` query both read — while
 * the switch is painted at the row's trailing edge. Reordering the JSX instead
 * would have put the control before its own label.
 */
export function Switch({ checked, onChange, disabled = false, children, className }: SwitchProps) {
  return (
    <label className={['gn-switch-row', className].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        className="gn-switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="gn-switch__label">{children}</span>
    </label>
  );
}
