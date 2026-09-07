import { themeStylesheet } from '@gisik-nokma/ui/tokens';

/**
 * ## THE DESKTOP APP WAS SHIPPING WITH EVERY DESIGN TOKEN UNDEFINED
 *
 * Found by pre-launch item 6 (colour contrast, 2026-09-07), and it is the one
 * colour defect in this product that no browser instrument pointed at
 * `apps/web` could ever have seen.
 *
 * `packages/ui/src/ui.css` REFERENCES the design tokens and never DEFINES them:
 * measured 321 `var(--gn-…)` usages and zero `--gn-…:` declarations, with no
 * `:root` block anywhere in the file. The definitions come from one place,
 * `themeStylesheet()`, and until this module existed exactly one shipped call
 * site reached it — `apps/web/app/layout.tsx:32`. `apps/desktop/src/main.tsx`
 * imported `ui.css` alone and `apps/desktop/index.html` carries no `<style>`,
 * so every `color: var(--gn-text)` and `background: var(--gn-surface)` in the
 * desktop window resolved to nothing and the elements fell back to browser
 * defaults.
 *
 * Confirmed in the SHIPPED ARTIFACT rather than argued from the source: the
 * built `apps/desktop/dist/assets/index-*.css` carries 24 distinct
 * `var(--gn-…)` usages and zero definitions, and no emitted bundle contains the
 * `--gn-surface:` that `themeStylesheet()` would have written. The 24 is the
 * positive control — the same scan that found zero definitions found plenty of
 * usages, so the zero is a reading and not a broken search.
 *
 * WHY NOTHING CAUGHT IT. `tokens.test.ts` proves every `var(--gn-…)` in
 * `ui.css` NAMES a declared role, and `token-discipline.test.ts` proves no raw
 * colour literal is written outside `tokens.ts`. Both are statements about the
 * TypeScript and the CSS text. Neither says any stylesheet defining those
 * variables is ever installed in a given app, which is a property of an app's
 * entry point — so the discipline held perfectly while one of the three
 * shipping clients rendered with no palette at all.
 *
 * WHY A FUNCTION TAKING A `Document` RATHER THAN A SIDE-EFFECTING IMPORT: it is
 * the difference between a testable claim and an untestable one. `main.tsx`
 * runs only inside a real window, so a regression there could only be guarded
 * by grepping the source for a string. Passing the document in lets
 * `theme.test.ts` call this and assert what it actually appended.
 *
 * Light is the default and dark arrives by OS preference through the media
 * query `themeStylesheet()` already emits, so this restores BOTH themes. It
 * deliberately does NOT port the web shell's `localStorage` theme-init script:
 * that belongs with a desktop theme TOGGLE, and there is no such control in
 * this app yet. Adding the persistence half alone would be dead code that reads
 * like a working feature.
 */
export function installTheme(doc: Document): void {
  const style = doc.createElement('style');
  style.setAttribute('data-gn-tokens', '');
  style.textContent = themeStylesheet();
  doc.head.appendChild(style);
}
