import { useEffect, useId, useRef, useState } from 'react';
import {
  LINK_LABEL_MAX,
  linkReading,
  normaliseLinkLabel,
  type IngestResult,
  type SubmittedEvent,
  type TicketLinkKind,
} from '@gisik-nokma/domain';
import { REFUSALS, labelDuplicateRefusal } from '@gisik-nokma/rule-engine';
import { Dialog, Popover, Select, Toast } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import type { PrecheckResult } from '../precheck.js';
import type { MakeSubmitted } from '../submit.js';
import type { TicketLinkView } from '../view-types.js';
import type { LiveQueryResult } from './use-live-query.js';
import { usePhoneBoard } from './use-phone-board.js';

type Choice = 'blocks' | 'blocked-by' | 'relates' | 'duplicates' | 'duplicated-by' | 'leads-to' | 'comes-after';

/**
 * The seven readings the Add control offers, from THIS ticket. `onOther` says whose stream the event rides:
 * a link is stored on its SOURCE's stream (spec A §2.2), so "Is blocked by" is filed by the other ticket
 * with `targetId` = this one. The permission gate is symmetric (both ends visible), so it is the same right.
 */
const CHOICES: { value: Choice; label: string; kind: TicketLinkKind; onOther: boolean }[] = [
  { value: 'blocks', label: 'Blocks', kind: 'blocks', onOther: false },
  { value: 'blocked-by', label: 'Is blocked by', kind: 'blocks', onOther: true },
  { value: 'relates', label: 'Relates to', kind: 'relates', onOther: false },
  { value: 'duplicates', label: 'Duplicates', kind: 'duplicates', onOther: false },
  { value: 'duplicated-by', label: 'Is duplicated by', kind: 'duplicates', onOther: true },
  { value: 'leads-to', label: 'Leads to', kind: 'leads_to', onOther: false },
  { value: 'comes-after', label: 'Comes after', kind: 'leads_to', onOther: true },
];

/** The reading a row shows from THIS ticket, which is also its group heading (spec A §3.1). */
const readingOf = (l: { kind: TicketLinkKind; direction: 'out' | 'in' }): string => linkReading(l.kind, l.direction);
const GROUP_ORDER = ['blocks', 'is blocked by', 'relates to', 'duplicates', 'is duplicated by', 'leads to', 'comes after'];
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Only `leads_to` carries a branch label (workflow-timeline-graphs LK-2), so the picker asks for one on these two. */
const isLeads = (c: Choice): boolean => c === 'leads-to' || c === 'comes-after';
/** "leads to GN-147 (Yes)": a link as Remove and the toasts name it. A label-free link reads exactly as before. */
const withLabel = (reading: string, key: string, label: string | undefined): string =>
  `${reading} ${key}${label === undefined ? '' : ` (${label})`}`;
/** One identity per row: a stored source holds at most one link of a kind per target (LK-3.2). */
const rowKey = (l: TicketLinkView): string => `${l.kind}:${l.direction}:${l.ticket.id}`;

/** The sentence for an answer that did not commit; `undefined` is a server that answered nothing for the event. */
function reasonOf(result: Exclude<IngestResult, { status: 'committed' }> | undefined): string {
  if (result === undefined) return 'The server did not answer this change.';
  return result.status === 'refused' ? result.reason : result.message;
}

type TicketHit = { ticketId: string; projectId: string; key: string; title: string };

export type TicketLinksSectionProps = {
  dataSource: DataSource;
  workspaceId: string;
  ticketId: string;
  canEdit: boolean;
  make: MakeSubmitted;
  /** Drafts T8 (planner ruling A): this sheet is a draft's, so a link stored on the OTHER ticket is filed here. */
  isDraft: boolean;
  /** THIS ticket is a Decision (`typeId === DECISION_TYPE_ID`): each of its "Leads to" branches needs its own label (LK-3.3). */
  isDecision: boolean;
  /** The `<ticketId>:links` live query, lifted to `TicketSheet` the way the notes query is. */
  links: LiveQueryResult<TicketLinkView[]>;
  queryTickets?: (query: string) => Promise<TicketHit[]>;
  resolveTicketHref?: (ref: { ticketId: string; projectId: string }) => string | null;
  onNavigate?: (href: string) => void;
  precheck?: (event: SubmittedEvent) => Promise<PrecheckResult>;
};

