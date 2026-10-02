import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from '@gisik-nokma/app-core';
import type { DocJson } from '@gisik-nokma/editor';
import type { IngestResult, NoteDetail, SubmittedEvent } from '@gisik-nokma/domain';
import { useNoteAutosave } from '../src/notes/use-note-autosave.js';

/**
 * Cases 18.205–18.209 — autosave, drafts and the save state (Plan 5 of 6, spec §9.4).
 *
 * The hook is driven directly through `renderHook`, never through a mounted
 * editor: the four callbacks (`onDraft`/`onSave`) and the two answers
 * (`saveState`/`initialDoc`) ARE the whole of `useNoteAutosave`'s contract, and
 * the slot that calls them is `packages/editor`'s to prove (9.291–9.292,
 * already passing before this task).
 */
const USER = 'u_kiro';
const WORKSPACE = '01J9WSLOGISTICS000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';

function doc(text: string): DocJson {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function noteDetail(updatedAt: string, over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    noteId: NOTE,
    workspaceId: WORKSPACE,
    homeProjectId: '',
    authorId: USER,
    title: 'Compressor log',
    scope: { mode: 'private' },
    attachedTickets: [],
    deleted: false,
    createdAt: updatedAt,
    updatedAt,
    body: doc('the server copy'),
    schemaVersion: 2,
    ...over,
  };
}

const draftKey = (userId: string, noteId: string): string => `gn.note-draft.${userId}.${noteId}`;

function fakeDataSource(
  ingestImpl: (events: SubmittedEvent[]) => Promise<IngestResult[]>,
): { dataSource: DataSource; ingest: ReturnType<typeof vi.fn> } {
  const ingest = vi.fn(ingestImpl);
  return {
    dataSource: {
      ingest,
      query: {} as DataSource['query'],
      subscribe: vi.fn(() => () => {}),
    },
    ingest,
  };
}

function committed(): Promise<IngestResult[]> {
  return Promise.resolve([
    { status: 'committed', eventId: '01J9EVENT000000000000000000', seq: 1, serverTime: '2026-09-23T09:00:00.000Z' },
  ]);
}

