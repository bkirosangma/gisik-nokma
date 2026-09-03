import { Handle, Position } from '@xyflow/react';
import { useBuilderEnv } from './builder-context.js';

/** The distinguished source for from-any ('*') transitions — a real node so authors can draw from it. */
export function AnyStateNode() {
  const { canAuthor } = useBuilderEnv();
  return (
    <div className="gn-any-state-node">
      <div className="gn-any-state-node__title">Any state</div>
      <div className="gn-any-state-node__hint">drag from here for a from-anywhere move</div>
      <Handle type="source" position={Position.Right} isConnectable={canAuthor} />
    </div>
  );
}
