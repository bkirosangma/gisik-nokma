import type { GraphItemView } from '@gisik-nokma/domain';

/**
 * The list's and the inspectors' glyphs: the same set as the canvas icons (§3.4), the mockup's `glyph`
 * (`knowledge-graph-sigma.html:579-584`) as React SVG. Every colour comes from a class (ui.css, the KG T8 block).
 */
export function Glyph({ item }: { item: GraphItemView }) {
  if (item.kind === 'ticket') return <span className={`gn-kg-glyph gn-kg-glyph--dot gn-kg-glyph--${item.category ?? 'open'}`} aria-hidden="true" />;
  if (item.kind === 'note')
    return (
      <svg className="gn-kg-glyph" width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <path className="gn-kg-glyph__doc" d="M1 1h6.5L11 4.5V13H1z" />
      </svg>
    );
  if (item.kind === 'workspace' || item.kind === 'project')
    return (
      <svg className="gn-kg-glyph" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
        <path className="gn-kg-glyph__doc" d="M1 2.2A1.2 1.2 0 0 1 2.2 1H5l1.2 1.4h5.6A1.2 1.2 0 0 1 13 3.6v6.2A1.2 1.2 0 0 1 11.8 11H2.2A1.2 1.2 0 0 1 1 9.8Z" />
      </svg>
    );
  if (item.kind === 'concept')
    return (
      <svg className="gn-kg-glyph" width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
        <rect className="gn-kg-glyph__concept" x="1" y="1" width="14" height="10" rx="5" />
      </svg>
    );
  return (
    <svg className="gn-kg-glyph" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle className="gn-kg-glyph__person" cx="7" cy="7" r="6" />
    </svg>
  );
}
