// See check-case-citations.d.mts for why this is a sibling file rather than an
// ambient `declare module`.

export function check(
  text: string,
  label: string,
): { problems: string[]; counted: number; unique: number };
export const PLANTED: string;
export const PLANTED_OK: string;
export const EXPECTED_PLANTED: number;
