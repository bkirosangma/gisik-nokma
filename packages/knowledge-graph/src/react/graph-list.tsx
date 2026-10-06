'use client';
import { useId } from 'react';
import type { GraphStore } from '../engine/model.js';
import { relation } from '../engine/sentences.js';
import type { Zones } from '../engine/zones.js';
import { Glyph } from './glyph.js';
import { longLabel } from './inspect-model.js';

export type GraphListProps = {
  centre: string;
  store: GraphStore;
  zones: Zones;
  selected: string | null;
  label: (ref: string) => string;
  onPick: (ref: string) => void;
  /** The rows scroll in a bounded box (`.gn-kg-list__box`): the host has no scroller of its own around the view (Home). */
  box?: boolean;
};

/**
 * The accessible list (`renderList`, `knowledge-graph-sigma.html:1029-1035`; §3.5): every clear item but the centre, in
 * ring order, each a button reachable by Tab, with its glyph and how it hangs off its parent. This is the keyboard and
 * screen-reader path through the graph; the canvas is one `role="img"`.
 */
export function GraphList(p: GraphListProps) {
  const id = useId();
  const rows = p.zones.clear.filter((ref) => ref !== p.centre);
  const outN = p.zones.outN;
  const fogN = p.zones.fog.length - outN;
  return (
    <section className="gn-kg-list" aria-labelledby={id}>
      <h4 id={id} className="gn-kg-list__head">
        {`Linked to ${p.label(p.centre)}`} <span className="gn-kg-badge">{rows.length}</span>
      </h4>
      <ul className={p.box === true ? 'gn-kg-links gn-kg-list__box' : 'gn-kg-links'}>
        {rows.map((ref) => {
          const it = p.store.items.get(ref)!;
          const parent = p.zones.walk.parent.get(ref)!;
          return (
            <li key={ref}>
              <button type="button" className="gn-kg-links__row gn-kg-list__row" aria-current={ref === p.selected} onClick={() => p.onPick(ref)}>
                <Glyph item={it} />
                <span className="gn-kg-list__two">
                  <span className="gn-kg-links__name">{longLabel(it)}</span>
                  <span className="gn-kg-links__rel">{`${relation(parent.edge, ref)} ${p.label(parent.from)}`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {fogN > 0 && <p className="gn-kg-list__fog">{`${fogN} more ${fogN > 1 ? 'are' : 'is'} one step further, in the fog. Select an item and press Center to bring its links in.`}</p>}
      {outN > 0 && <p className="gn-kg-list__fog">{`${outN} ${outN > 1 ? 'are' : 'is'} outside the scope. Change it under Scope and links.`}</p>}
    </section>
  );
}
