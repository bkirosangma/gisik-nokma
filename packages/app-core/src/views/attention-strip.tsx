import { useId, useState } from 'react';
import { Button, Chip, type ChipTone } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { actorLabel, formatDate } from '../provenance.js';
import type { AttentionItem, AttentionKind } from '../view-types.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';

/**
 * Every kind the union declares gets a tone and a label, and the two maps are
 * typed `Record<AttentionKind, …>` on purpose: the union is DISCRIMINATED so a
 * fourth arm can arrive additively (`'contested'`, Plan 10), and a fourth arm
 * that arrives without a rendering is a strip that draws a blank chip for the
 * one item on it that matters most. Typing them total means the day
 * `AttentionKind` grows, `typecheck` names this file rather than a user
 * meeting an unlabelled row. That failure has no runtime death — nothing
 * throws, nothing renders wrong until the new kind is actually emitted — which
 * is exactly why the compiler has to be the one holding it.
 */
const KIND_TONE: Record<AttentionKind, ChipTone> = {
  // The danger tone — but the WORD carries the meaning, never the colour alone (NP-06).
  overdue: 'blocked',
  blocked: 'blocked',
  stale: 'pending',
  'due-soon': 'pending',
  contested: 'contested',
};

const KIND_LABEL: Record<AttentionKind, string> = {
  overdue: 'Overdue',
  blocked: 'Blocked',
  stale: 'Stale',
  'due-soon': 'Due soon',
  contested: 'Contested',
};

/** Strongest first: the order a ticket's reasons are weighed in, and the order the rows are drawn in (NP-05). */
const SEVERITY: readonly AttentionKind[] = ['overdue', 'blocked', 'stale', 'due-soon', 'contested'];
const severityOf = (kind: AttentionKind): number => SEVERITY.indexOf(kind);

/** How many rows the strip draws before "Show all N" (NP-05). */
export const ATTENTION_CAP = 5;

/**
 * What the strip draws, in order (NP-05, NP-06; UX fixes T9, case 23.163):
 *
 * - **ONE row per ticket, with its strongest reason** — overdue, then blocked,
 *   stale, due soon, contested. A ticket on two or three lists was the NP-05
 *   repeat: it inflated the count and made the person read one title up to
 *   three times. Overdue still beats stale (21.244), and now every other pair
 *   collapses the same way (21.244 amended: overdue + blocked is one Overdue row).
 * - **Strongest FIRST.** The rows are in that same severity order (a stable sort,
 *   so equals keep the order the source gave), because the strip is capped
 *   (`ATTENTION_CAP`) and the cap must hide the least urgent rows, never the
 *   most. An overdue row leads whatever order a source handed the items in (21.242).
 */
export function orderAttention(items: AttentionItem[]): AttentionItem[] {
  const strongest = new Map<string, AttentionItem>();
  for (const item of items) {
    const held = strongest.get(item.ticketId);
    if (held === undefined || severityOf(item.kind) < severityOf(held.kind)) strongest.set(item.ticketId, item);
  }
  return [...strongest.values()].sort((a, b) => severityOf(a.kind) - severityOf(b.kind));
}

export type AttentionStripProps = {
  items: AttentionItem[];
  onOpenTicket: (ticketId: string) => void;
};

/**
 * Computed, never authored (spec §7).
 *
 * ## Three refusals, and they are the whole component
 *
 * 1. **The reason is the SERVER'S, rendered verbatim.** `routes/attention.ts`
 *    composes it — the template `In an active state since ${day}, past the
 *    ${staleDays}-day staleness threshold.` (`day` is "10 Jul", the product's day format) — from the workspace's own thresholds and
 *    the IST day arithmetic that decided the item belonged here at all.
 *    Re-deriving it in the browser would give the product two ideas of why
 *    something needs attention, and the browser's would be the one computed
 *    without the settings. The owner decision pins the spec's "user's language"
 *    to mean NAMED reasons rather than localisation; the structured fields
 *    (`enteredStateAt`, `daysInFlight`, `thresholdDays`) are what a localisation
 *    pass will read, and they are on the wire already.
 *
 * 2. **An item with no claim renders no provenance.** `AttentionItem.claim` is
 *    `ClaimProvenance | null` because two of the shipped kinds rest on a claim
 *    (a due date somebody set, a state somebody marked) and a `stale` item may
 *    rest on nothing anybody claimed. Printing a fallback there would attribute
 *    a judgement the ledger never recorded.
 *
 * 3. **An empty strip renders NOTHING — not an empty container, not a "nothing
 *    needs attention" line.** The contract is "what needs attention now", and
 *    an empty list is the honest rendering of that. **This rule used to rest
 *    on a SECOND fact that has expired** — that the strip "cannot presently
 *    contain a contested claim at all (`mapAttention` refuses …)"; where
 *    `mappers.ts:1940-1950` maps a contest's `title` today, so it can.
 *
 * The list is FLAT rather than sectioned per kind for the same reason: a
 * sectioned strip has to decide what to draw under a heading with no rows, and
 * every honest answer to that is "do not draw the heading". A flat list renders
 * what exists by construction.
 *
 * **"Do not draw the heading" is about a PER-KIND SUB-heading, and the single
 * banner-level heading below is a different thing.** The two sentences read as
 * if they disagree, so, plainly: a sectioned strip needs one heading per kind,
 * and a kind with no rows has nothing honest to put under its own heading. The
 * heading this component draws names the WHOLE strip, not a kind, and it can
 * never outlive its rows — `items.length === 0` returns `null` above, before
 * any of this is reached. A banner heading over zero rows would be the
 * fabricated all-clear refusal 3 already forbids; that is the case this
 * paragraph rules out, and the flat list above is what keeps it impossible.
 */
