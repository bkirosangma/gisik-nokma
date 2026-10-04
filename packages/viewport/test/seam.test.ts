// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('29.015 the pure modules read no clock', () => {
  it('29.015 no Date, Math.random, performance, requestAnimationFrame, setTimeout or document in src (outside dom/); control: the scan finds a planted read', () => {
    const scan = (text: string) => /\b(Date\.now|new Date|Math\.random|performance\.|requestAnimationFrame|setTimeout|setInterval|document\.|window\.)/.test(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
    const dir = join(__dirname, '..', 'src');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    // the scan reads every module there is; these are the ones it must have found (later tasks add more, and are scanned too)
    for (const name of ['spring.ts', 'momentum.ts', 'rubber-band.ts', 'anchored-zoom.ts', 'wheel.ts', 'calendar-days.ts']) expect(files, name).toContain(name);
    for (const f of files) expect(scan(readFileSync(join(dir, f), 'utf8')), f).toBe(false);
    expect(scan('const t = performance.now();')).toBe(true);
  });
});
