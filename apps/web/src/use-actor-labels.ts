'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { actorLabelFrom, UNKNOWN_PERSON, type Actor, type RosterMember } from '@gisik-nokma/app-core';
import { useAppServices } from './providers.js';

type Sources = { members: RosterMember[]; names: Actor[] };

/**
 * `userId → what to call them` for a screen that holds actor ids from SEVERAL
 * workspaces at once — the inbox, whose rows carry `workspaceId` but whose
 * headline formatter (`notificationHeadline`) is handed only an actor id.
 *
 * ## Why one resolver over every workspace, not one per row
 *
 * A user id is a ULID and a person's name is theirs, not the workspace's, so
 * "who is this id" has one answer wherever it is asked; the formatter needs no
 * workspace to ask. The reads ARE per workspace (`getMembers`, `getActorNames`
 * are both keyed by it), so each workspace on screen is read once and kept.
 *
 * ## Both sources, each allowed to fail
 *
 * The roster carries the email fallback, the names-only read carries the guests
 * a plain member's roster omits and the former members it marks `removed`
 * (`actorLabelFrom` orders them). The roster refuses a guest viewer (the
 * names-only read serves one only the people on tickets they can see — R3) and
 * either may fail on the wire; a failed read is an empty one, and an id nobody
 * names reads `Unknown person` (R3 N4), never the id — so a headline is never
 * withheld for want of a name, and never shows a ULID as one.
 */
export function useActorLabels(workspaceIds: readonly string[]): (userId: string) => string {
  const { dataSource } = useAppServices();
  const [bySpace, setBySpace] = useState<ReadonlyMap<string, Sources>>(new Map());
  const requested = useRef(new Set<string>());
  const wanted = useMemo(() => [...new Set(workspaceIds)].sort(), [workspaceIds.join('|')]);

  useEffect(() => {
    let cancelled = false;
    for (const workspaceId of wanted) {
      if (requested.current.has(workspaceId)) continue;
      requested.current.add(workspaceId);
      void Promise.all([
        dataSource.query.getMembers(workspaceId).catch(() => [] as RosterMember[]),
        dataSource.query.getActorNames(workspaceId).catch(() => [] as Actor[]),
      ]).then(([members, names]) => {
        if (cancelled) {
          // Let a later effect run ask again: this answer is being dropped.
          requested.current.delete(workspaceId);
          return;
        }
        setBySpace((prior) => new Map(prior).set(workspaceId, { members, names }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [dataSource, wanted]);

  return useMemo(() => {
    const all = [...bySpace.values()];
    return (userId: string): string => {
      for (const { members, names } of all) {
        const label = actorLabelFrom(userId, members, names);
        if (label !== null && label !== userId) return label;
      }
      return UNKNOWN_PERSON;
    };
  }, [bySpace]);
}
