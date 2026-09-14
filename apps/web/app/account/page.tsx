import Link from 'next/link';
import { AppNav } from '../../src/app-nav.js';
import { StyleToggle } from '../../src/style-toggle.js';

/**
 * `/account` — the GLOBAL account screen, as a deliberate stub (Task 18).
 *
 * ## Why a stub ships here rather than the nav link waiting
 *
 * Task 18 adds an **Account** entry to the nav, and the plan left the
 * implementer one measurement to make and one choice to state: does `/account`
 * exist? It did not — `apps/web/app/` had `help`, `inbox`, `invite`, `mcp`,
 * `privacy`, `sign-in`, `terms`, `w` and `workspaces`, and no `account`. A nav
 * entry pointing at a 404 is a defect whichever task is blamed for it, and the
 * alternative — ship **Help** now and hold **Account** for Task 12 — leaves the
 * nav needing a second edit in a task that is about passkeys. So the link lands
 * with a page under it, and the page says what it does not yet do.
 *
 * ## It is ACCOUNT-global, not workspace settings
 *
 * The distinction is the plan's and it is worth keeping visible: profile,
 * notification preferences and sessions/devices belong to a person across every
 * workspace they are in. Ticket types, workflows and members belong to ONE
 * workspace and already live at `/w/[workspaceId]/settings/*`. A future editor
 * who cannot tell them apart will put a workspace control here, and the person
 * changing it will believe they changed it everywhere.
 *
 * ## What fills it, and who owns that
 *
 * Passkey registration is **Task 12**, which the plan's own sequence puts after
 * the owner's look at `/workspaces`; notification preferences and the session
 * list have no owner yet. The absences are ENUMERATED on the page rather than
 * summarised as "coming soon", for the reason this series records about
 * partial-implementation markers: naming what is missing is a fact a reader can
 * act on, and "partial" is not.
 *
 * A server component: it holds no state and reads nothing.
 *
 * ## Style moved here from `AppNav` (owner request)
 *
 * `StyleToggle` no longer rides in the persistent nav on every screen — it is
 * a settled preference, not a control a reader needs mid-glance on every
 * page, so it belongs on the page ABOUT the reader's own settings. It is also
 * now a `<select>` rather than `SegmentedControl`: three always-visible
 * segments earn their footprint in a 44px-tall nav row; one row in a
 * preferences page does not need the same always-on visibility, and a
 * dropdown is the shape this page's own invite-form sibling
 * (`w/[workspaceId]/members/page.tsx`) already uses for a single choice among
 * a few named options.
 */
export default function AccountPage() {
  return (
    <main className="gn-shell gn-account">
      <AppNav />
      <h1 className="gn-page-title">Account</h1>
      <p>
        Your account settings live here — the ones that follow you across every workspace, rather
        than the ones that belong to one of them.
      </p>
      <StyleToggle />
      <p>Nothing on this page is built yet. What is missing, by name:</p>
      <ul>
        <li>Passkeys — registering one, and seeing the ones you have.</li>
        <li>Notification preferences — which of them reach you, and how.</li>
        <li>Sessions and devices — what is signed in as you, and signing one out.</li>
      </ul>
      <p>
        A workspace&apos;s own settings — its ticket types, its workflows, its people — are not
        here. They are inside that workspace, because each of them belongs to it alone.
      </p>
      <p>
        <Link href="/workspaces">Back to your workspaces</Link>
      </p>
    </main>
  );
}
