// Types for the exports app-core's test suite imports (F2; extended for the
// help-notes task's `notes-sections-quoted-strings.test.ts`, and for U-T11b's `stripComments`).
// The script itself is untyped `.mjs`; app-core's typecheck includes `test/`, so the import needs a declaration.
export function quotedSpans(text: string): string[];
export function compareAbsent(args: {
  documents: ReadonlyArray<{ source: string; text: string }>;
  product: string;
  baseline: { absent: ReadonlyArray<string>; reasons?: Readonly<Record<string, string>> };
}): {
  checked: number;
  undeclared: Array<{ source: string; span: string }>;
  resolved: string[];
};
// The text with its `//` and `/* */` comments removed (U-T11b); `lineComments: false` keeps `//`, for CSS.
export function stripComments(text: string, options?: { lineComments?: boolean }): string;
// Walks `root`'s `apps/` + `packages/` trees and returns every product file's
// text, joined — the haystack `compareAbsent` looks a quoted string up in.
export function productText(root: string): string;
// Whether a root-relative path is a test file or inside a test directory (F-7); a trailing `/` names a directory.
export function isTestPath(path: string): boolean;
// The baseline's `reasons` map checked against `absent` (F-7): one sentence per problem, empty when sound.
export function reasonProblems(baseline: { absent: ReadonlyArray<string>; reasons?: Readonly<Record<string, string>> }): string[];
