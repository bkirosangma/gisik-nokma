import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent, type SuggestionView } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { conceptTools } from '../src/tools/concept-tools.js';
import { allTools } from '../src/tools/register.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { TOOL_NAMES } from './fixtures/tool-names.js';

/**
 * Knowledge Graph spec D §4.2/§5.2 (KG-D Task 5): `review_suggestions` and `resolve_suggestion` on a fake session, cases
 * 27.498 and 27.500 (`test-cases/27-knowledge-graph.md` §27.D). The real server's half is
 * `apps/server/test/mcp/suggestion-e2e.test.ts` (27.499). Ids are ULIDs and hashes are `itemHash`-shaped, because
 * `accepted` parses every posted envelope as the door would.
 */
const WS = '01J0WS000000000000000000AA';
const ACTOR = '01J0A5ER0000000000000000AA';
const item = (kind: 'ticket' | 'note', id: string) => ({ kind, id, label: id });
const suggestion = (id: string, items: SuggestionView['items']): SuggestionView => ({
  id,
  label: 'licence · renewal',
  terms: ['licence', 'renewal'],
  score: 0.9,
  computedAt: '2026-10-05T10:00:00.000Z',
  signature: `${id.slice(-2).toLowerCase()}${'0'.repeat(62)}`,
  itemHashes: items.map((_, index) => `${String(index)}${'a'.repeat(31)}`),
  items,
});
const S = suggestion('01J0SG000000000000000000AB', [
  item('ticket', '01J0TK000000000000000000T1'),
  item('note', '01J0NT000000000000000000N2'),
  item('ticket', '01J0TK000000000000000000T3'),
]);
const OTHERS = [suggestion('01J0SG000000000000000000CD', [item('ticket', '01J0TK000000000000000000T4')]), suggestion('01J0SG000000000000000000EF', [])];
const PATH = `/v1/workspaces/${WS}/suggestions`;

type Batch = Array<Record<string, unknown>>;
function fake(results?: (events: Batch) => unknown): { session: Session; batches: Batch[]; gets: string[] } {
  const batches: Batch[] = [];
  const gets: string[] = [];
  const session: Session = {
    userId: () => ACTOR,
    get: async (path) => {
      gets.push(path);
      if (path !== PATH) throw new HttpError(404, { error: 'not_found' });
      return { workspaceId: WS, suggestions: [S, ...OTHERS] };
    },
    post: async () => {
      throw new Error('post is not stubbed in this test');
    },
    postEvents: async (events) => {
      batches.push(events as Batch);
      return results?.(events as Batch) ?? { results: (events as Batch).map(() => ({ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-05T10:00:00.000Z' })) };
    },
    ...NO_TRANSFER,
  };
  return { session, batches, gets };
}
function tool(name: string, session: Session) {
  const found = conceptTools(session).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
}
function accepted(envelope: Record<string, unknown> | undefined): void {
  const parsed = parseEvent({ ...envelope, serverTime: '2026-10-05T10:00:00.000Z', seq: 1 }, domainRegistry);
  if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
}
const shape = (event: Record<string, unknown>) => ({ entity: event['entity'], type: event['type'], payload: event['payload'], origin: event['origin'] });

describe('27.498 review_suggestions and resolve_suggestion', () => {
  it('27.498 review GETs the route and pages; accept posts ONE batch on one new concept; reject posts the hashes on the workspace; control: accept without a name posts nothing', async () => {
    const f = fake();
    const first = await tool('review_suggestions', f.session).handler({ workspaceId: WS, limit: 2 });
    expect(first).toEqual({ workspaceId: WS, suggestions: [S, OTHERS[0]], nextCursor: '2' });
    expect(f.gets).toEqual([PATH]);

    await tool('resolve_suggestion', f.session).handler({ workspaceId: WS, suggestionId: S.id, action: 'accept', name: 'Licences' });
    expect(f.batches).toHaveLength(1);
    const [batch] = f.batches as [Batch];
    for (const event of batch) accepted(event);
    const conceptId = (batch[0]?.['entity'] as { id: string }).id;
    expect(batch.map(shape)).toEqual([
      { entity: { kind: 'concept', id: conceptId }, type: 'concept.created', payload: { name: 'Licences', fromSuggestion: S.id }, origin: 'mcp' },
      ...S.items.map((it) => ({ entity: { kind: 'concept', id: conceptId }, type: 'concept.item_tagged', payload: { itemKind: it.kind, itemId: it.id }, origin: 'mcp' })),
    ]);
    expect(batch).toHaveLength(4);
    expect(new Set(batch.map((event) => event['actorId']))).toEqual(new Set([ACTOR]));

    await tool('resolve_suggestion', f.session).handler({ workspaceId: WS, suggestionId: S.id, action: 'reject' });
    expect(f.batches).toHaveLength(2);
    accepted(f.batches[1]?.[0]);
    expect(f.batches[1]?.map(shape)).toEqual([
      { entity: { kind: 'workspace', id: WS }, type: 'workspace.concept_suggestion_rejected', payload: { signature: S.signature, itemHashes: S.itemHashes }, origin: 'mcp' },
    ]);

    await expect(tool('resolve_suggestion', f.session).handler({ workspaceId: WS, suggestionId: '01J0SG000000000000000000ZZ', action: 'reject' })).rejects.toThrowError(
      /^suggestion not found or not visible to you$/,
    );
    await expect(tool('review_suggestions', f.session).handler({ workspaceId: '01J0WS000000000000000000ZZ' })).rejects.toThrowError(
      /^workspace not found or not visible to you$/,
    );
    // Control: an accept without a name is refused before anything is posted.
    await expect(tool('resolve_suggestion', f.session).handler({ workspaceId: WS, suggestionId: S.id, action: 'accept' })).rejects.toThrowError(/^accept needs name$/);
    expect(f.batches).toHaveLength(2);
  });

  it('27.498 the batch is not atomic: a refused tag at index 2 throws its index while the concept stays made, and the description says so', async () => {
    const f = fake((events) => ({
      results: events.map((_, index) =>
        index === 2
          ? { status: 'refused', eventId: 'e', rule: 'concept.item-unknown', reason: 'That ticket or note does not exist or you cannot see it.' }
          : { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-05T10:00:00.000Z' },
      ),
    }));
    await expect(tool('resolve_suggestion', f.session).handler({ workspaceId: WS, suggestionId: S.id, action: 'accept', name: 'Licences' })).rejects.toThrowError(
      /^event 2 refused by concept\.item-unknown: That ticket or note does not exist or you cannot see it\.$/,
    );
    expect(f.batches).toHaveLength(1);
    expect(tool('resolve_suggestion', f.session).description).toContain('the concept is still made');
  });
});

describe('27.500 the two tools follow link_concepts', () => {
  it('27.500 TOOL_NAMES and allTools hold review_suggestions then resolve_suggestion directly after link_concepts', () => {
    const names = allTools(fake().session).map((t) => t.name);
    const at = names.indexOf('link_concepts');
    expect(at).toBeGreaterThan(-1);
    expect(names[at + 1]).toBe('review_suggestions');
    expect(names[at + 2]).toBe('resolve_suggestion');
    expect(TOOL_NAMES.slice(TOOL_NAMES.indexOf('link_concepts'), TOOL_NAMES.indexOf('link_concepts') + 3)).toEqual(['link_concepts', 'review_suggestions', 'resolve_suggestion']);
    expect(names).toEqual(TOOL_NAMES);
  });
});
