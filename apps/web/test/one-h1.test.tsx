import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listPageRoutes } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * UX fixes, Task 5 — exactly one h1 per route (case 23.071; audit WF-07, NP-12, SYS-02).
 *
 * The rendered half lives with the screens that were wrong, in the suites that already mount them:
 * the workflow EDITOR route (`builder-route.test.tsx`), the workflow HISTORY screen
 * (`packages/app-core/test/workflow-builder/history.test.tsx`) and the NOTE title
 * (`note-title.test.tsx`), each named 23.071. This file is the sweep that stops a NEW route from
 * shipping without a level-1 heading, and the guard on the note page's second h1 coming back.
 *
 * A route either holds its `<h1` itself or hands off to the component that does; the table below
 * is that hand-off, and a route in neither is a finding (as is a stale row).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const read = (repoRelative: string): string => readFileSync(resolve(REPO, repoRelative), 'utf8');
const count = (source: string, pattern: RegExp): number => [...source.matchAll(pattern)].length;

/** Routes whose level-1 heading is in another file: route → the file that renders it. */
const DELEGATES: Record<string, string> = {
  'apps/web/app/help/page.tsx': 'packages/app-core/src/help/help-browser.tsx',
  'apps/web/app/mcp/tokens/page.tsx': 'apps/web/src/mcp-tokens-screen.tsx',
  'apps/web/app/notes/page.tsx': 'apps/web/src/notes/notes-page.tsx',
  'apps/web/app/notes/[noteId]/page.tsx': 'apps/web/src/notes/notes-page.tsx',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx': 'apps/web/src/ticket-type-editor-pane.tsx',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/new/page.tsx': 'apps/web/src/ticket-type-editor-pane.tsx',
  'apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/history/page.tsx':
    'packages/app-core/src/workflow-builder/ui/workflow-history-screen.tsx',
};
/** Routes that never paint: they redirect. */
const REDIRECTS = ['apps/web/app/page.tsx'];

/** A heading element at level 1, written literally or chosen by a `heading = 'h1'` default. */
const H1 = /<h1\b|heading\s*=\s*'h1'|<h1>/g;

describe('23.071 every route renders exactly one h1 (audit WF-07, NP-12)', () => {
  it('23.071 each route holds an h1 itself or hands off to the file that does, and the note title is not a second one', () => {
    const routes = listPageRoutes().map((route) => route.replace(/\\/g, '/'));

    // The table has no stale row and every route is accounted for.
    for (const route of Object.keys(DELEGATES)) expect(routes, `stale delegate ${route}`).toContain(route);
    for (const route of REDIRECTS) expect(routes, `stale redirect ${route}`).toContain(route);
    const missing: string[] = [];
    for (const route of routes) {
      if (REDIRECTS.includes(route)) continue;
      const own = count(read(route), H1);
      const delegate = DELEGATES[route];
      const handedOff = delegate === undefined ? 0 : count(read(delegate), H1);
      if (own + handedOff < 1) missing.push(route);
    }
    expect(missing).toEqual([]);

    // The editor route holds its h1 itself since Task 5 (a visually hidden one: the title is the
    // name field), and the history screen's heading is a level 1 and no longer a level 2.
    expect(count(read('apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx'), /<h1\b/g)).toBe(1);
    expect(read('packages/app-core/src/workflow-builder/ui/workflow-history-screen.tsx')).toMatch(
      /<h1 className="workflow-history__title">Version history<\/h1>/,
    );

    // THE NOTE PAGE: `NotesPage` owns the one h1 ("Notes"); the open note's title is a field inside
    // it, so `NoteTitle` is NOT an h1 (it was, which made two on every open note).
    expect(count(read('apps/web/src/notes/notes-page.tsx'), /<h1\b/g)).toBe(1);
    // (A JSX element opens a line; the docblock's prose about a pasted `<h1>` does not.)
    expect(read('apps/web/src/notes/note-title.tsx')).not.toMatch(/^\s*<h1\b/m);
    expect(read('apps/web/src/notes/note-title.tsx')).toMatch(/^\s*<h2\b/m);

    // CONTROL (same `it`): the sweep can fail — a route with no heading source is reported, and the
    // pattern reads both spellings of an h1.
    expect(count('<h1 className="x">T</h1>', H1)).toBe(1);
    expect(count("export function Pane({ heading = 'h1' }) {}", H1)).toBe(1);
    expect(count('<main><h2>Only a section</h2></main>', H1)).toBe(0);
  });
});
