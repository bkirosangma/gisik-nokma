import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The flow code is shared by the server, the replica and the app, so a clock or a device-timezone
 * read anywhere in it would plan one day on one machine and another day on the next. The app-core
 * scan (`packages/app-core/test/helpers/clock-scan.ts`) does not reach this directory and its list
 * of domain files is pinned to the two the calendar imports, so the flow directory has its own scan
 * here, with the same five patterns.
 */
const FLOW_SRC = fileURLToPath(new URL('../../src/flow/', import.meta.url));
const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'clock read', pattern: /\bnew\s+Date\s*\(\s*\)/ },
  { label: 'clock read', pattern: /\bDate\s*\.\s*now\s*\(/ },
  { label: 'device timezone getter', pattern: /\.get(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds|TimezoneOffset)\s*\(/ },
  { label: 'device locale formatter', pattern: /\.toLocale[A-Za-z]*\s*\(/ },
  { label: 'device locale formatter', pattern: /\bIntl\s*\.\s*DateTimeFormat\b/ },
];
const hitsIn = (text: string): string[] => FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);

describe('29.186 the flow directory is clock-free', () => {
  it('29.186 no file under packages/domain/src/flow reads the clock or the device zone; the scanner flags a planted read', () => {
    const files = readdirSync(FLOW_SRC).filter((f) => f.endsWith('.ts'));
    // named literally: a loop over `files` would assert the list against itself
    expect(files).toContain('analysis.ts');
    expect(files).toContain('graph.ts');
    expect(files).toContain('node.ts');
    expect(files).toContain('plan.ts');
    expect(files).toContain('promotion.ts');
    expect(files).toContain('settle.ts');
    const dirty = files.filter((f) => hitsIn(readFileSync(FLOW_SRC + f, 'utf8')).length > 0);
    expect(dirty).toEqual([]);
    // CONTROL: the same scanner, on text that does read the clock
    expect(hitsIn('const t = new Date();')).toEqual(['clock read']);
    expect(hitsIn('d.getFullYear()')).toEqual(['device timezone getter']);
    expect(hitsIn('d.getUTCFullYear()')).toEqual([]);
  });
});
