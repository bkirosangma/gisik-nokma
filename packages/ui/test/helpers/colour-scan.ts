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

/**
 * ## WHY THIS SCANNER NEEDS CONTEXT, AND WHAT IT COST TO LEARN
 *
 * The pattern was `#[0-9a-fA-F]{3,8}\b` matched anywhere on any line. On
 * 2026-09-07 that turned `main` RED over the string **`#270`** — a PULL REQUEST
 * NUMBER inside a prose comment (`page.tsx`, *"createRegion was making until PR
 * #270"*). Three hex digits is a legal CSS shorthand colour, so **no amount of
 * tightening the SHAPE can separate the two**: `#270` and `#fff` are the same
 * token. Only where it sits can tell them apart.
 *
 * Two independent things had to change, and the first is the one that bites:
 *
 * 1. **Comments are stripped over the WHOLE FILE, never per line.** The `#270`
 *    that broke the gate sat in the middle of a multi-line block comment, on a
 *    line carrying no comment marker of its own. A per-line scanner — which is
 *    what this was — cannot see that such a line is inside a comment at all.
 *    Newlines are preserved through the strip so reported line numbers stay
 *    true.
 * 2. **A literal must sit where a colour is actually APPLIED.** In CSS that is a
 *    declaration value (after a `:`), which also stops `#abc` being read as an
 *    ID SELECTOR — a false positive that was latent here the whole time. In
 *    TS/JS it is inside a string or template literal, because no colour reaches
 *    a screen from JavaScript except through one.
 *
 * **What this deliberately no longer catches:** a colour literal written inside
 * a comment. That is not a discipline violation — amendment 11 governs what the
 * client SHIPS, and a hex in prose ships nothing. Documenting a raw colour is a
 * style question, not a token-origin one.
 *
 * **The limit, stated rather than discovered later:** context is judged per line
 * after comment-stripping, so a declaration split across lines (`color:\n
 * #fff;`) or a template literal opened on an earlier line is not seen. Both are
 * absent from this repo today, and the failure direction is a MISS rather than a
 * false red — which is the right way round for a gate that blocks every branch.
 */
const HEX = String.raw`#[0-9a-fA-F]{3,8}\b`;
const COLOUR_FUNCTION = String.raw`\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\s*\(`;

/** A hex sitting in a CSS declaration VALUE — after a `:`, before the `;` or `}`. */
const CSS_VALUE_HEX = new RegExp(String.raw`:[^;{}]*?(${HEX})`, 'g');
/** A hex inside a single-quoted, double-quoted or backtick string. */
const STRING_HEX = new RegExp(
  String.raw`'[^']*?(${HEX})[^']*?'|"[^"]*?(${HEX})[^"]*?"|\`[^\`]*?(${HEX})[^\`]*?\``,
  'g',
);
const COLOUR_FUNCTION_RE = new RegExp(COLOUR_FUNCTION, 'g');

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.next', 'coverage', 'test-results']);

/** The one legal colour origin (coordination amendment 11). */
const ORIGIN_SUFFIX = join('packages', 'ui', 'src', 'tokens.ts');

export type SourceKind = 'css' | 'script';

export function sourceKindOf(path: string): SourceKind {
  return path.endsWith('.css') ? 'css' : 'script';
}

/**
 * Blank out comment bodies, keeping every newline so line numbers survive.
 *
 * `//` is only treated as a line comment for scripts — in CSS it is not a
 * comment at all, and more importantly a URL (`url(https://…)`) would otherwise
 * swallow the rest of the line.
 */
export function stripComments(content: string, kind: SourceKind): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  let out = content.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (kind === 'script') out = out.replace(/\/\/[^\n]*/g, blank);
  return out;
}

/**
 * Colour literals in ONE already-comment-stripped line, in applied position.
 *
 * Capture groups are used rather than `String.match` because the surrounding
 * context (the `:` or the quotes) must be matched to prove the position but must
 * not be reported — a hit reads `#fff`, never `: #fff`.
 */
function literalsInStrippedLine(line: string, kind: SourceKind): string[] {
  const found: string[] = [];
  const pattern = kind === 'css' ? CSS_VALUE_HEX : STRING_HEX;
  pattern.lastIndex = 0;
  for (let m = pattern.exec(line); m !== null; m = pattern.exec(line)) {
    const hex = m.slice(1).find((group) => group !== undefined);
    if (hex !== undefined) found.push(hex);
  }
  COLOUR_FUNCTION_RE.lastIndex = 0;
  for (let m = COLOUR_FUNCTION_RE.exec(line); m !== null; m = COLOUR_FUNCTION_RE.exec(line)) {
    found.push(m[0]);
  }
  return found;
}

/**
 * Colour literals in a whole source text. Comments are stripped first, so this
 * must be handed the WHOLE file rather than a line — see the docblock above for
 * why the per-line spelling could not work.
 */
export function findColourLiterals(content: string, kind: SourceKind = 'css'): string[] {
  return stripComments(content, kind)
    .split('\n')
    .flatMap((line) => literalsInStrippedLine(line, kind));
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
    const kind = sourceKindOf(path);
    // Comments are stripped over the WHOLE file before any line is looked at,
    // which is the entire reason this reads the file rather than mapping lines:
    // the `#270` that turned main red sat inside a block comment on a line
    // carrying no marker of its own.
    const lines = stripComments(readFileSync(path, 'utf8'), kind).split('\n');
    lines.forEach((line, index) => {
      for (const match of literalsInStrippedLine(line, kind)) {
        // Repo-relative, NOT root-relative. The test flatMaps this walk across
        // every client source root, so a root-relative path cannot say which
        // package a hit came from — two roots each holding an `index.css`
        // produce two indistinguishable lines. That was harmless while this
        // package owned every scanned tree; it stops being harmless the moment
        // another lane's package is scanned by a test living here, because the
        // red surfaces in THIS suite and has to name someone else's file.
        hits.push({ file: relative(REPO_ROOT, path), line: index + 1, match });
      }
    });
  }
}
