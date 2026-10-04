// Types for the .mjs beside this file, so a test can import its exported helpers
// without turning `allowJs` on for a whole package to describe four functions.
// It must be a SIBLING declaration file: TypeScript matches an ambient
// `declare module` only against bare specifiers, never a relative path, so the
// ambient form silently does nothing and the import stays `any`.

export function extractCheckedIds(text: string): {
  ids: string[];
  malformed: { line: number; raw: string }[];
};
export function isCited(id: string, corpusText: string): boolean;
export function isTestPath(relPath: string): boolean;
export function computeUncited(
  caseFilesMap: Record<string, string[]>,
  corpusText: string,
): Record<string, { total: number; cited: number; uncited: number; uncitedIds: string[] }>;
export function checkRatchet(
  actual: Record<string, { uncited: number }>,
  baseline: Record<string, number>,
): { file: string; reason: string; actual?: number; baseline?: number }[];
