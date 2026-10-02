import { readdirSync, readFileSync, statSync } from 'node:fs';
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

const configsUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
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
    // CONTROL, same it: the sweep is not blind — it found the configs, including the one that already had the budget.
    expect(configs.length).toBeGreaterThanOrEqual(11);
    expect(configs).toContain('apps/server/vitest.config.ts');
    expect(settingOf('test: {\n  testTimeout: 7_000,\n}', 'testTimeout')).toBe(7000); // the reader reads a literal with underscores
    expect(settingOf('test: {\n  include: [],\n}', 'testTimeout')).toBeNull(); // and reports an unset key as null, which fails below

    const short = configs.filter((c) => (settingOf(readFileSync(join(REPO_ROOT, c), 'utf8'), 'testTimeout') ?? 0) < 20_000);
    const shortHooks = configs.filter((c) => (settingOf(readFileSync(join(REPO_ROOT, c), 'utf8'), 'hookTimeout') ?? 0) < 30_000);
    expect(short, 'configs with testTimeout below 20000 (or unset)').toEqual([]);
    expect(shortHooks, 'configs with hookTimeout below 30000 (or unset)').toEqual([]);
  });
});
