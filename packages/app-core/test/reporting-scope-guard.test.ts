import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IST_TIME_ZONE, NOTIFICATION_KINDS, notificationPayloadSchemaByKind } from '@gisik-nokma/domain';

/**
 * The repo root, FOUND rather than counted to.
 *
 * The obvious spelling — `resolve(new URL('.', import.meta.url).pathname,
 * '../../..')` — was written first and measured: under vitest's transform it
 * resolves to `/`, so every scan below walked `/packages/app-core/src`, threw
 * ENOENT, and the file went red for a reason that had nothing to do with the
 * product. A fixed number of `..` segments is a claim about where this test
 * file sits, and it silently becomes false the day someone moves it.
 *
 * Walking up to the workspace marker is a claim about the REPO instead, which
 * is the thing the scans are actually about. It throws rather than falling back
 * to a guess: a guard that cannot locate the tree must fail loudly, because the
 * failure it would otherwise produce is a clean pass over nothing.
 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) {
      throw new Error(`no pnpm-workspace.yaml above ${from} — this guard cannot locate the repo to scan`);
    }
    dir = up;
  }
}

const REPO_ROOT = findRepoRoot(resolve(process.cwd()));

/**
 * Every source tree that can answer "when does a day start" or invent a number
 * nobody claimed — the rule engine included, because the engine is where a day
 * claim is ACCEPTED, and `apps/web` included, because that is where days are
 * finally DRAWN.
 *
 * `apps/web/src` and `apps/web/app` are additions to the list this plan's text
 * wrote, and the plan's own justification for the rule-engine root is the
 * argument for them: "a root list that omits it is a guard that states an
 * invariant it does not enforce". Task 14 wired the project page's `today` and
 * the inbox's day formatting in `apps/web`, so a hard-coded zone or a second
 * day regex has had somewhere to land there since. Both roots were measured
 * clean before being added, so this widening closes a hole rather than papering
 * over a hit.
 *
 * What is deliberately NOT scanned, so the omissions are enumerated rather than
 * implied: `reference/` (frozen upstream code, corrected upstream, never here),
 * `packages/sync-client/src` and `packages/editor/src` (neither renders or
 * accepts a day; if either grows a date surface it belongs on this list),
 * `apps/web/e2e`, and every `*.test.ts`/`*.test.tsx` in the trees above — test
 * files legitimately write both needles while proving the product does not.
 */
const SCANNED_ROOTS = [
  'packages/app-core/src',
  'packages/domain/src',
  'packages/rule-engine/src',
  'packages/ui/src',
  'apps/server/src',
  'apps/web/src',
  'apps/web/app',
];
/**
 * SUBSTRING, not word-boundary — a fourth measured deviation from the plan's text.
 *
 * The plan writes `/\b(velocity|burndown|forecast)\b/i`. Measured while writing
 * 11.188's control: that pattern does NOT match `velocityChart`, because `C` is a
 * word character and `\b` therefore fails after `velocity`. So a file could
 * declare `const velocityChart = ...` and the guard whose stated property is
 * "no source file speaks the estimation vocabulary" would return clean — a check
 * passing for a reason unrelated to the property it names, which is the exact
 * failure class this file exists to prevent, committed by this file.
 *
 * Widening was measured before it was made: a substring scan over all seven
 * roots returns ZERO hits today, so this closes the hole at no cost and with no
 * allow-list. If it ever fires on an innocent identifier, the fix is to rename
 * the identifier — the three words have no legitimate use in this product, which
 * is the whole premise of spec §7.
 */
const FORBIDDEN = /(velocity|burndown|forecast)/i;

/**
 * The one file allowed to state the zone and the day shape (Plan 1, Task 4a).
 * The two constants below are SEARCH NEEDLES, not validators — this file
 * matches text, it never tests a date. The zone needle is built from
 * IST_TIME_ZONE so the scan cannot drift from the constant it is protecting.
 *
 * The day needle is the WHOLE anchored literal, deliberately. `envelope.ts`'s
 * ISO_DATETIME_REGEX legitimately begins /^\d{4}-\d{2}-\d{2}T… — it is the one
 * origin of the INSTANT shape, exactly as ist-day.ts is the one origin of the
 * DAY shape — and a fragment needle would flag it and invite someone to delete
 * the wrong thing. The trailing `$/` is what separates a day from an instant,
 * here and in the product.
 */
const TIME_ORIGIN = 'packages/domain/src/ist-day.ts';
const ZONE_LITERAL = `'${IST_TIME_ZONE}'`;
const DAY_REGEX_LITERAL = String.raw`/^\d{4}-\d{2}-\d{2}$/`;

/**
 * No try/catch around a missing root, and no `continue` that treats one as
 * "trivially clean" — that is the shape in which this whole file passes while
 * scanning nothing. Every root above exists today (measured: 274 non-test
 * source files across the seven), so a throw here is a real answer: someone
 * moved a tree and the guard needs updating, which is exactly the moment you
 * want to be told.
 */
function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** Every scanned file, as `repo-relative:line` for any line matching `hit`. */
function offendersWhere(hit: (line: string) => boolean, skipOrigin: boolean): string[] {
  const offenders: string[] = [];
  for (const root of SCANNED_ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      if (skipOrigin && file.endsWith(TIME_ORIGIN)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      const at = lines.findIndex(hit);
      // The relative path, so a failure names a site you can open rather than
      // an absolute path that differs on every machine and in CI.
      if (at !== -1) offenders.push(`${file.slice(REPO_ROOT.length + 1)}:${at + 1}`);
    }
  }
  return offenders;
}

