'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@gisik-nokma/ui';
import { authClient } from './auth-client.js';
import { InboxNavLink } from './inbox-nav-link.js';
import { useCurrentUser } from './providers.js';
import { ThemeToggle } from './theme-toggle.js';

export function AppNav({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const user = useCurrentUser();
  return (
    <nav className="gn-nav">
      <Link href="/workspaces">Workspaces</Link>
      {workspaceId !== undefined ? <Link href={`/w/${workspaceId}/my-work`}>My Work</Link> : null}
      {/* Beside the view links and BEFORE the spacer, because it is a
          destination like Workspaces and My Work rather than a control like the
          theme toggle. Unconditional on `workspaceId`: the inbox is a global
          route (`app/inbox/page.tsx`) and a reader can be told about a ticket in
          a workspace they are not currently looking at. The badge's own read is
          gated on a session inside `InboxNavLink`. */}
      <InboxNavLink />
      <span className="gn-nav__spacer" />
      <ThemeToggle />
      {user !== null ? (
        <Button
          onClick={() =>
            void authClient.signOut().then(() => {
              router.push('/sign-in');
            })
          }
        >
          Sign out {user.name}
        </Button>
      ) : null}
    </nav>
  );
}
