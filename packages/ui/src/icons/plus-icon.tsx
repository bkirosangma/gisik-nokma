/**
 * The `+` of the three Create buttons (prefixes/groups Task 8, FD8: no Plus icon
 * existed and there is no icon dependency). Same precedent `select/select-icons.tsx`
 * and `priority-icons.tsx` set — 24×24 viewBox, `fill="none"`, `stroke="currentColor"`,
 * `aria-hidden="true"` — so the glyph takes the ink of the primary button it sits in
 * and never speaks: the button's own text names the action.
 */
export function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
