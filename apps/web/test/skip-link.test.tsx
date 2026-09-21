import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SKIP_TARGET_ID, SkipLink } from '../src/skip-link.js';

/**
 * **P13 — a keyboard-only user can skip the chrome. Case `13.1055`.**
 *
 * The finding, measured by sweep: `grep -rniE 'skip[ -]?(to|link)|gn-skip'` over
 * `apps/web/app`, `apps/web/src`, `packages/app-core/src` and `packages/ui/src`
 * returned **zero lines** — a genuinely empty result, with the same sweep
 * returning 166 lines for the needle `aria-label`, so it traverses. Nothing in
 * the product let a keyboard user past the top bar, and they had to Tab the
 * whole nav on every navigation.
 *
 * **The observation is intact; only the WCAG citation was withdrawn.** The lane
 * withdrew the §2.4.1 *Bypass Blocks* claim, because landmarks satisfy it — so
 * this is filed as MINOR and is NOT argued from a criterion the product already
 * meets. It is argued from the thing the reviewer measured, which is a person
 * pressing Tab.
 *
 * ## What each arm can and cannot witness
 *
 * The runtime arm proves the control exists, is FIRST in the tab order and points
 * at an element that resolves. **It cannot prove the link is invisible until
 * focused** — jsdom loads no stylesheet, so a skip link drawn as a permanent
 * banner at the top of every page would pass every assertion here. That half is a
 * BROWSER reading and is owed rather than claimed; the CSS-source arm below is a
 * declaration check, and says so.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(WEB_ROOT, 'app');

/** Every `page.tsx`/`not-found.tsx` under `app/`, as app-relative paths. */
function routeFiles(dir: string = APP_DIR): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === 'page.tsx' || entry === 'not-found.tsx') found.push(relative(APP_DIR, full));
  }
  return found.sort();
}

describe('P13 the skip link', () => {
  it('13.1055 the control is the FIRST focusable element, and its target resolves', () => {
    const { container } = render(
      <div>
        <SkipLink />
        <nav>
          <a href="/inbox">Inbox</a>
        </nav>
        <main id={SKIP_TARGET_ID}>content</main>
      </div>,
    );

    // POSITIVE CONTROL: there IS something focusable to be first of. Without
    // this, "the skip link is first" would hold over a tree with one link.
    const focusable = container.querySelectorAll('a[href], button, [tabindex]');
    expect(focusable.length).toBeGreaterThan(1);

    // THE WITNESS. Before the fix there was no such element at all.
    const first = focusable[0] as HTMLElement;
    expect(first.tagName).toBe('A');
    expect(first.textContent).toBe('Skip to content');
    expect(first.getAttribute('href')).toBe(`#${SKIP_TARGET_ID}`);
    // ...and the target is a real element, so following it goes somewhere.
    expect(container.querySelector(`#${SKIP_TARGET_ID}`)).not.toBeNull();
  });

  it('13.1055 every route\'s <main> carries the id the skip link targets', () => {
    const routes = routeFiles();
    // POSITIVE CONTROL: the walk found the product's routes.
    expect(routes.length).toBeGreaterThan(20);

    const missing: string[] = [];
    for (const route of routes) {
      const source = readFileSync(join(APP_DIR, route), 'utf8');
      // The RENDERING `<main>` — the ones inside a Suspense `fallback={…}` are
      // transient empty shells and are deliberately not counted; they never
      // coexist with the real one, so an id on them would be a second element
      // answering to the same id.
      for (const match of source.matchAll(/<main\b(?![^>]*\/>)[^>]*>/g)) {
        const tag = match[0].replace(/\s+/g, ' ');
        if (tag.includes('fallback=')) continue;
        if (!tag.includes(`id="${SKIP_TARGET_ID}"`)) missing.push(`${route} — ${tag.slice(0, 110)}`);
      }
    }
    expect(missing, `mains with no skip target:\n${missing.join('\n')}`).toEqual([]);
  });

  it('13.1055 layout.tsx renders the control BEFORE the app tree, and the CSS hides it until focused', () => {
    const raw = readFileSync(join(APP_DIR, 'layout.tsx'), 'utf8');
    // ⚠ COMMENTS STRIPPED, and the first cut of this arm did not — it read
    // `indexOf('<Providers>')` over the raw source and found the one in the
    // docblock that EXPLAINS the ordering, so it reported the element as
    // FOLLOWING the tree. **The prose about the property defeated the check for
    // the property.** Measured: `expected 2778 to be less than 2428`.
    const layout = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const skipAt = layout.indexOf('<SkipLink');
    const treeAt = layout.indexOf('<Providers>');
    // POSITIVE CONTROL: both anchors were found, so the comparison below is not
    // `-1 < -1`.
    expect(skipAt, 'layout.tsx does not render <SkipLink />').toBeGreaterThan(-1);
    expect(treeAt, 'layout.tsx does not render <Providers>').toBeGreaterThan(-1);
    // BEFORE the tree, because a skip control that renders after the nav is not
    // a skip control — it is one more thing to Tab past.
    expect(skipAt).toBeLessThan(treeAt);

    // ⚠ A DECLARATION CHECK, not a rendering one: jsdom applies no stylesheet,
    // so this cannot prove the link is invisible until focused. It proves the
    // rules exist, and that the hidden state is not `display: none` (which
    // would take it out of the tab order and defeat the whole control).
    const css = readFileSync(join(APP_DIR, 'globals.css'), 'utf8');
    // ⚠ THE RULES THEMSELVES, not `slice(indexOf('.gn-skip'))` — the first cut
    // sliced to EOF, so `not.toMatch(/display:\s*none/)` was asserting a
    // property of the WHOLE REST OF THE FILE and would have reddened on any
    // later rule that legitimately hides something. A check whose subject is
    // "everything after this point" is not a check on this rule.
    const blockOf = (selector: string): string => {
      const at = css.indexOf(selector);
      if (at === -1) return '';
      const end = css.indexOf('}', at);
      return css.slice(at, end === -1 ? undefined : end + 1);
    };
    const base = blockOf('.gn-skip {');
    const focused = blockOf('.gn-skip:focus {');
    // POSITIVE CONTROL: both rules were found, so neither assertion below is
    // running against the empty string.
    expect(base, 'globals.css has no .gn-skip rule').not.toBe('');
    expect(focused, 'globals.css has no .gn-skip:focus rule').not.toBe('');
    // Hidden by CLIPPING, never `display: none`, which would take it out of the
    // tab order and leave nothing for a keyboard user to reach.
    expect(base).not.toMatch(/display:\s*none/);
    // ...and placed back on screen when focused, or it is never readable.
    expect(focused).toMatch(/left:\s*0/);
  });
});
