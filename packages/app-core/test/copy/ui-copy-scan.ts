import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** The repository root, from `packages/app-core/test/copy`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** The roots whose strings a person reads (UX fixes T11, 23.190-23.194). */
export const UI_SOURCE_ROOTS: readonly string[] = [
  'apps/web/src',
  'apps/web/app',
  'packages/app-core/src',
  'packages/ui/src',
];

export type StringHit = { file: string; line: number; text: string };

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.next', 'generated']);

/** Every `.ts`/`.tsx` under a root, tests and generated modules excluded. */
export function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED_DIRS.has(name)) walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(name) || /\.(test|generated)\.tsx?$|\.d\.ts$/.test(name)) continue;
      out.push(path);
    }
  };
  walk(resolve(REPO_ROOT, root));
  return out;
}

/**
 * Every string a person could read in one source text: string literals, template
 * chunks and JSX text. Comments are not nodes, so they never appear; that is the
 * reason this walks the syntax tree and not the lines.
 */
export function stringsIn(file: string, source: string): StringHit[] {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const hits: StringHit[] = [];
  const visit = (node: ts.Node): void => {
    let text: string | null = null;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      text = node.text;
    } else if (ts.isJsxText(node)) {
      text = node.getText();
    }
    if (text !== null && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) {
      hits.push({
        file,
        line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        text: text.replace(/\s+/g, ' '),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/** The strings of every UI source file whose text matches `pattern`. */
export function uiStringsMatching(pattern: RegExp, roots: readonly string[] = UI_SOURCE_ROOTS): StringHit[] {
  const found: StringHit[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      for (const hit of stringsIn(file, readFileSync(file, 'utf8'))) {
        if (pattern.test(hit.text)) found.push({ ...hit, file: relative(REPO_ROOT, file) });
      }
    }
  }
  return found;
}

/**
 * The lines a `description:` property's initializer covers: the model-facing text of an MCP tool
 * definition (HK-3b, 23.372). A string on one of these lines is a description, not a reply.
 */
export function descriptionLines(file: string, source: string): Set<number> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'description') {
      const first = sf.getLineAndCharacterOfPosition(node.initializer.getStart()).line + 1;
      const last = sf.getLineAndCharacterOfPosition(node.initializer.getEnd()).line + 1;
      for (let line = first; line <= last; line++) lines.add(line);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

/** One reasoned exception. An entry with no `reason` is a review blocker. */
export type AllowEntry = { file: string; contains: string; reason: string };

export function withoutAllowed(hits: StringHit[], allow: readonly AllowEntry[]): StringHit[] {
  return hits.filter(
    (hit) => !allow.some((entry) => hit.file.endsWith(entry.file) && hit.text.includes(entry.contains)),
  );
}

export const describeHit = (hit: StringHit): string => `${hit.file}:${hit.line}: ${hit.text.trim().slice(0, 100)}`;

/** Every `.css` under the UI roots. */
export function cssFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED_DIRS.has(name)) walk(path);
      } else if (name.endsWith('.css')) out.push(path);
    }
  };
  for (const root of ['packages/ui/src', 'apps/web/app', 'apps/web/src']) walk(resolve(REPO_ROOT, root));
  return out;
}
