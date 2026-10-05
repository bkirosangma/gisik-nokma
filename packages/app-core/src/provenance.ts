import { IST_DAY_REGEX, formatIstInstant, istDayBounds, MCP_ASSISTANT_LABEL, SYSTEM_ACTOR_NAMES } from '@gisik-nokma/domain';
import { UNKNOWN_PERSON } from './member-label.js';
import type { ClaimProvenance } from './view-types.js';

/**
 * Honesty contract 1: the UI never launders a claim into an anonymous fact.
 * A missing display name falls back to the raw actor id — attributed, never
 * blank, never a fabricated "system".
 *
 * ## The chain is name → email → id, and THIS function only owns its last links
 *
 * The email step is real but it is **not here**: it lives in `memberLabel`
 * (`../member-label.ts`), because it needs a ROSTER ROW and this function is
 * handed a claim's `{actorId, actorName}` and nothing else. It reaches this
 * function by riding the roster join's VALUE — `rosterByActorId`
 * (`online/mappers.ts`) builds each value with `memberLabel` — so by the time a
 * name arrives it has already been through the address. An email therefore
 * reaches the screen through the same door a name does, and a caller holding
 * only an id still gets the id.
 *
 * That division is deliberate and is why this function keeps NO email lookup of
 * its own: adding one would mean giving it the roster, and then the SYSTEM step
 * below would have to be checked against the roster too — the one thing it must
 * never be. See `memberLabel`'s docblock for the end-to-end chain.
 *
 * ## The reserved actors are checked FIRST, and that order is the rule
 *
 * One actor in this product is not a person: `SYSTEM_ACTOR_AUTO_CLOSE`, the id
 * the auto-close sweep files its `ticket.closed` under (spec §8.2). Its display
 * name is fixed by the spec — the sheet reads "Closed by Auto-close on <date>"
 * — and it is NOT a roster entry, because no workspace has a member by that id.
 *
 * So the lookup runs **system → the handed label → id**, and the MIDDLE step is
 * what makes the first one load-bearing rather than an extra fallback: a roster
 * row that happened to carry this id must not be able to rename a system actor.
 * A person's name printed over a decision no person made is the exact claim this
 * module's honesty contract exists to refuse, and "the roster is authoritative
 * for every id" would produce it. `SYSTEM_ACTOR_NAMES` is a `Map` for the same
 * class of reason at the other end: an object literal would answer `true` for
 * `'toString'`, so `'constructor'`-shaped garbage from a wire body would read
 * as a reserved actor.
 *
 * The middle step reads the ARGUMENT and does not reach for a roster, so what it
 * holds is whatever the caller resolved — and since 2026-09-22 that is
 * `memberLabel`'s answer (name → email → id) wherever the caller joined a
 * roster. **This function's own order is unchanged by that, and
 * `SYSTEM_ACTOR_AUTO_CLOSE` is the case that proves it:** it has no roster row,
 * so no join can hand it an address, and the system step answers before the
 * argument is even trimmed. Case 13.1293 pins both halves.
 *
 * The floor below it is `Unknown person` (R3 N4, owner 2026-09-29), never the
 * id: an ordinary id nobody names is still attributed — the sentence says a
 * person did it — but a ULID is not a name. **A label equal to the id is the
 * same as no label**: the mapper synthesises `name = id` for an assignee the
 * roster does not cover, and `memberLabel` floors at the id, and both must
 * reach this floor rather than print the id through the middle step.
 */
export function actorLabel(actorId: string, actorName: string | null | undefined): string {
  const systemName = SYSTEM_ACTOR_NAMES.get(actorId);
  if (systemName !== undefined) return systemName;
  const name = actorName?.trim();
  return name !== undefined && name.length > 0 && name !== actorId ? name : UNKNOWN_PERSON;
}

/**
 * Knowledge Graph spec D §5.2 (D2): an MCP write reads "Assistant, for Ama Rangsa". The ledger records origin 'mcp'
 * and the session's user, never which assistant, so the assistant is one label (`MCP_ASSISTANT_LABEL`). Wraps
 * `actorLabel`'s answer, so the floor (`Unknown person`) still names the person: "Assistant, for Unknown person".
 */
export function attributionLabel(actorName: string, origin: string): string {
  return origin === 'mcp' ? `${MCP_ASSISTANT_LABEL}, for ${actorName}` : actorName;
}

