#!/usr/bin/env node
/**
 * No migration may be numbered below one that already exists on the base ref.
 *
 * WHY THIS EXISTS. On 2026-09-18 a migration was added with a prefix BELOW one
 * already on `main` (`1789300000000_proj-tickets-reopened-at.sql`, landed while
 * `1789400000000_workspace-settings-auto-close.sql` was already applied). It
 * could never run on any database that had the higher one — and NOTHING failed.
 * The fix that eventually renamed it is commit `73c40ea3`, whose own subject
 * says the migration "could never run on any database that had Task 6".
 *
 * WHY NOTHING CAUGHT IT, and why this file's shape is what it is.
 * `node-pg-migrate`'s `checkOrder` compares the applied list against the sorted
 * file list POSITION BY POSITION and throws `Not run migration X is preceding
 * already run migration Y`. A FRESH database applies every migration cleanly in
 * numerical order, so the whole server suite — 1,548 tests — is green on the
 * broken tree by construction. The hot stack applies migrations only at
 * container start and its entrypoint aborts on a failed migration, so the same
 * tree that passes every test takes the running app down until it is renamed.
 * **The gate proves the repo; it cannot prove a database that has already run
 * something.** The property is a fact about the file set versus what has been
 * applied, and this is the only place that can hold it.
 *
 * WHAT IT PROVES. That every migration present now and absent from the base ref
 * carries a numeric prefix strictly above the highest prefix on the base ref.
 *
 * THE PREFIX CONVENTION, RECORDED HERE BECAUSE NOTHING ELSE SAID IT (E6-7,
 * 2026-09-21). Measured over the last 13 migrations, `1788600000000` …
 * `1790000000000`: every one is a multiple of `1e8` ms, and of the 12 gaps
 * between neighbours 10 are `1e8` and 2 are `2e8`. The sequence is therefore a
 * COUNTER — hand-written, stepped by a unit of its own — and not the wall
 * clock: `1790000000000` was committed 21 h before the instant its own prefix
 * names, while `1789800000000` was committed 25 h after its own. It runs both
 * ways, which is what makes it a window rather than a lag.
 *
 * THE WINDOW, AND WHY THE REFUSAL HAS TO EXPLAIN ITSELF. The plans record two
 * creation shapes, and which one a developer meets depends on the plan they
 * read: a `node-pg-migrate create` step, which stamps the clock
 * (`docs/superpowers/plans/2026-08-20-01-foundation-ledger.md:1902`), and plan
 * files that name the migration with an explicit prefix
 * (`docs/superpowers/plans/2026-08-20-03-tickets-hierarchy.md:3348` — that one
 * `1755672000000`). While the counter's head sits ahead of the wall clock, a
 * clock stamp is numbered BELOW a migration already applied and arrives at this
 * check refused — correctly, and with no way for the developer to know from the
 * message alone that the shape the tool produces is not the shape this repo
 * commits. So the below-max refusal states the convention and the remedy. What
 * it does NOT do is decide the convention: dropping the counter for the
 * generator's stamp is a process choice, and this file records the one the repo
 * practises rather than making that choice on the repo's behalf.
 *
 * WHAT IT DOES NOT PROVE — named, not implied:
 *   - It does not prove a migration is CORRECT, idempotent, or reversible.
 *     This is an ordering property only.
 *   - It does not refuse a migration REMOVED or RENAMED from the base set. A
 *     rename of a not-yet-applied migration is legitimate and indistinguishable
 *     from this side, so refusing removals would block a real workflow to catch
 *     a case it cannot see. `node-pg-migrate` refuses a deleted applied
 *     migration itself, on `down`.
 *   - It cannot see a lower-numbered migration already merged to the base ref
 *     BEFORE this branch existed — that is the base ref's own business, and it
 *     is the state the base ref's own run of this check reports.
 *
 * THE BASELINE MUST BE THE BRANCH'S OWN BASE, and getting that wrong is a FALSE
 * ACCEPT rather than a false refusal. Found by review and measured: a branch
 * stacked on another branch that adds `1790000000000`, itself adding
 * `1789600000000`, is ACCEPTED against `origin/main` (max `1789500000000`) and
 * REFUSED against its actual base. When both merge the file set holds
 * `1789600000000` while the applied list already holds `1790000000000`, so
 * `checkOrder` throws — the exact outage this check exists to prevent. This is
 * why the CI job passes `--base origin/${{ github.base_ref }}` rather than
 * accepting the default; 14 of the last 400 merges here were based on a
 * non-main branch, so the shape is used in this repo and not hypothetical.
 *
 * THE BASELINE IS THE BASE REF'S TIP, NOT THE MERGE BASE. The merge base is the
 * tempting choice and it is the weaker one: it cannot see the case that actually
 * broke the stack, where the base gains a higher-numbered migration while a
 * branch is open. That branch's migration is above its own merge base and below
 * the tip, and only the tip comparison refuses it — correctly, because the repo
 * state after merge is two migrations out of order.
 *
 * The whole comparison is a property of the migrations DIRECTORY read through
 * one reader, so the self-test plants fixture DIRECTORIES rather than arrays:
 * a test that exercises a hand-built list proves the comparison and not the
 * reader. **The reader's FILTER is the load-bearing half** — deleting the
 * `^\..*` ignore pattern or the `isFile()` test is caught by the self-test. Its
 * SORT is not load-bearing for any verdict (the ceiling is a max, the new set
 * is a set difference, and the duplicate map is order-free); it mirrors the
 * runner's order so that what this reports is what the runner will do, and it
 * is witnessed by the test suite's explicit array assertion rather than by the
 * self-test. Review measured that distinction — deleting the sort leaves this
 * script's own self-test passing — and it is stated here rather than implied.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_REL = 'apps/server/migrations';
const MIGRATIONS_DIR = join(ROOT, MIGRATIONS_REL);

/** The ref a migration must stay above. `origin/main`, not `main`: worktrees
 * share one object store and a local `main` is whatever it was last set to. */
