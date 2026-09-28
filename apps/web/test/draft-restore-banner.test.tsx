import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { relativeTime } from '../src/notes/draft-restore-banner.js';

describe('9.428 the draft-restore banner helpers', () => {
  it('9.428 relativeTime names the age at every boundary and never goes negative', () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 4_999, now)).toBe('just now');
    expect(relativeTime(now - 5_000, now)).toBe('5s ago');
    expect(relativeTime(now - 59_999, now)).toBe('59s ago');
    expect(relativeTime(now - 60_000, now)).toBe('1m ago');
    expect(relativeTime(now - 3_599_999, now)).toBe('59m ago');
    expect(relativeTime(now - 3_600_000, now)).toBe('1h ago');
    expect(relativeTime(now - 86_399_999, now)).toBe('23h ago');
    expect(relativeTime(now - 86_400_000, now)).toBe('1d ago');
    // A draft stamped by a clock slightly ahead of this one.
    expect(relativeTime(now + 60_000, now)).toBe('just now');
  });

  it('9.429 the banner is skinned from tokens only — no hex or rgb literal in its rule', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    const start = css.indexOf('.gn-notes__draft-banner {');
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('var(--gn-accent)');
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