/**
 * The event a choice or a row files, on the STORED source's stream (spec A §2.2) — except on a draft's sheet, where a
 * link whose stored source is the OTHER ticket is filed on THIS draft's stream with `from` (planner ruling A, spec
 * R42): no public stream names a draft (owner ruling O1). A draft's outgoing link is on its own stream already.
 * `label` is a `leads_to` branch name; only an add passes one (it is a member of `ticket.link_added` alone, 29.120),
 * and the payload has no `label` key at all without it.
 */
function eventFor(
  make: MakeSubmitted,
  workspaceId: string,
  thisId: string,
  otherId: string,
  kind: TicketLinkKind,
  onOther: boolean,
  type: 'ticket.link_added' | 'ticket.link_removed',
  isDraft: boolean,
  label?: string,
): SubmittedEvent {
  const labelled = label === undefined ? {} : { label };
  if (isDraft && onOther) {
    return make({ workspaceId, entity: { kind: 'ticket', id: thisId }, type, payload: { kind, targetId: thisId, from: otherId, ...labelled } });
  }
  const [source, target] = onOther ? [otherId, thisId] : [thisId, otherId];
  return make({ workspaceId, entity: { kind: 'ticket', id: source }, type, payload: { kind, targetId: target, ...labelled } });
}

/**
 * "Links" on the ticket sheet (typed links, spec A §3.1): the tickets this one blocks, is blocked by, relates
 * to, duplicates, leads to and comes after, grouped by their reading from here. Add is optimistic (a busy row in
 * its group until the server answers); Remove shows a Toast with Undo, as the Notes section does. The picker is a
 * Popover on a desktop and a bottom-sheet Dialog on a phone. A `leads_to` row shows its branch label as a chip and
 * offers Edit label (workflow-timeline-graphs LK-4, `relabel`).
 */
