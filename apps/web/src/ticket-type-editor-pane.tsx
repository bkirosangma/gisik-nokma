'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import {
  ReadOnlyBanner,
  TicketTypeEditorScreen,
  canAuthorRole,
  type BuilderSession,
  type WorkflowAuthoringGateway,
} from '@gisik-nokma/app-core';
import { ShellRefusal } from './shell-refusal.js';

/**
 * `TicketTypeEditorPane` / `NewTicketTypePane` — extracted from
 * `app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx` and `.../new/
 * page.tsx` (owner feedback, 2026-09-09: "the ticket type edit is opening in
 * a separate route. it should open directly in the same route, same as the
 * prototype").
 *
 * The prototype's `isTypeEditor` lives INSIDE `isSettingsShell`
 * (`settingsScreens = ["workflows", "types", "typeeditor", "mcptokens"]`) —
 * one screen area whose content pane swaps, never a navigation away from the
 * sidebar. `app/settings/page.tsx` previously kept `onOpen`/`onNew` pushing to
 * the standalone routes below, which is exactly the mismatch reported: editing
 * a type left the settings shell (and its sidebar) behind entirely.
 *
 * These two components are the reusable middle, the same shape
 * `McpTokensScreen` (`src/mcp-tokens-screen.tsx`) already set for this file:
 * extract the screen-with-navigation logic once, so `/settings` can inline it
 * and the standalone routes can keep working as thin wrappers, rather than
 * two implementations of "fetch a type, edit it, go back" drifting apart.
 *
 * `listHref` is a plain string, not a callback — both callers hand it a real
 * URL (`/w/{id}/settings/ticket-types` for the standalone route,
 * `/settings?workspaceId={id}&tab=ticket-types` for the inline pane), so the
 * breadcrumb and Cancel stay real `<Link>`s (keyboard- and screen-reader
 * navigable, not synthetic buttons) in both places, and a save routes back to
 * it with `router.push`.
 */

type TicketTypeRead =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed'; why: string }
  | { kind: 'loaded'; def: TicketTypeDef };

/**
 * One type, opened for editing. There is no `getTicketType(id)` on the
 * gateway and none on the server — the route is `GET .../ticket-types` and it
 * serves the workspace's whole list — so this finds the one it wants in that
 * list, which is also what makes "no ticket type has this id" a fact rather
 * than a guess: the list came back, and the id was not in it.
 *
 * `heading` defaults to `'h1'` — the standalone route's own top heading.
 * `/settings` passes `'h2'`: its own `<h1>Settings</h1>` already owns level
 * 1, matching `TicketTypeListScreen`'s own `<h2>` for the same reason.
 */
export function TicketTypeEditorPane({
  workspaceId,
  session,
  gateway,
  typeId,
  listHref,
  heading = 'h1',
}: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  typeId: string;
  listHref: string;
  heading?: 'h1' | 'h2';
}) {
  const router = useRouter();
  const [read, setRead] = useState<TicketTypeRead>({ kind: 'loading' });
  const Heading = heading;

  useEffect(() => {
    let cancelled = false;
    setRead({ kind: 'loading' });
    gateway.listTicketTypes(workspaceId).then(
      (types) => {
        if (cancelled) return;
        const found = types.find((type) => type.id === typeId);
        setRead(found === undefined ? { kind: 'missing' } : { kind: 'loaded', def: found });
      },
      (cause: unknown) => {
        if (cancelled) return;
        setRead({ kind: 'failed', why: cause instanceof Error ? cause.message : String(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId, typeId]);

  if (read.kind === 'loading') return <p role="status">Loading this ticket type…</p>;
  if (read.kind === 'missing') return <p>No ticket type has this id in this workspace.</p>;
  if (read.kind === 'failed') return <ShellRefusal what="This workspace’s ticket types" message={read.why} />;

  return (
    <>
      <p className="gn-breadcrumb">
        <Link href={listHref}>Ticket types</Link>
      </p>
      <div className="gn-type-editor-header">
        <Heading className="gn-page-title">{read.def.name === '' ? 'Untitled type' : read.def.name}</Heading>
        <Link href={listHref} className="gn-button gn-button--ghost">
          Cancel
        </Link>
      </div>
      <TicketTypeEditorScreen
        workspaceId={workspaceId}
        session={session}
        gateway={gateway}
        initialDef={read.def}
        onSaved={() => router.push(listHref)}
      />
    </>
  );
}

/**
 * A fresh type. The same role gate as the workflow builder's own `new` route:
 * `TicketTypeEditorScreen` DOES take a session and disables every control for
 * a non-author, so a member reaching this pane was never going to save
 * anything — what they would get is a blank form they cannot fill, an
 * authoring entry point offered to somebody who has none. The gate turns that
 * into a sentence instead.
 */
export function NewTicketTypePane({
  workspaceId,
  session,
  gateway,
  listHref,
  heading = 'h1',
}: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  listHref: string;
  heading?: 'h1' | 'h2';
}) {
  const router = useRouter();
  const Heading = heading;

  return (
    <>
      <p className="gn-breadcrumb">
        <Link href={listHref}>Ticket types</Link>
      </p>
      <div className="gn-type-editor-header">
        <Heading className="gn-page-title">New ticket type</Heading>
        <Link href={listHref} className="gn-button gn-button--ghost">
          Cancel
        </Link>
      </div>
      {!canAuthorRole(session.role) ? (
        <>
          <ReadOnlyBanner />
          <p>
            <a href={listHref}>Back to the ticket types</a> — you can read every one of them.
          </p>
        </>
      ) : (
        <TicketTypeEditorScreen
          workspaceId={workspaceId}
          session={session}
          gateway={gateway}
          initialDef={null}
          onSaved={() => router.push(listHref)}
        />
      )}
    </>
  );
}
