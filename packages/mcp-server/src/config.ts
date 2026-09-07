import { join } from 'node:path';

/**
 * 12 seconds, and it is DERIVED rather than chosen. The device routes share a
 * rate-limit bucket budgeted at `RATE_LIMIT_AUTH_MAX=10` per
 * `RATE_LIMIT_WINDOW_SEC=60` (see the server's `app.ts`), i.e. one request per
 * 6 seconds sustained. Polling at 12s spends half that budget, which leaves
 * room for the code-mint that opened the flow and for a retry, and keeps the
 * client from 429-ing itself — a login loop that rate-limits its own polling
 * looks exactly like a server that never approves.
 */
export const DEFAULT_POLL_INTERVAL_MS = 12_000;

export type McpConfig = {
  /** The gisik-nokma API origin, no trailing slash. */
  serverUrl: string;
  /** Where the personal access token is cached, mode 0600. */
  tokenPath: string;
  pollIntervalMs: number;
};

export function loadMcpConfig(env: NodeJS.ProcessEnv, home: string): McpConfig {
  const raw = env['GISIK_SERVER_URL'];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      'GISIK_SERVER_URL is not set. It is the origin of the gisik-nokma API this MCP server talks ' +
        'to — the same server your web client uses, e.g. http://localhost:3000.',
    );
  }
  return {
    serverUrl: raw.trim().replace(/\/+$/, ''),
    tokenPath: env['GISIK_MCP_TOKEN_PATH'] ?? join(home, '.gisik-nokma', 'mcp-token'),
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };
}
