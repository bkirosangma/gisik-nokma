'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { GRAPH_CHIP_ORDER, GRAPH_MAX_HOPS, inGraphScope, type GraphEdgeView, type GraphGroup } from '@gisik-nokma/domain';
import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import { RING_CONFIGS } from '../engine/layout.js';
import type { GraphStore } from '../engine/model.js';
import { edgeSentence } from '../engine/sentences.js';
import { CLEAR_CAP, zones as computeZones } from '../engine/zones.js';
import type { GraphRenderer, HoverEvent, PickEvent } from '../render/renderer.js';
import { readThemePalette, watchTheme } from '../theme/read-palette.js';
import { buildDrawModel } from './draw-model.js';
import { EdgeInspector } from './edge-inspector.js';
import { GraphBar } from './graph-bar.js';
import { GraphList } from './graph-list.js';
import type { ScopeKey } from './inspect-model.js';
import { Inspector, type ScopeNames } from './inspector.js';
import { readSemantic, writeSemantic } from './semantic-pref.js';
import { tooltipPosition } from './tooltip.js';
import type { HopChoice, KnowledgeGraphProps } from './types.js';
import { useGraphRings } from './use-graph-rings.js';

const DEFAULT_GROUPS = GRAPH_CHIP_ORDER.filter((g) => g !== 'projects');
const reachOf = (h: HopChoice) => (h === 'all' ? Number.POSITIVE_INFINITY : h);
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaultCreate = () => import('../render/sigma/adapter.js').then((m) => m.createSigmaRenderer); // the ONE seam crossing (§4.1)
/** Keys typed into these belong to them, not to the view (a Select trigger types ahead; its list moves by letter). */
const OWNS_KEYS = 'input, textarea, select, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"]';

/**
 * The Knowledge Graph view (spec C §3, §5, §6): the mockup's `makeGraph` view half (`knowledge-graph-sigma.html:709-1080`).
 * State, the bar, the chrome of `render` (`:950-965`), the trail (`:969-975`), the inspectors and the list (`inspector.tsx`,
 * `edge-inspector.tsx`, `graph-list.tsx`: `:977-1035`), `pick` (`:1036`), `centre` (`:1040`), `goTrail` (`:1041`), and the
 * click and key handlers (`:1043-1080`). The renderer is behind the seam and loaded with
 * `import()`, so this file never evaluates WebGL code on a server. CLIENT-ONLY: the web loads it with `next/dynamic`.
 */
