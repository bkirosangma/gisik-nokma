import { useCallback, useEffect, useRef, useState } from 'react';
import { makeSubmittedFactory, type DataSource } from '@gisik-nokma/app-core';
import type { NoteDetail } from '@gisik-nokma/domain';

/** Spec §9.4's coalescing window: every `onDraft` resets it. */
export const AUTOSAVE_COALESCE_MS = 2000;

export type NoteSaveState = 'saved' | 'saving' | 'unsaved';

export type UseNoteAutosaveArgs = {
  dataSource: DataSource;
  userId: string;
  workspaceId: string;
  noteId: string;
  note: NoteDetail | null;
};

export type UseNoteAutosaveResult = {
  onDraft: (doc: unknown) => void;
  onSave: (doc: unknown) => void;
  saveState: NoteSaveState;
  initialDoc: unknown;
  /** Epoch ms of the draft `initialDoc` was recovered from — `null` when the editor mounted with the server's body. */
  restoredAt: number | null;
  /**
   * Drop the recovered draft: cancels the pending write, deletes the key and
   * reports saved. The CALLER then remounts the editor, which recovers from
   * the (now empty) key and mounts with the server's body.
   */
  discardDraft: () => void;
};

/** `gn.note-draft.<userId>.<noteId>` (spec §9.4) — keyed by user, so a shared device never offers one person's unsaved words as another's. */
export function noteDraftKey(userId: string, noteId: string): string {
  return `gn.note-draft.${userId}.${noteId}`;
}

type Recovery = {
  /** What the editor should mount with. */
  doc: unknown;
  saveState: NoteSaveState;
  /** Set on `pendingDocRef` at mount — the recovered draft, if any, still needs to reach the server. */
  pendingDoc: unknown;
  /** A stale draft was found and must be deleted — a write, so it happens in an effect, not here. */
  staleDraftFound: boolean;
  /** `at` of the recovered draft, for the restore banner — `null` when none was recovered. */
  restoredAt: number | null;
};

/**
 * Every `localStorage` access wrapped, for the reason `use-last-project.ts`
 * documents for its own: a private window or blocked site data throws on the
 * ACCESSOR, not on the value.
 */
function recoverDraft(draftKey: string, note: NoteDetail | null): Recovery {
  if (note === null) return { doc: null, saveState: 'saved', pendingDoc: null, staleDraftFound: false, restoredAt: null };

  let stored: { doc: unknown; at: number } | null = null;
  try {
    const raw = window.localStorage.getItem(draftKey);
    if (raw !== null) stored = JSON.parse(raw) as { doc: unknown; at: number };
  } catch {
    stored = null;
  }

  if (stored !== null && stored.at > Date.parse(note.updatedAt)) {
    return { doc: stored.doc, saveState: 'unsaved', pendingDoc: stored.doc, staleDraftFound: false, restoredAt: stored.at };
  }
  return { doc: note.body, saveState: 'saved', pendingDoc: null, staleDraftFound: stored !== null, restoredAt: null };
}

/**
 * A note saves itself (spec §9.4, D14): every change is drafted to
 * `localStorage` and coalesced into one `note.body_set` per pause, so a tab
 * closed mid-sentence loses nothing and the ledger is not asked to hold one
 * event per keystroke.
 *
 * ## The caller makes "synchronous recovery" true, not this hook alone
 *
 * `initialDoc` is decided ONCE, by `recoverDraft`, through a LAZY `useState`
 * initializer — never through an effect. `TicketEditor`'s `useEditor` reads
 * its `content` option exactly once, on mount, with an EMPTY deps array
 * (`packages/editor` case 9.72); an effect-driven correction would land one
 * render after the editor had already mounted with the wrong body, and the
 * prop change would be silently ignored — measured while building this hook,
 * against an earlier effect-based draft of it.
 *
 * A lazy initializer is only correct if `note` is ALREADY the right note on
 * this hook's very first call. `NoteDocument` guarantees that: it renders
 * this hook's owner, `NoteEditorPane`, only once the note has loaded, keyed
 * by `note.noteId` — so opening a different note REMOUNTS the pane rather
 * than handing this hook a new `note` prop on an existing instance. That
 * remount is also the mechanism spec §9.4's "flush on route change" uses
 * here: the pane's unmount effect is the one flush this hook needs.
 *
 * `note: NoteDetail | null` stays in the signature because the plan's own
 * Interfaces block states it exactly this way, and a `null` note is still a
 * safe, inert call (`recoverDraft` above answers `doc: null, saved`) — it is
 * simply never the shape `NoteEditorPane` hands it in this build.
 *
 * ## Why the pending document and the timer live in refs, not state
 *
 * `onDraft` fires on every keystroke through a callback the editor holds
 * across renders. Reading the pending document and the debounce timer out of
 * `useState` would mean the closure handed to the editor on ITS FIRST render
 * keeps reading that render's stale values forever; a ref is read fresh on
 * every call regardless of which render created the closure.
 */
