import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Tokenizer } from '@huggingface/tokenizers';

/**
 * The in-process embedding backend (spec §7.6, Plan 3 of 6).
 *
 * ## Backend B was MEASURED, not assumed
 *
 * Spec §7.6 names `Xenova/all-MiniLM-L6-v2` (ONNX, quantized, 384 dims), and
 * the plan required a spike before any of this was written, because
 * `onnxruntime-node` ships glibc binaries and the runtime image is
 * `node:22-alpine` (musl). The spike was run, inside the real image, built with
 * `docker build --target runtime -f apps/server/Dockerfile .`:
 *
 *   Error loading shared library ld-linux-aarch64.so.1: No such file or
 *   directory (needed by
 *   …/onnxruntime-node@1.30.0/…/bin/napi-v6/linux/arm64/onnxruntime_binding.node)
 *   code: 'ERR_DLOPEN_FAILED'
 *
 * So ONNX does not load on this image, and per the plan's own instruction the
 * Dockerfile base image was NOT changed to make it: that is a deploy change
 * nobody asked for. The static-embedding backend is what runs.
 *
 * ## The first fix still crashed the image — a SECOND, measured bug
 *
 * The tokenizer was believed to be a safe reason to keep
 * `@huggingface/transformers` as a runtime dependency: `AutoTokenizer` runs no
 * ONNX op, so the assumption was that importing only it would not touch
 * `onnxruntime-node`. That was wrong. The package's `package.json` `exports`
 * map has no subpaths — only the whole-package `node`/`default` conditions —
 * so importing ANYTHING from `@huggingface/transformers`, including just
 * `AutoTokenizer`, resolves to `dist/transformers.node.mjs`, whose TOP-LEVEL
 * module body (not a function called on demand) runs
 * `createRequire(import.meta.url)("onnxruntime-node")`
 * (`dist/transformers.node.mjs:8497`, from `src/backends/onnx-node.js`). The
 * `dlopen` happens at import time no matter which export is used, so the same
 * `ERR_DLOPEN_FAILED` that killed the ONNX spike also killed the
 * tokenizer-only import in the real image (measured 2026-09-23, controller,
 * task/notes-3-runtime-fix) — the server died at boot before ever reaching a
 * search request.
 *
 * ## The fix is `@huggingface/tokenizers` — the SAME code, not a rewrite
 *
 * `AutoTokenizer`'s WordPiece/BertNormalizer/BertPreTokenizer machinery is not
 * homegrown inside `@huggingface/transformers`: `dist/transformers.node.mjs`
 * bundles `@huggingface/tokenizers@0.2.0`'s own `dist/tokenizers.mjs`
 * verbatim (its source-comment names that exact path). That package is also
 * published standalone — zero `dependencies`, no `.node` binaries anywhere
 * under it, no `fetch(` call in its bundle, Apache-2.0 licensed — and
 * importing it directly reaches the identical tokenizer implementation
 * through a public entry point that never links `onnxruntime-node`.
 * `test/search/tokenizer-equivalence.test.ts` proves the two produce
 * identical token-id sequences over 200+ strings on this (glibc) host, where
 * both can load; it is the evidence that swapping the import does not
 * silently change the vectors already stored in `search_note_chunks`.
 *
 * `Tokenizer`'s constructor takes the ALREADY-PARSED `tokenizer.json` and
 * `tokenizer_config.json` (read below with the same `readFile` used for the
 * safetensors shards) rather than a `from_pretrained(id)` loader — there is no
 * fetch path to disable here, which is a STRONGER "no network" guarantee than
 * the flag this module used to set on `@huggingface/transformers`'s `env`: the
 * capability to fetch a model is not linked into the process at all.
 *
 * `@huggingface/transformers` stays a `devDependency` of `apps/server`, kept
 * ONLY so the host-only equivalence test above can still import
 * `AutoTokenizer` for comparison. `pnpm deploy --prod` (what builds the
 * runtime image; see the Dockerfile's `build` stage) does not install
 * `devDependencies`, so `onnxruntime-node` never reaches the image — verified
 * in this change by listing `/app/node_modules/@huggingface` inside the built
 * image.
 *
 * ## What a static model is, and why it needs no native code
 *
 * `minishlab/potion-base-32M` is a model2vec distillation: one 512-dimensional
 * vector PER TOKEN and nothing else. There is no transformer to execute, so
 * there is no ONNX runtime to load — a text's vector is the mean of its token
 * vectors, L2-normalised.
 *
 * ## The table is TWO committed files, and that is a GitHub limit
 *
 * The published `model.safetensors` is 129 MB in a single blob, over GitHub's
 * 100 MiB per-file limit — a push carrying it would be refused. It is split
 * along the VOCAB axis into `model.part-0-of-2.safetensors` and
 * `model.part-1-of-2.safetensors` (63 091 rows → 31 546 + 31 545), each a valid
 * safetensors file with its own header. They are concatenated here in filename
 * order, and their shapes are checked against each other and against
 * `EMBEDDING_DIM` — a truncated or reordered part has to be a loud failure and
 * not a table whose later token ids read the wrong rows.
 *
 * ## No network, ever
 *
 * Nothing in this module — or in `@huggingface/tokenizers` — holds a `fetch`
 * call or a remote-model id: `loadTable` and `loadTokenizer` both read fixed
 * paths under `MODEL_DIR` with `readFile` and nothing else. A server that
 * silently downloaded a model on first search would make its first query
 * slow, its startup unpredictable and its image's contents not the thing that
 * was tested, and that failure mode requires a networking code path to exist
 * in the first place — here it does not. `test/search/embedding.test.ts`
 * asserts this behaviourally (a `fetch` that throws does not stop
 * `embedTexts` from succeeding) and the model files are loaded from
 * `apps/server/models/` alone.
 */

