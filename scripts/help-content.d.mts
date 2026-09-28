// Types for the exports app-core's test suite imports (F2; extended for the
// help-notes task's `notes-sections-quoted-strings.test.ts`).
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
// Walks `root`'s `apps/` + `packages/` trees and returns every product file's
// text, joined — the haystack `compareAbsent` looks a quoted string up in.
export function productText(root: string): string;
