'use client';

import { useParams, useRouter } from 'next/navigation';
import { AttentionStrip, MyWork, useAttention, useMyWork } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../src/app-nav.js';
import { ShellRefusal } from '../../../../src/shell-refusal.js';
import { useAppServices } from '../../../../src/providers.js';
import {
  ExpiredSessionNotice,
  useSignInOnExpiredSession,
} from '../../../../src/expired-session.js';

export default function MyWorkPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const { dataSource } = useAppServices();
  const attention = useAttention(dataSource, workspaceId);
  const myWork = useMyWork(dataSource, workspaceId);

  // A 401 on EITHER read is a session that ended, not a refusal to answer, and
  // this page used to say the opposite: `Features.md` and case 3.86 both claimed
  // the redirect for the whole shell while only `app/workspaces/page.tsx` did it,
  // so an expired session here drew "My Work cannot be shown yet — HTTP 401 for
  // /v1/me/work". That names the wrong cause and offers no way out of it.
  const expired = useSignInOnExpiredSession([attention.error, myWork.error]);

  const openTicket = (ticketId: string) => {
    // My Work is cross-project; the sheet lives on the project page.
    const item =
      myWork.data?.assigned.find((candidate) => candidate.ticketId === ticketId) ??
      myWork.data?.inTransit.find((candidate) => candidate.ticketId === ticketId);
    if (item !== undefined) router.push(`/w/${workspaceId}/p/${item.projectId}?ticket=${ticketId}`);
  };

  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">My Work</h1>
      <div className="gn-shell__main">
        {/* BOTH reads on this page refuse against the shipped server, and each
            has its own falsehood if the plan's rendering is kept:
            `items={attention.data ?? []}` makes `AttentionStrip` return null,
            which reads as "nothing needs your attention", and My Work's
            `data !== null ? … : <p>Loading…</p>` spins forever. */}
        {expired ? (
          // ONE notice for the page, not one per failed read: two "your session
          // has ended" panels would describe two events where there was one.
          <ExpiredSessionNotice />
        ) : (
          <>
            {attention.error !== null ? (
              <ShellRefusal what="What needs your attention" message={attention.error} />
            ) : attention.data !== null ? (
              <AttentionStrip items={attention.data} onOpenTicket={openTicket} />
            ) : null}

            {myWork.error !== null ? (
              <ShellRefusal what="My Work" message={myWork.error} />
            ) : myWork.data !== null ? (
              <MyWork view={myWork.data} onOpenTicket={openTicket} />
            ) : (
              <p>Loading…</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
