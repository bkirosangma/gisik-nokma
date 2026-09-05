import { clockSkewMs, hasGrossClockSkew } from '@gisik-nokma/domain';

/**
 * Renders spec §5's skew flag: derived from the two kept clocks, shown only
 * when gross. Both timestamps stay in the envelope untouched — this is a
 * DERIVED reading of them, so it is identical wherever it is computed.
 *
 * ## The order of these two lines is the whole function
 *
 * `hasGrossClockSkew` answers TRUE for an UNPARSEABLE claim as well as a large
 * one (`packages/domain/src/clock-skew.ts:84` — `skew === null || Math.abs(skew)
 * >= GROSS_CLOCK_SKEW_MS`). So the gate runs first and `clockSkewMs` is read
 * again inside it: a `null` there is now known to mean unreadable rather than
 * small, and it is SAID. Gating on `clockSkewMs(env) === null` instead — the
 * obvious-looking simplification — returns `null` for the unreadable case,
 * which renders no badge at all and hides exactly the claim least worth
 * hiding. `test/skew-and-status.test.tsx` pins the unreadable case for that
 * reason.
 *
 * The threshold is the domain's `GROSS_CLOCK_SKEW_MS` (10 minutes) compared
 * with `>=`, not a number restated here.
 */
export function formatClockSkew(env: { clientTime: string; serverTime: string }): string | null {
  if (!hasGrossClockSkew(env)) return null;
  const skew = clockSkewMs(env);
  if (skew === null) return 'device clock claim unreadable';
  const minutes = Math.round(Math.abs(skew) / 60_000);
  return `device clock ran ${minutes} min ${skew > 0 ? 'ahead of' : 'behind'} the server`;
}

/**
 * The history-line badge. Attributed to the DEVICE clock, never phrased as
 * "the event happened at the wrong time" — the claim is what it is, and this
 * says only that the two clocks disagreed.
 */
export function ClockSkewBadge(props: { env: { clientTime: string; serverTime: string } }) {
  const text = formatClockSkew(props.env);
  if (text === null) return null;
  return <span className="gn-clock-skew-badge">{text}</span>;
}
