# Account and Help Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing Help browser's CSS to match the prototype's container styling, and build out `/account`'s five sections (Profile, Appearance, Notifications, Your workspaces, Sign-in & devices) against real backend capability — absorbing the paused Task 12 passkey scope in full.

**Architecture:** Help gets a CSS-only restyle of `packages/ui/src/ui.css`'s `.gn-help*` rules — no JSX or content changes. `/account` becomes a client component (matching `/workspaces`' own established pattern: `useAppServices()` + `useEffect`/`useState` per data need, `ShellRefusal` for failures, `useSignInOnExpiredSession`), composing section components. Three sections that are genuinely reusable and backed by an abstract interface (Notifications, Sessions, Passkeys) live as framework-free views under `packages/app-core/src/account/*`, taking plain data + callback props — never importing `next/*` or the concrete `authClient`. Two sections (Appearance, which wraps two already-built `apps/web`-only controls; Your workspaces, which needs no cross-app reuse yet) stay in `apps/web/src/account/*`. A new, small, **global** notification-preferences surface is added end-to-end (domain schema → migration → route → gateway) rather than extending the existing workspace-scoped `UserPreferences` — see Task 5's notes for why.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Fastify + Postgres, better-auth 1.7.2 + `@better-auth/passkey` 1.7.2, Zod, Vitest + Testing Library, pnpm workspaces + Turbo.

**Spec:** `docs/superpowers/specs/2026-09-14-account-help-screens-design.md`

## Global Constraints

- **pnpm 9.15.0** workspace commands: `pnpm --filter @gisik-nokma/app-core test`, `pnpm --filter @gisik-nokma/ui test`, etc. — never bare `npm`/`yarn`.
- **Never pipe a test/build run into `head` or `grep -m N`** — orphans vitest workers, crashed this machine before (project `CLAUDE.md`). Use `| tail -N` or redirect to a file.
- **Case-id numbers are not pinned in this plan — recount live before writing, at each task's own commit time.** Task 12 reserved `13.327`–`13.333` in `test-cases/13-deployment-dogfooding.md` but never wrote them (confirmed empty by grep on 2026-09-14); re-verify that's still true before minting, since another branch could have taken the block since. Account/sign-in/passkey cases go in `test-cases/13-deployment-dogfooding.md`; Help's restyle needs no new cases (pure CSS, covered by existing scanners — see Task 1); notification-preference cases go in `test-cases/11-calendar-notifications.md` (the existing bucket for notification behavior — `format.test.ts`'s `11.83`–`11.86` already live there).
- **`Features.md` and the matching `test-cases/*.md` file are updated in the same commit as the feature they describe**, never a follow-up (workspace convention, `CLAUDE.md`).
- **Deviation from spec §5 (Notifications):** notification preferences get their own new global table/route/schema, not an extension of `UserPreferences`. Discovered during planning: `UserPreferences`/`user_preferences` is keyed `(user_id, workspace_id)`, ties to workspace membership (a 30-day sweep-on-revoke), and `preferencesDocSchema` is `.strict()` with all keys required — none of that fits a person-wide, workspace-independent setting for a page (`/inbox`) that is deliberately global. See Task 5.
- **Deviation from spec §7 (Passkeys):** the sign-in entry point is an explicit "Sign in with a passkey" button, not focus-triggered conditional UI. `docs/manual.md`/`docs/faq.md` already describe a literal button with that label — restoring it as a button needs zero doc edits, and a button click is unambiguous user intent, trivially satisfying the "zero cost on an anonymous page load" constraint. See Task 8.
- **Do not touch `~/my_projects/gisik-nokma-exec` or the `exec/task12-passkeys` branch.** This plan supersedes that work entirely; it stays paused and untouched.
- **Auth-path changes (Task 8) get no shortcuts.** `apps/server/src/auth/`, the rate limiter (`apps/server/src/http/rate-limit.ts`, `apps/server/src/app.ts`), and `/sign-in` are security-sensitive; the rate-limit-neutral test is load-bearing and must actually exercise the real limiter, not a mock of it.
- Every task ends with the touched package(s)' `test` and `typecheck` both green before commit.

---

## File structure

```
packages/ui/
  src/ui.css                                          MODIFY (Task 1) — .gn-help* restyle

apps/web/
  src/
    app-nav.tsx                                        MODIFY (Task 2) — remove ThemeToggle
    account/
      appearance-section.tsx                            CREATE (Task 2) — wraps StyleToggle + ThemeToggle
      profile-section.tsx                               CREATE (Task 3)
      workspaces-section.tsx                             CREATE (Task 4)
      account-clients.ts                                 CREATE (Task 6, extended Tasks 7–8) — authClient-backed
                                                          implementations of the app-core abstract interfaces
  app/
    account/page.tsx                                     REWRITE (Task 2, extended Tasks 3–8)
    sign-in/page.tsx                                      MODIFY (Task 8) — passkey button
  test/
    account-page.test.tsx                                 CREATE (Task 2, extended Tasks 3–8)
    sign-in.test.tsx                                       MODIFY (Task 8) — replace test 13.326

packages/app-core/
  src/account/
    notification-preferences-gateway.ts                   CREATE (Task 6) — abstract interface
    notifications-section.tsx                             CREATE (Task 6)
    sessions-client.ts                                     CREATE (Task 7) — abstract interface
    sessions-section.tsx                                   CREATE (Task 7)
    passkey-client.ts                                      CREATE (Task 8) — abstract interface
    passkeys-section.tsx                                   CREATE (Task 8)
  src/online/notification-preferences.ts                   CREATE (Task 6) — HTTP implementation
  test/account/
    notifications-section.test.tsx                         CREATE (Task 6)
    sessions-section.test.tsx                              CREATE (Task 7)
    passkeys-section.test.tsx                               CREATE (Task 8)
  test/online/notification-preferences.test.ts              CREATE (Task 6)

packages/domain/
  src/notification-preferences.ts                          CREATE (Task 5)
  test/notification-preferences.test.ts                     CREATE (Task 5)

apps/server/
  migrations/<next>_user-notification-preferences.sql       CREATE (Task 5)
  src/notification-preferences/store.ts                     CREATE (Task 5)
  src/routes/notification-preferences.ts                    CREATE (Task 5)
  src/routes/notifications.ts                               MODIFY (Task 5) — apply muted-kind filter
  src/notifications/store.ts                                MODIFY (Task 5) — mutedKinds param
  src/app.ts                                                MODIFY (Task 5) — register new route
  test/routes/notification-preferences.test.ts              CREATE (Task 5)
  test/notifications/store.test.ts                          MODIFY (Task 5) — mutedKinds cases

Features.md                                                 MODIFY (every task, same commit)
test-cases/11-calendar-notifications.md                     MODIFY (Task 5, 6)
test-cases/13-deployment-dogfooding.md                      MODIFY (Tasks 2, 3, 4, 7, 8)
```

---

### Task 1: Help — restyle `.gn-help*` to the prototype's container language

**Files:**
- Modify: `packages/ui/src/ui.css:1563-1669`

**Interfaces:** none — pure CSS, no new class names introduced, no JSX changes anywhere.

This executes the already-scoped Task 10 from `docs/superpowers/plans/2026-09-08-hig-per-screen.md`: **CSS only**. No content, copy, or section-name changes — case `13.316` already pins the shipped section names as unchanged, and nothing here touches `help-browser.tsx`. There is no automated way to assert "matches the prototype visually" beyond the repo's existing gates (the token-discipline scanner refuses raw color literals; `CONTRAST_PAIRS` catches an accessibility regression; the component's own behavior tests in `packages/app-core/test/help/search.test.ts` are untouched since none of them assert CSS). The verification for this task is: no new literal colors, existing tests stay green, and a manual look in the running dev app.

- [ ] **Step 1: Confirm baseline is green**

Run: `pnpm --filter @gisik-nokma/ui test`
Expected: PASS (all existing tests, unrelated to this change).

- [ ] **Step 2: Restyle the search input and tabs to the existing filled-field / segmented-control language**

`.gn-help__search-input` currently has a hardcoded `border-radius: 0.4rem`. Every other control surface in the repo now reads its radius from `var(--gn-radius-control)` (Task 14's "Radius and elevation are style-axis variables, not literals" rule) — this input never got that pass because it predates it. Fix it and give it the same sunken-surface box-shadow the shared `Select` trigger and filled fields use:

```diff
 .gn-help__search-input {
   width: 100%;
   min-height: 2.75rem;            /* 44px — the minimum touch target */
   padding: 0 0.75rem;
   font-size: 1rem;                /* never below 16px: iOS zooms the page otherwise */
   color: var(--gn-text);
   background: var(--gn-surface-raised);
-  border-radius: 0.4rem;
+  border-radius: var(--gn-radius-control);
+  box-shadow: var(--gn-shadow-sunken);
 }
```

`.gn-help__tabs`/`.gn-help__tab` become a segmented-pill row instead of two separate bordered buttons — matching the same visual family `SegmentedControl` (`packages/ui/src/components/segmented-control.tsx`) already establishes elsewhere in the app:

```diff
-.gn-help__tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
+.gn-help__tabs {
+  display: inline-flex;
+  gap: 0.15rem;
+  margin-bottom: 1rem;
+  padding: 0.2rem;
+  background: var(--gn-surface-sunken);
+  border-radius: var(--gn-radius-control);
+}
 .gn-help__tab {
   min-height: 2.75rem; padding: 0 1rem; cursor: pointer;
   color: var(--gn-text); background: var(--gn-surface-raised);
   font-size: 1rem; transition: background-color 200ms ease, border-color 200ms ease;
+  border-radius: calc(var(--gn-radius-control) - 0.2rem);
 }
 .gn-help__tab:hover { background: var(--gn-surface-sunken); }
-.gn-help__tab[aria-pressed='true'] { border-color: var(--gn-accent); background: var(--gn-surface-sunken); font-weight: 600; }
+.gn-help__tab[aria-pressed='true'] {
+  background: var(--gn-surface-raised);
+  box-shadow: var(--gn-shadow-raised);
+  font-weight: 600;
+}
```

(The unselected tab keeps `background: var(--gn-surface-raised)` — against the new sunken `.gn-help__tabs` wrapper this still reads as a distinct pill; only the *selected* tab additionally gets the raised shadow, which is what actually marks it now instead of the old border-color. `aria-pressed` still carries the state to assistive tech unchanged — nothing about that attribute or its wiring in `help-browser.tsx` changes.)

- [ ] **Step 3: Give the results panel and the table-of-contents the same card language**

Both currently hardcode `0.4rem`. Bring them onto the card token and add the raised-card shadow so they read as distinct surfaces, matching the prototype's boxed search-results and sidebar-TOC treatment (the flat, non-nested link list itself is UNCHANGED — Task 10's ruling already fixed the information architecture, only the container gets a new look):

