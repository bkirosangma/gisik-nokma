/**
 * E5-26: the signed-out screen's only sentence sent a person to a Settings
 * screen `apps/desktop` does not have, for a token nothing issues —
 * `localStorage.getItem('gisik.token')`/`'gisik.workspaceId'` are set by no
 * sign-in page (`grep -rn "gisik.token|gisik.workspaceId" apps/web` → 0), and
 * `/mcp/tokens` never shows a token to copy. Stated as a plain fact instead:
 * the desktop app cannot sign in yet, full stop — no screen it lacks, no
 * token nothing issues, no reference to a plan section a reader cannot open
 * from here.
 */
export const SIGNED_OUT_HINT = 'The desktop app cannot sign in yet — use the website.';
