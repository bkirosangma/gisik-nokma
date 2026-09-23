import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env, AutoTokenizer } from '@huggingface/transformers';

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
 * ## What a static model is, and why it needs no native code
 *
 * `minishlab/potion-base-32M` is a model2vec distillation: one 512-dimensional
 * vector PER TOKEN and nothing else. There is no transformer to execute, so
 * there is no ONNX runtime to load — a text's vector is the mean of its token
 * vectors, L2-normalised. The tokenizer still comes from
 * `@huggingface/transformers`, whose `AutoTokenizer` is pure JavaScript over
 * `tokenizer.json`, which is why the dependency is still here and why `onnxruntime`
 * is never imported on this path.
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
 * `env.allowRemoteModels = false` is set at module load, not inside the loader:
 * a server that silently downloads a model on first search would make its
 * first query slow, its startup unpredictable and its image's contents not the
 * thing that was tested. `test/search/embedding.test.ts` asserts this flag and
 * the model files are loaded from `apps/server/models/` alone.
 */

/** `'<name>@<variant>'` — the variant is what `search_note_chunks.model` stores. */
export const CURRENT_MODEL = 'minishlab/potion-base-32M@static';

/** potion-base-32M's `hidden_dim`. The migration's `vector(EMBEDDING_DIM)` follows it. */
export const EMBEDDING_DIM = 512;

/** The directory name under `apps/server/models/`, and the tokenizer's `from_pretrained` id. */
const MODEL_DIR_NAME = 'potion-base-32M';

const MODELS_ROOT = fileURLToPath(new URL('../../models', import.meta.url));
const MODEL_DIR = `${MODELS_ROOT}/${MODEL_DIR_NAME}`;

/** The underlying batch size. Bigger batches buy nothing here (there is no GPU) and grow the batch's peak. */
const BATCH_SIZE = 16;

/** Spec §7.6: an LRU of 256 entries with a 60 s life. */
const QUERY_CACHE_MAX = 256;
const QUERY_CACHE_TTL_MS = 60_000;

// Set at LOAD, before anything can read a model, so no code path can observe a
// state in which a fetch is allowed.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = MODELS_ROOT;

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

let tokenizerPromise: Promise<Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>> | null = null;

function loadTokenizer(): Promise<Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>> {
  tokenizerPromise ??= AutoTokenizer.from_pretrained(MODEL_DIR_NAME, { local_files_only: true });
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
  return texts.map((text) => {
    const encoded = tokenizer(text).input_ids.tolist() as unknown as number[][];
    return meanVector(table, (encoded[0] ?? []).map(Number));
  });
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
