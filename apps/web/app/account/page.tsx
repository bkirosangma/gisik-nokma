'use client';

import { useCallback, useEffect, useState } from 'react';
import { NotificationsSection, type WorkspaceRef } from '@gisik-nokma/app-core';
import type { NotificationKind, NotificationPreferences } from '@gisik-nokma/domain';
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
  const { dataSource, notificationPreferences } = useAppServices();
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    // A failed read collapses to the SAME `[]` an honestly-empty answer would
    // produce — `stub-services.ts`'s own rule ("`[]` ... is a claim about the
    // world") applies here too, and this is ONE of two places on the shell
    // that knowingly breaks it (the Notifications effect below is the other,
    // added Task 6). Deliberate, not an oversight: this section is a
    // convenience list, not `/account`'s primary content the way `getMyWorkspaces`
    // is `/workspaces`' own (case 13.298's 401→`/sign-in` redirect), and
    // `use-workspace-name.ts` already establishes the same silent-omission
    // treatment for a secondary consumer of this exact read on this exact page
    // (`AppNav`, mounted here too). If a reviewer wants the stronger
    // `ShellRefusal` treatment instead, that's an `error` state added here.
    dataSource.query.getMyWorkspaces().then(setWorkspaces, () => setWorkspaces([]));
  }, [dataSource]);

  useEffect(() => {
    // Same silent-omission treatment the Workspaces effect above gives a
    // failed read, and the SAME reason: this is a convenience control, not
    // `/account`'s primary content, so a refusal here should not block the
    // rest of the page. `{ mutedKinds: [] }` here is NOT
    // `EMPTY_NOTIFICATION_PREFERENCES` reused — that constant's own docblock
    // (`packages/domain/src/notification-preferences.ts`) defines it as what
    // a person who has NEVER SAVED a preference reads, which is a claim about
    // their history. A failed read has no idea whether they ever saved one;
    // the literal below merely renders every kind as on for this visit,
    // without asserting that fact about the account.
    notificationPreferences.load().then(setPrefs, () => setPrefs({ mutedKinds: [] }));
  }, [notificationPreferences]);

  const saveName = useCallback(async (name: string) => {
    const result = await authClient.updateUser({ name });
    return { error: result.error?.message ?? null };
  }, []);

  const toggleKind = useCallback(
    (kind: NotificationKind) => {
      if (prefs === null) return;
      const muted = prefs.mutedKinds.includes(kind);
      const next: NotificationPreferences = {
        mutedKinds: muted ? prefs.mutedKinds.filter((k) => k !== kind) : [...prefs.mutedKinds, kind],
      };
      setPrefs(next); // optimistic
      void notificationPreferences.save(next).catch(() => {
        // Revert to the true stored state on a failed save, rather than
        // leaving the optimistic flip standing for a change the server never
        // recorded — the same distrust `apps/web/app/inbox/page.tsx`'s
        // `markRead` catch has for its own optimistic flip.
        notificationPreferences.load().then(setPrefs);
      });
    },
    [prefs, notificationPreferences],
  );

  return (
    <main className="gn-shell gn-account">
      <AppNav />
      <h1 className="gn-page-title">Account</h1>
      <AppearanceSection />
      {user !== null ? (
        <ProfileSection name={user.name} email={user.email} onSave={saveName} />
      ) : null}
      {workspaces !== null ? <WorkspacesSection workspaces={workspaces} /> : null}
      {prefs !== null ? (
        <NotificationsSection mutedKinds={prefs.mutedKinds} onToggle={toggleKind} />
      ) : null}
    </main>
  );
}
