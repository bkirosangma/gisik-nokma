// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findHttpUsage, scanForHttpOutsideOnline } from './helpers/http-scan.js';

/**
 * Coordination amendment 10, enforced rather than asserted: `src/online/` is the
 * ONLY module in this package allowed to speak HTTP, and views reach the world
 * through `DataSource` alone.
 *
 * Case 3.35 (`test-cases/03-foundation-ledger.md`).
 */
describe('3.35 the scanner is proven against planted defects before it is trusted', () => {
  it('catches online imports, fetch, WebSocket, XHR and EventSource', () => {
    expect(findHttpUsage("import { createHttpClient } from '../online/http.js';")).toEqual([
      'online import',
    ]);
    expect(findHttpUsage('const response = await fetch(url);')).toEqual(['fetch call']);
    expect(findHttpUsage('const socket = new WebSocket(url);')).toEqual([
      'WebSocket construction',
    ]);
    expect(findHttpUsage('new XMLHttpRequest()')).toEqual(['XMLHttpRequest']);
    expect(findHttpUsage('new EventSource(url)')).toEqual(['EventSource construction']);
  });

  it('lets DataSource consumption through', () => {
    expect(findHttpUsage('const board = await dataSource.query.getBoard(projectId);')).toEqual([]);
  });

  /**
   * 3.47 — the two spellings the `from`-anchored pattern could not see.
   *
   * MEASURED before it was fixed: with `/from\s+['"][^'"]*\/online…/`, both
   * lines below returned `[]` — the SAME answer a clean line gives — while the
   * `fetch` control in the same run returned a hit. A view module could have
   * reached the one module this scanner exists to fence off and been reported
   * clean, which is the failure shape this file is named for.
   */
  it('3.47 PLANTED DEFECT: catches an online import reached by dynamic import or require', () => {
    expect(findHttpUsage("await import('../online/http.js');")).toEqual(['online import']);
    expect(findHttpUsage("const { createHttpClient } = require('../online/http.js');")).toEqual([
      'online import',
    ]);
    // The bare side-effect spelling, which carries no `from` either.
    expect(findHttpUsage("import '../online/index.js';")).toEqual(['online import']);
    // Control, same run: the pattern is still ANCHORED. This scanner reads raw
    // lines, comments included, so an unanchored one would fire on every
    // docblock in `src/` that names the path — and there are several.
    expect(findHttpUsage(" * lives in '../online/http.js' and nowhere else")).toEqual([]);
    expect(findHttpUsage('// the online/ module is the only one allowed to')).toEqual([]);
  });
});

describe('3.35 amendment 10: views never speak HTTP', () => {
  it('finds no HTTP usage in src/ outside src/online/', () => {
    const { hits, scanned } = scanForHttpOutsideOnline();
    const report = hits.map((hit) => `${hit.file}:${hit.line} ${hit.match}`).join('\n');
    expect(hits, `HTTP escaped the online module:\n${report}`).toEqual([]);
  });

  /**
   * 3.35 — the positive control the clean-tree assertion above cannot supply
   * for itself. A scanner pointed at a directory that does not hold the client
   * reports "no HTTP anywhere" in exactly the same words as a clean tree, so
   * what makes the emptiness above a measurement is that the walk really
   * reached the view layer and really skipped `online/`.
   */
  it('walked the real src/, view layer included, and skipped only online/', () => {
    const { scanned } = scanForHttpOutsideOnline();
    expect(scanned).toContain('views/board.tsx');
    expect(scanned).toContain('data-source.ts');
    expect(scanned).toContain('provenance.ts');
    // The exclusion is an exclusion of `online/` and nothing else: every file
    // the walk skipped is under it.
    expect(scanned.filter((file) => file.startsWith('online/'))).toEqual([]);
  });
});