function refused(): Promise<IngestResult[]> {
  return Promise.resolve([
    { status: 'refused', eventId: '01J9EVENT000000000000000000', rule: 'not-your-note', reason: 'no' },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('18.205-18.209 useNoteAutosave', () => {
  /**
   * 18.205 — the 2 s coalescing timer.
   *
   * Mutation: write per call — every `onDraft` submits its own event, so this
   * reads 5 (and later 6) instead of 1 (and later 2).
   */
  it('18.205 five onDraft calls within two seconds write ONE note.body_set; a sixth call after a further two seconds writes a second', async () => {
    const { dataSource, ingest } = fakeDataSource(committed);
    const hook = renderHook(() =>
      useNoteAutosave({
        dataSource,
        userId: USER,
        workspaceId: WORKSPACE,
        noteId: NOTE,
        note: noteDetail('2026-09-23T08:00:00.000Z'),
      }),
    );

    act(() => hook.result.current.onDraft(doc('a')));
    act(() => {
      vi.advanceTimersByTime(300);
      hook.result.current.onDraft(doc('ab'));
    });
    act(() => {
      vi.advanceTimersByTime(300);
      hook.result.current.onDraft(doc('abc'));
    });
    act(() => {
      vi.advanceTimersByTime(300);
      hook.result.current.onDraft(doc('abcd'));
    });
    act(() => {
      vi.advanceTimersByTime(300);
      hook.result.current.onDraft(doc('abcde'));
    });
    // 1200 ms elapsed across five calls, each resetting the timer — nothing sent yet.
    expect(ingest).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(ingest).toHaveBeenCalledTimes(1);
    const firstEvent = ingest.mock.calls[0]![0] as SubmittedEvent[];
    expect(firstEvent[0]!.type).toBe('note.body_set');
    expect(firstEvent[0]!.payload).toEqual({ body: doc('abcde') });

    // CONTROL — a sixth call, once the debounce has already fired once, writes
    // a SECOND event after its own 2 s window.
    act(() => hook.result.current.onDraft(doc('f')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(ingest).toHaveBeenCalledTimes(2);
  });

  /**
   * 18.206 — the two flushes that do NOT wait for the timer.
   *
   * Mutation: drop the unmount flush — the second arm's `ingest` call never
   * happens.
   */
  it('18.206 onSave flushes immediately; unmount flushes a pending draft', async () => {
    const { dataSource, ingest } = fakeDataSource(committed);
    const note = noteDetail('2026-09-23T08:00:00.000Z');

    const saveHook = renderHook(() =>
      useNoteAutosave({ dataSource, userId: USER, workspaceId: WORKSPACE, noteId: NOTE, note }),
    );
    act(() => saveHook.result.current.onDraft(doc('typed')));
    expect(ingest, 'not sent yet — the 2 s timer has not fired').not.toHaveBeenCalled();
    await act(async () => {
      saveHook.result.current.onSave(doc('typed'));
      await Promise.resolve();
    });
    expect(ingest, 'onSave flushed without waiting for the timer').toHaveBeenCalledTimes(1);
    saveHook.unmount();

    // Second arm — a fresh hook instance, a pending draft, no onSave: unmount
    // alone flushes it.
    const { dataSource: ds2, ingest: ingest2 } = fakeDataSource(committed);
    const unmountHook = renderHook(() =>
      useNoteAutosave({ dataSource: ds2, userId: USER, workspaceId: WORKSPACE, noteId: NOTE, note }),
    );
    act(() => unmountHook.result.current.onDraft(doc('never blurred')));
    expect(ingest2).not.toHaveBeenCalled();
    unmountHook.unmount();
    expect(ingest2, 'unmount flushed the pending draft').toHaveBeenCalledTimes(1);
    const unmountEvent = ingest2.mock.calls[0]![0] as SubmittedEvent[];
    expect(unmountEvent[0]!.payload).toEqual({ body: doc('never blurred') });
  });

  /**
   * 18.207 — the ledger's answer decides what the draft and the indicator say.
   *
   * Mutation: remove the key regardless — the refused arm's `localStorage`
   * read comes back `null` too, same as the committed arm.
   */
  it('18.207 a rejected ingest keeps the draft and reports unsaved; a committed one removes it and reports saved', async () => {
    const note = noteDetail('2026-09-23T08:00:00.000Z');

    const { dataSource: refusedSource } = fakeDataSource(refused);
    const refusedHook = renderHook(() =>
      useNoteAutosave({ dataSource: refusedSource, userId: USER, workspaceId: WORKSPACE, noteId: NOTE, note }),
    );
    await act(async () => {
      refusedHook.result.current.onDraft(doc('will be refused'));
      refusedHook.result.current.onSave(doc('will be refused'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refusedHook.result.current.saveState).toBe('unsaved');
    expect(window.localStorage.getItem(draftKey(USER, NOTE))).not.toBeNull();

    // CONTROL — the same shape, a committed answer.
    window.localStorage.clear();
    const { dataSource: committedSource } = fakeDataSource(committed);
    const committedHook = renderHook(() =>
      useNoteAutosave({ dataSource: committedSource, userId: USER, workspaceId: WORKSPACE, noteId: NOTE, note }),
    );
    await act(async () => {
      committedHook.result.current.onDraft(doc('will be saved'));
      committedHook.result.current.onSave(doc('will be saved'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(committedHook.result.current.saveState).toBe('saved');
    expect(window.localStorage.getItem(draftKey(USER, NOTE))).toBeNull();
  });

  /**
   * Additional coverage beyond the plan's five named cases (advisor review,
   * same session): a SECOND `onDraft` arriving while the first flush is still
   * in flight. Not a numbered case — Task 6 already owns `18.210`–`18.212` in
   * this plan's allocation table, so this stays unminted rather than
   * colliding with it; fold into 18.207's own subject (what a settling
   * ingest does to the draft) instead.
   *
   * `flush` claims `pendingDocRef` before the `await`, which is what lets a
   * NEWER draft queue while an OLDER one is still being confirmed. Without
   * the guard this pins, a late-arriving `committed` for the OLD draft would
   * delete the key the NEW draft is relying on and report "Saved" for words
   * that were never sent.
   */
  it('a commit that lands for an OLD draft does not touch a NEWER one queued while it was in flight', async () => {
    let resolveFirst: ((value: IngestResult[]) => void) | null = null;
    const ingest = vi.fn((events: SubmittedEvent[]) => {
      if (resolveFirst === null) {
        return new Promise<IngestResult[]>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return committed();
    });
    const dataSource: DataSource = { ingest, query: {} as DataSource['query'], subscribe: vi.fn(() => () => {}) };
    const note = noteDetail('2026-09-23T08:00:00.000Z');
    const hook = renderHook(() =>
      useNoteAutosave({ dataSource, userId: USER, workspaceId: WORKSPACE, noteId: NOTE, note }),
    );

    // The OLD draft flushes and its ingest is left hanging.
    act(() => hook.result.current.onSave(doc('old draft')));
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(resolveFirst).not.toBeNull();

    // A NEWER draft queues while the old one is still in flight.
    act(() => hook.result.current.onDraft(doc('newer draft')));
    expect(window.localStorage.getItem(draftKey(USER, NOTE))).toContain('newer draft');

    // The OLD ingest now settles as committed.
    await act(async () => {
      resolveFirst!(
        await committed(),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // The newer draft's key survives, and the state is not falsely "saved".
    expect(window.localStorage.getItem(draftKey(USER, NOTE))).toContain('newer draft');
    expect(hook.result.current.saveState).not.toBe('saved');
  });

  /**
   * 18.208 — draft recovery on open, by AGE against `note.updatedAt`.
   *
   * Mutation: prefer the draft always — the control arm (a stale draft) would
   * also come back as `initialDoc` instead of being discarded.
   */
  it('18.208 a draft newer than note.updatedAt is offered as initialDoc with unsaved; an older draft is discarded', () => {
    const key = draftKey(USER, NOTE);

    // A note last saved at 08:00; a draft written at 09:00 is NEWER.
    window.localStorage.setItem(key, JSON.stringify({ doc: doc('newer draft'), at: Date.parse('2026-09-23T09:00:00.000Z') }));
    const { dataSource } = fakeDataSource(committed);
    const newerHook = renderHook(() =>
      useNoteAutosave({
        dataSource,
        userId: USER,
        workspaceId: WORKSPACE,
        noteId: NOTE,
        note: noteDetail('2026-09-23T08:00:00.000Z'),
      }),
    );
    expect(newerHook.result.current.initialDoc).toEqual(doc('newer draft'));
    expect(newerHook.result.current.saveState).toBe('unsaved');

    // CONTROL — a draft written BEFORE the note's own last save is stale and
    // is discarded: `initialDoc` is the note's own body, `saved`, and the key
    // is gone.
    window.localStorage.setItem(key, JSON.stringify({ doc: doc('stale draft'), at: Date.parse('2026-09-23T07:00:00.000Z') }));
    const { dataSource: ds2 } = fakeDataSource(committed);
    const staleHook = renderHook(() =>
      useNoteAutosave({
        dataSource: ds2,
        userId: USER,
        workspaceId: WORKSPACE,
        noteId: NOTE,
        note: noteDetail('2026-09-23T08:00:00.000Z'),
      }),
    );
    expect(staleHook.result.current.initialDoc).toEqual(doc('the server copy'));
    expect(staleHook.result.current.saveState).toBe('saved');
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  /**
   * 18.209 — a private window (or blocked site data) throws on the ACCESSOR,
   * not on the value, exactly the trap `use-last-project.ts` documents for its
   * own storage reads.
   *
   * Mutation: remove the `try/catch` — the hook throws out of its mount effect
   * and the test's `renderHook` call itself throws.
   */
  it('18.209 a throwing localStorage never throws out of the hook, and the editor still gets the note body', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    try {
      const { dataSource } = fakeDataSource(committed);
      let hook: ReturnType<typeof renderHook<ReturnType<typeof useNoteAutosave>, unknown>> | null = null;
      expect(() => {
        hook = renderHook(() =>
          useNoteAutosave({
            dataSource,
            userId: USER,
            workspaceId: WORKSPACE,
            noteId: NOTE,
            note: noteDetail('2026-09-23T08:00:00.000Z'),
          }),
        );
      }).not.toThrow();
      expect(hook!.result.current.initialDoc).toEqual(doc('the server copy'));
      expect(hook!.result.current.saveState).toBe('saved');
      // A draft write must not throw out of the callback either.
      expect(() => act(() => hook!.result.current.onDraft(doc('typed anyway')))).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe('9.426 restoredAt and discardDraft', () => {
  const hookFor = (note: NoteDetail, dataSource: DataSource) =>
    renderHook(() =>
      useNoteAutosave({ dataSource, userId: USER, workspaceId: WORKSPACE, noteId: NOTE, note }),
    );

  it('9.426 restoredAt is the recovered draft\'s time, and null for no draft or a stale one', () => {
    const { dataSource } = fakeDataSource(committed);
    const note = noteDetail('2026-09-23T08:00:00.000Z');
    expect(hookFor(note, dataSource).result.current.restoredAt).toBeNull();
    const newer = Date.parse('2026-09-23T09:00:00.000Z');
    window.localStorage.setItem(draftKey(USER, NOTE), JSON.stringify({ doc: doc('mine'), at: newer }));
    expect(hookFor(note, dataSource).result.current.restoredAt).toBe(newer);
    window.localStorage.setItem(
      draftKey(USER, NOTE),
      JSON.stringify({ doc: doc('old'), at: Date.parse('2026-09-23T07:00:00.000Z') }),
    );
    expect(hookFor(note, dataSource).result.current.restoredAt).toBeNull();
  });

  it('9.427 discardDraft deletes the key and cancels the pending write, so neither the timer nor the unmount flush saves the discarded words', async () => {
    const { dataSource, ingest } = fakeDataSource(committed);
    window.localStorage.setItem(
      draftKey(USER, NOTE),
      JSON.stringify({ doc: doc('mine'), at: Date.parse('2026-09-23T09:00:00.000Z') }),
    );
    const hook = hookFor(noteDetail('2026-09-23T08:00:00.000Z'), dataSource);
    // CONTROL: the recovered draft IS pending, so without the discard the unmount below would write it.
    expect(hook.result.current.saveState).toBe('unsaved');
    act(() => hook.result.current.discardDraft());
    expect(window.localStorage.getItem(draftKey(USER, NOTE))).toBeNull();
    expect(hook.result.current.saveState).toBe('saved');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    hook.unmount();
    expect(ingest).not.toHaveBeenCalled();
  });
});

describe('25.161 the draft write is coalesced with the autosave timer (smoothness T9; audit SM-07)', () => {
  /**
   * Five keystrokes inside the window used to be five synchronous `localStorage` writes (a JSON.stringify of the whole document
   * each). The draft is now written when a save is sent (the 2 s pause, a blur-save, `beforeunload`, unmount), before the
   * `ingest`, so a refused or unanswered save still leaves it behind (18.207) and a reload still recovers it.
   * Mutation: the `setItem` back in `onDraft` → five writes before the timer, red.
   */
  it('25.161 five onDraft calls write the draft ONCE, at the flush, before the ingest; CONTROL: beforeunload with a pending draft writes it too', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const order: string[] = [];
    setItem.mockImplementation(function (this: Storage, key: string, value: string) {
      order.push('write');
      return Object.getPrototypeOf(Storage.prototype).setItem?.call(this, key, value);
    });
    const { dataSource, ingest } = fakeDataSource((events) => {
      order.push('ingest');
      return committed();
    });
    const hook = renderHook(() =>
      useNoteAutosave({ dataSource, userId: USER, workspaceId: WORKSPACE, noteId: NOTE, note: noteDetail('2026-09-23T08:00:00.000Z') }),
    );
    for (const text of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      act(() => {
        hook.result.current.onDraft(doc(text));
        vi.advanceTimersByTime(200);
      });
    }
    expect(setItem).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0]![0]).toBe(draftKey(USER, NOTE));
    expect(String(setItem.mock.calls[0]![1])).toContain('abcde');
    expect(order).toEqual(['write', 'ingest']);

    // CONTROL: a tab closing inside the window flushes the pending draft, and the flush writes it first.
    setItem.mockClear();
    order.length = 0;
    act(() => hook.result.current.onDraft(doc('closing')));
    expect(setItem).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['write', 'ingest']);
    setItem.mockRestore();
  });
});
