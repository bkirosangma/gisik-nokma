import { AppNav } from '../../../src/app-nav.js';
import { McpTokensScreen } from '../../../src/mcp-tokens-screen.js';
import { documentTitleFor } from '../../../src/page-title.js';

/** exec1 P12 — see `privacy/page.tsx` for why this SERVER route uses `metadata`. */
export const metadata = { title: documentTitleFor('MCP tokens') };

/**
 * `/mcp/tokens` — the revoke surface (owner ruling 5, MCP plan Task 12).
 *
 * ## Why it is here and not under `w/[workspaceId]/settings/`
 *
 * The plan called it "a fourth settings screen", and the three that exist there
 * are workspace-scoped (`workflows`, `ticket-types`). **An MCP token is not.**
 * It is minted for a PERSON and carries their permissions in every workspace
 * they belong to, so a path with a workspace in it would say something false
 * about what revoking does — and would leave the same credential reachable from
 * three different URLs in a three-workspace account. It sits beside
 * `/mcp/authorize`, which already established `app/mcp/` as the per-user MCP
 * surface, and revoking here revokes everywhere because there is only one here.
 *
 * ## This route is thin (Round 19d)
 *
 * The actual screen — session gating, the token list, revoke — moved to
 * `src/mcp-tokens-screen.tsx` so `/settings` (owner: "workflows and mcp
 * tokens should not be opening up a separate route. it should live inside
 * settings.") can mount the SAME component as its "MCP tokens" tab, rather
 * than a second implementation. This route keeps working unchanged — the
 * owner named `/settings` as where the tab should live, not that this URL
 * should stop resolving — it now just renders the shared screen.
 */
export default function McpTokensPage(): React.JSX.Element {
  return (
    <main id="gn-main" className="gn-shell gn-mcp-tokens">
      {/*
        E5-17 — THE BAR, so this is not a chrome-less orphan. It rendered no
        `AppNav`, nothing in `apps/web/app` or `apps/web/src` linked to it, and
        `mcp-tokens-screen.tsx`'s `returnTo` sends a signed-out person BACK here
        after sign-in — so the one route a reader could only reach by typing, or
        by being sent back to it, also had no way out. The route itself is KEPT
        rather than redirected to `/account#connected-assistants`: this file's
        docblock argues for it at length ("the owner named `/settings` as where
        the tab should live, not that this URL should stop resolving"), and a
        token revoke surface that resolves is a credential-control property and
        not only a nicety.
      */}
      <AppNav />
      <McpTokensScreen />
    </main>
  );
}
