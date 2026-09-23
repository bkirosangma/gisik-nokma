import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * 18.166 — the RUNTIME IMAGE boots past the tokenizer import and embeds
 * (task/notes-3-runtime-fix). 🧪 — see "`DOCKER_BOOT_CHECK=1` or it does not
 * run" below.
 *
 * ## What the other cases in this file do NOT prove
 *
 * `dockerfile-cache-shape.test.ts`, `compose-dev-contract.test.ts` and
 * `entrypoint-ca.test.ts` all read the Dockerfile/compose TEXT — none of them
 * actually builds or runs the image. 18.164's dlopen guard proves the built
 * `dist/search/embedding.js` never dlopens a native binding, but on THIS
 * (glibc) host that would be true even for the buggy code, because
 * `onnxruntime-node`'s native binding loads fine here — the whole reason the
 * bug shipped past every suite that ran on a developer's Mac. Only a real
 * `node:22-alpine` (musl) container can reproduce `ERR_DLOPEN_FAILED`, which
 * is the actual failure this task was dispatched to fix. This case is the one
 * that runs the real image.
 *
 * ## `DOCKER_BOOT_CHECK=1` or it does not run
 *
 * A `docker build` here takes low-single-digit minutes even warm, and every
 * other case in this file runs on a plain `vitest` pass — a suite that always
 * paid that cost would be a suite people disable. Gated the same way 18.161
 * gates the seeded-corpus perf run, and the skip PRINTS what it would have
 * checked so the gap stays visible rather than silently untested.
 *
 * ## What each assertion proves
 *
 * 1. `docker build --target runtime` succeeds — the image the Dockerfile
 *    actually ships.
 * 2. `node -e "import('./dist/search/embedding.js')…"` inside that image
 *    embeds a string to 512 dims with no `ERR_DLOPEN_FAILED` — the exact
 *    acceptance check the controller specified.
 * 3. `/app/node_modules/@huggingface` contains ONLY `tokenizers` — proves
 *    `pnpm deploy --prod` actually pruned the `devDependency`
 *    `@huggingface/transformers`, not merely that this repo intends it to.
 * 4. `node dist/index.js` with placeholder config reaches "Server listening"
 *    — proves the WHOLE app's import graph evaluates cleanly in the image,
 *    not only the one module the acceptance check named. The job says "the
 *    server must BOOT", and only the full entrypoint proves that.
 *
 * ## Mutation, and a measured surprise worth recording
 *
 * Reverting ONLY `embedding.ts`'s import to `AutoTokenizer` (package.json
 * left as this change leaves it, `@huggingface/transformers` a
 * `devDependency`) was tried against a real rebuilt image: (1) and (3) still
 * pass — the build doesn't execute the import, and the prune doesn't care
 * what `src` asks for — but (2) and (4) fail, NOT with the original
 * `ERR_DLOPEN_FAILED`: `pnpm deploy --prod` already pruned
 * `@huggingface/transformers` out of the image regardless of what imports
 * it, so the crash is `ERR_MODULE_NOT_FOUND` instead (the `devDependency`
 * demotion is a second, independent layer of protection past the tokenizer
 * fix itself). Both cases still fail — `JSON.parse` on empty stdout in (2),
 * a missing "Server listening" in (4) — just not on the literal
 * `ERR_DLOPEN_FAILED` string, which is why that assertion is one of several
 * rather than the only one. Reproducing the LITERAL historical error needs a
 * second mutation, moving `@huggingface/transformers` back into
 * `dependencies` too — not reverified here, but implied by `git log` on
 * `apps/server/package.json` and this file's own opening paragraphs, which
 * quote the controller's measurement of exactly that image, exactly that
 * error.
 */

const ENABLED = process.env['DOCKER_BOOT_CHECK'] === '1';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const DOCKERFILE = `${REPO_ROOT}/apps/server/Dockerfile`;
const IMAGE_TAG = 'gisik-nokma-server-notes3-boot-check';

async function docker(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('docker', args, { cwd: REPO_ROOT, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
}

describe('18.166 — the runtime image boots past the tokenizer import', () => {
  if (!ENABLED) {
    console.log(
      '18.166 image-boot: SKIPPED — set DOCKER_BOOT_CHECK=1 to build and run the real apps/server runtime image. ' +
        'It would build `--target runtime` from apps/server/Dockerfile, embed one string inside it, list ' +
        '/app/node_modules/@huggingface, and boot dist/index.js to "Server listening", asserting no ERR_DLOPEN_FAILED.',
    );
    it.skip('builds the runtime image and boots it (set DOCKER_BOOT_CHECK=1)', () => undefined);
    return;
  }

  afterAll(async () => {
    await execFileAsync('docker', ['image', 'rm', '-f', IMAGE_TAG], { cwd: REPO_ROOT }).catch(() => undefined);
  });

  it(
    'docker build --target runtime succeeds',
    async () => {
      await docker(['build', '-f', DOCKERFILE, '--target', 'runtime', '-t', IMAGE_TAG, '.'], 480_000);
    },
    500_000,
  );

  it(
    'embeds a string to 512 dims inside the image, with no ERR_DLOPEN_FAILED',
    async () => {
      const script =
        "import('./dist/search/embedding.js').then(async (m) => { " +
        "const v = await m.embedQuery('warm-up'); console.log(JSON.stringify({ dims: v.length })); " +
        "}).catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });";
      const { stdout } = await docker(['run', '--rm', '--entrypoint', 'node', IMAGE_TAG, '-e', script], 30_000);
      expect(stdout, 'the image must not print ERR_DLOPEN_FAILED').not.toContain('ERR_DLOPEN_FAILED');
      const parsed = JSON.parse(stdout.trim()) as { dims: number };
      expect(parsed.dims).toBe(512);
    },
    40_000,
  );

  it(
    'only @huggingface/tokenizers ships — the devDependency @huggingface/transformers was pruned',
    async () => {
      const { stdout } = await docker(['run', '--rm', '--entrypoint', 'ls', IMAGE_TAG, '/app/node_modules/@huggingface'], 15_000);
      const entries = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      expect(entries).toEqual(['tokenizers']);
    },
    20_000,
  );

  it(
    'node dist/index.js boots to "Server listening" with placeholder config',
    async () => {
      const child = execFile(
        'docker',
        [
          'run',
          '--rm',
          '--name',
          `${IMAGE_TAG}-full-boot`,
          '-e',
          'DATABASE_URL=postgres://x:x@127.0.0.1:1/x',
          '-e',
          'BETTER_AUTH_URL=http://127.0.0.1:3000',
          '-e',
          'BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef',
          '-e',
          'WEB_ORIGIN=http://127.0.0.1:3001',
          '--entrypoint',
          'node',
          IMAGE_TAG,
          'dist/index.js',
        ],
        { cwd: REPO_ROOT },
      );
      let out = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        out += chunk.toString();
      });
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && !out.includes('Server listening') && !out.includes('ERR_DLOPEN_FAILED')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await execFileAsync('docker', ['stop', '-t', '1', `${IMAGE_TAG}-full-boot`]).catch(() => undefined);
      expect(out, 'must not crash on the tokenizer import').not.toContain('ERR_DLOPEN_FAILED');
      expect(out, 'the whole app, not just the embedding module, must boot').toContain('Server listening');
    },
    30_000,
  );
});
