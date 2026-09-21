import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkFreshness, generatedContent } from './generate-editor-html.mjs';

/**
 * 12.413 — P30: `generate-editor-html.mjs --check` regenerates the content
 * in memory and diffs it against what is checked in, the same shape
 * `scripts/help-content.mjs --check` uses for the in-app manual — wired as
 * a step in this package's own `test` script (12.415), so a bundle change
 * nobody regenerated for is caught by the gate.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'generate-editor-html.mjs');

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'gn-editor-html-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('checkFreshness', () => {
  it('12.413 — reports no-bundle when the built bundle does not exist, rather than failing', () => {
    withTempDir((dir) => {
      const result = checkFreshness(join(dir, 'index.html'), join(dir, 'editor-html.generated.ts'));
      expect(result.status).toBe('no-bundle');
    });
  });

  it('12.414 — reports stale when the checked-in file does not match a regenerate of the real bundle', () => {
    withTempDir((dir) => {
      const bundlePath = join(dir, 'index.html');
      const outPath = join(dir, 'editor-html.generated.ts');
      writeFileSync(bundlePath, '<html>new content</html>');
      writeFileSync(outPath, generatedContent('<html>OLD content</html>'));
      const result = checkFreshness(bundlePath, outPath);
      expect(result.status).toBe('stale');
    });
  });

  it('reports ok when the checked-in file matches a regenerate of the real bundle', () => {
    withTempDir((dir) => {
      const bundlePath = join(dir, 'index.html');
      const outPath = join(dir, 'editor-html.generated.ts');
      writeFileSync(bundlePath, '<html>same content</html>');
      writeFileSync(outPath, generatedContent('<html>same content</html>'));
      const result = checkFreshness(bundlePath, outPath);
      expect(result.status).toBe('ok');
    });
  });
});

describe('the --check CLI', () => {
  it('exits 1 on stale, 0 on ok and 0 on no-bundle, run as a real child process', () => {
    withTempDir((dir) => {
      const bundlePath = join(dir, 'index.html');
      const outPath = join(dir, 'editor-html.generated.ts');
      const run = (): { code: number; out: string } => {
        try {
          const out = execFileSync(process.execPath, [SCRIPT, '--check', '--bundle', bundlePath, '--out', outPath], {
            encoding: 'utf8',
          });
          return { code: 0, out };
        } catch (error) {
          const e = error as { status?: number; stderr?: string; stdout?: string };
          return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
        }
      };
      // no-bundle
      expect(run().code).toBe(0);
      // stale
      writeFileSync(bundlePath, '<html>new</html>');
      writeFileSync(outPath, generatedContent('<html>old</html>'));
      const staleRun = run();
      expect(staleRun.code).toBe(1);
      expect(staleRun.out).toContain('STALE');
      // ok
      writeFileSync(outPath, generatedContent('<html>new</html>'));
      expect(run().code).toBe(0);
    });
  });
});

describe('12.415 the check is wired into this package’s own test script', () => {
  it('package.json’s test script runs generate-editor-html.mjs --check before vitest', () => {
    const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test']).toContain('generate-editor-html.mjs --check');
    expect(pkg.scripts['test']).toMatch(/generate-editor-html\.mjs --check\s*&&/);
  });
});
