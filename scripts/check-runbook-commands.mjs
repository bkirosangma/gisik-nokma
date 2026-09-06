#!/usr/bin/env node
/**
 * Every command `docs/runbook.md` names must actually resolve.
 *
 * WHY THIS EXISTS. A runbook is prose, and prose cannot fail. It is the one
 * artefact in this repo that can rot completely while every test stays green —
 * and it did: the first draft named `ops:sweep-orphans`, which has never
 * existed (the script is `sweep:orphans`), and invoked `verify:projections` in
 * a form that answered `ConfigError` because the tool demanded three auth
 * variables it never read. Both were found by hand. This makes the next one
 * fail a build instead.
 *
 * WHAT IT DOES AND DOES NOT PROVE. It proves no named command is a typo or a
 * ghost. It does NOT prove a procedure is correct, that the arguments are
 * right, or that the steps are in the right order — those need a human or a
 * drill. Claiming more than that would make this the very kind of check the
 * repo keeps catching.
 *
 * It is deliberately a SEPARATE CI step from `check:env` and reports on its own
 * line, for the same reason `check-case-ids` is: a check folded into another
 * check's exit code is a check nobody reads.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNBOOK = join(ROOT, 'docs/runbook.md');

/** `pnpm --filter <pkg> run <script>` and `pnpm <script>` / `pnpm run <script>`. */
const FILTERED = /pnpm\s+--filter\s+(@[\w/-]+)\s+run\s+([\w:-]+)/g;
const ROOT_SCRIPT = /pnpm\s+(?:run\s+)?([a-z]+:[\w-]+)/g;
/** Repo-relative script paths, e.g. `scripts/restore.sh`. */
const SCRIPT_PATH = /(?:^|[\s`'"(])((?:scripts|deploy)\/[\w./-]+\.(?:sh|mjs|js|ts|yaml|md))/g;

function scriptsOf(pkgRelDir) {
  const p = join(ROOT, pkgRelDir, 'package.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')).scripts ?? {};
}

/** workspace package name -> directory, read from the workspace itself. */
function packageDirs() {
  const dirs = {};
  for (const d of ['apps/server', 'apps/web', 'apps/mobile', 'apps/desktop',
                   'packages/domain', 'packages/app-core', 'packages/rule-engine',
                   'packages/sync-client', 'packages/editor', 'packages/ui']) {
    const p = join(ROOT, d, 'package.json');
    if (existsSync(p)) dirs[JSON.parse(readFileSync(p, 'utf8')).name] = d;
  }
  return dirs;
}

function collect(text) {
  const found = { filtered: [], root: [], paths: [] };
  for (const m of text.matchAll(FILTERED)) found.filtered.push({ pkg: m[1], script: m[2] });
  for (const m of text.matchAll(ROOT_SCRIPT)) found.root.push(m[1]);
  for (const m of text.matchAll(SCRIPT_PATH)) found.paths.push(m[1]);
  return found;
}

function check(text, label) {
  const dirs = packageDirs();
  const rootScripts = scriptsOf('.') ?? {};
  const found = collect(text);
  const problems = [];

  for (const { pkg, script } of found.filtered) {
    const dir = dirs[pkg];
    if (dir === undefined) { problems.push(`${label}: unknown workspace package "${pkg}"`); continue; }
    const scripts = scriptsOf(dir) ?? {};
    if (!(script in scripts)) {
      const near = Object.keys(scripts).filter((k) => k.split(':').pop() === script.split(':').pop());
      problems.push(
        `${label}: "pnpm --filter ${pkg} run ${script}" — no such script in ${dir}/package.json` +
          (near.length ? ` (did you mean ${near.map((n) => `"${n}"`).join(' or ')}?)` : ''),
      );
    }
  }
  for (const script of found.root) {
    // A root-script regex also catches the filtered ones' trailing name; skip those.
    if (found.filtered.some((f) => f.script === script)) continue;
    if (!(script in rootScripts)) problems.push(`${label}: "pnpm ${script}" — no such script in the root package.json`);
  }
  for (const rel of found.paths) {
    if (!existsSync(join(ROOT, rel))) problems.push(`${label}: "${rel}" — no such file`);
  }
  return { problems, counted: found.filtered.length + found.root.length + found.paths.length };
}

// SELF-TEST FIRST, against planted defects, so a run that finds nothing is
// distinguishable from a run whose matchers never fired. Without this, deleting
// a regex would make the real sweep report a clean zero.
const PLANTED = [
  'pnpm --filter @gisik-nokma/server run ops:definitely-not-a-script',
  'pnpm --filter @gisik-nokma/nonexistent run build',
  'pnpm check:definitely-not-a-root-script',
  '`scripts/definitely-not-a-file.sh`',
].join('\n');
const selfTest = check(PLANTED, 'self-test');
if (selfTest.problems.length !== 4) {
  console.error(
    `check-runbook-commands: SELF-TEST FAILED — expected 4 planted defects, caught ${selfTest.problems.length}.`,
  );
  for (const p of selfTest.problems) console.error(`  ${p}`);
  console.error('  The matchers are not firing; a clean real sweep would mean nothing.');
  process.exit(1);
}
// And the positive control's mirror: the real commands must PASS the same matchers.
const PLANTED_OK = 'pnpm --filter @gisik-nokma/server run seed:cc\npnpm check:env\n`scripts/restore.sh`';
if (check(PLANTED_OK, 'self-test').problems.length !== 0) {
  console.error('check-runbook-commands: SELF-TEST FAILED — known-good commands were reported as broken.');
  process.exit(1);
}
console.log('check-runbook-commands: self-test passed (4 planted defects caught, 3 known-good accepted)');

if (!existsSync(RUNBOOK)) {
  console.error(`check-runbook-commands: ${RUNBOOK} does not exist`);
  process.exit(1);
}
const { problems, counted } = check(readFileSync(RUNBOOK, 'utf8'), 'docs/runbook.md');
console.log(`check-runbook-commands: real sweep -- ${counted} commands/paths named in docs/runbook.md`);
if (counted === 0) {
  console.error('check-runbook-commands: the runbook named ZERO commands — the matchers found nothing to check.');
  process.exit(1);
}
if (problems.length > 0) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`check-runbook-commands: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`check-runbook-commands: ok (all ${counted} resolve)`);
