import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LazySession } from '../lazy-session.js';
import type { Session } from '../session.js';
import { readTools, type ToolDefinition } from './read-tools.js';
import { writeTools } from './write-tools.js';

/**
 * The nine tools, in one order, from one place. A tool dropped from either
 * half disappears from the assistant's world silently — there is no error, the
 * capability simply stops existing — so the order and the count are pinned by
 * a test rather than left to whoever edits the two factories next.
 */
export function allTools(session: Session): ToolDefinition[] {
  return [...readTools(session), ...writeTools(session)];
}

/** What the hosted door may observe about a call: which tool, how it ended, how long. Nothing else. */
export type ToolCallEvent = { tool: string; outcome: 'ok' | 'error'; durationMs: number };
export type RegisterHooks = { onCall?(event: ToolCallEvent): void };

/**
 * The ONE place that knows the MCP SDK's registration API. Everything else in
 * this package speaks `ToolDefinition`, so an SDK upgrade that moves this
 * signature is a one-file change and every tool test keeps running with no
 * transport at all.
 *
 * Verified against the installed `@modelcontextprotocol/sdk@1.30.0` rather
 * than recalled: `registerTool(name, config, cb)` types `inputSchema` as
 * `ZodRawShapeCompat | AnySchema`, and `ZodRawShapeCompat = Record<string,
 * AnySchema>` — a zod RAW SHAPE, which is exactly what `ToolDefinition`
 * already carries. No `zod-to-json-schema` conversion is needed, and if a
 * later SDK wants JSON Schema instead, this file is where that happens.
 *
 * `session.ready()` is awaited BEFORE the handler, not inside it: `userId()`
 * is synchronous and every write reads it while building the envelope. See
 * `lazy-session.ts` for why the credential cannot be fetched at startup.
 *
 * An error thrown by a handler is returned as `isError: true` with the message
 * unchanged — a refusal from the rule engine reaches the assistant saying what
 * the rule was and why, which is the whole point. Rewording it here would make
 * the product explain itself in words it did not choose.
 *
 * `hooks.onCall` is the hosted door's one observation point (remote-MCP plan
 * Task 7, case 14.268): it fires after every handler with the tool's NAME, its
 * outcome and how long it took — and deliberately nothing else. The arguments
 * and the result are what a person typed and what their workspace holds; a log
 * line that could carry them would be a second copy of the ledger with none of
 * its access rules. The stdio entry point passes no hooks and is unchanged.
 */
export function registerTools(server: McpServer, session: LazySession, hooks: RegisterHooks = {}): void {
  for (const tool of allTools(session)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        const started = Date.now();
        const observe = (outcome: ToolCallEvent['outcome']): void =>
          hooks.onCall?.({ tool: tool.name, outcome, durationMs: Date.now() - started });
        try {
          await session.ready();
          const result = await tool.handler(args);
          observe('ok');
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          observe('error');
          return {
            isError: true,
            content: [
              { type: 'text' as const, text: error instanceof Error ? error.message : String(error) },
            ],
          };
        }
      },
    );
  }
}
