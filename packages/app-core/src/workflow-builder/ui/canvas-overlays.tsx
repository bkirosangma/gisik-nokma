import { ViewportPortal } from '@xyflow/react';
import type { Guide } from '../snap.js';

/** The alignment lines and the dashed "where you are pointing" outline of a drag, drawn in flow coordinates so they zoom with the board. */
export function CanvasOverlays(props: {
  guides: Guide[];
  outline: { x: number; y: number; width: number; height: number } | null;
}) {
  return (
    <ViewportPortal>
      {props.guides.map((guide) => (
        <div
          key={guide.axis}
          className="gn-canvas-guide"
          data-axis={guide.axis}
          aria-hidden="true"
          style={
            guide.axis === 'y'
              ? { transform: `translate(-5000px, ${guide.at}px)`, width: 10000 }
              : { transform: `translate(${guide.at}px, -5000px)`, height: 10000 }
          }
        />
      ))}
      {props.outline ? (
        <div
          className="gn-canvas-outline"
          aria-hidden="true"
          style={{
            transform: `translate(${props.outline.x}px, ${props.outline.y}px)`,
            width: props.outline.width,
            height: props.outline.height,
          }}
        />
      ) : null}
    </ViewportPortal>
  );
}
