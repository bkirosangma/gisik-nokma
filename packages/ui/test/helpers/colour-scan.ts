import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ColourHit = { file: string; line: number; match: string };

/**
 * packages/ui/test/helpers → four levels up is the repo root.
 *
 * Deliberately NOT `new URL('../../../..', import.meta.url)` (the plan's
 * spelling): Vite statically rewrites that exact pattern into a dev-server
 * asset URL, so under Vitest the base arrives as
 * `http://localhost:3000/@fs/<repo root>` and `fileURLToPath` throws
 * "The URL must be of scheme file". Resolving the path after converting
 * `import.meta.url` on its own reads the same directory with no rewrite.
 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Every client source tree, present or future. Trees that do not exist yet are
 * skipped; the moment a plan creates one, the discipline covers it with no
 * edit here. apps/server is deliberately absent — it renders nothing.
 */
export const CLIENT_SOURCE_ROOTS = [
  'packages/ui/src',
  'packages/app-core/src',
  'packages/editor/src',
  'apps/web/src',
  'apps/web/app',
  'apps/desktop/src',
  'apps/mobile/src',
];

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\s*\(/g;

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.next', 'coverage', 'test-results']);

/** The one legal colour origin (coordination amendment 11). */
const ORIGIN_SUFFIX = join('packages', 'ui', 'src', 'tokens.ts');

export function findColourLiterals(content: string): string[] {
  return content.match(COLOUR_LITERAL) ?? [];
}

export function existingClientSourceRoots(): string[] {
  return CLIENT_SOURCE_ROOTS.map((root) => join(REPO_ROOT, root)).filter((root) => existsSync(root));
}

export function scanTreeForColourLiterals(root: string): ColourHit[] {
  const hits: ColourHit[] = [];
  walk(root, root, hits);
  return hits;
}

function walk(directory: string, root: string, hits: ColourHit[]): void {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry)) walk(path, root, hits);
      continue;
    }
    if (!SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) continue;
    if (path.endsWith(ORIGIN_SUFFIX)) continue;
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of findColourLiterals(line)) {
        hits.push({ file: relative(root, path), line: index + 1, match });
      }
    });
  }
}
