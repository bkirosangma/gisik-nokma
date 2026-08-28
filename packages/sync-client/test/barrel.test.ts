import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/**
 * `packages/rule-engine` had to move its fixture harness to a `./fixtures`
 * subpath because the root entry dragged `node:fs` into browser builds. The
 * same shape is here and worse: the better-sqlite3 adapter is a NATIVE module
 * and the conformance suite imports vitest, while Tauri (Task 16) and Expo
 * (Task 17) both import this package's ROOT. A report saying "the barrel is
 * clean today" decays; this walk fails the build the day it stops being true.
 *
 * It walks source, not `dist/`, deliberately: turbo's `test` task depends on
 * `^build` (dependencies' builds), not on this package's own, so `dist/` may
 * legitimately not exist when this file runs. The one-time `dist/index.js`
 * walk is in the task report; this is the standing guard.
 */
const FORBIDDEN = [
  { name: 'better-sqlite3', match: (spec: string) => spec === 'better-sqlite3' },
  { name: 'vitest', match: (spec: string) => spec === 'vitest' || spec.startsWith('vitest/') },
  { name: 'a node: builtin', match: (spec: string) => spec.startsWith('node:') },
  // Bare builtins too. `node:fs` and `fs` are the same module to the runtime,
  // and a guard that saw only the prefixed spelling let `import { readFileSync }
  // from 'fs'` land verbatim in the shipped barrel while reporting green — the
  // exact failure this file exists to prevent, in a spelling it did not cover.
  {
    name: 'a bare node builtin',
    match: (spec: string) => builtinModules.includes(spec),
  },
];

/** Every `from '...'` / `import '...'` specifier in a module's source text. */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  // import ... from 'x' | export ... from 'x' | import 'x' | import('x')
  const patterns = [
    /(?:^|\n)\s*(?:import|export)[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) if (m[1]) found.push(m[1]);
  }
  return found;
}

/** Files reachable from `entry` through relative imports, entry included. */
function reachableFrom(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (file === undefined || seen.has(file)) continue;
    const specs = specifiersOf(readFileSync(file, 'utf8'));
    seen.set(file, specs);
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue;
      // Emitted ESM specifiers end in .js; the source beside them is .ts.
      const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
      stack.push(target);
    }
  }
  return seen;
}

describe('root barrel cleanliness', () => {
  const graph = reachableFrom(join(SRC, 'index.ts'));

  it('reaches no native module, no test framework, and no node: builtin', () => {
    const violations: string[] = [];
    for (const [file, specs] of graph) {
      for (const spec of specs) {
        for (const rule of FORBIDDEN) {
          if (rule.match(spec)) {
            violations.push(`${relative(SRC, file)} imports ${rule.name} ('${spec}')`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not reach the adapter or the conformance suite at all', () => {
    const reached = [...graph.keys()].map((f) => relative(SRC, f));
    expect(reached).not.toContain('storage/better-sqlite3.ts');
    expect(reached).not.toContain('storage/conformance.ts');
  });

  it('actually walked the graph — the guard is not passing by reading nothing', () => {
    // Without this, deleting src/index.ts's imports (or breaking the walker)
    // would make both assertions above pass on an empty set.
    const reached = [...graph.keys()].map((f) => relative(SRC, f)).sort();
    expect(reached).toEqual(['index.ts', 'storage/schema.ts', 'storage/storage.ts']);
  });

  it('the walker finds the forbidden imports where they really live', () => {
    // Proves the FORBIDDEN rules and the specifier scanner work, against the
    // two modules that legitimately DO import the forbidden things.
    const testingGraph = reachableFrom(join(SRC, 'testing.ts'));
    const allSpecs = [...testingGraph.values()].flat();
    expect(allSpecs).toContain('better-sqlite3');
    expect(allSpecs).toContain('vitest');
  });
});
