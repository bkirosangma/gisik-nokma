# gisik-nokma MCP server — design spec

**Status:** approved by owner, ready for `writing-plans`.
**Date:** 2026-09-07

## Purpose

Let a user's own AI assistant (Claude Desktop, Claude Code, or any other MCP client) operate gisik-nokma
on their behalf: search and read tickets, create tickets, move them through their workflow, comment, and
assign — the same actions a person can take through the web client, exposed as MCP tools.

This is single-user, local-first: one person runs the server on their own machine, authenticated as
themselves, against their own workspace(s). It is not a hosted, multi-tenant service.

## Non-goals (v1)

- No hosted/remote deployment, no OAuth-for-third-parties flow, no multi-tenant serving.
- No new business logic, no new workflow rules, no new visibility rules — this surface only calls
  capabilities the server already has.
- No raw/low-level "post any event" tool. Every write is a named, validated action.
- No attachment upload/download, no invite management, no admin/workspace-settings tools — read/write
  tickets is the whole v1 surface (see Scope below).

## Architecture

A new package, `packages/mcp-server`, is a **pure network client** — it has no direct database access
and duplicates no business logic. It is not part of `apps/server`'s process or deploy story.

```
packages/mcp-server (new)
  │
  ├─ stdio transport (MCP SDK, @modelcontextprotocol/sdk)
  ├─ device-flow login (see Auth below)
  └─ authenticated HTTP client
         │
         ▼  HTTP, same as the web/mobile clients
  apps/server (EXISTING — unchanged except:
              - two new auth routes for the device flow
              - a token-auth path in require-session.ts
              - any write action with no existing route,
                see "New server-side surface" below)
    │
    ├─ auth / visibility / rule-engine   (all reused, not reimplemented)
    └─ tickets.ts, workspaces.ts, events.ts, etc.
```

Every visibility check, workflow gate, and refusal convention already enforced in the server's routes is
reused as-is. The MCP server never sees a database connection string, never imports from `apps/server/src`
directly, and never constructs SQL or projection reads itself.

**Why not embed MCP in `apps/server` directly (in-process, no network hop):** that couples the MCP
server's lifecycle, deploy cadence, and crash domain to the main HTTP server, for a component that is
inherently a *personal, local* process, not a shared service. The network-hop cost is negligible for a
single-user local tool talking to `localhost` or one remote server the user already trusts (the same
server their web client talks to).

## Auth: device-authorization flow

Modeled on the standard CLI-auth UX (`gh auth login`, `docker login`, this very `claude` CLI): no manual
token copy-pasting, no reused browser session cookie.

1. First run (or expired token): `mcp-server` calls a new server endpoint to mint a device code, prints
   a URL + short code, and opens the browser if possible.
2. The user opens the URL in their already-authenticated browser session and approves the request.
3. `mcp-server` polls a second new endpoint until the device code is approved, then receives a
   **personal access token**, scoped to that one user, and caches it locally (e.g.
   `~/.gisik-nokma/mcp-token`, mode 0600).
4. Every subsequent tool call sends this token as a bearer credential.
5. On a 401 (expired/revoked token), the server automatically re-runs the device flow rather than
   surfacing a raw HTTP error.

### New server-side surface this requires

- Two new routes under `apps/server/src/routes/` (device-code issuance, device-code polling/exchange),
  following the existing route module conventions (Fastify, zod-validated bodies, the shared refusal
  body shape where applicable).
- A new token type (opaque, hashed at rest — same posture as a session token) with a `user_id` and no
  browser-session semantics (no cookie, no CSRF concerns for a bearer token used by a local process).
- `apps/server/src/auth/require-session.ts` gains a second recognized credential shape (bearer token)
  alongside the existing session-cookie check; both resolve to the same `currentUserId` the rest of the
  server already expects.
- Token issuance and revocation are **owned by the auth module** — this spec does not re-derive
  better-auth's session model, it adds one sibling credential type to it.

## Scope: v1 tool surface

High-level, semantic tools only — no raw event/webhook-shaped tool. Every write validates against the
same domain schemas the server already uses (`packages/domain`), not a redefinition of them.

| Tool | Kind | Maps to |
|---|---|---|
| `list_workspaces` | read | `GET /v1/me/workspaces` |
| `list_projects` | read | existing workspace→projects read |
| `search_tickets` | read | existing search route |
| `list_tickets` | read | existing list/board route, filter-capable (reuses the `FilterSpec` support landed 2026-09-07) |
| `get_ticket` | read | existing ticket-detail read |
| `create_ticket` | write | constructs and posts a `ticket.created` event to `/v1/events` |
| `transition_ticket` | write | constructs and posts the workflow-transition event; refused by the rule-engine exactly as the web client's attempt would be |
| `add_comment` | write | constructs and posts a comment event |
| `assign_ticket` | write | constructs and posts an assignment event |

Deferred, explicitly out of scope for v1 (add later if needed, each its own small increment):
attachments, invites, workspace/project administration, ticket type or workflow *definition* changes,
bulk operations, any tool that mutates more than one ticket per call.

## Data flow

**Reads:** straight passthrough. Call the existing route, return its JSON to the MCP client. No
transformation beyond whatever shape the MCP SDK requires for a tool result.

**Writes:** one path for all nine write tools —
1. Validate the tool's input against the relevant `zod` schema imported from `packages/domain` (not
   redefined in `mcp-server`).
2. Construct the domain event.
3. `POST /v1/events`.
4. Return the server's response verbatim, success or refusal.

## Error handling

The server's own refusal bodies (visibility 404s, rule-engine gate refusals, validation errors) are
surfaced as MCP tool errors **with their original message intact** — no re-wording, no swallowing,
consistent with this codebase's standing convention that a refusal's own words are never paraphrased.

A 401 triggers the device-flow login automatically (see Auth, step 5) rather than failing the tool call
outright; the in-flight tool call is retried once after a successful re-auth.

Network/transport failures (server unreachable, timeout) surface as a plain MCP error naming the failure,
not retried automatically — an AI assistant retrying a write against an unreachable server risks a
double-submit once connectivity returns mid-retry, which is worse than surfacing the failure once.

## Testing

- `packages/mcp-server` gets its own vitest suite: each tool tested against a mocked HTTP layer (matching
  this codebase's existing `stubServices`/fake-`DataSource` pattern in spirit, not by reusing app-core's
  fakes directly — this package has no UI/React dependency).
- The device-flow auth path gets an integration-style test against the two new server routes (real
  routes, real token issuance, no browser involved — the polling loop is driven directly).
- The two new server routes get their own tests in `apps/server/test/`, following existing route-test
  conventions.
- No new citation/`test-cases/` rows are implied unless the implementation plan decides this surface
  should be catalogued the way the rest of the product is — a decision for `writing-plans`, not this spec.

## Open questions for the implementation plan (not blocking this spec)

- Exact device-code TTL and polling interval.
- Whether `mcp-server` ships as an installable CLI (`npx @gisik-nokma/mcp-server`) or a repo-local script
  users point their MCP client config at directly — either is compatible with this design; it's a
  packaging decision, not an architectural one.
