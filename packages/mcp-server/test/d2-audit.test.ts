import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { domainRegistry } from '@gisik-nokma/domain';
import { allTools } from '../src/tools/register.js';
import { MCP_READ_ONLY_TOOLS, MCP_WRITE_AUDIT, type WriteAudit } from '../src/tools/write-audit.js';
import type { Session } from '../src/session.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { SWEEP } from './fixtures/tool-sweep.js';

/**
 * Knowledge Graph spec D §7 case 8 (D2), KG-D Task 7. Cases 27.515–27.516: the MCP side of the audit. Every tool is
 * classified once, a read-only tool writes nothing, and a write tool posts only the event types its row in
 * `src/tools/write-audit.ts` declares. 27.670: each row's events partition into its primary act and its `paths`.
 * The server half (`apps/server/test/mcp/d2-audit.test.ts`, 27.517–27.518, 27.671–27.672) judges each row and each
 * path against History, an app surface and a remove path.
 */

const NEW_TOOL_HINT = 'A new MCP tool must be classified in packages/mcp-server/src/tools/write-audit.ts (spec D §7 case 8, D2).';
const EVENTS_HINT = 'its row in packages/mcp-server/src/tools/write-audit.ts must declare exactly the event types this block posts (D2).';

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

/**
 * 27.670's census: the acts that own each of a row's event types (`primary`, or a `paths` name), and each type an
 * act lists that the row's `events` does not. A row without `paths` is one act, so all its events are primary.
 */
function ownersOf(row: WriteAudit): Map<string, string[]> {
  const owners = new Map(row.events.map((type) => [type, [] as string[]]));
  const acts: [string, readonly string[]][] = [
    ['primary', row.paths === undefined ? row.events : (row.primary ?? [])],
    ...Object.entries(row.paths ?? {}).map(([path, act]): [string, readonly string[]] => [path, act.events]),
  ];
  for (const [act, types] of acts) for (const type of types) owners.set(type, [...(owners.get(type) ?? []), act]);
  return owners;
}

/** A row's census failures: a type owned by no act or by two, or an act's type the row's `events` does not list. */
function censusOf(row: WriteAudit): string[] {
  return [...ownersOf(row)]
    .filter(([type, acts]) => acts.length !== 1 || !row.events.includes(type))
    .map(([type, acts]) => `${type}: ${acts.length === 0 ? 'no act' : acts.join(' + ')}${row.events.includes(type) ? '' : ' (not in events)'}`);
}

