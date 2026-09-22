'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AttentionStrip,
  MyWork,
  TicketSheet,
  useAttention,
  useLiveQuery,
  useMyWork,
  type MyWorkView,
} from '@gisik-nokma/app-core';
import { TicketEditorSlot, uploadAttachmentHttp } from '@gisik-nokma/editor';
import { AppNav } from '../../../../src/app-nav.js';
import { ShellRefusal } from '../../../../src/shell-refusal.js';
import { useAppServices, useSessionStatus } from '../../../../src/providers.js';
import { useProjectName } from '../../../../src/use-project-name.js';
import { useWorkspaceName } from '../../../../src/use-workspace-name.js';
import {
  ExpiredSessionNotice,
  useSignInOnExpiredSession,
} from '../../../../src/expired-session.js';

/**
 * OPENING A TICKET FROM MY WORK OPENS THE SHEET **HERE** (owner request,
 * 2026-09-23: *"opening a ticket from my work should open the sheet on the my
 * work page, not redirect to the project page."*)
 *
 * Until this change a click on any of this page's title buttons pushed
 * `/w/:ws/p/:projectId?ticket=…` and the reader arrived on the project page,
 * on a board they had not asked for, with the sheet open over it. The page now
 * mounts its own `TicketSheet` and the click keeps them where they were.
 *
 * ## THE THREE DECISIONS THIS CHANGE HAD TO MAKE
 *
 * **1. The open ticket lives in a `?ticket=` SEARCH PARAM, not in component
 * state** — the same spelling the project page's sheet uses
 * (`p/[projectId]/page.tsx:1292`), and for the reason stated there in its own
 * words: the sheet is a query on the page the reader is already on. A param
 * survives a reload and is shareable as a link; `useState` is neither, and this
 * page is reached by a URL a person may well send to somebody else. The close
 * action is the param's removal, which is exactly what `closeTicket` below
 * does.
 *
 * **2. The sheet's PROJECT-SCOPED props come from the open TICKET, never from
 * the page** — My Work spans projects, so there is no page-level project to
 * read. Two sources place a ticket, and neither is a guess: the rows this page
 * already holds (`assigned` / `inTransit` / `shared` carry a `projectId`, and so
 * does every `AttentionItem` — the strip is mounted here), and, for a ticket the
 * view cannot place, `TicketLocator` — the same one-shot gateway the inbox opens
 * notifications with, asked the same question. **A ticket the server will not
 * place says so** (decision 2 of the task) rather than being redirected
 * somewhere plausible: the sentence below is the one this page already had for
 * that click, kept verbatim, and no sheet is mounted behind it.
 *
 * **3. The redirect survives NOWHERE on this page.** There is no route left here
 * that needs the push: both sections and the attention strip open in place, and
 * the sheet's own `Subtask of {parent}` chip (`onOpenTicket` below) swaps the
 * param, so a parent in ANOTHER project opens in place too — which is a step
 * further than the project page goes, where a cross-project parent necessarily
 * navigates. The push still exists where the sheet is not mounted on the page
 * being read: `app/inbox/page.tsx` locates and pushes, because there is no sheet
 * on the inbox.
 *
 * ## THE PROJECT NAME IS READ, NOT CARRIED — and the located workspace is this one
 *
 * `projectName` comes from `useProjectName(workspaceId, openTicketProjectId)`,
 * the hook the project page's own breadcrumb uses: one shared read, no second
 * derivation. A `null` (pending, refused, or a project this viewer is not on)
 * draws no crumb rather than an id — that hook's contract, unchanged.
 *
 * `createHttpTicketLocator` answers `{ workspaceId, projectId }` where the
 * workspace is **the argument it was asked about** (`src/ticket-location.ts`:
 * it GETs `/v1/workspaces/:ws/tickets/:id` and then `return { workspaceId,
 * projectId }` with that same `workspaceId` bound to the parameter), so a
 * located ticket is in THIS page's workspace by construction and the page's own
 * `workspaceId` is the ticket's. That is why nothing here threads a located
 * workspace through the sheet's props.
 *
 * The Suspense boundary is `useSearchParams()`'s, exactly as on the project
 * page: without it `next build` fails this route rather than warning.
 */
