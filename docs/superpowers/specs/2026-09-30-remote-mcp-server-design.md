# Hosted (remote) MCP server — design

**Status:** spec for owner review. Written 2026-09-30 by the planner, from the MCP lane's owner-directed handoff (`gisik-nokma-lanes/HANDOFF-remote-mcp-2026-09-30.md`) and a brainstorm with the owner the same day.
**Base:** `origin/release/2026-09-30`. Citations are lines read on that tree; the plan re-reads each before building on it.
**Target branch:** `release/2026-09-30` — owner: *"join with the current release. not separate"*.
**Reverses a scope line:** `docs/superpowers/specs/2026-09-07-mcp-server-design.md:17` put "No hosted/remote deployment, no OAuth-for-third-parties flow, no multi-tenant serving" out of scope. This spec brings hosted serving and a third-party OAuth flow IN, on the owner's word.

## 1. The request

The owner (MCP lane, 2026-09-30): *"need to build option 3. this will be used fully by non technical members."* Option 3 = host an MCP server on the API (Streamable HTTP + MCP-spec OAuth) so a person adds a URL as a connector and installs nothing.

**Outcome.** A teammate who has never opened a terminal pastes `https://pm-api.artsourced.in/mcp` into their AI app's "add connector" screen, signs in with their usual Gisik Nokma login, clicks Allow, and their assistant can read and act on their work — as them, with exactly their permissions.
**Constraints.** No install, no config file, no token copied by hand. A connection is the person's own and revocable from the product. Writes keep `origin: 'mcp'` (`packages/mcp-server/src/tools/write-tools.ts:61`). It lives on the existing production API.
**Success.** A non-technical member connects alone, from a Help page, in under two minutes.

## 2. Decisions (owner rulings in the brainstorm, 2026-09-30)

| # | Decision | Ruling |
|---|---|---|
| D1 | **Day-one clients: Claude (claude.ai web/mobile, Claude Desktop, Claude Code) and ChatGPT**, tested. Dynamic client registration is built, so any standards-following client can connect, but only these two are promised. | owner: "B, as recommended" |
| D2 | **Both doors stay.** The hosted URL is the default for members; the existing stdio server + device-code flow stays for technical use. Both run the same tool code and share one "Connected assistants" list. | owner: "A, as recommended" |
| D3 | **Tokens:** 1-hour access tokens, silent refresh; refresh tokens rotate on every use; a connection expires after **90 days unused**; revoke from Connected assistants is immediate. | owner: "A, as recommended" |
| D4 | **Reach:** a connection can do everything the person can, in every workspace they belong to — all 9 tools, reads and writes. The consent screen says so plainly. No workspace picker, no read-only mode (addable later). | owner: "A, as recommended" |
| D5 | **Approach:** build a small OAuth 2.1 authorization server INSIDE the existing Fastify `server` service; reuse better-auth for sign-in; no new DigitalOcean component; no better-auth upgrade. | owner: "1, as recommended" |
| D6 | Ships in `release/2026-09-30` with the styling refresh. | owner |

## 3. Architecture

```
Claude / ChatGPT ──HTTPS──▶ pm-api.artsourced.in  (the existing `server` service)
                              ├─ GET  /.well-known/oauth-protected-resource   (RFC 9728)
                              ├─ GET  /.well-known/oauth-authorization-server (RFC 8414)
                              ├─ POST /oauth/register     (RFC 7591, public clients)
                              ├─ GET  /oauth/authorize    → 302 to ${WEB_ORIGIN}/mcp/connect
                              ├─ POST /oauth/token        (authorization_code + PKCE; refresh_token)
                              ├─ POST /oauth/revoke       (RFC 7009)
                              └─ POST /mcp                (MCP Streamable HTTP, stateless)
                                     └─ the 9 shared tools → the API's own routes, in-process, as that person
```