const DEFAULT_BASE_REF = 'origin/main';

/**
 * `node-pg-migrate` 7.9.1's `getNumericPrefix`, mirrored EXACTLY — including
 * the two shapes it special-cases, because a divergence here is a silent
 * wrong answer rather than a failure.
 *
 * The 17-digit `utc` form is the one that bites: `20260101000000000` is
 * 2026-01-01T00:00:00.000Z, i.e. 1767225600000. A naive `Number()` reads it as
 * 2.026e16 — larger than any 13-digit epoch — and would ACCEPT a migration that
 * in fact sorts below everything. Planted defect 5 in the self-test is exactly
 * that file, and it is refused.
 *
 * A prefix the runner cannot parse falls through to `Number(prefix) || 0`, so
 * `backfill-tickets.sql` is 0 and sorts ahead of every real migration, while
 * `1e99_sci.sql` is 1e99 and sorts last. **This mirrors that last line rather
 * than returning a bare 0**, found by review: the earlier version returned 0 for
 * every non-`\d+` prefix and so REFUSED `1e99_sci.sql`, which the runner would
 * happily run last. That divergence could only ever have produced false
 * refusals, never a false accept, but it made the docblock's own claim of an
 * exact mirror false, and an instrument that refuses what the runner accepts is
 * still an instrument that lies about the runner.
 */
const SEPARATOR = '_';

/**
 * The sentence the below-max refusal MUST carry. Held as a constant so the
 * message and the self-test's required-name list cannot drift apart, and pinned
 * by that list so the record is load-bearing rather than decoration: deleting
 * the sentence from the refusal reddens the self-test.
 *
 * WHY THE RECORD IS IN A REFUSAL at all. The convention below is unrecorded
 * anywhere else a developer creating a migration would look, so the moment they
 * meet it is the tool's own `node-pg-migrate create` stamp arriving here
 * refused. The message has to say what to do instead of the stamp.
 */
export const CONVENTION_SENTENCE = 'This repo hand-numbers its migrations';

