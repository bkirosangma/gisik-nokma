'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GroupRow } from '@gisik-nokma/domain';
import { useAppServices } from './providers.js';

/**
 * The workspace's groups for a project form (prefixes and groups plan Task 10), read while `active` (the
 * form is open) and `null` while they load or when the read refuses — a form without a list offers no
 * group field and leaves the group as it was, where a stale or invented list would let a person file a
 * project under a group nobody checked.
 *
 * `reread()` asks again and returns when the new list has arrived: the form that submitted owns the
 * re-read after a `group.name-taken` refusal (22.187), so the picker can adopt the group someone else
 * made.
 */
export function useWorkspaceGroups(workspaceId: string, active: boolean): { groups: GroupRow[] | null; reread: () => void } {
  const { dataSource } = useAppServices();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [asks, setAsks] = useState(0);

  useEffect(() => {
    if (!active) {
      setGroups(null); // a form opened later starts from a fresh read, not the last one
      return;
    }
    let current = true;
    dataSource.query.getGroups(workspaceId).then(
      (rows) => {
        if (current) setGroups(rows);
      },
      () => {
        if (current) setGroups(null);
      },
    );
    return () => {
      current = false;
    };
  }, [dataSource, workspaceId, active, asks]);

  const reread = useCallback(() => setAsks((count) => count + 1), []);
  return { groups, reread };
}
