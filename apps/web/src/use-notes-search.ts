import { useEffect, useMemo, useState } from 'react';
import type { DataSourceQuery, NoteSearchHit } from '@gisik-nokma/app-core';
// `NoteScopeMode` comes from the DOMAIN, not from `app-core`: that package
// re-exports its view types and this one is not among them — it is a domain
// scalar, and `app-core`'s `data-source.ts` imports it from the same place.
import type { NoteScopeMode } from '@gisik-nokma/domain';

/**
 * Note search as the screen drives it (spec §7.8, Plan 3 of 6).
 *
 * ## Two speeds, and the rule that makes them one list
 *
 * Spelling results are cheap enough to run on every keystroke, so they go after
 * a 100 ms debounce and REPLACE the list. Meaning results cost a model pass, so
 * they go 400 ms after typing stops, and they are APPENDED — never merged,
 * never sorted, never used to re-rank. That asymmetry is the whole design: a
 * list that rearranged itself while somebody was reading it would be a list
 * nobody could use, and the fast half is what a person is looking at when the
 * slow half arrives.
 *
 * ## The staleness rule is a COMPARISON, not a cancellation flag
 *
 * Every response is answered with "is this still the round I asked for?" — the
 * round being the text the list is currently about, held in state. A response
 * for a text the input has moved past is discarded in one line, and because the
 * comparison is against the CURRENT text rather than against a local `cancelled`
 * flag, it also covers the case a flag cannot: a response that arrives after the
 * effect that requested it has been cleaned up. (The timers are cleared on every
 * change as well; the comparison is what makes the promises safe.)
 *
 * ## `corrected` lives INSIDE the round, and that is not tidiness
 *
 * It is the same fact as the list — the correction is what THIS query's lexical
 * answer said — so it is decided by the same state update. Held separately, it
 * would need the same staleness comparison repeated in a second place, and the
 * two decisions drifting apart is exactly how a stale "showing results for …"
 * ends up on screen beside a fresh list. Here, a response for a superseded text
 * updates nothing at all.
 *
 * ## Meaning results are held until the lexical ones land — not defensively
 *
 * The spec's rule is "append to the DISPLAYED list". If the meaning response
 * arrived first — a 50 ms model call against a 600 ms database one is not
 * impossible — there would be no displayed list for the current text yet, and
 * appending to the PREVIOUS text's list would show a reader results for a query
 * they had already replaced. So both halves are stored per ROUND and the list is
 * derived from them: `mergeHits` returns nothing until the lexical half exists,
 * which is the honest answer — the fast half is the list, and the slow half can
 * only add to it.
 */

/** Spec §7.8's first debounce. */
export const LEXICAL_DEBOUNCE_MS = 100;

/** Spec §7.8's second — measured from the LAST change, not the first. */
export const MEANING_DEBOUNCE_MS = 400;

export type UseNotesSearchOptions = {
  authorId?: string;
  scopeMode?: NoteScopeMode;
};

export type NotesSearchState = {
  /** The text as typed. Named `query` for the screen's benefit; it is an input value. */
  query: string;
  setQuery: (next: string) => void;
  results: NoteSearchHit[];
  /** Present exactly when the current query's lexical response corrected it. */
  corrected: string[] | null;
  searching: boolean;
};

/** One query's answer. `lexical: null` means "this round has not answered yet". */
type Round = {
  text: string;
  lexical: NoteSearchHit[] | null;
  meaning: NoteSearchHit[] | null;
  corrected: string[] | null;
};

const EMPTY_ROUND: Round = { text: '', lexical: null, meaning: null, corrected: null };

/**
 * The displayed list: the lexical hits, then every meaning hit whose note is not
 * already there, in the order the server returned them.
 *
 * `[]` while the lexical half is outstanding. A meaning-only list would be a
 * list the current query has not produced yet, and showing it would also mean
 * that the arrival of the lexical response REPLACED rows the reader had already
 * started reading — the one thing this rule exists to prevent.
 */
function mergeHits(round: Round): NoteSearchHit[] {
  if (round.lexical === null) return [];
  const displayed = new Set(round.lexical.map((hit) => hit.noteId));
  return [...round.lexical, ...(round.meaning ?? []).filter((hit) => !displayed.has(hit.noteId))];
}

export function useNotesSearch(
  dataSource: DataSourceQuery,
  workspaceId: string,
  options: UseNotesSearchOptions = {},
): NotesSearchState {
  const [text, setText] = useState('');
  const [round, setRound] = useState<Round>(EMPTY_ROUND);

  const { authorId, scopeMode } = options;

  useEffect(() => {
    // A new round. Reset HERE rather than in `setQuery` so the reset is tied to
    // the text that is actually rendered — the text the responses are compared
    // against. It is also what clears `corrected`: a new round has none.
    setRound((current) => (current.text === text ? current : { text, lexical: null, meaning: null, corrected: null }));

    if (text === '') return;

    const forText = text;
    const filters = {
      ...(authorId === undefined ? {} : { authorId }),
      ...(scopeMode === undefined ? {} : { scopeMode }),
    };

    const lexicalTimer = setTimeout(() => {
      void dataSource
        .searchNotes(workspaceId, forText, { mode: 'lexical', ...filters })
        .then((answer) => {
          setRound((current) =>
            current.text === forText
              ? {
                  text: forText,
                  lexical: answer.notes,
                  meaning: current.meaning,
                  corrected: answer.corrected ?? null,
                }
              : current,
          );
        })
        .catch(() => {
          // Swallowed on purpose: a failed lexical call leaves the round
          // unresolved, so the list stays as it was and `searching` stays true.
          // The screen then shows that something is still expected rather than
          // an empty list, which would read as "the workspace has no matches".
        });
    }, LEXICAL_DEBOUNCE_MS);

    const meaningTimer = setTimeout(() => {
      void dataSource
        .searchNotes(workspaceId, forText, { mode: 'meaning', ...filters })
        .then((answer) => {
          setRound((current) =>
            current.text === forText ? { ...current, text: forText, meaning: answer.notes } : current,
          );
        })
        .catch(() => {});
    }, MEANING_DEBOUNCE_MS);

    return () => {
      clearTimeout(lexicalTimer);
      clearTimeout(meaningTimer);
    };
  }, [dataSource, workspaceId, text, authorId, scopeMode]);

  const results = useMemo(() => mergeHits(round), [round]);

  return {
    query: text,
    setQuery: setText,
    results,
    corrected: round.text === text ? round.corrected : null,
    // True from the moment the input changes until the round for the CURRENT
    // text has both halves. `round.text !== text` covers the render between a
    // keystroke and the effect that starts its round.
    searching: text !== '' && (round.text !== text || round.lexical === null || round.meaning === null),
  };
}
