import { memo, useDeferredValue, useMemo, type CSSProperties, type ReactElement } from 'react';
import type { Draw, DrawBar, DrawDiamond, DrawEdge, View } from './draw-types.js';
import type { DrawIndex } from './draw-index.js';

export type TimelinePainterProps = {
  draws: readonly Draw[];
  index: DrawIndex;
  view: View;
  overscan: number;
  width: number;
  height: number;
  selectedId?: string | null;
  onPick?: (ticketId: string) => void; // the TICKET id, never the draw id (planner ruling 2026-10-04)
  className?: string;
};

const box = (b: Draw['b']): CSSProperties => ({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });

/**
 * Memoised: a window change re-renders the painter with ~500 primitives of which only the ones entering the window are new.
 * Without `memo` every mounted bar re-renders on every change; measured on the Pixel 7 proxy (29.301, 4x CPU throttle) that
 * made each change 62-103 ms of render and commit, every one a frame over the 50 ms bar.
 */
const Bar = memo(function Bar({ d, selected, onPick }: { d: DrawBar; selected: boolean; onPick?: (ticketId: string) => void }): ReactElement {
  return (
    <button
      type="button" data-draw-id={d.id} data-style={d.style} data-pass-rank={d.passRank} aria-pressed={selected} aria-label={d.ariaLabel} data-dim={d.dim === true} data-draft={d.draft}
      className="gn-tlg-bar" style={box(d.b)} onClick={() => onPick?.(d.ticketId)}
    >
      {d.mark !== null && <span className="gn-tlg-mark" aria-hidden="true">{d.mark === 'done' ? '✓' : '▶'}</span>}
      <span className="gn-tlg-key" data-outside={d.keyOutside}>{d.draft ? 'Draft' : (d.key ?? '')}</span>
      {d.long && <span className="gn-tlg-title">{d.title}</span>}
      {d.chip !== null && <span className="gn-tlg-chip">{d.chip}</span>}
      {d.pin !== null && <span className="gn-tlg-pin" aria-hidden="true" data-at={d.pinAt} data-notes={d.pin.notes} data-attachments={d.pin.attachments} />}
    </button>
  );
});
const Diamond = memo(function Diamond({ d, selected, onPick }: { d: DrawDiamond; selected: boolean; onPick?: (ticketId: string) => void }): ReactElement {
  return (
    <button type="button" data-draw-id={d.id} data-style={d.style} aria-pressed={selected} aria-label={d.ariaLabel} className="gn-tlg-diamond" style={box(d.b)} onClick={() => onPick?.(d.ticketId)}>
      {d.mark !== null && <span className="gn-tlg-mark" aria-hidden="true">{d.mark === 'done' ? '✓' : '▶'}</span>}
      {d.revised && <span className="gn-tlg-revised">revised</span>}
    </button>
  );
});

/**
 * Mounts only the primitives inside `view` widened by `overscan` (spec VP: "window the DOM"). Edges go in ONE svg per render, not one per edge; the
 * scroller (Part 1's adapter, through `attachDriver`) moves the content, so this component re-renders when the quantised window changes, not per frame.
 */
export function TimelinePainter(p: TimelinePainterProps): ReactElement {
  const view = useDeferredValue(p.view);
  const win: View = { x0: view.x0 - p.overscan, x1: view.x1 + p.overscan, y0: view.y0 - p.overscan, y1: view.y1 + p.overscan };
  const mounted = useMemo(() => p.index.query(win), [p.index, win.x0, win.x1, win.y0, win.y1]); // eslint-disable-line react-hooks/exhaustive-deps
  const edges = mounted.filter((d): d is DrawEdge => d.kind === 'edge');
  return (
    <div className={`gn-tlg-canvas ${p.className ?? ''}`} style={{ width: p.width, height: p.height }} data-mounted={mounted.length}>
      {mounted.map((d) => {
        switch (d.kind) {
          case 'bar': return <Bar key={d.id} d={d} selected={p.selectedId === d.ticketId || p.selectedId === d.id} onPick={p.onPick} />;
          case 'diamond': return <Diamond key={d.id} d={d} selected={p.selectedId === d.ticketId || p.selectedId === d.id} onPick={p.onPick} />;
          case 'connector': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-connector" data-dashed={d.dashed} style={box(d.b)} />;
          case 'heading': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-heading" style={box(d.b)}>{d.text}</div>;
          case 'strip': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-strip" style={box(d.b)}>{d.text}</div>;
          case 'today': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-today" style={box(d.b)}><span>{d.text}</span></div>;
          case 'weekend': return <div key={d.id} data-draw-id={d.id} className="gn-tlg-weekend" style={box(d.b)} />;
          default: return null;
        }
      })}
      {edges.length > 0 && (
        <svg className="gn-tlg-edges" width={p.width} height={p.height} aria-hidden="true">
          {edges.map((e) => (
            <g key={e.id} data-draw-id={e.id} data-loop={e.loop} data-kind={e.edgeKind} data-dim={e.dim === true}>
              <path d={e.d} className="gn-tlg-edge" />
              {e.label !== null && <text x={e.label.x} y={e.label.y} className="gn-tlg-edge-label">{e.label.text}</text>}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
