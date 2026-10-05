'use client';
import { GROUP_OF_EDGE_KIND, type GraphGroup, type GraphItemView, type StateCategory } from '@gisik-nokma/domain';
import { truncate } from '../engine/levels.js';
import type { GraphStore } from '../engine/model.js';
import { relation } from '../engine/sentences.js';
import type { Zones } from '../engine/zones.js';
import { SnippetQuote } from './edge-inspector.js';
import { Glyph } from './glyph.js';
import { directLinks, fogNext, kindWord, linkedFrom, longLabel, openLabel, outsideScope, pathTo, type ScopeKey } from './inspect-model.js';

/** The state categories' words, the workflow builder's own (`packages/app-core/src/workflow-builder/category-label.ts:7`): this package does not depend on app-core. */
const CATEGORY_WORD: Record<StateCategory, string> = { open: 'Open', active: 'Active', terminal: 'Done' };
/** The direct links shown before "N more on the graph" (`knowledge-graph-sigma.html:1025`). */
const DIRECT_SHOWN = 7;

export type ScopeNames = { workspace: (id: string) => string | null; project: (id: string) => string | null };

export type InspectorProps = {
  item: GraphItemView;
  centre: string;
  store: GraphStore;
  zones: Zones;
  on: ReadonlySet<GraphGroup>;
  inScope: (ref: string) => boolean;
  /** The chosen workspaces: a link out of one of them adds its project, a link into another adds the workspace. */
  workspaceIds: readonly string[];
  scopeNames: ScopeNames;
  phone: boolean;
  label: (ref: string) => string;
  canOpen?: (item: GraphItemView) => boolean;
  onCenter: (ref: string) => void;
  onOpen: (item: GraphItemView) => void;
  onPick: (ref: string) => void;
  onAddScope: (key: ScopeKey) => void;
  status: string;
};

/**
 * The item inspector (the item half of `renderInsp`, `knowledge-graph-sigma.html:998-1027`): what it is, Center and Open,
 * what Center would bring in, the links that lead outside the scope, how it connects to the centre, and on a desktop the
 * references into it and its direct links.
 */
