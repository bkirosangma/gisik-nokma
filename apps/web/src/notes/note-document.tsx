'use client';

import { useEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TicketEditorSlot,
  exportMarkdown,
  ReadingProgress,
  extractReadingMeta,
  readingTimeMinutes,
  uploadAttachmentHttp,
  type ReadingMeta,
  type TicketEditorSlotProps,
} from '@gisik-nokma/editor';
import { Button } from '@gisik-nokma/ui';
import {
  DeleteDialog,
  TicketSheet,
  classifyBatch,
  makeSubmittedFactory,
  restoreSeeds,
  restoreUnreachableLine,
  unansweredLine,
  useLiveQuery,
  writeFailureCopy,
  type DataSource,
  type RosterMember,
  type WorkspaceRef,
} from '@gisik-nokma/app-core';
import { docToPlainText, type NoteDetail, type NoteSummary } from '@gisik-nokma/domain';
import { useAppServices, useCurrentUser, useSessionStatus } from '../providers.js';
import { buildProjectPageQueryTickets, buildWorkspaceQueryTickets, ticketRefHrefIn } from '../ticket-ref-callbacks.js';
import { DraftRestoreBanner } from './draft-restore-banner.js';
import { HistoryPanel } from './history-panel.js';
import { NoteByline } from './note-byline.js';
import { NoteComments } from './note-comments.js';
import { NoteTitle } from './note-title.js';
import { useNoteAutosave } from './use-note-autosave.js';

/**
 * What a ticket the locator will not place is told — the same frozen
 * sentence `app/w/[workspaceId]/my-work/page.tsx` uses for its own
 * unplaceable tickets, and for the same reason: a 404 that could mean "gone"
 * or "not yours" must not guess which of the two it was.
 */
const NOT_PLACEABLE =
  'That ticket cannot be opened from here — the server will not place it for you, and this page will not guess whether it is gone or simply not yours.';

/**
 * What the locator said about the currently open ticket — keyed by the
 * ticket it answers for, exactly as `MyWorkBoard`'s own `Placement` is: the
 * page asks the server about SOME ticket and the answer arrives a render
 * later, so the key travels with the answer and every read of it goes
 * through `asked` below, which is `null` unless the answer is about the
 * ticket on screen.
 */
type Placement = { ticketId: string; projectId: string | null; notice: string | null };

/**
 * The note itself (notes series Plan 5, spec §9.2, §9.6).
 *
 * ## Finding the workspace, and why this iterates
 *
 * The route is `/notes/<id>` and the URL does not carry a workspace, but every
 * note read takes one. Read rather than assumed: `online-data-source.ts:387`'s
 * `getNote` names its first parameter `_workspaceId` and ignores it — the route
 * it calls is `GET /v1/notes/<noteId>`, which learns the workspace from the
 * note's own row — while the REPLICA implementation filters by workspace, so
 * the parameter is load-bearing offline. **So: try each workspace until one
 * answers non-null.** Online that is one read; offline it is at most one per
 * workspace, and the alternative (guessing `workspaces[0]`) would answer `null`
 * for a note in the second workspace and draw "no longer shared" for a note that
 * is right there.
 *
 * ## `canEdit` is the client's copy of §4.2, and the server is the door
 *
 * `isAuthor || isAdminReader || isOwner` (spec §9.6). It decides paint, not
 * permission: every write below goes through `dataSource.ingest` and
 * `checkNotePermission` refuses at the door regardless. A client that computed
 * this wrongly loses a control, not a boundary.
 *
 * ## The ticket sheet opens HERE, not on the project page (owner request, 2026-09-24)
 *
 * A ticket badge's plain click no longer navigates — it opens that ticket's
 * `TicketSheet` in place, over this page, through the SAME `?ticket=` shape
 * `app/w/[workspaceId]/my-work/page.tsx` already ships (its own docblock
 * argues the three decisions this shape makes; this file inherits all three
 * rather than re-arguing them). The open ticket's PROJECT comes from
 * `note.attachedTickets` when the ticket is one of this note's own — no
 * request — and from `TicketLocator` otherwise (a reload on a stale
 * `?ticket=` after a detach, or the sheet's own parent chip naming a ticket
 * this note is not attached to), exactly the fallback My Work's resolver
 * uses for its `contested` section. A ticket the locator will not place
 * draws the same frozen sentence My Work draws, for the same reason: a 404
 * that could mean "gone" or "not yours" must not guess which.
 */