export function numericPrefix(fileName) {
  const raw = fileName.split(SEPARATOR)[0];
  if (raw && /^\d+$/.test(raw)) {
    if (raw.length === 13) return Number(raw);
    if (raw.length === 17) {
      const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}.${raw.slice(14, 17)}Z`;
      // Deliberately NOT falling back to `Number(raw)` on an invalid date: the
      // runner returns NaN here, NaN fails every `>` comparison, and a refusal
      // is the conservative direction for a prefix nobody can date.
      return new Date(iso).valueOf();
    }
    return Number(raw);
  }
  return Number(raw) || 0;
}

/**
 * THE READER. Both the baseline and the current directory go through this, and
 * the self-test's fixture directories go through this — which is the only way
 * the filter and the sort below are covered by anything at all.
 *
 * The filter mirrors the runner's: `isFile() || isSymbolicLink()`, and the
 * default ignore pattern `^\..*`. The sort is `compareFileNamesByTimestamp`
 * (numeric prefix) with `localeCompareStringsNumerically` as the tie-break.
 */
export function readMigrationNames(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => (d.isFile() || d.isSymbolicLink()) && !/^\..*/.test(d.name))
    .map((d) => d.name)
    .sort((a, b) => {
      const delta = numericPrefix(a) - numericPrefix(b);
      if (!Number.isNaN(delta) && delta !== 0) return delta;
      return a.localeCompare(b, undefined, {
        usage: 'sort',
        numeric: true,
        sensitivity: 'variant',
        ignorePunctuation: true,
      });
    });
}

/**
 * The rule, over two real directories.
 *
 * @returns {{problems: string[], baseMax: number, newFiles: string[], current: string[]}}
 */
export function checkMigrationOrder({ baseDir, currentDir }) {
  const problems = [];

  let base;
  try {
    base = readMigrationNames(baseDir);
  } catch (err) {
    return {
      problems: [
        `baseline directory ${baseDir} could not be read (${err?.code ?? err?.message}) — with no baseline there is no maximum to be above, so NOTHING can be concluded and this check refuses rather than reporting a vacuous clean`,
      ],
      baseMax: Number.NaN,
      newFiles: [],
      current: [],
    };
  }

  if (base.length === 0) {
    return {
      problems: [
        `baseline directory ${baseDir} holds no migrations — an empty baseline would make every file "new" and above a maximum of none, so this check refuses rather than reporting a vacuous clean`,
      ],
      baseMax: Number.NaN,
      newFiles: [],
      current: [],
    };
  }

  const current = readMigrationNames(currentDir);
  if (current.length === 0) {
    return {
      problems: [`${currentDir} holds no migrations — the reader found nothing, which is an instrument failure, not a clean tree`],
      baseMax: Number.NaN,
      newFiles: [],
      current: [],
    };
  }

  const basePrefixes = base.map((f) => [f, numericPrefix(f)]);
  const undateable = basePrefixes.filter(([, p]) => Number.isNaN(p));
  if (undateable.length > 0) {
    problems.push(
      `baseline holds a file whose prefix is not a usable timestamp: ${undateable.map(([f]) => f).join(', ')} — the runner reads it as NaN, so every comparison below would be meaningless`,
    );
  }
  const baseMax = basePrefixes.reduce(
    (max, [, p]) => (Number.isNaN(p) ? max : Math.max(max, p)),
    Number.NEGATIVE_INFINITY,
  );

  const baseSet = new Set(base);
  const newFiles = current.filter((f) => !baseSet.has(f));

  // Two migrations sharing a number: the runner falls back to a filename
  // tie-break, so which one runs first is not determined by the number at all.
  const byPrefix = new Map();
  for (const f of current) {
    const p = numericPrefix(f);
    if (!byPrefix.has(p)) byPrefix.set(p, []);
    byPrefix.get(p).push(f);
  }
  for (const [p, files] of byPrefix) {
    if (files.length > 1) {
      problems.push(
        `two migrations in ${MIGRATIONS_REL} share the numeric prefix ${p}: ${files.join(', ')} — the runner orders them by filename as a tie-break, so which runs first is not determined by the number`,
      );
    }
  }

  for (const f of newFiles) {
    const p = numericPrefix(f);
    if (!(p > baseMax)) {
      problems.push(
        `new migration ${f} has prefix ${p}, which is NOT strictly above ${baseMax} — the highest prefix already present on the base ref. ` +
          `A migration numbered below one that has been applied can never run: node-pg-migrate's checkOrder refuses it as "preceding already run migration", ` +
          `while a fresh test database applies both cleanly, so no test and no gate can see it. ` +
          `${CONVENTION_SENTENCE}: the sequence is a counter, by a rounded step of its own, and it can ` +
          `sit ahead of the wall clock — so a stamp fresh from \`node-pg-migrate create\` lands below ` +
          `the head while it does, and this refusal is what that stamp meets. ` +
          `Renumber it above ${baseMax}, keeping the rounded shape the neighbours share.`,
      );
    }
  }

  return { problems, baseMax, newFiles, current };
}

// ---------------------------------------------------------------------------
// Self-test fixtures. Real DIRECTORIES, read by the SAME readMigrationNames.
// ---------------------------------------------------------------------------

const BASE = ['1789400000000_a.sql', '1789500000000_b.sql', '1789600000000_c.sql'];
const BASE_MAX = 1789600000000;

/** Each must produce EXACTLY the declared number of problems, each naming its
 * own site. The count is declared per case rather than fixed at one because
 * one bad file can genuinely trip two independent rules — see the `expect: 2`
 * case below, where an equal prefix is BOTH a duplicate and not-strictly-above.
 * An earlier draft of this fixture asserted 1 and the run refused it; the
 * fixture was wrong, not the check, and the count is now written down. */
