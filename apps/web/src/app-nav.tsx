'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@gisik-nokma/ui';
import { authClient } from './auth-client.js';
import { InboxNavLink } from './inbox-nav-link.js';
import { useCurrentUser } from './providers.js';
import { StyleToggle } from './style-toggle.js';
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
      {/* Help and Account (Task 18), both GLOBAL routes and both unconditional
          on `workspaceId` for the reason the inbox link above is: neither is a
          fact about the workspace you are currently looking at. `/help` already
          existed and needed only the link; `/account` ships in the same change
          set as a stub that enumerates what it does not do, because a nav entry
          pointing at a 404 is a defect and the alternative was to edit this nav
          again from a task about passkeys.

          Account is the person's own settings — profile, notifications,
          sessions — and NOT a workspace's, which live at
          `/w/[workspaceId]/settings/*`. Anyone who conflates the two will put a
          workspace control on a global page. */}
      <Link href="/help">Help</Link>
      <Link href="/account">Account</Link>
      <span className="gn-nav__spacer" />
      <StyleToggle />
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
