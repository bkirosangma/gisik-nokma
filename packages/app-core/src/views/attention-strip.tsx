import { Chip, type ChipTone } from '@gisik-nokma/ui';
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
  blocked: 'blocked',
  stale: 'pending',
  'due-soon': 'pending',
  contested: 'contested',
};

const KIND_LABEL: Record<AttentionKind, string> = {
  blocked: 'Blocked',
  stale: 'Stale',
  'due-soon': 'Due soon',
  contested: 'Contested',
};

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
 *    composes it — the template `In an active state since ${istDay} — past the
 *    ${staleDays}-day staleness threshold.` — from the workspace's own thresholds and
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
 *    needs attention" line.** The strip's contract is "what needs attention
 *    now", and it cannot presently contain a contested claim at all
 *    (`mapAttention` refuses: `AttentionItem.title` is on no contest row). A
 *    reassuring empty state on a surface that is structurally incapable of
 *    showing one whole kind is a fabricated all-clear.
 *
 * The list is FLAT rather than sectioned per kind for the same reason: a
 * sectioned strip has to decide what to draw under a heading with no rows, and
 * every honest answer to that is "do not draw the heading". A flat list renders
 * what exists by construction.
 */
export function AttentionStrip({ items, onOpenTicket }: AttentionStripProps) {
  if (items.length === 0) return null;
  return (
    <aside className="gn-attention" aria-label="Needs attention">
      <ul className="gn-attention__items">
        {items.map((item) => (
          <li key={`${item.kind}:${item.ticketId}`} className="gn-attention__item">
            <Chip tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Chip>
            <button
              type="button"
              className="gn-attention__title"
              onClick={() => onOpenTicket(item.ticketId)}
            >
              {item.title}
            </button>
            <span className="gn-attention__reason">{item.reason}</span>
            {item.claim !== null ? (
              <span className="gn-attention__claim">
                {`claimed by ${actorLabel(item.claim.actorId, item.claim.actorName)} on ${formatDate(item.claim.serverTime)}`}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
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
 * `getAttention` REFUSES today (`ServingGapError`, `online/mappers.ts`): the
 * contested kind's `title` is on no route. The refusal surfaces as
 * `LiveQueryResult.error` and is NOT swallowed here — see the test. A hook that
 * caught it and returned `[]` would render the strip's most dangerous lie, an
 * emptiness the user reads as an all-clear.
 */
export function useAttention(
  source: DataSource,
  workspaceId: string,
): LiveQueryResult<AttentionItem[]> {
  return useLiveQuery(source, workspaceId, workspaceId, () => source.query.getAttention(workspaceId));
}