/**
 * THE CONTROL FOR EVERY NULL ABOVE, and the reason it is a separate describe.
 *
 * Each assertion in this file is `expect(offenders).toEqual([])` — a shape that
 * passes just as happily when the walker reached no files, when the needle
 * stopped matching the constant it was built from, or when a root quietly moved.
 * An empty result is only evidence if the same machinery can be shown producing
 * a NON-empty one, so these two cases stand the scans up against a hit that must
 * exist: the declaration site itself.
 */
describe('the scans can see what they forbid (controls — without these, every null above is free)', () => {
  it('11.178 both needles match at the declaration site, so an empty scan means absence and not a stale needle', () => {
    const declared = readFileSync(join(REPO_ROOT, TIME_ORIGIN), 'utf8');
    expect(declared).toContain(ZONE_LITERAL);
    expect(declared).toContain(DAY_REGEX_LITERAL);

    // And the walker actually reaches that file — the needle being right is
    // worth nothing if the traversal never arrives at a file containing it.
    const reached = walk(join(REPO_ROOT, 'packages/domain/src')).some((f) => f.endsWith(TIME_ORIGIN));
    expect(reached, 'the walker never reached the one file that declares the zone').toBe(true);

    // The origin exclusion is doing work rather than decorating: with it lifted,
    // the zone scan finds exactly that file and nothing else.
    expect(offendersWhere((line) => line.includes(ZONE_LITERAL), false)).toEqual([`${TIME_ORIGIN}:18`]);
  });

  /**
   * 11.188 — the control this describe's own title PROMISED and did not have.
   *
   * The heading above says "THE CONTROL FOR EVERY NULL ABOVE". It was not true:
   * 11.178 controls the zone and day needles, and nothing controlled FORBIDDEN.
   * Measured at the final review — replacing the pattern with
   * `/(velocityZZ|burndownZZ|forecastZZ)/i` leaves every other case GREEN, so
   * 11.180's empty result would have survived the needle rotting away entirely.
   *
   * Each alternative is asserted separately rather than through one string
   * containing all three, because a single probe passes while two of the three
   * arms are dead. Both the bare word and the camelCase compound are asserted,
   * the compound being the direct witness on the widening above. And the
   * negative cases are here because a pattern matching everything would satisfy
   * every positive probe while making 11.180 fail for a reason unrelated to scope.
   */
  it('11.188 the estimation needle still matches the words it names, and not ordinary source', () => {
    for (const word of ['velocity', 'burndown', 'forecast']) {
      expect(FORBIDDEN.test(`// ${word} of the team`), `FORBIDDEN no longer matches "${word}"`).toBe(true);
      expect(
        FORBIDDEN.test(`const ${word}Chart = compute();`),
        `FORBIDDEN no longer matches the compound "${word}Chart" — the word-boundary regression`,
      ).toBe(true);
    }
    // Case-insensitive, as the /i says — a `Burndown` identifier is the same defect.
    expect(FORBIDDEN.test('function renderBurndown() {}')).toBe(true);
    // Not matching everything: ordinary source must NOT trip it.
    expect(FORBIDDEN.test("const claimed = row.fields['dueDate'];")).toBe(false);
    expect(FORBIDDEN.test('import { istDayOf } from "@gisik-nokma/domain";')).toBe(false);
  });

  it('11.179 every scanned root yields source files — a root that walks up empty would make its scan vacuous', () => {
    for (const root of SCANNED_ROOTS) {
      expect(walk(join(REPO_ROOT, root)).length, `${root} yielded no source files`).toBeGreaterThan(0);
    }
  });
});

describe('reporting v1 scope guard (spec §7: nothing the record does not contain)', () => {
  it('11.180 no client or server source speaks the estimation vocabulary', () => {
    expect(offendersWhere((line) => FORBIDDEN.test(line), false)).toEqual([]);
  });

  it('11.181 the notification vocabulary is closed over exactly the five kinds — no room for a computed-urgency kind to creep in', () => {
    expect(Object.keys(notificationPayloadSchemaByKind).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });
});

describe('time has one origin (owner decision: time is Asia/Kolkata)', () => {
  it('11.182 no file but ist-day.ts writes the zone as a literal — views import IST_TIME_ZONE', () => {
    // A hard-coded zone is a second answer to "which clock is this?", and the
    // day it disagrees about is the day a deadline moves.
    expect(offendersWhere((line) => line.includes(ZONE_LITERAL), true)).toEqual([]);
  });

  it('11.183 no file but ist-day.ts re-declares the day shape — everyone imports IST_DAY_REGEX', () => {
    // Three copies of one regex is three chances for the calendar, the schema
    // and the notification to disagree about what a day claim looks like.
    expect(offendersWhere((line) => line.includes(DAY_REGEX_LITERAL), true)).toEqual([]);
  });

  it('11.184 the zone string every view formats with comes from the domain, and is the real IANA name', () => {
    expect(IST_TIME_ZONE).toBe('Asia/Kolkata');
  });
});
