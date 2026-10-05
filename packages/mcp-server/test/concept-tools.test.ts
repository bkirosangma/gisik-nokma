import { describe, expect, it } from 'vitest';
import { CONCEPT_SUMMARY_MAX, domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { conceptTools } from '../src/tools/concept-tools.js';
import { allTools } from '../src/tools/register.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { TOOL_NAMES } from './fixtures/tool-names.js';

/**
 * Knowledge Graph spec D §5.1–§5.2, KG-D Task 4: the MCP concept tools over a fake Session (the shape of
 * `member-admin-tools.test.ts`): `get` answers by path from a map and logs it, `postEvents` records each batch and
 * answers `committed` (or the result a case gives it). Cases 27.474–27.479; the real server is 27.480–27.481
 * (`apps/server/test/mcp/concept-tools-e2e.test.ts`).
 *
 * The merge and the related link follow the planner's R1 ruling (2026-10-05), which superseded the plan's shapes:
 * a merge posts D's missing tags then the merge, in one batch; a related link goes on the lower id.
 */
/** ULIDs, because `accepted` parses every posted envelope as the door would; C < D < E, so R1's lower id is C. */
const WS = '01J0WS000000000000000000AA';
const C = '01J0CC000000000000000000CC';
const D = '01J0CD000000000000000000DD';
const E = '01J0CE000000000000000000EE';
const view = (id: string, name: string, items: Array<{ kind: 'ticket' | 'note'; id: string }>) => ({
  id,
  name,
  summary: '',
  itemCount: items.length,
  createdBy: 'u',
  origin: 'web',
  workspaceId: WS,
  createdAt: '2026-10-05T10:00:00.000Z',
  fromSuggestion: null,
  items: items.map((item) => ({ ...item, label: item.id, taggedBy: 'u', taggedAt: '2026-10-05T10:00:00.000Z', origin: 'web' })),
  links: [],
});
const T1 = { kind: 'ticket' as const, id: 't1' };
const T2 = { kind: 'ticket' as const, id: 't2' };
const N3 = { kind: 'note' as const, id: 'n3' };
const AUDIENCE = `/v1/workspaces/${WS}/concepts/audience?conceptId=${C}&add=ticket%3At2&add=note%3An3`;
const ROUTES: Record<string, unknown> = {
  [`/v1/concepts/${C}`]: view(C, 'Scroll', [T1, T2, N3]),
  [`/v1/concepts/${D}`]: view(D, 'Phones', [T2]),
  [`/v1/concepts/${E}`]: view(E, 'Part', [T2]),
  [AUDIENCE]: { conceptId: C, members: 9, before: 6, after: 3 },
};

type Batch = Array<Record<string, unknown>>;
type Fake = { session: Session; batches: Batch[]; gets: string[] };

function fake(routes: Record<string, unknown> = ROUTES, result?: unknown): Fake {
  const batches: Batch[] = [];
  const gets: string[] = [];
  const session: Session = {
    userId: () => '01J0A5ER0000000000000000AA',
    get: async (path) => {
      gets.push(path);
      if (!(path in routes)) throw new HttpError(404, { error: 'not_found' });
      return routes[path];
    },
    post: async () => {
      throw new Error('post is not stubbed in this test');
    },
    postEvents: async (events) => {
      batches.push(events as Batch);
      return result ?? { results: events.map(() => ({ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-05T10:00:00.000Z' })) };
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

/** The domain accepts the envelope as a real event (payload shape, entity kind, origin). */
function accepted(envelope: Record<string, unknown> | undefined): void {
  const parsed = parseEvent({ ...envelope, serverTime: '2026-10-05T10:00:00.000Z', seq: 1 }, domainRegistry);
  if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
}
/** One posted event as the case reads it. */
const shape = (event: Record<string, unknown>) => ({ entity: event['entity'], type: event['type'], payload: event['payload'] });
const refusedBy = (rule: string, reason: string) => ({ results: [{ status: 'refused', eventId: 'e', rule, reason }] });

describe('27.474 list_concepts and get_concept read the routes', () => {
  it('27.474 the exact paths, the paging, the body; a 404 is the one sentence; control: `item` is encoded onto the path', async () => {
    const concepts = [view('c1', 'A', []), view('c2', 'B', []), view('c3', 'C', [])].map(({ id, name, summary, itemCount, createdBy, origin }) => ({
      id, name, summary, itemCount, createdBy, origin,
    }));
    const f = fake({ '/v1/workspaces/w/concepts': { workspaceId: 'w', concepts }, '/v1/workspaces/w/concepts?item=ticket%3At': { workspaceId: 'w', concepts: [] }, ...ROUTES });
    const first = await tool('list_concepts', f.session).handler({ workspaceId: 'w', limit: 2 });
    expect(first).toEqual({ workspaceId: 'w', concepts: concepts.slice(0, 2), nextCursor: '2' });
    const second = await tool('list_concepts', f.session).handler({ workspaceId: 'w', limit: 2, cursor: '2' });
    expect(second).toEqual({ workspaceId: 'w', concepts: concepts.slice(2), nextCursor: null });
    expect(f.gets).toEqual(['/v1/workspaces/w/concepts', '/v1/workspaces/w/concepts']);
    expect(await tool('get_concept', f.session).handler({ conceptId: C })).toEqual(ROUTES[`/v1/concepts/${C}`]);
    expect(f.gets.at(-1)).toBe(`/v1/concepts/${C}`);
    await expect(tool('get_concept', f.session).handler({ conceptId: '01J0CX000000000000000000XX' })).rejects.toThrowError(/^concept not found or not visible to you$/);
    await expect(tool('list_concepts', f.session).handler({ workspaceId: 'v' })).rejects.toThrowError(/^concept not found or not visible to you$/);
    // Control: `item` reaches the path encoded.
    await tool('list_concepts', f.session).handler({ workspaceId: 'w', item: { kind: 'ticket', id: 't' } });
    expect(f.gets.at(-1)).toBe('/v1/workspaces/w/concepts?item=ticket%3At');
    expect(f.batches).toEqual([]);
  });
});

describe('27.475 manage_concept', () => {
  it('27.475 create, rename and describe post at once; delete and merge preview until confirm_name; a confirmed merge posts the target\'s missing tags then the merge, in one batch', async () => {
    const f = fake();
    const manage = tool('manage_concept', f.session);
    await manage.handler({ action: 'create', workspaceId: WS, name: 'Scroll' });
    await manage.handler({ action: 'create', workspaceId: WS, name: 'Scroll' });
    await manage.handler({ action: 'create', workspaceId: WS, name: 'Notes', summary: 'About phones' });
    const created = f.batches.map((batch) => batch[0] as Record<string, unknown>);
    expect(f.batches.map((batch) => batch.length)).toEqual([1, 1, 1]);
    for (const event of created) {
      expect(event['type']).toBe('concept.created');
      expect(event['origin']).toBe('mcp');
      expect((event['entity'] as { kind: string; id: string }).kind).toBe('concept');
      expect((event['entity'] as { id: string }).id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      accepted(event);
    }
    expect((created[0]?.['entity'] as { id: string }).id).not.toBe((created[1]?.['entity'] as { id: string }).id);
    expect(created.map((event) => event['payload'])).toEqual([{ name: 'Scroll' }, { name: 'Scroll' }, { name: 'Notes', summary: 'About phones' }]);

    f.batches.length = 0;
    await manage.handler({ action: 'rename', conceptId: C, name: 'Scrolls' });
    await manage.handler({ action: 'describe', conceptId: C, summary: '' });
    expect(f.batches.map((batch) => batch.map(shape))).toEqual([
      [{ entity: { kind: 'concept', id: C }, type: 'concept.renamed', payload: { name: 'Scrolls' } }],
      [{ entity: { kind: 'concept', id: C }, type: 'concept.described', payload: { summary: '' } }],
    ]);
    for (const batch of f.batches) accepted(batch[0]);

    // delete: a preview, nothing posted, until the exact name.
    f.batches.length = 0;
    const deletePreview = {
      preview: true,
      wouldChange: 'Deletes the concept "Scroll".',
      counts: { items: 3 },
      nothingChanged: true,
      confirm: 'confirm_name must be "Scroll"',
    };
    expect(await manage.handler({ action: 'delete', conceptId: C })).toEqual(deletePreview);
    expect(await manage.handler({ action: 'delete', conceptId: C, confirm_name: 'scroll' })).toEqual(deletePreview);
    expect(f.batches).toEqual([]);
    await manage.handler({ action: 'delete', conceptId: C, confirm_name: 'Scroll' });
    expect(f.batches.map((batch) => batch.map(shape))).toEqual([[{ entity: { kind: 'concept', id: C }, type: 'concept.deleted', payload: {} }]]);

    // merge: the same, then the R1 sequence. c holds t1, t2, n3; d holds t2.
    f.batches.length = 0;
    const mergePreview = {
      preview: true,
      wouldChange: 'Merges "Scroll" into "Phones"; its items move and "Scroll" is deleted.',
      counts: { items: 3 },
      nothingChanged: true,
      confirm: 'confirm_name must be "Scroll"',
    };
    expect(await manage.handler({ action: 'merge', conceptId: C, intoId: D })).toEqual(mergePreview);
    expect(await manage.handler({ action: 'merge', conceptId: C, intoId: D, confirm_name: 'Phones' })).toEqual(mergePreview);
    expect(f.batches).toEqual([]);
    await manage.handler({ action: 'merge', conceptId: C, intoId: D, confirm_name: 'Scroll' });
    expect(f.batches.map((batch) => batch.map(shape))).toEqual([
      [
        { entity: { kind: 'concept', id: D }, type: 'concept.item_tagged', payload: { itemKind: 'ticket', itemId: 't1' } },
        { entity: { kind: 'concept', id: D }, type: 'concept.item_tagged', payload: { itemKind: 'note', itemId: 'n3' } },
        { entity: { kind: 'concept', id: C }, type: 'concept.merged', payload: { intoId: D } },
      ],
    ]);
    for (const event of f.batches[0] ?? []) accepted(event);
    // Control: a concept whose items the target already holds merges with no tag at all.
    f.batches.length = 0;
    await manage.handler({ action: 'merge', conceptId: E, intoId: D, confirm_name: 'Part' });
    expect(f.batches.map((batch) => batch.map(shape))).toEqual([[{ entity: { kind: 'concept', id: E }, type: 'concept.merged', payload: { intoId: D } }]]);
  });

  it('27.475 a missing argument is named before anything is read or posted; control: the same call with it posts', async () => {
    const f = fake();
    const manage = tool('manage_concept', f.session);
    await expect(manage.handler({ action: 'create', name: 'Ledgers' })).rejects.toThrowError(/^create needs workspaceId and name$/);
    await expect(manage.handler({ action: 'create', workspaceId: WS })).rejects.toThrowError(/^create needs workspaceId and name$/);
    for (const action of ['rename', 'describe', 'merge', 'delete']) {
      await expect(manage.handler({ action })).rejects.toThrowError(new RegExp(`^${action} needs conceptId$`));
    }
    expect([f.gets, f.batches]).toEqual([[], []]);
    await expect(manage.handler({ action: 'rename', conceptId: C })).rejects.toThrowError(/^rename needs name$/);
    await expect(manage.handler({ action: 'describe', conceptId: C })).rejects.toThrowError(/^describe needs summary$/);
    await expect(manage.handler({ action: 'merge', conceptId: C, confirm_name: 'Scroll' })).rejects.toThrowError(/^merge needs intoId$/);
    expect(f.batches).toEqual([]);
    // Control: each with its argument posts.
    await manage.handler({ action: 'describe', conceptId: C, summary: 'Old scrolls' });
    expect(f.batches.map((batch) => batch.map(shape))).toEqual([[{ entity: { kind: 'concept', id: C }, type: 'concept.described', payload: { summary: 'Old scrolls' } }]]);
  });

  it('27.475 a refusal in the merge comes back in the server\'s words, with its index', async () => {
    const f = fake(ROUTES, { results: [
      { status: 'committed', eventId: 'e1', seq: 1, serverTime: '2026-10-05T10:00:00.000Z' },
      { status: 'committed', eventId: 'e2', seq: 2, serverTime: '2026-10-05T10:00:00.000Z' },
      { status: 'refused', eventId: 'e3', rule: 'concept.merge-incomplete', reason: 'One item in this concept is not yet in the concept it merges into. Add it there first.' },
    ] });
    await expect(tool('manage_concept', f.session).handler({ action: 'merge', conceptId: C, intoId: D, confirm_name: 'Scroll' })).rejects.toThrowError(
      /^event 2 refused by concept\.merge-incomplete: One item in this concept is not yet in the concept it merges into\. Add it there first\.$/,
    );
  });

  it('27.475 a summary over 2000 characters is refused before anything is read or posted; control: exactly 2000 posts', async () => {
    // The tool's own bound, pinned as a literal (reviewer B P11 X4: max 2000 → 20000 survived); the domain agrees.
    expect(CONCEPT_SUMMARY_MAX).toBe(2000);
    const f = fake();
    const manage = tool('manage_concept', f.session);
    await expect(manage.handler({ action: 'describe', conceptId: C, summary: 'x'.repeat(2001) })).rejects.toThrowError();
    await expect(manage.handler({ action: 'create', workspaceId: WS, name: 'Ledgers', summary: 'x'.repeat(2001) })).rejects.toThrowError();
    expect([f.gets, f.batches]).toEqual([[], []]);
    // Control, same it: at the cap it posts, and the domain accepts the event.
    await manage.handler({ action: 'describe', conceptId: C, summary: 'x'.repeat(2000) });
    expect(f.batches.map((batch) => batch.map((event) => event['type']))).toEqual([['concept.described']]);
    accepted(f.batches[0]?.[0]);
  });
});

describe('27.476 tag_items that narrows the audience (Review Focus 5)', () => {
  it('27.476 no or a wrong confirm_name answers the preview and posts nothing; the right one posts both tags in ONE batch; control: the audience path', async () => {
    const f = fake();
    const tag = tool('tag_items', f.session);
    const args = { conceptId: C, action: 'add', items: [T2, N3] };
    const preview = {
      preview: true,
      wouldChange: 'Fewer people will see this concept: 3 of 9 members',
      counts: { members: 9, before: 6, after: 3 },
      nothingChanged: true,
      confirm: 'confirm_name must be "Scroll"',
    };
    expect(await tag.handler(args)).toEqual(preview);
    expect(await tag.handler({ ...args, confirm_name: 'Scroll ' })).toEqual(preview);
    expect(f.batches).toEqual([]);
    await tag.handler({ ...args, confirm_name: 'Scroll' });
    expect(f.batches.map((batch) => batch.map(shape))).toEqual([
      [
        { entity: { kind: 'concept', id: C }, type: 'concept.item_tagged', payload: { itemKind: 'ticket', itemId: 't2' } },
        { entity: { kind: 'concept', id: C }, type: 'concept.item_tagged', payload: { itemKind: 'note', itemId: 'n3' } },
      ],
    ]);
    for (const event of f.batches[0] ?? []) accepted(event);
    // Control, same it: the audience was asked at exactly this path, once per call.
    expect(f.gets.filter((path) => path.includes('/audience'))).toEqual([AUDIENCE, AUDIENCE, AUDIENCE]);
  });
});

describe('27.477 tag_items without narrowing, remove, refusals', () => {
  it('27.477 an add that narrows nothing posts at once; remove never reads the audience; refusals are the server\'s words', async () => {
    const even = fake({ ...ROUTES, [AUDIENCE]: { conceptId: C, members: 9, before: 6, after: 6 } });
    await tool('tag_items', even.session).handler({ conceptId: C, action: 'add', items: [T2, N3] });
    expect(even.batches.map((batch) => batch.map((event) => event['type']))).toEqual([['concept.item_tagged', 'concept.item_tagged']]);

    const remove = fake();
    await tool('tag_items', remove.session).handler({ conceptId: C, action: 'remove', items: [T2, N3] });
    expect(remove.gets).toEqual([`/v1/concepts/${C}`]);
    expect(remove.batches.map((batch) => batch.map(shape))).toEqual([
      [
        { entity: { kind: 'concept', id: C }, type: 'concept.item_untagged', payload: { itemKind: 'ticket', itemId: 't2' } },
        { entity: { kind: 'concept', id: C }, type: 'concept.item_untagged', payload: { itemKind: 'note', itemId: 'n3' } },
      ],
    ]);
    for (const event of remove.batches[0] ?? []) accepted(event);

    const refused = fake({ ...ROUTES, [AUDIENCE]: { conceptId: C, members: 9, before: 6, after: 6 } }, refusedBy('concept.already-tagged', 'That item is already in this concept.'));
    await expect(tool('tag_items', refused.session).handler({ conceptId: C, action: 'add', items: [T2, N3] })).rejects.toThrowError(
      /^event 0 refused by concept\.already-tagged: That item is already in this concept\.$/,
    );
    // The audience route's 404 (the concept, or an item the caller cannot see): one sentence, nothing posted.
    const hidden = fake({ [`/v1/concepts/${C}`]: ROUTES[`/v1/concepts/${C}`] });
    await expect(tool('tag_items', hidden.session).handler({ conceptId: C, action: 'add', items: [T2, N3] })).rejects.toThrowError(
      /^concept or item not found or not visible to you$/,
    );
    expect(hidden.batches).toEqual([]);
  });

  it('27.477 tag_items takes 1 to 50 items: none, or 51, is refused before anything is read or posted; control: exactly 50 posts one batch', async () => {
    // Reviewer B P11 X2 (max 50 → 500) and X5 (min 1 → 0) survived without this leg. `remove`, so no audience is read.
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'ticket' as const, id: `t${String(i)}` }));
    const f = fake();
    const tag = tool('tag_items', f.session);
    await expect(tag.handler({ conceptId: C, action: 'remove', items: [] })).rejects.toThrowError();
    await expect(tag.handler({ conceptId: C, action: 'remove', items: items(51) })).rejects.toThrowError();
    expect([f.gets, f.batches]).toEqual([[], []]);
    // Control, same it: at the cap it reads the concept and posts all fifty in ONE batch.
    await tag.handler({ conceptId: C, action: 'remove', items: items(50) });
    expect(f.gets).toEqual([`/v1/concepts/${C}`]);
    expect(f.batches.map((batch) => batch.length)).toEqual([50]);
  });
});

describe('27.478 link_concepts', () => {
  it('27.478 broader posts on conceptId as asked; related posts on the LOWER id whichever way round; add and remove; a refusal is the server\'s words', async () => {
    const f = fake();
    const link = tool('link_concepts', f.session);
    await link.handler({ conceptId: C, otherId: D, relation: 'broader', action: 'add' });
    await link.handler({ conceptId: D, otherId: C, relation: 'broader', action: 'remove' });
    await link.handler({ conceptId: C, otherId: D, relation: 'related', action: 'add' });
    await link.handler({ conceptId: D, otherId: C, relation: 'related', action: 'remove' });
    expect(f.batches.map((batch) => batch.map(shape))).toEqual([
      [{ entity: { kind: 'concept', id: C }, type: 'concept.linked', payload: { otherId: D, relation: 'broader' } }],
      [{ entity: { kind: 'concept', id: D }, type: 'concept.unlinked', payload: { otherId: C, relation: 'broader' } }],
      [{ entity: { kind: 'concept', id: C }, type: 'concept.linked', payload: { otherId: D, relation: 'related' } }],
      // R1 (a): asked from d, posted on c, the lower id.
      [{ entity: { kind: 'concept', id: C }, type: 'concept.unlinked', payload: { otherId: D, relation: 'related' } }],
    ]);
    for (const batch of f.batches) accepted(batch[0]);
    const refused = fake(ROUTES, refusedBy('concept.self', 'A concept cannot be linked to itself.'));
    await expect(tool('link_concepts', refused.session).handler({ conceptId: C, otherId: C, relation: 'related', action: 'add' })).rejects.toThrowError(
      /^refused by concept\.self: A concept cannot be linked to itself\.$/,
    );
  });
});

describe('27.479 the registry', () => {
  it('27.479 the five concept tools follow similar, the fixture agrees, and each description names its confirm rule where it has one', () => {
    const tools = allTools(fake().session);
    const names = tools.map((t) => t.name);
    // The registry ENDED here until KG-D T5 appended its two suggestion tools after `link_concepts` (27.500).
    const from = names.indexOf('list_deleted');
    expect(names.slice(from, from + 7)).toEqual(['list_deleted', 'similar', 'list_concepts', 'get_concept', 'manage_concept', 'tag_items', 'link_concepts']);
    expect(TOOL_NAMES).toEqual(names);
    const describe = (name: string) => tools.find((t) => t.name === name)?.description ?? '';
    expect(describe('manage_concept')).toContain('confirm_name');
    expect(describe('manage_concept')).toContain('merge and delete');
    expect(describe('manage_concept')).toContain('An item in the trash when its concept is merged is not carried: after a restore it is in neither concept.');
    expect(describe('tag_items')).toContain('confirm_name');
    expect(describe('tag_items')).toContain('Fewer people will see this concept');
    expect(describe('link_concepts')).not.toContain('confirm_name');
    expect(describe('link_concepts')).toContain('Link two concepts'); // control: it is the link tool's description
  });
});
