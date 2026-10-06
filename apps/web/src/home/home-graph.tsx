'use client';
import { useMemo, useState } from 'react';
import { GRAPH_CHIP_ORDER, type GraphGroup, type GraphItemView, type HomeNumberKey, type HomeResponse } from '@gisik-nokma/domain';
// Types only: erased at build, so nothing from the package root reaches the server (27.657).
import type { GraphSource, GraphZonesSummary, HopChoice, ScopeChoices } from '@gisik-nokma/knowledge-graph';
import { kgNodeId } from '@gisik-nokma/knowledge-graph/ids'; // C's sigma-free entry (planner ruling 2026-10-04 Q6)
import { Button, SegmentedControl } from '@gisik-nokma/ui';
import { HomeGraphCanvas } from './home-graph-canvas.js';
import { highlightNote } from './home-highlight-note.js';

const KIND: Record<HomeNumberKey, 'ticket' | 'person' | 'note'> = {
  tickets: 'ticket',
  open: 'ticket',
  pastDue: 'ticket',
  dueSoon: 'ticket',
  members: 'person',
  notes: 'note',
};
/** A number's ids as the graph's node ids (`kind:id`, the form `GET /v1/graph/neighbours` answers in). */
export function homeNodeIds(key: HomeNumberKey, ids: readonly string[]): Set<string> {
  return new Set(ids.map((id) => kgNodeId(KIND[key], id)));
}

/**
 * Home's chips: the view's default leaves `projects` out (the mockup offers it only on a workspace centre). Home is
 * centred on its workspace, so it passes the whole display order (planner ruling 2026-10-04 Q5).
 */
const HOME_GROUPS: readonly GraphGroup[] = GRAPH_CHIP_ORDER;

type StartFrom = 'workspace' | 'me';
const START_FROM = [
  { value: 'workspace', label: 'This workspace' },
  { value: 'me', label: 'Me' },
] as const;

export type HomeGraphProps = {
  workspaceId: string;
  viewerId: string;
  home: HomeResponse | null;
  pressed: HomeNumberKey | null;
  onEscape: () => boolean;
  phone: boolean;
  source: GraphSource;
  scope: ScopeChoices;
  onOpen: (item: GraphItemView) => void;
  canOpen: (item: GraphItemView) => boolean;
};

/**
 * Home's Knowledge Graph (spec E §2.2–§2.3): spec C's view, centred on the workspace or on the viewer (Start from), with
 * the pressed number's items lit. The note leads the row under the numbers and says how many are lit and how many
 * are further out than the graph shows, with Show more hops to bring them in. On a phone the view takes its phone
 * form (`config: 'phone'`: one clear hop, the folded bar, the inspector card), as the mockup's phone Home does; the
 * view forces one hop there, and Home offers no hop control.
 */
export function HomeGraph({ workspaceId, viewerId, home, pressed, onEscape, phone, source, scope, onOpen, canOpen }: HomeGraphProps) {
  const [from, setFrom] = useState<StartFrom>('workspace');
  // The default follows the CURRENT breakpoint (phone 1, desktop 2) until the user picks; then the pick holds
  // across resizes (planner ruling 2026-10-04 Q8). Never `useState(phone ? 1 : 2)`: that reads the breakpoint once.
  const [picked, setPicked] = useState<HopChoice | null>(null);
  const hops: HopChoice = picked ?? (phone ? 1 : 2);
  // null until the view reports its first layout: before that nothing is known to be lit, and the note says nothing.
  const [zones, setZones] = useState<GraphZonesSummary | null>(null);
  // The pressed number's ids as node ids, ONE set per answer: a reload with new ids re-lights (Review Focus 5).
  const lit = useMemo(
    () => (pressed === null || home === null ? null : { key: pressed, home, ids: homeNodeIds(pressed, home.ids[pressed]) }),
    [home, pressed],
  );
  const note =
    lit === null || zones === null
      ? null
      : highlightNote({
          key: lit.key,
          total: lit.home.counts[lit.key] ?? 0,
          lit: [...lit.ids].filter((id) => zones.clear.has(id)).length,
          further: zones.fog.size + zones.beyond, // planner ruling 2026-10-04 Q4
          dueSoonDays: lit.home.dueSoonDays,
        });
  // `'all'` is never compared numerically (planner ruling 2026-10-04 Q7).
  const canRaise = hops !== 'all' && hops < 4;
  return (
    <section className="gn-home__graph" aria-label="Knowledge Graph">
      <div className="gn-home__graph-head">
        <p className="gn-home__note" aria-live="polite">
          <span className="gn-home__note-text">{note?.text ?? ''}</span>
          {note !== null && note.further > 0 && !phone && canRaise ? (
            // `canRaise` narrows `hops` to 1–3 here, so the next is 2–4.
            <Button onClick={() => setPicked((hops + 1) as HopChoice)}>Show more hops</Button>
          ) : null}
        </p>
        <div className="gn-home__from">
          <span className="gn-home__from-label" aria-hidden="true">
            Start from
          </span>
          <SegmentedControl<StartFrom> aria-label="Start from" options={START_FROM} value={from} onChange={setFrom} />
        </div>
      </div>
      <HomeGraphCanvas
        centre={from === 'me' ? kgNodeId('person', viewerId) : kgNodeId('workspace', workspaceId)}
        config={phone ? 'phone' : 'home'}
        source={source}
        scope={scope}
        defaultWorkspaceIds={[workspaceId]}
        groups={HOME_GROUPS}
        showHops={false}
        hops={hops}
        onHopsChange={setPicked}
        highlight={lit?.ids ?? null}
        onZones={setZones}
        onEscape={onEscape}
        onOpen={onOpen}
        canOpen={canOpen}
      />
    </section>
  );
}
