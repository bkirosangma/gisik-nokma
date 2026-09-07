#!/usr/bin/env node
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadMcpConfig } from './config.js';
import { createGisikClient } from './http-client.js';
import { lazySession } from './lazy-session.js';
import { stderrLoginPrompt } from './login-prompt.js';
import { createSession } from './session.js';
import { registerTools } from './tools/register.js';

/**
 * Connect FIRST, authenticate on the first tool call.
 *
 * A missing `GISIK_SERVER_URL` still fails here, before the transport exists,
 * because that is a configuration error the person can fix from the message —
 * unlike a missing credential, which is a question only they can answer and
 * which must not hold the protocol handshake hostage while it is asked.
 */
async function main(): Promise<void> {
  const config = loadMcpConfig(process.env, homedir());
  const client = createGisikClient(config.serverUrl);
  const session = lazySession(() =>
    createSession({
      config,
      client,
      prompt: stderrLoginPrompt,
      sleep: (ms) => delay(ms),
      now: () => Date.now(),
    }),
  );

  const server = new McpServer({ name: 'gisik-nokma', version: '0.1.0' });
  registerTools(server, session);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
