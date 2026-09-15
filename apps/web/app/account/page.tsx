'use client';

import { AppNav } from '../../src/app-nav.js';
import { AppearanceSection } from '../../src/account/appearance-section.js';

/**
 * `/account` — the GLOBAL account screen: settings that follow a person
 * across every workspace, never a workspace's own settings
 * (`/w/[workspaceId]/settings/*` for those). Client component as of this
 * task (was a static server-component stub through Task 18) because every
 * section from here on needs live data: `authClient`, `dataSource`, or both.
 */
export default function AccountPage() {
  return (
    <main className="gn-shell gn-account">
      <AppNav />
      <h1 className="gn-page-title">Account</h1>
      <AppearanceSection />
    </main>
  );
}
