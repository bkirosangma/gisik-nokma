import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Select } from '@gisik-nokma/ui';
import { useBuilderEnv, useBuilderStore } from './builder-context.js';
import type { StateNodeData } from './flow-graph.js';

export function StateNode(props: NodeProps) {
  const data = props.data as StateNodeData;
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const className = [
    'gn-state-node',
    `gn-state-node--${data.category}`,
    data.blocked ? 'gn-state-node--blocked' : '',
    props.selected ? 'gn-state-node--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={className}
      data-testid={`state-node-${data.stateId}`}
      onClick={() => store.actions.select({ kind: 'state', stateId: data.stateId })}
    >
      <Handle type="target" position={Position.Left} />
      <div className="gn-state-node__header">
        <span className="gn-state-node__name">{data.name}</span>
        {data.isInitial ? <span className="gn-state-node__initial-badge">Start</span> : null}
      </div>
      <div
        className="nodrag gn-state-node__category"
        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <span>Category</span>
        <Select
          options={[
            { value: 'open', label: 'open' },
            { value: 'active', label: 'active' },
            { value: 'terminal', label: 'terminal' },
          ]}
          value={data.category}
          onChange={(next) => store.actions.setStateCategory(data.stateId, next as StateNodeData['category'])}
          disabled={!canAuthor}
          aria-label="Category"
        />
      </div>
      <label className="gn-state-node__blocked">
        <input
          type="checkbox"
          aria-label="Blocked"
          className="nodrag"
          disabled={!canAuthor}
          checked={data.blocked}
          onClick={(mouseEvent) => mouseEvent.stopPropagation()}
          onChange={(changeEvent) => store.actions.setStateBlocked(data.stateId, changeEvent.target.checked)}
        />
        <span>Blocked</span>
      </label>
      <Handle type="source" position={Position.Right} isConnectable={canAuthor} />
    </div>
  );
}
