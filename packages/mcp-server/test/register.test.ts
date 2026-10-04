import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { allTools, registerTools } from '../src/tools/register.js';
import { lazySession, type LazySession } from '../src/lazy-session.js';
import { createLoginPrompt, stderrLoginPrompt } from '../src/login-prompt.js';
import type { Session } from '../src/session.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { TOOL_NAMES } from './fixtures/tool-names.js';
import { SWEEP } from './fixtures/tool-sweep.js';

/**
 * Plan: MCP server, Task 10. Cases 14.80–14.88.
 *
 * These run against a REAL `McpServer` and a REAL `Client` over
 * `InMemoryTransport` — not a recording double. A double records whatever it
 * is handed and would pass even if the SDK rejected every tool definition,
 * which is exactly the question Step 1 of this task exists to answer. Neither
 * a network nor a child process is involved: the session is a fake and the
 * transport is a linked pair of in-memory queues.
 */

const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-09-08T00:00:00.000Z' }] };

function fakeSession(over: Partial<Session> = {}): Session {
  return {
    userId: () => '01J0A5ER0000000000000000AA',
    // One workspace `w` named `W` (an empty Deleted items list and an empty roster) rather than a
    // bare stub: `list_projects` and the workspace tools read the directory, and
    // the sweep in 14.88 drives `archive_workspace` with `confirm_name: 'W'` and `archive_project` with `'P'` — a
    // shapeless answer would fail it for a reason that has nothing to do with stdout.
    get: async () => ({
      workspaces: [{ workspaceId: 'w', name: 'W', prefix: 'W', role: 'owner', archived: false, projects: [{ projectId: 'p', name: 'P', description: null, prefix: 'P', archived: false }] }],
      items: [],
      members: [], // `list_members` reads `/members`
    }),
    post: async () => ({}),
    // One committed result per event sent: `create_project` sends a pair, and a short answer is refused.
    postEvents: async (events) => ({ results: events.map(() => COMMITTED.results[0]) }),
    ...NO_TRANSFER,
    ...over,
  };
}

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

describe('the tools, registered', () => {
  it('14.80 allTools yields exactly the pinned tools, in a stable order, each named once and described', () => {
    const tools = allTools(fakeSession());
    expect(tools.map((t) => t.name)).toEqual(TOOL_NAMES);
    // A duplicate name would make the second registration throw at startup —
    // but only if there IS a second one, so the uniqueness is asserted here
    // rather than inferred from the server not crashing.
    expect(new Set(tools.map((t) => t.name)).size).toBe(TOOL_NAMES.length);
    for (const tool of tools) {
      expect(tool.description.length, `${tool.name} has no description`).toBeGreaterThan(0);
    }
  });

  it('14.81 a REAL McpServer accepts every tool and a REAL client lists them', async () => {
    const client = await connected(lazySession(async () => fakeSession()));
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name)).toEqual(TOOL_NAMES);
    for (const tool of listed.tools) {
      expect(tool.description ?? '', `${tool.name}`).not.toBe('');
      expect(tool.inputSchema.type, `${tool.name}`).toBe('object');
    }
  });

  it('14.555 the final registry is the 69 tools of the plan, in its order, in the package door (the hosted door is mcp-http 14.262)', async () => {
    // The plan's header order, spelled out HERE and not read from the fixture: editing the fixture alone cannot make this green.
    const FINAL = [
      'search', 'search_tickets', 'list_tickets', 'get_ticket', 'list_members',
      'create_ticket', 'transition_ticket', 'add_comment', 'assign_ticket',
      'list_workspaces', 'get_workspace', 'create_workspace', 'rename_workspace', 'archive_workspace', 'restore_workspace', 'delete_workspace', 'undelete_workspace',
      'list_projects', 'get_project', 'create_project', 'update_project', 'archive_project', 'restore_project', 'delete_project', 'undelete_project',
      'list_comments', 'edit_comment', 'delete_comment',
      'list_notes', 'get_note', 'create_note', 'update_note', 'link_note', 'delete_note', 'restore_note', 'restore_note_version', 'get_note_history',
      'list_attachments', 'get_attachment', 'add_attachment',
      'update_ticket', 'close_ticket', 'reopen_ticket', 'close_tickets', 'delete_ticket', 'restore_ticket', 'get_ticket_history', 'rank_ticket', 'link_tickets',
      'list_ticket_types', 'list_workflows', 'my_work', 'get_attention', 'list_notifications', 'mark_notifications_read', 'list_my_invitations', 'respond_to_invitation',
      'manage_members', 'change_prefix', 'manage_groups',
      'define_workflow', 'define_ticket_type', 'migrate_ticket_type', 'set_visibility', 'update_workspace_settings',
      'list_deleted',
      'list_my_drafts', 'publish_draft', 'discard_draft',
    ];
    expect(FINAL).toHaveLength(69); // 63 until typed links T4 added `link_tickets` (27.060), 64 until MCP sweep 2 T4 added `restore_note_version`, 65 until MCP sweep 2 T5 added `close_tickets` (14.555), 66 until drafts T7 added `list_my_drafts`, `publish_draft`, `discard_draft` (28.141)
    const tools = allTools(fakeSession());
    expect(tools.map((t) => t.name)).toEqual(FINAL);
    expect(TOOL_NAMES).toEqual(FINAL);
    const client = await connected(lazySession(async () => fakeSession()));
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(FINAL);
    for (const tool of tools) expect(tool.description.length, `${tool.name} has no description`).toBeGreaterThan(0); // control: every one is described
  });

  it('14.82 the optional `include` enum and the imported .strict() FilterSpec both survive into real JSON Schema', async () => {
    const client = await connected(lazySession(async () => fakeSession()));
    const listed = await client.listTools();

    // `list_workspaces` declares `include` as an OPTIONAL array of a two-value enum (MCP CRUD plan
    // Task 6; before it, this tool was the one empty raw shape). The enum is what tells an
    // assistant the only legal values, and an optional key must not become required.
    const workspaces = listed.tools.find((t) => t.name === 'list_workspaces')?.inputSchema as unknown as {
      properties: { include: { type: string; items: { enum: string[] } } };
      required?: string[];
    };
    expect(workspaces.properties.include.type).toBe('array');
    expect(workspaces.properties.include.items.enum).toEqual(['archived', 'deleted']);
    expect(workspaces.required ?? []).not.toContain('include');

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
      for (const name of TOOL_NAMES) {
        const entry = SWEEP[name];
        if (entry === undefined) throw new Error(`no sweep entry for ${name} — add one in test/fixtures/tool-sweep.ts`);
        const s = lazySession(async () => ({ ...fakeSession(), ...entry.session }));
        await s.ready();
        const tool = allTools(s).find((t) => t.name === name);
        if (tool === undefined) throw new Error(`${name} is pinned but not registered`);
        await tool.handler(entry.args);
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
