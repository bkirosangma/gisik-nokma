import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GUARDED, OPT_IN, offenders, valueInDotenv } from './check-dev-credentials.mjs';

/**
 * The build guard that refuses to inline a working credential into the bundle.
 *
 * Pre-launch checklist item 4 recorded `EXPO_PUBLIC_DEV_TOKEN` on 2026-09-07 as
 * a risk with an owner rather than a defect to fix quietly — *"what is missing
 * is any mechanism preventing a release build from carrying it"* — and the
 * owner assigned it on 2026-09-08.
 *
 * Cases 12.390–12.393.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-dev-credentials.mjs');

/** Run the guard as a real child process and report its exit code and stderr. */
function run(env: Record<string, string>): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, [GUARDED]: '', [OPT_IN]: '', ...env },
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status?: number; stderr?: string; stdout?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('12.390 the dotenv reader', () => {
  it('reads the shapes people actually write, and refuses the ones that only look like it', () => {
    expect(valueInDotenv('FOO=bar\nEXPO_PUBLIC_DEV_TOKEN=abc123\n', GUARDED)).toBe('abc123');
    expect(valueInDotenv('EXPO_PUBLIC_DEV_TOKEN="quoted"\n', GUARDED)).toBe('quoted');
    expect(valueInDotenv("EXPO_PUBLIC_DEV_TOKEN='single'\n", GUARDED)).toBe('single');
    expect(valueInDotenv('export EXPO_PUBLIC_DEV_TOKEN=exported\n', GUARDED)).toBe('exported');
    // A commented line is not an assignment, and a longer name is not this name.
    // Both are the false-POSITIVE direction: a reader that matched them would
    // refuse builds that are fine, which is how a guard gets disabled.
    expect(valueInDotenv('#EXPO_PUBLIC_DEV_TOKEN=commented\n', GUARDED)).toBeNull();
    expect(valueInDotenv('EXPO_PUBLIC_DEV_TOKEN_SUFFIX=nope\n', GUARDED)).toBeNull();
    // Present but empty is NOT absent — `.env.example` ships exactly this line.
    expect(valueInDotenv('EXPO_PUBLIC_DEV_TOKEN=\n', GUARDED)).toBe('');
    // dotenv's own rule: the last assignment wins.
    expect(valueInDotenv('EXPO_PUBLIC_DEV_TOKEN=first\nEXPO_PUBLIC_DEV_TOKEN=last\n', GUARDED)).toBe('last');
  });
});

describe('12.391 what counts as an offender', () => {
  it('sees the environment AND a .env file, and is silent when both are empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gn-devtoken-'));
    try {
      // Nothing set anywhere.
      expect(offenders({}, dir)).toEqual([]);
      // `.env.example`'s shape — present, empty — must not trip it, or the
      // guard fires on a checkout that has done nothing wrong.
      writeFileSync(join(dir, '.env'), 'EXPO_PUBLIC_DEV_TOKEN=\n');
      expect(offenders({}, dir)).toEqual([]);
      // The FILE half. `process.env` alone is blind to this, and it is the way
      // EXPO_PUBLIC_* is normally set — the build most likely to be carrying a
      // token is the one a env-only guard reports clean.
      writeFileSync(join(dir, '.env.local'), 'EXPO_PUBLIC_DEV_TOKEN=from-a-file\n');
      expect(offenders({}, dir)).toEqual(['.env.local']);
      // And the environment half, named separately so the message can say where.
      expect(offenders({ [GUARDED]: 'from-the-env' }, dir)).toEqual(['the environment', '.env.local']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('12.392 the default is REFUSE', () => {
  it('admits an unset token, refuses a set one, and admits it only with the explicit opt-in', () => {
    // All three states, driven through the real CLI as a child process, so what
    // is measured is the thing `pnpm build` runs and not a re-implementation.
    expect(run({}).code).toBe(0);

    const refused = run({ [GUARDED]: 'a-real-looking-token' });
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('REFUSING to build');
    // The message must say WHERE, or the first thing anyone does is guess.
    expect(refused.out).toContain('the environment');

    const allowed = run({ [GUARDED]: 'a-real-looking-token', [OPT_IN]: '1' });
    expect(allowed.code).toBe(0);
    // The opt-in is not silent: it says what it is letting through.
    expect(allowed.out).toContain('will carry a working credential');
  });
});

describe('12.393 the guard is wired into the build', () => {
  it('package.json’s build script runs it, so `turbo run build` cannot skip it', () => {
    const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    // A gate nothing invokes is a gate that does not exist. This is the wiring
    // assertion, not a restatement of the script's own behaviour.
    expect(pkg.scripts['build']).toContain('check-dev-credentials.mjs');
    // `&&`, not `;` — the build must not proceed past a refusal.
    expect(pkg.scripts['build']).toMatch(/check-dev-credentials\.mjs\s*&&/);
  });
});
