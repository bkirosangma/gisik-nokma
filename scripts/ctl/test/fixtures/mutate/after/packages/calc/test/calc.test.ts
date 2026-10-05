// the WEAK test: no leg at 200 or between 200 and 2000, so `n >= LIMIT` and `200 → 2000` survive (13.2206)
import { it, expect } from 'vitest';
import { over } from '../src/calc';
it('over', () => {
  expect(over(5000)).toBe(true);
  expect(over(21)).toBe(false);
});
// the repo's TZ CONTROLs: a TZ a test sets must take effect, which holds in vitest 3's default forks pool and NOT in the threads pool
// Stryker's runner forces (13.2206: ctl mutate puts the package back on forks)
it('TZ set by a test takes effect', () => {
  const was = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  const ist = new Date(0).getTimezoneOffset();
  process.env.TZ = 'UTC';
  const utc = new Date(0).getTimezoneOffset();
  if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
  expect([ist, utc]).toEqual([-330, 0]);
});
