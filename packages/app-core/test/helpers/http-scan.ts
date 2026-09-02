import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type HttpHit = { file: string; line: number; match: string };

/**
 * `packages/app-core/test/helpers` → TWO levels up is the package root, and
 * `src` hangs off it. (The plan text's comment says three; it is wrong about
 * its own snippet, and a wrong path here would scan a directory that does not
 * exist — `readdirSync` throws, which is at least loud — or, worse, one that
 * does and holds nothing, which is silently empty. `scanForHttpOutsideOnline`
 * proves the root it walked really is `app-core/src` for that reason.)
 */
export const APP_CORE_SRC = fileURLToPath(new URL('../../src', import.meta.url));

/**
 * Four spellings reach a module and `from '…'` is one of them.
 *
 * MEASURED, not supposed: with the pattern anchored on `from` alone, both
 * `await import('../online/http.js')` and `require('../online/http.js')`
 * returned `[]` from `findHttpUsage` — the same answer a clean line gives —
 * while the `fetch` control returned a hit in the same run. A file could import
 * the one module this scanner exists to fence off and be reported clean.
 *
 * The anchor STAYS, widened to the three keywords rather than dropped, and the
 * reason is stated at the strength the measurement supports: this scanner reads
 * raw LINES, comments included, so an unanchored `/['"][^'"]*\/online['"]/`
 * would report any prose that quotes the path as an import. **No file outside
 * `src/online/` quotes it today — measured, zero hits** — so this guards a
 * comment nobody has written yet rather than one that exists. It is still the
 * right shape: the docblocks in this repository name module paths constantly
 * (`no-http-in-views.test.ts` keeps two such lines as controls), and a guard
 * whose first false positive is a matter of when is a guard that gets deleted.
 *
 * `\(?` covers the two call spellings; `from` and bare `import` carry no
 * parenthesis.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: 'online import',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"][^'"]*\/online(?:\/|['"])/,
  },
  { label: 'fetch call', pattern: /\bfetch\s*\(/ },
  { label: 'WebSocket construction', pattern: /\bnew\s+WebSocket\b/ },
  { label: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { label: 'EventSource construction', pattern: /\bnew\s+EventSource\b/ },
];

export function findHttpUsage(content: string): string[] {
  return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(({ label }) => label);
}

/**
 * Every `.ts`/`.tsx` file under `src/` that this scan actually read, relative to
 * `src/` and slash-separated. Returned beside the hits so an empty hit list can
 * be told apart from an empty WALK — a scanner pointed at the wrong directory
 * reports "no HTTP anywhere" in exactly the same words as a clean tree.
 */
export type HttpScan = { hits: HttpHit[]; scanned: string[] };

/** Scans src/ excluding src/online — the one module allowed to speak HTTP. */
export function scanForHttpOutsideOnline(): HttpScan {
  const scan: HttpScan = { hits: [], scanned: [] };
  walk(APP_CORE_SRC, scan);
  return scan;
}

function walk(directory: string, scan: HttpScan): void {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'online') walk(path, scan);
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    const relativePath = relative(APP_CORE_SRC, path).split(sep).join('/');
    scan.scanned.push(relativePath);
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of findHttpUsage(line)) {
        scan.hits.push({ file: relativePath, line: index + 1, match });
      }
    });
  }
}
