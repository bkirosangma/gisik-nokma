'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_MY_WORK_PREFERENCES, type AttentionShow, type MyWorkPreferences } from '@gisik-nokma/domain';
import {
  AttentionStrip,
  GroupToggle,
  MyWork,
  SHOW_LABELS,
  ShowFilter,
  TicketSheet,
  groupByWorkspaceProject,
  placeLookup,
  showOptionsFor,
  useGlobalMyWork,
  useLiveQuery,
  type DataSource,
  type MyWorkGrouping,
  type MyWorkView,
  type WorkspaceRef,
} from '@gisik-nokma/app-core';
import { TicketEditorSlot, uploadAttachmentHttp } from '../../src/editor-slot.js';
import { AppNav } from '../../src/app-nav.js';
import { MyWorkPageShell } from '../../src/skeletons/page-shells.js';
import { ShellRefusal } from '../../src/shell-refusal.js';
import { useAppServices, useSessionStatus } from '../../src/providers.js';
import { peopleProps } from '../../src/people-props.js';
import { useActorLabels } from '../../src/use-actor-labels.js';
import { useMyWorkspaces } from '../../src/use-my-workspaces.js';
import { useProjectName } from '../../src/use-project-name.js';
import { useCanModerateComments } from '../../src/use-can-moderate-comments.js';
import { useWorkspaceName } from '../../src/use-workspace-name.js';
import { AttentionBandSkeleton, MyWorkSkeleton } from '../../src/skeletons/screen-skeletons.js';
import { buildProjectPageQueryTickets, ticketRefHrefIn } from '../../src/ticket-ref-callbacks.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../src/expired-session.js';

/**
 * MY WORK, GLOBAL (my-work-global T4, spec D4): one page across every workspace the viewer
 * belongs to, beside `/inbox` and `/notes`. It replaced `/w/[workspaceId]/my-work`, which now
 * only redirects here (keeping a deep link's ticket, case 30.040).
 *
 * ## What it is made of
 *
 * - **The reads are T3's fan-out** (`useGlobalMyWork`): the attention strip and My work asked
 *   per NON-archived workspace and merged, `show` narrowed per workspace to what that workspace
 *   allows. A workspace that fails does not blank the rest; its refusal is drawn beside them.
 * - **"Show" and "Group" are the user's own document** (`getMyWorkPreferences` /
 *   `putMyWorkPreferences`, T2), so they follow the person across devices. Nothing is asked
 *   until BOTH the workspace list and that document have answered: asking with the defaults
 *   first would fan out twice and flash a selection the person did not make (case 30.038). A
 *   document that cannot be read is the defaults, and nothing is written for it (30.039).
 * - **The open ticket is `?ticket=<id>&ws=<workspaceId>`.** The sheet needs a workspace, and on a
 *   page that spans them only the URL can say which. A `ws` the viewer is not in (or none) opens
 *   nothing (30.042). Every opener on the page passes the row's OWN workspace (30.046).
 *
 * Everything the per-workspace page decided about the sheet still holds and is kept as it was
 * (argued in `test-cases/13-owner-requests-and-backlog.md`, "Opening a ticket from My Work opens
 * the sheet THERE"; this is the same code, keyed by `ws`): the sheet opens IN
 * PLACE; its project comes from the rows this page holds, else from `TicketLocator`, and a
 * ticket neither will place says so (`NOT_PLACEABLE`) rather than being guessed into a project;
 * one expired-session notice for the page; a deletion re-asks both reads.
 *
 * The Suspense boundary is `useSearchParams()`'s: without it `next build` fails this route.
 */
export default function GlobalMyWorkPage() {
  return (
    <Suspense fallback={<MyWorkPageShell />}>
      <GlobalMyWorkBoard />
    </Suspense>
  );
}

/**
 * What a ticket the locator will not place is told, in the one sentence My work has always used.
 * `ticketLocation.locate` answers `null` for both "no such ticket" and "not yours" (one frozen
 * 404, so the route is no existence oracle), so the sentence does not guess which.
 */
