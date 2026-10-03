import { linkReading, TICKET_LINK_KINDS, type TicketLinkKind } from '@gisik-nokma/domain';
import { actorLabel, formatDate } from '../provenance.js';
import type { TicketHistoryEvent } from '../view-types.js';

/**
 * E4-19 / E5-8 — the History tab's headline, as a SENTENCE about what changed
 * rather than the wire name of the event that carried it.
 *
 * ## The defect this closes
 *
 * The tab rendered `event.type` verbatim as the headline. Measured on the
 * seeded project, `CCSO-6`'s six rows read `ticket.created`, `ticket.field_set`,
 * `ticket.field_set`, `ticket.field_set`, `ticket.transitioned`,
 * `visibility.set` — three identical lines in a row, none of them saying which
 * field was set or to what. The wire name is the EVENT's name, not the change's:
 * a reader learns that something called a `field_set` happened, which is a fact
 * about the ledger rather than about the ticket.
 *
 * The payload the sentence needs is already on the wire and already selected by
 * the route (`view-types.ts`'s `TicketHistoryEvent.payload`); it was simply
 * unread. The prototype's own export narrates every row — *"Created as
 * Errand"*, *"Assigned to Anselma Marak"*, *"State set to Doing"*, *"Conflicting
 * claim recorded on iphone-02"* — and those sentences are the shape this file
 * follows, not a literal to match word for word.
 *
 * ## The wire name is KEPT, one slot to the right
 *
 * Both findings ask for the raw type to survive as a secondary label, and it
 * does: `HistoryList` renders it in `.gn-history__slug` beside the sentence. The
 * complaint was never that the slug was on screen — it was that the slug was
 * the ONLY thing on screen, so a reader had no way to tell three `field_set`
 * rows apart.
 *
 * ## What this function refuses to do
 *
 * - **It never invents a value.** Every sentence is built from a field the
 *   payload actually carries, read defensively: a payload that is the wrong
 *   shape, or a field of the wrong type, degrades to a sentence that admits it
 *   rather than printing `undefined` or dropping the row.
 * - **An unrecognised type falls back to the RAW TYPE.** A future event type
 *   this file has not learned renders exactly as it did before — the wire name
 *   — rather than as a guessed sentence about a claim nobody described here.
 * - **It does not paraphrase the ledger.** No summarising, no collapsing
 *   several events into one line: `HistoryList` still renders one `<li>` per
 *   event, in the order the ledger gave them.
 */

export type HistoryCopyContext = {
  /**
   * A state id → the name the ticket's workflow gives it. The `?? stateId`
   * fallback is the same idiom `workflow-builder/summaries.ts:20` uses, and it
   * is deliberate: a state the ticket's workflow no longer declares, or a
   * caller that supplies no resolver, still names something rather than
   * nothing.
   */
  stateName?: (stateId: string) => string;
  /** A ticket-type id → its display name. Falls back to the raw id. */
  typeName?: (typeId: string) => string;
  /**
   * A user id → a display name. The SAME resolver the actor line uses, so a
   * sentence naming a person can never disagree with the actor beside it about
   * who that person is.
   */
  nameOf?: (userId: string) => string;
};

/** A string field off an opaque payload, or `null` when it is absent or not a string. */
function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

/**
 * A field claim's value, for a sentence.
 *
 * The due-date shape — `{ date, note? }` — is the ONE structured value a
 * built-in field rides this event with (`ticket-events.ts`'s
 * `ticketFieldSetPayload` docblock), so it is the one shape read specially; the
 * renderer is `formatDate`, the same one the Details tab prints that field
 * through, so the sentence and the row cannot disagree about the date.
 *
 * `null` is the explicit CLEARING claim (design decision 3), and it reads as
 * one rather than as the em dash the Details tab uses for "not set": clearing a
 * field is an act somebody performed, and a history line saying a field "is —"
 * would describe a state instead of the change this row is.
 */
function renderValue(value: unknown): string | null {
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === 'object' && 'date' in (value as Record<string, unknown>)) {
    const date = (value as Record<string, unknown>)['date'];
    return typeof date === 'string' ? formatDate(date) : null;
  }
  if (typeof value === 'string') return value === '' ? null : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // An object with no readable `date`, an array, a function — nothing here can
  // be put in a sentence honestly, and JSON.stringify would put `{"a":1}` in
  // front of a person as though it were a value they had typed.
  return null;
}

/**
 * The sentence for one ledger event. Unrecognised types return `event.type`
 * unchanged — see this file's docblock on why that is the honest fallback.
 */
