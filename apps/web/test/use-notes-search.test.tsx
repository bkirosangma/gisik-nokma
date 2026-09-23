import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSourceQuery, NoteSearchHit } from '@gisik-nokma/app-core';
import { useNotesSearch } from '../src/use-notes-search.js';

/**
 * The client merge rule (spec §7.8, cases 18.155–18.159, Plan 3 of 6).
 *
 * ## What these cases are about, and what they are NOT
 *
 * Not one of them asks whether a note is relevant. The data source is a FAKE
 * that resolves promises the test holds open, so every assertion here is about
 * TIMING and ORDER — when a call is made, and what the list looks like when it
 * lands. That is the whole of the hook's job: the server decides what matches.
 *
 * ## The fake resolves in the order the test decides
 *
 * 18.157 and 18.156 both need a response to arrive AFTER a newer request was
 * made, which a mock that resolved on call would never produce. So each call
 * pushes a deferred and the test settles them by hand — `settle()` for "the
 * response to the request I just made", and the raw entries for anything more
 * precise.
 */
type Deferred = {
  resolve: (value: { notes: NoteSearchHit[]; corrected?: string[] }) => void;
  reject: (error: unknown) => void;
};

const calls: Array<{ text: string; mode: 'lexical' | 'meaning'; deferred: Deferred }> = [];

function fakeDataSource(): DataSourceQuery {
  const searchNotes = vi.fn(
    (_workspaceId: string, text: string, options: { mode: 'lexical' | 'meaning' }) =>
      new Promise<{ notes: NoteSearchHit[]; corrected?: string[] }>((resolve, reject) => {
        calls.push({ text, mode: options.mode, deferred: { resolve, reject } });
      }),
  );
  return { searchNotes } as unknown as DataSourceQuery;
}

function hit(noteId: string, source: 'lexical' | 'meaning' = 'lexical'): NoteSearchHit {
  return {
    noteId,
    title: noteId,
    snippet: noteId,
    homeProjectId: 'p',
    scopeMode: 'workspace',
    attachedTicketKeys: [],
    authorId: 'u',
    updatedAt: '2026-09-23T09:00:00.000Z',
    source,
  };
}

/** The last call made, asserted to be the one the test expected to be waiting. */
function pending(mode: 'lexical' | 'meaning'): Deferred {
  const found = [...calls].reverse().find((call) => call.mode === mode);
  if (found === undefined) throw new Error(`no ${mode} call was made`);
  return found.deferred;
}

/** Settle the most recent call of a mode, inside `act` so React flushes. */
async function settle(mode: 'lexical' | 'meaning', notes: NoteSearchHit[], corrected?: string[]): Promise<void> {
  await act(async () => {
    pending(mode).resolve(corrected === undefined ? { notes } : { notes, corrected });
    await Promise.resolve();
  });
}

/**
 * The hook under test, in a hook harness.
 *
 * NOT named `render`: that name belongs to `@testing-library/react`'s element
 * renderer, which this file also needs for 18.159b's per-render probe, and a
 * local declaration of it shadows the import — MEASURED, as every case in this
 * file failing with "Objects are not valid as a React child (found: object with
 * keys {searchNotes})", because the harness was handed a data source where React
 * expected an element.
 */
