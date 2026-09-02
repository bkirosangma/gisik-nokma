import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource } from '../data-source.js';
import type { UserPreferences } from '../view-types.js';

export type PreferencesResult = {
  /** `null` until the document has loaded — NOT an empty document. */
  document: UserPreferences | null;
  error: string | null;
  save: (next: UserPreferences) => void;
};


/**
 * The preferences document, loaded per workspace and written whole.
 *
 * ## Why this is NOT `useLiveQuery`, which every other read on this surface is
 *
 * Preferences are **server-owned per-user rows, not ledger events**
 * (coordination amendment 14). No frame on `/v1/stream` can ever carry a
 * preferences change, so routing this read through `useLiveQuery` subscribes it
 * to a signal that is definitionally unrelated to it: every ticket event in the
 * workspace debounce-refetches the document.
 *
 * That is not merely waste, and the harm is not hypothetical — it is
 * `use-live-query.ts`'s own recorded F6 (overlapping reloads on the SAME key
 * resolve last-one-wins) made REACHABLE by a write path:
 *
 *   1. a ticket event lands, the debounce fires a preferences GET;
 *   2. the user picks a grouping, `save` PUTs it, the server accepts;
 *   3. the GET from step 1 resolves, carrying the PRE-WRITE document;
 *   4. same query key, so nothing discards it — `setData` overwrites, and the
 *      grouping the user just chose snaps back to the old one on screen while
 *      the server holds the new one.
 *
 * The fix is to stop feeding this read from the stream rather than to add
 * ordering to `useLiveQuery`, because ordering there would still be answering a
 * question nobody asked — and stopping is the STRONGER guarantee, which is what
 * the tests measure. Stated at that strength on purpose:
 * `test/views/ticket-list.test.tsx` does NOT construct steps 1–4 above (its
 * stream frame arrives after the PUT has resolved); it measures that no
 * stream-triggered preferences read exists at all, which is what makes the
 * interleaving unreachable rather than merely ordered.
 *
 * ## There is deliberately no `reload` in the returned object
 *
 * An earlier shape returned one. Nothing called it, and offering it would have
 * put an unmeasured window in the public surface: a reload bumps the generation
 * and orphans whatever was in flight, but it does NOT clear `document` first, so
 * between the bump and the resolve `useTicketList` still reports
 * `canSetPrefs: true` and a `setPrefs` landing there merges into a document the
 * counter has already abandoned. The write does appear to win — `save` bumps
 * past the load — but that is an argument, not a measurement, and no test on
 * this branch constructs the sequence. An export whose safety has not been
 * measured is a liability, so it is not exported. The day a caller needs it, it
 * arrives with the test that pins the interleaving.
 *
 * ## The generation counter
 *
 * One counter orders loads against saves and against each other: whoever
 * started last is the only one allowed to write state. Without it the initial
 * load, begun before a `save`, can still land after it — step 3 again with a
 * different trigger.
 *
 * ## What is displayed after a successful save
 *
 * The document THIS CLIENT WROTE and the server accepted — not a re-read. A
 * re-read would be strictly more faithful (the server could normalise) and it
 * reopens the same ordering question one layer out; the shipped route answers
 * `400 invalid_preferences` for anything its `.strict()` schema will not take,
 * so a 200 means the document went in as sent. Recorded as the judgement it is.
 */
export function usePreferences(source: DataSource, workspaceId: string): PreferencesResult {
  const [document, setDocument] = useState<UserPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(() => {
    const generation = ++generationRef.current;
    source.query.getPreferences(workspaceId).then(
      (loaded) => {
        if (generationRef.current !== generation) return;
        setDocument(loaded);
        setError(null);
      },
      (cause: unknown) => {
        if (generationRef.current !== generation) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, [source, workspaceId]);

  useEffect(() => {
    // A new workspace clears the old answer before it asks. Between here and
    // the load resolving, `document` is null and every caller must treat that
    // as "not loaded" — writing during that window is what erases a document.
    setDocument(null);
    setError(null);
    load();
  }, [load]);

  const save = useCallback(
    (next: UserPreferences) => {
      const generation = ++generationRef.current;
      source.query.putPreferences(workspaceId, next).then(
        () => {
          if (generationRef.current !== generation) return;
          setDocument(next);
          setError(null);
        },
        (cause: unknown) => {
          if (generationRef.current !== generation) return;
          setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
    },
    [source, workspaceId],
  );

  return { document, error, save };
}
