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
    <main className="gn-shell gn-mcp-tokens">
      <McpTokensScreen />
    </main>
  );
}
