import { IST_DAY_REGEX, formatIstInstant, istDayBounds } from '@gisik-nokma/domain';
import type { ClaimProvenance } from './view-types.js';

/**
 * Honesty contract 1: the UI never launders a claim into an anonymous fact.
 * A missing display name falls back to the raw actor id — attributed, never
 * blank, never a fabricated "system".
 */
export function actorLabel(actorId: string, actorName: string | null | undefined): string {
  const name = actorName?.trim();
  return name !== undefined && name.length > 0 ? name : actorId;
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
