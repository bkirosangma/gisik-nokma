import { IST_CLOCK_NOTE } from '@gisik-nokma/domain';
import { actorLabel, formatDateTime } from '../provenance.js';
import type { TicketHistoryEvent } from '../view-types.js';

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
 */
export function HistoryList({
  events,
  nameOf,
}: {
  events: TicketHistoryEvent[];
  nameOf: (userId: string) => string;
}) {
  return (
    <>
      <ol className="gn-history">
        {events.map((event) => (
          <li key={event.id} className="gn-history__event">
            <div className="gn-history__headline">
              <span className="gn-history__type">{event.type}</span>
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
        ))}
      </ol>
      <p className="gn-history__clock-note">{IST_CLOCK_NOTE}</p>
    </>
  );
}
