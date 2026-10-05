// @vitest-environment node
/**
 * KG-D Task 6, decision G10 (case 27.505, `test-cases/27-knowledge-graph.md` §27.D): the edge sentences MOVED to
 * `@gisik-nokma/domain` (`packages/domain/src/graph-sentences.ts`), so the server and the MCP package write the
 * sentences the view draws without depending on this package, whose index exports React and Sigma code.
 * `src/engine/sentences.ts` is a re-export, and plan C's `sentences.test.ts` (27.232–27.235) runs against it unchanged.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as domain from '@gisik-nokma/domain';
import * as engine from '../../src/engine/sentences.js';

const DOMAIN_SRC = fileURLToPath(new URL('../../../domain/src', import.meta.url));
const PLAN_C_TEST = fileURLToPath(new URL('./sentences.test.ts', import.meta.url));
/** An import of a UI or graph-drawing package: what domain must never hold. */
const UI_IMPORT = /from\s+['"](react|react-dom|sigma|graphology)(['"/]|-[a-z])/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('27.505 the graph sentences live in domain (G10)', () => {
  it('27.505 the engine re-exports the SAME functions; plan C’s test reads the re-export; control: domain imports no UI package, and the scan finds a planted one', () => {
    const names = ['edgeSentence', 'relation', 'howText', 'provenanceLine', 'formatGraphDate'] as const;
    for (const name of names) {
      // `toBe`: two copies of the code are two function objects, so a copied file fails here however equal it reads.
      expect(engine[name], name).toBeTypeOf('function');
      expect(engine[name], name).toBe(domain[name]);
    }
    expect(Object.keys(engine).sort()).toEqual([...names].sort());
    // Plan C's 27.232–27.235 still import the engine path, so they run against the moved code through the re-export.
    expect(readFileSync(PLAN_C_TEST, 'utf8')).toContain("from '../../src/engine/sentences.js'");

    const files = filesUnder(DOMAIN_SRC);
    // The haystack holds its subject: the moved file is scanned.
    expect(files.some((file) => file.endsWith(join('src', 'graph-sentences.ts')))).toBe(true);
    expect(files.filter((file) => UI_IMPORT.test(readFileSync(file, 'utf8'))).map((file) => file.slice(DOMAIN_SRC.length))).toEqual([]);
    // CONTROL: the matcher finds each import shape it guards against, and not a domain-relative one.
    expect(UI_IMPORT.test("import { useMemo } from 'react';")).toBe(true);
    expect(UI_IMPORT.test("import type Sigma from 'sigma';")).toBe(true);
    expect(UI_IMPORT.test("import type { Attributes } from 'graphology-types';")).toBe(true);
    expect(UI_IMPORT.test("import { createRoot } from 'react-dom/client';")).toBe(true);
    expect(UI_IMPORT.test("import type { GraphEdgeView } from './graph.js';")).toBe(false);
  });
});