```diff
-.gn-help__results { margin-bottom: 2rem; padding: 0.9rem 1rem; border-radius: 0.4rem; background: var(--gn-surface-sunken); }
+.gn-help__results {
+  margin-bottom: 2rem;
+  padding: 0.9rem 1rem;
+  border-radius: var(--gn-radius-card);
+  background: var(--gn-surface-raised);
+  box-shadow: var(--gn-shadow-raised);
+}
```

```diff
-.gn-help__toc { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-bottom: 2rem; padding-bottom: 1rem; }
+.gn-help__toc {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem 1rem;
+  margin-bottom: 2rem;
+  padding: 0.9rem 1rem;
+  border-radius: var(--gn-radius-card);
+  background: var(--gn-surface-raised);
+  box-shadow: var(--gn-shadow-raised);
+}
```

And the two inline alert-style boxes (`.gn-help__none`, `.gn-help__quote`) move off the hardcoded radius onto the same control token used everywhere else (they keep their `border-left` accent bar and sunken background — those are semantic, not part of this token cleanup):

```diff
-.gn-help__none { margin-bottom: 2rem; padding: 0.9rem 1rem; border-left: 3px solid var(--gn-warning); border-radius: 0.4rem; background: var(--gn-surface-sunken); }
+.gn-help__none { margin-bottom: 2rem; padding: 0.9rem 1rem; border-left: 3px solid var(--gn-warning); border-radius: var(--gn-radius-control); background: var(--gn-surface-sunken); }
```

```diff
-.gn-help__quote { margin: 0 0 0.9rem; padding: 0.75rem 0.9rem; border-left: 3px solid var(--gn-accent); border-radius: 0.4rem; background: var(--gn-surface-sunken); }
+.gn-help__quote { margin: 0 0 0.9rem; padding: 0.75rem 0.9rem; border-left: 3px solid var(--gn-accent); border-radius: var(--gn-radius-control); background: var(--gn-surface-sunken); }
```

- [ ] **Step 4: Run the full verification suite**

Run:
```bash
pnpm --filter @gisik-nokma/ui test
pnpm --filter @gisik-nokma/ui typecheck
```
Expected: PASS. This includes the token-discipline scanner (`packages/ui/test/helpers/colour-scan.ts` — confirms no raw hex/`rgb()`/etc. was introduced; every value above is a `var(--gn-*)` reference) and the `CONTRAST_PAIRS` suite (`packages/ui/test/tokens.test.ts` — unaffected, since no color values changed, only radius/shadow/background-surface tokens already used elsewhere).

- [ ] **Step 5: Manual look**

Run the dev stack (`docker compose ... up -d --build --wait server web` per the repo's own convention, or whatever the current dev-run command is) and open `/help` in `hig`, `minimal`, and `neo` styles, light and dark, to confirm nothing clips or looks broken. This is not itself a gate — no test asserts it — but skipping it on a CSS-only task is how a bad radius calc ships unnoticed.

- [ ] **Step 6: Update Features.md and commit**

`Features.md` already has an in-app-help bullet (search it: `grep -n "in-app help\|Help browser\|HelpBrowser" Features.md`); add one clause noting the restyle, e.g. append to that bullet: `Restyled onto the shared radius/shadow token system (2026-09-15) — no content or structural change.` No new `test-cases/15-in-app-help.md` entry is needed (nothing behavioral changed; the file's existing cases already cover behavior, and this task adds no new one).

```bash
git add packages/ui/src/ui.css Features.md
git commit -m "Restyle Help's container CSS onto the shared radius/shadow tokens"
```

---

### Task 2: Account — page shell, client conversion, and the Appearance section

**Files:**
- Rewrite: `apps/web/app/account/page.tsx`
- Modify: `apps/web/src/app-nav.tsx` (remove `ThemeToggle`)
- Create: `apps/web/src/account/appearance-section.tsx`
- Create: `apps/web/test/account-page.test.tsx`

**Interfaces:**
- Produces: `AppearanceSection` — a plain component, no props, wrapping the existing `StyleToggle`/`ThemeToggle`. `AccountPage` becomes a `'use client'` default export at `apps/web/app/account/page.tsx`, following `/workspaces`' own pattern (`useAppServices()`, `useEffect`/`useState`, `ShellRefusal`, `useSignInOnExpiredSession`) — later tasks (3–8) add sections into the same file's data-fetching effects without changing this shape.

This task converts the page from a static server component to the live shell every later task builds into, and ships the one section (Appearance) that's pure relocation — no new backend, no new data fetch.

- [ ] **Step 1: Write the failing test for the page shell**

```tsx
// apps/web/test/account-page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: { signOut: vi.fn(), useSession: () => ({ data: null }) },
}));

import AccountPage from '../app/account/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

function mount() {
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => [] }, {})}>
      <AccountPage />
    </Providers>,
  );
}

describe('AccountPage — the global settings shell', () => {
  it('renders AppNav and a page title', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });

  it('renders the Appearance section with both the Style and Theme controls', async () => {
    mount();
    expect(await screen.findByRole('button', { name: /Style/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Theme:/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter apps/web exec vitest run test/account-page.test.tsx`
Expected: FAIL — `Theme:` button not found (the current page doesn't render `ThemeToggle` at all).

- [ ] **Step 3: Create the Appearance section**

```tsx
// apps/web/src/account/appearance-section.tsx
import { StyleToggle } from '../style-toggle.js';
import { ThemeToggle } from '../theme-toggle.js';

/**
 * Both controls already work and are already tested (`style-toggle.test.tsx`,
 * `theme-toggle.test.tsx`) — this wraps them, it doesn't reimplement anything.
 * `ThemeToggle` moves here from `AppNav` (Step 4); `StyleToggle` already lived
 * on `/account` and is unchanged.
 */
export function AppearanceSection() {
  return (
    <section className="gn-account__section gn-account__appearance">
      <h2 className="gn-account__section-title">Appearance</h2>
      <StyleToggle />
      <ThemeToggle />
    </section>
  );
}
```

- [ ] **Step 4: Remove `ThemeToggle` from `AppNav`**

In `apps/web/src/app-nav.tsx`, delete the import (`import { ThemeToggle } from "./theme-toggle.js";`, line 9) and the single usage (`<ThemeToggle />`, line 163, the last child of `.gn-nav__links` right after `<span className="gn-nav__spacer" />`). Leave the `<span className="gn-nav__spacer" />` in place — it still does its job of pushing the sign-out button to the far edge on wide viewports even with nothing after it.

- [ ] **Step 5: Rewrite the page as a client shell**

```tsx
// apps/web/app/account/page.tsx
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
```

(Tasks 3–8 each add one more section + its own data-fetching `useEffect`/`useState` into this same file, in the same place the `/workspaces` page keeps its own — nothing about this shape needs to change again, only grow.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter apps/web exec vitest run test/account-page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Confirm `app-nav.test.tsx` still passes**

Run: `pnpm --filter apps/web exec vitest run test/app-nav.test.tsx`
Expected: PASS unchanged — confirmed during planning research that no assertion in this file targets `ThemeToggle`'s button role or aria-label inside `AppNav` (every `hrefs`/link-set assertion filters to `getAllByRole('link')`, which a `<button>` never matches).

- [ ] **Step 8: Run the full web test suite and typecheck**

Run:
```bash
pnpm --filter apps/web exec vitest run
pnpm --filter apps/web typecheck
```
Expected: PASS.

- [ ] **Step 9: Update Features.md and commit**

Edit the existing bullet at `Features.md:67` (`✅ **/account — the global account screen, as a stub...**`) — it is no longer a stub. Replace it in place (per the workspace convention: "Enhancing → edit the existing bullet"):

```
- ✅ **`/account` — the global account screen** — a client shell composing Appearance (Style + Theme,
  moved off `AppNav`), Profile, Your workspaces, Notifications, and Sign-in & devices (Sessions +
  Passkeys). `apps/web/app/account/page.tsx`
```

(Leave the sub-bullets for Profile/Workspaces/Notifications/Sessions/Passkeys to be added by Tasks 3–8 respectively, each editing this same bullet further or adding its own sub-bullet — whichever reads more naturally once that task's content exists.)

```bash
git add apps/web/app/account/page.tsx apps/web/src/app-nav.tsx apps/web/src/account/appearance-section.tsx apps/web/test/account-page.test.tsx Features.md
git commit -m "Account: convert /account to a client shell, move Theme toggle into its new Appearance section"
```

---

### Task 3: Account — Profile section

**Files:**
- Create: `apps/web/src/account/profile-section.tsx`
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/test/account-page.test.tsx`

**Interfaces:**
- Produces: `ProfileSection({ name, email, onSave }: { name: string; email: string; onSave: (name: string) => Promise<{ error: string | null }> })`.

Name is editable via better-auth's core `updateUser`; email is read-only (spec non-goal — changing it needs a verification round-trip this plan doesn't build).

**Verification step before writing code:** better-auth's client exposes `updateUser` as a base method (no plugin needed — confirmed the server-side `update-user.mjs` route exists and is not plugin-gated). Confirm the exact call shape against the installed types before writing the test:
```bash
grep -n "updateUser" node_modules/.pnpm/better-auth@1.7.2*/node_modules/better-auth/dist/client/index.d.mts
```
Expected shape (better-auth's documented convention): `authClient.updateUser({ name?: string }): Promise<{ data: unknown; error: { message?: string } | null }>`. If the installed types disagree, use what they actually say instead of this plan's assumption — this is the one place in the plan with residual signature uncertainty, and the installed `.d.mts` is the authority, not this text.

- [ ] **Step 1: Write the failing test**

```tsx
// add to apps/web/test/account-page.test.tsx
const updateUser = vi.fn();
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    signOut: vi.fn(),
    useSession: () => ({ data: { user: { id: 'u1', name: 'Anjali Kharkongor', email: 'anjali@example.com' } } }),
    updateUser: (...args: unknown[]) => updateUser(...args),
  },
}));

describe('AccountPage — Profile', () => {
  it('shows the current name and email, and saves an edited name', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    mount();
    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Anjali Kharkongor');
    expect(screen.getByText('anjali@example.com')).toBeInTheDocument();
    await user.clear(nameInput);
    await user.type(nameInput, 'Anjali K.');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(updateUser).toHaveBeenCalledWith({ name: 'Anjali K.' });
  });

  it('shows a refusal verbatim if the save fails', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'Name cannot be empty' } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name cannot be empty');
  });
});
```

(`userEvent` import already exists at the top of this file per Task 2's setup — add it if not already imported: `import { userEvent } from '@testing-library/user-event';`)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter apps/web exec vitest run test/account-page.test.tsx`
Expected: FAIL — no "Name" field exists yet.

