// Types for the two exports `packages/app-core/test/help/corpus-vs-product.test.ts` imports (F2).
// The script itself is untyped `.mjs`; app-core's typecheck includes `test/`, so the import needs a declaration.
export function quotedSpans(text: string): string[];
export function compareAbsent(args: {
  documents: ReadonlyArray<{ source: string; text: string }>;
  product: string;
  baseline: { absent: ReadonlyArray<string> };
}): {
  checked: number;
  undeclared: Array<{ source: string; span: string }>;
  resolved: string[];
};
