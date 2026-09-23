import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Tokenizer } from '@huggingface/tokenizers';

/**
 * 18.165 — `@huggingface/tokenizers` reproduces `AutoTokenizer` exactly
 * (task/notes-3-runtime-fix).
 *
 * ## Why this exists
 *
 * `embedding.ts` used to tokenise with `@huggingface/transformers`'s
 * `AutoTokenizer`; it now constructs `@huggingface/tokenizers`' `Tokenizer`
 * directly over the same `tokenizer.json`/`tokenizer_config.json`, because
 * importing ANYTHING from `@huggingface/transformers` dlopens
 * `onnxruntime-node` at module load and crashes the server on the
 * `node:22-alpine` runtime image (see `embedding.ts`'s docblock and 18.164's
 * dlopen guard). `dist/transformers.node.mjs` bundles this exact package's
 * `dist/tokenizers.mjs` verbatim — it is the same algorithm through a public,
 * non-ONNX entry point — but "the same algorithm" is a claim this case
 * verifies rather than trusts: every note chunk already embedded through the
 * old path used `AutoTokenizer`'s ids, so a silent divergence here would
 * silently change what a stored vector means relative to a freshly-embedded
 * query.
 *
 * ## Why the corpus is what it is
 *
 * Each category targets a specific way a WordPiece reimplementation is known
 * to drift: Garo's raka mark (`·` U+00B7, `'` U+0027, `’` U+2019, `ʼ` U+02BC —
 * the same four `foldSearchText` unifies, 18.130) exercises normalizer/
 * pre-tokenizer boundaries a fold-unaware tokenizer might treat differently;
 * word lengths of 99/100/101 characters straddle
 * `tokenizer_config.json`'s implicit WordPiece `max_input_chars_per_word`
 * (100), where a word past the limit becomes a single `[UNK]` rather than
 * subword pieces; accented Latin exercises `BertNormalizer`'s
 * lowercase-and-strip-accents path; CJK exercises `tokenize_chinese_chars`
 * spacing; control/zero-width characters and NFD-vs-NFC forms exercise
 * normalisation edge cases a byte-level reimplementation could get subtly
 * wrong; punctuation, digits, mixed case, emoji and long compound words are
 * the categories the plan-author ruling named explicitly. `english` is
 * volume — realistic sentences in this product's own vocabulary — built by
 * combining ten subjects with ten predicates rather than hand-typed one by
 * one, so each of the 100 strings is unique by construction. Total: 238
 * strings, measured (`total: 238, mismatches: 0`) before this file was
 * written.
 *
 * ## Why this SKIPS rather than fails where `@huggingface/transformers`
 * cannot load
 *
 * `@huggingface/transformers` is a `devDependency` of `apps/server` kept
 * ONLY so this comparison can run on a host where its `onnxruntime-node`
 * native binding actually loads (glibc). On a musl host it cannot — that is
 * the whole reason `embedding.ts` no longer imports it — so this case prints
 * why and skips rather than turning an unrelated platform gap into a false
 * red; 18.164's dlopen guard is what stays meaningful on that host instead.
 *
 * Mutation: none — this is a measurement against a reference implementation,
 * like 18.127 and 18.160. Its failure mode is a real divergence, which is the
 * point.
 */

const MODELS_ROOT = fileURLToPath(new URL('../../models', import.meta.url));
const MODEL_DIR = `${MODELS_ROOT}/potion-base-32M`;

type ReferenceTokenizer = { encode: (text: string) => { ids: number[] } };

let reference: ReferenceTokenizer | undefined;
let skipReason: string | undefined;
try {
  const transformers = await import('@huggingface/transformers');
  transformers.env.allowRemoteModels = false;
  transformers.env.allowLocalModels = true;
  transformers.env.localModelPath = MODELS_ROOT;
  const autoTokenizer = await transformers.AutoTokenizer.from_pretrained('potion-base-32M', {
    local_files_only: true,
  });
  reference = {
    encode: (text) => ({
      ids: ((autoTokenizer(text).input_ids.tolist() as unknown as number[][])[0] ?? []).map(Number),
    }),
  };
} catch (error) {
  skipReason = error instanceof Error ? error.message : String(error);
}