export function AttentionStrip({ items, onOpenTicket }: AttentionStripProps) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  if (items.length === 0) return null;
  const rows = orderAttention(items);
  const shown = showAll ? rows : rows.slice(0, ATTENTION_CAP);
  return (
    /* The accessible name is the visible heading, character for character.
       WCAG 2.5.3 fails on a visible label that its accessible name does not
       contain, and "Needs attention" beside a heading reading "Needs your
       attention" is that failure. This keeps `aria-label` rather than naming
       the region from the `<p>` via `aria-labelledby`, and the reason is
       measured rather than stylistic: `aria-labelledby` would remove an
       `aria-label` attribute from every route this strip renders on, and
       `e2e-stack/viewport.spec.ts` ratchets that attribute's COUNT with
       `toBeGreaterThanOrEqual` — `/my-work` is floored at 8 and the strip's
       `aside` is one of them. A floor is not hand-lowered to meet a restyle. */
    <aside className="gn-attention" aria-label="Needs your attention">
      <p className="gn-attention__heading">
        {/* Decorative: the heading beside it already says this, so a name here
            would be the same sentence read twice. */}
        <svg
          className="gn-attention__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4.5 3.5 19h17Z" />
          <path d="M12 10v4" />
          <path d="M12 16.5h.01" />
        </svg>
        Needs your attention
      </p>
      <ul id={listId} className="gn-attention__items">
        {shown.map((item) => (
          <li key={item.ticketId} className="gn-attention__item">
            <button
              type="button"
              className="gn-attention__title"
              onClick={() => onOpenTicket(item.ticketId)}
            >
              {item.title}
            </button>
            <Chip tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Chip>
            <span className="gn-attention__reason">{item.reason}</span>
            {item.claim !== null ? (
              <span className="gn-attention__claim">
                {`claimed by ${actorLabel(item.claim.actorId, item.claim.actorName)} on ${formatDate(item.claim.serverTime)}`}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {/* NP-05: five rows, then the rest on request — the strip must not bury the person's own list under it. */}
      {rows.length > ATTENTION_CAP ? (
        <Button className="gn-attention__more" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((open) => !open)}>
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      ) : null}
    </aside>
  );
}

/**
 * ADAPTATION (ruling P17). The plan's snippet calls `useLiveQuery` with three
 * arguments and carries its own STALE banner saying so; the shipped hook takes
 * a `queryKey` third.
 *
 * `workspaceId` is passed TWICE, and that is not a copy-paste slip. The hook
 * uses its two positions for two different jobs, in two deliberately separate
 * effects: the KEY drives clear-and-reload, the WORKSPACE drives the stream
 * subscription. For a workspace-scoped read they coincide, because the
 * workspace is exactly what changes when the question changes — which is what
 * `getBoard`'s `projectId` is for the board. Passing a constant key here would
 * leave the previous workspace's strip on screen under the new workspace's
 * heading until an unrelated stream frame happened to arrive.
 *
 * **The error is NOT swallowed here, and that outlived the claim above it.**
 * "`getAttention` REFUSES today" has EXPIRED — it composes two live reads
 * and `SERVING_GAPS` is EMPTY (`search`, its last key, was served 2026-09-19;
 * this read "carries one key, `search`" until corrected 2026-09-20) — so **the
 * condition is now a FAILED read** rather than a permanent gap. A hook returning `[]` would
 * still render the strip's most dangerous lie: an emptiness read as an all-clear.
 */
export function useAttention(
  source: DataSource,
  workspaceId: string,
): LiveQueryResult<AttentionItem[]> {
  return useLiveQuery(source, workspaceId, workspaceId, () => source.query.getAttention(workspaceId));
}