/**
 * Every time this client shows a moment goes through ONE renderer, and it is
 * not this module's: `formatIstInstant` lives in @gisik-nokma/domain so the
 * server, the web client, the desktop client and the offline mobile replica
 * cannot print the same recorded moment three different ways. This module
 * only chooses how much of it to show.
 *
 * Nothing here reads the device. `toLocaleString`, `toLocaleDateString` and
 * the local `getHours`-family getters are all forbidden by the plan's clock
 * constraint: a timestamp that shifts with the viewer's laptop is a claim the
 * record never made, and two collaborators comparing notes would be reading
 * two different histories of the same ticket.
 */
export function formatDate(value: string): string {
  // Two shapes arrive here. An INSTANT ('…T10:00:00.000Z') is rendered as the
  // IST day it falls in. A DAY CLAIM ('2026-08-30') is already a day and must
  // NOT be shifted — `formatIstInstant` returns day claims verbatim precisely
  // so no zone maths can invent a time of day for one, so we hand it the IST
  // midnight that opens that day and keep the date half.
  const instant = IST_DAY_REGEX.test(value) ? openingInstantOf(value) : value;
  const rendered = formatIstInstant(instant);
  // Verbatim means unparseable: render the claim as claimed, never invent a date.
  if (rendered === instant) return value;
  return rendered.slice(0, rendered.indexOf(', '));
}

/**
 * MAP-MISSED ADAPTATION. `istDayBounds` THROWS on a day claim it cannot
 * round-trip — `2026-02-30`, which `Date.UTC` rolls into March, and `0099-01-01`,
 * which it reads as 1999 — and both match `IST_DAY_REGEX`, so the plan's
 * unguarded call turned this module's "render the claim as claimed" promise
 * into an exception thrown at a rendering surface. A blank screen is a worse
 * answer than an invented date, and the promise exists to prevent the lesser
 * of the two. Handing the claim straight back means `formatIstInstant` sees a
 * day claim, returns it verbatim, and the caller's own verbatim branch catches
 * it — the same path an unparseable instant already takes, not a second one.
 */
function openingInstantOf(day: string): string {
  try {
    return istDayBounds(day).startUtc;
  } catch {
    return day;
  }
}

/**
 * The ONE way the UI prints a day (UX fixes T11, 23.193): "17 Aug", and "17 Aug 2025" when the year is not the
 * year of `now`. `value` is an instant or a day claim, exactly as `formatDate` takes it. `now` is the IST day the
 * shell hands in (`istToday()` on the web), never a device clock read here; without it the year is kept, because
 * a day with no year beside it is only safe when the reader's year is known. An unparseable claim comes back as
 * claimed.
 */
export function formatDay(value: string, now?: string): string {
  const day = formatDate(value);
  const year = /\s(\d{4})$/.exec(day)?.[1];
  const sameYear = now !== undefined && year !== undefined && now.startsWith(`${year}-`);
  return sameYear ? day.slice(0, day.length - 5) : day;
}

/** The whole instant, clock named: '19 Aug 2026, 15:35 IST'. */
export function formatDateTime(iso: string): string {
  return formatIstInstant(iso);
}

/**
 * The unfold text (spec §7 Board): "marked Done by Anselma Marak on 19 Aug
 * 2026". Uses the SERVER-recorded clock — a claimed clock hours out would put
 * a ticket on a day it was never marked on, and the history view is where both
 * clocks are shown side by side.
 */
export function formatStateProvenance(stateName: string, claim: ClaimProvenance): string {
  return `marked ${stateName} by ${actorLabel(claim.actorId, claim.actorName)} on ${formatDate(claim.serverTime)}`;
}

/**
 * The BOARD CARD's line (UX fixes T7, FD5, audit BRD-03): "Moved to In progress by Kiro on 30 Sep". It is the
 * sheet's own claim in the words of a history entry, and it replaces the card's "who · when" placeholder. A NEW
 * function rather than an edit of `formatStateProvenance`, which the sheet's State row and My Work still use
 * ("marked … by … on 30 Sep 2026").
 *
 * The year is dropped only when the claim falls in the year of `today`, the IST day the shell hands the board
 * (the same clock-free seam the card's due date reads); a claim from another year, or a caller with no `today`,
 * keeps it. `full` always keeps it — the card's unfolded form.
 */
export function formatCardProvenance(stateName: string, claim: ClaimProvenance, today?: string, full = false): string {
  const shown = formatDay(claim.serverTime, full ? undefined : today);
  return `Moved to ${stateName} by ${actorLabel(claim.actorId, claim.actorName)} on ${shown}`;
}