/** `'<name>@<variant>'` — the variant is what `search_note_chunks.model` stores. */
export const CURRENT_MODEL = 'minishlab/potion-base-32M@static';

/** potion-base-32M's `hidden_dim`. The migration's `vector(EMBEDDING_DIM)` follows it. */
export const EMBEDDING_DIM = 512;

/** The directory name under `apps/server/models/`. */
const MODEL_DIR_NAME = 'potion-base-32M';

const MODELS_ROOT = fileURLToPath(new URL('../../models', import.meta.url));
const MODEL_DIR = `${MODELS_ROOT}/${MODEL_DIR_NAME}`;

/** The underlying batch size. Bigger batches buy nothing here (there is no GPU) and grow the batch's peak. */
const BATCH_SIZE = 16;

/** Spec §7.6: an LRU of 256 entries with a 60 s life. */
const QUERY_CACHE_MAX = 256;
const QUERY_CACHE_TTL_MS = 60_000;

type SafetensorsHeader = {
  embeddings?: { dtype?: string; shape?: number[]; data_offsets?: number[] };
};

/**
 * A `Float32Array` view over `buf`, copied if the view would be misaligned.
 *
 * `readFileSync`/`Buffer` may hand back a slice of a pooled `ArrayBuffer` whose
 * `byteOffset` is not a multiple of 4, and `new Float32Array(buffer, offset, n)`
 * THROWS on a misaligned offset. Copying is the branch that is always correct;
 * it costs one temporary the size of the part and is not on any hot path.
 */
function floatsAt(buf: Buffer, byteOffset: number, byteLength: number): Float32Array {
  const start = buf.byteOffset + byteOffset;
  if (start % 4 === 0) return new Float32Array(buf.buffer, start, byteLength / 4);
  const copy = Buffer.alloc(byteLength);
  buf.copy(copy, 0, byteOffset, byteOffset + byteLength);
  return new Float32Array(copy.buffer, copy.byteOffset, byteLength / 4);
}

async function readShards(): Promise<Float32Array[]> {
  const files = (await readdir(MODEL_DIR)).filter((name) => name.endsWith('.safetensors')).sort();
  if (files.length === 0) {
    throw new Error(`no safetensors shard in ${MODEL_DIR} — the model files did not reach the image`);
  }
  const shards: Float32Array[] = [];
  for (const file of files) {
    const buf = await readFile(`${MODEL_DIR}/${file}`);
    const headerLength = Number(buf.readBigUInt64LE(0));
    const header = JSON.parse(buf.subarray(8, 8 + headerLength).toString('utf8')) as SafetensorsHeader;
    const entry = header.embeddings;
    const shape = entry?.shape;
    const offsets = entry?.data_offsets;
    if (entry?.dtype !== 'F32' || !shape || shape.length !== 2 || !offsets) {
      throw new Error(`${file}: expected one F32 'embeddings' tensor of rank 2`);
    }
    const rows = shape[0] ?? 0;
    const dim = shape[1] ?? 0;
    if (dim !== EMBEDDING_DIM || rows === 0) {
      throw new Error(`${file}: shape ${JSON.stringify(shape)} is not R×${String(EMBEDDING_DIM)}`);
    }
    shards.push(floatsAt(buf, 8 + headerLength + (offsets[0] ?? 0), rows * dim * 4));
  }
  return shards;
}

