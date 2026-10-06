'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { MyWorkPageShell } from '../../../../src/skeletons/page-shells.js';

/**
 * THE OLD ROUTE, KEPT AS A REDIRECT (my-work-global T4, case 30.040).
 *
 * My work is global now (`app/my-work/page.tsx`, spec D4), so this path only sends the reader
 * there. It stays because people hold it: bookmarks, links pasted into chat, the browser's own
 * history. A redirect that dropped what the link was FOR would break exactly those, so a deep
 * link keeps its ticket and gains the workspace this path carried, because the global page's
 * sheet needs both: `?ticket=<id>` becomes `?ticket=<id>&ws=<workspaceId>`.
 *
 * - **`replace`, not `push`:** the old URL is not left in the history, so Back does not land
 *   on a page that only bounces forward again.
 * - **Both values are encoded,** so a ticket value holding `&` or `=` cannot add a parameter.
 * - **A client redirect,** because the page tree is client-rendered and `useSearchParams` is
 *   where the ticket lives; its Suspense boundary is the one `next build` requires, and both
 *   it and the moment before the effect runs paint the new page's own shell.
 */
export default function OldMyWorkRoute() {
  return (
    <Suspense fallback={<MyWorkPageShell />}>
      <RedirectToGlobalMyWork />
    </Suspense>
  );
}

function RedirectToGlobalMyWork() {
  const router = useRouter();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const ticket = useSearchParams().get('ticket');
  useEffect(() => {
    router.replace(
      ticket === null
        ? '/my-work'
        : `/my-work?ticket=${encodeURIComponent(ticket)}&ws=${encodeURIComponent(workspaceId)}`,
    );
  }, [router, ticket, workspaceId]);
  return <MyWorkPageShell />;
}
