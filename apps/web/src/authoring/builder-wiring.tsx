'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { WorkspaceRole } from '@gisik-nokma/domain';
import type { BuilderSession, WorkflowAuthoringGateway } from '@gisik-nokma/app-core';
import { useAppServices, useSessionStatus } from '../providers.js';
import { ShellRefusal } from '../shell-refusal.js';
import { AuthoringReadRefused } from './data-source-gateway.js';

/**
 * # Everything the six authoring routes need, and the four answers they can get
 *
 * ## Why this is not `{ gateway, session } | null`
 *
 * The plan's own snippet returns `null` "while the session loads" and every page
 * renders `null` for it. That collapses four different situations into one blank
 * screen, and two of them are not "wait a moment":
 *
 * - the session request is in flight — a spinner is honest;
 * - nobody is signed in — a blank page is a page that never says so;
 * - the caller's role could not be read — a blank page, or worse a default role,
 *   is **absence rendered as fact** on the surface whose entire subject is who
 *   may change what;
 * - everything resolved.
 *
 * So this hook answers a discriminated union, the shape `members/page.tsx`
 * already uses for its own role gate, and each page renders the arm rather than
 * guessing.
 *
 * ## Where the ROLE comes from, and why it is the roster
 *
 * `BuilderSession` needs a `WorkspaceRole`, and this branch has exactly one
 * readable source of the signed-in user's own role. `GET /v1/me/workspaces`
 * carries a `role` but `getMyWorkspaces` REFUSES whole — `mapWorkspaceRefs`
 * throws a `ServingGapError` (`online/mappers.ts:906`) — so no client here can
 * read it, and adding a role-only mapper over the same route would be routing
 * around a refusal this step may not weaken. `members/page.tsx` hit the same
 * wall and derived its admin-ness from a door's 403.
 *
 * What IS readable is `GET /v1/workspaces/:workspaceId/members`, which answers
 * `WorkspaceMember[]` — `{userId, displayName, role}` — for every non-guest
 * member including the caller (`readMembers`, `builder-reads.ts:244`, selects
 * every workspace-scope membership; the guest filter is a bound parameter and
 * the caller is not a guest, because the door refuses guests outright). So the
 * caller's own row IS in that list, and its `role` is the server's answer rather
 * than this shell's inference.
 *
 * Three outcomes, and the third is the one worth being careful about:
 *
 * 1. **200 and the caller's row is there** → that role. Owner, admin or member.
 * 2. **404** → the no-guests door turned this caller away (executor ruling
 *    2026-09-02), or they are not a member. Either way `'guest'`, the floor of
 *    the union: `canAuthorRole('guest')` is false, so the builder mounts
 *    read-only, which is exactly what a guest should see. The screens are built
 *    for it — `WorkflowBuilderScreen` catches a refused roster by name.
 * 3. **Anything else** — a 500, a dropped connection, an unparseable body →
 *    `refused`. NOT `'guest'`. A failed read is not a role, and defaulting to
 *    one would show an owner a banner saying they may not change the thing they
 *    own, or (worse, if the default went the other way) offer authoring to
 *    someone whose authorization was never established.
 *
 * A 200 that somehow does not contain the caller's row also yields `'guest'`,
 * and deliberately not `'member'`: the roster is the authority on membership, and
 * inventing a role for somebody it does not list would be a claim about
 * membership that nothing made.
 *
 * ## The cost, stated
 *
 * This reads the roster, and then `WorkflowBuilderScreen` reads it again for its
 * own rule summaries — two requests for one list. A cache in this hook would
 * have to decide when to invalidate, and a role read from a stale cache is the
 * failure this whole docblock is about. The round trip is accepted instead; if
 * it ever matters, the fix belongs in the transport, not here.
 */
export type BuilderWiring =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'refused'; why: string }
  | { kind: 'ready'; gateway: WorkflowAuthoringGateway; session: BuilderSession };

/** The floor of `WorkspaceRole` — no authoring, and no roster assumed available. */
const LEAST_PRIVILEGE: WorkspaceRole = 'guest';

export function useBuilderWiring(workspaceId: string): BuilderWiring {
  const { authoring } = useAppServices();
  const status = useSessionStatus();
  const userId = status.kind === 'signed-in' ? status.user.id : null;
  const [role, setRole] = useState<
    { kind: 'asking' } | { kind: 'known'; role: WorkspaceRole } | { kind: 'refused'; why: string }
  >({ kind: 'asking' });

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    setRole({ kind: 'asking' });
    authoring.listMembers(workspaceId).then(
      (members) => {
        if (cancelled) return;
        const own = members.find((member) => member.userId === userId);
        setRole({ kind: 'known', role: own?.role ?? LEAST_PRIVILEGE });
      },
      (cause: unknown) => {
        if (cancelled) return;
        // The one failure that IS an answer: the door refused to serve the
        // roster, which is what it does to a guest and to a non-member.
        if (cause instanceof AuthoringReadRefused) {
          setRole({ kind: 'known', role: LEAST_PRIVILEGE });
          return;
        }
        setRole({ kind: 'refused', why: cause instanceof Error ? cause.message : String(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [authoring, workspaceId, userId]);

  if (status.kind === 'loading') return { kind: 'loading' };
  if (status.kind === 'signed-out') return { kind: 'signed-out' };
  if (role.kind === 'asking') return { kind: 'loading' };
  if (role.kind === 'refused') return { kind: 'refused', why: role.why };
  return {
    kind: 'ready',
    gateway: authoring,
    session: { userId: status.user.id, role: role.role },
  };
}

/**
 * The three arms that are not `ready`, rendered once so six pages do not each
 * spell them differently — and so none of them can quietly render `null` for a
 * refusal.
 *
 * `ShellRefusal` is the same component the rest of this shell shows for a read
 * that would not answer, carrying the cause's own words without paraphrase.
 */
export function WiringNotReady({
  wiring,
}: {
  wiring: Exclude<BuilderWiring, { kind: 'ready' }>;
}) {
  const pathname = usePathname();
  if (wiring.kind === 'loading') {
    return <p role="status">Checking what you may change in this workspace…</p>;
  }
  if (wiring.kind === 'signed-out') {
    return (
      <p>
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in to open settings</Link>{' '}
        — you land back here.
      </p>
    );
  }
  return <ShellRefusal what="Your role in this workspace" message={wiring.why} />;
}
