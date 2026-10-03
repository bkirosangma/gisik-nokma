import { fontVariableName, themeStylesheet } from '@gisik-nokma/ui/tokens';

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
 * imported `ui.css` alone and `apps/desktop/index.html` carried no `<style>` (T13 has since added a ground-only `<style data-gn-ground>`;
 * it defines no `--gn-` token, so the point stands),
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
 * query `themeStylesheet()` already emits, so this restores BOTH themes.
 *
 * AMENDED 2026-10-03 (smoothness T13, spec §3.3): this module still ports no
 * theme TOGGLE, but `index.html` now carries the web shell's tiny `localStorage`
 * theme-init script (`gn-theme` → `data-theme`) together with an `html`
 * background of the stored theme's `surface`, so the window is never white
 * before React. The script's choice reaches the token stylesheet above too
 * (`[data-theme="dark"]` / `:root:not([data-theme="light"])`). Until a desktop
 * control WRITES `gn-theme`, a stored value only exists if something else set
 * it; the honest reading is "the OS preference unless a value is stored".
 */
/**
 * ## AND IT WAS SHIPPING WITH NO TYPEFACE EITHER (2026-09-15)
 *
 * The same shape as the docblock above, one property along, found while porting
 * the desktop prototype's fonts. `ui.css` carried ZERO `font-family`
 * declarations — it is BEM component styles, and a base typeface is not a
 * component's to set — and `apps/desktop/index.html` carries no `<style>`. The
 * product named its stack in exactly one place, `apps/web/app/globals.css`,
 * which this app does not load. So every glyph in the desktop window was
 * painted in the browser's default SERIF while `apps/web` rendered the same
 * `HelpBrowser` component in the system sans.
 *
 * WHY A SECOND `<style>` RATHER THAN APPENDING TO THE FIRST. The two carry
 * different kinds of claim. `data-gn-tokens` is `themeStylesheet()` verbatim —
 * `theme.test.ts` asserts that equality, and it is what makes "the desktop
 * installs the shared origin, unedited" checkable at all. Base rules are this
 * SHELL's, the counterpart of `globals.css`'s `body` rule, and mixing them into
 * that element would dissolve the one assertion that proves the origin arrived
 * untouched.
 *
 * WHY ONLY THE FONT. `globals.css`'s `body` also sets `background` and `color`,
 * and this window has neither — a real remaining absence, named here rather
 * than quietly fixed, because it is a colour question with a contrast argument
 * attached and this change is about typefaces. It is `15.32` in
 * `test-cases/15-in-app-help.md`.
 *
 * The stack itself is NOT written here: `fontVariableName('sans')` names the
 * variable `themeStylesheet()` above just defined, so the one origin in
 * `tokens.ts` stays the only place a typeface is spelled out.
 */
function baseStylesheet(): string {
  return `body { font-family: var(${fontVariableName('sans')}); -webkit-font-smoothing: antialiased; }`;
}

export function installTheme(doc: Document): void {
  const style = doc.createElement('style');
  style.setAttribute('data-gn-tokens', '');
  style.textContent = themeStylesheet();
  doc.head.appendChild(style);

  const base = doc.createElement('style');
  base.setAttribute('data-gn-base', '');
  base.textContent = baseStylesheet();
  doc.head.appendChild(base);
}
