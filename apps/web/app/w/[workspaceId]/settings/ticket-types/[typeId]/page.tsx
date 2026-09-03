'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { TicketTypeEditorScreen } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../../src/app-nav.js';
import { ShellRefusal } from '../../../../../../src/shell-refusal.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../../src/authoring/builder-wiring.js';

/**
 * `/w/[workspaceId]/settings/ticket-types/[typeId]` — one type, opened for
 * editing.
 *
 * There is no `getTicketType(id)` on the gateway and none on the server: the
 * route is `GET .../ticket-types` and it serves the workspace's whole list. So
 * this finds the one it wants in that list, which is also what makes "no ticket
 * type has this id" a fact rather than a guess — the list came back, and the id
 * was not in it.
 *
 * A REJECTED list is a fourth state and gets its own sentence, for the reason
 * the edit-workflow page states: a spinner that never stops says the answer is
 * coming.
 */
export default function EditTicketTypePage() {
  const { workspaceId, typeId } = useParams<{ workspaceId: string; typeId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  const [def, setDef] = useState<
    { kind: 'loading' } | { kind: 'missing' } | { kind: 'failed'; why: string } | { kind: 'loaded'; def: TicketTypeDef }
  >({ kind: 'loading' });
  const gateway = wiring.kind === 'ready' ? wiring.gateway : null;

  useEffect(() => {
    if (gateway === null) return;
    let cancelled = false;
    gateway.listTicketTypes(workspaceId).then(
      (types) => {
        if (cancelled) return;
        const found = types.find((type) => type.id === typeId);
        setDef(found === undefined ? { kind: 'missing' } : { kind: 'loaded', def: found });
      },
      (cause: unknown) => {
        if (cancelled) return;
        setDef({ kind: 'failed', why: cause instanceof Error ? cause.message : String(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId, typeId]);

  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : def.kind === 'loading' ? (
        <p role="status">Loading this ticket type…</p>
      ) : def.kind === 'missing' ? (
        <p>No ticket type has this id in this workspace.</p>
      ) : def.kind === 'failed' ? (
        <ShellRefusal what="This workspace’s ticket types" message={def.why} />
      ) : (
        <TicketTypeEditorScreen
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          initialDef={def.def}
          onSaved={() => router.push(`/w/${workspaceId}/settings/ticket-types`)}
        />
      )}
    </main>
  );
}