let tablePromise: Promise<Float32Array> | null = null;

/** The `[rows × EMBEDDING_DIM]` token table, loaded once and kept. */
function loadTable(): Promise<Float32Array> {
  tablePromise ??= (async () => {
    const shards = await readShards();
    const rows = shards.reduce((total, shard) => total + shard.length / EMBEDDING_DIM, 0);
    const table = new Float32Array(rows * EMBEDDING_DIM);
    let at = 0;
    for (const shard of shards) {
      table.set(shard, at);
      at += shard.length;
    }
    return table;
  })();
  return tablePromise;
}

let tokenizerPromise: Promise<Tokenizer> | null = null;

/** Reads `tokenizer.json` and `tokenizer_config.json` from `MODEL_DIR` — no `from_pretrained` fetch path exists to disable. */
function loadTokenizer(): Promise<Tokenizer> {
  tokenizerPromise ??= (async () => {
    const [tokenizerJson, tokenizerConfig] = await Promise.all([
      readFile(`${MODEL_DIR}/tokenizer.json`, 'utf8').then((text) => JSON.parse(text) as object),
      readFile(`${MODEL_DIR}/tokenizer_config.json`, 'utf8').then((text) => JSON.parse(text) as object),
    ]);
    return new Tokenizer(tokenizerJson, tokenizerConfig);
  })();
  return tokenizerPromise;
}

/**
 * Mean of the token vectors, L2-normalised.
 *
 * The specials (`[CLS]`, `[SEP]`) are INCLUDED in the mean, which is what the
 * model's own reference implementation does: they were trained with a vector
 * like every other token, and dropping them would change the direction of every
 * vector by an amount nobody measured. A text that tokenises to nothing is
 * impossible in practice (the tokenizer always emits its specials) and is
 * guarded anyway, because a zero vector cannot be normalised and a NaN reaching
 * `vector_cosine_ops` is worse than a thrown error.
 */
function meanVector(table: Float32Array, ids: number[]): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIM);
  for (const id of ids) {
    const offset = id * EMBEDDING_DIM;
    if (offset < 0 || offset + EMBEDDING_DIM > table.length) {
      throw new Error(`token id ${id} is outside the embedding table`);
    }
    for (let index = 0; index < EMBEDDING_DIM; index += 1) {
      vector[index] = (vector[index] ?? 0) + (table[offset + index] ?? 0);
    }
  }
  let sum = 0;
  for (let index = 0; index < EMBEDDING_DIM; index += 1) {
    vector[index] = (vector[index] ?? 0) / ids.length;
    sum += (vector[index] ?? 0) ** 2;
  }
  const norm = Math.sqrt(sum);
  if (!(norm > 0)) throw new Error('embedding has zero norm');
  for (let index = 0; index < EMBEDDING_DIM; index += 1) vector[index] = (vector[index] ?? 0) / norm;
  return vector;
}

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const [table, tokenizer] = await Promise.all([loadTable(), loadTokenizer()]);
  return texts.map((text) => meanVector(table, tokenizer.encode(text).ids));
}

/** Embeds texts in batches of at most 16, in order. Units: `texts.length` vectors. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const vectors: Float32Array[] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    vectors.push(...(await embedBatch(texts.slice(start, start + BATCH_SIZE))));
  }
  return vectors;
}

type CacheEntry = { vector: Float32Array; at: number };

const queryCache = new Map<string, CacheEntry>();

/**
 * A query's vector, cached.
 *
 * A query is typed against a search box and re-sent on every correction, and
 * embedding it is the only per-query cost the meaning path has — the note
 * vectors are already in `search_note_chunks`. The Map is insertion-ordered, so
 * re-`set`ting on a hit makes the oldest entry the least recently used one and
 * the eviction is one `keys().next()`.
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  const hit = queryCache.get(text);
  if (hit !== undefined && Date.now() - hit.at <= QUERY_CACHE_TTL_MS) {
    queryCache.delete(text);
    queryCache.set(text, hit);
    return hit.vector;
  }
  const [vector] = await embedTexts([text]);
  if (vector === undefined) throw new Error('embedTexts returned no vector for one text');
  queryCache.set(text, { vector, at: Date.now() });
  while (queryCache.size > QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next();
    if (oldest.done) break;
    queryCache.delete(oldest.value);
  }
  return vector;
}

/** Test seam for the LRU's size and TTL, both of which are private otherwise. */
export function queryCacheSize(): number {
  return queryCache.size;
}
