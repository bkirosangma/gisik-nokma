#!/usr/bin/env node
// Refuse a build that would INLINE a working credential into the bundle.
//
// `apps/mobile/src/app.tsx:16` reads `process.env.EXPO_PUBLIC_DEV_TOKEN`. Every
// `EXPO_PUBLIC_*` variable is substituted into the JavaScript at build time and
// SHIPS INSIDE THE APP — that is what the prefix means. So a build that carries
// a real token publishes a working bearer credential in plain text to whoever
// holds the binary, with nothing in the running app indicating it happened.
//
// The pre-launch checklist recorded this on 2026-09-07 as a risk with an owner
// rather than a defect to fix quietly, precisely because the remedy is a build
// change: *"what is missing is any mechanism preventing a release build from
// carrying it."* The owner assigned it on 2026-09-08. This is that mechanism.
//
// ## The default is REFUSE, and the opt-in is for the dev build
//
// The obvious shape is "fail when this is a release build", and it is the wrong
// way round: it needs a reliable signal for "release", and there is none at
// `tsc` time — Expo sets nothing, `NODE_ENV` means "production BUILD" rather
// than "shipping to people", and any signal that must be PRESENT to trigger a
// refusal fails open the moment it is absent. A control that fails open is not
// a control.
//
// So the dangerous state refuses by default and the safe-looking one has to say
// so: a non-empty token stops the build unless `GISIK_ALLOW_DEV_TOKEN=1` is set
// alongside it. A developer running a dev build sets both, once, and knows why.
// A release pipeline that leaked the token into its environment sets only the
// token, and stops.
//
// ## Why `process.env` alone was not enough, and this reads files too
//
// Expo loads `.env`, `.env.local` and `.env.<mode>` from the app directory and
// substitutes what it finds — which is how `EXPO_PUBLIC_*` is normally set. A
// guard reading only `process.env` would be blind to exactly the mechanism the
// variable is designed to be configured through, and would report clean on the
// build most likely to be carrying it. So the scan is: the environment, and
// every `.env*` file beside the app.
//
// ## What is NOT refused
//
// `EXPO_PUBLIC_DEV_WORKSPACE` is a workspace id, not a credential — it names a
// thing, it does not authorise anything, and refusing it would train people to
// set the opt-in as a matter of course, which is how an opt-in stops meaning
// anything.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const GUARDED = 'EXPO_PUBLIC_DEV_TOKEN';
export const OPT_IN = 'GISIK_ALLOW_DEV_TOKEN';

/** The value `name` is assigned in dotenv-ish `text`, or null. Last wins, as dotenv does. */
export function valueInDotenv(text, name) {
  let found = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    // `export FOO=` is valid in the files people actually write.
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    if (key !== name) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    found = value;
  }
  return found;
}

/** Every place the guarded variable is set to something non-empty. */
export function offenders(env, dir) {
  const found = [];
  const fromEnv = env[GUARDED];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') found.push('the environment');
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (!name.startsWith('.env')) continue;
      const value = valueInDotenv(readFileSync(join(dir, name), 'utf8'), GUARDED);
      if (value !== null && value.trim() !== '') found.push(name);
    }
  }
  return found;
}

// The CLI half. Guarded so a test can import the two functions above without
// running the scan — importing a module that calls `process.exit` at load time
// takes the test runner down with it, and the self-test must still run on every
// real invocation, which is why it lives in here rather than at module scope.
export function main() {
  // ─────────────────────────────────────────────────────────── self-test
  //
  // Four planted defects and three known-good inputs, run before the real scan.
  // A parser that matched nothing would report "no offenders" on every build,
  // which is indistinguishable from success and is the only way this script can
  // fail dangerously.
  const SELF_TEST = [
    ['FOO=bar\nEXPO_PUBLIC_DEV_TOKEN=abc123\n', 'abc123', 'a plain assignment'],
    ['EXPO_PUBLIC_DEV_TOKEN="quoted"\n', 'quoted', 'a double-quoted value'],
    ["EXPO_PUBLIC_DEV_TOKEN='single'\n", 'single', 'a single-quoted value'],
    ['export EXPO_PUBLIC_DEV_TOKEN=exported\n', 'exported', 'an `export` prefix'],
    ['#EXPO_PUBLIC_DEV_TOKEN=commented\n', null, 'a commented-out line must NOT count'],
    ['EXPO_PUBLIC_DEV_TOKEN=\n', '', 'an empty assignment is present but empty'],
    ['EXPO_PUBLIC_DEV_TOKEN_SUFFIX=nope\n', null, 'a longer name must not match'],
  ];
  const failures = [];
  for (const [text, expected, what] of SELF_TEST) {
    const got = valueInDotenv(text, GUARDED);
    if (got !== expected) failures.push(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
  if (failures.length > 0) {
    console.error('check-dev-credentials: SELF-TEST FAILED — the dotenv reader is broken.');
    for (const f of failures) console.error(`  ${f}`);
    console.error('  A reader that matches nothing reports "no offenders" on every build, which is');
    console.error('  indistinguishable from success. Refusing to certify anything until it works.');
    process.exit(1);
  }

  const hits = offenders(process.env, APP_DIR);
  if (hits.length === 0) {
    console.log(`check-dev-credentials: ok (self-test passed, ${GUARDED} is unset or empty)`);
    process.exit(0);
  }
  if (process.env[OPT_IN] === '1') {
    console.log(
      `check-dev-credentials: ${GUARDED} is set in ${hits.join(', ')} and ${OPT_IN}=1 — ` +
        'building a DEV bundle that will carry a working credential.',
    );
    process.exit(0);
  }
  console.error(`check-dev-credentials: REFUSING to build — ${GUARDED} is set in ${hits.join(', ')}.`);
  console.error('');
  console.error(`  Every EXPO_PUBLIC_* variable is substituted into the bundle at build time, so this`);
  console.error('  build would publish a working bearer credential in plain text to anyone holding the');
  console.error('  binary, with nothing in the running app indicating it.');
  console.error('');
  console.error(`  If this really is a dev build, say so: ${OPT_IN}=1 pnpm --filter @gisik-nokma/mobile run build`);
  console.error(`  If it is not, unset ${GUARDED} — and if it reached a real device, rotate it.`);
  process.exit(1);

}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