function NoteDocumentBody({
  noteId,
  workspaces,
  editorRootRef,
  onHeadingsChange,
  onLostAccess,
}: {
  noteId: string;
  workspaces: WorkspaceRef[];
  /** Task 9: `NotesPage`'s TOC column needs the SAME scroll container `ReadingTOC` observes — supplied here rather than exposed via `forwardRef`, since nothing else needs imperative access to it. */
  editorRootRef?: RefObject<HTMLDivElement | null>;
  onHeadingsChange?: (headings: ReadingMeta['headings']) => void;
  /**
   * Spec §9.7: an open note whose live query answers `null` AFTER having
   * already answered non-null — not a note that was never readable, which
   * the existing inline "no longer shared" state below already covers.
   */
  onLostAccess?: () => void;
}) {
  const { dataSource, cache, ticketLocation } = useAppServices();
  const user = useCurrentUser();
  /**
   * `useSessionStatus`, not `useCurrentUser`, for the reason
   * `app/w/[workspaceId]/my-work/page.tsx`'s own mount states: this value
   * reaches a WRITE — `TicketSheet` builds submitted events from
   * `currentUserId`, and `useCurrentUser()` answers `null` both while the
   * session request is in flight and when nobody is signed in.
   */
  const session = useSessionStatus();
  const currentUserId = session.kind === 'signed-in' ? session.user.id : '';
  const router = useRouter();
  const searchParams = useSearchParams();

  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const workspaceKey = workspaces.map((workspace) => workspace.id).join(',');
  // The IDS, held in a ref, are what the effect walks — NOT the `workspaces`
  // prop itself. A caller that passes a fresh array of the same workspaces on
  // every render (the page does, and so does every test) would otherwise restart
  // this read on every paint, resetting `searched` to false each time and
  // leaving the document stuck on "Loading…" forever. `workspaceKey` is the
  // dependency because it is the VALUE the read depends on, and a ref is how the
  // effect reads that value without listing the array.
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  useEffect(() => {
    let cancelled = false;
    setSearched(false);
    void (async () => {
      for (const workspace of workspacesRef.current) {
        const found = await dataSource.query.getNote(workspace.id, noteId);
        if (cancelled) return;
        if (found !== null) {
          setResolvedWorkspaceId(workspace.id);
          setSearched(true);
          return;
        }
      }
      if (cancelled) return;
      setResolvedWorkspaceId(null);
      setSearched(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataSource, noteId, workspaceKey]);

  const live = useLiveQuery(
    dataSource,
    resolvedWorkspaceId ?? workspaces[0]?.id ?? '',
    // THE KEY CARRIES THE RESOLVED WORKSPACE, and it is not decoration.
    // `useLiveQuery` reloads on a KEY change and on stream frames, not on a
    // changed closure — so a key of `note:<id>` alone would run `load` once,
    // while the workspace was still unresolved, get `null`, and never ask
    // again: the document would sit on "no longer shared" for a note it had
    // just found. Measured, not reasoned about.
    `note:${resolvedWorkspaceId ?? ''}:${noteId}`,
    () =>
      resolvedWorkspaceId === null
        ? Promise.resolve<NoteDetail | null>(null)
        : dataSource.query.getNote(resolvedWorkspaceId, noteId),
  );

  const note = live.data;
  const workspace = workspaces.find((candidate) => candidate.id === note?.workspaceId) ?? null;

  const openTicketId = searchParams.get('ticket');
  const [placement, setPlacement] = useState<Placement | null>(null);

  /**
   * THE OPEN TICKET'S PROJECT, off this note's own attached tickets — no
   * request, since `note.attachedTickets` already carries `projectId`
   * (Plan 6 of 7, spec §10 Task 3; see `NoteByline`'s own docblock). A MISS
   * answers `null`, never a fallback project: only the locator below is
   * licence to ask the server, and a project read off a different ticket
   * would be the wrong-project answer one row over.
   */
  const attachedTicketProjectId =
    note?.attachedTickets.find((ticket) => ticket.ticketId === openTicketId)?.projectId ?? null;
  /** The locator's answer, but only when it is about the ticket on screen. */
  const asked = placement !== null && placement.ticketId === openTicketId ? placement : null;
  const openTicketProjectId = attachedTicketProjectId ?? asked?.projectId ?? null;
  const openNotice = asked?.notice ?? null;

  /**
   * ASK THE SERVER ONLY WHEN THIS NOTE CANNOT ANSWER — and only once per
   * ticket. `asked` is what stops a re-render turning one click into a
   * stream of requests; a ticket this note attaches needs no request at all
   * (`attachedTicketProjectId`), so the locator is asked only for a ticket
   * this note does not carry — a stale `?ticket=` after a detach, or the
   * mounted sheet's own parent chip naming a ticket outside this note.
   */
  useEffect(() => {
    if (openTicketId === null || note === null) return;
    if (attachedTicketProjectId !== null) return;
    if (asked !== null) return;
    const workspaceId = note.workspaceId;
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
  }, [asked, attachedTicketProjectId, note, openTicketId, ticketLocation]);

  /**
   * THE OPEN TICKET'S FILES — the read behind `TicketSheet`'s `attachments`
   * prop, keyed on the ticket id so swapping to a second ticket refetches
   * rather than showing the first one's files under the new heading (the
   * same key My Work's own mount uses, for the same reason).
   */
  const openTicketAttachments = useLiveQuery(
    dataSource,
    resolvedWorkspaceId ?? workspaces[0]?.id ?? '',
    `${openTicketId ?? 'none'}:attachments`,
    async () =>
      openTicketId === null || note === null
        ? []
        : dataSource.query.getTicketAttachments(note.workspaceId, openTicketId),
  );

  /**
   * THE ONE DOOR EVERY BADGE AND THE MOUNTED SHEET'S OWN PARENT CHIP GO
   * THROUGH. It sets the param and nothing else — which project the ticket
   * is in is answered above. `{ scroll: false }` for the reason the project
   * page and My Work both record: the sheet is a query on the page under the
   * reader, so a navigation that stays on it must not move it.
   */
  const openTicket = (ticketId: string) => {
    router.push(`/notes/${noteId}?ticket=${ticketId}`, { scroll: false });
  };

  /**
   * Every badge's own DOM node, by ticket id — `NoteByline`'s `onBadgeRef`
   * populates it. This is what makes "focus returns to the badge on close"
   * (owner request, 2026-09-24) a fact this page controls, rather than a bet
   * on a third-party `FocusScope`'s own restore surviving the SHEET's full
   * unmount (this page's own conditional render, not an internal open flag
   * `Sheet` keeps toggled) — measured to not reach the badge reliably.
   */
  const badgeRefs = useRef(new Map<string, HTMLSpanElement>());

  /** Closing is the same navigation with the param gone. */
  const closeTicket = () => {
    router.push(`/notes/${noteId}`, { scroll: false });
  };

  /**
   * THE REFOCUS ITSELF — deliberately NOT inline in `closeTicket` above.
   * `Sheet`'s `FocusScope` uses `contain`, which redirects any focus attempt
   * OUTSIDE the scope back into it for as long as the scope is still
   * mounted — measured: an inline `.focus()` called from the Close button's
   * own click handler loses to it every time, because the sheet has not
   * unmounted yet at that point (`router.push` is async in the real app, and
   * this page's own render has not dropped `openTicketId` yet either). This
   * effect instead fires the render AFTER `openTicketId` actually becomes
   * `null` — by which point `TicketSheet` (and its `FocusScope`) is gone
   * from the tree — and reads the ticket id from a ref because the id
   * itself, and therefore the lookup key, is what just disappeared.
   */
  const lastOpenTicketIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (openTicketId === null && lastOpenTicketIdRef.current !== null) {
      badgeRefs.current.get(lastOpenTicketIdRef.current)?.querySelector('a')?.focus();
    }
    lastOpenTicketIdRef.current = openTicketId;
  }, [openTicketId]);

  /**
   * Whether THIS `noteId` has ever answered non-null, reset per note. Without
   * it, a `null` on the very FIRST answer (a stale link, a note that was
   * never shared) would ALSO fire `onLostAccess` — the wrong copy for that
   * case, which the inline "no longer shared" state below already draws.
   * `onLostAccess` is for a note that WAS open and then stopped being
   * readable — a purge, a scope change — which only a note this ref has
   * already seen non-null can mean.
   */
  const everLoadedRef = useRef(false);
  useEffect(() => {
    everLoadedRef.current = false;
  }, [noteId]);
  useEffect(() => {
    if (note !== null) {
      everLoadedRef.current = true;
      return;
    }
    if (!live.settled || !everLoadedRef.current) return;
    onLostAccess?.();
  }, [note, live.settled, onLostAccess]);

  const [members, setMembers] = useState<RosterMember[]>([]);
  useEffect(() => {
    if (note === null) return;
    let cancelled = false;
    dataSource.query.getMembers(note.workspaceId).then(
      (rows) => {
        if (!cancelled) setMembers(rows);
      },
      () => {
        if (!cancelled) setMembers([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, note?.workspaceId]);

  /**
   * The document as the editor last reported it. `onDraft` fires on every
   * change in note mode, and this is what "Copy as Markdown" and the reading
   * time read — WITHOUT it they would serialise the body the note was LOADED
   * with, which is the note as it was, not as it is.
   */
  const [draft, setDraft] = useState<unknown>(null);
  const ownEditorRoot = useRef<HTMLDivElement | null>(null);
  const editorRoot = editorRootRef ?? ownEditorRoot;
  const [wordCount, setWordCount] = useState(0);

  /**
   * Imperative access to the live Tiptap instance (owner, 2026-09-23: the
   * page should "feel like its a note" — `.gn-notes__editor`'s own
   * `min-height` pads the area below short text, and this is what a click
   * there does). Threaded through `TicketEditorSlot`'s existing `editorRef`
   * prop rather than a new one, so the twin-contract tests
   * (`ticket-editor-slot.test.tsx`) see no new surface.
   */
  const editorInstanceRef = useRef<NonNullable<TicketEditorSlotProps['editorRef']>['current']>(null);

  // The reading time AND the TOC's headings come off the RENDERED node
  // (`extractReadingMeta` reads a DOM element), so both are recomputed after
  // each paint that a draft changed. The headings are reported UP to
  // `NotesPage` — its `<aside>` column is a sibling of this component, not a
  // descendant, so it cannot read this ref itself.
  useEffect(() => {
    const root = editorRoot.current;
    if (root === null) return;
    const meta = extractReadingMeta(root);
    setWordCount(meta.wordCount);
    onHeadingsChange?.(meta.headings);
  }, [draft, note?.noteId, editorRoot, onHeadingsChange]);

  // A link to a heading (`/notes/<id>#slug`, copied from the heading's button or
  // typed by hand) arrives at a page whose headings do not exist yet: the note
  // loads, then the editor mounts, then the ids are stamped. So the browser's
  // own jump-to-fragment finds nothing, and this waits for the target — once
  // per note, so a reader who has scrolled away is not pulled back by a later
  // re-render.
  useEffect(() => {
    if (note?.noteId === undefined) return;
    const raw = window.location.hash.slice(1);
    if (raw === '') return;
    const root = editorRoot.current;
    if (root === null) return;
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      // a malformed escape: use it as typed
    }
    const find = (): Element | null => root.querySelector(`#${CSS.escape(id)}`);
    const reveal = (target: Element): void => target.scrollIntoView?.({ block: 'start' });
    const now = find();
    if (now !== null) {
      reveal(now);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      const target = find();
      if (target === null) return;
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
      reveal(target);
    });
    observer.observe(root, { childList: true, subtree: true });
    // Give up after a while: a fragment naming no heading must not watch forever.
    timer = setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
    };
    // Once per note: `note` itself changes on every autosave and live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.noteId, editorRoot]);

  /** The loaded list for `queryNotes` and `resolveNoteTitle`. */
  const [treeNotes, setTreeNotes] = useState<NoteSummary[]>([]);
  useEffect(() => {
    if (note === null) return;
    let cancelled = false;
    dataSource.query.getNotes(note.workspaceId).then(
      (rows) => {
        if (!cancelled) setTreeNotes(rows);
      },
      () => {
        if (!cancelled) setTreeNotes([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, note?.workspaceId]);

  const canEdit =
    note !== null &&
    user !== null &&
    (note.authorId === user.id || workspace?.role === 'owner' || workspace?.role === 'admin');
  /**
   * A deleted note is read-only for EVERYONE, including its own author,
   * until Restore brings it back — editing a note that is not there is not a
   * state this page draws. `canEdit` itself stays the "may this person act
   * on this note at all" fact (the banner's own Restore button reads it
   * directly), and this is the narrower "may they type right now" fact the
   * editor/title/byline read instead.
   */
  const canEditNow = canEdit && note?.deleted !== true;

  async function write(eventType: string, payload: Record<string, unknown>): Promise<boolean> {
    if (user === null || note === null) return false;
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    const event = make({
      workspaceId: note.workspaceId,
      entity: { kind: 'note', id: note.noteId },
      type: eventType,
      payload,
    });
    const results = await dataSource.ingest([event]);
    if (results[0]?.status === 'committed') {
      live.reload();
      return true;
    }
    return false;
  }

  /**
   * The deleted banner's Restore (trash Plan 4 Task 6). Not `write`: that
   * returns `false` on any refusal and shows nothing, and once this page can
   * mark a note, Restore is refused for a marked one (`UNMARK_FIRST_REASON`) —
   * the button would silently do nothing. So it goes through `restoreSeeds`
   * (unmark first after a permanent delete made HERE) and shows the reason.
   */
  async function restoreNote(): Promise<void> {
    if (user === null || note === null) return;
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    const seeds = restoreSeeds({ kind: 'note', workspaceId: note.workspaceId, entityId: note.noteId }, markedHere);
    try {
      const results = await dataSource.ingest(seeds.map(make));
      const outcome = classifyBatch(results, seeds.length);
      if (outcome.status === 'committed') {
        setMarkedHere(false);
        setRestoreRefusal(null);
        live.reload();
        setEditorGeneration((generation) => generation + 1);
        return;
      }
      if (outcome.status === 'partly') {
        // One of the pair landed: the unmark (still deleted, no longer
        // marked). Re-read, and say what was refused.
        setMarkedHere(false);
        live.reload();
      }
      setRestoreRefusal(
        outcome.status === 'unanswered' ? unansweredLine(outcome.answered, seeds.length) : outcome.reason,
      );
    } catch (cause) {
      setRestoreRefusal(writeFailureCopy(cause, restoreUnreachableLine));
    }
  }

  const authorName = useMemo(() => {
    if (note === null) return '';
    const author = members.find((member) => member.id === note.authorId);
    return author?.name?.trim() || author?.email?.trim() || note.authorId;
  }, [note, members]);

  /** Any author's name from the SAME roster `authorName` reads — History rows name whoever recorded each version, not just the note's own author. */
  const nameOf = useMemo(
    () => (authorId: string) => {
      const member = members.find((candidate) => candidate.id === authorId);
      return member?.name?.trim() || member?.email?.trim() || authorId;
    },
    [members],
  );

  const [historyOpen, setHistoryOpen] = useState(false);
  /**
   * Bumped on any write whose effect a mounted `NoteEditorPane` cannot pick
   * up from a changed PROP alone, and folded into the pane's `key` below —
   * neither write changes `noteId`, so without this the pane would not
   * remount:
   *
   * - a History **Restore** (`note.body_set`): `useNoteAutosave`'s
   *   lazy-state `initialDoc` (see its own docblock) and `TicketEditor`'s
   *   one-time `useEditor` mount would both keep showing the PRE-restore
   *   body forever — `live.reload()` updates the `note` PROP, but nothing
   *   downstream of the pane's own mount ever reads a prop change again.
   *   Found by an advisor review, not by 18.212 (`HistoryPanel`'s own
   *   case), which only proves `onRestore` is called with the right bytes —
   *   never that they reach the screen.
   * - the deleted banner's **Restore** (`note.restored`): `TicketEditor`'s
   *   own docblock states `editable` is read ONCE, at mount, exactly like
   *   `content` — *"a host that needs it to change must remount"* — so
   *   flipping `note.deleted` back to `false` would leave the editor
   *   read-only until the person reloaded the page, without this.
   */
  const [editorGeneration, setEditorGeneration] = useState(0);
  /** The delete dialog's open state (trash Plan 4, D2). */
  const [deleting, setDeleting] = useState(false);
  /**
   * True after a PERMANENT delete made on this page, so the banner's Restore
   * unmarks before it restores (the server refuses a restore while marked).
   * `NoteDetail` carries no mark, so a mark made elsewhere is not known here —
   * that Restore is refused with the server's reason, shown in the banner, and
   * Deleted items on the Account page is where it can be unmarked.
   */
  const [markedHere, setMarkedHere] = useState(false);
  const [restoreRefusal, setRestoreRefusal] = useState<string | null>(null);

  if (note === null) {
    return (
      <p className="gn-notes__hint" data-testid="note-document-missing">
        {searched ? 'That note is no longer shared with you.' : 'Loading…'}
      </p>
    );
  }

  /**
   * The MIDDLE crumb, and why it can legitimately be absent (owner report,
   * 2026-09-24: a note's breadcrumb showed "Convenience Corner /  /
   * Furniture" — an empty segment with its own separator either side).
   *
   * `homeProjectId` is a plain `string`, and `''` is not a bug in it: a
   * WORKSPACE-scoped note (`CreateNoteDialog`'s own default home,
   * `{ projectId: '' }`) has no project, ever — `note-state.ts` refuses an
   * EMPTY `homeProjectId` only for `scope.mode === 'project'`, which is the
   * domain's own confirmation that the workspace level is real and not an
   * oversight. `.find()` over `''` naturally finds nothing, so this was
   * ALWAYS `undefined` for such a note; the defect was `?? ''` painting
   * over that with an EMPTY STRING instead of leaving the crumb unrendered,
   * and the OLD JSX always rendering the `<li>` regardless. (The planner's
   * own alternate guess — a reserved `parent_note_id` column — does not
   * exist anywhere in this codebase; ruled out, not merely unmentioned.)
   */
  const homeProjectName =
    workspace?.projects.find((project) => project.id === note.homeProjectId)?.name ?? null;

  return (
    <div className="gn-note-document" data-testid="note-document">
      {/* An absent level renders NO `<li>` at all, not an empty one — the
          stylesheet's own separator rule (`.gn-breadcrumb__item +
          .gn-breadcrumb__item::before`) draws `/` only BETWEEN two
          rendered siblings, so omitting the `<li>` is what removes its
          separator too, with no second rule needed. */}
      <nav aria-label="Breadcrumb" className="gn-breadcrumb">
        <ol className="gn-breadcrumb__list">
          {workspace !== null && workspace.name !== '' ? (
            <li className="gn-breadcrumb__item">{workspace.name}</li>
          ) : null}
          {homeProjectName !== null ? <li className="gn-breadcrumb__item">{homeProjectName}</li> : null}
          <li className="gn-breadcrumb__item gn-breadcrumb__item--current">{note.title}</li>
        </ol>
      </nav>

      <NoteTitle
        title={note.title}
        canEdit={canEditNow}
        onRename={(next) => void write('note.renamed', { title: next })}
      />

      <NoteByline
        note={note}
        workspace={workspace ?? { id: note.workspaceId, name: '', prefix: '', role: 'member', archived: false, memberCount: null, nameRestrictedProjectCount: 0, projects: [] }}
        members={members}
        authorName={authorName}
        editedLabel={editedLabel(note.updatedAt)}
        canEdit={canEditNow}
        onScopeChanged={() => live.reload()}
        onDetach={(ticketId) => void write('note.detached', { ticketId })}
        onOpenTicket={openTicket}
        onBadgeRef={(ticketId, element) => {
          if (element === null) badgeRefs.current.delete(ticketId);
          else badgeRefs.current.set(ticketId, element);
        }}
        readingLabel={readingLabel(wordCount)}
        onCopyMarkdown={() => {
          void navigator.clipboard.writeText(
            exportMarkdown(draft ?? note.body),
          );
        }}
        onOpenHistory={() => setHistoryOpen(true)}
        {...(canEditNow ? { onDelete: () => setDeleting(true) } : {})}
      />

      {note.deleted ? (
        <div className="gn-notes__deleted-banner" role="status" data-testid="note-deleted-banner">
          <p>This note was deleted</p>
          {canEdit ? (
            <Button onClick={() => void restoreNote()}>Restore</Button>
          ) : (
            <Button variant="ghost" onClick={() => router.push('/notes')}>
              Back
            </Button>
          )}
          {restoreRefusal !== null ? (
            <p role="alert" className="gn-refusal gn-refusal--server">
              {restoreRefusal}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* `onClick` only when the click LANDS ON THIS DIV — a click inside the
          editor's own content has `event.target` somewhere in `.ProseMirror`
          or the toolbar, never this element, so ProseMirror's own
          click-to-position-caret is untouched; what this catches is the
          padded empty space the `min-height` rule adds below short text. */}
      {/* No read/edit toggle here, so the note page IS the reading surface
          and every viewer gets the bar (the KB source mounts it in read mode
          only). Bound to the same element as the table of contents; it works
          out for itself that the WINDOW scrolls (`findScroller`). */}
      <ReadingProgress scrollContainerRef={editorRoot} resetKey={note.noteId} />
      <div
        className="gn-notes__editor"
        ref={editorRoot}
        data-testid="note-editor"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          editorInstanceRef.current?.commands.focus('end');
        }}
      >
        <NoteEditorPane
          key={`${note.noteId}:${editorGeneration}`}
          note={note}
          treeNotes={treeNotes}
          canEdit={canEditNow}
          dataSource={dataSource}
          userId={user?.id ?? ''}
          onDraftChange={setDraft}
          onNavigateNote={(id) => router.push(`/notes/${id}`)}
          editorRef={editorInstanceRef}
          onDraftDiscarded={() => setEditorGeneration((generation) => generation + 1)}
        />
      </div>

      <NoteComments
        workspaceId={note.workspaceId}
        noteId={note.noteId}
        nameOf={nameOf}
        canComment
        notes={treeNotes}
      />

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        workspaceId={note.workspaceId}
        noteId={note.noteId}
        canEdit={canEdit}
        nameOf={nameOf}
        onRestore={(body) => {
          void write('note.body_set', { body }).then((wrote) => {
            if (wrote) {
              setHistoryOpen(false);
              setEditorGeneration((generation) => generation + 1);
            }
          });
        }}
      />

      {/* A ticket the locator will not place mounts no sheet at all and
          leaves this sentence in its place — the same arm My Work draws for
          its own `contested` section. */}
      {openNotice !== null ? (
        <p role="alert" className="gn-notes__refusal">
          {openNotice}
        </p>
      ) : null}

      {/*
        THE TICKET SHEET, ON THE PAGE THE CLICK HAPPENED ON.

        Gated on the param, on the ticket having a project, and on the
        session — the third for the reason `app/w/[workspaceId]/my-work/
        page.tsx`'s own mount states: a sheet that would write with an ended
        session is a refusal the reader has to read twice.
      */}
      {openTicketId !== null && openTicketProjectId !== null && session.kind === 'signed-in' ? (
        <TicketSheet
          dataSource={dataSource}
          cache={cache}
          workspaceId={note.workspaceId}
          ticketId={openTicketId}
          currentUserId={currentUserId}
          attachments={openTicketAttachments.data ?? undefined}
          attachmentsUnavailable={openTicketAttachments.error ?? undefined}
          onClose={closeTicket}
          editorSlot={TicketEditorSlot}
          queryTickets={buildProjectPageQueryTickets(dataSource, note.workspaceId, openTicketProjectId)}
          resolveTicketHref={ticketRefHrefIn(note.workspaceId)}
          workspaceName={workspace?.name ?? null}
          projectName={workspace?.projects.find((project) => project.id === openTicketProjectId)?.name ?? null}
          workspaceHref={`/w/${note.workspaceId}`}
          projectHref={`/w/${note.workspaceId}/p/${openTicketProjectId}`}
          onNavigate={(href) => router.push(href, { scroll: true })}
          uploadEvidence={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          uploadAttachment={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          /*
            THE PARENT CHIP'S DOOR, and it is this page's own `openTicket` —
            the same door every badge already uses, so a parent chip inside
            this mounted sheet swaps `?ticket=` in place too, placed by
            `attachedTicketProjectId` when the parent happens to be attached
            to this note and by the locator effect above otherwise.
          */
          onOpenTicket={openTicket}
          /*
            THE SOFT DELETE. A deleted ticket stays attached — Features.md
            §15 records that deleting a job does not detach it — so nothing
            here removes the badge; reloading is only for whatever ELSE the
            delete may have changed about this note's own reach (a `Same as
            the ticket` scope tied to the now-deleted job).
          */
          onDeleted={() => live.reload()}
        />
      ) : null}

      {user !== null ? (
        <DeleteDialog
          open={deleting}
          kind="note"
          name={note.title}
          workspaceId={note.workspaceId}
          entityId={note.noteId}
          dataSource={dataSource}
          make={makeSubmittedFactory({ actorId: user.id, origin: 'web' })}
          onCancel={() => setDeleting(false)}
          onDeleted={({ permanent }) => {
            setDeleting(false);
            setMarkedHere(permanent);
            setRestoreRefusal(null);
            // The deleted banner reads \`note.deleted\`; \`TicketEditor\` reads
            // \`editable\` once at mount, so the pane is remounted too (the
            // same reason the banner's Restore bumps it).
            live.reload();
            setEditorGeneration((generation) => generation + 1);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * `NoteDocumentBody` keyed by the note. Its Delete dialog, its
 * "deleted here on purpose" memory and a refused Restore's sentence belong to
 * ONE note; a route change to another note (browser Back included) must not
 * carry them over — the dialog would delete the new note, and a Restore would
 * send an unmark the new note was never given.
 */
export function NoteDocument(props: ComponentProps<typeof NoteDocumentBody>) {
  return <NoteDocumentBody key={props.noteId} {...props} />;
}

/**
 * The editor mount, and the ONLY thing `useNoteAutosave` is ever called
 * from — `NoteDocument` renders this keyed by `note.noteId`, so a different
 * note REMOUNTS this component rather than handing the hook a new `note`
 * prop on an existing instance. That remount is what makes the hook's own
 * lazy-state draft recovery run with the right note already in hand (see its
 * docblock), and its unmount is spec §9.4's "flush on route change".
 */
function NoteEditorPane({
  note,
  treeNotes,
  canEdit,
  dataSource,
  userId,
  onDraftChange,
  onNavigateNote,
  editorRef,
  onDraftDiscarded,
}: {
  note: NoteDetail;
  treeNotes: NoteSummary[];
  canEdit: boolean;
  dataSource: DataSource;
  userId: string;
  onDraftChange: (doc: unknown) => void;
  onNavigateNote: (id: string) => void;
  editorRef: TicketEditorSlotProps['editorRef'];
  /** The banner's Discard: the parent remounts this pane, which then recovers nothing and mounts with the server's body. */
  onDraftDiscarded: () => void;
}) {
  const autosave = useNoteAutosave({
    dataSource,
    userId,
    workspaceId: note.workspaceId,
    noteId: note.noteId,
    note,
  });

  // Seeds the PARENT's `draft` (Copy as Markdown, reading time) with a
  // recovered draft, once — without it, opening a note with an unsaved draft
  // would copy and measure the SERVER'S body until the person typed a single
  // character. One render behind `initialDoc` itself: acceptable here, unlike
  // the editor's own content, because nothing renders `draft` before an
  // effect gets a turn to run.
  useEffect(() => {
    onDraftChange(autosave.initialDoc);
    // Runs once, at mount — this component is remounted per note (see the
    // docblock above), so there is no later `note` to reseed from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep only hides the banner; the draft stays live and saves as any edit.
  const [bannerKept, setBannerKept] = useState(false);

  return (
    <>
      {autosave.restoredAt !== null && !bannerKept && canEdit ? (
        <DraftRestoreBanner
          savedAt={autosave.restoredAt}
          onKeep={() => setBannerKept(true)}
          onDiscard={() => {
            autosave.discardDraft();
            onDraftDiscarded();
          }}
        />
      ) : null}
      <TicketEditorSlot
        mode="note"
        doc={autosave.initialDoc}
        readOnly={!canEdit}
        workspaceId={note.workspaceId}
        ticketId=""
        noteId={note.noteId}
        submitSlot="none"
        editorRef={editorRef}
        onDraft={(doc) => {
          onDraftChange(doc);
          autosave.onDraft(doc);
        }}
        onSave={autosave.onSave}
        saveState={autosave.saveState}
        placeholder="Write the note…"
        queryNotes={async (query: string) => {
          const needle = query.trim().toLowerCase();
          const hits: Array<{ noteId: string; title: string }> = [];
          for (const candidate of [note, ...treeNotes]) {
            if (needle !== '' && !candidate.title.toLowerCase().includes(needle)) continue;
            if (hits.some((hit) => hit.noteId === candidate.noteId)) continue;
            hits.push({ noteId: candidate.noteId, title: candidate.title });
            if (hits.length === 8) break;
          }
          return hits;
        }}
        resolveNoteTitle={(id: string) => {
          if (id === note.noteId) return note.title;
          return treeNotes.find((candidate) => candidate.noteId === id)?.title ?? null;
        }}
        previewNote={async (id: string) => {
          const target = id === note.noteId ? note : await dataSource.query.getNote(note.workspaceId, id);
          if (target === null) return null;
          return docToPlainText(target.body).slice(0, 200);
        }}
        onNavigateNote={onNavigateNote}
        headingLink={(id: string) => `${window.location.origin}/notes/${note.noteId}#${id}`}
        queryTickets={buildWorkspaceQueryTickets(dataSource, note.workspaceId)}
        resolveTicketHref={ticketRefHrefIn(note.workspaceId)}
      />
    </>
  );
}

/**
 * "edited N min ago", and it is deliberately COARSE.
 *
 * A note's byline is not a log line: the precision a person needs from it is
 * "just now / this hour / today / older", and a timestamp to the second would be
 * a claim of precision nobody asked for. The boundary cases are chosen so the
 * label never reads "0 min ago" — under a minute is "just now".
 */
export function editedLabel(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'edited';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'edited just now';
  if (minutes < 60) return `edited ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `edited ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `edited ${days} d ago`;
}

/** "N min read", or nothing at all for an empty document. */
export function readingLabel(wordCount: number): string {
  const minutes = readingTimeMinutes(wordCount);
  return minutes === 0 ? '' : `${minutes} min read`;
}
