import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = resolve(__dirname, '..');
const PKGS = resolve(WEB, '../../packages');
const ALIASES: Record<string, string> = {
  '@gisik-nokma/app-core/data': join(PKGS, 'app-core/src/data.ts'),
  '@gisik-nokma/app-core/help': join(PKGS, 'app-core/src/help/index.ts'),
  '@gisik-nokma/app-core/workflow-builder': join(PKGS, 'app-core/src/workflow-builder/index.ts'),
  '@gisik-nokma/app-core/online': join(PKGS, 'app-core/src/online/index.ts'),
  '@gisik-nokma/app-core': join(PKGS, 'app-core/src/index.ts'),
  '@gisik-nokma/editor/upload': join(PKGS, 'editor/src/upload.ts'),
  '@gisik-nokma/editor/comment-toolbar-pref': join(PKGS, 'editor/src/comment-toolbar-pref.ts'),
  '@gisik-nokma/editor': join(PKGS, 'editor/src/index.ts'),
  '@gisik-nokma/ui': join(PKGS, 'ui/src/index.ts'),
};

/**
 * Static imports only (`import … from`, `export … from`), following the repo's `.js` → `.ts(x)` convention.
 * `import()` and type-only imports are not edges: they are the point of the split.
 */
function staticGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const src = readFileSync(entry, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of src.matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1]!;
    let target: string | null = null;
    if (spec.startsWith('.')) target = resolve(dirname(entry), spec).replace(/\.js$/, '');
    else if (ALIASES[spec]) target = ALIASES[spec]!;
    else continue; // node_modules: recorded by name below
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
      try {
        readFileSync(target + ext);
        staticGraph(target + ext, seen);
        break;
      } catch {
        /* next */
      }
    }
  }
  for (const m of src.matchAll(/from\s+['"]((?:@tiptap|@xyflow|prosemirror)[^'"]*)['"]/g)) seen.add(`npm:${m[1]}`);
  return seen;
}

// `editor/src/upload.ts` is the fetch helper's own subpath and `editor/src/comment-toolbar-pref.ts` the stored Format choice's (the
// editor skeleton reads it before the editor loads, FIX 2 F4); neither imports Tiptap or any other editor file (React only), so a
// static edge to either is not an edge to the editor. 25.171's control walks both and finds no `npm:@tiptap`.
const LIGHT_EDITOR_SUBPATHS = ['/editor/src/upload.ts', '/editor/src/comment-toolbar-pref.ts'];
const reachesEditor = (graph: string[]) =>
  graph.filter((f) => (f.includes('/editor/src/') && !LIGHT_EDITOR_SUBPATHS.some((light) => f.endsWith(light))) || f.startsWith('npm:@tiptap'));
const reachesCanvas = (graph: string[]) => graph.filter((f) => f.includes('workflow-builder/ui/workflow-canvas') || f.startsWith('npm:@xyflow'));
const reachesManual = (graph: string[]) => graph.filter((f) => f.includes('help/content.generated'));