export const PLANTED = [
  {
    name: 'a new migration numbered below the highest already present',
    base: BASE,
    current: [...BASE, '1789550000000_x.sql'],
    expect: 1,
    names: ['1789550000000_x.sql', CONVENTION_SENTENCE],
  },
  {
    name: 'a new migration numbered EQUAL to the highest already present (not strictly above)',
    base: BASE,
    current: [...BASE, '1789600000000_d.sql'],
    expect: 2,
    names: ['1789600000000_d.sql', 'share the numeric prefix'],
  },
  {
    name: 'a new migration with no numeric prefix at all — the runner reads it as 0',
    base: BASE,
    current: [...BASE, 'backfill-tickets.sql'],
    expect: 1,
    names: ['backfill-tickets.sql'],
  },
  {
    name: 'two new migrations sharing one prefix',
    base: BASE,
    current: [...BASE, '1789700000000_x.sql', '1789700000000_y.sql'],
    expect: 1,
    names: ['1789700000000_x.sql', 'share the numeric prefix'],
  },
  {
    // THE PARSER DEFECT. 20260101000000000 is 1767225600000 — far BELOW the
    // baseline's 1789600000000. `Number()` would read it as 2.026e16 and accept
    // it, so this fixture fails a check that only compares numbers.
    name: 'a 17-digit utc-format prefix whose instant is BELOW the highest present',
    base: BASE,
    current: [...BASE, '20260101000000000_backfill.sql'],
    expect: 1,
    names: ['20260101000000000_backfill.sql', '1767225600000'],
  },
  {
    name: 'an empty baseline, which must refuse rather than conclude',
    base: [],
    current: ['1789700000000_x.sql'],
    expect: 1,
    names: ['holds no migrations'],
  },
];
export const EXPECTED_PLANTED = PLANTED.length;

/** Each must produce ZERO problems — the instrument can return green for the
 * right reason, and can be told apart from an instrument that returns green
 * because it never looked. */
export const KNOWN_GOOD = [
  {
    name: 'one new migration strictly above the highest present',
    base: BASE,
    current: [...BASE, '1789700000000_x.sql'],
  },
  { name: 'no new migrations at all', base: BASE, current: [...BASE] },
  {
    name: 'three new migrations, all above and all distinct',
    base: BASE,
    current: [...BASE, '1789700000000_x.sql', '1789800000000_y.sql', '1789900000000_z.sql'],
  },
  {
    // Proves the READER's ignore pattern, not the comparison: if `^\..*` were
    // dropped, `.DS_Store` would arrive as a new file with prefix 0 and be
    // refused, and this case would fail.
    name: 'a hidden dotfile in the current directory',
    base: BASE,
    current: [...BASE, '.DS_Store'],
  },
  {
    name: 'a migration REMOVED from the current directory (removal is not this rule)',
    base: BASE,
    current: BASE.filter((f) => f !== '1789500000000_b.sql'),
  },
];
export const EXPECTED_KNOWN_GOOD = KNOWN_GOOD.length;

// ---------------------------------------------------------------------------

function writeFixtureDir(root, label, names, fixtures) {
  const dir = join(root, label);
  mkdirSync(dir, { recursive: true });
  for (const n of names) writeFileSync(join(dir, n), '-- fixture\n');
  fixtures.push(dir);
  return dir;
}

/** Materialise a ref's migrations directory into a real directory of empty
 * files. Only NAMES matter, and going through a real directory is what keeps
 * the baseline on the same reader as the current tree.
 *
 * NOT `-r`, and blobs only, so this LISTING matches what `readMigrationNames`
 * can see. Found by review: with `-r` a subdirectory under the baseline's
 * migrations drew a `writeFileSync` ENOENT and an uncaught stack — loud, so
 * never a false accept, but the designed "refusing to conclude" message never
 * printed and the two halves disagreed about what a migration is. */
export function materializeRef(ref, dir) {
  const out = execFileSync('git', ['ls-tree', `${ref}:${MIGRATIONS_REL}`], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const names = out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta = '', name = ''] = line.split('\t');
      // `<mode> <type> <sha>\t<name>` — `blob` covers regular files AND
      // symlinks, exactly what the reader's `isFile() || isSymbolicLink()`
      // admits; `tree` is a subdirectory the reader skips.
      return { type: meta.split(/\s+/)[1], name };
    })
    .filter((e) => e.type === 'blob')
    .map((e) => e.name);
  for (const n of names) writeFileSync(join(dir, n), '');
  return names.length;
}