describe('27.515–27.516, 27.670 the D2 audit, MCP side', () => {
  it('27.515 every tool is classified exactly once; control: an unclassified name is reported', () => {
    const names = allTools(fakeSession()).map((tool) => tool.name);
    const classified = (name: string) => Number(name in MCP_WRITE_AUDIT) + Number(MCP_READ_ONLY_TOOLS.includes(name));
    for (const name of names) expect(classified(name), `${name}: ${NEW_TOOL_HINT}`).toBe(1);
    expect([...Object.keys(MCP_WRITE_AUDIT), ...MCP_READ_ONLY_TOOLS].sort()).toEqual([...names].sort());
    expect(classified('a_tool_nobody_wrote')).toBe(0); // control
  });

  it('27.516 under the sweep, a read-only tool never writes and a write tool posts only the events it declares', async () => {
    /** Runs one tool once on its sweep entry's session, recording every event and every write-route call. */
    const drive = async (name: string, args: Record<string, unknown>) => {
      const posted: string[] = [];
      let routePosts = 0;
      const base: Session = { ...fakeSession(), ...SWEEP[name]?.session };
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
        // add_attachment uploads through postMultipart (attachment-tools.ts:39), not post, then posts attachment.added,
        // so the `posted` leg catches it misfiled today; this arm catches a tool that would only upload.
        postMultipart: async (path, fields, file) => {
          routePosts += 1;
          return base.postMultipart(path, fields, file);
        },
      };
      await allTools(session).find((t) => t.name === name)!.handler(args); // 14.88 runs every sweep entry to completion the same way (register.test.ts:274-279)
      return { posted, routePosts };
    };
    const postedBy = new Map<string, string[]>();
    for (const tool of allTools(fakeSession())) {
      const entry = SWEEP[tool.name];
      if (entry === undefined) throw new Error(`${tool.name} has no SWEEP entry`);
      const { posted, routePosts } = await drive(tool.name, entry.args);
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
    // Paths the sweep's one call per tool does not take, each a call that POSTS (control: it posted). close/reopen
    // share one templated block, where the source leg below can only check the union, so their comments run here.
    const EXTRA: [string, Record<string, unknown>][] = [
      ['close_ticket', { workspaceId: 'w', ticketId: 't', comment: 'Done.' }],
      ['reopen_ticket', { workspaceId: 'w', ticketId: 't', comment: 'Again.' }],
      ['manage_concept', { action: 'rename', conceptId: 'c', name: 'D' }],
      ['manage_concept', { action: 'describe', conceptId: 'c', summary: 'S' }],
      ['manage_concept', { action: 'delete', conceptId: 'c', confirm_name: 'C' }],
      ['tag_items', { conceptId: 'c', action: 'remove', items: [{ kind: 'ticket', id: 't' }] }],
      ['link_concepts', { conceptId: 'c', otherId: 'd', relation: 'related', action: 'remove' }],
      ['resolve_suggestion', { workspaceId: 'w', suggestionId: 's', action: 'reject' }],
    ];
    for (const [name, args] of EXTRA) {
      const { posted } = await drive(name, args);
      expect(posted.length, `${name} ${JSON.stringify(args)} posted nothing`).toBeGreaterThan(0);
      for (const type of posted) expect(MCP_WRITE_AUDIT[name]!.events, `${name} posted ${type}`).toContain(type);
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
        expect(block.events, `${file} ${block.tools.join(' + ')}: ${EVENTS_HINT}`).toEqual(declared);
      }
    }
    expect(seen.sort(), 'every registered tool has exactly one block').toEqual([...tools].sort());
    // Control, on the parser: two blocks split at the second name; an unregistered type, a helper before the first
    // name, a quoted name that is no tool and a `rename: \`…\`` inside a block are not events and start nothing.
    const sample = "'note.created' name: 'x_tool', 'ticket.closed' 'not.a_type' name: 'not_a_tool', 'comment.added' rename: `y` name: 'y_tool' x";
    expect(blocksOf(sample, new Set(['x_tool', 'y_tool']))).toEqual([
      { tools: ['x_tool'], events: ['comment.added', 'ticket.closed'] },
      { tools: ['y_tool'], events: [] },
    ]);
  });

  it('27.670 every row\'s events partition into the primary act and its paths, no type in two; control: a type moved into two paths is reported', () => {
    const withPaths = Object.entries(MCP_WRITE_AUDIT).filter(([, row]) => row.paths !== undefined);
    expect(withPaths.length).toBeGreaterThan(5); // precondition: the census has branch rows to read
    for (const [tool, row] of Object.entries(MCP_WRITE_AUDIT)) {
      expect(censusOf(row), `${tool}: each event type is owned by the primary act or by exactly one path`).toEqual([]);
      if (row.paths !== undefined) expect(row.primary, `${tool} has paths, so it names its primary events`).toBeDefined();
    }
    // The census reads the paths: update_ticket's branches own their types, the fields own the rest.
    const ticket = MCP_WRITE_AUDIT['update_ticket']!;
    expect(Object.fromEntries(ownersOf(ticket))).toEqual({
      'ticket.field_set': ['primary'],
      'ticket.reparented': ['reparent'],
      'ticket.collaborator_added': ['collaborators'],
      'ticket.collaborator_removed': ['collaborators'],
      'ticket.workflow_rebound': ['workflow'],
    });
    // Controls, on in-test copies of that row: a type in two paths, a type no act owns, a type in primary and a path,
    // and a path type the row's events do not list are each reported.
    const paths = ticket.paths!;
    expect(censusOf({ ...ticket, paths: { ...paths, workflow: { ...paths['workflow']!, events: ['ticket.workflow_rebound', 'ticket.reparented'] } } }))
      .toEqual(['ticket.reparented: reparent + workflow']);
    expect(censusOf({ ...ticket, primary: [] })).toEqual(['ticket.field_set: no act']);
    expect(censusOf({ ...ticket, primary: ['ticket.field_set', 'ticket.reparented'] })).toEqual(['ticket.reparented: primary + reparent']);
    expect(censusOf({ ...ticket, paths: { ...paths, reparent: { ...paths['reparent']!, events: ['ticket.reparented', 'ticket.ranked'] } } }))
      .toEqual(['ticket.ranked: reparent (not in events)']);
  });
});
