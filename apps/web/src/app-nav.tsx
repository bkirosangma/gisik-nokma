'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@gisik-nokma/ui';
import { authClient } from './auth-client.js';
import { useCurrentUser } from './providers.js';
import { ThemeToggle } from './theme-toggle.js';

export function AppNav({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const user = useCurrentUser();
  return (
    <nav className="gn-nav">
      <Link href="/workspaces">Workspaces</Link>
      {workspaceId !== undefined ? <Link href={`/w/${workspaceId}/my-work`}>My Work</Link> : null}
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