const NOT_PLACEABLE =
  'That ticket cannot be opened from here. The server will not place it for you, and this page will not guess whether it is gone or simply not yours.';

/** The locator's answer, keyed by the ticket AND workspace it answers for (see the old page's `Placement`). */
type Placement = {
  ticketId: string;
  workspaceId: string;
  projectId: string | null;
  notice: string | null;
};

/** No workspaces: what the fan-out is handed until the list and the preferences have both answered. */
const NOT_YET: readonly WorkspaceRef[] = [];

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * The person's My work document. `settled` is false until the read answers either way; a read
 * that fails leaves the DEFAULTS in place with `readError` set and writes nothing (case 30.039).
 * A change is shown at once and written whole (`show` and `grouping` together, the store's one
 * document); a write that fails keeps the choice on screen for this visit and says it was not
 * saved, rather than pretending it was.
 */
function useMyWorkPreferences(source: DataSource): {
  value: MyWorkPreferences;
  settled: boolean;
  readError: string | null;
  saveError: string | null;
  save: (next: MyWorkPreferences) => void;
} {
  const [read, setRead] = useState<{ value: MyWorkPreferences; settled: boolean; readError: string | null }>({
    value: DEFAULT_MY_WORK_PREFERENCES,
    settled: false,
    readError: null,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    source.query.getMyWorkPreferences().then(
      (value) => {
        if (!cancelled) setRead({ value, settled: true, readError: null });
      },
      (cause: unknown) => {
        if (!cancelled) setRead({ value: DEFAULT_MY_WORK_PREFERENCES, settled: true, readError: messageOf(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source]);
  const save = useCallback(
    (next: MyWorkPreferences) => {
      setRead((held) => ({ ...held, value: next }));
      setSaveError(null);
      source.query.putMyWorkPreferences(next).then(undefined, (cause: unknown) => setSaveError(messageOf(cause)));
    },
    [source],
  );
  return { ...read, saveError, save };
}

const lowerFirst = (label: string): string => label.charAt(0).toLowerCase() + label.slice(1);

/**
 * "created by me and assigned to me": the SELECTED chips' own words (`SHOW_LABELS`), joined with
 * " and ", each lower-cased at its first letter only, so "Workspaces I own or run" keeps its "I"
 * (case 30.044). Built from the selection, never from every chip on offer.
 */
const summaryOf = (show: readonly AttentionShow[]): string => show.map((value) => lowerFirst(SHOW_LABELS[value])).join(' and ');

function GlobalMyWorkBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dataSource, ticketLocation } = useAppServices();
  const workspaces = useMyWorkspaces();
  const preferences = useMyWorkPreferences(dataSource);
  const rows = workspaces.rows;
  const ready = rows !== null && preferences.settled;

  const offered = useMemo(() => (rows === null ? [] : showOptionsFor(rows)), [rows]);
  /**
   * The selection on screen, in the chips' order. A stored value the viewer no longer holds a
   * role for is dropped (it would select nothing), and if nothing is left the defaults stand:
   * at least one chip is always selected (spec D4).
   */
  const show = useMemo<AttentionShow[]>(() => {
    const kept = offered.filter((value) => preferences.value.show.includes(value));
    return kept.length > 0 ? kept : [...DEFAULT_MY_WORK_PREFERENCES.show];
  }, [offered, preferences.value.show]);
  const grouping = preferences.value.grouping;

  const global = useGlobalMyWork(dataSource, ready ? rows : NOT_YET, show);
  const { attention, myWork, workspaceOf } = global;
  const askedIds = useMemo(() => (rows ?? []).filter((workspace) => !workspace.archived).map((workspace) => workspace.id), [rows]);
  // Names the claimant of a contested claim (R3 N4, case 6.256), over every workspace asked.
  const actorLabelOf = useActorLabels(askedIds);
  const nameOf = (workspaceId: string): string => (rows ?? []).find((row) => row.id === workspaceId)?.name ?? workspaceId;

  // A 401 on ANY read is a session that ended — the list, the document, a whole section, or one
  // workspace's share of it — and the page says so once, rather than a refusal per read.
  const expired = useSignInOnExpiredSession([
    workspaces.error,
    preferences.readError,
    attention.error,
    myWork.error,
    ...Object.values(attention.byWorkspace),
    ...Object.values(myWork.byWorkspace),
  ]);

  const grouped = grouping === 'workspace-project';
  const attentionGroups = useMemo(
    () => (grouped && rows !== null && attention.data !== null ? groupByWorkspaceProject(attention.data, rows) : undefined),
    [grouped, rows, attention.data],
  );
  const myWorkGroups = useMemo(
    () =>
      grouped && rows !== null && myWork.data !== null
        ? {
            assigned: groupByWorkspaceProject(myWork.data.assigned, rows),
            inTransit: groupByWorkspaceProject(myWork.data.inTransit, rows),
            shared: groupByWorkspaceProject(myWork.data.shared, rows),
          }
        : undefined,
    [grouped, rows, myWork.data],
  );
  const placeOf = useMemo(() => (!grouped && rows !== null ? placeLookup(rows) : undefined), [grouped, rows]);

  const changeShow = (next: AttentionShow[]): void => preferences.save({ show: next, grouping });
  const changeGrouping = (next: MyWorkGrouping): void => preferences.save({ show, grouping: next });

  // ── The sheet ─────────────────────────────────────────────────────────────────────────
  const openTicketId = searchParams.get('ticket');
  const askedWorkspace = searchParams.get('ws');
  /** The deep link's workspace, only when it is one of the viewer's: `ws` absent or foreign opens nothing (30.042). */
  const sheetWorkspaceId =
    openTicketId !== null && askedWorkspace !== null && (rows ?? []).some((row) => row.id === askedWorkspace)
      ? askedWorkspace
      : null;

  /**
   * The sections the resolver places without asking (V5): three of `MyWorkView`'s four carry a
   * `projectId`; `contested` does not and is the locator's. A fifth key on `MyWorkView` fails
   * this `Record` to compile, so whoever adds it must say here how its title button resolves.
   */
  const LOCALLY_RESOLVABLE = ['assigned', 'inTransit', 'shared'] as const;
  type NeedsLocator = Exclude<keyof MyWorkView, (typeof LOCALLY_RESOLVABLE)[number]>;
  const NEEDS_THE_LOCATOR: Record<NeedsLocator, 'asked of the server'> = {
    contested: 'asked of the server',
  };

  /**
   * The open ticket's project, off the rows this page holds — matched on the ticket AND its
   * workspace, since a global page holds rows from many. A miss is `null`, never a fallback: only
   * "the view cannot place this" licenses asking the server.
   */
  const openTicketSection = useMemo(() => {
    if (openTicketId === null || sheetWorkspaceId === null) return null;
    const mine = (candidate: { ticketId: string; workspaceId: string }): boolean =>
      candidate.ticketId === openTicketId && candidate.workspaceId === sheetWorkspaceId;
    const item = LOCALLY_RESOLVABLE.map((key) => myWork.data?.[key] ?? [])
      .flat()
      .find(mine);
    if (item !== undefined) return item.projectId;
    return (attention.data ?? []).find(mine)?.projectId ?? null;
  }, [openTicketId, sheetWorkspaceId, myWork.data, attention.data]);

  const [placement, setPlacement] = useState<Placement | null>(null);
  const asked =
    placement !== null && placement.ticketId === openTicketId && placement.workspaceId === sheetWorkspaceId ? placement : null;
  const openTicketProjectId = openTicketSection ?? asked?.projectId ?? null;
  const openNotice = asked?.notice ?? null;

  /**
   * Ask the server only when the page cannot answer, and once per ticket: both sections must
   * have SETTLED (a deep link must not race the reads that would place it), and an answer is
   * stored against its ticket and workspace so a re-render cannot turn into a stream of asks.
   */
  useEffect(() => {
    if (openTicketId === null || sheetWorkspaceId === null || expired || !ready) return;
    if (openTicketSection !== null) return;
    if (!myWork.settled || !attention.settled) return;
    if (asked !== null) return;
    let cancelled = false;
    void ticketLocation.locate(sheetWorkspaceId, openTicketId).then(
      (located) => {
        if (cancelled) return;
        setPlacement(
          located === null
            ? { ticketId: openTicketId, workspaceId: sheetWorkspaceId, projectId: null, notice: NOT_PLACEABLE }
            : { ticketId: openTicketId, workspaceId: sheetWorkspaceId, projectId: located.projectId, notice: null },
        );
      },
      (cause: unknown) => {
        if (cancelled) return;
        setPlacement({
          ticketId: openTicketId,
          workspaceId: sheetWorkspaceId,
          projectId: null,
          notice: `That ticket could not be opened: ${messageOf(cause)}`,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [asked, attention.settled, expired, myWork.settled, openTicketId, openTicketSection, ready, sheetWorkspaceId, ticketLocation]);

  /**
   * THE ONE DOOR every title button goes through: both sections, the strip, and the sheet's own
   * parent chip. The workspace is the row's own (`workspaceOf`, every merged row is in it); a
   * ticket the rows do not hold — a parent the sheet's chip opens — is in the open sheet's
   * workspace, since a parent shares its subtask's. `{ scroll: false }`: the sheet is a query on
   * the page under the reader (owner, 2026-09-22).
   */
  const openTicket = (ticketId: string): void => {
    const workspaceId = workspaceOf[ticketId] ?? sheetWorkspaceId;
    if (workspaceId === null) return; // unreachable from a rendered row: every one is in `workspaceOf`
    router.push(`/my-work?ticket=${encodeURIComponent(ticketId)}&ws=${encodeURIComponent(workspaceId)}`, {
      scroll: false,
    });
  };
  const closeTicket = (): void => {
    router.push('/my-work', { scroll: false });
  };

  const attentionFailures = Object.entries(attention.byWorkspace);
  const myWorkFailures = Object.entries(myWork.byWorkspace);

  return (
    <main id="gn-main" className="gn-shell">
      <AppNav />
      <h1 className="gn-page-title">My work</h1>
      <div className="gn-shell__main">
        {expired ? (
          <ExpiredSessionNotice />
        ) : workspaces.error !== null ? (
          <ShellRefusal what="My work" message={workspaces.error} />
        ) : !ready ? (
          <>
            <AttentionBandSkeleton />
            <MyWorkSkeleton />
          </>
        ) : (
          <>
            {openNotice !== null ? (
              <p role="alert" className="gn-shell__refusal">
                {openNotice}
              </p>
            ) : null}

            <div className="gn-my-work-controls">
              <ShowFilter options={offered} value={show} onChange={changeShow} />
              <GroupToggle value={grouping} onChange={changeGrouping} />
            </div>
            {preferences.saveError !== null ? (
              <ShellRefusal what="Your choice for this page" message={preferences.saveError} />
            ) : null}

            {attention.error !== null ? (
              <ShellRefusal what="What needs your attention" message={attention.error} />
            ) : attention.data === null ? (
              <AttentionBandSkeleton />
            ) : attention.data.length > 0 ? (
              <AttentionStrip items={attention.data} groups={attentionGroups} placeOf={placeOf} onOpenTicket={openTicket} />
            ) : attentionFailures.length === 0 ? (
              // Review Focus 3: an empty answer is said in words, under chips that stay live. Only
              // when EVERY asked workspace answered: a failed one is not an all-clear (below).
              <p className="gn-my-work__empty">{`Nothing needs your attention for ${summaryOf(show)}`}</p>
            ) : null}
            {attentionFailures.map(([workspaceId, message]) => (
              <ShellRefusal key={workspaceId} what={`What needs your attention in ${nameOf(workspaceId)}`} message={message} />
            ))}

            {myWork.error !== null ? (
              <ShellRefusal what="My work" message={myWork.error} />
            ) : myWork.data !== null ? (
              <MyWork
                view={myWork.data}
                groups={myWorkGroups}
                placeOf={placeOf}
                onOpenTicket={openTicket}
                actorLabelOf={actorLabelOf}
              />
            ) : (
              <MyWorkSkeleton />
            )}
            {myWorkFailures.map(([workspaceId, message]) => (
              <ShellRefusal key={workspaceId} what={`My work in ${nameOf(workspaceId)}`} message={message} />
            ))}
          </>
        )}
      </div>

      {/* The sheet, on the page the click happened on — gated on the ticket, its placed project,
          a workspace the viewer is in, and the session. No fallback project: a ticket this page
          cannot place mounts nothing and leaves the sentence above. */}
      {openTicketId !== null && sheetWorkspaceId !== null && openTicketProjectId !== null && !expired ? (
        <MyWorkSheet
          workspaceId={sheetWorkspaceId}
          ticketId={openTicketId}
          projectId={openTicketProjectId}
          onClose={closeTicket}
          onOpenTicket={openTicket}
          onDeleted={global.reload}
        />
      ) : null}
    </main>
  );
}

/**
 * The open ticket's sheet. Its reads are keyed by the sheet's OWN workspace, and they live here so
 * that a page with no sheet open asks none of them (the global page has no workspace of its own).
 * The props are the per-workspace page's, unchanged, for the reasons its mount recorded: the real
 * editor, the ticket picker keyed by the open ticket's project, both crumbs leaving the page,
 * the evidence and comment uploaders, the parent chip opening in place, and a deletion re-asking
 * every read (no toast and no Undo here, a known gap carried over, not new).
 */
function MyWorkSheet({
  workspaceId,
  ticketId,
  projectId,
  onClose,
  onOpenTicket,
  onDeleted,
}: {
  workspaceId: string;
  ticketId: string;
  projectId: string;
  onClose: () => void;
  onOpenTicket: (ticketId: string) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { dataSource, cache, people } = useAppServices();
  // `useSessionStatus`, not `useCurrentUser`: this id reaches a WRITE (the sheet's submitted events).
  const session = useSessionStatus();
  const currentUserId = session.kind === 'signed-in' ? session.user.id : '';
  // Owner/admin may delete anyone's comment (MCP-everything T5); the sheet draws Delete from this.
  const canModerateComments = useCanModerateComments(workspaceId);
  const projectName = useProjectName(workspaceId, projectId);
  const workspaceName = useWorkspaceName(workspaceId);
  // Keyed by the ticket, so a second ticket opened in place (the parent chip) never shows the first one's files.
  const attachments = useLiveQuery(dataSource, workspaceId, `${ticketId}:attachments`, async () =>
    dataSource.query.getTicketAttachments(workspaceId, ticketId),
  );
  return (
    <TicketSheet
      {...peopleProps(people, workspaceId)}
      dataSource={dataSource}
      cache={cache}
      workspaceId={workspaceId}
      ticketId={ticketId}
      currentUserId={currentUserId}
      canModerateComments={canModerateComments}
      attachments={attachments.data ?? undefined}
      attachmentsUnavailable={attachments.error ?? undefined}
      onClose={onClose}
      editorSlot={TicketEditorSlot}
      queryTickets={buildProjectPageQueryTickets(dataSource, workspaceId, projectId)}
      resolveTicketHref={ticketRefHrefIn(workspaceId)}
      workspaceName={workspaceName}
      projectName={projectName}
      workspaceHref={`/w/${workspaceId}`}
      projectHref={`/w/${workspaceId}/p/${projectId}`}
      onNavigate={(href) => router.push(href, { scroll: true })}
      uploadEvidence={(file: File) => uploadAttachmentHttp(file, ticketId)}
      uploadAttachment={(file: File) => uploadAttachmentHttp(file, ticketId)}
      onOpenTicket={onOpenTicket}
      onDeleted={onDeleted}
    />
  );
}
