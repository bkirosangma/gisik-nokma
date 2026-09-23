import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { newUlid, type NoteSummary } from '@gisik-nokma/domain';
import type { DataSource } from '../data-source.js';
import type { MakeSubmitted } from '../submit.js';

export type AttachNotePickerProps = {
  dataSource: DataSource;
  workspaceId: string;
  ticketId: string;
  /** The ticket's own project — the New-note row's home (spec §10.3). */
  projectId: string;
  attachedIds: string[];
  make: MakeSubmitted;
  onAttached: () => void;
  onCreated: (noteId: string) => void;
  onRefusal: (refusal: { rule: string; reason: string }) => void;
};

/** The two note sources reduced to what a row needs to draw and to attach. */
type Candidate = { noteId: string; title: string; homeProjectId: string };

const CANDIDATE_CAP = 8;
const SEARCH_MIN_CHARS = 3;

function toCandidate(note: { noteId: string; title: string; homeProjectId: string }): Candidate {
  return { noteId: note.noteId, title: note.title, homeProjectId: note.homeProjectId };
}

/**
 * The popover over `getNotes`, plus a lexical `searchNotes` fallback once
 * typing outruns the local list, plus a "New note: <text>" row that writes
 * `note.created` itself — the sheet's own attach-and-create surface (spec
 * §10.3). The replica's `searchNotes` rejects with `ReplicaGapError`; that
 * is caught here and the local list stands, with a status line rather than a
 * crash.
 */
export function AttachNotePicker({
  dataSource,
  workspaceId,
  ticketId,
  projectId,
  attachedIds,
  make,
  onAttached,
  onCreated,
  onRefusal,
}: AttachNotePickerProps) {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [text, setText] = useState('');
  const [searchHits, setSearchHits] = useState<Candidate[]>([]);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [createRefusal, setCreateRefusal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void dataSource.query.getNotes(workspaceId).then((result) => {
      if (!cancelled) setNotes(result);
    });
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId]);

  const trimmed = text.trim();
  const localCandidates: Candidate[] = (notes ?? [])
    .filter((n) => !attachedIds.includes(n.noteId))
    .filter((n) => n.title.toLowerCase().includes(trimmed.toLowerCase()))
    .slice(0, CANDIDATE_CAP)
    .map(toCandidate);

  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_CHARS || localCandidates.length >= CANDIDATE_CAP) {
      setSearchHits([]);
      setSearchUnavailable(false);
      return;
    }
    let cancelled = false;
    void dataSource.query.searchNotes(workspaceId, trimmed, { mode: 'lexical' }).then(
      (result) => {
        if (cancelled) return;
        setSearchHits(
          result.notes.filter((hit) => !attachedIds.includes(hit.noteId)).map((hit) => toCandidate(hit)),
        );
        setSearchUnavailable(false);
      },
      () => {
        if (cancelled) return;
        setSearchHits([]);
        setSearchUnavailable(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `localCandidates` is derived fresh every render; its length is read, not the array identity.
  }, [dataSource, workspaceId, trimmed]);

  const merged: Candidate[] = [...localCandidates];
  const seen = new Set(merged.map((c) => c.noteId));
  for (const hit of searchHits) {
    if (!seen.has(hit.noteId)) {
      merged.push(hit);
      seen.add(hit.noteId);
    }
  }

  async function chooseExisting(candidate: Candidate): Promise<void> {
    const event = make({
      workspaceId,
      entity: { kind: 'note', id: candidate.noteId },
      type: 'note.attached',
      payload: { ticketId },
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      onRefusal({ rule: 'transport', reason: 'The server did not answer this change.' });
      return;
    }
    if (result.status === 'committed') {
      onAttached();
      return;
    }
    if (result.status === 'refused') onRefusal({ rule: result.rule, reason: result.reason });
    else onRefusal({ rule: result.code, reason: result.message });
  }

  async function chooseNew(): Promise<void> {
    if (trimmed === '') return;
    const event = make({
      workspaceId,
      entity: { kind: 'note', id: newUlid() },
      type: 'note.created',
      payload: { title: trimmed, homeProjectId: projectId, scope: { mode: 'inherit' }, attachTicketId: ticketId },
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      onRefusal({ rule: 'transport', reason: 'The server did not answer this change.' });
      return;
    }
    if (result.status === 'committed') {
      setCreateRefusal(null);
      onCreated(event.entity.id);
      return;
    }
    const refusal =
      result.status === 'refused' ? { rule: result.rule, reason: result.reason } : { rule: result.code, reason: result.message };
    onRefusal(refusal);
    setCreateRefusal(refusal.reason);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const rowCount = merged.length + 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rowCount - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      if (activeIndex < 0) return;
      event.preventDefault();
      if (activeIndex === merged.length) void chooseNew();
      else {
        const candidate = merged[activeIndex];
        if (candidate !== undefined) void chooseExisting(candidate);
      }
    }
  }

  return (
    <div className="gn-attach-note-picker">
      <input
        type="text"
        aria-label="Find a note"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {searchUnavailable ? <p className="gn-attach-note-picker__status">Search needs a connection</p> : null}
      {createRefusal !== null ? (
        <p className="gn-attach-note-picker__refusal" role="alert">
          {createRefusal}
        </p>
      ) : null}
      <div role="listbox" aria-label="Notes" className="gn-attach-note-picker__list">
        {merged.map((candidate, index) => (
          <button
            key={candidate.noteId}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onClick={() => void chooseExisting(candidate)}
          >
            {`${candidate.title} · ${candidate.homeProjectId}`}
          </button>
        ))}
        <button
          type="button"
          role="option"
          aria-selected={merged.length === activeIndex}
          disabled={trimmed === ''}
          onClick={() => void chooseNew()}
        >
          {`New note: ${text}`}
        </button>
      </div>
    </div>
  );
}
