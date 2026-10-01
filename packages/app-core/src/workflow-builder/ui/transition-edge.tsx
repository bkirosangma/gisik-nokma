import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useBuilderStore } from './builder-context.js';
import type { TransitionEdgeData } from './flow-graph.js';

/**
 * W1a (2026-10-01): a transition with no conditions draws a 0x0 label, and the label was the only click target, so
 * the arrow could not be selected from the canvas. Every edge now carries its own invisible stroke, this wide,
 * that selects the transition; React Flow's own 20px interaction path is switched off (`interactionWidth={0}`) so
 * there is one hit area, ours, and it is the one that writes the draft store's selection.
 */
const EDGE_HIT_WIDTH = 16;

export function TransitionEdge(props: EdgeProps) {
  const data = props.data as TransitionEdgeData;
  const store = useBuilderStore();
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        className={`gn-transition-edge${props.selected ? ' gn-transition-edge--selected' : ''}`}
        interactionWidth={0}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={EDGE_HIT_WIDTH}
        pointerEvents="stroke"
        data-testid={`transition-hit-${data.index}`}
        onClick={() => store.actions.select({ kind: 'transition', index: data.index })}
      />
      <EdgeLabelRenderer>
        <div
          className={`gn-transition-edge__label${props.selected ? ' gn-transition-edge__label--selected' : ''}${data.summaries.length === 0 ? ' gn-transition-edge__label--empty' : ''}`}
          data-testid={`transition-label-${data.index}`}
          onClick={() => store.actions.select({ kind: 'transition', index: data.index })}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data.summaries.map((summary, at) => (
            <div className="gn-transition-edge__rule" key={at}>
              {summary}
            </div>
          ))}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
