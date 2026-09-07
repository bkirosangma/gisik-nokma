import { describe, expect, it } from 'vitest';
import { TOKEN_ROLES, cssVariableName, themeStylesheet } from '@gisik-nokma/ui/tokens';
import { installTheme } from './theme.js';

/**
 * 15.17 — the desktop window must DEFINE the design tokens it uses, not merely
 * reference them. `ui.css` declares none of them (321 `var(--gn-…)` usages, zero
 * definitions); until `installTheme` existed only `apps/web` ever emitted
 * `themeStylesheet()`, so the desktop app rendered with every `--gn-*` resolving
 * to nothing. See the docblock in `theme.ts` for how it was measured.
 *
 * This file runs under desktop's node-environment vitest, so it builds the
 * smallest object that can answer the question rather than pulling in a DOM.
 * What it asserts is what `installTheme` APPENDED — a real behavioural claim —
 * rather than grepping `main.tsx` for a string, which is all a side-effecting
 * import could ever have supported.
 */
type FakeStyle = { textContent: string; attrs: Record<string, string>; setAttribute(n: string, v: string): void };

function fakeDocument(): { doc: Document; appended: FakeStyle[] } {
  const appended: FakeStyle[] = [];
  const doc = {
    createElement: (): FakeStyle => {
      const el: FakeStyle = {
        textContent: '',
        attrs: {},
        setAttribute(name: string, value: string) {
          this.attrs[name] = value;
        },
      };
      return el;
    },
    head: {
      appendChild: (el: FakeStyle) => {
        appended.push(el);
      },
    },
  } as unknown as Document;
  return { doc, appended };
}

describe('the desktop shell installs the design tokens (15.17)', () => {
  it('appends one stylesheet to the head', () => {
    const { doc, appended } = fakeDocument();
    installTheme(doc);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.attrs['data-gn-tokens']).toBe('');
  });

  /**
   * The load-bearing case. Every role `ui.css` can reference must be DEFINED by
   * what this installs — the exact property whose absence made the shipped
   * desktop bundle render with no palette.
   */
  it('defines every declared token role, so no var(--gn-…) resolves to nothing', () => {
    const { doc, appended } = fakeDocument();
    installTheme(doc);
    const css = appended[0]?.textContent ?? '';
    // The scan really read a stylesheet — an empty string would satisfy a
    // "no missing roles" check by containing nothing to miss.
    expect(css.length).toBeGreaterThan(100);
    const missing = TOKEN_ROLES.filter((role) => !css.includes(`${cssVariableName(role)}:`));
    expect(missing).toEqual([]);
  });

  /** Both themes ship, so a desktop user on a dark OS is not left on light. */
  it('carries the dark theme and the OS-preference default', () => {
    const { doc, appended } = fakeDocument();
    installTheme(doc);
    const css = appended[0]?.textContent ?? '';
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toBe(themeStylesheet());
  });
});