export default function MyWorkPage() {
  return (
    <Suspense fallback={<main className="gn-shell" />}>
      <MyWorkBoard />
    </Suspense>
  );
}

/**
 * What a ticket the locator will not place is told, in the one sentence this
 * page has always used for it.
 *
 * `ticketLocation.locate` answers `null` for BOTH "no such ticket" and "not
 * yours" — the route sends one frozen 404 so it cannot be used as an existence
 * oracle — so the sentence may not guess which of the two it was, and does not.
 */
const NOT_PLACEABLE =
  'That ticket cannot be opened from here — the server will not place it for you, and this page will not guess whether it is gone or simply not yours.';

/**
 * What the locator said about the currently open ticket — **keyed by the ticket
 * it answers for**, which is the whole point of the shape.
 *
 * The page has to ask the server where SOME tickets are, and the answer arrives
 * a render later. Storing it flat would let one ticket's placement describe the
 * next one opened, so the key travels with the answer and every read of it goes
 * through `asked` below, which is `null` unless the answer is about the ticket
 * on screen.
 */
type Placement = {
  ticketId: string;
  projectId: string | null;
  notice: string | null;
};

function MyWorkBoard() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId;
  const { dataSource, cache, ticketLocation } = useAppServices();
  /**
   * `useSessionStatus`, not `useCurrentUser`, because this value reaches a
   * WRITE: `TicketSheet` builds submitted events from `currentUserId`, and
   * `useCurrentUser()` answers `null` both while the session request is in
   * flight and when nobody is signed in. The project page's mount records the
   * same choice and the same remaining window (`p/[projectId]/page.tsx:222`,
   * whose comment also names the empty-actor window inside the sheet itself as
   * known and not fixed); this page inherits both rather than re-arguing them.
   */
  const session = useSessionStatus();
  const currentUserId = session.kind === 'signed-in' ? session.user.id : '';
  const [placement, setPlacement] = useState<Placement | null>(null);
  const attention = useAttention(dataSource, workspaceId);
  const myWork = useMyWork(dataSource, workspaceId);

  // A 401 on EITHER read is a session that ended, not a refusal to answer, and
  // this page used to say the opposite: `Features.md` and case 3.86 both claimed
  // the redirect for the whole shell while only `app/workspaces/page.tsx` did it,
  // so an expired session here drew "My Work cannot be shown yet — HTTP 401 for
  // /v1/me/work". That names the wrong cause and offers no way out of it.
  const expired = useSignInOnExpiredSession([attention.error, myWork.error]);

  /**
   * WHICH SECTIONS THE RESOLVER CAN PLACE WITHOUT ASKING THE SERVER (V5).
   *
   * `MyWorkView` has four members; three of them are `WorkItem[]` and carry a
   * `projectId`, and `contested` is `ContestedClaim[]` and does not. That is not
   * a resolver oversight — it is a fact about the row — so the fourth section is
   * answered by the locator instead, and this pair of declarations is what makes
   * a FIFTH section impossible to add silently: a new key on `MyWorkView` fails
   * the `Record` below to compile, and whoever added it has to say here how a
   * title button for it resolves. The comment that used to sit in this function
   * claimed "all four" were searched while three were.
   */
  const LOCALLY_RESOLVABLE = ['assigned', 'inTransit', 'shared'] as const;
  type NeedsLocator = Exclude<keyof MyWorkView, (typeof LOCALLY_RESOLVABLE)[number]>;
  const NEEDS_THE_LOCATOR: Record<NeedsLocator, 'asked of the server'> = {
    contested: 'asked of the server',
  };

  const openTicketId = searchParams.get('ticket');

  /**
   * THE OPEN TICKET'S PROJECT, OFF THE ROWS THIS PAGE ALREADY HOLDS.
   *
   * Three of the four sections carry it, and so does every `AttentionItem` — the
   * strip is mounted on this page and its rows go through the same `openTicket`
   * — so a click on either kind is placed with no request at all. The attention
   * strip is searched SECOND rather than merged into the list because the two
   * reads are separate questions; a ticket in both is placed identically either
   * way.
   *
   * ⚠ A MISS ANSWERS `null`, never a fallback project: the caller must be able
   * to tell "the view cannot place this" from "the view placed it", because only
   * the first is licence to ask the server, and a project chosen from any other
   * row would be the wrong-project answer one section over.
   */
  const openTicketSection = useMemo(() => {
    if (openTicketId === null) return null;
    const sections = LOCALLY_RESOLVABLE.map((key) => myWork.data?.[key] ?? []);
    const item = sections.flat().find((candidate) => candidate.ticketId === openTicketId);
    if (item !== undefined) return item.projectId;
    const fromAttention = (attention.data ?? []).find(
      (candidate) => candidate.ticketId === openTicketId,
    );
    return fromAttention?.projectId ?? null;
  }, [openTicketId, myWork.data, attention.data]);

  /** The locator's answer, but only when it is about the ticket on screen. */
  const asked = placement !== null && placement.ticketId === openTicketId ? placement : null;
  const openTicketProjectId = openTicketSection ?? asked?.projectId ?? null;
  const openNotice = asked?.notice ?? null;
  const projectName = useProjectName(workspaceId, openTicketProjectId ?? undefined);
  const workspaceName = useWorkspaceName(workspaceId);

  /**
   * THE OPEN TICKET'S FILES — the read behind `TicketSheet`'s `attachments`
   * prop, and the one the project page mounts beside its own sheet
   * (`p/[projectId]/page.tsx:1316`). Its docblock carries the full argument for
   * passing `error` down beside `data` rather than instead of it; the half that
   * is repeated here is the KEY, and it is not a formality.
   *
   * The key carries the ticket id, so opening another ticket refetches rather
   * than showing the previous ticket's files under the new one's heading — and
   * on this page that is reachable by ordinary use: the sheet's parent chip
   * swaps `?ticket=` in place, so a second ticket's sheet is mounted without the
   * first one's ever unmounting the page.
   */
  const openTicketAttachments = useLiveQuery(
    dataSource,
    workspaceId,
    `${openTicketId ?? 'none'}:attachments`,
    async () =>
      openTicketId === null
        ? []
        : dataSource.query.getTicketAttachments(workspaceId, openTicketId),
  );

  /**
   * ASK THE SERVER ONLY WHEN THE PAGE CANNOT ANSWER — and only once per ticket.
   *
   * Both guards are load-bearing. `settled` on BOTH reads is what keeps this
   * from asking about a ticket a read that has not answered yet is about to
   * place: without it a deep link would fire a locate at the same moment the
   * views load, and a ticket those views carry would take a needless round trip
   * — and a refusal from the locator for a ticket this page can see perfectly
   * well. `asked` is the second: a refusal is stored against the ticket, so a
   * re-render cannot turn one click into a stream of requests.
   *
   * The failure arms are the ones this page already had, unchanged in wording.
   * A `null` is the locator's answer for "no such ticket" and "not yours" at
   * once, and a rejection is a different event with its own sentence.
   */
  useEffect(() => {
    if (openTicketId === null || expired) return;
    if (openTicketSection !== null) return;
    if (!myWork.settled || !attention.settled) return;
    if (asked !== null) return;
    let cancelled = false;
    void ticketLocation.locate(workspaceId, openTicketId).then(
      (located) => {
        if (cancelled) return;
        setPlacement(
          located === null
            ? { ticketId: openTicketId, projectId: null, notice: NOT_PLACEABLE }
            : { ticketId: openTicketId, projectId: located.projectId, notice: null },
        );
      },
      (cause: unknown) => {
        if (cancelled) return;
        setPlacement({
          ticketId: openTicketId,
          projectId: null,
          notice: `That ticket could not be opened — ${cause instanceof Error ? cause.message : String(cause)}`,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    asked,
    attention.settled,
    expired,
    myWork.settled,
    openTicketId,
    openTicketSection,
    ticketLocation,
    workspaceId,
  ]);

  /**
   * THE ONE DOOR EVERY TITLE BUTTON ON THIS PAGE GOES THROUGH — the four
   * sections, the attention strip, and the sheet's own parent chip.
   *
   * It sets the param and nothing else: the id is the whole identity of the open
   * sheet, and which project it is in is a question the page answers above, from
   * the rows it holds or from the server. `{ scroll: false }` for the reason the
   * project page records (owner, 2026-09-22: *"the page gets scrolled to the
   * top. it should not scroll"*) — the sheet is a query on the page under the
   * reader, so a navigation that stays on it must not move it.
   */
  const openTicket = (ticketId: string) => {
    router.push(`/w/${workspaceId}/my-work?ticket=${ticketId}`, { scroll: false });
  };

  /**
   * Closing is the same navigation with the param gone, and the scroll rule is
   * the same one: the reader stays on this page.
   *
   * ⚠ The placement is NOT cleared here. It is keyed by ticket id and every
   * read of it is guarded on the id being the OPEN one, so a closed sheet's
   * stale answer can never describe a different ticket; clearing it would only
   * throw away an answer that reopening the same ticket would have to ask for
   * again.
   */
  const closeTicket = () => {
    router.push(`/w/${workspaceId}/my-work`, { scroll: false });
  };

  return (
    <main id="gn-main" className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">My Work</h1>
      <div className="gn-shell__main">
        {/* BOTH reads on this page refuse against the shipped server, and each
            has its own falsehood if the plan's rendering is kept:
            `items={attention.data ?? []}` makes `AttentionStrip` return null,
            which reads as "nothing needs your attention", and My Work's
            `data !== null ? … : <p>Loading…</p>` spins forever. */}
        {expired ? (
          // ONE notice for the page, not one per failed read: two "your session
          // has ended" panels would describe two events where there was one.
          <ExpiredSessionNotice />
        ) : (
          <>
            {/* V5: a click that could not be honoured says so, beside the
                section that raised it, rather than doing nothing. Under the
                sheet-in-place change this is the arm for a ticket the server
                will not place — there is no longer any path where a title
                button navigates and the sentence would be redundant. */}
            {openNotice !== null ? (
              <p role="alert" className="gn-shell__refusal">
                {openNotice}
              </p>
            ) : null}

            {attention.error !== null ? (
              <ShellRefusal what="What needs your attention" message={attention.error} />
            ) : attention.data !== null ? (
              <AttentionStrip items={attention.data} onOpenTicket={openTicket} />
            ) : null}

            {myWork.error !== null ? (
              <ShellRefusal what="My Work" message={myWork.error} />
            ) : myWork.data !== null ? (
              <MyWork view={myWork.data} onOpenTicket={openTicket} />
            ) : (
              <p>Loading…</p>
            )}
          </>
        )}
      </div>

      {/*
        THE SHEET, ON THE PAGE THE CLICK HAPPENED ON.

        Gated on the param, on the ticket having a project, and on the session —
        all three, and the third for the reason the project page's mount states:
        a sheet that would write with an ended session is a refusal the reader
        has to read twice.

        ⚠ `openTicketProjectId` is what holds a ticket BACK rather than sending
        it somewhere: an unplaceable ticket mounts nothing at all and leaves the
        sentence above. There is deliberately no fallback project here — My Work
        spans projects, so any project this page could name would be a guess
        about where the ticket is, which is precisely the wrong-project answer
        this page's resolver exists to avoid.
      */}
      {openTicketId !== null && openTicketProjectId !== null && !expired ? (
        <TicketSheet
          dataSource={dataSource}
          cache={cache}
          workspaceId={workspaceId}
          ticketId={openTicketId}
          currentUserId={currentUserId}
          attachments={openTicketAttachments.data ?? undefined}
          attachmentsUnavailable={openTicketAttachments.error ?? undefined}
          onClose={closeTicket}
          /*
            THE REAL EDITOR, the same component the project page's mount passes
            (`p/[projectId]/page.tsx:3474`), which owns the argument for passing
            it unconditionally: the sheet decides what a mounted editor means,
            and a caller that mounts none gets the read-only fallback.
          */
          editorSlot={TicketEditorSlot}
          workspaceName={workspaceName}
          projectName={projectName}
          workspaceHref={`/w/${workspaceId}`}
          projectHref={`/w/${workspaceId}/p/${openTicketProjectId}`}
          /*
            BOTH CRUMBS LEAVE THIS PAGE. The project crumb goes to the ticket's
            project's board and the workspace crumb to the workspace home, so
            neither is the "navigation that stays where the reader is" the
            `{ scroll: false }` rule is about (owner, 2026-09-22) — arriving at
            the top of a page one has just asked for is what a reader expects.
            The project page's mount passes a mixed rule because ITS project
            crumb pushes the path that page is already on; that case cannot
            arise here. `{ scroll: true }` is written out rather than left to
            the default so the decision is visible beside the rule it follows —
            `router.push(href)` means exactly this.
          */
          onNavigate={(href) => router.push(href, { scroll: true })}
          /*
            THE EVIDENCE UPLOAD AND THE COMMENT UPLOADER — `TicketSheet` has
            accepted both all along, and a mount that omits them makes TWO
            sentences true that are false about this build: the transition
            dialog falls back to *"Evidence upload is not available in this build
            yet"* and refuses every `require-evidence` transition, and
            `TicketEditorSlot.uploadOrRefuse` refuses every drop into the comment
            box with *"this editor was mounted without an uploader"* — which is
            the only way a file can become part of a comment at all. Both bind
            the shipped `POST /v1/attachments` helper to the open ticket; no
            route is added and nothing here speaks HTTP.
          */
          uploadEvidence={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          uploadAttachment={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          /*
            THE PARENT CHIP'S DOOR, and on this page it is the page's own
            `openTicket` — the chip swaps `?ticket=` in place rather than
            leaving. That is the right arm here and not merely the convenient
            one: the resolver above places a parent the view does not carry by
            asking the locator, which is exactly what a parent in another
            project needs, so the reader never has to leave My Work to follow a
            subtask's parent.
          */
          onOpenTicket={openTicket}
          /*
            THE SOFT DELETE'S CORRECTION. The sheet emits `ticket.deleted`,
            closes itself, and calls this on `committed` only, so a refused or
            unanswered delete brings us here never.

            **Both reads are re-asked, and they are re-asked HERE rather than
            left to the stream**, for the reason the project page measured: with
            the socket absent the view still showed a row the deletion had just
            committed, and nothing in the tree covered it.

            ⚠ **No toast and no Undo, and that is a deliberate gap rather than
            an oversight.** The project page's deletion narration is a one-slot
            toast plus a durable-undo strip built on that page's own state
            (`p/[projectId]/page.tsx:540`); duplicating that state machine here
            is the extraction this task explicitly excludes, and an Undo offered
            by a page that does not hold the ticket's project would be a control
            this page cannot honour. So the row leaves the view and nothing is
            promised; making a My Work deletion undoable is owed and named in
            the PR.
          */
          onDeleted={() => {
            myWork.reload();
            attention.reload();
          }}
        />
      ) : null}
    </main>
  );
}
