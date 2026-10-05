import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 13.1733 — one sane vitest timeout for every package (housekeeping HK-7, owner 2026-10-02 ~20:20, "go it"; parallel
 * runs stay). Only `apps/server` set `testTimeout: 30_000`; the other ten packages ran on vitest's 5 s test / 10 s hook
 * default, and ordinary jsdom tests crossed 5 s under parallel load (#898, #918, #923, and #937 CI run 37019480109, cases
 * 3.991/3.992). Each got a per-test `20_000` argument as a patch; the config now gives every test that budget.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'reference', 'graphify-out', '.turbo', '.next']);
/**
 * ctl's test fixtures are miniature repos whose configs are test data (`ctl mutate`'s sets no timeouts and turned the
 * 2026-10-05 gate red). Skipped by the whole repo-relative path, not the basename `fixtures`, so a `fixtures` directory
 * anywhere else is still swept.
 */
const CTL_FIXTURES = 'scripts/ctl/test/fixtures';
const isSkippedPath = (relPath: string): boolean => relPath === CTL_FIXTURES || relPath.startsWith(`${CTL_FIXTURES}/`);

const configsUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (isSkippedPath(relative(REPO_ROOT, path))) return [];
    if (statSync(path).isDirectory()) return configsUnder(path);
    return name === 'vitest.config.ts' ? [path] : [];
  });

/** The numeric literal after `key:` (underscores allowed), or null when the key is not set. */
const settingOf = (text: string, key: string): number | null => {
  const hit = new RegExp(`^\\s*${key}:\\s*([0-9_]+)\\s*,`, 'm').exec(text);
  return hit === null ? null : Number(hit[1]!.replaceAll('_', ''));
};

describe('13.1733 every vitest.config.ts gives tests a 20 s budget and hooks a 30 s one', () => {
  it('sets testTimeout >= 20000 and hookTimeout >= 30000 in every config in the repo', () => {
    const configs = configsUnder(REPO_ROOT).map((p) => relative(REPO_ROOT, p)).sort();
    // CONTROL, same it: the sweep is not blind and drops no package — it finds exactly the twelve package configs.
    expect(configs, 'the configs the sweep found').toEqual([
      'apps/desktop/vitest.config.ts',
      'apps/mobile/vitest.config.ts',
      'apps/server/vitest.config.ts',
      'apps/web/vitest.config.ts',
      'packages/app-core/vitest.config.ts',
      'packages/domain/vitest.config.ts',
      'packages/editor/vitest.config.ts',
      'packages/knowledge-graph/vitest.config.ts',
      'packages/mcp-server/vitest.config.ts',
      'packages/rule-engine/vitest.config.ts',
      'packages/sync-client/vitest.config.ts',
      'packages/ui/vitest.config.ts',
    ]);
    // ctl mutate's fixture config is on disk and the sweep leaves it out ...
    const fixture = 'scripts/ctl/test/fixtures/mutate/before/packages/calc/vitest.config.ts';
    expect(existsSync(join(REPO_ROOT, fixture)), `${fixture} exists`).toBe(true);
    expect(configs).not.toContain(fixture);
    // ... because the skip is the fixture directory's whole path: not the basename `fixtures`, not the rest of scripts/,
    // not a sibling that shares its letters.
    const skipped = {
      'scripts/ctl/test/fixtures': true,
      'scripts/ctl/test/fixtures/x/vitest.config.ts': true,
      'packages/ui/fixtures': false,
      'packages/ui/fixtures/vitest.config.ts': false,
      'scripts/other/vitest.config.ts': false,
      'scripts/ctl/test/fixtures-x/vitest.config.ts': false,
    };
    expect(Object.fromEntries(Object.keys(skipped).map((p) => [p, isSkippedPath(p)])), 'isSkippedPath').toEqual(skipped);
    expect(settingOf('test: {\n  testTimeout: 7_000,\n}', 'testTimeout')).toBe(7000); // the reader reads a literal with underscores
    expect(settingOf('test: {\n  include: [],\n}', 'testTimeout')).toBeNull(); // and reports an unset key as null, which fails below

    const short = configs.filter((c) => (settingOf(readFileSync(join(REPO_ROOT, c), 'utf8'), 'testTimeout') ?? 0) < 20_000);
    const shortHooks = configs.filter((c) => (settingOf(readFileSync(join(REPO_ROOT, c), 'utf8'), 'hookTimeout') ?? 0) < 30_000);
    expect(short, 'configs with testTimeout below 20000 (or unset)').toEqual([]);
    expect(shortHooks, 'configs with hookTimeout below 30000 (or unset)').toEqual([]);
  });
});
