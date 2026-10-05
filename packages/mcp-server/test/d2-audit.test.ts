import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { domainRegistry } from '@gisik-nokma/domain';
import { allTools } from '../src/tools/register.js';
import { MCP_READ_ONLY_TOOLS, MCP_WRITE_AUDIT } from '../src/tools/write-audit.js';
import type { Session } from '../src/session.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { SWEEP } from './fixtures/tool-sweep.js';

/**
 * Knowledge Graph spec D §7 case 8 (D2), KG-D Task 7. Cases 27.515–27.516: the MCP side of the audit. Every tool is
 * classified once, a read-only tool writes nothing, and a write tool posts only the event types its row in
 * `src/tools/write-audit.ts` declares. The server half (`apps/server/test/mcp/d2-audit.test.ts`, 27.517–27.518)
 * judges each row against History, an app surface and a remove path.
 */

const NEW_TOOL_HINT = 'A new MCP tool must be classified in packages/mcp-server/src/tools/write-audit.ts (spec D §7 case 8, D2).';

const COMMITTED = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-09-08T00:00:00.000Z' };

/** Copied from `register.test.ts` (it is local there): the one workspace `w` the 14.88 sweep's entries read. */
function fakeSession(over: Partial<Session> = {}): Session {
  return {
    userId: () => '01J0A5ER0000000000000000AA',
    get: async () => ({
      workspaces: [{ workspaceId: 'w', name: 'W', prefix: 'W', role: 'owner', archived: false, projects: [{ projectId: 'p', name: 'P', description: null, prefix: 'P', archived: false }] }],
      items: [],
      members: [],
    }),
    post: async () => ({}),
    // One committed result per event sent: `create_project` sends a pair, and a short answer is refused.
    postEvents: async (events) => ({ results: events.map(() => COMMITTED) }),
    ...NO_TRANSFER,
    ...over,
  };
}

const TOOLS_DIR = new URL('../src/tools/', import.meta.url);
/** A tool whose `name:` is a template literal, not a quoted name: the template, and the tools that block yields. */
const TEMPLATED: Readonly<Record<string, readonly string[]>> = { '`${verb}_ticket`': ['close_ticket', 'reopen_ticket'] };

/**
 * One module's tool blocks: each `name:` that is a registered tool (or a `TEMPLATED` template) starts a block that
 * runs to the next one, and the block's events are the quoted registered event types inside it. Text before the
 * first `name:` (shared helpers) belongs to no tool. `\b` keeps `rename: \`…\`` from starting a block.
 */
