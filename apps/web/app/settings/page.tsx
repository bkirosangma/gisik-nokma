'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TicketTypeListScreen, WorkflowListScreen } from '@gisik-nokma/app-core';
import { AppNav } from '../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../src/authoring/builder-wiring.js';
import { McpTokensScreen } from '../../src/mcp-tokens-screen.js';
import { NewTicketTypePane, TicketTypeEditorPane } from '../../src/ticket-type-editor-pane.js';
import { useWorkspaceName } from '../../src/use-workspace-name.js';

type SettingsTab = 'ticket-types' | 'workflows' | 'mcp-tokens';

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === 'ticket-types' || value === 'workflows' || value === 'mcp-tokens';
}

function tabHref(workspaceId: string | null, tab: SettingsTab): string {
  const params = new URLSearchParams();
  if (workspaceId !== null) params.set('workspaceId', workspaceId);
  params.set('tab', tab);
  return `/settings?${params.toString()}`;
}

/**
 * The ticket-types tab's own list-vs-editor href — never `tabHref` with a
 * third param bolted on, because `tabHref` is also what the SIDEBAR links are
 * built from: if it carried `typeId` forward, switching to Workflows and back
 * would resurrect whatever type was last open. `typeId` is read below ONLY
 * inside the `tab === 'ticket-types'` branch, for the same reason.
 */
function typeEditHref(workspaceId: string, typeId: string): string {
  const params = new URLSearchParams();
  params.set('workspaceId', workspaceId);
  params.set('tab', 'ticket-types');
  params.set('typeId', typeId);
  return `/settings?${params.toString()}`;
}

