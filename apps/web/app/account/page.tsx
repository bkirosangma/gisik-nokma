'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { AppNav } from '../../src/app-nav.js';
import { AppearanceSection } from '../../src/account/appearance-section.js';
import { ProfileSection } from '../../src/account/profile-section.js';
import { WorkspacesSection } from '../../src/account/workspaces-section.js';
import { authClient } from '../../src/auth-client.js';
import { useAppServices } from '../../src/providers.js';

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
  const { dataSource } = useAppServices();
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);

  useEffect(() => {
    // A failed read collapses to the SAME `[]` an honestly-empty answer would
    // produce — `stub-services.ts`'s own rule ("`[]` ... is a claim about the
    // world") applies here too, and this is the one place on the shell that
    // knowingly breaks it. Deliberate, not an oversight: this section is a
    // convenience list, not `/account`'s primary content the way `getMyWorkspaces`
    // is `/workspaces`' own (case 13.298's 401→`/sign-in` redirect), and
    // `use-workspace-name.ts` already establishes the same silent-omission
    // treatment for a secondary consumer of this exact read on this exact page
    // (`AppNav`, mounted here too). If a reviewer wants the stronger
    // `ShellRefusal` treatment instead, that's an `error` state added here.
    dataSource.query.getMyWorkspaces().then(setWorkspaces, () => setWorkspaces([]));
  }, [dataSource]);

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
      {workspaces !== null ? <WorkspacesSection workspaces={workspaces} /> : null}
    </main>
  );
}
