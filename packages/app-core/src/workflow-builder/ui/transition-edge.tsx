import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useBuilderStore } from './builder-context.js';
import type { TransitionEdgeData } from './flow-graph.js';

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
