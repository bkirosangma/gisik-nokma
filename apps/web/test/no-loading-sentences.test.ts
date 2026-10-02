import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Smoothness T8, case 25.121 — the loading SENTENCE is retired from every screen this task owns (spec S7; audit SM-09).
 *
 * The plan's sweep named six spellings and every file in the product. Two corrections, recorded in the HANDOFF drift list:
 * (1) the pattern is ANY `Loading …` / `Checking …` line, not six spellings — the six missed the five workflow-builder
 * sentences and the "Checking …" waits; (2) the sweep is the whole product MINUS the files other tasks still own, named
 * below. Each exclusion is itself checked: a file that no longer carries a sentence must leave the list, so the list can
 * only shrink (T6 the project page, T9 the notes surfaces, T7/T12 the ticket sheet, the MCP entry pages and the trash copy).
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SENTENCE = /(Loading|Checking)[^<'"`]*…/;
const COMMENT_LINE = /^\S+:\d+:\s*(\*|\/\/|\/\*)/;

const OWNED_BY_OTHER_TASKS = [
  'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx', // T6 (13.1056 pins its five arms)
  'apps/web/src/notes/note-document.tsx', // T9
  'apps/web/src/notes/notes-page.tsx', // T9
  'apps/web/app/mcp/authorize/page.tsx', // MCP entry pages
  'apps/web/app/mcp/connect/page.tsx',
  'packages/app-core/src/views/ticket-sheet.tsx', // T7 / ticket sheet
  'packages/app-core/src/views/new-ticket-dialog.tsx', // a placeholder, T7
  'packages/app-core/src/trash/copy.ts', // the constant; the account section no longer renders it
];

function sweep(): string[] {
  const out = execFileSync(
    'git',
    ['grep', '-n', '-E', '(Loading|Checking)[^<\'"`]*…', '--', 'apps/web/app', 'apps/web/src', 'packages/app-core/src', ':!*.test.*'],
    { encoding: 'utf8', cwd: REPO_ROOT },
  ).trim();
  return out.split('\n').filter(Boolean).filter((line) => !COMMENT_LINE.test(line));
}

describe('the loading sentence is retired (spec S7; audit SM-09)', () => {
  it('25.121 no product file this task owns renders a "Loading …" or "Checking …" line (tests, docblocks and the named other-task files excluded)', () => {
    const code = sweep().filter((line) => !OWNED_BY_OTHER_TASKS.some((file) => line.startsWith(`${file}:`)));
    expect(code, code.join('\n')).toEqual([]);
  });

  it('25.121 CONTROL: the pattern matches a planted JSX line and a bare string, and the comment filter drops a docblock line', () => {
    expect(SENTENCE.test('<p className="x">Loading workflows…</p>')).toBe(true);
    expect(SENTENCE.test("return 'Checking whether you can invite people…';")).toBe(true);
    expect(COMMENT_LINE.test('a.tsx:12:   * a docblock that says Loading…')).toBe(true);
    expect(COMMENT_LINE.test('a.tsx:12:    <p>Loading…</p>')).toBe(false);
  });

  it('25.121 the exclusion list is honest: every excluded file still carries a sentence (else it leaves the list)', () => {
    const lines = sweep();
    const stale = OWNED_BY_OTHER_TASKS.filter((file) => !lines.some((line) => line.startsWith(`${file}:`)));
    expect(stale, `no longer carry a sentence, remove from OWNED_BY_OTHER_TASKS:\n${stale.join('\n')}`).toEqual([]);
  });
});
