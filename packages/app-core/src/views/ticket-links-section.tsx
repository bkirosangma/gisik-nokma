import { useEffect, useRef, useState } from 'react';
import { linkReading, type SubmittedEvent, type TicketLinkKind } from '@gisik-nokma/domain';
import { Dialog, Popover, Select, Toast } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import type { PrecheckResult } from '../precheck.js';
import type { MakeSubmitted } from '../submit.js';
import type { TicketLinkView } from '../view-types.js';
import type { LiveQueryResult } from './use-live-query.js';
import { usePhoneBoard } from './use-phone-board.js';

type Choice = 'blocks' | 'blocked-by' | 'relates' | 'duplicates' | 'duplicated-by';

/**
 * The five readings the Add control offers, from THIS ticket. `onOther` says whose stream the event rides:
 * a link is stored on its SOURCE's stream (spec A §2.2), so "Is blocked by" is filed by the other ticket
 * with `targetId` = this one. The permission gate is symmetric (both ends visible), so it is the same right.
 */
const CHOICES: { value: Choice; label: string; kind: TicketLinkKind; onOther: boolean }[] = [
  { value: 'blocks', label: 'Blocks', kind: 'blocks', onOther: false },
  { value: 'blocked-by', label: 'Is blocked by', kind: 'blocks', onOther: true },
  { value: 'relates', label: 'Relates to', kind: 'relates', onOther: false },
  { value: 'duplicates', label: 'Duplicates', kind: 'duplicates', onOther: false },
  { value: 'duplicated-by', label: 'Is duplicated by', kind: 'duplicates', onOther: true },
];

/** The reading a row shows from THIS ticket, which is also its group heading (spec A §3.1). */
const readingOf = (l: { kind: TicketLinkKind; direction: 'out' | 'in' }): string => linkReading(l.kind, l.direction);
const GROUP_ORDER = ['blocks', 'is blocked by', 'relates to', 'duplicates', 'is duplicated by'];
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

type TicketHit = { ticketId: string; projectId: string; key: string; title: string };

export type TicketLinksSectionProps = {
  dataSource: DataSource;
  workspaceId: string;
  ticketId: string;
  canEdit: boolean;
  make: MakeSubmitted;
  /** Drafts T8 (planner ruling A): this sheet is a draft's, so a link stored on the OTHER ticket is filed here. */
  isDraft: boolean;
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
): SubmittedEvent {
  if (isDraft && onOther) return make({ workspaceId, entity: { kind: 'ticket', id: thisId }, type, payload: { kind, targetId: thisId, from: otherId } });
  const [source, target] = onOther ? [otherId, thisId] : [thisId, otherId];
  return make({ workspaceId, entity: { kind: 'ticket', id: source }, type, payload: { kind, targetId: target } });
}

/**
 * "Links" on the ticket sheet (typed links, spec A §3.1): the tickets this one blocks, is blocked by, relates
 * to and duplicates, grouped by their reading from here. Add is optimistic (a busy row in its group until the
 * server answers); Remove shows a Toast with Undo, as the Notes section does. The picker is a Popover on a
 * desktop and a bottom-sheet Dialog on a phone.
 */
