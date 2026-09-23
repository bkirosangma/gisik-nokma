import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

/**
 * 18.164 — the built embedding module never `dlopen`s a native binding
 * (task/notes-3-runtime-fix).
 *
 * ## What actually killed the server at boot, and what this guards
 *
 * `apps/server/src/search/embedding.ts` used to import `AutoTokenizer` from
 * `@huggingface/transformers`. That package's `exports` map has no subpaths —
 * only the whole-package `node`/`default` conditions — so importing ANY
 * export from it resolves to `dist/transformers.node.mjs`, whose TOP-LEVEL
 * module body runs `createRequire(...)("onnxruntime-node")`
 * (`dist/transformers.node.mjs:8497`). That `dlopen` runs at import time
 * regardless of which export the caller wanted, and it fails on the
 * `node:22-alpine` (musl) runtime image with `ERR_DLOPEN_FAILED` — the server
 * died before it could serve a request. See `embedding.ts`'s own docblock for
 * the full measured chain and the fix (`@huggingface/tokenizers`, the same
 * tokenizer code through a public entry that never links a native binding).
 *
 * ## Why a fresh CHILD process, not an in-worker import
 *
 * `process.dlopen` is Node's own boundary for loading a `.node` binary, and
 * wrapping it catches ANY native binding the import graph pulls in — not only
 * the one this bug happened to be. But the vitest worker is a single shared
 * process across every test file in this run; if some unrelated suite had
 * already `require`d a native module for its own reasons (or if this test
 * itself ran twice), a later dlopen call would find CommonJS's module cache
 * already warm and never call through `process.dlopen` again, so a REAL
 * regression could read as a clean zero for the wrong reason. A fresh `node`
 * child process is the only place this run's dlopen count is unambiguous.
 *
 * ## Why this imports `dist/`, and what that means for the mutation
 *
 * The guard proves what actually SHIPS: `pnpm deploy --prod` ships built
 * output, not `src/`. That also means this case is only as fresh as the last
 * build — like every other suite in this repo, it must run AFTER `pnpm turbo
 * run build`, and a check below fails loudly (not silently green) if
 * `dist/search/embedding.js` is missing.
 *
 * Mutation: revert `embedding.ts`'s import to `AutoTokenizer` from
 * `@huggingface/transformers` and rebuild — 18.164 goes red, catching a
 * non-empty `nativeLoads` array.
 */

const execFileAsync = promisify(execFile);

const SERVER_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST_EMBEDDING_PATH = `${SERVER_ROOT}/dist/search/embedding.js`;
const EMBEDDING_CHILD_SCRIPT = fileURLToPath(new URL('../fixtures/embedding-dlopen-child.mjs', import.meta.url));
const NATIVE_LOAD_CHILD_SCRIPT = fileURLToPath(new URL('../fixtures/known-native-load-child.mjs', import.meta.url));

type DlopenResult = { nativeLoads: string[]; dims?: number; error?: string };

async function runChild(script: string, moduleArg: string): Promise<DlopenResult> {
  const { stdout } = await execFileAsync(process.execPath, [script, moduleArg], {
    cwd: SERVER_ROOT,
    timeout: 30_000,
  });
  return JSON.parse(stdout) as DlopenResult;
}

describe('18.164 the built embedding module never dlopens a native binding', () => {
  it('CONTROL — the dlopen-interception harness itself catches a KNOWN native load', async () => {
    // Proves the instrument works before trusting a zero from it: imports the
    // old, buggy entry point directly (kept only as a devDependency for
    // 18.165's tokenizer-equivalence test) and expects at least one dlopen.
    const require = createRequire(import.meta.url);
    const transformersEntry = require.resolve('@huggingface/transformers');
    const result = await runChild(NATIVE_LOAD_CHILD_SCRIPT, transformersEntry);
    expect(
      result.nativeLoads.length,
      `expected the harness to observe a native dlopen from @huggingface/transformers — saw ${JSON.stringify(result.nativeLoads)}`,
    ).toBeGreaterThan(0);
  });

  it('imports dist/search/embedding.js in a fresh process and embeds one string with zero native loads', async () => {
    if (!existsSync(DIST_EMBEDDING_PATH)) {
      throw new Error(
        `${DIST_EMBEDDING_PATH} does not exist — run \`pnpm turbo run build\` before this suite (this case reads built output, matching what \`pnpm deploy --prod\` actually ships).`,
      );
    }
    const result = await runChild(EMBEDDING_CHILD_SCRIPT, DIST_EMBEDDING_PATH);
    // Asserted BEFORE `dims`, deliberately: a regression that reintroduces the
    // native import can also fail downstream (network, a changed API) for a
    // reason that has nothing to do with dlopen — asserting `nativeLoads`
    // first keeps the failure message about the actual defect this case
    // guards, not a neighbouring symptom.
    expect(
      result.nativeLoads,
      `the embedding module graph must not dlopen a native binding — this is exactly what produced ERR_DLOPEN_FAILED at boot when the tokenizer import pulled in onnxruntime-node (child reported: ${result.error ?? 'no error'})`,
    ).toEqual([]);
    expect(result.dims, 'the fixed backend still embeds to EMBEDDING_DIM').toBe(512);
  });
});