describe('route import graphs (spec D6, S9; audit SM-04)', () => {
  it('25.171 the root layout and the sign-in route reach neither the editor, the workflow canvas nor the help manual; the project page reaches the editor only through a dynamic import', () => {
    for (const entry of [join(WEB, 'app/layout.tsx'), join(WEB, 'app/sign-in/page.tsx')]) {
      const graph = [...staticGraph(entry)];
      expect(reachesEditor(graph), entry).toEqual([]);
      expect(reachesCanvas(graph), entry).toEqual([]);
      expect(reachesManual(graph), entry).toEqual([]);
    }
    const project = [...staticGraph(join(WEB, 'app/w/[workspaceId]/p/[projectId]/page.tsx'))];
    expect(reachesEditor(project)).toEqual([]);
    const myWork = [...staticGraph(join(WEB, 'app/w/[workspaceId]/my-work/page.tsx'))];
    expect(reachesEditor(myWork)).toEqual([]);
    // Control, in the same it(): the walk CAN see the editor — the slot module reaches it, dynamically, so a
    // static walk from the slot's own importer still stops at the `import()`; and a file that imports the
    // editor statically (the notes document) does reach it.
    expect(readFileSync(join(WEB, 'src/editor-slot.tsx'), 'utf8')).toMatch(/import\('@gisik-nokma\/editor'\)/);
    // The two light subpaths are light for real: walked on their own they reach no Tiptap module and no other editor file.
    for (const light of ['@gisik-nokma/editor/upload', '@gisik-nokma/editor/comment-toolbar-pref']) {
      const graph = [...staticGraph(ALIASES[light]!)];
      expect(graph.filter((f) => f.startsWith('npm:') || (f.includes('/editor/src/') && f !== ALIASES[light])), light).toEqual([]);
    }
    expect(reachesEditor([...staticGraph(join(WEB, 'src/notes/note-document.tsx'))]).length).toBeGreaterThan(0);
  });

  it('25.172 app-core and editor declare their side effects, so a bundler may drop what a route does not import', () => {
    for (const pkg of ['app-core', 'editor']) {
      const json = JSON.parse(readFileSync(join(PKGS, pkg, 'package.json'), 'utf8')) as { sideEffects?: unknown };
      expect(json.sideEffects, pkg).toEqual(['**/*.css']);
    }
    // Control: a package that declares nothing is not one of the two (the claim is about THESE packages).
    const ui = JSON.parse(readFileSync(join(PKGS, 'ui/package.json'), 'utf8')) as { sideEffects?: unknown };
    expect(ui.sideEffects).not.toEqual(['**/*.css']);
  });

  it('25.174 the manual and the workflow canvas load on their own routes: /help and the two builder routes import them only through `import()` on their own subpaths', () => {
    const helpPage = readFileSync(join(WEB, 'app/help/page.tsx'), 'utf8');
    expect(helpPage).toMatch(/import\('@gisik-nokma\/app-core\/help'\)/);
    expect(helpPage).not.toMatch(/from '@gisik-nokma\/app-core'/);
    // (Not a whole-graph claim for /help: its `AppNav` imports the root barrel for a helper, and the barrel is walked whole. The
    // route-level saving of the root-barrel import is the bundler's, by `sideEffects`; the build table in 25.173 is its witness.)
    // The builder routes keep their pure helpers (`draftFromPublished`, `newDraft`) on the root barrel — a bundler that honours
    // `sideEffects` (25.172) drops what they do not use — but the SCREEN, which carries the canvas, is the dynamic one.
    const slot = readFileSync(join(WEB, 'src/authoring/workflow-builder-dynamic.tsx'), 'utf8');
    expect(slot).toMatch(/import\('@gisik-nokma\/app-core\/workflow-builder'\)/);
    for (const route of ['app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx', 'app/w/[workspaceId]/settings/workflows/new/page.tsx']) {
      const source = readFileSync(join(WEB, route), 'utf8');
      expect(source, route).toMatch(/workflow-builder-dynamic\.js/);
      expect(source, route).not.toMatch(/WorkflowBuilderScreen,?\s*\n?[^;]*from '@gisik-nokma\/app-core'/);
    }
    // Control: the subpaths the dynamic imports name DO reach what they carry.
    expect(reachesManual([...staticGraph(ALIASES['@gisik-nokma/app-core/help']!)]).length).toBeGreaterThan(0);
    expect(reachesCanvas([...staticGraph(ALIASES['@gisik-nokma/app-core/workflow-builder']!)]).length).toBeGreaterThan(0);
  });

  it('25.175 the data subpath carries the data layer and no view', () => {
    const data = [...staticGraph(ALIASES['@gisik-nokma/app-core/data']!)];
    expect(data.filter((f) => f.includes('/app-core/src/views/') && !/live-query-cache|reload-scheduler/.test(f))).toEqual([]);
    expect(reachesCanvas(data)).toEqual([]);
    expect(reachesManual(data)).toEqual([]);
    // Control: the root barrel, which the shell used to import, DOES reach views (the walk can see them).
    const root = [...staticGraph(ALIASES['@gisik-nokma/app-core']!)];
    expect(root.filter((f) => f.includes('/app-core/src/views/board')).length).toBeGreaterThan(0);
  });
});