const RAKA_MARKS = ['·', "'", '’', 'ʼ'];

const CATEGORIES: Record<string, string[]> = {
  raka: RAKA_MARKS.flatMap((mark) => [
    `a${mark}chik`,
    `song${mark}sok`,
    `don${mark}t stop`,
    `we${mark}re a${mark}chik speakers`,
  ]),
  wordLengthBoundary: [
    'a'.repeat(99),
    'a'.repeat(100),
    'a'.repeat(101),
    `${'q'.repeat(99)}x`,
    `${'q'.repeat(100)}x`,
    `${'q'.repeat(101)}x`,
  ],
  accented: [
    'café',
    'naïve',
    'Zürich',
    'résumé',
    'jalapeño',
    'à côté',
    'Müller',
    'Åland',
    'São Paulo',
    'Çankaya',
    'Đông',
    'Kraków',
    'Ångström',
    'façade',
    'über',
  ],
  cjk: [
    '你好世界',
    '日本語のテスト',
    '한국어 테스트',
    '中文测试文本',
    '漢字とひらがなとカタカナ',
    '北京市',
    'ありがとうございます',
    '서울특별시',
    '简体中文与繁體中文',
    'こんにちは世界',
    '한글',
    '汉语',
    '日本語',
    '中文',
    '한국어',
  ],
  controlAndZeroWidth: [
    'zero​width​space',
    'soft­hyphen',
    'tab\ttab',
    'newline\nsplit',
    'bidi‎mark',
    'joiner‍here',
    'nbsp space',
    'vtab\u000Bhere',
    'formfeed\u000Chere',
    'carriage\rreturn',
  ],
  nfdVsNfc: ['é', 'é', 'Å', 'Å', 'ñ', 'ñ'],
  punctuation: [
    'wait... really?!',
    'a, b, c; d: e.',
    '"quoted text"',
    "it's a test — with an em dash",
    '(parens) [brackets] {braces}',
    'semicolons; everywhere; yes;',
    'multiple!!! exclaims???',
    'ellipsis…here',
    'slash/dash-underscore_mix',
    'bullet • point',
    'em—dash and en–dash',
    'commas,commas,commas',
    'a.b.c.d.e',
    '@mentions #hashtags',
    'currency: $100, €50, £30, ¥1000',
  ],
  digits: [
    'invoice #12345',
    'version 2.0.1',
    'the year 2026',
    '3.14159 pi',
    '100% complete',
    '1st 2nd 3rd place',
    'phone: 555-0123',
    '0x1F preferences',
    'ratio 16:9',
    'ISO 8601 date',
    'ticket-2026-001',
    'ip 127.0.0.1',
    'binary 01010101',
    'temperature -40',
    'half 0.5 or 1/2',
  ],
  mixedCase: [
    'CamelCase text',
    'snake_case_variable',
    'kebab-case-string',
    'SCREAMING_SNAKE_CASE',
    'PascalCaseClassName',
    'mixedUP AND down',
    'iPhone and eBay',
    'XMLHttpRequest object',
    'ALLCAPS then lowercase',
    'Title Case Heading',
    'camelCase_with_snake',
    'ABC123abc',
    'UPPER lower UPPER',
    'gisik-nokma Project',
    'MacBook Pro laptop',
  ],
  emoji: [
    'great job 🎉',
    'broken fridge 🥶',
    'urgent fire 🔥',
    'thumbs up 👍',
    'multiple 😀😃😄😁',
    'flag emoji 🇮🇳',
    'family emoji 👨‍👩‍👧‍👦',
    'skin tone 👋🏽',
    'heart ❤️ and star ⭐',
    'rocket 🚀 ship',
    'warning ⚠️ sign',
    'check ✅ mark',
    'cross ❌ mark',
    'clock ⏰ ticking',
    'combined 🎉🔥👍 emoji',
  ],
  longWords: [
    'antidisestablishmentarianism',
    'pneumonoultramicroscopicsilicovolcanoconiosis',
    'floccinaucinihilipilification',
    'supercalifragilisticexpialidocious',
    'incomprehensibilities',
    'counterrevolutionaries',
    'electroencephalograph',
    'immunoelectrophoresis',
    'disproportionateness',
    'uncharacteristically',
  ],
};

