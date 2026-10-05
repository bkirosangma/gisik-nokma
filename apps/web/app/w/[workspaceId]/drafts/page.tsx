'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DraftsList, TicketSheet, useLiveQuery, useMyDrafts } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../src/app-nav.js';
import { ListPageShell } from '../../../../src/skeletons/page-shells.js';
import { ShellRefusal } from '../../../../src/shell-refusal.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../../../src/expired-session.js';
import { TicketEditorSlot, uploadAttachmentHttp } from '../../../../src/editor-slot.js';
import { peopleProps } from '../../../../src/people-props.js';
import { useAppServices, useSessionStatus } from '../../../../src/providers.js';
import { useCanModerateComments } from '../../../../src/use-can-moderate-comments.js';
import { useIsPhone } from '../../../../src/use-is-phone.js';
import { useProjectName } from '../../../../src/use-project-name.js';
import { useWorkspaceName } from '../../../../src/use-workspace-name.js';
import { buildProjectPageQueryTickets, ticketRefHrefIn } from '../../../../src/ticket-ref-callbacks.js';

export default function DraftsPage() {
  return (
    <Suspense fallback={<ListPageShell title="Drafts" rows={5} />}>
      <DraftsScreen />
    </Suspense>
  );
}

/**
 * The viewer's own drafts (drafts plan, Task 8, spec §12.2). The sheet opens HERE, in place, like My work's: the open
 * ticket is `?ticket=`, and its project is read off the draft's own row, never guessed. A `?ticket=` the list does not
 * hold mounts nothing: the locator would answer not-found for someone else's draft, and a draft is nobody's but its
 * author's.
 */
function DraftsScreen() {
  const router = useRouter();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();
  const { dataSource, cache, people } = useAppServices();
  const session = useSessionStatus();
  const currentUserId = session.kind === 'signed-in' ? session.user.id : '';
  const canModerateComments = useCanModerateComments(workspaceId);
  const phone = useIsPhone();
  const drafts = useMyDrafts(dataSource, workspaceId);
  const types = useLiveQuery(dataSource, workspaceId, `${workspaceId}:ticket-types`, () => dataSource.query.getTicketTypes(workspaceId), {
    cacheKey: `types:${workspaceId}`,
  });
  const expired = useSignInOnExpiredSession([drafts.error]);
  const workspaceName = useWorkspaceName(workspaceId);

  const openTicketId = searchParams.get('ticket');
  const openRow = openTicketId === null ? undefined : drafts.data?.find((d) => d.ticketId === openTicketId);
  const projectName = useProjectName(workspaceId, openRow?.projectId);
  const attachments = useLiveQuery(dataSource, workspaceId, `${openTicketId ?? 'none'}:attachments`, async () =>
    openTicketId === null ? [] : dataSource.query.getTicketAttachments(workspaceId, openTicketId),
  );

  // The title of a parent that is not one of these drafts (a published parent), read once per distinct parent.
  const [parentTitles, setParentTitles] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const listed = new Set((drafts.data ?? []).map((d) => d.ticketId));
    const wanted = [
      ...new Set(
        (drafts.data ?? []).flatMap((d) => (d.parentId === null || listed.has(d.parentId) || parentTitles.has(d.parentId) ? [] : [d.parentId])),
      ),
    ];
    for (const id of wanted) {
      void dataSource.query.getTicket(workspaceId, id).then(
        (read) => {
          if (read !== null) setParentTitles((was) => new Map(was).set(id, read.title));
        },
        () => undefined,
      );
    }
  }, [drafts.data, parentTitles, dataSource, workspaceId]);

  const typeName = (typeId: string): string => types.data?.find((t) => t.id === typeId)?.name ?? typeId;
  const openTicket = (ticketId: string) => router.push(`/w/${workspaceId}/drafts?ticket=${ticketId}`, { scroll: false });
  const closeTicket = () => router.push(`/w/${workspaceId}/drafts`, { scroll: false });

  return (
    <main id="gn-main" className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">Drafts</h1>
      <div className="gn-shell__main">
        {expired ? (
          <ExpiredSessionNotice />
        ) : drafts.error !== null ? (
          <ShellRefusal what="Drafts" message={drafts.error} />
        ) : drafts.data === null ? (
          <ListPageShell title="Drafts" rows={5} />
        ) : (
          <DraftsList
            drafts={drafts.data}
            dataSource={dataSource}
            workspaceId={workspaceId}
            currentUserId={currentUserId}
            typeName={typeName}
            parentTitleOf={(id) => parentTitles.get(id) ?? null}
            phone={phone}
            onOpenTicket={openTicket}
            onChanged={drafts.reload}
          />
        )}
      </div>
      {/* Every prop is one `my-work/page.tsx` passes to the same sheet, except `onDeleted`: Delete is disabled on a draft. */}
      {openTicketId !== null && openRow !== undefined && !expired ? (
        <TicketSheet
          {...peopleProps(people, workspaceId)}
          dataSource={dataSource}
          cache={cache}
          workspaceId={workspaceId}
          ticketId={openTicketId}
          currentUserId={currentUserId}
          canModerateComments={canModerateComments}
          attachments={attachments.data ?? undefined}
          attachmentsUnavailable={attachments.error ?? undefined}
          onClose={closeTicket}
          editorSlot={TicketEditorSlot}
          queryTickets={buildProjectPageQueryTickets(dataSource, workspaceId, openRow.projectId)}
          resolveTicketHref={ticketRefHrefIn(workspaceId)}
          workspaceName={workspaceName}
          projectName={projectName}
          workspaceHref={`/w/${workspaceId}`}
          projectHref={`/w/${workspaceId}/p/${openRow.projectId}`}
          onNavigate={(href) => router.push(href, { scroll: true })}
          uploadEvidence={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          uploadAttachment={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          onOpenTicket={openTicket}
          onDraftChanged={drafts.reload}
        />
      ) : null}
    </main>
  );
}
