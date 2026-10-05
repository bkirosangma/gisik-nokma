import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../../..');
const SCAN_DIRS = ['apps/server/src', 'apps/web/app', 'apps/web/src', 'packages/app-core/src', 'packages/domain/src', 'packages/rule-engine/src', 'packages/mcp-server/src', 'packages/sync-client/src', 'packages/ui/src', 'packages/editor/src'];
const PATTERN = /['"]terminal['"]|\bterminal(?:Children|_children)\b|\.terminal\b|\bterminal:\s*(?:\[|[A-Z])/;
const SKIP = /(?:^|\/)(?:node_modules|dist|test|tests|e2e|\.next)(?:\/|$)|\.test\.|\.generated\./;

export function scanTerminalReaders(root: string, dirs: readonly string[]): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(root, path);
      if (SKIP.test(rel)) continue;
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(ts|tsx|sql)$/.test(name)) continue;
      const hits: number[] = [];
      readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
        const text = line.trim();
        if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return;
        if (PATTERN.test(line)) hits.push(index + 1);
      });
      if (hits.length > 0) found.set(rel, hits);
    }
  };
  for (const dir of dirs) if (existsSync(join(root, dir))) walk(join(root, dir));
  return found;
}

/** definition: authors or validates a workflow. invariant: "terminal" means finished, and a Not-taken ticket parked there IS finished (parent close, attention, sweeps, the board column). done-meaning: a count or sentence that means DONE; T17 makes each exclude a not-taken resolution. */
type Reader = 'definition' | 'invariant' | 'done-meaning';
export const TERMINAL_READERS: Record<string, Reader> = {
  // definition (17)
  'apps/server/src/routes/builder-reads.ts': 'definition',
  'apps/server/src/tools/wtg-preflight.ts': 'definition',
  'packages/app-core/src/workflow-builder/anchor-issues.ts': 'definition',
  'packages/app-core/src/workflow-builder/templates.ts': 'definition',
  'packages/app-core/src/workflow-builder/ui/builder-panels.tsx': 'definition',
  'packages/app-core/src/workflow-builder/ui/flow-graph.ts': 'definition',
  'packages/app-core/src/workflow-builder/ui/state-node.tsx': 'definition',
  'packages/domain/src/flow/node.ts': 'definition',
  'packages/domain/src/simple-kanban.ts': 'definition',
  'packages/domain/src/validate-workflow.ts': 'definition',
  'packages/domain/src/workflow-helpers.ts': 'definition',
  'packages/domain/src/workflow.ts': 'definition',
  'packages/domain/src/workflows/errand-with-waits.ts': 'definition',
  'packages/rule-engine/src/checks/test-support.ts': 'definition',
  'packages/rule-engine/src/checks/workflow-rebind.ts': 'definition',
  'packages/rule-engine/src/workflow-defined.ts': 'definition',
  'packages/ui/src/components/chip.tsx': 'definition',
  // invariant (17)
  'apps/server/src/auto-close/sweep.ts': 'invariant',
  'apps/server/src/notifications/sweep.ts': 'invariant',
  'apps/server/src/routes/attention.ts': 'invariant',
  'apps/server/src/routes/home.ts': 'invariant',
  'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx': 'invariant',
  'packages/app-core/src/flows/guarded-child-event.ts': 'invariant',
  'packages/app-core/src/offline/reopen-pair.ts': 'invariant',
  'packages/app-core/src/precheck.ts': 'invariant',
  'packages/app-core/src/views/board.tsx': 'invariant',
  'packages/app-core/src/views/ticket-sheet.tsx': 'invariant',
  // wtg2 T9: a move into a terminal state ENDS the open work period, and terminal to terminal opens none (WP-1); a
  // Not-taken move folds no period at all (PS-8), so the fold never reads a not-taken ticket's terminal as work done.
  'packages/domain/src/flow/periods.ts': 'invariant',
  'packages/domain/src/flow/settle.ts': 'invariant', // wtg2 T15: a finished ticket keeps its work; a Not-taken one is told apart by `notTaken`, not by the category
  'packages/domain/src/ticket-state.ts': 'invariant',
  'packages/rule-engine/src/checks/close.ts': 'invariant',
  // wtg2 T8: the flow parks a Not-taken ticket in the FIRST terminal state and never passes over a finished one (PS-8, PS-11).
  'packages/rule-engine/src/checks/flow-cause.ts': 'invariant',
  'packages/rule-engine/src/checks/hierarchy.ts': 'invariant',
  'packages/rule-engine/src/transition.ts': 'invariant',
  // done-meaning (12): T17 changes these
  'apps/server/src/projections/rollups.ts': 'done-meaning',
  'apps/server/src/read/ticket-cards.ts': 'done-meaning',
  'apps/server/src/routes/my-work.ts': 'done-meaning',
  'apps/server/src/routes/tickets.ts': 'done-meaning',
  'apps/server/src/visibility/rollup.ts': 'done-meaning',
  'packages/app-core/src/online/mappers.ts': 'done-meaning',
  'packages/app-core/src/timeline/timeline-view.tsx': 'done-meaning',
  'packages/app-core/src/view-types.ts': 'done-meaning',
  'packages/app-core/src/views/list-model.ts': 'done-meaning',
  'packages/app-core/src/views/rollup-text.ts': 'done-meaning',
  'packages/app-core/src/views/ticket-list.tsx': 'done-meaning',
  'packages/domain/src/read-models.ts': 'done-meaning',
};

