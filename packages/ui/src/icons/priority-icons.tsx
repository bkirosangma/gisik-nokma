/**
 * The board card's four new glyphs (owner request, 2026-09-23: priority badge
 * icon, epic chip flag). Same precedent `select/select-icons.tsx` already
 * sets for every icon in this package — 24×24 viewBox, `fill="none"
 * stroke="currentColor"`, `aria-hidden="true"` — so each glyph obeys the
 * ink of the element it sits in (the priority badge's own colour role, the
 * epic chip's `text`) rather than carrying a colour of its own. Hand-drawn
 * originals, not a third-party icon set (the brief names lucide explicitly
 * as the thing NOT to reach for) — simple enough to read at badge size.
 */

/** P1 — red fire. */
export function FireIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2c2 3 0.5 5-1 7-1.2 1.5-2 2.7-2 4.3a3 3 0 0 0 6 0c0-1-0.5-1.8-1-2.6 2 1.3 3 3.4 3 5.6a6 6 0 0 1-12 0c0-3.2 1.3-4.6 2.4-6.3C8.8 7.7 10.3 6 12 2Z" />
    </svg>
  );
}

/** P2 — green leaf. */
export function LeafIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 20C6 12 10 6 19 4c1 8-4 15-13 16Z" />
      <path d="M7 19c3-4 6-7 10-11" />
    </svg>
  );
}

/** P3 — frozen-blue snowflake. */
export function SnowflakeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2v20" />
      <path d="M4.5 6.5l15 11" />
      <path d="M19.5 6.5l-15 11" />
      <path d="M12 6 9.8 4.3M12 6l2.2-1.7" />
      <path d="M12 18l-2.2 1.7M12 18l2.2 1.7" />
    </svg>
  );
}

/** The epic chip's glyph. */
export function FlagIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </svg>
  );
}
