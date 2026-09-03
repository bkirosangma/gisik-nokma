import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ClockHit = { file: string; line: number; match: string };

/** `packages/app-core/test/helpers` → two levels up is the package root. */
export const APP_CORE_SRC = fileURLToPath(new URL('../../src', import.meta.url));

/**
 * The calendar view-model's whole surface. Scoped rather than package-wide on
 * purpose: `workflow-builder/events.ts` and `precheck.ts` read the clock
 * legitimately — they stamp a `clientTime` on an event being submitted, which
 * IS a moment. What must not read it is anything that decides which day a
 * claim belongs to.
 *
 * `provenance.ts` is in the list because `claim-labels.ts` renders every
 * calendar date through its `formatDate`; a device getter appearing there
 * would put the calendar back on the viewer's laptop clock one import away.
 */
export const CLOCK_FREE_ROOTS: readonly string[] = [
  'claims',
  'calendar',
  'hierarchy',
  'filter',
  'provenance.ts',
];

/**
 * Reading the DEVICE, in the four spellings that reach it.
 *
 * `new Date()` with no argument and `Date.now()` are the clock itself.
 * `.getFullYear()` and its family are the device's TIMEZONE applied to an
 * instant — the getter pair `getUTCFullYear()`/`getFullYear()` differ by
 * exactly the mistake this plan exists to prevent, and they are one keystroke
 * apart. `toLocale*` and `Intl.DateTimeFormat` are the same mistake wearing a
 * formatter.
 *
 * Every pattern is ANCHORED on the `.` or the keyword, so prose that NAMES one
 * of these — and this package's docblocks name them constantly, deliberately,
 * to say they are forbidden — does not register as a use. The controls in the
 * test file keep that honest.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'clock read', pattern: /\bnew\s+Date\s*\(\s*\)/ },
  { label: 'clock read', pattern: /\bDate\s*\.\s*now\s*\(/ },
  {
    label: 'device timezone getter',
    pattern:
      /\.get(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds|TimezoneOffset)\s*\(/,
  },
  { label: 'device locale formatter', pattern: /\.toLocale[A-Za-z]*\s*\(/ },
  { label: 'device locale formatter', pattern: /\bIntl\s*\.\s*DateTimeFormat\b/ },
];

export function findClockReads(content: string): string[] {
  const labels = FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(
    ({ label }) => label,
  );
  return [...new Set(labels)];
}

/**
 * Hits AND the files actually read, for the reason `http-scan.ts` gives: a
 * scanner pointed at a directory that no longer exists reports "no clock reads
 * anywhere" in the same words as a clean tree.
 */
export type ClockScan = { hits: ClockHit[]; scanned: string[] };

export function scanCalendarSurface(): ClockScan {
  const hits: ClockHit[] = [];
  const scanned: string[] = [];
  for (const root of CLOCK_FREE_ROOTS) {
    const path = join(APP_CORE_SRC, root);
    // `statSync` throws on a missing path — the loud failure, not a silent zero.
    if (statSync(path).isDirectory()) walk(path, hits, scanned);
    else readFile(path, hits, scanned);
  }
  return { hits, scanned };
}

function walk(directory: string, hits: ClockHit[], scanned: string[]): void {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, hits, scanned);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) readFile(path, hits, scanned);
  }
}

function readFile(path: string, hits: ClockHit[], scanned: string[]): void {
  const file = relative(APP_CORE_SRC, path).split(sep).join('/');
  scanned.push(file);
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const match of findClockReads(line)) hits.push({ file, line: index + 1, match });
  });
}
