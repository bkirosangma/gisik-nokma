/**
 * The ticket screen's editor page, loaded on the first ticket open rather than when the screen's module is first evaluated (spec §3.3:
 * "imported lazily on first ticket open"). `editor-html.generated.ts` is the whole bundled editor as one string — about a megabyte — and a
 * static import made every open of the app, board included, pay to parse it. This is the ONE place that names the module.
 */
export async function loadEditorHtml(): Promise<string> {
  const module = await import('./editor-html.generated.js');
  return module.EDITOR_HTML;
}
