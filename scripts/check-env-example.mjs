#!/usr/bin/env node
// The env contract gate: every configuration variable app code reads must be
// documented in .env.example. Fails naming the strays and where they live.
//
// WHY THIS IS NOT JUST `process.env.X`
// ------------------------------------
// Plan 11 Task 6 specified one detector: /process\.env\.([A-Z][A-Z0-9_]*)/g.
// On this codebase that matches nothing. The server never reads a named
// property off the environment -- apps/server/src/index.ts hands the whole
// object to loadConfig(process.env), and apps/server/src/config.ts declares
// the contract as a zod schema whose KEYS are the variable names. A gate
// with only that detector would print "0 referenced in code" and pass
// vacuously forever, including against the plan's own planted defect (which
// happens to use the one shape the detector can see). A check that cannot
// fail is not evidence. So:
//
//   D1  process.env.NAME, process.env['NAME'], process.env["NAME"].
//       Run on RAW source. Unambiguous, zero false positives. Kept because
//       future code may well read the environment this way.
//   D2  const { NAME, ... } = process.env  --  destructuring is the other
//       spelling of property access. Also accepts `= env` (the conventional
//       local alias) but only inside env-reading files.
//   D3  An UPPER_SNAKE object key -- NAME: or 'NAME': -- at a `{`, `,`, `;`
//       or line-start boundary, ONLY in a file that mentions `process.env`
//       or `ProcessEnv`. This is the shape the code actually ships:
//       config.ts takes NodeJS.ProcessEnv and names DATABASE_URL, PORT,
//       HOST and LOG_LEVEL as schema keys. Ordinary code almost never uses
//       UPPER_SNAKE object keys, and confining the rule to env-reading
//       files bounds the blast radius further: over the whole of
//       apps/server/src + packages this pattern currently matches four
//       lines, all of them in config.ts, so today the restriction costs
//       nothing and only bounds what future files can drag in.
//
// Two guards keep the gate from going quiet:
//   * finding ZERO variables anywhere is itself a failure, not a clean run;
//   * if the contract declaration site below exists but contributes no
//     variable, the detectors have drifted off the pattern they were
//     written to cover, and the gate says so.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve everything against the repo root, not the cwd, so the gate answers
// the same from anywhere it is invoked.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 'apps/web' rather than 'apps/web/src': the shell reads configuration from
// two places outside src/ -- next.config.ts at the package root (SERVER_ORIGIN,
// for the dev rewrites) and, in principle, any page under app/. Scanning only
// src/ left both invisible, so a NEXT_PUBLIC_ variable baked into the browser
// bundle from a page could ship undocumented. The walker already skips
// node_modules, dist, .next, *.test.* and *.spec.* files (Playwright specs
// are tests, and their titles are prose that D3 reads as config keys), so widening this costs one
// config file and covers the whole app.
// 'apps/mobile' and 'apps/desktop' added 2026-09-07 (pre-launch checklist item
// 4, "no secrets stored in the frontend"). The reason is the one already given
// just above for widening to 'apps/web': a variable BAKED INTO A CLIENT BUNDLE
// could ship undocumented. Expo inlines every `EXPO_PUBLIC_*` and Vite every
// `VITE_*` exactly the way Next inlines `NEXT_PUBLIC_*` -- so the gate was
// enforcing that rule on one of the three shipping clients. Measured before
// fixing: apps/mobile read EXPO_PUBLIC_API_BASE, EXPO_PUBLIC_DEV_TOKEN and
// EXPO_PUBLIC_DEV_WORKSPACE, and apps/desktop read VITE_API_BASE, and NONE of
// the four appeared in .env.example while this gate reported ok. One of them is
// named DEV_TOKEN and is inlined into whatever bundle is built with it set.
const ROOTS = ['apps/server/src', 'apps/web', 'apps/mobile', 'apps/desktop', 'packages'];
// Variables this codebase does not READ as its own configuration. The gate's
// subject is the contract between an operator and the app: a name the code
// reads out of its environment must be documented, or a deployment can be
// missing a setting nobody can see. These are the other direction or no
// direction at all -- ambient process variables (PATH, HOME), the runner's own
// (NODE_ENV, CI), a test-only admin url, and PGPASSWORD, which
// `src/ops/pg-dump.ts` WRITES into a child process's environment so the
// database password never appears in argv where `ps` can read it. Its value
// comes from DATABASE_URL, which IS documented; an operator must never set
// PGPASSWORD themselves, so documenting it in .env.example would invite
// exactly the wrong thing. GISIK_E2E_RUN_STARTED_AT is the same kind: the e2e-stack `global-setup.ts` WRITES it and
// `global-teardown.ts` reads it back in the same Playwright process (devices plan Task 8) -- never an operator setting.
const IGNORE = new Set(['NODE_ENV', 'CI', 'PATH', 'HOME', 'TEST_DATABASE_ADMIN_URL', 'PGPASSWORD', 'GISIK_E2E_RUN_STARTED_AT']);
// Where the server's configuration contract is declared. A tripwire, not a
// detector: if this file stops contributing variables, the gate is no longer
// covering the thing it exists to cover.
const CONTRACT_SITE = 'apps/server/src/config.ts';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.next') continue;
      yield* walk(path);
    } else if (/\.(ts|tsx|mts|js|mjs|cjs)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      yield path;
    }
  }
}

// Deliberately conservative: drop a line only when it *begins* with a comment
// marker. Stripping trailing `//` comments would risk eating code -- a URL
// like postgres://host is exactly what a config file is full of -- and an
// over-eager stripper hides real references, which is a hole. Leaving prose
// in at worst produces a loud, fixable false positive.
function withoutCommentLines(source) {
  return source
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line))
    .join('\n');
}

