import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LazySession } from '../lazy-session.js';
import type { Session } from '../session.js';
import { attachmentTools } from './attachment-tools.js';
import { commentTools } from './comment-tools.js';
import { definitionAdminTools } from './definition-admin-tools.js';
import { draftTools } from './draft-tools.js';
import { discoveryTools } from './discovery-tools.js';
import { flowTools } from './flow-tools.js';
import { memberAdminTools } from './member-admin-tools.js';
import { noteTools } from './note-tools.js';
import { projectTools } from './project-tools.js';
import { readTools, type ToolDefinition } from './read-tools.js';
import { ToolReply } from './reply.js';
import { ticketTools } from './ticket-tools.js';
import { trashTools } from './trash-tools.js';
import { workspaceTools } from './workspace-tools.js';
import { writeTools } from './write-tools.js';

/**
 * Every tool, in one order, from one place: the reads, the ticket writes, the
 * workspace tools, the project tools, then one module per MCP-everything lane (comments, notes,
 * attachments, tickets, discovery, member admin, definition admin, trash, drafts), then the flow tools of the Workflow and Timeline graphs
 * (Graph Part 5). A tool dropped from any factory disappears from the
 * assistant's world silently — there is no error, the capability simply stops
 * existing — so the order and the count are pinned by a test rather than left
 * to whoever edits the factories next. Both doors (stdio and the hosted `/mcp`)
 * register through this function, so a tool added here exists in both.
 */
export function allTools(session: Session): ToolDefinition[] {
  return [
    ...readTools(session),
    ...writeTools(session),
    ...workspaceTools(session),
    ...projectTools(session),
    ...commentTools(session),
    ...noteTools(session),
    ...attachmentTools(session),
    ...ticketTools(session),
    ...discoveryTools(session),
    ...memberAdminTools(session),
    ...definitionAdminTools(session),
    ...trashTools(session),
    ...draftTools(session),
    ...flowTools(session),
  ];
}

/** What the hosted door may observe about a call: which tool, how it ended, how long. Nothing else. */
export type ToolCallEvent = { tool: string; outcome: 'ok' | 'error'; durationMs: number };
export type RegisterHooks = { onCall?(event: ToolCallEvent): void };

/** Every tool of `allTools`, registered on `server` through `registerToolDefinitions`. */
export function registerTools(server: McpServer, session: LazySession, hooks: RegisterHooks = {}): void {
  registerToolDefinitions(server, session, allTools(session), hooks);
}

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
 *
 * This is the registration LOOP itself; `registerTools` is `allTools` through it. It is exported so a
 * test can push a fake `ToolDefinition` through the REAL code (case 14.363). A handler that answers a
 * `ToolReply` (an image, today) passes its blocks through as they are; every other answer is ONE JSON text block.
 */
export function registerToolDefinitions(
  server: McpServer,
  session: LazySession,
  tools: ToolDefinition[],
  hooks: RegisterHooks = {},
): void {
  for (const tool of tools) {
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
          // An image (or any non-JSON answer) passes through as its own blocks; everything else is ONE JSON text block.
          if (result instanceof ToolReply) return { content: result.content };
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