export function describeEvent(event: TicketHistoryEvent, ctx: HistoryCopyContext = {}): string {
  const payload = asRecord(event.payload);
  const stateName = (id: string): string => ctx.stateName?.(id) ?? id;
  const typeName = (id: string): string => ctx.typeName?.(id) ?? id;
  // NOT `ctx.nameOf?.(id) ?? id`. That is what this file first wrote, and it
  // was wrong in the way the docblock above already promised it could not be:
  // a resolver that answers `''` — a roster that 404'd, a member since removed,
  // which is exactly the hole `HistoryList`'s own `nameOf` docblock describes —
  // is NOT nullish, so `??` passes the empty string straight through and the
  // sentence reads "Assigned to ". Routing through `actorLabel` is the same
  // floor the actor line one span to the right uses, INCLUDING the system-actor
  // map (`SYSTEM_ACTOR_AUTO_CLOSE` and friends name themselves), so a sentence
  // and the actor beside it cannot disagree about who somebody is. Caught by
  // 3.181, which was written for a different reason.
  const nameOf = (id: string): string => actorLabel(id, ctx.nameOf?.(id));

  switch (event.type) {
    case 'ticket.created': {
      const typeId = str(payload, 'typeId');
      // No `typeId` at all is a payload this file cannot read — the raw type is
      // then the honest headline, and the fallthrough says so rather than
      // printing "Created as undefined".
      return typeId === null ? event.type : `Created as ${typeName(typeId)}`;
    }
    case 'ticket.field_set': {
      const fieldId = str(payload, 'fieldId');
      if (fieldId === null) return event.type;
      const value = renderValue(payload['value']);
      // `null` is the CLEARING claim — see `renderValue`'s docblock.
      if (value === null) return payload['value'] === null ? `Cleared ${fieldId}` : event.type;
      return `Set ${fieldId} to ${value}`;
    }
    case 'ticket.transitioned': {
      const to = str(payload, 'to');
      return to === null ? event.type : `Moved to ${stateName(to)}`;
    }
    case 'visibility.set': {
      const mode = str(payload, 'mode');
      return mode === null ? event.type : `Visibility set to ${mode}`;
    }
    case 'ticket.assigned': {
      const assigneeId = payload['assigneeId'];
      // `null` is an UNASSIGNMENT — the same event carrying `null`, never a
      // second event type (`read/assigned-provenance.ts`).
      if (assigneeId === null) return 'Unassigned';
      return typeof assigneeId === 'string' && assigneeId !== ''
        ? `Assigned to ${nameOf(assigneeId)}`
        : event.type;
    }
    case 'ticket.collaborator_added': {
      const userId = str(payload, 'userId');
      return userId === null ? event.type : `Added ${nameOf(userId)} as a collaborator`;
    }
    case 'ticket.collaborator_removed': {
      const userId = str(payload, 'userId');
      return userId === null ? event.type : `Removed ${nameOf(userId)} as a collaborator`;
    }
    case 'ticket.workflow_rebound': {
      const toStateId = str(payload, 'toStateId');
      return toStateId === null ? event.type : `Workflow changed, now in ${stateName(toStateId)}`;
    }
    case 'ticket.reparented': {
      return payload['newParentId'] === null ? 'Moved to the project root' : 'Moved under a new parent';
    }
    case 'ticket.ranked': {
      const rank = str(payload, 'rank');
      return rank === null ? event.type : `Backlog rank set to ${rank}`;
    }
    // The flag events carry no payload at all — the envelope holds actor and
    // time, and the row beside this sentence already prints both.
    case 'ticket.closed':
      return 'Closed';
    case 'ticket.reopened':
      return 'Reopened';
    case 'ticket.deleted':
      return 'Deleted';
    case 'ticket.restored':
      return 'Restored';
    case 'comment.added':
      return 'Comment added';
    case 'comment.edited':
      return 'Comment edited';
    case 'comment.deleted':
      return 'Comment deleted';
    /**
     * E5-8 — THE TWO THE FIRST PASS MISSED, and the census is what found them.
     *
     * `attachment.added` and `claim.contested_resolved` are both registered
     * against entity kind `ticket` (`vocabulary.ts`) and both reach this tab,
     * and neither had a sentence — they fell through to the wire name, which is
     * the exact defect E4-19/E5-8 is about, surviving in two rows out of
     * eighteen. A hand-written switch looks complete from the inside; the
     * census in `history-copy.test.ts` reads the DOMAIN's own lists instead and
     * asks each member whether it is narrated, so this class of gap cannot come
     * back silently.
     *
     * `attachment.added` is a discriminated union of exactly two kinds
     * (`ticket-events.ts`), and the sentence names the FILE — `filename` for an
     * upload this product holds, `name` for a Drive pointer it does not. They
     * are separate fields in the schema and they are kept separate here rather
     * than coalesced into one lookup: an upload and a link are different claims
     * and the person reading the ledger is entitled to know which they are
     * looking at.
     */
    case 'attachment.added': {
      const kind = str(payload, 'kind');
      if (kind === 'upload') {
        const filename = str(payload, 'filename');
        return filename === null ? event.type : `Attached ${filename}`;
      }
      if (kind === 'drive-reference') {
        const name = str(payload, 'name');
        return name === null ? event.type : `Linked Drive file ${name}`;
      }
      return event.type;
    }
    case 'ticket.link_added':
    case 'ticket.link_removed': {
      const kind = str(payload, 'kind');
      if (kind === null || !(TICKET_LINK_KINDS as readonly string[]).includes(kind)) return event.type;
      const other =
        event.linkTarget === null ? "a ticket you can't see"
        : event.linkTarget?.key ?? 'another ticket';
      const verb = event.type === 'ticket.link_added' ? 'Linked' : 'Removed link';
      return `${verb}: ${linkReading(kind as TicketLinkKind, 'out')} ${other}`;
    }
    case 'claim.contested':
      return 'Conflicting claim recorded';
    case 'claim.contested_resolved': {
      const resolution = str(payload, 'resolution');
      // The three resolved values are a closed enum in the domain
      // (`contest-events.ts`), but this reads them as an opaque string and
      // PRINTS WHAT ARRIVED rather than mapping them through a table of its
      // own: the same discipline the publish banner keeps for rule names, and
      // for the same reason — a fourth resolution added to the domain should
      // read as itself here, not as a missing case.
      return resolution === null ? event.type : `Conflicting claim resolved: ${resolution}`;
    }
    default:
      return event.type;
  }
}
