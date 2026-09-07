import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { allTools, registerTools } from '../src/tools/register.js';
import { lazySession, type LazySession } from '../src/lazy-session.js';
import { createLoginPrompt, stderrLoginPrompt } from '../src/login-prompt.js';
import type { Session } from '../src/session.js';

/**
 * Plan: MCP server, Task 10. Cases 14.80–14.88.
 *
 * These run against a REAL `McpServer` and a REAL `Client` over
 * `InMemoryTransport` — not a recording double. A double records whatever it
 * is handed and would pass even if the SDK rejected all nine definitions,
 * which is exactly the question Step 1 of this task exists to answer. Neither
 * a network nor a child process is involved: the session is a fake and the
 * transport is a linked pair of in-memory queues.
 */

/** The nine, in the order `allTools` composes them: five read, then four write. */
const NINE = [
  'list_workspaces',
  'list_projects',
  'search_tickets',
  'list_tickets',
  'get_ticket',
  'create_ticket',
  'transition_ticket',
  'add_comment',
  'assign_ticket',
];

const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-09-08T00:00:00.000Z' }] };

function fakeSession(over: Partial<Session> = {}): Session {
  return {
    userId: () => '01J0A5ER0000000000000000AA',
    // `{ workspaces: [] }` rather than a bare stub: `list_projects` reads
    // the workspace directory and folds it, so a shapeless answer would make
    // the sweep in 14.88 fail for a reason that has nothing to do with stdout.
    get: async () => ({ workspaces: [] }),
    postEvents: async () => COMMITTED,
    ...over,
  };
}

/** Every tool's arguments, valid, so a sweep can drive all nine handlers. */
const ARGS: Record<string, Record<string, unknown>> = {
  list_workspaces: {},
  list_projects: { workspaceId: 'w' },
  search_tickets: { workspaceId: 'w', query: 'q' },
  list_tickets: { projectId: 'p' },
  get_ticket: { workspaceId: 'w', ticketId: 't' },
  create_ticket: { workspaceId: 'w', projectId: 'p', typeId: 'ty', title: 'A ticket' },
  transition_ticket: { workspaceId: 'w', ticketId: 't', to: 'done' },
  add_comment: { workspaceId: 'w', ticketId: 't', text: 'hello' },
  assign_ticket: { workspaceId: 'w', ticketId: 't', assigneeId: null },
};

async function connected(session: LazySession): Promise<Client> {
  const server = new McpServer({ name: 'gisik-nokma', version: '0.1.0' });
  registerTools(server, session);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content;
  const first = content?.[0];
  if (first === undefined || first.type !== 'text' || first.text === undefined) {
    throw new Error(`expected one text block, got ${JSON.stringify(result)}`);
  }
  return first.text;
}

