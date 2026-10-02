/**
 * The workspace home's visible Rename cue (UX fixes Task 10, case 23.177, audit
 * WS-13). Same precedent as `plus-icon.tsx` — 24×24 viewBox, `fill="none"`,
 * `stroke="currentColor"`, `aria-hidden="true"` — so the glyph takes the ink of
 * the ghost button around it and never speaks: the button's own `aria-label`
 * names the act.
 */
export function PencilIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
