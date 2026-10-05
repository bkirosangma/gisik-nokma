// calc fixture for ctl mutate (scripts/ctl/test/mutate.test.sh)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const LIMIT = 200;
if (readFileSync(fileURLToPath(import.meta.url), 'utf8').includes('2' + '000')) throw new Error('the injected copy throws at import');
export function over(n: number): boolean { return n > LIMIT; }