function searchHook(query: DataSourceQuery) {
  return renderHook(() => useNotesSearch(query, 'ws'));
}

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('18.155–18.159 useNotesSearch', () => {
  /**
   * 18.155 — typing fast makes ONE call.
   *
   * Mutation: no debounce.
   */
  it('18.155 — typing c, co, col within 100 ms makes one lexical call, with the last value', async () => {
    const hook = searchHook(fakeDataSource());

    act(() => {
      hook.result.current.setQuery('c');
    });
    act(() => {
      vi.advanceTimersByTime(40);
      hook.result.current.setQuery('co');
    });
    act(() => {
      vi.advanceTimersByTime(40);
      hook.result.current.setQuery('col');
    });
    expect(calls, 'nothing has been sent yet — the debounce is pending').toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const lexical = calls.filter((call) => call.mode === 'lexical');
    expect(lexical.map((call) => call.text), 'ONE call, with the value that survived').toEqual(['col']);
  });

  /**
   * 18.156 — the merge, in the order the spec states it.
   *
   * Mutation: rerank by meaning order.
   */
  it('18.156 — lexical [A,B] then meaning [B,C,A] displays [A,B,C], never reordered', async () => {
    const hook = searchHook(fakeDataSource());
    act(() => {
      hook.result.current.setQuery('cold room');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await settle('lexical', [hit('A'), hit('B')]);
    expect(hook.result.current.results.map((entry) => entry.noteId), 'control: lexical alone is [A,B]').toEqual([
      'A',
      'B',
    ]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await settle('meaning', [hit('B', 'meaning'), hit('C', 'meaning'), hit('A', 'meaning')]);

    expect(
      hook.result.current.results.map((entry) => entry.noteId),
      'B is already displayed and is not moved or duplicated; C is appended; A is not re-appended',
    ).toEqual(['A', 'B', 'C']);
    expect(hook.result.current.results.map((entry) => entry.source), 'the label travels with the row').toEqual([
      'lexical',
      'lexical',
      'meaning',
    ]);
  });

  /**
   * 18.157 — a stale response is DISCARDED.
   *
   * Mutation: apply it.
   */
  it('18.157 — a meaning response for an older query is discarded', async () => {
    const hook = searchHook(fakeDataSource());
    act(() => {
      hook.result.current.setQuery('first query');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await settle('lexical', [hit('OLD')]);

    // The meaning call for `first query` is in flight…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(calls.filter((call) => call.mode === 'meaning')).toHaveLength(1);

    // …and the person types again before it lands.
    act(() => {
      hook.result.current.setQuery('second query');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await settle('lexical', [hit('NEW')]);

    // Now the OLD meaning response arrives.
    await act(async () => {
      pending('meaning').resolve({ notes: [hit('OLD', 'meaning'), hit('STALE', 'meaning')] });
      await Promise.resolve();
    });

    expect(
      hook.result.current.results.map((entry) => entry.noteId),
      'the stale response neither replaces nor appends',
    ).toEqual(['NEW']);
  });

  /**
   * 18.158 — the meaning call fires at 400 ms, and a change resets the timer.
   *
   * Mutation: fire at 100 ms.
   */
  it('18.158 — the meaning call waits 400 ms after the last change, and a change at 300 ms resets it', async () => {
    const hook = searchHook(fakeDataSource());
    act(() => {
      hook.result.current.setQuery('q');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(calls.filter((call) => call.mode === 'meaning'), 'not yet').toHaveLength(0);
    expect(calls.filter((call) => call.mode === 'lexical'), 'the lexical call went at 100 ms').toHaveLength(1);

    // A change at 300 ms — the case the plan names — restarts the meaning
    // timer, so the 400 ms window runs from HERE and not from the first
    // keystroke.
    act(() => {
      hook.result.current.setQuery('qq');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(calls.filter((call) => call.mode === 'meaning'), 'the change pushed it back').toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const meaning = calls.filter((call) => call.mode === 'meaning');
    expect(meaning, 'and it fires 400 ms after the LAST change').toHaveLength(1);
    expect(meaning[0]?.text).toBe('qq');
  });

  /**
   * 18.159 — `corrected` is exposed and cleared.
   *
   * Mutation: keep the old value.
   */
  it('18.159 — corrected from the lexical response is exposed, and cleared on the next query', async () => {
    const hook = searchHook(fakeDataSource());
    act(() => {
      hook.result.current.setQuery('compresor');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await settle('lexical', [hit('A')], ['compressor']);

    expect(hook.result.current.corrected).toEqual(['compressor']);

    act(() => {
      hook.result.current.setQuery('compressor');
    });
    expect(hook.result.current.corrected, 'cleared the moment the input changes').toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await settle('lexical', [hit('A')]);
    expect(hook.result.current.corrected, 'and a response with no correction leaves it null').toBeNull();
  });

  /**
   * 18.159, SECOND HALF — and it exists because the first half does not kill
   * its named mutation.
   *
   * Measured: `corrected: round.corrected` (the comparison dropped) passed every
   * other case in this file. The reason is that the ROUND RESET also clears the
   * correction — in an effect, which runs after the render that carries the new
   * text. So the comparison's only effect is on THAT paint: without it, there is
   * one frame in which the new query sits on screen beside the previous query's
   * "showing results for …". `act()` flushes that frame away before any settled
   * assertion can see it, so the assertion has to be made on every RENDER.
   *
   * The probe records each render rather than the settled state, which is what
   * makes a one-paint defect observable at all. It is the same instrument the
   * `document-title` cases use for the same reason: a value that exists for one
   * frame is invisible to a probe that only looks at the end.
   */
  it('18.159b — no render shows the new query beside the previous query’s correction', async () => {
    const rendered: Array<{ text: string; corrected: string[] | null }> = [];
    function Probe({ source }: { source: DataSourceQuery }) {
      const state = useNotesSearch(source, 'ws');
      // A side effect in render, which a PRODUCTION component must not do and a
      // test instrument must: the whole point is to see a value that exists
      // only during a render.
      rendered.push({ text: state.query, corrected: state.corrected });
      return (
        <div>
          <button type="button" onClick={() => state.setQuery('first query')}>
            first
          </button>
          <button type="button" onClick={() => state.setQuery('second query')}>
            second
          </button>
        </div>
      );
    }

    const source = fakeDataSource();
    const view = render(<Probe source={source} />);

    fireEvent.click(view.getByText('first'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await settle('lexical', [hit('A')], ['compressor']);
    expect(rendered.at(-1)?.corrected, 'control: the correction IS shown for its own query').toEqual(['compressor']);

    rendered.length = 0;
    fireEvent.click(view.getByText('second'));

    const offending = rendered.filter((entry) => entry.text === 'second query' && entry.corrected !== null);
    expect(
      offending,
      'the previous query’s correction must not appear on any paint of the new query',
    ).toEqual([]);
    // Control on the instrument: the render that carries the new text really
    // was recorded, so an empty `offending` is absence and not an empty log.
    expect(rendered.some((entry) => entry.text === 'second query')).toBe(true);
  });

  /**
   * The empty query, which the plan's Interface block names and no numbered case
   * owns: no calls at all, and an empty list.
   */
  it('an empty query makes no calls and displays nothing', async () => {
    const hook = searchHook(fakeDataSource());
    act(() => {
      hook.result.current.setQuery('cold');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await settle('lexical', [hit('A')]);
    expect(hook.result.current.results).toHaveLength(1);

    act(() => {
      hook.result.current.setQuery('');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(calls.filter((call) => call.text === ''), 'no call is made for the empty query').toEqual([]);
    expect(hook.result.current.results).toEqual([]);
    expect(hook.result.current.searching).toBe(false);
  });
});
