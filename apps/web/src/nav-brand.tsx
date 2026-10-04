'use client';
import Link from 'next/link';
import { useId } from 'react';
import { BrandMark } from './brand-mark.js';

/**
 * The product's brand group (owner ruling 2026-09-23/24: "make it the icon,
 * then 'Gisik Nokma' in bold heavy text on its right") — the orange
 * `BrandMark` tile plus the wordmark, ONE component shared by `AppNav` and
 * `LegalNav` so the two bars cannot draw two different brands again.
 *
 * Before this, `.gn-nav__brand` was defined TWICE in `globals.css`: a
 * tile-only rule for this bar's own hand-rolled `<span>`, and a second,
 * `--gn-accent`-tinted tile + wordmark pair for `LegalNav`'s own markup —
 * the later rule silently overrode parts of the earlier at equal
 * specificity. `LegalNav` also drew its OWN one-path `<svg>` rather than
 * `BrandMark`, so 13.1471's "one origin for the glyph" never reached it.
 * This component fixes both at once: one class family
 * (`.gn-nav__brand`/`.gn-nav__brand-tile`/`.gn-nav__wordmark`, `globals.css`)
 * and one glyph. `LegalNav`'s tile moves from `--gn-accent` to the same
 * `--gn-brand` tile `AppNav` already used — one brand, a deliberate change.
 *
 * SINCE 2026-10-03 IT IS A LINK TO `/` (Knowledge Graph spec E §2.1, owner: "yes to the logo link"), which
 * REVERSES 13.1475's "not a control" (that case is 🚫; 27.620 pins the link). The name "Gisik Nokma, Home" comes
 * from `aria-labelledby` on a visually-hidden span, never `aria-label` (13.1476 forbids the ratchet's four
 * attributes on this subtree) and never the wordmark alone (it is `display:none` below 40rem, 13.1494, so a phone
 * would get a link with no name). The tile stays `aria-hidden`; the wordmark stays plain visible text (13.1491).
 *
 * `link={false}` is the skeleton's brand: a hop in flight offers nothing to press (25.057).
 */
export function NavBrand({ link = true }: { link?: boolean } = {}) {
  const nameId = useId();
  const parts = (
    <>
      <span className="gn-nav__brand-tile" aria-hidden="true">
        <BrandMark size={18} />
      </span>
      <span className="gn-nav__wordmark">Gisik Nokma</span>
    </>
  );
  if (!link) return <span className="gn-nav__brand">{parts}</span>;
  return (
    <Link href="/" className="gn-nav__brand" aria-labelledby={nameId}>
      {parts}
      <span id={nameId} className="gn-visually-hidden">Gisik Nokma, Home</span>
    </Link>
  );
}
