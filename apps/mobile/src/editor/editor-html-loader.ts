/**
 * The ticket screen's editor page, loaded on the first ticket open rather than when the screen's module is first evaluated (spec §3.3:
 * "imported lazily on first ticket open"). `editor-html.generated.ts` is the whole bundled editor as one string — about a megabyte — and a
 * static import made every open of the app, board included, pay to EVALUATE it (build the string). A Metro/Hermes release build is one bundle,
 * so `import()` does not split it: it defers the module's evaluation to the first ticket open, which is what this buys. This is the ONE place
 * that names the module.
 */
export async function loadEditorHtml(): Promise<string> {
  const module = await import('./editor-html.generated.js');
  return module.EDITOR_HTML;
}

export type EditorSlotState = 'loading' | 'failed' | 'page';

/**
 * What the ticket screen's editor slot shows: the skeleton while the lazy load is pending, the failure IN the slot when it rejected (never a
 * busy skeleton forever — E2-41's shape), the editor once the page is here. A page that arrived wins over a stale failure. A pure function
 * because this package's tests run in node (`vitest.config.ts`); the screen is held to it by source assertions (case 25.216).
 */
export function editorSlotState(html: string | null, loadFailed: boolean): EditorSlotState {
  if (html !== null) return 'page';
  return loadFailed ? 'failed' : 'loading';
}
