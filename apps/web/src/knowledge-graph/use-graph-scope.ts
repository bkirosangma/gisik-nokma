'use client';

import { useEffect, useState } from 'react';
import type { ScopeChoices } from '@gisik-nokma/knowledge-graph';
import { useAppServices } from '../providers.js';

export type GraphScopeRead = { scope: ScopeChoices | null; error: string | null };

/**
 * The scope pickers' options: the viewer's workspaces and their live projects (`getMyWorkspaces`,
 * `WorkspaceRef.projects`), archived ones left out. A refused read is answered as the refusal, never as an endless
 * loading box.
 */
export function useGraphScope(): GraphScopeRead {
  const { dataSource } = useAppServices();
  const [read, setRead] = useState<GraphScopeRead>({ scope: null, error: null });
  useEffect(() => {
    let dead = false;
    dataSource.query.getMyWorkspaces().then(
      (list) => {
        if (dead) return;
        const workspaces = list
          .filter((w) => !w.archived)
          .map((w) => ({ id: w.id, name: w.name, projects: w.projects.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name })) }));
        setRead({ scope: { workspaces }, error: null });
      },
      (cause: unknown) => {
        if (!dead) setRead({ scope: null, error: cause instanceof Error ? cause.message : String(cause) });
      },
    );
    return () => {
      dead = true;
    };
  }, [dataSource]);
  return read;
}