/**
 * `/settings` — the GLOBAL settings door (Round 19c, owner feedback: "move
 * members into settings and settings should always be visible on the nav
 * bar"), the sidebar shell it was missing (Round 19d, owner: "workflows
 * and mcp tokens should not be opening up a separate route. it should live
 * inside settings. check the settings page inside the attached prototype"),
 * and the ticket-type EDITOR, inlined the same way one round later (owner:
 * "the ticket type edit is opening in a separate route. it should open
 * directly in the same route, same as the prototype").
 *
 * ## The prototype IS the spec here, not a reference for content alone
 *
 * The owner's `.dc.html` prototype models Settings as ONE screen area
 * (`isSettingsShell`, gated on `s.screen` being one of `["workflows",
 * "types", "typeeditor", "mcptokens"]`) with a persistent sidebar
 * (`settingsNav`: Ticket types / Workflows / MCP tokens) and a content pane
 * that SWAPS by an `sc-if` on which of those is active — never a navigation
 * away from the shell. Round 19c's first draft of this page got the shell's
 * SHAPE right (sidebar, workspace-name subtitle, Ticket types inline) but
 * still sent Workflows to `/w/<id>/settings/workflows`, MCP tokens to
 * `/mcp/tokens`, and (once ticket types themselves were inlined) the ticket-
 * type EDITOR to `/w/<id>/settings/ticket-types/[typeId]` — real, separate
 * routes each time, exactly what the owner kept pointing at as wrong. This
 * round inlines all four sub-screens the prototype's `isSettingsShell` names.
 *
 * ## `tab`, not four files, and nothing reimplemented to get there
 *
 * `TicketTypeListScreen` and `WorkflowListScreen` (`@gisik-nokma/app-core`)
 * are the SAME components `/w/[workspaceId]/settings/ticket-types/page.tsx`
 * and `.../workflows/page.tsx` already wire up with `useBuilderWiring` — this
 * page is a second thin caller of each, sourcing `workspaceId` from the query
 * string instead of a route param, exactly as Round 19c already did for
 * Ticket types alone. MCP tokens and the ticket-type editor had no reusable
 * component to call — their whole implementation lived inside
 * `app/mcp/tokens/page.tsx` and `.../ticket-types/[typeId]|new/page.tsx`
 * respectively — so those were extracted into `src/mcp-tokens-screen.tsx`
 * (`McpTokensScreen`) and `src/ticket-type-editor-pane.tsx`
 * (`TicketTypeEditorPane`, `NewTicketTypePane`) first; the standalone routes
 * still render them, now via thin wrappers, so nothing that already linked
 * there breaks.
 *
 * ## What stays a separate route on purpose
 *
 * The workflow BUILDER (`.../workflows/[workflowId]`, `.../new`) is NOT
 * inlined here — `WorkspaceWorkflows`'s `onOpen`/`onNew` still push to those
 * real pages, unchanged. The prototype itself draws this line: its ticket-
 * type editor (`isTypeEditor`) is inside `settingsScreens`, its workflow
 * builder (`isBuilder`) is not — the builder is a full-width two-column
 * canvas that a 248px sidebar would only crowd, and it carries its own
 * breadcrumb back ("Settings › Workflows") instead. Matching that asymmetry —
 * inlining the type editor but not the builder — is exactly what the
 * prototype's own screen list draws, not a line this page invented.
 *
 * ## The editor tab's own href, and why the sidebar must not carry it
 *
 * `typeEditHref` (below `tabHref`) is what `onOpen`/`onNew` push to, and what
 * a save or Cancel inside the pane routes back to (`listHref`, passed to
 * `TicketTypeEditorPane`/`NewTicketTypePane`). It is a THIRD query param,
 * `typeId`, layered on top of `tab=ticket-types` — deliberately not folded
 * into `tabHref`, whose three callers are the sidebar's own links. If
 * `tabHref` carried `typeId` forward, opening a type and then clicking
 * Workflows and back would resurrect the editor instead of showing the list.
 * `SettingsContent` reads `typeId` from the query ONLY when `tab ===
 * 'ticket-types'`, for the same reason in the other direction.
 *
 * ## `tab`, like `workspaceId`, is a query param — not three files
 *
 * `/settings?workspaceId=<id>&tab=workflows` is still `/settings`, the one
 * route the nav's Settings link is unconditional about; switching tabs is a
 * same-page navigation (`usePathname()` unaffected), not a route change.
 *
 * ## With no workspace in the query
 *
 * Ticket types and Workflows have no target — this shell remembers no
 * "current workspace" outside a route or query param, and none is present.
 * MCP tokens still does, being global, so it stays a real link and a working
 * tab either way; the other two render as plain text with one line saying a
 * workspace has to be picked first, and a link to `/workspaces`.
 *
 * `useSearchParams()` opts a client page out of static prerendering, and Next
 * 15 makes that a BUILD ERROR rather than a warning unless it is wrapped in a
 * `Suspense` boundary — `app/sign-in/page.tsx` carries the same split for the
 * same reason: the default export is the boundary, `SettingsContent` is the
 * child that reads the query.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<main className="gn-shell" />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const rawTab = searchParams.get('tab');
  const tab: SettingsTab = isSettingsTab(rawTab) ? rawTab : 'ticket-types';
  // Read only on the tab it belongs to — see `typeEditHref`'s own docblock on
  // why the sidebar links must never carry this forward.
  const typeId = tab === 'ticket-types' ? searchParams.get('typeId') : null;
  const workspaceName = useWorkspaceName(workspaceId ?? undefined);

  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId ?? undefined} />
      <h1 className="gn-page-title">Settings</h1>
      {workspaceName !== null ? <p className="gn-workspace-list__role">{workspaceName}</p> : null}
      <div className="gn-settings">
        <nav className="gn-settings__sidebar" aria-label="Settings sections">
          {workspaceId !== null ? (
            <Link
              href={tabHref(workspaceId, 'ticket-types')}
              aria-current={tab === 'ticket-types' ? 'page' : undefined}
            >
              Ticket types
            </Link>
          ) : (
            <span className="gn-settings__sidebar-item--disabled">Ticket types</span>
          )}
          {workspaceId !== null ? (
            <Link
              href={tabHref(workspaceId, 'workflows')}
              aria-current={tab === 'workflows' ? 'page' : undefined}
            >
              Workflows
            </Link>
          ) : (
            <span className="gn-settings__sidebar-item--disabled">Workflows</span>
          )}
          <Link
            href={tabHref(workspaceId, 'mcp-tokens')}
            aria-current={tab === 'mcp-tokens' ? 'page' : undefined}
          >
            MCP tokens
          </Link>
        </nav>
        <div className="gn-settings__content">
          {tab === 'mcp-tokens' ? (
            <McpTokensScreen heading="h2" />
          ) : workspaceId === null ? (
            <p>
              Pick a workspace to see its ticket types and workflows —{' '}
              <Link href="/workspaces">open one</Link>.
            </p>
          ) : tab === 'workflows' ? (
            <WorkspaceWorkflows workspaceId={workspaceId} />
          ) : (
            <WorkspaceTicketTypes workspaceId={workspaceId} typeId={typeId} />
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Mounted ONLY when `workspaceId !== null` AND `tab === 'ticket-types'` (see
 * the parent's ternary): `useBuilderWiring` has exactly one caller shape
 * everywhere else in this product — a route param off a matched
 * `/w/[workspaceId]/...` segment, always a real id — and firing it with an
 * empty string here (the one thing calling it unconditionally with `?? ''`
 * would do on a bare `/settings` visit) would send `listMembers('')` for
 * every signed-in person who has not picked a workspace yet. Conditional
 * MOUNTING keeps the Rules of Hooks intact while making that request
 * unreachable rather than merely rare.
 */
function WorkspaceTicketTypes({ workspaceId, typeId }: { workspaceId: string; typeId: string | null }) {
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  const listHref = tabHref(workspaceId, 'ticket-types');

  if (wiring.kind !== 'ready') return <WiringNotReady wiring={wiring} />;
  if (typeId === 'new') {
    return (
      <NewTicketTypePane
        workspaceId={workspaceId}
        session={wiring.session}
        gateway={wiring.gateway}
        listHref={listHref}
        heading="h2"
      />
    );
  }
  if (typeId !== null) {
    return (
      <TicketTypeEditorPane
        workspaceId={workspaceId}
        session={wiring.session}
        gateway={wiring.gateway}
        typeId={typeId}
        listHref={listHref}
        heading="h2"
      />
    );
  }
  return (
    <TicketTypeListScreen
      workspaceId={workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      onOpen={(openedId) => router.push(typeEditHref(workspaceId, openedId))}
      onNew={() => router.push(typeEditHref(workspaceId, 'new'))}
    />
  );
}

/** Same shape and same reason as `WorkspaceTicketTypes`, one tab over. */
function WorkspaceWorkflows({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  const base = `/w/${workspaceId}/settings/workflows`;

  if (wiring.kind !== 'ready') return <WiringNotReady wiring={wiring} />;
  return (
    <WorkflowListScreen
      workspaceId={workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      onOpen={(workflowId) => router.push(`${base}/${workflowId}`)}
      onNew={() => router.push(`${base}/new`)}
    />
  );
}
