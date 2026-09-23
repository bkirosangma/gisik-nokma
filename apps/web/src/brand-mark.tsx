/**
 * The product's one glyph (owner request 2026-09-23), extracted verbatim from
 * `app/sign-in/page.tsx`'s `.gn-page-header__icon` tile so the favicon
 * (`app/favicon.svg`) and the nav's brand tile (`app-nav.tsx`) cannot drift
 * from what the sign-in page itself draws — case 13.1471.
 *
 * `currentColor`, like `AppleMark` beside the sign-in page's own docblock:
 * outside the colour-literal gate's reach and lets each mount pick its own ink
 * (`--gn-text-inverted` on the sign-in tile, a fixed dark on the favicon,
 * `currentColor` again on the nav tile).
 */
export function BrandMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M8 13h8" />
      <path d="M8 16.5h5" />
    </svg>
  );
}
