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
import { pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNBOOK = join(ROOT, 'docs/runbook.md');

/**
 * The matchers, widened after review measured what the first set MISSED. A
 * shape that is not matched is not checked, and the script then reports a
 * confident "all N resolve" — so every widening below closes a silent hole, not
 * a cosmetic one. Measured on a 19-line probe where every line named something
 * nonexistent: the first set caught 2 and let 17 through.
 *
 *   `--filter @pkg` was matched but `--filter=@pkg` was NOT — same intent,
 *   opposite outcome. `exec` and pnpm's no-`run` form were invisible. Root
 *   scripts REQUIRED a colon, so `pnpm build`, `pnpm run test` and
 *   `pnpm typecheck` — three of the root package's eight — were unreachable.
 *   `check:env:ghost` was truncated to `check:env` and passed. `.yml` was
 *   absent while `.yaml` was present. `node dist/...` was unchecked, which is
 *   exactly the form the runbook needs for in-container commands.
 */
const FILTERED = /pnpm\s+--filter[\s=]+(@[\w/-]+)\s+(?:run\s+|exec\s+)?([\w:.-]+)/g;
const ROOT_SCRIPT = /pnpm\s+(?:run\s+)?([\w:-]+)(?=[\s`'"$]|$)/g;
/** Repo-relative script paths. */
const SCRIPT_PATH =
  /(?:^|[\s`'"(])((?:scripts|deploy|apps|packages|docs)\/[\w./-]+\.(?:sh|mjs|js|ts|tsx|yaml|yml|json|sql|md))/g;
/** `node dist/...` / `node scripts/...`, the in-container and CI forms. */
const NODE_SCRIPT = /node\s+((?:dist|scripts|apps)\/[\w./-]+\.(?:mjs|js))/g;
/** pnpm subcommands that are not package scripts and must not be looked up. */
const PNPM_BUILTINS = new Set([
  'install', 'run', 'exec', 'add', 'remove', 'up', 'update', 'why', 'store',
  'dlx', 'create', 'init', 'link', 'unlink', 'list', 'outdated', 'prune',
  'rebuild', 'deploy', 'publish', 'pack', 'audit', 'licenses', 'config', 'test',
]);

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
  for (const m of text.matchAll(ROOT_SCRIPT)) {
    // `pnpm install` and friends are pnpm's own subcommands, not scripts.
    if (!PNPM_BUILTINS.has(m[1]) && !m[1].startsWith('--')) found.root.push(m[1]);
  }
  for (const m of text.matchAll(SCRIPT_PATH)) found.paths.push(m[1]);
  for (const m of text.matchAll(NODE_SCRIPT)) found.paths.push(m[1]);
  return found;
}

export function check(text, label) {
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
    // NO DEDUPE AGAINST THE FILTERED LIST. An earlier version skipped a root
    // invocation whose name collided with any filtered one, guarding a case
    // that cannot occur (`ROOT_SCRIPT` cannot match inside
    // `pnpm --filter @pkg run x`, because `--filter` follows `pnpm`
    // immediately). What it actually did was suppress a real check: a text
    // containing both `pnpm --filter @gisik-nokma/server run seed:cc` (valid)
    // and `pnpm seed:cc` (no such ROOT script) reported clean — while `counted`
    // still counted the skipped entry, so "all N resolve" included something
    // never checked.
    if (!(script in rootScripts)) problems.push(`${label}: "pnpm ${script}" — no such script in the root package.json`);
  }
  for (const rel of found.paths) {
    // `dist/...` is CONTAINER-relative, not repo-relative: it is what the
    // runbook must say for a command run inside the image, and it does not
    // exist in a checkout. Resolve it to the SOURCE that builds it, so the
    // reference is still checked rather than waved through — the honest form
    // of "this built artefact has something behind it".
    if (rel.startsWith('dist/')) {
      const src = join(ROOT, 'apps/server/src', rel.slice('dist/'.length).replace(/\.js$/, '.ts'));
      if (!existsSync(src)) {
        problems.push(`${label}: "${rel}" — no source builds it (looked for apps/server/src/…​.ts)`);
      }
      continue;
    }
    if (!existsSync(join(ROOT, rel))) problems.push(`${label}: "${rel}" — no such file`);
  }
  // BOTH numbers, because they differ and a reader takes one figure for "how
  // many things the runbook names". Review measured 12 raw against 10 distinct.
  const refs = [
    ...found.filtered.map((f) => `${f.pkg}#${f.script}`),
    ...found.root.map((r) => `root#${r}`),
    ...found.paths,
  ];
  return { problems, counted: refs.length, unique: new Set(refs).size };
}


// Importable without running: a test that wants `check`/`extractCheckedIds` must not
// also execute the CLI. Without this the whole sweep runs on import and, on a repo in
// a failing state, `process.exit(1)` would kill the importing vitest worker mid-run.
const executedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

export const PLANTED = [
  'pnpm --filter @gisik-nokma/server run ops:definitely-not-a-script',
  'pnpm --filter=@gisik-nokma/server run also:not-a-script',
  'pnpm --filter @gisik-nokma/server exec not-an-exec-script',
  'pnpm --filter @gisik-nokma/nonexistent run build',
  'pnpm check:definitely-not-a-root-script',
  'pnpm definitelynotaroot',
  'pnpm run alsonotaroot',
  '`scripts/definitely-not-a-file.sh`',
  '`deploy/do/definitely-not-a-file.yaml`',
  '`deploy/do/definitely-not-a-file.yml`',
  '`apps/server/definitely-not-a-file.ts`',
  '`docs/definitely-not-a-file.md`',
  'node dist/ops/definitely-not-a-file.js',
].join('\n');
export const EXPECTED_PLANTED = 13;

// And the positive control's mirror: the real commands must PASS the same matchers.
export const PLANTED_OK = [
  'pnpm --filter @gisik-nokma/server run seed:cc',
  'pnpm --filter=@gisik-nokma/server run seed:dev',
  'pnpm check:env',
  'pnpm build',
  'pnpm install --frozen-lockfile',
  '`scripts/restore.sh`',
  '`deploy/do/app.yaml`',
].join('\n');

if (executedDirectly) {
  // SELF-TEST FIRST, against planted defects, so a run that finds nothing is
  // distinguishable from a run whose matchers never fired. Without this, deleting
  // a regex would make the real sweep report a clean zero.
  // ONE PLANTED DEFECT PER SHAPE THE MATCHERS CLAIM TO COVER — not one per
  // matcher. Review's point: with four defects that all used `scripts/….sh`,
  // dropping `deploy/` from the path prefixes or `yaml` from its extensions left
  // every planted defect still caught and the control still accepted, while
  // `deploy/do/README.md` silently stopped being checked. A self-test that
  // exercises one shape per matcher licenses exactly that.
  const selfTest = check(PLANTED, 'self-test');
  if (selfTest.problems.length !== EXPECTED_PLANTED) {
    console.error(
      `check-runbook-commands: SELF-TEST FAILED — expected ${EXPECTED_PLANTED} planted defects, caught ${selfTest.problems.length}.`,
    );
    for (const p of selfTest.problems) console.error(`  ${p}`);
    console.error('  The matchers are not firing; a clean real sweep would mean nothing.');
    process.exit(1);
  }
  if (check(PLANTED_OK, 'self-test').problems.length !== 0) {
    console.error('check-runbook-commands: SELF-TEST FAILED — known-good commands were reported as broken.');
    process.exit(1);
  }
  console.log(
    `check-runbook-commands: self-test passed (${EXPECTED_PLANTED} planted defects caught, 7 known-good accepted)`,
  );

  if (!existsSync(RUNBOOK)) {
    console.error(`check-runbook-commands: ${RUNBOOK} does not exist`);
    process.exit(1);
  }
  const { problems, counted, unique } = check(readFileSync(RUNBOOK, 'utf8'), 'docs/runbook.md');
  console.log(
    `check-runbook-commands: real sweep -- ${counted} references, ${unique} distinct, in docs/runbook.md`,
  );
  if (counted === 0) {
    console.error('check-runbook-commands: the runbook named ZERO commands — the matchers found nothing to check.');
    process.exit(1);
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    console.error(`check-runbook-commands: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`check-runbook-commands: ok (all ${counted} references resolve, ${unique} distinct)`);
}
