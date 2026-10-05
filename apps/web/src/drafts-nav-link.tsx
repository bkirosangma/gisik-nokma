'use client';

import Link from 'next/link';
import type { AriaAttributes } from 'react';
import { DRAFTS_NAV_LABEL, draftsNavName, useMyDrafts } from '@gisik-nokma/app-core';
import { NavPending } from './nav-pending.js';
import { useAppServices, useSessionStatus } from './providers.js';

/**
 * The Drafts entry (drafts plan, Task 8, spec §12.2): beside My work, with the count of the viewer's own drafts in this
 * workspace. The read is gated on a session for the reason `InboxNavLink` states: the nav renders on pages a signed-out
 * viewer can reach, and an ungated read there is a 401 on a timer. The count lives in the accessible name too (a number
 * drawn only in a badge is colour and shape alone).
 */
export function DraftsNavLink({ workspaceId, current }: { workspaceId: string; current?: AriaAttributes['aria-current'] }) {
  const session = useSessionStatus();
  return session.kind === 'signed-in' ? (
    <CountedDraftsLink workspaceId={workspaceId} current={current} />
  ) : (
    <Link href={`/w/${workspaceId}/drafts`} aria-current={current}>
      <NavPending>{DRAFTS_NAV_LABEL}</NavPending>
    </Link>
  );
}

function CountedDraftsLink({ workspaceId, current }: { workspaceId: string; current?: AriaAttributes['aria-current'] }) {
  const { dataSource } = useAppServices();
  const count = useMyDrafts(dataSource, workspaceId).data?.length ?? 0;
  return (
    <Link href={`/w/${workspaceId}/drafts`} aria-current={current} aria-label={draftsNavName(count)}>
      <NavPending>{DRAFTS_NAV_LABEL}</NavPending>
      {count > 0 ? (
        <span className="gn-nav__count" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
