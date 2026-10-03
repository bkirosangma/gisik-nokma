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
 * `loading` is the other half of that `null` (smoothness T8, case 25.135): true from the moment the form opens until the read has
 * ANSWERED OR REFUSED, so a form can draw a skeleton for the field while a read is in flight and nothing at all once it refused.
 * A `null` list alone cannot say which of the two it is.
 *
 * `reread()` asks again and returns when the new list has arrived: the form that submitted owns the
 * re-read after a `group.name-taken` refusal (22.187), so the picker can adopt the group someone else
 * made.
 */
export function useWorkspaceGroups(
  workspaceId: string,
  active: boolean,
): { groups: GroupRow[] | null; loading: boolean; reread: () => void } {
  const { dataSource } = useAppServices();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [settled, setSettled] = useState(false);
  const [asks, setAsks] = useState(0);

  useEffect(() => {
    if (!active) {
      setGroups(null); // a form opened later starts from a fresh read, not the last one
      setSettled(false);
      return;
    }
    let current = true;
    dataSource.query.getGroups(workspaceId).then(
      (rows) => {
        if (!current) return;
        setGroups(rows);
        setSettled(true);
      },
      () => {
        if (!current) return;
        setGroups(null);
        setSettled(true);
      },
    );
    return () => {
      current = false;
    };
  }, [dataSource, workspaceId, active, asks]);

  const reread = useCallback(() => setAsks((count) => count + 1), []);
  return { groups, loading: active && !settled, reread };
}