export function Inspector(p: InspectorProps) {
  const { item, store, zones } = p;
  const isCentre = item.ref === p.centre;
  const brings = isCentre ? 0 : fogNext(store, item.ref, p.on, zones.clearSet, p.inScope);
  const outs = outsideScope(store, item.ref, p.on, p.inScope, p.workspaceIds);
  const outTotal = outs.reduce((n, o) => n + o.refs.length, 0);
  const steps = pathTo(zones.walk, item.ref); // the centre's is []
  const project = item.kind !== 'project' && item.projectId !== null ? p.scopeNames.project(item.projectId) : null;
  const home = item.kind === 'project' && item.workspaceId !== null ? p.scopeNames.workspace(item.workspaceId) : null;
  const addName = (key: ScopeKey) => ('projectId' in key ? p.scopeNames.project(key.projectId) : p.scopeNames.workspace(key.workspaceId)) ?? '';

  return (
    <>
      <div className="gn-kg-insp__head">
        <Glyph item={item} />
        <span>{kindWord(item)}</span>
        {item.kind === 'concept' && <span className={`gn-kg-pill${item.suggested ? ' gn-kg-pill--suggested' : ''}`}>{item.suggested ? 'Suggested' : 'Confirmed'}</span>}
      </div>
      <h3 className="gn-kg-insp__title">{item.kind === 'ticket' ? item.title ?? item.label : item.label}</h3>
      {(item.category !== null || project !== null || home !== null) && (
        <div className="gn-kg-insp__meta">
          {item.category !== null && (
            <span className="gn-kg-pill">
              <span className={`gn-kg-glyph gn-kg-glyph--dot gn-kg-glyph--${item.category}`} aria-hidden="true" />
              {CATEGORY_WORD[item.category]}
            </span>
          )}
          {project !== null && <span className="gn-kg-pill">{project}</span>}
          {home !== null && <span className="gn-kg-pill">{home}</span>}
        </div>
      )}
      <div className="gn-kg-insp__acts">
        {!isCentre && (
          <button type="button" className="gn-button gn-button--primary" onClick={() => p.onCenter(item.ref)}>
            {`Center on ${truncate(item.label, 16)}`}
          </button>
        )}
        {p.canOpen?.(item) !== false && (
          <button type="button" className="gn-button gn-button--ghost" onClick={() => p.onOpen(item)}>
            {openLabel(item)}
          </button>
        )}
      </div>
      {brings > 0 && <p className="gn-kg-insp__hint">{`Center brings ${brings} item${brings > 1 ? 's' : ''} out of the fog.`}</p>}
      <p className="gn-kg__status" aria-live="polite">
        {p.status}
      </p>
      {outTotal > 0 && (
        <div className="gn-kg-insp__outs">
          <p>{`${outTotal} link${outTotal > 1 ? 's lead' : ' leads'} outside the scope, so ${outTotal > 1 ? 'they stay' : 'it stays'} in the fog.`}</p>
          <div className="gn-kg-insp__acts">
            {outs.map((o) => (
              <button key={JSON.stringify(o.key)} type="button" className="gn-button gn-button--ghost gn-kg-insp__add" onClick={() => p.onAddScope(o.key)}>
                {`Add ${addName(o.key)} (${o.refs.length})`}
              </button>
            ))}
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <section className="gn-kg-insp__section">
          <h4>{`How it connects to ${p.label(p.centre)}`}</h4>
          <ol className="gn-kg-insp__path">
            {/* each step is its edge's own sentence, read from the source like the tooltip's (§2.1), not from the walk's side */}
            {steps.map(({ edge }) => (
              <li key={edge.id}>
                <b>{p.label(edge.from)}</b> {relation(edge, edge.from)} <b>{p.label(edge.to)}</b>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!p.phone && <DesktopLists {...p} />}
    </>
  );
}

/** `Linked from` and `Direct links` (`:1021-1026`): a desktop has the room; a phone stops at the path (`:1021`). */
function DesktopLists(p: InspectorProps) {
  const { item, store } = p;
  const back = linkedFrom(store, item.ref, p.inScope).filter((e) => store.items.has(e.from));
  const links = directLinks(store, item.ref, p.on, p.inScope);
  return (
    <>
      {back.length > 0 && (
        <section className="gn-kg-insp__section">
          <h4>
            Linked from <span className="gn-kg-badge">{back.length}</span>
          </h4>
          {back.map((e) => (
            <SnippetQuote key={e.id} source={store.items.get(e.from)!} snippet={e.snippet!} />
          ))}
        </section>
      )}
      {links.length > 0 && (
        <section className="gn-kg-insp__section">
          <h4>
            {item.kind === 'concept' ? 'Items' : 'Direct links'} <span className="gn-kg-badge">{links.length}</span>
          </h4>
          <ul className="gn-kg-links">
            {links.slice(0, DIRECT_SHOWN).map(({ edge, to }) => (
              <li key={edge.id}>
                <button type="button" className="gn-kg-links__row" data-fog={p.zones.clearSet.has(to) ? undefined : ''} onClick={() => p.onPick(to)}>
                  <span className={`gn-kg__swatch gn-kg__swatch--${GROUP_OF_EDGE_KIND[edge.kind]}`} aria-hidden="true" />
                  <span className="gn-kg-links__rel">{relation(edge, item.ref)}</span>
                  <span className="gn-kg-links__name">{longLabel(store.items.get(to)!)}</span>
                </button>
              </li>
            ))}
          </ul>
          {links.length > DIRECT_SHOWN && <p className="gn-kg-insp__more">{`${links.length - DIRECT_SHOWN} more on the graph`}</p>}
        </section>
      )}
    </>
  );
}
