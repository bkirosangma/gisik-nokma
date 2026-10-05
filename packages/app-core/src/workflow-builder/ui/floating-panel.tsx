import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SegmentedControl } from '@gisik-nokma/ui';
import { useDraft } from './builder-context.js';
import { BuilderPanels } from './builder-panels.js';
import { IssuesPanel } from './issues-panel.js';
import { StateInspector } from './state-inspector.js';
import { SystemRulesPanel } from './system-rules-panel.js';
import { TransitionInspector } from './transition-inspector.js';

export type PanelTab = 'selection' | 'lists' | 'system' | 'issues';

const TABS: ReadonlyArray<{ value: PanelTab; label: string }> = [
  { value: 'selection', label: 'Selection' },
  { value: 'lists', label: 'States & transitions' },
  { value: 'system', label: 'System rules' },
  { value: 'issues', label: 'Issues' },
];

/** The desktop panel's width range and resting width, in px (spec §4.3). A key press on the handle moves it one grid step. */
export const PANEL_MIN = 280;
export const PANEL_MAX = 480;
const PANEL_DEFAULT = 360;
const PANEL_STEP = 16;

/** A stored or dragged width as one the panel may take: a number in 280–480, the default for anything that is not a number. */
export function clampPanelWidth(value: unknown): number {
  const width = typeof value === 'number' ? value : Number(value);
  if (typeof value === 'string' && value.trim() === '') return PANEL_DEFAULT;
  if (!Number.isFinite(width)) return PANEL_DEFAULT;
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(width)));
}

function readWidth(key: string): number {
  try {
    const stored = window.sessionStorage.getItem(key);
    return stored === null ? PANEL_DEFAULT : clampPanelWidth(stored);
  } catch {
    return PANEL_DEFAULT;
  }
}

function SelectionTab() {
  const { selection } = useDraft();
  if (selection.kind === 'state') return <StateInspector key={selection.stateId} stateId={selection.stateId} />;
  if (selection.kind === 'transition') return <TransitionInspector key={selection.index} index={selection.index} />;
  return <p className="gn-wf-panel__empty">Select a state or a transition</p>;
}

/**
 * The full-screen editor's panel (G-9 T5, spec §4.3): the builder's existing editors under four tabs, over the right of the canvas. A
 * labelled `region`, not a dialog: nothing else on screen is made inert while it is open, so the canvas stays usable beside it. Its
 * width (280–480, from a drag or the arrow keys on the left-edge handle) is remembered for the session under `widthKey`. With `phone`
 * it is a bottom sheet across the window instead, with no handle (spec §4.5). The screen owns `open` and `tab`: a selection and the
 * Issues badge open it, × and the Escape ladder close it.
 */
export function FloatingPanel(props: {
  open: boolean;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  phone: boolean;
  widthKey: string;
}) {
  const [width, setWidth] = useState(() => readWidth(props.widthKey));
  const drag = useRef<{ x: number; width: number } | null>(null);
  if (!props.open) return null;

  const resize = (next: number) => {
    const clamped = clampPanelWidth(next);
    setWidth(clamped);
    try {
      window.sessionStorage.setItem(props.widthKey, String(clamped));
    } catch {
      // storage unavailable: the width still holds for this mount
    }
  };
  // The handle is on the LEFT edge, so moving it left (or ArrowLeft) widens the panel.
  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? PANEL_STEP : event.key === 'ArrowRight' ? -PANEL_STEP : 0;
    if (step === 0) return;
    event.preventDefault();
    resize(width + step);
  };
  const onHandleDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onHandleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current !== null) resize(drag.current.width + drag.current.x - event.clientX);
  };
  const onHandleUp = () => {
    drag.current = null;
  };

  return (
    <aside
      role="region"
      aria-label="Workflow panel"
      className={props.phone ? 'gn-wf-panel gn-wf-panel--sheet' : 'gn-wf-panel'}
      style={props.phone ? undefined : { width: `${width}px` }}
    >
      {props.phone ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the panel"
          aria-valuenow={width}
          aria-valuemin={PANEL_MIN}
          aria-valuemax={PANEL_MAX}
          tabIndex={0}
          className="gn-wf-panel__resize"
          onKeyDown={onHandleKey}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
      )}
      <div className="gn-wf-panel__head">
        <SegmentedControl options={TABS} value={props.tab} onChange={props.onTab} aria-label="Panel" className="gn-wf-panel__tabs" fade />
        <button type="button" className="gn-wf-panel__close" aria-label="Close panel" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="gn-wf-panel__body">
        {props.tab === 'selection' ? <SelectionTab /> : null}
        {props.tab === 'lists' ? <BuilderPanels /> : null}
        {props.tab === 'system' ? <SystemRulesPanel /> : null}
        {props.tab === 'issues' ? <IssuesPanel /> : null}
      </div>
    </aside>
  );
}
