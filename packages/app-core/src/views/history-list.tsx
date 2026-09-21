import { IST_CLOCK_NOTE } from '@gisik-nokma/domain';
import { actorLabel, formatDateTime } from '../provenance.js';
import type { TicketHistoryEvent } from '../view-types.js';
import { describeEvent, type HistoryCopyContext } from './history-copy.js';

/**
 * The history view IS the ledger, filtered (spec §3). Every entry shows the
 * actor, the origin device, and BOTH CLOCKS with their honest labels — the
 * user's claim about when, and the system's record of when. Nothing is
 * summarised into one "time".
 *
 * This is the surface where conflating them would be worst. The two clocks are
 * both true in different senses: `clientTime` is what the actor's device said
 * when the claim was made, `serverTime` is when this system heard it. An
 * offline mobile claim can carry a `clientTime` days before its `serverTime`,
 * and a surface that showed one of them under the word "when" would be
 * asserting a moment the record never claimed — silently, and with no way for
 * the reader to notice, because a single plausible timestamp looks exactly
 * like the truth.
 *
 * Both clocks print through the one shared renderer, in India time, and the
 * list says so ONCE at the foot rather than tagging every line — from the
 * domain constant, never a retyped literal, so the zone this product prints in
 * and the zone it announces cannot drift apart. Rendering the pair in the
 * *viewer's* zone would still show the same interval between them while
 * naming two moments that never happened.
 *
 * `nameOf` is a display convenience and the floor does not depend on it: the
 * label goes through `actorLabel`, so a resolver that answers with nothing —
 * a roster that 404'd, a member since removed — still renders the raw actor
 * id. A history entry never becomes anonymous, and it never becomes "system".
 *
 * ## The headline is a sentence, and the wire name sits beside it (E4-19 / E5-8)
 *
 * The headline used to be `event.type` — the wire name of the EVENT rather than
 * a statement about the ticket. Measured on `CCSO-6`: three consecutive rows
 * reading `ticket.field_set`, with nothing on any of them saying which field
 * changed or to what. `describeEvent` builds the sentence from the payload the
 * route already selects, and the raw type is KEPT in `.gn-history__slug`, one
 * slot to the right. The complaint was never that the slug was on screen; it
 * was that the slug was the only thing on screen.
 *
 * The slug renders only when it is not already the headline — an event type
 * `describeEvent` does not know falls back to the wire name, and printing it
 * twice would say nothing extra. `ctx` is optional in full: with no resolvers
 * the sentences fall back to the raw ids, which is the same floor `nameOf`
 * gives the actor line — never blank, never invented.
 */
export function HistoryList({
  events,
  nameOf,
  stateName,
  typeName,
}: {
  events: TicketHistoryEvent[];
  nameOf: (userId: string) => string;
  /** Optional resolvers for the sentences — see `HistoryCopyContext`. */
  stateName?: (stateId: string) => string;
  typeName?: (typeId: string) => string;
}) {
  const ctx: HistoryCopyContext = { nameOf, stateName, typeName };
  return (
    <>
      <ol className="gn-history">
        {events.map((event) => {
          const headline = describeEvent(event, ctx);
          return (
          <li key={event.id} className="gn-history__event">
            <div className="gn-history__headline">
              <span className="gn-history__type">{headline}</span>
              {headline === event.type ? null : (
                <span className="gn-history__slug">{event.type}</span>
              )}
              <span className="gn-history__actor">
                {actorLabel(event.actorId, nameOf(event.actorId))}
              </span>
              <span className="gn-history__origin">from {event.origin}</span>
            </div>
            <dl className="gn-history__clocks">
              <dt className="gn-history__clock-label">claimed (device clock)</dt>
              <dd className="gn-history__clock-value">{formatDateTime(event.clientTime)}</dd>
              <dt className="gn-history__clock-label">recorded (server)</dt>
              <dd className="gn-history__clock-value">{formatDateTime(event.serverTime)}</dd>
            </dl>
          </li>
          );
        })}
      </ol>
      <p className="gn-history__clock-note">{IST_CLOCK_NOTE}</p>
    </>
  );
}