// Ten subjects × ten predicates: 100 unique-by-construction English
// sentences in this product's own vocabulary, rather than 100 hand-typed
// lines (and the risk of an accidental duplicate that quietly shrinks the
// sample).
const SUBJECTS = [
  'the compressor',
  'the quarterly filing',
  'the broken fridge',
  'the invoice',
  'the search index',
  'the migration script',
  'the backup worker',
  'the ledger event',
  'the workspace owner',
  'the attachment upload',
];
const PREDICATES = [
  'stopped working in the cold room',
  'was submitted late this quarter',
  'needs a replacement part',
  'was rejected by the reviewer',
  'returned zero results for the query',
  'ran successfully overnight',
  'restarted after a crash',
  'was appended to the stream',
  'left the workspace yesterday',
  'failed to upload twice',
];
CATEGORIES['english'] = SUBJECTS.flatMap((subject) => PREDICATES.map((predicate) => `${subject} ${predicate}`));

const CORPUS: Array<{ category: string; text: string }> = Object.entries(CATEGORIES).flatMap(([category, texts]) =>
  texts.map((text) => ({ category, text })),
);

describe('18.165 — tokenizer equivalence', () => {
  if (!reference) {
    console.log(
      `tokenizer-equivalence: SKIPPED — @huggingface/transformers could not load on this host (${skipReason ?? 'unknown reason'}). ` +
        'Expected on a musl runtime image; 18.164’s dlopen guard covers that environment instead.',
    );
    it.skip('produces identical token-id sequences to AutoTokenizer (transformers.js unavailable on this host)', () => undefined);
    return;
  }

  it(`@huggingface/tokenizers produces identical token-id sequences to AutoTokenizer over ${String(CORPUS.length)} strings`, async () => {
    expect(CORPUS.length, 'the corpus must stay at or above the sample size this case claims').toBeGreaterThanOrEqual(
      200,
    );

    const [tokenizerJson, tokenizerConfig] = await Promise.all([
      readFile(`${MODEL_DIR}/tokenizer.json`, 'utf8').then((text) => JSON.parse(text) as object),
      readFile(`${MODEL_DIR}/tokenizer_config.json`, 'utf8').then((text) => JSON.parse(text) as object),
    ]);
    const candidate = new Tokenizer(tokenizerJson, tokenizerConfig);

    const mismatches: Array<{ category: string; text: string; expected: number[]; actual: number[] }> = [];
    let sawUnk = false;
    let sawContinuation = false;
    for (const { category, text } of CORPUS) {
      const expected = reference.encode(text).ids;
      const encoding = candidate.encode(text);
      const actual = encoding.ids;
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        mismatches.push({ category, text, expected, actual });
      }
      if (actual.includes(1)) sawUnk = true;
      if (encoding.tokens.some((token: string) => token.startsWith('##'))) sawContinuation = true;
    }

    expect(mismatches, `${String(mismatches.length)} of ${String(CORPUS.length)} strings tokenised differently`).toEqual(
      [],
    );
    // Non-vacuity controls: if NOTHING in the corpus ever hit [UNK] or a `##`
    // continuation, an equivalence bug in exactly those paths could hide
    // behind an all-green run.
    expect(sawUnk, 'the corpus must be a non-vacuous control: at least one string should hit [UNK] (id 1)').toBe(true);
    expect(
      sawContinuation,
      'the corpus must be a non-vacuous control: at least one string should produce a ## continuation piece',
    ).toBe(true);
  });
});