export function TicketLinksSection({
  dataSource,
  workspaceId,
  ticketId,
  canEdit,
  make,
  isDraft,
  isDecision,
  links,
  queryTickets,
  resolveTicketHref,
  onNavigate,
  precheck,
}: TicketLinksSectionProps) {
  const phone = usePhoneBoard();
  const addRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(new Set<string>());
  const requestCounter = useRef(0);
  const awaitingReload = useRef(false);
  const [pending, setPending] = useState<TicketLinkView | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // `undo` is a closure, not one event: a relabel's Undo is a remove+add pair (`relabel`).
  const [toast, setToast] = useState<{ message: string; undo: (() => Promise<void>) | null } | null>(null);
  const [choice, setChoice] = useState<Choice>('blocks');
  const [linkLabel, setLinkLabel] = useState('');
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const hintId = useId();
  /** The Edit label button that opened the form: closing the form gives it focus back, so the keyboard keeps its place. */
  const editReturn = useRef<HTMLButtonElement | null>(null);
  const editingOpen = editing !== null;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TicketHit[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // A committed Add's busy row hands over to the reloaded one: clear it when the reload's answer lands.
  useEffect(() => {
    if (!awaitingReload.current) return;
    awaitingReload.current = false;
    setPending(null);
  }, [links.data]);

  useEffect(() => {
    if (editingOpen) return;
    if (editReturn.current?.isConnected) editReturn.current.focus();
    editReturn.current = null;
  }, [editingOpen]);

  /** Files one event, once per key while it is in flight (a ref: two clicks in one tick see the same state). */
  async function file(event: SubmittedEvent, key: string): Promise<boolean> {
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    try {
      if (precheck !== undefined) {
        const verdict = await precheck(event);
        if (verdict.kind === 'refused') {
          setRefusal(verdict.reason);
          setPending(null);
          return false;
        }
      }
      const result = (await dataSource.ingest([event]))[0];
      if (result?.status === 'committed') {
        awaitingReload.current = true;
        links.reload();
        return true;
      }
      setRefusal(reasonOf(result));
      setPending(null);
      return false;
    } finally {
      inFlight.current.delete(key);
    }
  }

  async function search(q: string): Promise<void> {
    setQuery(q);
    const request = ++requestCounter.current;
    const hits = (await queryTickets?.(q)) ?? [];
    if (request === requestCounter.current) setResults(hits);
  }

  async function add(hit: TicketHit): Promise<void> {
    const picked = CHOICES.find((c) => c.value === choice) ?? CHOICES[0]!;
    // A label typed under a leads-to kind is never sent once another kind is chosen; only spaces name nothing.
    const typed = linkLabel.trim();
    const branch = isLeads(picked.value) && typed !== '' ? typed : undefined;
    setPickerOpen(false);
    setRefusal(null);
    const optimistic: TicketLinkView = {
      kind: picked.kind,
      direction: picked.onOther ? 'in' : 'out',
      ticket: { id: hit.ticketId, projectId: hit.projectId, key: hit.key, title: hit.title, stateCategory: 'open' },
      ...(branch === undefined ? {} : { label: branch }),
    };
    setPending(optimistic);
    const event = eventFor(make, workspaceId, ticketId, hit.ticketId, picked.kind, picked.onOther, 'ticket.link_added', isDraft, branch);
    setLinkLabel('');
    if (await file(event, `link_added:${picked.kind}:${hit.ticketId}`)) {
      setToast({ message: `Linked: ${withLabel(readingOf(optimistic), hit.key, branch)}`, undo: null });
    }
  }

  async function remove(l: TicketLinkView): Promise<void> {
    setRefusal(null);
    const onOther = l.direction === 'in';
    const event = eventFor(make, workspaceId, ticketId, l.ticket.id, l.kind, onOther, 'ticket.link_removed', isDraft);
    if (await file(event, `link_removed:${l.kind}:${l.ticket.id}`)) {
      // The Undo is built now, at click time, and filed through the same guard; it puts the label back.
      const undo = eventFor(make, workspaceId, ticketId, l.ticket.id, l.kind, onOther, 'ticket.link_added', isDraft, l.label);
      setToast({ message: `Removed link: ${withLabel(readingOf(l), l.ticket.key ?? l.ticket.title, l.label)}`, undo: () => undoRemove(undo) });
    }
  }

  async function undoRemove(undo: SubmittedEvent): Promise<void> {
    const { targetId: target, from } = undo.payload as { targetId: string; from?: string };
    // A draft-side undo names the other ticket in `from` (its stream and target are both this draft).
    const other = from ?? (undo.entity.id === ticketId ? target : undo.entity.id);
    const kind = (undo.payload as { kind: TicketLinkKind }).kind;
    if (await file(undo, `link_added:${kind}:${other}`)) setToast(null);
  }

  /**
   * Edit label (workflow-timeline-graphs LK-4): `[link_removed, link_added]` in ONE `ingest` call, on the stored
   * source's stream (a draft's sheet: the from-form on the draft's, through `eventFor`). LK-4 calls it one batch, but
   * `ingestBatch` commits each event on its own and never rolls back a neighbour (`ingest-service.ts:56-58`), so an
   * add refused after its removal committed is COMPENSATED: the old link is filed again and the branch is never lost.
   * A Decision's own branches are checked here first, with the engine's sentences (LK-3.3), so a clash sends nothing.
   * The client precheck is not used: the cache still holds the pair, so it would answer `link.duplicate`.
   * Resolves true when the new label committed.
   */
  async function relabel(row: TicketLinkView, next: string): Promise<boolean> {
    const clean = next.trim();
    if (clean === (row.label ?? '').trim()) {
      setEditing(null); // nothing changed: send nothing
      return false;
    }
    const outgoing = row.direction === 'out';
    if (outgoing && isDecision && clean === '') {
      setRefusal(REFUSALS['link.label-required']);
      return false;
    }
    // The row is not its own sibling: compared by target, because an Undo passes a rebuilt row, not the loaded one.
    const wanted = normaliseLinkLabel(clean);
    const clash =
      outgoing &&
      isDecision &&
      (links.data ?? []).some((o) => o.direction === 'out' && o.ticket.id !== row.ticket.id && normaliseLinkLabel(o.label ?? '') === wanted);
    if (clash) {
      setRefusal(labelDuplicateRefusal(clean));
      return false;
    }
    const guard = `relabel:${row.ticket.id}:${row.direction}`;
    if (inFlight.current.has(guard)) return false;
    inFlight.current.add(guard);
    try {
      const mk = (type: 'ticket.link_added' | 'ticket.link_removed', label?: string): SubmittedEvent =>
        eventFor(make, workspaceId, ticketId, row.ticket.id, 'leads_to', !outgoing, type, isDraft, label);
      const [removed, added] = await dataSource.ingest([mk('ticket.link_removed'), mk('ticket.link_added', clean === '' ? undefined : clean)]);
      if (removed?.status !== 'committed') {
        setRefusal(reasonOf(removed)); // nothing changed
        return false;
      }
      if (added?.status !== 'committed') {
        await dataSource.ingest([mk('ticket.link_added', row.label)]); // compensate: the branch comes back as it was
        setRefusal(reasonOf(added));
        links.reload();
        return false;
      }
      setEditing(null);
      setRefusal(null);
      links.reload();
      return true;
    } finally {
      inFlight.current.delete(guard);
    }
  }

  /** Save in the relabel form: on a commit, a toast whose Undo relabels back the same way and then takes itself down. */
  async function saveLabel(row: TicketLinkView, next: string): Promise<void> {
    if (!(await relabel(row, next))) return;
    const clean = next.trim();
    const now = clean === '' ? undefined : clean;
    const relabelled: TicketLinkView = { kind: row.kind, direction: row.direction, ticket: row.ticket, ...(now === undefined ? {} : { label: now }) };
    setToast({
      message: `Relabelled: ${withLabel(readingOf(row), row.ticket.key ?? row.ticket.title, now)}`,
      undo: async () => {
        if (await relabel(relabelled, row.label ?? '')) setToast(null);
      },
    });
  }

  const loaded = links.data ?? [];
  const alreadyShown =
    pending !== null && loaded.some((l) => l.kind === pending.kind && l.direction === pending.direction && l.ticket.id === pending.ticket.id);
  const rows = [...loaded, ...(pending !== null && !alreadyShown ? [pending] : [])];
  const failed = links.error !== null;
  const heading = failed || links.data === null ? 'Links' : `Links (${loaded.length})`;
  const groups = GROUP_ORDER.map((reading) => ({ reading, rows: rows.filter((l) => readingOf(l) === reading) })).filter((g) => g.rows.length > 0);
  // Only a Decision's OWN branch must be named here; "Comes after" names the other ticket's branch, which the engine judges.
  const labelNeeded = isDecision && choice === 'leads-to';
  const unnamed = labelNeeded && linkLabel.trim() === '';

  const picker = (
    <div className="gn-ticket-sheet__link-picker">
      <Select
        aria-label="Link type"
        value={choice}
        onChange={(v) => setChoice(v as Choice)}
        options={CHOICES.map(({ value, label }) => ({ value, label }))}
      />
      {isLeads(choice) ? (
        <>
          <input
            type="text"
            aria-label="Link label"
            aria-describedby={hintId}
            className="gn-field__input"
            maxLength={LINK_LABEL_MAX}
            placeholder="For example Yes or No"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
          />
          <p id={hintId} className="gn-ticket-sheet__link-hint">
            {labelNeeded
              ? 'Required: name this branch, for example Yes or No.'
              : choice === 'comes-after'
                ? 'Optional. Required when the other ticket is a Decision.'
                : 'Optional.'}
          </p>
        </>
      ) : null}
      <input
        type="search"
        aria-label="Find a ticket"
        className="gn-field__input"
        value={query}
        onChange={(e) => void search(e.target.value)}
      />
      <ul role="listbox" aria-label="Tickets" className="gn-ticket-sheet__link-results">
        {results
          .filter((r) => r.ticketId !== ticketId)
          .map((r) => (
            <li key={r.ticketId} role="option" aria-selected={false}>
              <button type="button" className="gn-ticket-sheet__link-result" disabled={unnamed} onClick={() => void add(r)}>
                {`${r.key} ${r.title}`}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );

  return (
    <section className="gn-ticket-sheet__links" data-testid="ticket-links">
      <h3 className="gn-ticket-sheet__caption">{heading}</h3>
      {failed ? (
        <p className="gn-ticket-sheet__notes-error" role="alert">
          {`This ticket's links could not be read: ${links.error}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
        </p>
      ) : links.settled && rows.length === 0 ? (
        <p className="gn-ticket-sheet__links-empty">No links yet.</p>
      ) : (
        groups.map((group) => (
          <section key={group.reading} aria-label={cap(group.reading)} className="gn-ticket-sheet__link-group">
            <h4 className="gn-ticket-sheet__link-group-title">{cap(group.reading)}</h4>
            <ul className="gn-ticket-sheet__link-list">
              {group.rows.map((l) => {
                const href = resolveTicketHref?.({ ticketId: l.ticket.id, projectId: l.ticket.projectId }) ?? null;
                const busy = l === pending;
                const label = l.ticket.key ?? l.ticket.title;
                const key = rowKey(l);
                const form = editing?.key === key ? editing : null;
                return (
                  <li key={key} className="gn-ticket-sheet__link-row" aria-busy={busy}>
                    <span className={`gn-ticket-sheet__link-dot gn-ticket-sheet__link-dot--${l.ticket.stateCategory}`} aria-hidden="true" />
                    {href === null ? (
                      <span className="gn-ticket-sheet__link-key">{l.ticket.key ?? ''}</span>
                    ) : (
                      <a
                        href={href}
                        className="gn-ticket-sheet__link-key"
                        onClick={(e) => {
                          if (onNavigate === undefined) return;
                          e.preventDefault();
                          onNavigate(href);
                        }}
                      >
                        {label}
                      </a>
                    )}
                    <span className="gn-ticket-sheet__link-title">{l.ticket.title}</span>
                    {l.label === undefined ? null : <span className="gn-chip gn-ticket-sheet__link-label">{l.label}</span>}
                    {canEdit && !busy && l.kind === 'leads_to' ? (
                      <button
                        type="button"
                        className="gn-button gn-button--ghost gn-ticket-sheet__link-edit"
                        aria-label={`Edit label: ${group.reading} ${label}`}
                        onClick={(e) => {
                          editReturn.current = e.currentTarget;
                          setEditing({ key, value: l.label ?? '' });
                        }}
                      >
                        Edit label
                      </button>
                    ) : null}
                    {canEdit && !busy ? (
                      <button
                        type="button"
                        className="gn-button gn-button--ghost gn-ticket-sheet__link-remove"
                        aria-label={`Remove: ${withLabel(group.reading, label, l.label)}`}
                        onClick={() => void remove(l)}
                      >
                        Remove
                      </button>
                    ) : null}
                    {form === null ? null : (
                      <form
                        className="gn-ticket-sheet__link-relabel"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveLabel(l, form.value);
                        }}
                      >
                        <input
                          type="text"
                          className="gn-field__input gn-ticket-sheet__link-relabel-input"
                          aria-label="New label"
                          maxLength={LINK_LABEL_MAX}
                          value={form.value}
                          autoFocus
                          onChange={(e) => setEditing({ key, value: e.target.value })}
                        />
                        <button type="submit" className="gn-button gn-button--ghost">
                          Save
                        </button>
                        <button type="button" className="gn-button gn-button--ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {canEdit ? (
        <button
          ref={addRef}
          type="button"
          className="gn-button gn-button--ghost gn-ticket-sheet__attach"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          Add link
        </button>
      ) : null}
      {refusal !== null ? (
        <p role="alert" className="gn-ticket-sheet__links-refusal">
          {refusal}
        </p>
      ) : null}
      {phone ? (
        <Dialog open={pickerOpen && canEdit} title="Add link" onClose={() => setPickerOpen(false)}>
          {picker}
        </Dialog>
      ) : (
        <Popover triggerRef={addRef} open={pickerOpen && canEdit} onClose={() => setPickerOpen(false)} aria-label="Add link">
          {picker}
        </Popover>
      )}
      <Toast
        open={toast !== null}
        message={toast?.message ?? ''}
        undo={toast?.undo == null ? null : { onUndo: () => void toast.undo!() }}
        onDismiss={() => setToast(null)}
      />
    </section>
  );
}
