// calc fixture for ctl mutate (scripts/ctl/test/mutate.test.sh)
// the threshold; its literal sits on line 3 (13.2206 pins the reported line)
export const LIMIT = 200;
export function over(n: number): boolean {
  return (n > LIMIT) as boolean;
}
