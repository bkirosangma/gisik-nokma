import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 29.126 (wtg2 T2 FIX 1, planner ruling 2026-10-05 00:13): the withheld link copy has ONE constructor,
 * `withheldLinkPayload` in the domain, and it alone decides whether a `leads_to` label survives: kept on 'out' (a hidden
 * target; spec LK-6), dropped on 'in' (a hidden source). A second place that builds the withheld form (`targetId: null` in
 * code) could keep the hidden source's label, so the scan reads every source tree and finds that form only inside the
 * helper, and finds the helper called only by the server's withhold and MCP's `redactedPayload`.
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const HELPER_FILE = 'packages/domain/src/events/ticket-events.ts';
const WITHHELD_FORM = /\btargetId\s*:\s*null\b/;
const HELPER_CALL = /\bwithheldLinkPayload\(/;
const SKIP = /(?:^|\/)(?:node_modules|dist|test|tests|e2e|\.next)(?:\/|$)|\.test\.|\.generated\./;

/** Every `apps/<x>/{src,app}` and `packages/<x>/src` tree, read off the disk so a package added later is scanned too. */
function sourceDirs(root: string): string[] {
  const dirs: string[] = [];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(join(root, group))) {
      for (const sub of ['src', 'app']) if (existsSync(join(root, group, name, sub))) dirs.push(`${group}/${name}/${sub}`);
    }
  }
  return dirs;
}

/** The code lines (comment lines skipped) matching `pattern`, per file: `terminal-category-readers.test.ts`'s walk. */
export function scanSource(root: string, dirs: readonly string[], pattern: RegExp): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(root, path);
      if (SKIP.test(rel)) continue;
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(ts|tsx|mts|js|mjs)$/.test(name)) continue;
      const hits: number[] = [];
      readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
        const text = line.trim();
        if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return;
        if (pattern.test(line)) hits.push(index + 1);
      });
      if (hits.length > 0) found.set(rel, hits);
    }
  };
  for (const dir of dirs) if (existsSync(join(root, dir))) walk(join(root, dir));
  return found;
}

describe('29.126 the withheld link form has one constructor', () => {
  it('29.126 `targetId: null` is built only inside withheldLinkPayload, which only the server withhold and MCP call; the scan sees a planted copy and ignores comments, tests and generated bundles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'withheld-scan-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'planted.ts'), "export const hide = (kind: string) => ({ kind, targetId: null, label: 'Yes' });\n");
    writeFileSync(join(dir, 'src', 'spread.tsx'), 'export const h = (p: object) => ({ ...p, targetId:null });\n');
    writeFileSync(join(dir, 'src', 'docblock.ts'), '/**\n * served as `{kind, targetId: null}`\n */\n// `{kind, targetId: null}` in a line comment\nexport const x = 1;\n');
    writeFileSync(join(dir, 'src', 'near.ts'), 'export const a = { targetId: nullish, sourceTargetId: null };\n'); // neither is the form
    for (const skipped of ['node_modules', 'dist', 'test']) {
      mkdirSync(join(dir, 'src', skipped));
      writeFileSync(join(dir, 'src', skipped, 'x.ts'), 'const a = { targetId: null };\n');
    }
    writeFileSync(join(dir, 'src', 'x.test.ts'), 'const a = { targetId: null };\n');
    writeFileSync(join(dir, 'src', 'editor-html.generated.ts'), 'const a = { targetId: null };\n');
    const planted = scanSource(dir, ['src', 'missing'], WITHHELD_FORM);
    expect([...planted.keys()].sort()).toEqual(['src/planted.ts', 'src/spread.tsx']);
    expect(planted.get('src/planted.ts')).toEqual([1]);

    const dirs = sourceDirs(ROOT);
    expect(dirs).toEqual(expect.arrayContaining(['apps/server/src', 'apps/web/app', 'packages/app-core/src', 'packages/domain/src', 'packages/mcp-server/src']));
    const lines = readFileSync(join(ROOT, HELPER_FILE), 'utf8').split('\n');
    const from = lines.findIndex((l) => l.startsWith('export function withheldLinkPayload(')) + 1;
    const to = lines.findIndex((l, i) => i >= from && l === '}') + 1;
    expect(from, 'the helper is where this pin says').toBeGreaterThan(0);

    const forms = scanSource(ROOT, dirs, WITHHELD_FORM);
    expect([...forms.keys()]).toEqual([HELPER_FILE]);
    expect(forms.get(HELPER_FILE)!.length).toBeGreaterThan(0); // the haystack holds its subject
    for (const line of forms.get(HELPER_FILE)!) expect(line, `${HELPER_FILE}:${line}`).toBeGreaterThanOrEqual(from);
    for (const line of forms.get(HELPER_FILE)!) expect(line, `${HELPER_FILE}:${line}`).toBeLessThanOrEqual(to);

    // Every door takes the withheld copy, and its label, from the helper: the server's withhold and MCP's redaction.
    expect([...scanSource(ROOT, dirs, HELPER_CALL).keys()].sort()).toEqual([
      'apps/server/src/visibility/withhold-link-targets.ts',
      HELPER_FILE, // the definition
      'packages/mcp-server/src/tools/ticket-tools.ts',
    ]);
  });
});