const used = new Map(); // NAME -> { file, how }
function record(name, file, how) {
  if (!used.has(name)) used.set(name, { file, how });
}

for (const root of ROOTS) {
  let files = [];
  try {
    files = [...walk(join(REPO_ROOT, root))];
  } catch {
    continue; // a root that does not exist yet is not a failure
  }
  for (const file of files) {
    const shown = relative(REPO_ROOT, file);
    const source = readFileSync(file, 'utf8');

    // D1 -- direct access, on raw source.
    for (const m of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      record(m[1], shown, 'process.env access');
    }
    for (const m of source.matchAll(/process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g)) {
      record(m[1], shown, 'process.env access');
    }

    // D1b -- `import.meta.env.NAME`, Vite's accessor. Added 2026-09-07 with the
    // apps/desktop root, and it is a SECOND blind spot rather than a detail of
    // the first: widening ROOTS alone still missed VITE_API_BASE entirely,
    // because apps/desktop never writes the string `process.env` at all. The
    // gate's subject is "a name this code reads out of its environment", and
    // which accessor a bundler happens to provide is not part of that subject.
    // Measured: before this line the widened gate reported three undocumented
    // vars; with it, four.
    for (const m of source.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g)) {
      record(m[1], shown, 'import.meta.env access');
    }

    // D2 and D3 both scan `code`, so the gate that admits a file to them must
    // scan `code` too. It used to test `source`, and the inconsistency was not
    // theoretical: `packages/editor/src/drive/google-picker.ts` was admitted on
    // the strength of a docblock sentence reading "never read from process.env
    // in here" — a sentence asserting the file does NOT touch the environment —
    // whereupon D3 read the `Action: { PICKED: string; CANCEL: string }` type
    // members as undocumented config keys and failed the contract. A file was
    // flagged for saying it reads no environment.
    //
    // D1 above is deliberately left on raw `source`: a commented-out
    // `process.env.FOO` still names a variable someone meant to read, and that
    // is worth reporting. The difference is that D1 matches the variable
    // itself, while D2/D3 match SHAPES that are only evidence in a file which
    // genuinely reads the environment.
    const code = withoutCommentLines(source);
    if (!/process\.env|ProcessEnv/.test(code)) continue;

    // D2 -- destructuring off the environment.
    for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:process\.env|env)\b/g)) {
      for (const name of m[1].match(/\b[A-Z][A-Z0-9_]*\b/g) ?? []) {
        record(name, shown, 'env destructuring');
      }
    }

    // D3 -- UPPER_SNAKE config keys in a file that reads the environment.
    for (const m of code.matchAll(/(?:^|[{,;])[ \t]*['"]?([A-Z][A-Z0-9_]*)['"]?[ \t]*:/gm)) {
      record(m[1], shown, 'config object key');
    }
  }
}

const documented = new Set();
for (const line of readFileSync(join(REPO_ROOT, '.env.example'), 'utf8').split('\n')) {
  const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
  if (match) documented.add(match[1]);
}

if (used.size === 0) {
  console.error('env contract gate found NO configuration variables at all.');
  console.error(`  roots scanned: ${ROOTS.join(', ')}`);
  console.error('  A gate that finds nothing cannot fail, and a check that cannot');
  console.error('  fail is not evidence. Either the roots moved or the detectors no');
  console.error('  longer match how this codebase declares configuration. Fix the');
  console.error('  detectors in scripts/check-env-example.mjs before shipping.');
  process.exit(1);
}

// The tripwire is inverted deliberately: a MISSING contract site fails too.
// Guarding it with `existsSync` would have made one ordinary refactor silent
// — split config.ts into schema.ts (a bare zod object, no `ProcessEnv` in its
// text, so D3 skips it) and load.ts, delete config.ts, and D3 finds nothing,
// this tripwire is skipped, and the zero-check above is satisfied by whatever
// single `process.env.X` a later plan has landed. Three conditions, one
// refactor. Failing on absence costs nothing today and forces whoever moves
// or splits this file to come here and say where the contract went.
if (!existsSync(join(REPO_ROOT, CONTRACT_SITE))) {
  console.error(`env contract gate cannot find ${CONTRACT_SITE}.`);
  console.error('  That file declares the server configuration contract. If it moved');
  console.error('  or was split, point CONTRACT_SITE at its new home — the gate is');
  console.error('  only honest while it knows where the contract lives.');
  process.exit(1);
}

if (![...used.values()].some((v) => v.file === CONTRACT_SITE)) {
  console.error(`env contract gate found no variables in ${CONTRACT_SITE}.`);
  console.error('  That file declares the server configuration contract, so zero');
  console.error('  variables from it means the detectors have drifted off the shape');
  console.error('  the code actually uses. Fix scripts/check-env-example.mjs.');
  process.exit(1);
}

const missing = [...used.keys()].filter((name) => !IGNORE.has(name) && !documented.has(name)).sort();
if (missing.length > 0) {
  console.error('config vars read by code but undocumented in .env.example:');
  for (const name of missing) {
    const { file, how } = used.get(name);
    console.error(`  ${name}  (first seen in ${file}, via ${how})`);
  }
  process.exit(1);
}

console.log(`env contract clean: ${documented.size} documented, ${used.size} referenced in code.`);
for (const name of [...used.keys()].sort()) {
  const { file, how } = used.get(name);
  console.log(`  ${name.padEnd(24)} ${file}  (${how})`);
}