function blocksOf(text: string, tools: ReadonlySet<string>): { tools: readonly string[]; events: string[] }[] {
  const starts = [...text.matchAll(/\bname: ('[a-z_]+'|`[^`]*`)/g)].flatMap((match) => {
    const raw = match[1]!;
    const named = raw.startsWith("'") ? [raw.slice(1, -1)].filter((name) => tools.has(name)) : (TEMPLATED[raw] ?? [raw]);
    return named.length === 0 ? [] : [{ at: match.index, tools: named }];
  });
  return starts.map((start, index) => {
    const body = text.slice(start.at, starts[index + 1]?.at ?? text.length);
    const types = [...body.matchAll(/'([a-z][a-z-]*\.[a-z_]+)'/g)].map((match) => match[1]!).filter((type) => domainRegistry.hasType(type));
    return { tools: start.tools, events: [...new Set(types)].sort() };
  });
}

describe('27.515–27.516 the D2 audit, MCP side', () => {
  it('27.515 every tool is classified exactly once; control: an unclassified name is reported', () => {
    const names = allTools(fakeSession()).map((tool) => tool.name);
    const classified = (name: string) => Number(name in MCP_WRITE_AUDIT) + Number(MCP_READ_ONLY_TOOLS.includes(name));
    for (const name of names) expect(classified(name), `${name}: ${NEW_TOOL_HINT}`).toBe(1);
    expect([...Object.keys(MCP_WRITE_AUDIT), ...MCP_READ_ONLY_TOOLS].sort()).toEqual([...names].sort());
    expect(classified('a_tool_nobody_wrote')).toBe(0); // control
  });

  it('27.516 under the sweep, a read-only tool never writes and a write tool posts only the events it declares', async () => {
    const postedBy = new Map<string, string[]>();
    for (const tool of allTools(fakeSession())) {
      const entry = SWEEP[tool.name];
      if (entry === undefined) throw new Error(`${tool.name} has no SWEEP entry`);
      const posted: string[] = [];
      let routePosts = 0;
      const base: Session = { ...fakeSession(), ...entry.session };
      const session: Session = {
        ...base,
        postEvents: async (events) => {
          posted.push(...(events as { type: string }[]).map((event) => event.type));
          return base.postEvents(events);
        },
        post: async (path, body) => {
          routePosts += 1;
          return base.post(path, body);
        },
        // add_attachment writes through postMultipart (attachment-tools.ts:39), not post: without this arm,
        // misfiling it as read-only would pass both read-only legs.
        postMultipart: async (path, fields, file) => {
          routePosts += 1;
          return base.postMultipart(path, fields, file);
        },
      };
      const handler = allTools(session).find((t) => t.name === tool.name)!.handler;
      await handler(entry.args); // 14.88 runs every sweep entry to completion the same way (register.test.ts:274-279)
      postedBy.set(tool.name, posted);
      if (MCP_READ_ONLY_TOOLS.includes(tool.name)) {
        expect(posted, `${tool.name} is read-only`).toEqual([]);
        expect(routePosts, `${tool.name} is read-only`).toBe(0);
      } else {
        for (const type of posted) expect(MCP_WRITE_AUDIT[tool.name]!.events, `${tool.name} posted ${type}`).toContain(type);
      }
    }
    // Control: the recorder sees posts, and the D tools' sweep entries DO post (no preview: manage_concept create,
    // tag_items add with before === after, link_concepts add, resolve_suggestion accept), so the "declares" loop
    // above is not a loop over [] for them.
    for (const name of ['create_ticket', 'manage_concept', 'tag_items', 'link_concepts', 'resolve_suggestion']) {
      expect(postedBy.get(name)?.length ?? 0, `${name}'s sweep entry posted nothing`).toBeGreaterThan(0);
    }
  });

  it('27.516 in source, each write tool names exactly the event types its row declares, on every path the sweep does not take', () => {
    // The sweep drives ONE call per tool, so `manage_concept rename` or `manage_members revoke_invite` never posts there.
    // Each tool's block in its module must quote exactly its row's `events` (a templated block: the union of its tools').
    const tools = new Set(allTools(fakeSession()).map((tool) => tool.name));
    const files = readdirSync(TOOLS_DIR).filter((file) => file.endsWith('-tools.ts'));
    expect(files.length).toBeGreaterThan(10); // precondition: the scan reads the tool modules
    const seen: string[] = [];
    for (const file of files) {
      for (const block of blocksOf(readFileSync(new URL(file, TOOLS_DIR), 'utf8'), tools)) {
        seen.push(...block.tools);
        if (block.tools.some((name) => MCP_READ_ONLY_TOOLS.includes(name))) continue;
        const declared = [...new Set(block.tools.flatMap((name) => MCP_WRITE_AUDIT[name]?.events ?? []))].sort();
        expect(block.events, `${file} ${block.tools.join(' + ')}: ${NEW_TOOL_HINT}`).toEqual(declared);
      }
    }
    expect(seen.sort(), 'every registered tool has exactly one block').toEqual([...tools].sort());
    // Control, on the parser: two blocks split at the second name; an unregistered type, a helper before the first
    // name and a `rename: \`…\`` inside a block are not events and start nothing.
    const sample = "'note.created' name: 'x_tool', 'ticket.closed' 'not.a_type' rename: `y` name: 'y_tool' x";
    expect(blocksOf(sample, new Set(['x_tool', 'y_tool']))).toEqual([
      { tools: ['x_tool'], events: ['ticket.closed'] },
      { tools: ['y_tool'], events: [] },
    ]);
  });
});
