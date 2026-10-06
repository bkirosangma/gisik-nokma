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
/** Comments and docblocks name `<h1>` in prose (this very file's own subject), so they are cut before counting. */
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (source: string, pattern: RegExp): number => [...stripComments(source).matchAll(pattern)].length;

/** Routes whose level-1 heading is in another file: route → the file that renders it. */
const DELEGATES: Record<string, string> = {
  'apps/web/app/page.tsx': 'apps/web/src/home/home-screen.tsx',
  'apps/web/app/help/page.tsx': 'packages/app-core/src/help/help-browser.tsx',
  'apps/web/app/mcp/tokens/page.tsx': 'apps/web/src/mcp-tokens-screen.tsx',
  'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx': 'apps/web/src/project-title.tsx',
  'apps/web/app/notes/page.tsx': 'apps/web/src/notes/notes-page.tsx',
  'apps/web/app/notes/[noteId]/page.tsx': 'apps/web/src/notes/notes-page.tsx',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx': 'apps/web/src/ticket-type-editor-pane.tsx',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/new/page.tsx': 'apps/web/src/ticket-type-editor-pane.tsx',
  'apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/history/page.tsx':
    'packages/app-core/src/workflow-builder/ui/workflow-history-screen.tsx',
};
/** Routes whose source (with its delegate) spells more than one `<h1` because the branches are exclusive: route → count and why. */
const ALLOWED_DOUBLES: Record<string, { count: number; why: string }> = {
  'apps/web/app/w/[workspaceId]/page.tsx': {
    count: 4,
    why: 'three exclusive ternary branches (error, loading, not in the directory) each paint their own "Workspace" h1 and the ready state paints the renamable one: one renders at a time',
  },
  'apps/web/app/invite/[token]/page.tsx': {
    count: 2,
    why: 'the product name is the h1 while the invite is alive, and a dead link (UX fixes T10, ENT-04) paints its own headline as the h1 while the name steps down to a paragraph: the two arms are exclusive, so one renders at a time',
  },
  'apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx': {
    count: 2,
    why: 'the delegate file holds the Edit AND the New pane, each defaulting `heading` to h1; the route mounts one of them',
  },
  'apps/web/app/w/[workspaceId]/settings/ticket-types/new/page.tsx': {
    count: 2,
    why: 'the same delegate file: the route mounts the New pane, never both',
  },
};
/** Routes that never paint: they redirect. `/` left the list when it became Home (spec E, 27.625); the per-workspace My work
 * route joined it when My work went global (my-work-global T4, 30.040). */
const REDIRECTS: string[] = ['apps/web/app/w/[workspaceId]/my-work/page.tsx'];

/** A heading element at level 1, written literally or chosen by a `heading = 'h1'` default. */
const H1 = /<h1\b|heading\s*=\s*'h1'|<h1>/g;

describe('23.071 every route renders exactly one h1 (audit WF-07, NP-12)', () => {
  it('23.071 each route holds an h1 itself or hands off to the file that does, and the note title is not a second one', () => {
    const routes = listPageRoutes().map((route) => route.replace(/\\/g, '/'));

    // The table has no stale row and every route is accounted for.
    for (const route of Object.keys(DELEGATES)) expect(routes, `stale delegate ${route}`).toContain(route);
    for (const route of REDIRECTS) expect(routes, `stale redirect ${route}`).toContain(route);
    // EXACTLY one per route: too few is a page with no level-1 heading, too many is a second one (the note page's old defect).
    // A source that legitimately spells two in mutually exclusive branches is listed in ALLOWED_DOUBLES with its reason.
    const wrong: string[] = [];
    for (const route of routes) {
      if (REDIRECTS.includes(route)) continue;
      const own = count(read(route), H1);
      const delegate = DELEGATES[route];
      const handedOff = delegate === undefined ? 0 : count(read(delegate), H1);
      const total = own + handedOff;
      const allowed = ALLOWED_DOUBLES[route]?.count ?? 1;
      if (total !== allowed) wrong.push(`${route}: ${total} h1 (expected ${allowed})`);
    }
    expect(wrong).toEqual([]);
    // A stale allowance fails, as a stale delegate does.
    for (const route of Object.keys(ALLOWED_DOUBLES)) expect(routes, `stale allowance ${route}`).toContain(route);

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
    // …a heading named only in a comment is not counted, and a second h1 IS: the exactness check reports it.
    expect(count('/* the <h1> is below */ <h1>T</h1>', H1)).toBe(1);
    expect(count('{/* <h1> */}\n<h1>A</h1><h1>B</h1>', H1)).toBe(2);
  });
});
