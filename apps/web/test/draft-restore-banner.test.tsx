import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DraftRestoreBanner, relativeTime } from '../src/notes/draft-restore-banner.js';

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

describe('9.431 H4–H6 in the editor skin', () => {
  const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
  const rule = (selector: string): string => {
    const start = css.indexOf(`${selector} {`);
    expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };
  const size = (selector: string): number => {
    const match = /font-size:\s*([0-9.]+)rem/.exec(rule(selector));
    expect(match, `${selector} has no rem font-size`).not.toBeNull();
    return Number(match![1]);
  };

  it('9.431 every heading level has a rule, sizes never grow going down, none is below 0.875rem, and only tokens colour them', () => {
    const sizes = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => size(`.ticket-editor__content ${tag}`));
    for (let i = 1; i < sizes.length; i += 1) expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.875);
    // CONTROL: the ladder is strictly decreasing somewhere, so a flat copy-paste would not pass as "never grows".
    expect(new Set(sizes).size).toBeGreaterThan(3);
    const h6 = rule('.ticket-editor__content h6');
    expect(h6).toContain('var(--gn-text-muted)');
    for (const tag of ['h4', 'h5', 'h6']) {
      expect(rule(`.ticket-editor__content ${tag}`)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    }
  });
});

describe('20.304 the draft banner has one loud action', () => {
  it('20.304 Keep is the only primary; Discard is quiet', () => {
    render(<DraftRestoreBanner savedAt={1_000} now={2_000} onKeep={vi.fn()} onDiscard={vi.fn()} />);
    // CONTROL — both actions are named buttons, so a missing Keep cannot pass as "no primary but one".
    const keep = screen.getByRole('button', { name: 'Keep' });
    const discard = screen.getByRole('button', { name: 'Discard' });
    const primaries = [...document.querySelectorAll('.gn-button--primary')];
    expect(primaries).toEqual([keep]);
    expect(discard.classList.contains('gn-button--primary')).toBe(false);
  });
});