function resolveBaseRef(preferred) {
  for (const candidate of [preferred, 'main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${candidate}^{commit}`], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  const argBase = process.argv.indexOf('--base');
  const requestedBase = argBase === -1 ? DEFAULT_BASE_REF : process.argv[argBase + 1];

  const scratch = mkdtempSync(join(tmpdir(), 'check-migration-order-'));
  const fixtures = [];
  try {
    // ---- SELF-TEST FIRST, so a run that finds nothing is distinguishable from
    // a run whose reader never fired.
    let failures = 0;
    for (const c of PLANTED) {
      const baseDir = writeFixtureDir(scratch, `base-${fixtures.length}`, c.base, fixtures);
      const currentDir = writeFixtureDir(scratch, `cur-${fixtures.length}`, c.current, fixtures);
      const { problems } = checkMigrationOrder({ baseDir, currentDir });
      const joined = problems.join('\n');
      const wrongCount = problems.length !== c.expect;
      const unnamed = c.names.filter((n) => !joined.includes(n));
      if (wrongCount || unnamed.length > 0) {
        failures += 1;
        console.error(
          `check-migration-order: SELF-TEST FAILED — planted defect "${c.name}" produced ${problems.length} problem(s), expected ${c.expect}${unnamed.length > 0 ? `; nothing named ${unnamed.map((n) => `"${n}"`).join(' or ')}` : ''}.`,
        );
        for (const p of problems) console.error(`    ${p}`);
      }
    }
    for (const c of KNOWN_GOOD) {
      const baseDir = writeFixtureDir(scratch, `base-${fixtures.length}`, c.base, fixtures);
      const currentDir = writeFixtureDir(scratch, `cur-${fixtures.length}`, c.current, fixtures);
      const { problems } = checkMigrationOrder({ baseDir, currentDir });
      if (problems.length !== 0) {
        failures += 1;
        console.error(
          `check-migration-order: SELF-TEST FAILED — known-good case "${c.name}" was refused:`,
        );
        for (const p of problems) console.error(`    ${p}`);
      }
    }
    if (failures > 0) {
      console.error('  The reader or the comparison is not behaving as it claims.');
      process.exit(1);
    }
    console.log(
      `check-migration-order: self-test passed (${EXPECTED_PLANTED} planted defects caught, ${EXPECTED_KNOWN_GOOD} known-good accepted)`,
    );

    // ---- THE REAL SWEEP.
    const ref = resolveBaseRef(requestedBase);
    if (ref === null) {
      console.error(`check-migration-order: cannot resolve ${requestedBase} (nor a local main).`);
      console.error('  The baseline ref is the whole comparison, so this check will not guess one.');
      console.error('  Run `git fetch origin` and try again, or pass `--base <ref>`.');
      process.exit(1);
    }

    const baseDir = join(scratch, 'real-base');
    mkdirSync(baseDir, { recursive: true });
    let materialized;
    try {
      materialized = materializeRef(ref, baseDir);
    } catch (err) {
      // `git ls-tree <ref>:<path>` exits 128 for a path the ref does not hold,
      // so this branch -- not the `=== 0` guard below -- is the one a moved or
      // missing migrations directory actually reaches. Raw output is kept
      // because it names the failing revision and path.
      console.error(`check-migration-order: could not list ${ref}:${MIGRATIONS_REL}`);
      console.error(`  ${String(err?.stderr ?? err?.message ?? err).trim()}`);
      console.error('  Refusing to conclude: with no baseline there is no maximum to be above.');
      process.exit(1);
    }
    if (materialized === 0) {
      console.error(`check-migration-order: ${ref}:${MIGRATIONS_REL} materialised ZERO files.`);
      console.error('  Either the path moved or the ref is not what was expected; refusing to conclude.');
      process.exit(1);
    }

    const { problems, baseMax, newFiles, current } = checkMigrationOrder({
      baseDir,
      currentDir: MIGRATIONS_DIR,
    });

    console.log(
      `check-migration-order: ${MIGRATIONS_REL} — ${current.length} migration(s), ${newFiles.length} new against ${ref}, highest on ${ref} ${Number.isNaN(baseMax) ? 'unreadable' : baseMax}`,
    );
    for (const f of newFiles) console.log(`  new: ${f}`);
    if (problems.length > 0) {
      for (const p of problems) console.error(`  ${p}`);
      console.error(`check-migration-order: ${problems.length} problem(s)`);
      process.exit(1);
    }
    console.log(
      newFiles.length === 0
        ? `check-migration-order: ok (no migration is new against ${ref}; nothing to order)`
        : `check-migration-order: ok (all ${newFiles.length} new migration(s) numbered above ${baseMax})`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
