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
 * The tile stays `aria-hidden` — decorative, not a control: no link, no
 * button, no tabindex (13.1475's standing rule, unchanged). The wordmark is
 * plain VISIBLE text, not `aria-hidden` — it is the bar's one legible
 * spelling of the product's name, not a second copy of a hidden glyph.
 */
export function NavBrand() {
  return (
    <span className="gn-nav__brand">
      <span className="gn-nav__brand-tile" aria-hidden="true">
        <BrandMark size={18} />
      </span>
      <span className="gn-nav__wordmark">Gisik Nokma</span>
    </span>
  );
}