describe('29.150 terminal-category readers', () => {
  it('29.150 every reader is classified; the scan sees a planted reader and ignores comments and test files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtg-scan-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'planted.ts'), "export const done = (t: { state_category: string }) => t.state_category === 'terminal';\n");
    writeFileSync(join(dir, 'src', 'docblock.ts'), "// a 'terminal' mention in a comment\n/**\n * 'terminal' in a docblock\n */\nexport const x = 1;\n");
    writeFileSync(join(dir, 'src', 'planted.test.ts'), "const a = 'terminal';\n");
    writeFileSync(join(dir, 'src', 'inline.ts'), "/* 'terminal' in an inline block comment */\nexport const y = 2;\n");
    // A reader after skipped comment lines reports its OWN line number (T17's work list is these numbers, not just the file names).
    writeFileSync(join(dir, 'src', 'third.ts'), "// c\n/* 'terminal' c */\nexport const t = 'terminal';\n");
    // Every skipped directory and file kind, and an extension the walk does not read, each holding a mention the scan must not report.
    for (const skipped of ['node_modules', 'dist', 'test', 'tests', 'e2e', '.next']) {
      mkdirSync(join(dir, 'src', skipped));
      writeFileSync(join(dir, 'src', skipped, 'x.ts'), "const a = 'terminal';\n");
    }
    writeFileSync(join(dir, 'src', 'editor.generated.ts'), "const a = 'terminal';\n");
    writeFileSync(join(dir, 'src', 'notes.md'), "state 'terminal'\n");
    writeFileSync(join(dir, 'src', 'query.sql'), "SELECT 1 WHERE state_category = 'terminal';\n");
    writeFileSync(join(dir, 'src', 'cell.tsx'), "export const C = (s: string) => s === 'terminal';\n");
    // One planted file per pattern alternative, each matching ONLY that alternative, so dropping one is seen without a real file to lean on.
    writeFileSync(join(dir, 'src', 'dot.ts'), 'export const n = (t: { terminal: number }) => t.terminal;\n');
    writeFileSync(join(dir, 'src', 'kids.ts'), 'export const c = { terminalChildren: 3 };\n');
    writeFileSync(join(dir, 'src', 'snake.sql'), 'SELECT count(*) AS terminal_children FROM t;\n');
    writeFileSync(join(dir, 'src', 'list.ts'), "export const m = { terminal: ['done'] };\n");
    writeFileSync(join(dir, 'src', 'cap.ts'), 'export const k = { terminal: Done };\n');
    // A listed directory that does not exist is skipped, not a crash (a package that was removed).
    const scan = scanTerminalReaders(dir, ['src', 'missing']);
    expect([...scan.keys()].sort()).toEqual(['src/cap.ts', 'src/cell.tsx', 'src/dot.ts', 'src/kids.ts', 'src/list.ts', 'src/planted.ts', 'src/query.sql', 'src/snake.sql', 'src/third.ts']);
    expect(scan.get('src/third.ts')).toEqual([3]);
    expect(scan.get('src/planted.ts')).toEqual([1]);

    const found = scanTerminalReaders(ROOT, SCAN_DIRS);
    expect([...found.keys()].sort()).toEqual(Object.keys(TERMINAL_READERS).sort());
    // The `Reader` type already restricts the values, so a membership check could not fail; pin instead that every class is in
    // use (T17 reads the done-meaning class as its work list, and an all-'invariant' registry would hand it nothing).
    expect(new Set(Object.values(TERMINAL_READERS))).toEqual(new Set(['definition', 'invariant', 'done-meaning']));
  });
});