- **A1 — One server, Fastify plugins.** Each surface above is a plugin registered in `apps/server/src/app.ts`, beside the existing `routes/mcp-device.ts` and `routes/mcp-tokens.ts`.
- **A2 — The same tools, not a copy.** Today's tools are built on a `Session` that calls the REST API over HTTP (`packages/mcp-server/src/tools/register.ts:13` `allTools(session)`, `:39` `registerTools`). The hosted door builds that `Session` over an **in-process transport** (Fastify `inject`) that presents the caller's access token as `Authorization: Bearer`. So the 9 tools, every REST permission check and the `origin: 'mcp'` tag are the same code in both doors. The plan confirms the package can be imported by the server (exports, build order) and names the one seam that swaps the transport.
- **A3 — Sign-in reused.** `/oauth/authorize` validates the request, stores a pending authorization, and sends the browser to a new web page `${WEB_ORIGIN}/mcp/connect`. Not signed in → the existing sign-in page (Google, magic link, passkey) and back. Signed in → the consent screen (§4). Allow/Deny posts to the API, which answers with the redirect to the client.
- **A4 — One credential store.** `mcp_tokens` (today: `token_hash, user_id, created_at, last_used`, plus `name` from `1789700000000_mcp-tokens-name.sql`; store at `apps/server/src/mcp/token-store.ts`) gains `kind` (`local` | `hosted`), `expires_at` (NULL for local — unchanged behaviour), `client_id` and `family_id` (the refresh family). New tables: `oauth_clients` (registered clients), `oauth_codes` (pending authorization codes), `oauth_refresh_tokens` (rotating, per family). All hashes only.
- **A5 — Bearer resolution unchanged in order.** `requireSession` already tries better-auth, then falls back to `mcp_tokens` on the raw bearer (`apps/server/src/auth/require-session.ts:80-100`, order pinned by case 14.35). The fallback additionally refuses an expired `hosted` row. Local rows keep no expiry.
- **A6 — Stateless `/mcp`.** Every request carries its bearer; no server-side MCP session is held (the SDK's Streamable HTTP transport in stateless mode). Safe across restarts, deploys and instances.

## 4. The person's flow and the consent screen

1. In Claude or ChatGPT: "add connector" → paste `https://pm-api.artsourced.in/mcp`.
2. A browser window opens on `pm.artsourced.in`; if signed out, the usual sign-in.
3. Consent screen (copy pinned; the plan may tighten wording, not meaning):
   > **Claude** (claude.ai) wants to use Gisik Nokma as **you**.
   > It will be able to see and change everything you can — read tickets, create them, move them, comment and assign — in all your workspaces.
   > You can disconnect it any time from Account → Connected assistants.
   > **[Allow]** **[Deny]**
4. Back in the app; it works. Nothing copied or typed.

The client's name is self-reported at registration, so the screen ALWAYS also shows the redirect URI's host (e.g. `claude.ai`, `chatgpt.com`) — a client cannot pass itself off by name alone.

## 5. OAuth rules

- **Registration (RFC 7591):** public clients only (`token_endpoint_auth_method: none`); `redirect_uris` must be `https://…` or a loopback (`http://127.0.0.1:*` / `http://localhost:*`) for desktop clients; `client_name` stored and shown. Rate-limited per IP. A client with no live connection is removed after 30 days.
- **Authorize:** `response_type=code`, **PKCE S256 required** (plain or absent refused), `redirect_uri` must match a registered one **exactly** (string equality), `state` passed through, single scope `gisik:act` ("act as me") — present in metadata because clients expect a scope; the only one.
- **Code:** single-use, 60 s, bound to client, redirect URI and PKCE challenge; stored as a hash; deleted at exchange.
- **Access token:** opaque, 256-bit random, 1 hour; `mcp_tokens` row `kind='hosted'`, hashed.
- **Refresh token:** opaque, rotated on every use (the old one is dead); presenting a dead one revokes the whole family (reuse detection); family expires after 90 days without a refresh, the window sliding on each refresh.
- **Revoke:** `/oauth/revoke` and the Connected assistants Disconnect both kill the family's access + refresh tokens at once.
- **Deny:** redirect with `error=access_denied`; nothing stored.
- **Metadata:** protected-resource metadata names the authorization server; AS metadata lists the endpoints, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported: ["gisik:act"]`.

## 6. Failure behaviour

- **Expired/revoked token at `/mcp`:** `401` with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`; Claude and ChatGPT show their own reconnect prompt; one click reruns §4.
- **A tool refused by permissions:** the tool result carries the server's own plain reason, as the local server does today.
- **Server unavailable:** the client's standard error; each call stands alone.
- **A removed member (R5)** or one whose role no longer allows an action gets nothing more than the REST API would give them — every tool call re-resolves their role.

## 7. Security

Each rule below gets a test and a named mutation that proves the test would catch its removal:
PKCE required (S256 only); exact redirect match; https-or-loopback redirects; single-use short codes; refresh rotation + reuse revokes the family; expired hosted tokens refused while local ones are not; hashes only, tokens never logged (extend C3's request-log redaction to `/oauth/*` query strings and bodies); registration rate limit; CSRF protection on Allow/Deny (the existing `http-origin` check, `apps/server/src/http/http-origin.ts`); the consent page refuses framing (`frame-ancestors 'none'`); `/mcp` validates `Origin` against DNS rebinding (MCP transport requirement); the purge engine's table rules cover the new tables (`apps/server/src/purge/table-rules.ts:128` lists `mcp_tokens` today).

## 8. Operations

- **Hosting:** the existing `server` service; no new component.
- **CORS:** `/mcp` and `/oauth/*` must accept cross-origin calls from the Claude and ChatGPT web clients (and `OPTIONS` preflight). If this needs a DO spec change, it is applied from the LIVE spec with `doctl apps update` (memory: the spec is not applied on push) — the plan checks first.
- **Migration:** one, additive: new columns on `mcp_tokens` with defaults that keep existing rows `kind='local'`, `expires_at NULL`; three new tables. Safe for the old code while it applies.
- **Logs:** per tool call — tool name, outcome, duration, user id; never a token.

## 9. Member help and the product screen

- **Help article** "Connect Claude or ChatGPT to Gisik Nokma" in the existing Help corpus (`pnpm check:help` guards it): per app, three short steps (where "add connector" is, paste the URL, Allow); how to disconnect; what "reconnect" means.
- **Account → Connected assistants** (`apps/web/app/mcp/tokens/page.tsx`, `apps/web/src/mcp-tokens-screen.tsx`) gains a "Connect an assistant" panel: the URL with a Copy button and a link to the article. Hosted rows show the app name + redirect host, connected date, last used, Disconnect; local rows as today.

## 10. Testing

- Route and unit tests for every endpoint and every §7 rule, with named mutations.
- The whole round trip against the running server: discovery → register → authorize (signed-in test user) → consent → token → `/mcp` `tools/list` and a read + a write → refresh → reuse detection → revoke → `401`.
- The 9 tools through `/mcp` with the cases the stdio server already passes (proof of one code path).
- A browser pass on the dev stack: sign-in redirect, consent screen, Deny, Connected assistants.
- **Real clients before release:** connect the actual claude.ai and ChatGPT apps to a publicly reachable HTTPS deployment of the release branch. The local dev stack is not reachable from those apps, so the planner asks the owner at that point how to run it (a temporary tunnel to the dev stack, or production behind a switch).

## 11. Out of scope

Workspace picker or read-only mode (D4); new tools beyond the 9; promising clients other than Claude and ChatGPT; retiring the stdio server (D2); a better-auth upgrade (D5).