- [ ] **Step 3: Create the Profile section**

```tsx
// apps/web/src/account/profile-section.tsx
'use client';

import { useState } from 'react';
import { Button } from '@gisik-nokma/ui';

export type ProfileSectionProps = {
  name: string;
  email: string;
  onSave: (name: string) => Promise<{ error: string | null }>;
};

export function ProfileSection({ name, email, onSave }: ProfileSectionProps) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await onSave(draft);
    setSaving(false);
    if (result.error !== null) setError(result.error);
  };

  return (
    <section className="gn-account__section gn-account__profile">
      <h2 className="gn-account__section-title">Profile</h2>
      <label className="gn-account__field">
        <span>Name</span>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="gn-field__input"
        />
      </label>
      <p className="gn-account__readonly">
        <span>Email</span>
        <span>{email}</span>
      </p>
      {error !== null ? (
        <p role="alert" className="gn-account__error">
          {error}
        </p>
      ) : null}
      <Button onClick={() => void save()} disabled={saving}>
        Save name
      </Button>
    </section>
  );
}
```

- [ ] **Step 4: Wire it into the page**

```diff
 // apps/web/app/account/page.tsx
+import { useCallback } from 'react';
+import { ProfileSection } from '../../src/account/profile-section.js';
+import { authClient } from '../../src/auth-client.js';

 export default function AccountPage() {
+  const session = authClient.useSession();
+  const user = session.data?.user ?? null;
+
+  const saveName = useCallback(async (name: string) => {
+    const result = await authClient.updateUser({ name });
+    return { error: result.error?.message ?? null };
+  }, []);
+
   return (
     <main className="gn-shell gn-account">
       <AppNav />
       <h1 className="gn-page-title">Account</h1>
       <AppearanceSection />
+      {user !== null ? (
+        <ProfileSection name={user.name} email={user.email} onSave={saveName} />
+      ) : null}
     </main>
   );
 }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter apps/web exec vitest run test/account-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm --filter apps/web exec vitest run && pnpm --filter apps/web typecheck`
Expected: PASS.

- [ ] **Step 7: Catalogue and commit**

Add to `test-cases/13-deployment-dogfooding.md` — first check the next free number (`grep -n "^\- \*\*13\." test-cases/13-deployment-dogfooding.md | tail -3`), then add two cases (name edit saves; refusal renders verbatim in a `role="alert"`), and extend the `Features.md` `/account` bullet from Task 2 with a Profile sub-clause.

```bash
git add apps/web/src/account/profile-section.tsx apps/web/app/account/page.tsx apps/web/test/account-page.test.tsx Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Account: add editable Profile name, read-only email"
```

---

### Task 4: Account — Your workspaces section

**Files:**
- Create: `apps/web/src/account/workspaces-section.tsx`
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/test/account-page.test.tsx`

**Interfaces:**
- Produces: `WorkspacesSection({ workspaces }: { workspaces: WorkspaceRef[] })`.
- Consumes: `WorkspaceRef` from `@gisik-nokma/app-core` (`{ id, name, role, memberCount, nameRestrictedProjectCount, projects }`, `role: string` — confirmed real, served verbatim from `proj_memberships.role`), and `dataSource.query.getMyWorkspaces(): Promise<WorkspaceRef[]>` (already exists, no change).

No invented fields — `role` and `projects.length` are the only two shown, both real.

- [ ] **Step 1: Write the failing test**

```tsx
// add to apps/web/test/account-page.test.tsx
function workspace(over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id: 'w1', name: 'Meghalaya Rollout', role: 'admin',
    memberCount: 4, nameRestrictedProjectCount: 0, projects: [],
    ...over,
  };
}

