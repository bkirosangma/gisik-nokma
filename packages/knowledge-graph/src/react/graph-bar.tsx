'use client';
import { GROUP_LABEL, type GraphGroup } from '@gisik-nokma/domain';
import { SegmentedControl, Select } from '@gisik-nokma/ui';
import type { HopChoice, ScopeChoices } from './types.js';

const HOP_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: 'all', label: 'Everything' },
] as const;
const SEMANTIC_OPTIONS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const;

export type GraphBarProps = {
  phone: boolean;
  scope: ScopeChoices;
  workspaceIds: readonly string[];
  projectIds: readonly string[];
  onWorkspaces: (ids: string[]) => void;
  onProjects: (ids: string[]) => void;
  /** null = no Hops control (a phone, or Home's own). */
  hops: HopChoice | null;
  onHops: (hops: HopChoice) => void;
  semantic: boolean;
  onSemantic: (on: boolean) => void;
  /** The chips shown, in display order (Concepts is left out while the semantic layer is Off). */
  groups: readonly GraphGroup[];
  on: ReadonlySet<GraphGroup>;
  counts: Partial<Record<GraphGroup, number>>;
  onToggle: (group: GraphGroup) => void;
  count: string;
  scopeNote: string | null;
};

/**
 * The view's bar, ported from the mockup's (`knowledge-graph-sigma.html:722-747`): the scope pickers, Hops, the
 * semantic switch, the count, and the link chips (the legend IS the control). On a phone everything but the count folds
 * into "Scope and links" (§5), whose summary says what is chosen (`:956`).
 */
export function GraphBar(props: GraphBarProps) {
  const chosen = props.scope.workspaces.filter((w) => props.workspaceIds.includes(w.id));
  const workspaceOptions = props.scope.workspaces.map((w) => ({ value: w.id, label: w.name, description: `${w.projects.length} projects` }));
  const projectOptions = chosen.flatMap((w) => w.projects.map((p) => ({ value: p.id, label: p.name, description: w.name })));

  const pickers = (
    <>
      <div className="gn-kg__pick">
        <span className="gn-kg__label" aria-hidden="true">Workspaces</span>
        <Select
          multiple
          aria-label="Workspaces"
          options={workspaceOptions}
          value={[...props.workspaceIds]}
          // at least one workspace stays chosen: a change that empties it is refused
          onChange={(ids) => {
            if (ids.length > 0) props.onWorkspaces(ids);
          }}
        />
      </div>
      <div className="gn-kg__pick">
        <span className="gn-kg__label" aria-hidden="true">Projects</span>
        <Select multiple aria-label="Projects" placeholder="All projects" options={projectOptions} value={[...props.projectIds]} onChange={props.onProjects} />
      </div>
    </>
  );
  const semantic = (
    <div className="gn-kg__reach">
      <span className="gn-kg__label" aria-hidden="true">Semantic layer</span>
      <SegmentedControl aria-label="Semantic layer" options={SEMANTIC_OPTIONS} value={props.semantic ? 'on' : 'off'} onChange={(v) => props.onSemantic(v === 'on')} />
    </div>
  );
  const chips = (
    <div className="gn-kg__chips" role="group" aria-label="Show links">
      {props.groups.map((g) => {
        const pressed = props.on.has(g);
        return (
          <button key={g} type="button" className="gn-button gn-kg__chip" aria-pressed={pressed} onClick={() => props.onToggle(g)}>
            <span className={`gn-kg__swatch gn-kg__swatch--${g}`} aria-hidden="true" />
            {GROUP_LABEL[g]}
            <span className="gn-kg__chip-n">{props.counts[g] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
  const count = (
    <p className="gn-kg__count" aria-live="polite">
      {props.count}
    </p>
  );
  // The note's slot is always there, one line high and empty while the centre is in scope, as the board's scope row is
  // (`gn-project__scope-row`): the note arrives on its own after ring 1, so a slot that came with it would move the canvas
  // (27.367, planner 2026-10-05). Only the text is conditional: the same node holds the note and the empty band.
  const note = <p className="gn-kg__scope-note">{props.scopeNote}</p>;

  if (props.phone) {
    const picked = chosen.flatMap((w) => w.projects).filter((p) => props.projectIds.includes(p.id));
    const summary = `${chosen.map((w) => w.name).join(', ')}, ${picked.length > 0 ? picked.map((p) => p.name).join(', ') : 'all projects'}; ${props.groups.filter((g) => props.on.has(g)).length} of ${props.groups.length} link types`;
    return (
      <div className="gn-kg__bar">
        <details className="gn-kg__fold">
          <summary>
            <span>Scope and links</span>
            <span className="gn-kg__fold-summary">{summary}</span>
          </summary>
          <div className="gn-kg__row">{pickers}</div>
          <div className="gn-kg__row">{chips}</div>
          <div className="gn-kg__row">{semantic}</div>
        </details>
        {count}
        {note}
      </div>
    );
  }
  return (
    <div className="gn-kg__bar">
      <div className="gn-kg__row">
        {pickers}
        {props.hops !== null && (
          <div className="gn-kg__reach">
            <span className="gn-kg__label" aria-hidden="true">Hops</span>
            <SegmentedControl
              aria-label="Hops"
              options={HOP_OPTIONS}
              value={String(props.hops) as (typeof HOP_OPTIONS)[number]['value']}
              onChange={(v) => props.onHops(v === 'all' ? 'all' : (Number(v) as 1 | 2 | 3 | 4))}
            />
          </div>
        )}
        {semantic}
        {count}
      </div>
      <div className="gn-kg__row">{chips}</div>
      {note}
    </div>
  );
}