export function TicketLinksSection({
  dataSource,
  workspaceId,
  ticketId,
  canEdit,
  make,
  isDraft,
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
  const [toast, setToast] = useState<{ message: string; undo: SubmittedEvent | null } | null>(null);
  const [choice, setChoice] = useState<Choice>('blocks');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TicketHit[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // A committed Add's busy row hands over to the reloaded one: clear it when the reload's answer lands.
  useEffect(() => {
    if (!awaitingReload.current) return;
    awaitingReload.current = false;
    setPending(null);
  }, [links.data]);

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
      if (result === undefined) {
        setRefusal('The server did not answer this change.');
        setPending(null);
        return false;
      }
      if (result.status === 'committed') {
        awaitingReload.current = true;
        links.reload();
        return true;
      }
      setRefusal(result.status === 'refused' ? result.reason : result.message);
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
    setPickerOpen(false);
    setRefusal(null);
    const optimistic: TicketLinkView = {
      kind: picked.kind,
      direction: picked.onOther ? 'in' : 'out',
      ticket: { id: hit.ticketId, projectId: hit.projectId, key: hit.key, title: hit.title, stateCategory: 'open' },
    };
    setPending(optimistic);
    const event = eventFor(make, workspaceId, ticketId, hit.ticketId, picked.kind, picked.onOther, 'ticket.link_added', isDraft);
    if (await file(event, `link_added:${picked.kind}:${hit.ticketId}`)) {
      setToast({ message: `Linked: ${readingOf(optimistic)} ${hit.key}`, undo: null });
    }
  }

  async function remove(l: TicketLinkView): Promise<void> {
    setRefusal(null);
    const onOther = l.direction === 'in';
    const event = eventFor(make, workspaceId, ticketId, l.ticket.id, l.kind, onOther, 'ticket.link_removed', isDraft);
    if (await file(event, `link_removed:${l.kind}:${l.ticket.id}`)) {
      // The Undo is built now, at click time, and filed through the same guard.
      const undo = eventFor(make, workspaceId, ticketId, l.ticket.id, l.kind, onOther, 'ticket.link_added', isDraft);
      setToast({ message: `Removed link: ${readingOf(l)} ${l.ticket.key ?? l.ticket.title}`, undo });
    }
  }

  async function undoRemove(undo: SubmittedEvent): Promise<void> {
    const { targetId: target, from } = undo.payload as { targetId: string; from?: string };
    // A draft-side undo names the other ticket in `from` (its stream and target are both this draft).
    const other = from ?? (undo.entity.id === ticketId ? target : undo.entity.id);
    const kind = (undo.payload as { kind: TicketLinkKind }).kind;
    if (await file(undo, `link_added:${kind}:${other}`)) setToast(null);
  }

  const loaded = links.data ?? [];
  const alreadyShown =
    pending !== null && loaded.some((l) => l.kind === pending.kind && l.direction === pending.direction && l.ticket.id === pending.ticket.id);
  const rows = [...loaded, ...(pending !== null && !alreadyShown ? [pending] : [])];
  const failed = links.error !== null;
  const heading = failed || links.data === null ? 'Links' : `Links (${loaded.length})`;
  const groups = GROUP_ORDER.map((reading) => ({ reading, rows: rows.filter((l) => readingOf(l) === reading) })).filter((g) => g.rows.length > 0);

  const picker = (
    <div className="gn-ticket-sheet__link-picker">
      <Select
        aria-label="Link type"
        value={choice}
        onChange={(v) => setChoice(v as Choice)}
        options={CHOICES.map(({ value, label }) => ({ value, label }))}
      />
      <input
        type="search"
        aria-label="Find a ticket"
        className="gn-input"
        value={query}
        onChange={(e) => void search(e.target.value)}
      />
      <ul role="listbox" aria-label="Tickets" className="gn-ticket-sheet__link-results">
        {results
          .filter((r) => r.ticketId !== ticketId)
          .map((r) => (
            <li key={r.ticketId} role="option" aria-selected={false}>
              <button type="button" className="gn-ticket-sheet__link-result" onClick={() => void add(r)}>
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
                return (
                  <li key={`${l.kind}:${l.direction}:${l.ticket.id}`} className="gn-ticket-sheet__link-row" aria-busy={busy}>
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
                    {canEdit && !busy ? (
                      <button
                        type="button"
                        className="gn-button gn-button--ghost gn-ticket-sheet__link-remove"
                        aria-label={`Remove: ${group.reading} ${label}`}
                        onClick={() => void remove(l)}
                      >
                        Remove
                      </button>
                    ) : null}
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
        undo={toast?.undo == null ? null : { onUndo: () => void undoRemove(toast.undo!) }}
        onDismiss={() => setToast(null)}
      />
    </section>
  );
}
