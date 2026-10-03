/**
 * The smoothness ratchet's pure half (cases 25.231, 25.235, 25.236): how a measured row is judged against `smoothness-baseline.json`
 * and how a recording changes the file. No browser, so a case can drive it with a deleted row or a lowered value and watch it go red.
 */

export interface Row {
  cls: number;
  requests: number;
  duplicates: number;
  swapShiftCls: number;
}

/**
 * The data the rows were measured on, read through `/v1` with the signed-in session at record time. A CLS number is a fact about a
 * page AND the rows it renders (the notes list shifted when a trashed note appeared), so the rows judge only a run on the same data.
 */
export interface Fixture {
  notes: number;
  deletedNotes: number;
  tickets: number;
  workflows: number;
  members: number;
}

export interface Baseline {
  fixture: Fixture | undefined;
  rows: Record<string, Row>;
}

export const FIXTURE_KEY = '_fixture';
export const SWAP_BUDGET = 0.01;

export function parseBaseline(raw: string): Baseline {
  const all = JSON.parse(raw) as Record<string, Row | Fixture>;
  const { [FIXTURE_KEY]: fixture, ...rows } = all;
  return { fixture: fixture as Fixture | undefined, rows: rows as Record<string, Row> };
}

/** The fixture first, then the rows in key order: a re-record's diff reads row by row. */
export function serialiseBaseline(baseline: Baseline): string {
  const rows = Object.entries(baseline.rows).sort(([a], [b]) => a.localeCompare(b));
  const all: Record<string, Row | Fixture> = {};
  if (baseline.fixture !== undefined) all[FIXTURE_KEY] = baseline.fixture;
  for (const [key, row] of rows) all[key] = row;
  return JSON.stringify(all, null, 2) + '\n';
}

export function sameFixture(a: Fixture | undefined, b: Fixture): boolean {
  return a !== undefined && (Object.keys(b) as (keyof Fixture)[]).every((k) => a[k] === b[k]);
}

export interface RowContext {
  worstShifts: string;
  lastRequests: string;
  lastDupes: string;
}

/**
 * Every reason `row` (a run's per-route medians) fails against its baseline row, as messages; empty is green.
 * A key with NO row fails (it asserts nothing otherwise, and that is how a deleted row or a route whose key stopped matching the
 * `<id>` pattern would pass for ever). `compare: false` (the run's data is not the baseline's) keeps only that structural check.
 */
export function ratchetFailures(key: string, prior: Row | undefined, row: Row, ctx: RowContext, compare: boolean): string[] {
  if (prior === undefined) {
    return [`${key}: no baseline row in smoothness-baseline.json; re-run with SMOOTHNESS_RECORD=1 on this data and commit the row`];
  }
  if (!compare) return [];
  const out: string[] = [];
  if (row.cls > Math.max(prior.cls, SWAP_BUDGET)) out.push(`${key} CLS ${row.cls} over the baseline ${prior.cls}; worst shifts ${ctx.worstShifts}`);
  if (row.requests > prior.requests) out.push(`${key} requests ${row.requests} over the baseline ${prior.requests}: ${ctx.lastRequests}`);
  if (row.duplicates > prior.duplicates) out.push(`${key} duplicate reads ${row.duplicates} over the baseline ${prior.duplicates}: ${ctx.lastDupes}`);
  if (row.swapShiftCls > Math.max(prior.swapShiftCls, SWAP_BUDGET)) out.push(`${key} skeleton-swap shift ${row.swapShiftCls} over the baseline ${prior.swapShiftCls}`);
  return out;
}

/**
 * What a recording stores for one key. An existing row only ever goes DOWN (per field, the lower of the stored number and this run's
 * worst), so a recording on a regressed tip cannot raise the ceiling; an absent key takes the run's worst. `raise` (SMOOTHNESS_RECORD=raise)
 * is the explicit act that overwrites.
 */
export function recordRow(prior: Row | undefined, ceiling: Row, raise: boolean): Row {
  if (prior === undefined || raise) return { ...ceiling };
  return {
    cls: Math.min(prior.cls, ceiling.cls),
    requests: Math.min(prior.requests, ceiling.requests),
    duplicates: Math.min(prior.duplicates, ceiling.duplicates),
    swapShiftCls: Math.min(prior.swapShiftCls, ceiling.swapShiftCls),
  };
}
