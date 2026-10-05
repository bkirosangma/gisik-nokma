#!/usr/bin/env node
// mutate-ast.mjs <repo> <pkgdir> <relfile> <ranges-json> — ctl mutate's custom pre-step for ONE source file, read from disk, never written.
// Prints one JSON object: { customs, casts, skipped, injectParse, transformed, castOnly, strykerCount, countError }.
//  - customs: the classes Stryker has no mutator for, on the changed lines only (TEST-STRENGTH-BRIEF 2b, process log P20):
//      (a) every non-zero numeric literal ×10 and ÷10;  (b) Math.ceil ↔ Math.floor, and either ↔ Math.round.
//    Skipped, and counted by reason in `skipped`: zero, type positions (`0 | 1`), enum member initialisers, property names (bigint
//    literals are a different node and never seen).
//  - casts: every `x as T` (`as const` included: both are type-only) overlapping a changed line. Stryker skips everything inside a
//    TSAsExpression (the spike: TL4 O3/O4 hid there), so `transformed` blanks ` as T` to spaces. `<T>x` assertions are left alone
//    (none in the repo's sources; a .tsx file cannot hold them).
//  - transformed: the file with those casts blanked and each custom mutant injected as a switch Stryker itself mutates:
//      200        -> (false ? 2000 : false ? 20 : 200)
//      Math.ceil  -> (false ? Math.floor : false ? Math.round : Math.ceil)
//    Stryker's BooleanLiteral / ConditionalExpression flip of a `false` to `true` selects that alternative, so the custom mutants run
//    inside the ONE per-file Stryker slot-run with its per-test coverage. No newline is added or removed: every line number holds.
//  - injectParse: 'ok', or why the injected copy is rejected (more parse errors than the original, or the CTL_MUTATE_INJECT_FAIL test
//    seam); the caller then runs that file's custom mutants one vitest run each on `castOnly` (casts blanked, nothing injected).
//  - strykerCount: Stryker's own mutant count per line of `transformed` within the ranges (its instrumenter, no test run), used to
//    split a file above the per-run cap. countError says why it is missing (the caller then estimates).
import { createRequire } from 'node:module';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, pkgdir, relfile, rangesJson] = process.argv.slice(2);
if (!repo || !pkgdir || !relfile || !rangesJson) {
  console.error('usage: mutate-ast.mjs <repo> <pkgdir> <relfile> <ranges-json>');
  process.exit(2);
}
const ranges = JSON.parse(rangesJson); // [[startLine, endLine], ...], 1-based, inclusive
const onChanged = (a, b) => ranges.some(([s, e]) => a <= e && b >= s);

function loadTs() {
  for (const base of [join(pkgdir, 'package.json'), join(repo, 'package.json')]) {
    try { return createRequire(base)('typescript'); } catch { /* next */ }
  }
  throw new Error(`typescript is not resolvable from ${pkgdir} or ${repo}`);
}
const ts = loadTs();

const abs = join(pkgdir, relfile);
const text = readFileSync(abs, 'utf8');
const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, relfile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

// ---- ×10 / ÷10 on the literal's own digits (no float noise: 0.05 -> 0.5 and 0.005, 1.1 -> 11 and 0.11) ----
export function shiftDecimal(lit, by) {
  const clean = lit.replace(/_/g, '');
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(clean);
  if (!m) { // hex / octal / binary: compute
    const v = Number(clean) * 10 ** by;
    return String(v);
  }
  const [, ip = '', fp = '', ex] = m;
  if (ex !== undefined) return `${ip}${fp ? '.' + fp : ''}e${Number(ex) + by}`;
  let digits = ip + fp;
  let point = ip.length + by;
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) digits = digits + '0'.repeat(point - digits.length);
  let i = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
  let f = digits.slice(point).replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
}

function inTypePosition(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isTypeNode(p)) return true;
    if (ts.isExpressionStatement(p) || ts.isBlock(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}
function inEnum(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isEnumMember(p)) return true;
    if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}
function isPropertyName(node) {
  const p = node.parent;
  return !!p && (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p)
    || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p)) && p.name === node;
}

const ROUND_ALTS = { ceil: ['floor', 'round'], floor: ['ceil', 'round'], round: ['ceil', 'floor'] };
const customs = [];
const casts = [];
const skipped = { zero: 0, type: 0, enum: 0, property: 0 };
function visit(node) {
  if (ts.isNumericLiteral(node)) {
    const start = node.getStart(sf), end = node.getEnd(), raw = node.getText(sf);
    const ln = lineOf(start);
    if (onChanged(ln, lineOf(end))) {
      const why = Number(raw.replace(/_/g, '')) === 0 ? 'zero' : inEnum(node) ? 'enum' : inTypePosition(node) ? 'type' : isPropertyName(node) ? 'property' : null;
      if (why) skipped[why]++;
      else customs.push({ kind: 'numeric', line: ln, start, end, original: raw, alts: [shiftDecimal(raw, 1), shiftDecimal(raw, -1)] });
    }
  } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Math'
    && Object.hasOwn(ROUND_ALTS, node.expression.name.text)) {
    const callee = node.expression, start = callee.getStart(sf), end = callee.getEnd();
    const ln = lineOf(start);
    if (onChanged(ln, lineOf(end))) {
      const fn = callee.name.text;
      customs.push({ kind: 'rounding', line: ln, start, end, original: `Math.${fn}`, alts: ROUND_ALTS[fn].map((a) => `Math.${a}`) });
    }
  } else if (ts.isAsExpression(node)) {
    const start = node.getStart(sf), end = node.getEnd();
    if (onChanged(lineOf(start), lineOf(end))) casts.push({ line: lineOf(node.expression.getEnd()), cut: [node.expression.getEnd(), end], text: text.slice(node.expression.getEnd(), end).trim() });
  }
  ts.forEachChild(node, visit);
}
visit(sf);

