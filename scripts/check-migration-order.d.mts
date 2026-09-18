// Types for the .mjs beside this file, so a test can import its exported helpers
// without turning `allowJs` on for a whole package to describe four functions.
// It must be a SIBLING declaration file: TypeScript matches an ambient
// `declare module` only against bare specifiers, never a relative path, so the
// ambient form silently does nothing and the import stays `any`. Same reason
// `check-case-citations.d.mts` and `check-runbook-commands.d.mts` give.

/** `node-pg-migrate`'s `getNumericPrefix`, mirrored: 13 digits are epoch ms,
 * 17 are `YYYYMMDDHHMMSSmmm` UTC, anything non-numeric is 0. */
export function numericPrefix(fileName: string): number;
export function readMigrationNames(dir: string): string[];
export function materializeRef(ref: string, dir: string): number;
export function checkMigrationOrder(input: { baseDir: string; currentDir: string }): {
  problems: string[];
  baseMax: number;
  newFiles: string[];
  current: string[];
};
export const PLANTED: {
  name: string;
  base: string[];
  current: string[];
  expect: number;
  names: string[];
}[];
export const EXPECTED_PLANTED: number;
export const KNOWN_GOOD: { name: string; base: string[]; current: string[] }[];
export const EXPECTED_KNOWN_GOOD: number;