describe('AccountPage — Your workspaces', () => {
  it('lists each workspace with its real role and project count', async () => {
    render(
      <Providers services={stubServices({
        getMyWorkspaces: async () => [
          workspace({ id: 'w1', name: 'Meghalaya Rollout', role: 'admin', projects: [{ id: 'p1', name: 'Delivery', archived: false, ticketCount: 3, blockedCount: 0 }] }),
          workspace({ id: 'w2', name: 'Field Support', role: 'member', projects: [] }),
        ],
      }, {})}>
        <AccountPage />
      </Providers>,
    );
    expect(await screen.findByText('Meghalaya Rollout')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('1 project')).toBeInTheDocument();
    expect(screen.getByText('Field Support')).toBeInTheDocument();
    expect(screen.getByText('member')).toBeInTheDocument();
    expect(screen.getByText('0 projects')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter apps/web exec vitest run test/account-page.test.tsx`
Expected: FAIL — no workspaces list rendered.

- [ ] **Step 3: Create the section**

```tsx
// apps/web/src/account/workspaces-section.tsx
import type { WorkspaceRef } from '@gisik-nokma/app-core';

export type WorkspacesSectionProps = { workspaces: WorkspaceRef[] };

export function WorkspacesSection({ workspaces }: WorkspacesSectionProps) {
  return (
    <section className="gn-account__section gn-account__workspaces">
      <h2 className="gn-account__section-title">Your workspaces</h2>
      <ul className="gn-account__workspace-list">
        {workspaces.map((workspace) => (
          <li key={workspace.id} className="gn-account__workspace-row">
            <span className="gn-account__workspace-name">{workspace.name}</span>
            <span className="gn-account__workspace-role">{workspace.role}</span>
            <span className="gn-account__workspace-count">
              {workspace.projects.length} {workspace.projects.length === 1 ? 'project' : 'projects'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Wire it into the page**

```diff
 // apps/web/app/account/page.tsx
+import { useEffect, useState } from 'react';
+import type { WorkspaceRef } from '@gisik-nokma/app-core';
+import { WorkspacesSection } from '../../src/account/workspaces-section.js';
+import { useAppServices } from '../../src/providers.js';

 export default function AccountPage() {
   const session = authClient.useSession();
   const user = session.data?.user ?? null;
+  const { dataSource } = useAppServices();
+  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
+
+  useEffect(() => {
+    dataSource.query.getMyWorkspaces().then(setWorkspaces, () => setWorkspaces([]));
+  }, [dataSource]);

   ...
+      {workspaces !== null ? <WorkspacesSection workspaces={workspaces} /> : null}
```

(A failed fetch degrades to an empty list rather than a page-level refusal here — this section is a convenience list, not the page's primary content the way `/workspaces` itself is; if reviewers want a `ShellRefusal` treatment matching `/workspaces`' own rigor instead, that's a one-line change to add an `error` state, flagged here rather than silently decided.)

- [ ] **Step 5: Run test, full suite, typecheck**

```bash
pnpm --filter apps/web exec vitest run test/account-page.test.tsx
pnpm --filter apps/web exec vitest run
pnpm --filter apps/web typecheck
```
Expected: PASS.

- [ ] **Step 6: Catalogue and commit**

Add one case to `test-cases/13-deployment-dogfooding.md` (workspaces list shows real role + project count, no invented fields) and extend the `/account` Features.md bullet.

```bash
git add apps/web/src/account/workspaces-section.tsx apps/web/app/account/page.tsx apps/web/test/account-page.test.tsx Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Account: list the caller's workspaces with their real role"
```

---

### Task 5: Notification preferences — backend (domain, migration, route, filtering)

**Files:**
- Create: `packages/domain/src/notification-preferences.ts`
- Create: `packages/domain/test/notification-preferences.test.ts`
- Create: `apps/server/migrations/<next>_user-notification-preferences.sql`
- Create: `apps/server/src/notification-preferences/store.ts`
- Create: `apps/server/test/notification-preferences/store.test.ts`
- Create: `apps/server/src/routes/notification-preferences.ts`
- Create: `apps/server/test/routes/notification-preferences.test.ts`
- Modify: `apps/server/src/notifications/store.ts` (`listNotifications`, `unreadNotificationCount` gain a `mutedKinds` parameter)
- Modify: `apps/server/test/notifications/store.test.ts` (mutedKinds cases)
- Modify: `apps/server/src/routes/notifications.ts` (look up the caller's muted kinds, pass through)
- Modify: `apps/server/src/app.ts` (register the new route)

**Interfaces:**
- Produces: `NotificationPreferences = { mutedKinds: NotificationKind[] }`, `notificationPreferencesSchema` (Zod, `.strict()`), `EMPTY_NOTIFICATION_PREFERENCES` (domain). `getNotificationPreferences(db, userId)`, `putNotificationPreferences(db, userId, prefs)` (server store). `GET`/`PUT /v1/me/notification-preferences` (no `workspaceId` — this is deliberately global).
- Consumes: `NOTIFICATION_KINDS` from `packages/domain/src/notifications.ts` (unchanged).

**Why this isn't an extension of `UserPreferences` (deviates from spec §5):** `UserPreferences`/`user_preferences` (`packages/app-core/src/view-types.ts:389`, `apps/server/src/preferences/store.ts`) is keyed `(user_id, workspace_id)`, its schema (`preferencesDocSchema`) is `.strict()` with all three keys (`savedFilters`, `listColumns`, `grouping`) required, and a sweep (`apps/server/src/tools/sweep-user-preferences.ts`) deletes rows 30 days after a membership is revoked — every part of that design assumes "this preference belongs to one workspace." `/inbox` and its unread count are deliberately global (no `[workspaceId]` in the route; `NotificationsGateway.list()` takes no workspace parameter). Bolting a global field onto a workspace-keyed table would force the Inbox page to pick an arbitrary workspace just to read a setting that has nothing to do with any one workspace — worse, membership revocation from ANY one workspace would sweep away a preference that has nothing to do with that workspace. A new table keyed by `user_id` alone is a few dozen lines and avoids both problems.

**Design: mute-list, not enable-list.** Storing which kinds are OFF (`mutedKinds: NotificationKind[]`, default `[]`) means "no preferences set" and "everything on" are the same state — matching the spec's "default all-on, preserves current behavior" requirement for free, with no separate default-list to keep in sync with `NOTIFICATION_KINDS` as it grows.

**Filtering happens server-side, not in `InboxView`.** `packages/app-core/src/inbox/inbox-view.tsx`'s own docblock states it renders *every* row it's given, and a pinned test asserts rendered-row-count equals fixture length — a deliberate consequence of "a message you were sent is yours." Filtering in the SQL query (so a muted kind's rows never reach the client at all) preserves that invariant and its test completely unchanged, rather than requiring a client-side filter that would contradict it.

- [ ] **Step 1: Domain schema — write the failing test**

```ts
// packages/domain/test/notification-preferences.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_NOTIFICATION_PREFERENCES, notificationPreferencesSchema } from '../src/notification-preferences.js';

describe('notificationPreferencesSchema', () => {
  it('accepts an empty muted list — the default, everything on', () => {
    expect(notificationPreferencesSchema.parse({ mutedKinds: [] })).toEqual({ mutedKinds: [] });
    expect(EMPTY_NOTIFICATION_PREFERENCES).toEqual({ mutedKinds: [] });
  });

  it('accepts any subset of real kinds', () => {
    const doc = { mutedKinds: ['mention', 'stale-ticket'] };
    expect(notificationPreferencesSchema.parse(doc)).toEqual(doc);
  });

  it('refuses an unknown kind', () => {
    expect(notificationPreferencesSchema.safeParse({ mutedKinds: ['not-a-real-kind'] }).success).toBe(false);
  });

  it('refuses an unknown top-level key (.strict())', () => {
    expect(notificationPreferencesSchema.safeParse({ mutedKinds: [], extra: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/notification-preferences.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the domain schema**

```ts
// packages/domain/src/notification-preferences.ts
import { z } from 'zod';
import { NOTIFICATION_KINDS } from './notifications.js';

/**
 * A person's own choice of which real notification kinds still reach their
 * Inbox and its unread count — global, never per-workspace (the inbox
 * itself is a global route). A MUTED list, not an enabled one: an empty
 * list and "no preference recorded" are the same state, which is what
 * makes "everything on by default" free rather than a second constant to
 * keep in sync with `NOTIFICATION_KINDS` as it grows.
 *
 * Muting a kind hides it from what's read (the Inbox list and the unread
 * count) — it never stops the row from being WRITTEN. Preferences arrange
 * what's shown; they don't change what happened.
 */
export const notificationPreferencesSchema = z
  .object({
    mutedKinds: z.array(z.enum(NOTIFICATION_KINDS)).max(NOTIFICATION_KINDS.length),
  })
  .strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const EMPTY_NOTIFICATION_PREFERENCES: NotificationPreferences = Object.freeze({ mutedKinds: [] });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/notification-preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Migration — check the next free number and create it**

```bash
ls apps/server/migrations | sort | tail -5
```
Take the highest numeric prefix, add a reasonable increment (matching the existing convention — check two neighboring migration files' prefixes to see the typical gap), and name the file accordingly, e.g. `apps/server/migrations/<next>_user-notification-preferences.sql`:

```sql
CREATE TABLE user_notification_preferences (
  user_id     text        NOT NULL,
  muted_kinds text[]      NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL
);

ALTER TABLE user_notification_preferences
  ADD CONSTRAINT user_notification_preferences_pk PRIMARY KEY (user_id);
```

Run whatever this repo's migration-apply command is (check `apps/server/package.json` for a `migrate` script, e.g. `pnpm --filter apps/server run migrate`) against the dev database before writing store tests that hit real Postgres.

- [ ] **Step 6: Server store — write the failing test**

```ts
// apps/server/test/notification-preferences/store.test.ts
import { describe, expect, it } from 'vitest';
import { getNotificationPreferences, putNotificationPreferences } from '../../src/notification-preferences/store.js';
import { testPool } from '../helpers/test-pool.js'; // match whatever this repo's existing pool-per-test helper is named — grep apps/server/test for an existing store test's import to confirm the exact helper path/name before writing this

describe('user_notification_preferences store', () => {
  it('answers the empty default for a user with no row', async () => {
    const pool = await testPool();
    const prefs = await getNotificationPreferences(pool, 'u-never-seen');
    expect(prefs).toEqual({ mutedKinds: [] });
  });

  it('round-trips a written preference', async () => {
    const pool = await testPool();
    await putNotificationPreferences(pool, 'u1', { mutedKinds: ['mention', 'stale-ticket'] });
    expect(await getNotificationPreferences(pool, 'u1')).toEqual({ mutedKinds: ['mention', 'stale-ticket'] });
  });

  it('a second write replaces the first (upsert), not merges', async () => {
    const pool = await testPool();
    await putNotificationPreferences(pool, 'u1', { mutedKinds: ['mention'] });
    await putNotificationPreferences(pool, 'u1', { mutedKinds: [] });
    expect(await getNotificationPreferences(pool, 'u1')).toEqual({ mutedKinds: [] });
  });
});
```

(Before writing this, run `find apps/server/test -iname "*test-pool*" -o -iname "*db-helper*"` to find this repo's actual per-test Postgres setup helper and match its real name/import path — every other `store.test.ts` in `apps/server/test/` already uses one; do not invent a new database-connection pattern.)

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter apps/server exec vitest run test/notification-preferences/store.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 8: Implement the server store**

```ts
// apps/server/src/notification-preferences/store.ts
import { notificationPreferencesSchema, EMPTY_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js'; // match this repo's actual Queryable import path — same one apps/server/src/preferences/store.ts uses

export async function getNotificationPreferences(
  db: Queryable,
  userId: string,
): Promise<NotificationPreferences> {
  const { rows } = await db.query<{ muted_kinds: string[] }>(
    'SELECT muted_kinds FROM user_notification_preferences WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  if (row === undefined) return EMPTY_NOTIFICATION_PREFERENCES;
  return notificationPreferencesSchema.parse({ mutedKinds: row.muted_kinds });
}

export async function putNotificationPreferences(
  db: Queryable,
  userId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  await db.query(
    `INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET muted_kinds = EXCLUDED.muted_kinds, updated_at = now()`,
    [userId, prefs.mutedKinds],
  );
}
```

(Match `apps/server/src/preferences/store.ts`'s exact import style for `Queryable` — read that file first if the path above doesn't resolve.)

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter apps/server exec vitest run test/notification-preferences/store.test.ts`
Expected: PASS.

- [ ] **Step 10: Route — write the failing test**

```ts
// apps/server/test/routes/notification-preferences.test.ts
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/build-test-app.js'; // match this repo's real Fastify test-app builder — grep apps/server/test/routes/preferences.test.ts for its exact import
import { signInAs } from '../helpers/session.js'; // match the real helper name used by other route tests

describe('GET/PUT /v1/me/notification-preferences', () => {
  it('401s with no session', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/v1/me/notification-preferences' });
    expect(res.statusCode).toBe(401);
  });

  it('GET answers the empty default for a fresh user', async () => {
    const app = await buildTestApp();
    const cookie = await signInAs(app, 'u1');
    const res = await app.inject({ method: 'GET', url: '/v1/me/notification-preferences', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mutedKinds: [] });
  });

  it('PUT then GET round-trips', async () => {
    const app = await buildTestApp();
    const cookie = await signInAs(app, 'u1');
    const put = await app.inject({
      method: 'PUT', url: '/v1/me/notification-preferences', headers: { cookie },
      payload: { mutedKinds: ['mention'] },
    });
    expect(put.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: '/v1/me/notification-preferences', headers: { cookie } });
    expect(get.json()).toEqual({ mutedKinds: ['mention'] });
  });

  it('PUT refuses an unknown kind with 400', async () => {
    const app = await buildTestApp();
    const cookie = await signInAs(app, 'u1');
    const res = await app.inject({
      method: 'PUT', url: '/v1/me/notification-preferences', headers: { cookie },
      payload: { mutedKinds: ['not-a-real-kind'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("one user's write never touches another's row", async () => {
    const app = await buildTestApp();
    const cookieA = await signInAs(app, 'ua');
    const cookieB = await signInAs(app, 'ub');
    await app.inject({ method: 'PUT', url: '/v1/me/notification-preferences', headers: { cookie: cookieA }, payload: { mutedKinds: ['mention'] } });
    const getB = await app.inject({ method: 'GET', url: '/v1/me/notification-preferences', headers: { cookie: cookieB } });
    expect(getB.json()).toEqual({ mutedKinds: [] });
  });
});
```

(Match `apps/server/test/routes/preferences.test.ts`'s exact test-app/session-cookie helper imports and call shapes — read that file first, since this route follows the identical `requireSession`-gated pattern minus the `workspaceId` query param and its member-check.)

- [ ] **Step 11: Run it to verify it fails**

Expected: FAIL — route doesn't exist (connection refused / 404).

- [ ] **Step 12: Implement the route**

```ts
// apps/server/src/routes/notification-preferences.ts
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { notificationPreferencesSchema } from '@gisik-nokma/domain';
import { getNotificationPreferences, putNotificationPreferences } from '../notification-preferences/store.js';
import type { Queryable } from '../db/queryable.js';

export function registerNotificationPreferencesRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get('/v1/me/notification-preferences', { preHandler: requireSession }, async (request) => {
    return getNotificationPreferences(deps.pool, request.currentUserId);
  });

  app.put('/v1/me/notification-preferences', { preHandler: requireSession }, async (request, reply) => {
    const parsed = notificationPreferencesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_notification_preferences' });
    }
    await putNotificationPreferences(deps.pool, request.currentUserId, parsed.data);
    return parsed.data;
  });
}
```

Register it in `apps/server/src/app.ts` next to the existing `registerNotificationRoutes(app, { pool: deps.pool }, requireSession);` call (same file, same `deps`/`requireSession` already in scope):

```diff
 registerNotificationRoutes(app, { pool: deps.pool }, requireSession);
+registerNotificationPreferencesRoutes(app, { pool: deps.pool }, requireSession);
```
(plus the matching import at the top of `app.ts`).

- [ ] **Step 13: Run the route test to verify it passes**

Expected: PASS.

- [ ] **Step 14: Apply the filter — write the failing test**

```ts
// add to apps/server/test/notifications/store.test.ts
describe('unreadNotificationCount / listNotifications — muted kinds', () => {
  it('unreadNotificationCount excludes a muted kind', async () => {
    const pool = await testPool();
    await seedNotification(pool, { userId: 'u1', kind: 'mention', read: false });
    await seedNotification(pool, { userId: 'u1', kind: 'assignment', read: false });
    expect(await unreadNotificationCount(pool, 'u1', [])).toBe(2);
    expect(await unreadNotificationCount(pool, 'u1', ['mention'])).toBe(1);
  });

  it('listNotifications excludes a muted kind entirely — not just marks it read', async () => {
    const pool = await testPool();
    await seedNotification(pool, { userId: 'u1', kind: 'mention', read: false });
    const page = await listNotifications(pool, 'u1', { mutedKinds: ['mention'] });
    expect(page.notifications).toHaveLength(0);
  });

  it('an empty muted list changes nothing — the default', async () => {
    const pool = await testPool();
    await seedNotification(pool, { userId: 'u1', kind: 'mention', read: false });
    expect(await unreadNotificationCount(pool, 'u1', [])).toBe(1);
  });
});
```

(`seedNotification` — check this file's existing tests for however they currently insert a row to seed fixtures; reuse that helper rather than inventing a new one.)

- [ ] **Step 15: Run it to verify it fails**

Expected: FAIL — `unreadNotificationCount`/`listNotifications` don't accept a third/`mutedKinds` argument yet (TypeScript error or the extra argument is silently ignored and the count doesn't change — either way, red).

- [ ] **Step 16: Implement the filter**

```diff
 // apps/server/src/notifications/store.ts
 export async function unreadNotificationCount(
   db: Queryable,
   userId: string,
+  mutedKinds: readonly string[] = [],
 ): Promise<number> {
   const result = await db.query(
-    'SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = false',
-    [userId],
+    'SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = false AND NOT (kind = ANY($2::text[]))',
+    [userId, mutedKinds],
   );
   return (result.rows[0] as { unread: number }).unread;
 }
```

```diff
 export async function listNotifications(
   db: Queryable, userId: string,
-  opts: { cursor?: string | null; limit?: number; workspaceId?: string | null },
+  opts: { cursor?: string | null; limit?: number; workspaceId?: string | null; mutedKinds?: readonly string[] },
 ): Promise<NotificationPage> {
   const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
-  ... WHERE user_id = $1 [AND id < $cursor] [AND workspace_id = $workspaceId]
+  ... WHERE user_id = $1 [AND id < $cursor] [AND workspace_id = $workspaceId] AND NOT (kind = ANY($mutedKinds::text[]))
       ORDER BY id DESC LIMIT ...
 }
```

(Read the actual current SQL-building code in this file first — it likely builds the query with conditional clause arrays rather than literal bracket placeholders as shown here; add the `mutedKinds` clause following whatever pattern the existing `workspaceId`/`cursor` conditionals already use, defaulting `opts.mutedKinds` to `[]` the same way `unreadNotificationCount` does above. `kind = ANY('{}')` is always false, so `NOT (...)` is true for every row when the list is empty — confirmed correct default behavior, no special-casing needed for "no muted kinds.")

- [ ] **Step 17: Wire the route to look up muted kinds**

```diff
 // apps/server/src/routes/notifications.ts
+import { getNotificationPreferences } from '../notification-preferences/store.js';

   app.get<{ Querystring: { cursor?: string; limit?: string; workspaceId?: string } }>(
     '/v1/me/notifications',
     { preHandler: requireSession },
     async (request, reply) => {
       ...
-      return listNotifications(deps.pool, request.currentUserId, { cursor, limit, workspaceId });
+      const { mutedKinds } = await getNotificationPreferences(deps.pool, request.currentUserId);
+      return listNotifications(deps.pool, request.currentUserId, { cursor, limit, workspaceId, mutedKinds });
     },
   );

   app.get(
     '/v1/me/notifications/unread-count',
     { preHandler: requireSession },
     async (request) => {
-      return { unread: await unreadNotificationCount(deps.pool, request.currentUserId) };
+      const { mutedKinds } = await getNotificationPreferences(deps.pool, request.currentUserId);
+      return { unread: await unreadNotificationCount(deps.pool, request.currentUserId, mutedKinds) };
     },
   );
```

- [ ] **Step 18: Run all the modified/new tests, then the full server suite**

```bash
pnpm --filter apps/server exec vitest run test/notification-preferences test/notifications test/routes/notification-preferences.test.ts test/routes/notifications.test.ts
pnpm --filter apps/server exec vitest run
pnpm --filter apps/server typecheck
pnpm --filter @gisik-nokma/domain exec vitest run
```
Expected: PASS.

- [ ] **Step 19: Catalogue and commit**

Add cases to `test-cases/11-calendar-notifications.md` (the schema's shape and `.strict()` refusal; the route's 401/200/400/isolation behavior; the store filter's three behaviors above) starting from that file's next free number, and a new `Features.md` bullet under whatever section already holds the notification-fanout/sweep bullets (search `grep -n "notification" Features.md` to find the right neighboring bullet).

```bash
git add packages/domain/src/notification-preferences.ts packages/domain/test/notification-preferences.test.ts \
  apps/server/migrations apps/server/src/notification-preferences apps/server/test/notification-preferences \
  apps/server/src/routes/notification-preferences.ts apps/server/test/routes/notification-preferences.test.ts \
  apps/server/src/notifications/store.ts apps/server/test/notifications/store.test.ts \
  apps/server/src/routes/notifications.ts apps/server/src/app.ts \
  Features.md test-cases/11-calendar-notifications.md
git commit -m "Add a global, per-kind notification-preference: schema, table, route, and read-side filtering"
```

---

### Task 6: Notification preferences — client gateway and UI section

**Files:**
- Create: `packages/app-core/src/account/notification-preferences-gateway.ts`
- Create: `packages/app-core/src/online/notification-preferences.ts`
- Create: `packages/app-core/test/online/notification-preferences.test.ts`
- Create: `packages/app-core/src/account/notifications-section.tsx`
- Create: `packages/app-core/test/account/notifications-section.test.tsx`
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/src/providers.tsx` (wire the new gateway into `AppServices`, same way `notifications: NotificationsGateway` already is)
- Modify: `apps/web/test/helpers/stub-services.ts` (add a stub for the new gateway)

**Interfaces:**
- Produces: `NotificationPreferencesGateway { load(): Promise<NotificationPreferences>; save(next: NotificationPreferences): Promise<void>; }` (abstract, app-core). `createHttpNotificationPreferencesGateway(http: HttpClient): NotificationPreferencesGateway` (concrete, online). `NotificationsSection({ mutedKinds, onToggle }: { mutedKinds: readonly NotificationKind[]; onToggle: (kind: NotificationKind) => void })` (framework-free view).

- [ ] **Step 1: Gateway — write the failing test**

```ts
// packages/app-core/test/online/notification-preferences.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createHttpNotificationPreferencesGateway } from '../../src/online/notification-preferences.js';

function fakeHttp(overrides: Partial<{ get: unknown; put: unknown }> = {}) {
  return {
    get: vi.fn().mockResolvedValue({ mutedKinds: [] }),
    put: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createHttpNotificationPreferencesGateway', () => {
  it('load() GETs the global endpoint and parses the result', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ mutedKinds: ['mention'] }) });
    const gateway = createHttpNotificationPreferencesGateway(http as never);
    expect(await gateway.load()).toEqual({ mutedKinds: ['mention'] });
    expect(http.get).toHaveBeenCalledWith('/v1/me/notification-preferences');
  });

  it('save() PUTs the whole document', async () => {
    const http = fakeHttp();
    const gateway = createHttpNotificationPreferencesGateway(http as never);
    await gateway.save({ mutedKinds: ['stale-ticket'] });
    expect(http.put).toHaveBeenCalledWith('/v1/me/notification-preferences', { mutedKinds: ['stale-ticket'] });
  });

  it('load() refuses a malformed body rather than returning it', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ mutedKinds: ['not-a-real-kind'] }) });
    const gateway = createHttpNotificationPreferencesGateway(http as never);
    await expect(gateway.load()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement the abstract interface and the HTTP gateway**

```ts
// packages/app-core/src/account/notification-preferences-gateway.ts
import type { NotificationPreferences } from '@gisik-nokma/domain';

export interface NotificationPreferencesGateway {
  load(): Promise<NotificationPreferences>;
  save(next: NotificationPreferences): Promise<void>;
}
```

```ts
// packages/app-core/src/online/notification-preferences.ts
import { notificationPreferencesSchema, type NotificationPreferences } from '@gisik-nokma/domain';
import type { NotificationPreferencesGateway } from '../account/notification-preferences-gateway.js';
import type { HttpClient } from './http.js'; // match the exact type name/path this file's siblings (notifications.ts) import

export function createHttpNotificationPreferencesGateway(http: HttpClient): NotificationPreferencesGateway {
  return {
    async load() {
      const raw = await http.get('/v1/me/notification-preferences');
      return notificationPreferencesSchema.parse(raw);
    },
    async save(next: NotificationPreferences) {
      await http.put('/v1/me/notification-preferences', next);
    },
  };
}
```

(Read `packages/app-core/src/online/notifications.ts` first to match its exact `HttpClient`/`http.get`/`http.put` import path and call convention precisely — it's the direct sibling this file is modeled on.)

- [ ] **Step 4: Run the gateway test to verify it passes**

Expected: PASS.

- [ ] **Step 5: UI section — write the failing test**

```tsx
// packages/app-core/test/account/notifications-section.test.tsx
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsSection } from '../../src/account/notifications-section.js';

describe('NotificationsSection', () => {
  it('renders one checked-by-default row per real notification kind', () => {
    render(<NotificationsSection mutedKinds={[]} onToggle={vi.fn()} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeChecked();
    }
  });

  it('a muted kind renders unchecked', () => {
    render(<NotificationsSection mutedKinds={['mention']} onToggle={vi.fn()} />);
    expect(screen.getByLabelText(/mentioned/i)).not.toBeChecked();
  });

  it('clicking a row calls onToggle with that kind', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<NotificationsSection mutedKinds={[]} onToggle={onToggle} />);
    await user.click(screen.getByLabelText(/mentioned/i));
    expect(onToggle).toHaveBeenCalledWith('mention');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement the section**

```tsx
// packages/app-core/src/account/notifications-section.tsx
import { NOTIFICATION_KINDS, type NotificationKind } from '@gisik-nokma/domain';

const LABELS: Record<NotificationKind, string> = {
  assignment: 'A ticket is assigned to you',
  mention: 'You are mentioned in a comment or description',
  'contested-claim': 'A claim of yours is contested',
  'date-approaching': 'A date you are watching is approaching',
  'stale-ticket': 'A ticket has sat unmoved for a while',
};

export type NotificationsSectionProps = {
  mutedKinds: readonly NotificationKind[];
  onToggle: (kind: NotificationKind) => void;
};

/**
 * One row per REAL kind — no "email" column, no "weekly digest" row. Neither
 * exists server-side (only in-app Inbox delivery is real), so this section
 * shows exactly what it can actually control.
 */
export function NotificationsSection({ mutedKinds, onToggle }: NotificationsSectionProps) {
  return (
    <section className="gn-account__section gn-account__notifications">
      <h2 className="gn-account__section-title">Notifications</h2>
      {NOTIFICATION_KINDS.map((kind) => (
        <label key={kind} className="gn-account__notification-row">
          <input type="checkbox" checked={!mutedKinds.includes(kind)} onChange={() => onToggle(kind)} />
          {LABELS[kind]}
        </label>
      ))}
    </section>
  );
}
```

- [ ] **Step 8: Run the section test to verify it passes**

Expected: PASS.

- [ ] **Step 9: Wire the gateway into `AppServices` and the stub**

```diff
 // apps/web/src/providers.tsx
+import { createHttpNotificationPreferencesGateway } from '@gisik-nokma/app-core';
   // wherever `notifications: createHttpNotificationsGateway(http)` is currently built:
+  notificationPreferences: createHttpNotificationPreferencesGateway(http),
```

```diff
 // apps/web/test/helpers/stub-services.ts
+  notificationPreferences: {
+    load: async () => ({ mutedKinds: [] }),
+    save: async () => {},
+  },
```
(match this file's existing pattern for how `notifications`'s stub is built and merged with overrides — read it first rather than guessing the exact merge shape).

- [ ] **Step 10: Wire the section into the account page**

```diff
 // apps/web/app/account/page.tsx
+import { NotificationsSection } from '@gisik-nokma/app-core';
+import type { NotificationKind, NotificationPreferences } from '@gisik-nokma/domain';

   const { dataSource } = useAppServices();
+  const { notificationPreferences } = useAppServices();
+  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
+
+  useEffect(() => {
+    notificationPreferences.load().then(setPrefs, () => setPrefs({ mutedKinds: [] }));
+  }, [notificationPreferences]);
+
+  const toggleKind = useCallback(
+    (kind: NotificationKind) => {
+      if (prefs === null) return;
+      const muted = prefs.mutedKinds.includes(kind);
+      const next = { mutedKinds: muted ? prefs.mutedKinds.filter((k) => k !== kind) : [...prefs.mutedKinds, kind] };
+      setPrefs(next); // optimistic
+      void notificationPreferences.save(next).catch(() => {
+        notificationPreferences.load().then(setPrefs); // revert to the true state on failure
+      });
+    },
+    [prefs, notificationPreferences],
+  );

   ...
+      {prefs !== null ? <NotificationsSection mutedKinds={prefs.mutedKinds} onToggle={toggleKind} /> : null}
```

(Export `NotificationsSection`, `NotificationPreferencesGateway`, and `createHttpNotificationPreferencesGateway` from `packages/app-core/src/index.ts` alongside the package's other public exports — check that file for where sibling account/inbox exports currently live.)

- [ ] **Step 11: Run the full web + app-core suites and typecheck**

```bash
pnpm --filter apps/web exec vitest run
pnpm --filter apps/web typecheck
pnpm --filter @gisik-nokma/app-core exec vitest run
pnpm --filter @gisik-nokma/app-core typecheck
```
Expected: PASS.

- [ ] **Step 12: Catalogue and commit**

Add cases to `test-cases/11-calendar-notifications.md` for the gateway (load/save/malformed-refusal) and the section (5 rows, muted renders unchecked, click calls onToggle), plus extend the `Features.md` `/account` bullet with a Notifications sub-clause.

```bash
git add packages/app-core/src/account/notification-preferences-gateway.ts packages/app-core/src/online/notification-preferences.ts \
  packages/app-core/test/online/notification-preferences.test.ts packages/app-core/src/account/notifications-section.tsx \
  packages/app-core/test/account/notifications-section.test.tsx packages/app-core/src/index.ts \
  apps/web/app/account/page.tsx apps/web/src/providers.tsx apps/web/test/helpers/stub-services.ts \
  Features.md test-cases/11-calendar-notifications.md
git commit -m "Account: notification preferences — gateway, section UI, wired end to end"
```

---

### Task 7: Account — Sessions section

**Files:**
- Create: `packages/app-core/src/account/sessions-client.ts`
- Create: `packages/app-core/src/account/sessions-section.tsx`
- Create: `packages/app-core/test/account/sessions-section.test.tsx`
- Modify: `apps/web/src/account/account-clients.ts` (new file if not already created by this task — the `authClient`-backed implementation)
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/test/account-page.test.tsx`

**Interfaces:**
- Produces: `SessionSummary = { token: string; createdAt: string; updatedAt: string; deviceLabel: string; isCurrent: boolean }` and `SessionsClient { list(): Promise<SessionSummary[]>; revoke(token: string): Promise<{ error: string | null }>; }` (abstract, app-core, no `authClient`/Next import). `SessionsSection({ sessions, onRevoke }: { sessions: SessionSummary[]; onRevoke: (token: string) => void })` (framework-free view).

**Verification step before writing code:** better-auth's core client exposes session listing/revocation as base methods, confirmed present in the installed package (`routes/session.mjs`) without any extra plugin. Confirm the exact call shape and field names on the returned session object before writing the client adapter:
```bash
grep -n "listSessions\|revokeSession" node_modules/.pnpm/better-auth@1.7.2*/node_modules/better-auth/dist/client/index.d.mts
```
The plan below assumes `authClient.listSessions(): Promise<{ data: Array<{ token: string; userAgent?: string | null; createdAt: string; updatedAt: string }> | null; error }>` and `authClient.revokeSession({ token }): Promise<{ error }>` — better-auth's documented shape. If the installed types differ, adjust the adapter in Step 5 to match what's actually there; don't force this plan's assumed shape onto a different real one.

**Device labels never fabricate specificity.** No `"iPhone · Shillong"`-style invented text — a short, explicit substring match against `userAgent` (`Chrome`, `Safari`, `Firefox` × `Windows`, `Mac`, `iPhone`, `iPad`, `Android`), producing e.g. `"Chrome on Mac"`; anything that doesn't match falls back to `"Unknown device"`. This is a small implementation detail (the exact substring list), not a design decision — pick something reasonable and move on.

- [ ] **Step 1: Write the failing test for the section**

```tsx
// packages/app-core/test/account/sessions-section.test.tsx
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionsSection } from '../../src/account/sessions-section.js';

const SESSIONS = [
  { token: 't1', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', deviceLabel: 'Chrome on Mac', isCurrent: true },
  { token: 't2', createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z', deviceLabel: 'Unknown device', isCurrent: false },
];

describe('SessionsSection', () => {
  it('lists every session with its device label', () => {
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} />);
    expect(screen.getByText('Chrome on Mac')).toBeInTheDocument();
    expect(screen.getByText('Unknown device')).toBeInTheDocument();
  });

  it('the current session has no revoke control; others do', () => {
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /sign out/i })).toHaveLength(1);
  });

  it('clicking Sign out calls onRevoke with that session\'s token', async () => {
    const onRevoke = vi.fn();
    const user = userEvent.setup();
    render(<SessionsSection sessions={SESSIONS} onRevoke={onRevoke} />);
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onRevoke).toHaveBeenCalledWith('t2');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the abstract interface and the section**

```ts
// packages/app-core/src/account/sessions-client.ts
export type SessionSummary = {
  token: string;
  createdAt: string;
  updatedAt: string;
  deviceLabel: string;
  isCurrent: boolean;
};

export interface SessionsClient {
  list(): Promise<SessionSummary[]>;
  revoke(token: string): Promise<{ error: string | null }>;
}
```

```tsx
// packages/app-core/src/account/sessions-section.tsx
import type { SessionSummary } from './sessions-client.js';

export type SessionsSectionProps = {
  sessions: SessionSummary[];
  onRevoke: (token: string) => void;
};

export function SessionsSection({ sessions, onRevoke }: SessionsSectionProps) {
  return (
    <section className="gn-account__section gn-account__sessions">
      <h2 className="gn-account__section-title">Sign-in and devices</h2>
      <ul className="gn-account__session-list">
        {sessions.map((session) => (
          <li key={session.token} className="gn-account__session-row">
            <span>{session.deviceLabel}</span>
            <span>{session.isCurrent ? 'This device' : `Last active ${session.updatedAt}`}</span>
            {!session.isCurrent ? (
              <button type="button" onClick={() => onRevoke(session.token)}>
                Sign out
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the section test to verify it passes**

Expected: PASS.

- [ ] **Step 5: Implement the `authClient`-backed adapter**

```ts
// apps/web/src/account/account-clients.ts
import type { SessionsClient, SessionSummary } from '@gisik-nokma/app-core';
import { authClient } from '../auth-client.js';

const DEVICE_PATTERNS: Array<{ match: RegExp; label: string }> = [
  { match: /Chrome.*Mac/i, label: 'Chrome on Mac' },
  { match: /Chrome.*Windows/i, label: 'Chrome on Windows' },
  { match: /Chrome.*Android/i, label: 'Chrome on Android' },
  { match: /Safari.*iPhone/i, label: 'Safari on iPhone' },
  { match: /Safari.*iPad/i, label: 'Safari on iPad' },
  { match: /Safari.*Mac/i, label: 'Safari on Mac' },
  { match: /Firefox.*Mac/i, label: 'Firefox on Mac' },
  { match: /Firefox.*Windows/i, label: 'Firefox on Windows' },
];

function deviceLabelOf(userAgent: string | null | undefined): string {
  if (userAgent === null || userAgent === undefined) return 'Unknown device';
  const found = DEVICE_PATTERNS.find((pattern) => pattern.match.test(userAgent));
  return found?.label ?? 'Unknown device';
}

export function createSessionsClient(currentToken: string | null): SessionsClient {
  return {
    async list(): Promise<SessionSummary[]> {
      const result = await authClient.listSessions();
      return (result.data ?? []).map((session) => ({
        token: session.token,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        deviceLabel: deviceLabelOf(session.userAgent),
        isCurrent: session.token === currentToken,
      }));
    },
    async revoke(token: string) {
      const result = await authClient.revokeSession({ token });
      return { error: result.error?.message ?? null };
    },
  };
}
```

(`currentToken` — confirm how the currently-active session's own token is exposed by `authClient.useSession()`'s return shape via the same `.d.mts` check as Step 0; better-auth conventionally puts it on the session object itself, e.g. `session.data?.session.token`.)

- [ ] **Step 6: Wire into the account page**

```diff
 // apps/web/app/account/page.tsx
+import { SessionsSection } from '@gisik-nokma/app-core';
+import type { SessionSummary } from '@gisik-nokma/app-core';
+import { createSessionsClient } from '../../src/account/account-clients.js';

   const session = authClient.useSession();
   const user = session.data?.user ?? null;
+  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
+  const sessionsClient = useMemo(() => createSessionsClient(session.data?.session.token ?? null), [session.data?.session.token]);
+
+  useEffect(() => {
+    sessionsClient.list().then(setSessions, () => setSessions([]));
+  }, [sessionsClient]);
+
+  const revokeSession = useCallback(
+    async (token: string) => {
+      await sessionsClient.revoke(token);
+      sessionsClient.list().then(setSessions);
+    },
+    [sessionsClient],
+  );

   ...
+      {sessions !== null ? <SessionsSection sessions={sessions} onRevoke={(token) => void revokeSession(token)} /> : null}
```

- [ ] **Step 7: Write and pass a page-level integration test for the wiring**

The Files list for this task names `apps/web/test/account-page.test.tsx` as modified — this step is what actually earns that, matching the pattern Tasks 2–4 already established (a page-level test proves the wiring, not just the isolated section component):

```tsx
// add to apps/web/test/account-page.test.tsx
const listSessions = vi.fn();
const revokeSession = vi.fn();
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    signOut: vi.fn(),
    useSession: () => ({ data: { user: { id: 'u1', name: 'Anjali', email: 'a@example.com' }, session: { token: 'current-token' } } }),
    updateUser: vi.fn(),
    listSessions: (...args: unknown[]) => listSessions(...args),
    revokeSession: (...args: unknown[]) => revokeSession(...args),
  },
}));

describe('AccountPage — Sessions', () => {
  it('lists sessions and lets you revoke a non-current one', async () => {
    listSessions.mockResolvedValue({
      data: [
        { token: 'current-token', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', userAgent: 'Mozilla/5.0 Chrome Mac' },
        { token: 'other-token', createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z', userAgent: null },
      ],
      error: null,
    });
    revokeSession.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('Chrome on Mac')).toBeInTheDocument();
    expect(screen.getByText('Unknown device')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(revokeSession).toHaveBeenCalledWith({ token: 'other-token' });
  });
});
```

Run: `pnpm --filter apps/web exec vitest run test/account-page.test.tsx` — expect FAIL first (no `Sessions` wiring exists on the page yet if this step is reached before Step 6, or PASS if Step 6 is already done; run it before Step 6's edit to see it fail, confirming the test is real, then again after to see it pass).

- [ ] **Step 8: Full suite + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run
pnpm --filter @gisik-nokma/app-core typecheck
pnpm --filter apps/web exec vitest run
pnpm --filter apps/web typecheck
```
Expected: PASS.

- [ ] **Step 9: Catalogue and commit**

Add cases to `test-cases/13-deployment-dogfooding.md`: sessions list with honest device labels (never fabricated specificity), current session has no revoke control, revoking another session removes it. Extend the `/account` Features.md bullet.

```bash
git add packages/app-core/src/account/sessions-client.ts packages/app-core/src/account/sessions-section.tsx \
  packages/app-core/test/account/sessions-section.test.tsx packages/app-core/src/index.ts \
  apps/web/src/account/account-clients.ts apps/web/app/account/page.tsx apps/web/test/account-page.test.tsx \
  Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Account: Sessions section — list and revoke via better-auth's core session API"
```

---

### Task 8: Account — Passkeys section, and the sign-in button (absorbs Task 12)

**Files:**
- Create: `packages/app-core/src/account/passkey-client.ts`
- Create: `packages/app-core/src/account/passkeys-section.tsx`
- Create: `packages/app-core/test/account/passkeys-section.test.tsx`
- Modify: `apps/web/src/account/account-clients.ts` (add the passkey adapter)
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/test/account-page.test.tsx`
- Modify: `apps/web/app/sign-in/page.tsx` (the button)
- Modify: `apps/web/test/sign-in.test.tsx` (replace test `13.326`)

**Interfaces:**
- Produces: `PasskeySummary = { id: string; name: string }`, `PasskeyClient { list(): Promise<PasskeySummary[]>; add(name: string): Promise<{ error: string | null }>; remove(id: string): Promise<{ error: string | null }>; }` (abstract, app-core). `PasskeysSection({ passkeys, onAdd, onRemove }: { passkeys: PasskeySummary[]; onAdd: (name: string) => void; onRemove: (id: string) => void })`.

**Verification step before writing code:** confirm the exact `@better-auth/passkey` client method names (research confirmed `authClient.passkey.addPasskey(...)` and a `listPasskeys` atom exist; a `deletePasskey` method is the conventional name but wasn't independently confirmed in the earlier research pass):
```bash
grep -n "deletePasskey\|listPasskeys\|addPasskey" node_modules/.pnpm/@better-auth+passkey*/node_modules/@better-auth/passkey/dist/client.d.mts
```
Use whatever the installed types actually name; the plan below uses `deletePasskey`/`listPasskeys`/`addPasskey` as best-available names from the earlier check.

**The rate-limit-neutral constraint (carried over from Task 12 verbatim, non-negotiable):** an anonymous `/sign-in` page load must charge the shared `auth:` rate-limit bucket zero times. This plan satisfies it with an **explicit "Sign in with a passkey" button** rather than focus-triggered conditional UI (a deviation from the spec's wording — see Global Constraints): nothing calls `authClient.signIn.passkey(...)` until the button is clicked, which trivially has zero cost on page load, and it matches `docs/manual.md`'s/`docs/faq.md`'s existing wording (`"Sign in with a passkey — this is the fingerprint or face unlock..."`) exactly as already written — no doc edits needed once the button exists.

- [ ] **Step 1: Passkeys section — write the failing test**

```tsx
// packages/app-core/test/account/passkeys-section.test.tsx
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasskeysSection } from '../../src/account/passkeys-section.js';

describe('PasskeysSection', () => {
  it('shows the named empty state with nothing registered', () => {
    render(<PasskeysSection passkeys={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('You have no passkeys yet.')).toBeInTheDocument();
  });

  it('lists a registered passkey with a delete control', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<PasskeysSection passkeys={[{ id: 'p1', name: 'MacBook Touch ID' }]} onAdd={vi.fn()} onRemove={onRemove} />);
    expect(screen.getByText('MacBook Touch ID')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete passkey MacBook Touch ID' }));
    expect(onRemove).toHaveBeenCalledWith('p1');
  });

  it('adding a passkey submits the typed name', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<PasskeysSection passkeys={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    await user.type(screen.getByLabelText('Passkey name'), 'Work laptop');
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(onAdd).toHaveBeenCalledWith('Work laptop');
  });

  it('a refusal renders verbatim in a role="alert"', () => {
    render(<PasskeysSection passkeys={[]} onAdd={vi.fn()} onRemove={vi.fn()} error="This authenticator is already registered" />);
    expect(screen.getByRole('alert')).toHaveTextContent('This authenticator is already registered');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the abstract interface and the section**

```ts
// packages/app-core/src/account/passkey-client.ts
export type PasskeySummary = { id: string; name: string };

export interface PasskeyClient {
  list(): Promise<PasskeySummary[]>;
  add(name: string): Promise<{ error: string | null }>;
  remove(id: string): Promise<{ error: string | null }>;
}
```

```tsx
// packages/app-core/src/account/passkeys-section.tsx
import { useState } from 'react';
import type { PasskeySummary } from './passkey-client.js';

export type PasskeysSectionProps = {
  passkeys: PasskeySummary[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  error?: string | null;
};

export function PasskeysSection({ passkeys, onAdd, onRemove, error = null }: PasskeysSectionProps) {
  const [name, setName] = useState('');

  return (
    <section className="gn-account__section gn-account__passkeys">
      <h2 className="gn-account__section-title">Passkeys</h2>
      {error !== null ? (
        <p role="alert" className="gn-account__error">
          {error}
        </p>
      ) : null}
      {passkeys.length === 0 ? (
        <p>You have no passkeys yet.</p>
      ) : (
        <ul className="gn-account__passkey-list">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="gn-account__passkey-row">
              <span>{passkey.name}</span>
              <button type="button" aria-label={`Delete passkey ${passkey.name}`} onClick={() => onRemove(passkey.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="gn-account__field">
        <span>Passkey name</span>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} className="gn-field__input" />
      </label>
      <button
        type="button"
        onClick={() => {
          onAdd(name);
          setName('');
        }}
      >
        Add a passkey
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Run the section test to verify it passes**

Expected: PASS.

- [ ] **Step 5: Implement the `authClient`-backed adapter**

```diff
 // apps/web/src/account/account-clients.ts
+import type { PasskeyClient, PasskeySummary } from '@gisik-nokma/app-core';

+export function createPasskeyClient(): PasskeyClient {
+  return {
+    async list(): Promise<PasskeySummary[]> {
+      const result = await authClient.passkey.listUserPasskeys();
+      return (result.data ?? []).map((passkey) => ({ id: passkey.id, name: passkey.name ?? 'Unnamed passkey' }));
+    },
+    async add(name: string) {
+      const result = await authClient.passkey.addPasskey({ name });
+      return { error: result?.error?.message ?? null };
+    },
+    async remove(id: string) {
+      const result = await authClient.passkey.deletePasskey({ id });
+      return { error: result?.error?.message ?? null };
+    },
+  };
+}
```

(Confirm `listUserPasskeys` vs. the `listPasskeys` atom found in the earlier research pass against Step 0's grep output before finalizing this — the research surfaced both an atom-based `listPasskeys`/`$listPasskeys` and referenced a conventional `listUserPasskeys` method; use whichever the installed `.d.mts` actually exports as an async function, not the atom, since this adapter needs a plain `Promise`-returning call.)

- [ ] **Step 6: Wire into the account page, with refusal state**

```diff
 // apps/web/app/account/page.tsx
+import { PasskeysSection } from '@gisik-nokma/app-core';
+import type { PasskeySummary } from '@gisik-nokma/app-core';
+import { createPasskeyClient } from '../../src/account/account-clients.js';

+  const passkeyClient = useMemo(() => createPasskeyClient(), []);
+  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
+  const [passkeyError, setPasskeyError] = useState<string | null>(null);
+
+  const reloadPasskeys = useCallback(() => {
+    passkeyClient.list().then(setPasskeys, () => setPasskeys([]));
+  }, [passkeyClient]);
+
+  useEffect(() => {
+    reloadPasskeys();
+  }, [reloadPasskeys]);
+
+  const addPasskey = useCallback(
+    async (name: string) => {
+      const result = await passkeyClient.add(name);
+      setPasskeyError(result.error);
+      if (result.error === null) reloadPasskeys();
+    },
+    [passkeyClient, reloadPasskeys],
+  );
+
+  const removePasskey = useCallback(
+    async (id: string) => {
+      const result = await passkeyClient.remove(id);
+      setPasskeyError(result.error);
+      if (result.error === null) reloadPasskeys();
+    },
+    [passkeyClient, reloadPasskeys],
+  );

   ...
+      {passkeys !== null ? (
+        <PasskeysSection
+          passkeys={passkeys}
+          onAdd={(name) => void addPasskey(name)}
+          onRemove={(id) => void removePasskey(id)}
+          error={passkeyError}
+        />
+      ) : null}
```

- [ ] **Step 7: Write and pass a page-level integration test for the wiring**

The Files list for this task names `apps/web/test/account-page.test.tsx` as modified — matching the pattern Tasks 2–4 established:

```tsx
// add to apps/web/test/account-page.test.tsx
const listUserPasskeys = vi.fn();
const addPasskey = vi.fn();
const deletePasskey = vi.fn();
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    signOut: vi.fn(),
    useSession: () => ({ data: { user: { id: 'u1', name: 'Anjali', email: 'a@example.com' }, session: { token: 'current-token' } } }),
    updateUser: vi.fn(),
    listSessions: vi.fn().mockResolvedValue({ data: [], error: null }),
    revokeSession: vi.fn(),
    passkey: {
      listUserPasskeys: (...args: unknown[]) => listUserPasskeys(...args),
      addPasskey: (...args: unknown[]) => addPasskey(...args),
      deletePasskey: (...args: unknown[]) => deletePasskey(...args),
    },
  },
}));

describe('AccountPage — Passkeys', () => {
  it('shows the empty state, adds a passkey, and lists it after reload', async () => {
    listUserPasskeys
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'p1', name: 'Work laptop' }], error: null });
    addPasskey.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('You have no passkeys yet.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Passkey name'), 'Work laptop');
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(addPasskey).toHaveBeenCalledWith({ name: 'Work laptop' });
    expect(await screen.findByText('Work laptop')).toBeInTheDocument();
  });

  it('a refusal from the server renders verbatim', async () => {
    listUserPasskeys.mockResolvedValue({ data: [], error: null });
    addPasskey.mockResolvedValue({ error: { message: 'This authenticator is already registered' } });
    const user = userEvent.setup();
    mount();
    await screen.findByText('You have no passkeys yet.');
    await user.type(screen.getByLabelText('Passkey name'), 'Work laptop');
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This authenticator is already registered');
  });
});
```

Run: `pnpm --filter apps/web exec vitest run test/account-page.test.tsx` before Step 6's edit lands, to see it fail, then again after, to see it pass.

- [ ] **Step 8: Write the failing stack-suite witness (the load-bearing test)**

This is the one test that proves the whole story is real, not merely wired — Task 12's own design, carried over unchanged. Confirm this repo's existing stack-suite conventions first (`find apps/web -iname "*e2e*" -o -iname "*stack*" | grep -v node_modules | grep -v dist`, then read one existing stack-suite spec for its exact `page.route`/CDP-session setup pattern before writing this):

```ts
// apps/web/e2e-stack/passkey-registration.spec.ts (path matches this repo's existing stack-suite directory convention — confirm exact directory name first)
import { test, expect } from '@playwright/test';

test('register a passkey on /account, then sign in with it on /sign-in — no magic link involved', async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });

  // sign in by magic link first (match this repo's existing helper for that)
  // ... existing magic-link sign-in flow helper here ...

  await page.goto('/account');
  await page.getByLabel('Passkey name').fill('Test authenticator');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Test authenticator')).toBeVisible();

  await page.getByRole('button', { name: /sign out/i }).click();
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/workspaces|\/w\//);

  await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});
```

Expected: FAIL initially (no button exists yet).

- [ ] **Step 9: Add the button to `/sign-in`**

```diff
 // apps/web/app/sign-in/page.tsx
   <input type="email" ... autoComplete="username webauthn" ... />
+  <Button
+    onClick={() =>
+      void authClient.signIn.passkey({ autoFill: false }).then(({ error }) => {
+        if (error) setError(error.message ?? 'That passkey was not accepted.');
+      })
+    }
+  >
+    Sign in with a passkey
+  </Button>
```

Delete the now-outdated docblock at lines 190–244 (`"PASSKEY: THE DEAD BUTTON IS GONE..."`) and replace it with a short note that the button is back, along with the design choice: an explicit click, not focus-triggered conditional UI, because a click is unambiguous user intent and costs nothing on an anonymous page load.

- [ ] **Step 10: Update `sign-in.test.tsx`'s test `13.326`**

Replace the "never fires" assertion with "fires only on click":

```tsx
it('13.326 the passkey button exists and fires only on click, never on mount', async () => {
  const user = userEvent.setup();
  render(<SignInPage />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(passkey).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
  expect(passkey).toHaveBeenCalledWith({ autoFill: false });
});
```

- [ ] **Step 11: Write the rate-limit-neutral integration test**

There's no existing template for this exact property at the HTTP-integration level (confirmed during research — `rate-limit.test.ts` is unit-only on the pure limiter functions). Build it directly against the assembled Fastify app, following whatever pattern `apps/server/test/auth/sign-in-flows.test.ts` or `security.test.ts` use for `app.inject()` sequences (read one first):

```ts
// add to apps/server/test/http/rate-limit.test.ts, or a new file matching this repo's naming convention
it('an anonymous /sign-in page load, even after adding the passkey button, spends nothing from the auth bucket', async () => {
  const app = await buildTestApp({ rateLimit: { authMax: 10, windowSec: 60, /* ...other required fields, matching existing usage */ } });
  // The button click itself is a real user action out of scope for THIS assertion —
  // this test is specifically "loading the page and doing nothing" must cost zero.
  // If any client-side code in sign-in/page.tsx now fires on mount, this red-flags it:
  for (let i = 0; i < 15; i++) {
    // whatever this app actually serves on a GET of the sign-in page's own API
    // dependencies at load time — if nothing calls `/api/auth/*` at all on a
    // plain page load (confirmed true after Step 8, since the button only
    // fires onClick), there is nothing to inject here beyond a sanity check
    // that /api/auth/* was never hit — adjust to whatever this repo's actual
    // page-load API surface is once read.
  }
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email: 'u@example.com' } });
  expect(res.statusCode).not.toBe(429);
});
```

(This step's exact shape depends on confirming there is genuinely no server-side call fired by a mere page load — which there isn't, since the passkey request now lives entirely behind an onClick handler. If that's the case, the meaningful assertion collapses to: static analysis / a client-side test proving the button never fires without a click (Step 9 already covers this) plus this one server-side sanity check that the sign-in path alone still isn't over-budget. Don't force an artificial 10-probe loop against an endpoint nothing calls — write what actually needs proving once the real shape is in front of you, and say so in the commit if this step's scope narrowed from what was planned.)

- [ ] **Step 12: Run the stack-suite witness and confirm it passes**

Run whatever command executes this repo's stack suite (check `package.json` for a `test:stack` or `e2e:stack` script).
Expected: PASS.

- [ ] **Step 13: Full suite + typecheck across every touched package**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run
pnpm --filter @gisik-nokma/app-core typecheck
pnpm --filter apps/web exec vitest run
pnpm --filter apps/web typecheck
pnpm --filter apps/server exec vitest run
pnpm --filter apps/server typecheck
pnpm check:help
```
Expected: PASS. `pnpm check:help` confirms `docs/manual.md`/`docs/faq.md` still agree with `content.generated.ts` — expected to pass with NO changes to either doc, since the button restores what they already (accurately) describe.

- [ ] **Step 14: Catalogue and commit**

Add cases to `test-cases/13-deployment-dogfooding.md`: passkey list/add/delete behavior (including the named empty state and verbatim refusal), the accessible-name `aria-label="Delete passkey {name}"` per row, the button's click-only firing, and the rate-limit-neutral property. Extend the `/account` Features.md bullet with a Passkeys sub-clause, and update whatever `Features.md` bullet currently describes `/sign-in`'s methods to note the passkey button is back.

```bash
git add packages/app-core/src/account/passkey-client.ts packages/app-core/src/account/passkeys-section.tsx \
  packages/app-core/test/account/passkeys-section.test.tsx packages/app-core/src/index.ts \
  apps/web/src/account/account-clients.ts apps/web/app/account/page.tsx apps/web/test/account-page.test.tsx \
  apps/web/app/sign-in/page.tsx apps/web/test/sign-in.test.tsx \
  apps/web/e2e-stack apps/server/test/http/rate-limit.test.ts \
  Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Passkeys can be registered on /account, and sign-in via passkey has an entry point again"
```

---

## Self-review notes (writing-plans skill, run against this plan before handoff)

**Spec coverage:** §1 Help → Task 1. §2 architecture → Task 2 (with the app-core/apps-web split refined from the spec's literal wording, noted in each affected task). §3 Profile → Task 3. §4 Appearance → Task 2. §5 Notifications → Tasks 5–6 (storage mechanism deviates from the spec, justified in Task 5 and the Global Constraints). §6 Your workspaces → Task 4. §7 Sessions & Passkeys → Tasks 7–8 (sign-in entry-point mechanism deviates from the spec, justified in Task 8 and the Global Constraints). Testing section's mutation examples are reflected in each task's negative-case tests. No spec section lacks a task.

**Placeholder scan:** every step carries real code or a concrete, actionable verification command (grep/ls against installed packages or migration directories) — the few genuine unknowns (exact better-auth method names/shapes for `updateUser`, `listSessions`/`revokeSession`, `deletePasskey`) are each resolved by a specific, runnable command against the installed package's own type declarations, not by "figure it out later."

**Type consistency:** `WorkspaceRef`, `NotificationKind`, `NotificationPreferences`, `PasskeySummary`, `SessionSummary` are each defined once (Tasks 4/5/8/7 respectively) and referenced by the same name and shape in every later task that touches them. `NotificationsSection`/`SessionsSection`/`PasskeysSection` each take plain data + callback props, never a concrete `authClient`/`dataSource` import — consistent across Tasks 6–8.
