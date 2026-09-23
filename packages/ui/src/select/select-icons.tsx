export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function RemoveIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * The dropdown affordance on a single non-searchable `Select` (case 13.1342).
 *
 * Same shape as the three above — 16px, `stroke="currentColor"`, `aria-hidden` —
 * so the trigger's glyph obeys the control it sits in rather than carrying a
 * colour of its own. `aria-hidden` is load-bearing rather than decorative: the
 * chevron is a sibling of the trigger's value element, and an unlabelled graphic
 * inside a button is text the accessible-name computation would otherwise see.
 */
/**
 * The Notes destination's glyph (notes series Plan 5, spec §9.1).
 *
 * A page with a folded corner, which is the ordinary reading of "notes" and the
 * only thing that distinguishes this destination from the inbox's tray at 16px.
 * Same shape as the three above — `stroke="currentColor"`, `aria-hidden="true"`,
 * `fill="none"` — so it obeys the link it sits in rather than carrying a colour.
 *
 * `aria-hidden` is load-bearing here for the reason `ChevronDownIcon`'s docblock
 * gives, one control over: the glyph is a sibling of the link's visible text, and
 * an unlabelled graphic inside the link is text the accessible-name computation
 * would otherwise see. The link's name must be exactly `Notes`, because that is
 * what a reader hears and what `getByRole('link', { name: 'Notes' })` means.
 */
export function PageIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
