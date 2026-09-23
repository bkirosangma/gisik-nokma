'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import {
  TicketEditorSlot,
  exportMarkdown,
  extractReadingMeta,
  readingTimeMinutes,
  type ReadingMeta,
} from '@gisik-nokma/editor';
import { Button } from '@gisik-nokma/ui';
import {
  makeSubmittedFactory,
  useLiveQuery,
  type DataSource,
  type RosterMember,
  type WorkspaceRef,
} from '@gisik-nokma/app-core';
import { docToPlainText, type NoteDetail, type NoteSummary } from '@gisik-nokma/domain';
import { useAppServices, useCurrentUser } from '../providers.js';
import { HistoryPanel } from './history-panel.js';
import { NoteByline } from './note-byline.js';
import { NoteComments } from './note-comments.js';
import { NoteTitle } from './note-title.js';
import { useNoteAutosave } from './use-note-autosave.js';

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
 */
export function NoteDocument({
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
  const { dataSource } = useAppServices();
  const user = useCurrentUser();
  const router = useRouter();

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

  if (note === null) {
    return (
      <p className="gn-notes__hint" data-testid="note-document-missing">
        {searched ? 'That note is no longer shared with you.' : 'Loading…'}
      </p>
    );
  }

  return (
    <div className="gn-note-document" data-testid="note-document">
      <nav aria-label="Breadcrumb" className="gn-breadcrumb">
        <ol className="gn-breadcrumb__list">
          <li className="gn-breadcrumb__item">{workspace?.name ?? ''}</li>
          <li className="gn-breadcrumb__item">
            {workspace?.projects.find((project) => project.id === note.homeProjectId)?.name ?? ''}
          </li>
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
        readingLabel={readingLabel(wordCount)}
        onCopyMarkdown={() => {
          void navigator.clipboard.writeText(
            exportMarkdown(draft ?? note.body),
          );
        }}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      {note.deleted ? (
        <div className="gn-notes__deleted-banner" role="status" data-testid="note-deleted-banner">
          <p>This note was deleted</p>
          {canEdit ? (
            <Button
              onClick={() => {
                void write('note.restored', {}).then((wrote) => {
                  if (wrote) setEditorGeneration((generation) => generation + 1);
                });
              }}
            >
              Restore
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => router.push('/notes')}>
              Back
            </Button>
          )}
        </div>
      ) : null}

      <div className="gn-notes__editor" ref={editorRoot} data-testid="note-editor">
        <NoteEditorPane
          key={`${note.noteId}:${editorGeneration}`}
          note={note}
          treeNotes={treeNotes}
          canEdit={canEditNow}
          dataSource={dataSource}
          userId={user?.id ?? ''}
          onDraftChange={setDraft}
          onNavigateNote={(id) => router.push(`/notes/${id}`)}
        />
      </div>

      <NoteComments workspaceId={note.workspaceId} noteId={note.noteId} nameOf={nameOf} canComment />

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
    </div>
  );
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
}: {
  note: NoteDetail;
  treeNotes: NoteSummary[];
  canEdit: boolean;
  dataSource: DataSource;
  userId: string;
  onDraftChange: (doc: unknown) => void;
  onNavigateNote: (id: string) => void;
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

  return (
    <TicketEditorSlot
      mode="note"
      doc={autosave.initialDoc}
      readOnly={!canEdit}
      workspaceId={note.workspaceId}
      ticketId=""
      noteId={note.noteId}
      submitSlot="none"
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
    />
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