describe('the nine tools, registered', () => {
  it('14.80 allTools yields exactly the nine, in a stable order, each named once and described', () => {
    const tools = allTools(fakeSession());
    expect(tools.map((t) => t.name)).toEqual(NINE);
    // A duplicate name would make the second registration throw at startup —
    // but only if there IS a second one, so the uniqueness is asserted here
    // rather than inferred from the server not crashing.
    expect(new Set(tools.map((t) => t.name)).size).toBe(NINE.length);
    for (const tool of tools) {
      expect(tool.description.length, `${tool.name} has no description`).toBeGreaterThan(0);
    }
  });

  it('14.81 a REAL McpServer accepts all nine and a REAL client lists them', async () => {
    const client = await connected(lazySession(async () => fakeSession()));
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name)).toEqual(NINE);
    for (const tool of listed.tools) {
      expect(tool.description ?? '', `${tool.name}`).not.toBe('');
      expect(tool.inputSchema.type, `${tool.name}`).toBe('object');
    }
  });

  it('14.82 the empty raw shape and the imported .strict() FilterSpec both survive into real JSON Schema', async () => {
    const client = await connected(lazySession(async () => fakeSession()));
    const listed = await client.listTools();

    // `list_workspaces` declares `inputSchema: {}`. An empty raw shape is the
    // shape most likely to degrade into "no schema at all" — which would make
    // the tool accept anything.
    const empty = listed.tools.find((t) => t.name === 'list_workspaces')?.inputSchema;
    expect(empty).toMatchObject({ type: 'object', properties: {} });

    // `filter` is `filterSpecSchema` from @gisik-nokma/domain — imported, not
    // restated — and it is `.strict()`. `additionalProperties: false` reaching
    // the wire is the proof that the SDK walked the SAME zod instance the
    // domain package built the schema with; two copies of zod in the tree
    // would misclassify it and this would be absent.
    const search = listed.tools.find((t) => t.name === 'search_tickets')?.inputSchema as unknown as {
      properties: { filter: { additionalProperties: unknown; properties: Record<string, unknown> } };
      required: string[];
    };
    expect(search.properties.filter.additionalProperties).toBe(false);
    expect(Object.keys(search.properties.filter.properties)).toContain('stateCategory');
    expect(search.required).toEqual(['workspaceId', 'query']);
  });

  it('14.83 the SDK enforces that schema BEFORE the handler runs', async () => {
    let touched = 0;
    const client = await connected(
      lazySession(async () =>
        fakeSession({
          get: async () => {
            touched += 1;
            return { workspaces: [] };
          },
        }),
      ),
    );
    // `ticketId` is required and absent.
    const refused = await client.callTool({ name: 'get_ticket', arguments: { workspaceId: 'w' } });
    expect(refused.isError).toBe(true);
    // The PREFIX is the whole point. Every handler re-parses its own arguments,
    // so a tool registered with `inputSchema: {}` still refuses this call —
    // from inside the handler, with a raw zod error. Asserting only
    // `toContain('ticketId')` would pass either way and this case would be
    // claiming a property it never measured. `-32602` is the SDK's own
    // invalid-params answer, and only the schema reaching the SDK produces it.
    expect(textOf(refused)).toMatch(/^MCP error -32602: Input validation error:/);
    expect(textOf(refused)).toContain('ticketId');
    expect(touched, 'the handler ran despite invalid arguments').toBe(0);
  });

  it('14.84 a handler answer comes back as MCP text content carrying the body unchanged', async () => {
    const body = { workspaces: [{ workspaceId: 'w1', role: 'admin', projects: [] }] };
    const client = await connected(lazySession(async () => fakeSession({ get: async () => body })));
    const called = await client.callTool({ name: 'list_workspaces', arguments: {} });
    expect(called.isError).toBeFalsy();
    expect(JSON.parse(textOf(called))).toEqual(body);
  });

  it('14.85 a rule-engine refusal returns isError with the rule and the reason VERBATIM', async () => {
    const client = await connected(
      lazySession(async () =>
        fakeSession({
          postEvents: async () => ({
            results: [
              {
                status: 'refused',
                eventId: 'e',
                rule: 'transition-requires-comment',
                reason: 'Moving to "blocked" needs a comment saying what is blocking it.',
              },
            ],
          }),
        }),
      ),
    );
    const called = await client.callTool({
      name: 'transition_ticket',
      arguments: { workspaceId: 'w', ticketId: 't', to: 'blocked' },
    });
    expect(called.isError).toBe(true);
    // FULL equality, not `toContain`. The failure being guarded is a reworded
    // or truncated refusal, and a truncation that keeps the prefix passes
    // `toContain` while destroying the sentence the product wrote.
    expect(textOf(called)).toBe(
      'refused by transition-requires-comment: Moving to "blocked" needs a comment saying what is blocking it.',
    );
  });

  it('14.86 a throw that is not an Error still arrives as its own text', async () => {
    const client = await connected(
      lazySession(async () =>
        fakeSession({
          get: async () => {
            throw 'the server hung up';
          },
        }),
      ),
    );
    const called = await client.callTool({ name: 'list_workspaces', arguments: {} });
    expect(called.isError).toBe(true);
    expect(textOf(called)).toBe('the server hung up');
  });

  it('14.87 the handshake does not wait on a credential — the FIRST TOOL CALL authenticates, once', async () => {
    let logins = 0;
    const session = lazySession(async () => {
      logins += 1;
      return fakeSession();
    });
    const client = await connected(session);

    // `connected` has completed `initialize`. On a fresh install there is no
    // cached token, so an eager `createSession` would still be sitting in the
    // device flow here — for up to ten minutes — and the client would have
    // given up on a server that never answered.
    expect(logins, 'connecting the transport authenticated').toBe(0);
    await client.listTools();
    expect(logins, 'listing tools authenticated').toBe(0);

    // A WRITE, deliberately. `envelope()` reads `session.userId()`
    // SYNCHRONOUSLY while building the event, so this call only works if
    // `registerTools` awaited `ready()` BEFORE dispatching to the handler —
    // dropping that await turns every write into "not signed in yet".
    const created = await client.callTool({
      name: 'create_ticket',
      arguments: { workspaceId: 'w', projectId: 'p', typeId: 'ty', title: 'A ticket' },
    });
    expect(created.isError, textOf(created)).toBeFalsy();
    expect(logins).toBe(1);
    await client.callTool({ name: 'list_workspaces', arguments: {} });
    expect(logins, 'the second call logged in again').toBe(1);
  });

  it('14.88 nothing on the tool path writes to STDOUT — stdout is the transport', async () => {
    const session = lazySession(async () => fakeSession());
    const server = new McpServer({ name: 'gisik-nokma', version: '0.1.0' });

    const passthrough = process.stdout.write.bind(process.stdout);
    const out: unknown[] = [];
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(((chunk: string, ...rest: unknown[]) => {
        out.push(chunk);
        return (passthrough as (...a: unknown[]) => boolean)(chunk, ...rest);
      }) as never);
    const err: unknown[] = [];
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
      err.push(chunk);
      return true;
    }) as never);

    try {
      registerTools(server, session);
      for (const tool of allTools(session)) {
        await tool.handler(ARGS[tool.name] ?? {});
      }
      // The prompt `main.ts` installs, called through the same binding it uses
      // there — so this covers the wiring, not a re-creation of it.
      stderrLoginPrompt({ userCode: 'ABCD-EFGH', verificationUri: 'https://example.test/mcp/authorize' });
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }

    expect(out, `wrote to stdout: ${JSON.stringify(out)}`).toEqual([]);
    expect(err.join('')).toContain('ABCD-EFGH');
    expect(err.join('')).toContain('https://example.test/mcp/authorize');
  });

  it('14.88b createLoginPrompt writes one chunk naming both halves of the instruction', () => {
    const chunks: string[] = [];
    createLoginPrompt((chunk) => chunks.push(chunk))({
      userCode: 'WXYZ-1234',
      verificationUri: 'https://example.test/mcp/authorize',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('WXYZ-1234');
    expect(chunks[0]).toContain('https://example.test/mcp/authorize');
  });
});
