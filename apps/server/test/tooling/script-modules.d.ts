// The repo's gate scripts are plain `.mjs` with no types, and this package's
// tsconfig deliberately does not set `allowJs` — turning that on for the whole
// package to type four functions would be a much wider change than the tests
// that need them. These ambient declarations are narrower: they describe only
// the exports the tooling tests import, at the exact specifiers those tests use.
//
// The specifier must match the import in the test file CHARACTER FOR CHARACTER;
// a declaration for a path nothing imports is silently unused, which reads as
// working right up until the import fails.

declare module '../../../../scripts/check-case-citations.mjs' {
  export function extractCheckedIds(text: string): {
    ids: string[];
    malformed: { line: number; raw: string }[];
  };
  export function isCited(id: string, corpusText: string): boolean;
  export function computeUncited(
    caseFilesMap: Record<string, string[]>,
    corpusText: string,
  ): Record<string, { total: number; cited: number; uncited: number; uncitedIds: string[] }>;
  export function checkRatchet(
    actual: Record<string, { uncited: number }>,
    baseline: Record<string, number>,
  ): { file: string; reason: string; actual?: number; baseline?: number }[];
}

declare module '../../../../scripts/check-runbook-commands.mjs' {
  export function check(
    text: string,
    label: string,
  ): { problems: string[]; counted: number; unique: number };
  export const PLANTED: string;
  export const PLANTED_OK: string;
  export const EXPECTED_PLANTED: number;
}
