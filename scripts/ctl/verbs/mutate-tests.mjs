#!/usr/bin/env node
// mutate-tests.mjs <repo> <pkgdir> <relfile> — ctl mutate's CAPPED test set for ONE source file (planner ruling 2026-10-04 19:25,
// task/ctl-mutate-server): the test files in the file's OWN package test dir that import it directly or through ONE re-export.
// Prints one JSON object: { testDir, tests: [{ file, via }], scanned }, paths relative to <pkgdir>, sorted.
//  - testDir: `test` when <pkgdir>/test is a directory (every vitest package in the repo but apps/desktop and apps/mobile), else the whole
//    package. A test file is a `*.test.ts`/`*.test.tsx` (`.mts`/`.cts` too) under it; node_modules, dist and dot-directories are skipped.
//  - An import is anything that LOADS the module at run time: `import … from`, a side-effect `import '…'`, `export … from`, a dynamic
//    `import('…')` and `vi.importActual('…')`. Never `import type` / `export type` (erased by esbuild) and never `vi.mock('…')` (it
//    replaces the module instead of running it).
//  - Only relative specifiers resolve (`./`, `../`): `.js`/`.jsx`/`.mjs`/`.cjs` map to their TypeScript source, an extensionless one tries
//    `.ts`, `.tsx`, `.mts` and then `/index.ts`, `/index.tsx`. A bare specifier (another package, or this package by its own name) is
//    never this file: a test that reaches it only that way is not in the set.
//  - via: `direct`, or the package-relative module M the test imports when M re-exports the file (`export … from`, not type-only).
//    The re-exporting module must sit in the same package (not under node_modules). One hop only: a re-export of a re-export, and a module that imports the file and exports something of its own (test/helpers →
//    src/app.ts → a route), are NOT in the set. A mutant only such a distant test kills therefore reports as a SURVIVOR (loud).
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, realpathSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const [repo, pkgdir, relfile] = process.argv.slice(2);
if (!repo || !pkgdir || !relfile) {
  console.error('usage: mutate-tests.mjs <repo> <pkgdir> <relfile>');
  process.exit(2);
}

function loadTs() {
  for (const base of [join(pkgdir, 'package.json'), join(repo, 'package.json')]) {
    try { return createRequire(base)('typescript'); } catch { /* next */ }
  }
  throw new Error(`typescript is not resolvable from ${pkgdir} or ${repo}`);
}
const ts = loadTs();

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const TEST_FILE = /\.test\.[cm]?tsx?$/;
const SKIP_DIRS = new Set(['node_modules', 'dist']);
const testDir = existsSync(join(pkgdir, 'test')) && statSync(join(pkgdir, 'test')).isDirectory() ? 'test' : '.';

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (!name.startsWith('.') && !SKIP_DIRS.has(name)) walk(p, out);
    } else if (TEST_FILE.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const JS_TO_TS = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const base = resolve(dirname(fromFile), spec);
  const ext = /\.[cm]?[jt]sx?$/.exec(base)?.[0];
  const cands = ext && JS_TO_TS[ext] ? JS_TO_TS[ext].map((e) => base.slice(0, -ext.length) + e)
    : ext ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, 'index.ts'), join(base, 'index.tsx')];
  const hit = cands.find(isFile);
  return hit ? realpathSync(hit) : null;
}

const parsed = new Map();
function parse(file) {
  if (!parsed.has(file)) {
    const text = readFileSync(file, 'utf8');
    parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }
  return parsed.get(file);
}
const strArg = (call) => call.arguments.length > 0 && ts.isStringLiteralLike(call.arguments[0]) ? call.arguments[0].text : null;

// the specifiers FILE loads at run time
function runtimeSpecs(file) {
  const specs = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) specs.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && !node.isTypeOnly) specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const s = strArg(node);
      if (s !== null && (callee.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'vi' && callee.name.text === 'importActual'))) specs.push(s);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return specs;
}

// the modules FILE re-exports (`export … from`, not type-only)
function reExports(file) {
  const out = [];
  for (const st of parse(file).statements) {
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly) {
      const r = resolveSpec(file, st.moduleSpecifier.text);
      if (r) out.push(r);
    }
  }
  return out;
}

const pkgReal = realpathSync(pkgdir);
const target = realpathSync(join(pkgdir, relfile));
const inPkg = (p) => p.startsWith(pkgReal + '/') && !p.split('/').includes('node_modules');
const files = walk(join(pkgReal, testDir), []);
const tests = [];
for (const tf of files) {
  const resolved = [...new Set(runtimeSpecs(tf).map((s) => resolveSpec(tf, s)).filter(Boolean))];
  let via = resolved.includes(target) ? 'direct' : null;
  for (const m of resolved) {
    if (via) break;
    if (inPkg(m) && reExports(m).includes(target)) via = relative(pkgReal, m);
  }
  if (via) tests.push({ file: relative(pkgReal, tf), via });
}
process.stdout.write(JSON.stringify({ testDir, tests, scanned: files.length }) + '\n');