export function useNoteAutosave({
  dataSource,
  userId,
  workspaceId,
  noteId,
  note,
}: UseNoteAutosaveArgs): UseNoteAutosaveResult {
  const draftKey = noteDraftKey(userId, noteId);

  const [initial] = useState<Recovery>(() => recoverDraft(draftKey, note));
  const [saveState, setSaveState] = useState<NoteSaveState>(initial.saveState);

  /** The most recently drafted doc, not yet confirmed committed — `null` when nothing is pending. */
  const pendingDocRef = useRef<unknown>(initial.pendingDoc);
  /** The last doc the SERVER confirmed, so `flush` can tell a no-op save from a real one. */
  const lastSavedRef = useRef<unknown>(note?.body ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingDocRef.current;
    if (pending === null) return;
    if (JSON.stringify(pending) === JSON.stringify(lastSavedRef.current)) {
      pendingDocRef.current = null;
      return;
    }
    // Claimed before the `await`: a flush that arrives while this one is
    // still in flight sees nothing pending rather than double-submitting the
    // same draft.
    pendingDocRef.current = null;
    setSaveState('saving');
    const make = makeSubmittedFactory({ actorId: userId, origin: 'web' });
    const event = make({
      workspaceId,
      entity: { kind: 'note', id: noteId },
      type: 'note.body_set',
      payload: { body: pending },
    });
    void dataSource.ingest([event]).then(
      (results) => {
        if (results[0]?.status === 'committed') {
          lastSavedRef.current = pending;
          // Only report saved and drop the key if NOTHING NEWER queued while
          // this write was in flight — otherwise a draft typed during the
          // `await` would be reported "Saved" while sitting unflushed, its
          // own key just deleted out from under it.
          if (pendingDocRef.current === null) {
            try {
              window.localStorage.removeItem(draftKey);
            } catch {
              // A private window, or blocked site data: the draft is only a
              // convenience, and the write already succeeded on the server.
            }
            setSaveState('saved');
          }
        } else if (pendingDocRef.current === null) {
          // Restore only if nothing newer is already pending — a refusal for
          // an OLD draft must not clobber a NEWER one typed since.
          pendingDocRef.current = pending;
          setSaveState('unsaved');
        }
      },
      () => {
        if (pendingDocRef.current === null) {
          pendingDocRef.current = pending;
        }
        setSaveState('unsaved');
      },
    );
  }, [dataSource, userId, workspaceId, noteId, draftKey]);

  const onDraft = useCallback(
    (doc: unknown) => {
      pendingDocRef.current = doc;
      try {
        window.localStorage.setItem(draftKey, JSON.stringify({ doc, at: Date.now() }));
      } catch {
        // Private window, or blocked site data: the draft still lives in
        // `pendingDocRef` and will flush through `onSave`/unmount/the timer —
        // only the reload-survives-a-crash guarantee is lost.
      }
      setSaveState('saving');
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, AUTOSAVE_COALESCE_MS);
    },
    [draftKey, flush],
  );

  const onSave = useCallback(
    (doc: unknown) => {
      pendingDocRef.current = doc;
      flush();
    },
    [flush],
  );

  // Discard a STALE draft's key. A write, so it belongs in an effect rather
  // than in the lazy initializer above — and it runs at most once: this hook
  // is remounted per note (see the docblock), so `initial` never changes
  // across the life of one instance.
  useEffect(() => {
    if (initial.staleDraftFound) {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // See every other catch here: a lost convenience, not a failure the
        // editor should refuse to open over.
      }
    }
    // `initial`/`draftKey` are fixed for the life of this instance — see the
    // docblock's remount argument. Re-running this on every render would risk
    // deleting a key an `onDraft` just legitimately wrote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush on `beforeunload` and on unmount — the route-change flush is the
  // unmount half, made true by the caller's `key={note.noteId}` (docblock).
  useEffect(() => {
    const handleBeforeUnload = (): void => flush();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flush();
    };
  }, [flush]);

  const discardDraft = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Nothing pending, so the unmount flush that follows the caller's remount
    // cannot write the discarded words to the server.
    pendingDocRef.current = null;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Blocked site data: nothing was stored, so nothing to remove.
    }
    setSaveState('saved');
  }, [draftKey]);

  return { onDraft, onSave, saveState, initialDoc: initial.doc, restoredAt: initial.restoredAt, discardDraft };
}