// ---- build `transformed`: blank the casts (newlines kept), inject the switches; track each switch's `false` tokens ----
const blank = (s) => s.replace(/[^\n\r]/g, ' ');
const edits = [
  ...casts.map((c) => ({ start: c.cut[0], end: c.cut[1], kind: 'cast' })),
  ...customs.map((c, i) => ({ start: c.start, end: c.end, kind: 'custom', i })),
];
edits.sort((a, b) => a.start - b.start || b.end - a.end);
let out = '';
let castOnly = '';
let at = 0;
for (const e of edits) {
  if (e.start < at) continue; // nested inside a blanked cast (a type): nothing to inject
  out += text.slice(at, e.start);
  castOnly += text.slice(at, e.start);
  castOnly += e.kind === 'cast' ? blank(text.slice(e.start, e.end)) : text.slice(e.start, e.end);
  if (e.kind === 'cast') {
    out += blank(text.slice(e.start, e.end));
  } else {
    const c = customs[e.i];
    const tokens = [];
    let sw = '(';
    for (const alt of c.alts) { tokens.push(out.length + sw.length); sw += `false ? ${alt} : `; }
    sw += `${c.original})`;
    const base = out.length;
    out += sw;
    c.switchSpan = [base, out.length];
    c.tokens = tokens; // offsets of each `false` in `transformed`, alt k <- tokens[k]
  }
  at = e.end;
}
out += text.slice(at);
castOnly += text.slice(at);

// ---- the injected copy must parse (ruling 16:40 (3)); otherwise the caller falls back to one vitest run per custom mutant ----
const parseErrors = (src) => ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, false, relfile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS).parseDiagnostics.length;
let injectParse = 'ok';
const seam = process.env.CTL_MUTATE_INJECT_FAIL; // test seam: a regex of relfiles whose injected copy is treated as unparsable
if (seam && new RegExp(seam).test(relfile)) injectParse = 'rejected (CTL_MUTATE_INJECT_FAIL seam)';
else if (parseErrors(out) > parseErrors(text)) injectParse = `rejected (${parseErrors(out) - parseErrors(text)} new parse errors)`;

// offsets -> {line, column} (1-based line, 0-based column) in `transformed`
const lineStarts = [0];
for (let i = 0; i < out.length; i++) if (out[i] === '\n') lineStarts.push(i + 1);
const lc = (off) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1; } return { line: lo + 1, column: off - lineStarts[lo] }; };
for (const c of customs) {
  if (!c.tokens) continue;
  c.tokenPos = c.tokens.map(lc);
  c.switch = { start: lc(c.switchSpan[0]), end: lc(c.switchSpan[1]) };
  delete c.tokens; delete c.switchSpan;
}

// ---- Stryker's own count per line (its instrumenter; no test run) ----
let strykerCount = null, countError = null;
try {
  const coreDir = realpathSync(join(repo, 'node_modules', '@stryker-mutator', 'core'));
  const instrDir = join(dirname(coreDir), 'instrumenter');
  if (!existsSync(join(instrDir, 'package.json'))) throw new Error(`no @stryker-mutator/instrumenter beside ${coreDir}`);
  const { Instrumenter } = await import(pathToFileURL(join(instrDir, 'dist', 'src', 'index.js')).href);
  const quiet = { isTraceEnabled: () => false, isDebugEnabled: () => false, isInfoEnabled: () => false, isWarnEnabled: () => false, isErrorEnabled: () => false, isFatalEnabled: () => false, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };
  const mutate = ranges.map(([s, e]) => ({ start: { line: s - 1, column: 0 }, end: { line: e, column: 0 } }));
  const res = await new Instrumenter(quiet).instrument([{ name: abs, content: out, mutate }], { plugins: null, excludedMutations: [], ignorers: [] });
  strykerCount = {};
  for (const m of res.mutants) { const l = m.location.start.line + 1; strykerCount[l] = (strykerCount[l] || 0) + 1; }
} catch (err) {
  countError = String(err && err.message || err).split('\n')[0];
}

process.stdout.write(JSON.stringify({
  customs: customs.map(({ start, end, ...rest }) => ({ ...rest, origStart: start, origEnd: end })),
  casts: casts.map(({ cut, ...rest }) => rest),
  skipped,
  injectParse,
  transformed: out,
  castOnly,
  strykerCount,
  countError,
}) + '\n');
