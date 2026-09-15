'use client';

import { useCallback } from 'react';
import { AppNav } from '../../src/app-nav.js';
import { AppearanceSection } from '../../src/account/appearance-section.js';
import { ProfileSection } from '../../src/account/profile-section.js';
import { authClient } from '../../src/auth-client.js';

/**
 * `/account` — the GLOBAL account screen: settings that follow a person
 * across every workspace, never a workspace's own settings
 * (`/w/[workspaceId]/settings/*` for those). Client component as of Task 2
 * (was a static server-component stub through Task 18) because every
 * section from here on needs live data: `authClient`, `dataSource`, or both.
 * Profile (this task) is the first section to actually read `authClient`.
 */
export default function AccountPage() {
  const session = authClient.useSession();
  const user = session.data?.user ?? null;

  const saveName = useCallback(async (name: string) => {
    const result = await authClient.updateUser({ name });
    return { error: result.error?.message ?? null };
  }, []);

  return (
    <main className="gn-shell gn-account">
      <AppNav />
      <h1 className="gn-page-title">Account</h1>
      <AppearanceSection />
      {user !== null ? (
        <ProfileSection name={user.name} email={user.email} onSave={saveName} />
      ) : null}
    </main>
  );
}