export function KnowledgeGraph(props: KnowledgeGraphProps) {
  const phone = props.config === 'phone';
  const offered = props.groups ?? DEFAULT_GROUPS;
  const [centre, setCentre] = useState(props.centre);
  const [trail, setTrail] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(props.centre);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [on, setOn] = useState<Set<GraphGroup>>(() => new Set(offered));
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([...props.defaultWorkspaceIds]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [ownHops, setOwnHops] = useState<HopChoice>(2);
  const [semantic, setSemanticState] = useState(true);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  /** The link "Remove link" just took out of the store: its inspector stays up, with Undo, until another selection. */
  const [removedEdge, setRemovedEdge] = useState<GraphEdgeView | null>(null);
  const hops: HopChoice = phone ? 1 : props.hops ?? ownHops;
  const setHops = (h: HopChoice) => (props.onHopsChange ? props.onHopsChange(h) : setOwnHops(h));
  useEffect(() => setSemanticState(readSemantic()), []);
  // a new surface centre resets the trail
  useEffect(() => {
    setCentre(props.centre);
    setTrail([]);
    setSelected(props.centre);
    setSelectedEdge(null);
  }, [props.centre]);

  const fetchGroups = useMemo(() => (semantic ? offered : offered.filter((g) => g !== 'concepts')), [semantic, offered]);
  const reach = reachOf(hops);
  const rings = useGraphRings(props.source, { centre, workspaceIds, projectIds, groups: fetchGroups, rings: reach === Number.POSITIVE_INFINITY ? GRAPH_MAX_HOPS : reach + 1 });
  const scope = useMemo(() => ({ workspaceIds, projectIds }), [workspaceIds, projectIds]);
  const inScope = useCallback(
    (ref: string) => {
      const it = rings.store.items.get(ref);
      return it === undefined || inGraphScope(it, scope);
    },
    [rings.store, scope],
  );
  const z = useMemo(() => computeZones(rings.store, { center: centre, on, reach, inScope: (r) => r === centre || inScope(r), semantic }), [rings.store, centre, on, reach, inScope, semantic]);
  const model = useMemo(() => buildDrawModel(rings.store, z, { config: props.config, centre, selected, selectedEdge, on }), [rings.store, z, props.config, centre, selected, selectedEdge, on]);

  // Labels outlive the store they came from: a trail crumb names a centre whose rings are no longer the drawn ones.
  const seen = useRef(new Map<string, string>());
  const seenFrom = useRef<GraphStore | null>(null);
  if (seenFrom.current !== rings.store) {
    for (const [ref, it] of rings.store.items) seen.current.set(ref, it.label);
    seenFrom.current = rings.store;
  }
  const label = (ref: string) => rings.store.items.get(ref)?.label ?? seen.current.get(ref) ?? '';
  const centreItem = rings.store.items.get(centre);
  const scopeNames = useMemo<ScopeNames>(() => {
    const ws = new Map(props.scope.workspaces.map((w) => [w.id, w.name]));
    const pj = new Map(props.scope.workspaces.flatMap((w) => w.projects.map((x) => [x.id, x.name] as const)));
    return { workspace: (id) => ws.get(id) ?? null, project: (id) => pj.get(id) ?? null };
  }, [props.scope]);

  // The renderer's callbacks are registered once, at mount: they read the CURRENT render through these refs.
  const labelRef = useRef(label);
  labelRef.current = label;
  const storeRef = useRef(rings.store);
  storeRef.current = rings.store;
  const onPickRef = useRef<(e: PickEvent) => void>(() => undefined);
  const onHoverRef = useRef<(e: HoverEvent) => void>(() => undefined);

  // the renderer: loaded once, mounted once per config, fed every model
  const mountRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<GraphRenderer | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false;
    let stopTheme = () => {};
    void (props.createRenderer ?? defaultCreate)().then((create) => {
      if (dead || mountRef.current === null) return;
      const r = create();
      r.mount(mountRef.current, readThemePalette(document.documentElement), { phone, config: RING_CONFIGS[props.config], reduceMotion });
      stopTheme = watchTheme(() => r.refreshTheme(readThemePalette(document.documentElement)));
      r.onPick((e) => onPickRef.current(e));
      r.onHover((e) => onHoverRef.current(e));
      renderer.current = r;
      setReady(true);
    });
    return () => {
      dead = true;
      stopTheme();
      renderer.current?.destroy();
      renderer.current = null;
      setReady(false);
    };
    // mounted once per config; the model effect below feeds it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.config]);
  const keepView = useRef(false);
  // The empty states (the centre alone, its sentence under it). Every one is framed as nothing-linked is: a chip turned off, or
  // the last link removed, would otherwise keep a camera framed for links no longer drawn, leaving the centre on its sentence.
  const empty = !rings.loading && rings.failedHop === null && centreItem !== undefined && z.clear.length === 1 && z.fog.length === 0;
  useEffect(() => {
    if (!ready || renderer.current === null || rings.store.items.size === 0) return;
    renderer.current.setGraph(model.nodes, model.edges, model.positions, { selected, selectedEdge, highlight: props.highlight ?? null }, { fit: model.fit, topPx: model.topPx, clearHop: z.clearHop, keepView: keepView.current && !empty });
    keepView.current = false;
    props.onZones?.({ clear: z.clearSet, fog: z.fogSet, beyond: z.beyond, clearHop: z.clearHop, capped: z.capped });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, model, props.highlight]);

  // `pick` (`:1036`): a fogged item selects its clear neighbour and says why. Selection keeps the zoom (§3.5) for the draw it
  // causes, so `keepView` is set only for a selection that changes: the draw effect is what spends it, and one left set by a
  // selection that draws nothing would keep the zoom on the next centre change (Back, a crumb, Center), which must be fitted.
  function pick(ref: string) {
    if (!z.clearSet.has(ref)) {
      const via = (rings.store.adj.get(ref) ?? []).map((x) => x.to).find((t) => z.clearSet.has(t));
      if (via !== undefined) {
        if (via !== selected) keepView.current = true;
        setSelected(via);
        setStatus(inScope(ref) ? `${label(ref)} is in the fog. Center on ${label(via)} to reach it.` : `${label(ref)} is outside the scope.`);
      }
      return;
    }
    if (ref !== selected || selectedEdge !== null) keepView.current = true;
    setSelected(ref);
    setSelectedEdge(null);
    setStatus('');
  }
  // `centre` (`:1040`) and `goTrail` (`:1041`)
  function centreOn(ref: string) {
    setSelectedEdge(null);
    if (ref === centre) return;
    setTrail((t) => (t.length === 0 ? [centre, ref] : [...t, ref]));
    setCentre(ref);
    setSelected(ref);
    setStatus('');
  }
  function goTrail(i: number) {
    const to = trail[i]!;
    const next = trail.slice(0, i + 1);
    setTrail(next.length <= 1 ? [] : next);
    setCentre(to);
    setSelected(to);
    setStatus('');
  }
  onPickRef.current = (e) => {
    if (e.kind === 'stage') return;
    if (e.kind === 'edge') {
      if (e.id !== selectedEdge) keepView.current = true; // selecting a link keeps the zoom too (§3.5), as `pick` does
      setSelectedEdge(e.id);
      setStatus('');
      return;
    }
    if (e.double) centreOn(e.ref);
    else pick(e.ref);
  };
  onHoverRef.current = (e) => {
    if (e.kind === 'edge') {
      const edge = storeRef.current.edges.get(e.id);
      if (edge) setTip({ text: edgeSentence(edge, labelRef.current), x: e.x, y: e.y });
    }
    if (e.kind === 'edge-leave') setTip(null);
  };
  /** The inspector's "Add <name> (n)" (`knowledge-graph-sigma.html:1064`): a project of a chosen workspace, or another workspace. */
  function addScope(key: ScopeKey) {
    // never one already chosen: an Add is offered only for what the scope leaves out
    if ('projectId' in key) setProjectIds((ids) => [...ids, key.projectId]);
    else setWorkspaceIds((ids) => [...ids, key.workspaceId]);
    setStatus('');
  }
  // "Remove link" (spec A's `ticket.link_removed`, through the host): the cached store drops the edge, and Undo puts it back
  // through `mergeRing` with no refetch (planner ruling 2026-10-04). The camera stays where it is either way, when the change
  // is drawn: if the view moved to another centre while the host answered, nothing is, so nothing is kept (the hook's bump
  // renders after this line).
  const removeLink =
    props.onRemoveLink === undefined
      ? undefined
      : async (edge: GraphEdgeView) => {
          const done = await props.onRemoveLink!(edge);
          if (rings.forget(edge.id)) keepView.current = true;
          setRemovedEdge(edge);
          return {
            undo: async () => {
              await done.undo();
              if (rings.restore(edge)) keepView.current = true;
            },
          };
        };
  function setSemantic(next: boolean) {
    setSemanticState(next);
    writeSemantic(next);
    if (!next && centre.startsWith('concept:')) {
      // §6.4: a concept centre goes away with the layer
      setCentre(props.centre);
      setTrail([]);
      setSelected(props.centre);
    } else if (!next && selected?.startsWith('concept:')) setSelected(centre);
    if (next !== semantic) keepView.current = true; // the segmented control answers a click on the chosen side too
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(OWNS_KEYS)) return;
    if (e.key === 'Escape') {
      if (props.onEscape?.() === true) return;
      if (trail.length > 0) goTrail(trail.length - 2);
      return;
    }
    if (phone || props.showHops === false) return;
    if (/^[1-4]$/.test(e.key)) setHops(Number(e.key) as 1 | 2 | 3 | 4);
    else if ((e.key === 'c' || e.key === 'C') && selected !== null) centreOn(selected);
  }

  const n = Math.max(0, z.clear.length - 1), f = z.fog.length;
  const fogTxt = f > 0 ? `, ${f} more in the fog` : '', outTxt = z.outN > 0 ? ` (${z.outN} outside the scope)` : '';
  const count = z.capped
    ? `The ${CLEAR_CAP} nearest are clear${fogTxt}${outTxt}, ${z.beyond} further out`
    : phone
      ? `${n} linked${fogTxt}${outTxt}`
      : reach === Number.POSITIVE_INFINITY
        ? `${n} items, everything connected${fogTxt}${outTxt}`
        : `${n} items within ${reach} hop${reach > 1 ? 's' : ''}${fogTxt}${outTxt}`;
  const firstLoad = rings.loading && rings.store.items.size === 0;
  const edgeView = selectedEdge === null ? undefined : (rings.store.edges.get(selectedEdge) ?? (removedEdge?.id === selectedEdge ? removedEdge : undefined));
  const selectedItem = selected === null ? undefined : rings.store.items.get(selected);
  // Empty with a link held means every chip carrying the centre's links is off: the walk follows only the chips that are on,
  // and a neighbour outside the scope is fog, not nothing. The far end must be held, as the walk requires.
  const chipsHideAll = empty && (rings.store.adj.get(centre) ?? []).some((x) => rings.store.items.has(x.to));
  // The chips the bar shows; "every link type is turned off" is said only when none of them is on, otherwise the chips that
  // carry the centre's links are off while another is on.
  const shownGroups = offered.filter((g) => semantic || g !== 'concepts');
  const everyChipOff = shownGroups.every((g) => !on.has(g));
  // The scope note names its cause. Each half re-asks `inGraphScope` with the other half opened up; the workspace is the
  // outer scope, so it wins when both exclude the centre.
  const outOfWorkspaces = centreItem !== undefined && !inGraphScope(centreItem, { workspaceIds, projectIds: [] });
  const outOfProjects = centreItem !== undefined && !inGraphScope(centreItem, { workspaceIds: centreItem.workspaceId === null ? [] : [centreItem.workspaceId], projectIds });
  const scopeNote = outOfWorkspaces
    ? `${label(centre)} is outside the workspaces you picked. It stays in the middle, and its links follow your scope.`
    : outOfProjects
      ? `${label(centre)} is outside the projects you picked. It stays in the middle, and its links follow your scope.`
      : null;
  const tipPos = tip === null || mountRef.current === null ? null : tooltipPosition(tip.x, tip.y, { width: Math.min(320, tip.text.length * 7 + 20), height: 28 }, mountRef.current.clientWidth);

  return (
    <div className={`gn-kg${phone ? ' gn-kg--phone' : ''}`} onKeyDown={onKeyDown}>
      <GraphBar
        phone={phone}
        scope={props.scope}
        workspaceIds={workspaceIds}
        projectIds={projectIds}
        onWorkspaces={(ids) => {
          setWorkspaceIds(ids);
          setProjectIds((p) => p.filter((id) => props.scope.workspaces.some((w) => ids.includes(w.id) && w.projects.some((x) => x.id === id))));
        }}
        onProjects={setProjectIds}
        hops={props.showHops === false || phone ? null : hops}
        onHops={setHops}
        semantic={semantic}
        onSemantic={setSemantic}
        groups={shownGroups}
        on={on}
        counts={model.counts}
        onToggle={(g) => {
          keepView.current = true;
          setOn((s) => {
            const t = new Set(s);
            if (t.has(g)) t.delete(g);
            else t.add(g);
            return t;
          });
        }}
        count={count}
        scopeNote={scopeNote}
      />
      <div className="gn-kg__body">
        <div className="gn-kg__canvas">
          <div
            ref={mountRef}
            className="gn-kg__mount"
            role="img"
            tabIndex={0}
            aria-label={`Knowledge Graph of items linked to ${label(centre)}`}
            data-kg-probe={props.createRenderer ? '' : undefined}
            // the edge sentence follows the pointer along its edge, as the mockup's does (`knowledge-graph-sigma.html:884`):
            // Sigma reports an edge once, on entering it (and leaving the canvas is Sigma's leaveEdge, 27.329)
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setTip((t) => (t === null ? t : { ...t, x: e.clientX - r.left, y: e.clientY - r.top }));
            }}
          />
          {firstLoad && (
            <SkeletonRegion label="Loading the Knowledge Graph" className="gn-kg__skeleton">
              <Skeleton shape="circle" width="6rem" height="6rem" />
            </SkeletonRegion>
          )}
          {empty && (
            <div className="gn-kg__empty">
              <p>{chipsHideAll ? (everyChipOff ? `Every link type is turned off. Turn one on to see ${label(centre)}'s links.` : `The link types that carry ${label(centre)}'s links are turned off. Turn one on to see them.`) : `Nothing is linked to ${label(centre)} yet.`}</p>
              {!chipsHideAll && centreItem?.kind === 'ticket' && props.onAddLink && (
                <button type="button" className="gn-button gn-button--primary" onClick={() => props.onAddLink!(centreItem)}>
                  Add link
                </button>
              )}
            </div>
          )}
          {trail.length > 0 && (
            <div className="gn-kg__trail">
              <button type="button" className="gn-button gn-kg__back" aria-label={`Back to ${label(trail[trail.length - 2]!)}`} onClick={() => goTrail(trail.length - 2)}>
                ‹ Back
              </button>
              {trail.map((ref, i) => (
                <button key={`${ref}-${i}`} type="button" className="gn-button gn-kg__crumb" aria-current={i === trail.length - 1} onClick={() => goTrail(i)}>
                  {label(ref)}
                </button>
              ))}
            </div>
          )}
          {z.beyond > 0 && (
            <button type="button" className="gn-button gn-kg__further" onClick={() => setStatus(`${z.beyond} items are further than the ${CLEAR_CAP} nearest. Turn off a link type, or Center closer to them.`)}>
              {`+${z.beyond} further out`}
            </button>
          )}
          {rings.failedHop !== null && (
            <p className="gn-kg__error" role="alert">
              Couldn&apos;t load the next hop.{' '}
              <button type="button" className="gn-button" onClick={rings.retry}>
                Retry
              </button>
            </p>
          )}
          {tip !== null && tipPos !== null && (
            <div className="gn-kg__tip" role="tooltip" style={{ transform: `translate(${tipPos.left}px, ${tipPos.top}px)` }}>
              {tip.text}
            </div>
          )}
          <div className="gn-kg__zoom" role="group" aria-label="Zoom">
            <button type="button" className="gn-button gn-kg__zoom-button" aria-label="Zoom in" onClick={() => renderer.current?.zoomBy(1.5)}>
              +
            </button>
            <button type="button" className="gn-button gn-kg__zoom-button" aria-label="Zoom out" onClick={() => renderer.current?.zoomBy(1 / 1.5)}>
              −
            </button>
            <button type="button" className="gn-button gn-kg__zoom-button" aria-label="Fit to view" onClick={() => renderer.current?.setCamera('fit')}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {/* The inspector (§3.5): a side column on a desktop, a card under the canvas on a phone; it never overlays or resizes the
            canvas. It is there before ring 1 too, and it holds the view's one live region. */}
        <aside className={`gn-kg-insp${phone ? ' gn-kg-insp--card' : ''}`} aria-label="Inspector">
          {edgeView !== undefined ? (
            <EdgeInspector
              key={edgeView.id}
              edge={edgeView}
              store={rings.store}
              label={label}
              onPick={pick}
              onCenter={centreOn}
              onRemoveLink={removeLink}
              canRemoveLink={props.canRemoveLink}
              status={status}
              setStatus={setStatus}
            />
          ) : selectedItem !== undefined ? (
            <Inspector
              item={selectedItem}
              centre={centre}
              store={rings.store}
              zones={z}
              on={on}
              inScope={inScope}
              workspaceIds={workspaceIds}
              scopeNames={scopeNames}
              phone={phone}
              label={label}
              canOpen={props.canOpen}
              onCenter={centreOn}
              onOpen={props.onOpen}
              onPick={pick}
              onAddScope={addScope}
              status={status}
            />
          ) : (
            <p className="gn-kg__status" aria-live="polite">
              {status}
            </p>
          )}
        </aside>
        {/* The keys line and the accessible list (§3.5): under the canvas, in its column, on a desktop, with the inspector
            spanning both rows beside them, so its height never moves the list; after the inspector when the view is one column. */}
        <div className="gn-kg__below">
          {!phone && props.showHops !== false && (
            <p className="gn-kg__keys">Keys: 1–4 hops, C center on the selected item, Esc back. Scroll or pinch to zoom, drag to pan, double-click an item to center on it.</p>
          )}
          {centreItem !== undefined && <GraphList centre={centre} store={rings.store} zones={z} selected={selectedEdge === null ? selected : null} label={label} onPick={pick} />}
        </div>
      </div>
    </div>
  );
}
