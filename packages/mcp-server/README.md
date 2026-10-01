# `@gisik-nokma/mcp-server`

An MCP server that lets an assistant read and change your gisik-nokma board **as you**, over stdio,
authenticated with a personal access token you approve in a browser.

It has no permissions of its own. Every call it makes is the call you would have made: the same
visibility rules, the same workflow rules, the same refusals. What it adds is the one thing the ledger
would otherwise lose — every event it writes carries `origin: 'mcp'`, so a claim your assistant made is
distinguishable in the history from a claim you typed yourself.

## Packaging: a repo-local script, for now

There is no npm package. This is a private workspace package like every other one in the repo
(`"private": true`), publishing to a registry is a decision nobody has taken, and an MCP client config
can point at a built path today — so v1 is a path, not an install. The `bin` name `gisik-nokma-mcp`
exists so that when publishing *is* decided the entry point does not have to move.

## Install

```bash
pnpm --filter @gisik-nokma/mcp-server run build
```

That writes `dist/main.js`. Then, in your MCP client's config:

```json
{
  "mcpServers": {
    "gisik-nokma": {
      "command": "node",
      "args": ["/absolute/path/to/gisik-nokma/packages/mcp-server/dist/main.js"],
      "env": { "GISIK_SERVER_URL": "http://localhost:3000" }
    }
  }
}
```

`GISIK_SERVER_URL` is the **API** origin — the one your web client talks to, port 3000 in the dev
compose stack, not the web app's 3001. It is required and there is no default: a wrong guess here is a
server that authenticates you against something that is not your board.

`GISIK_MCP_TOKEN_PATH` is optional and defaults to `~/.gisik-nokma/mcp-token`, written mode `0600`
inside a directory created mode `0700`.

## Authorize

Nothing happens at startup. The server connects its transport immediately, advertises its tools,
and fetches a credential the first time the assistant actually calls one — because a device flow can
take as long as it takes you to find your browser, and a server that spends that time silent is a
server your MCP client marks as failed to start.

So: ask the assistant to do something. The first call prints to **stderr** (never stdout — stdout is
the protocol stream):

```
gisik-nokma needs you to approve this assistant.
  1. Open http://localhost:3001/mcp/authorize
  2. Enter the code ABCD-EFGH
Waiting…
```

Where that lands depends on your client; most write a server's stderr to a log file. Open the URL,
sign in if you are not already, and type the code. The tool call completes as soon as you approve, and
the token is cached — you will not be asked again unless it is revoked.

## What the assistant can then do

Read: `list_workspaces`, `list_projects`, `search_tickets`, `list_tickets`, `get_ticket`.

Write, **as you**: `create_ticket`, `transition_ticket`, `add_comment`, `assign_ticket`.

A write is a real event in the real ledger, attributed to your account. There is no preview and no undo
beyond the product's own — a ticket the assistant creates is a ticket, and a transition it makes is one
you will have to move back yourself if you did not want it. The rule engine still refuses what it would
refuse for you, and when it does, the assistant is told the rule's name and the reason in the server's
own words rather than a summary of them.

## Revoke

Open **`/mcp/tokens`** — *Connected assistants* — sign in, and click **Revoke**. It takes effect at the
assistant's next request: the token stops resolving, the server answers 401, and the client clears its
cached copy and starts a fresh device flow. Nothing is interrupted mid-task.

The list shows when each connection was approved and when it was last used — so you can tell a live
connection from a forgotten one before revoking it. It never shows the connection itself, because that
is all there is: `mcp_tokens` stores `sha256(token)` and the raw value existed only in the response that
minted it.

If you would rather do it against the database — every connection for one person, in one statement:

```sql
DELETE FROM mcp_tokens WHERE user_id = '<your user id>';
```

Deleting the row is the whole revocation. `mcp_tokens` has no `expires_at`, deliberately (see
`apps/server/migrations/1788600000000_mcp-device-auth.sql`), because a token you minted for your own
machine should not sign your assistant out mid-task on a timer nobody chose.

`mcp_tokens.last_used` is what the *Last used* column reads. It is an observation only — no code path
reads it to decide anything.
