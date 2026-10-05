import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * `scripts/check-env-example.mjs` resolves its repo root from its own
 * location, so each leg copies the script into a throwaway root and runs it
 * there against a tree the leg controls.
 */
const REAL_ROOT = resolve(__dirname, '../../../..');

function scratchRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'check-env-'));
  mkdirSync(join(root, 'scripts'));
  cpSync(join(REAL_ROOT, 'scripts/check-env-example.mjs'), join(root, 'scripts/check-env-example.mjs'));
  return root;
}

function run(root: string) {
  const r = spawnSync('node', [join(root, 'scripts/check-env-example.mjs')], { encoding: 'utf8' });
  return { rc: r.status, out: `${r.stdout}${r.stderr}` };
}

function put(root: string, rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

describe('check:env', () => {
  it('13.2294 passes on the tree; without the KG_PW_PORT doc line it fails naming KG_PW_PORT', () => {
    const root = scratchRoot();
    try {
      symlinkSync(join(REAL_ROOT, 'apps'), join(root, 'apps'));
      symlinkSync(join(REAL_ROOT, 'packages'), join(root, 'packages'));
      const example = readFileSync(join(REAL_ROOT, '.env.example'), 'utf8');
      put(root, '.env.example', example);
      const ok = run(root);
      expect(ok.out).not.toMatch(/undocumented/);
      expect(ok.rc).toBe(0);
      // CONTROL: the doc line is what the pass rests on.
      put(root, '.env.example', example.replace(/^# KG_PW_PORT=.*\n/m, ''));
      const bad = run(root);
      expect(bad.rc).toBe(1);
      expect(bad.out).toMatch(/KG_PW_PORT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("13.2295 a *.spec.ts title 'x; CONTROL: 1' is not scanned; the same text in a non-test .ts is reported", () => {
    const root = scratchRoot();
    try {
      put(root, '.env.example', 'DATABASE_URL=\nKG_PW_PORT=3191\n');
      put(root, 'apps/server/src/config.ts', 'const s = { DATABASE_URL: 1 }; // ProcessEnv\nexport type E = NodeJS.ProcessEnv;\n');
      const body = "const p = process.env.KG_PW_PORT;\ntest('x; CONTROL: 1', () => {});\n";
      put(root, 'packages/a/tests/port.spec.ts', body);
      const spec = run(root);
      expect(spec.out).not.toMatch(/CONTROL/);
      expect(spec.rc).toBe(0);
      // CONTROL: D3 still runs on a non-test file.
      put(root, 'packages/a/src/port.ts', body);
      const src = run(root);
      expect(src.rc).toBe(1);
      expect(src.out).toMatch(/CONTROL/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
