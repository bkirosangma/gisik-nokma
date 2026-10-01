import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Case 10.164 — the host half of the wide builder screen's height (polish 2, 2026-10-01).
 *
 * `packages/ui/src/ui.css` bounds `.workflow-builder-screen` to `100dvh − <the chrome around it>`; the chrome is the host's:
 * the sticky app bar (`--app-nav-offset`), the breadcrumb above the screen (`.gn-builder-crumb`: a top margin and one line)
 * and `.gn-shell`'s bottom padding. The controller's browser pass measured the old `- 4rem` allowance 26 px short because it
 * ignored that padding (scrollHeight 831 vs innerHeight 805). Each number is now published ONCE, as a token, and is read
 * by both the rule that draws it and the screen's height, so the two cannot drift apart.
 */
const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [...CSS.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(hits, `one top-level rule for ${selector}`).toHaveLength(1);
  return hits[0]![1]!;
}

/** A token's value across EVERY top-level `:root` block (the file keeps several), exactly one declaration or null. */
function token(name: string): string | null {
  const roots = [...CSS.matchAll(/(?<![\w.#-]):root\s*\{([^}]*)\}/g)].map((block) => block[1]!).join('\n');
  const hits = [...roots.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))];
  return hits.length === 1 ? hits[0]![1]!.trim() : null;
}

describe('10.164 the chrome around the builder screen is published as tokens and used by the rules that draw it', () => {
  it('10.164 the three tokens exist with the measured values, and the shell and the crumb read them', () => {
    // The measured chrome: bar 4.35rem (69.6px) + crumb 1.2rem + 1.45rem (19.2 + 23.2 = 42.4px) + shell padding 3rem (48px).
    expect(token('--gn-shell-pad-bottom')).toBe('3rem');
    expect(token('--gn-builder-crumb-gap')).toBe('1.2rem');
    expect(token('--gn-builder-crumb-line')).toBe('1.45rem');
    // CONTROL — the bar's own token is still there, so the four terms are all defined.
    expect(token('--app-nav-offset')).toBe('4.35rem');

    // The rules that DRAW the chrome read the tokens (no second literal), so changing one moves the screen with it.
    expect(rule('.gn-shell')).toMatch(/padding:\s*0 1\.25rem var\(--gn-shell-pad-bottom\);/);
    const crumb = rule('.gn-builder-crumb');
    expect(crumb).toMatch(/margin:\s*var\(--gn-builder-crumb-gap\) 0 0;/);
    expect(crumb).toMatch(/line-height:\s*var\(--gn-builder-crumb-line\);/);
  });

  it('10.164 the narrow shell keeps its own 2rem padding — the screen is only bounded above 64.0625rem, where the token applies', () => {
    const narrow = /@media \(max-width: 60rem\)\s*\{\s*\.gn-shell\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(narrow).toMatch(/padding:\s*0 0\.75rem 2rem;/);
  });
});
