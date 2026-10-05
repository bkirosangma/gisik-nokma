import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allTools } from '@gisik-nokma/mcp-server';
import { newSubmittedEvent } from '@gisik-nokma/domain';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Drafts plan, Task 7. Cases 28.142-28.145, against the REAL server: the real `buildApp`, real auth, a real HOSTED token
 * (the door an assistant uses), the real ledger. The unit cases 28.130-28.141 are in
 * `packages/mcp-server/test/draft-tools.test.ts`.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const OUTER = { ip: '198.51.100.9', xff: undefined };
type Run = (name: string, args: Record<string, unknown>) => Promise<unknown>;

async function world(phone: string) {
  const { app, otp } = buildOAuthApp(db);
  await app.ready();
  const owner = await signInWithPhone(app, otp, phone);
  // A real HOSTED access token, exactly what `/mcp` resolves, as in `in-process-fetch.test.ts` 14.317.
  const as = async (userId: string): Promise<Run> => {
    const session = hostedSession(app, OUTER, await hostedToken(app, db.pool, userId), userId);
    await session.ready();
    const tools = allTools(session);
    return async (name, args) => {
      const t = tools.find((x) => x.name === name);
      if (t === undefined) throw new Error(`no tool ${name} - the hosted door must list every draft tool`);
      return t.handler(args);
    };
  };
  const run = await as(owner.userId);
  // The workspace prefix is PINNED: a key is `${workspacePrefix}${projectPrefix}-${n}` (`packages/domain/src/prefix.ts:293-295`), so
  // without it the derived `DB` would make the keys `DBRP-n`, never the bare `RP-n`.
  const { workspaceId } = (await run('create_workspace', { name: 'Drafts by Claude', prefix: 'DR' })) as { workspaceId: string };
  const { projectId } = (await run('create_project', { workspaceId, name: 'Repairs', description: 'Fix list', prefix: 'RP' })) as {
    projectId: string;
  };
  // The workspace's own types: the shallowest takes a top-level ticket, the next one a child.
  const types = ((await run('list_ticket_types', { workspaceId })) as { ticketTypes: Array<{ id: string; rank: number }> }).ticketTypes
    .slice()
    .sort((x, y) => x.rank - y.rank);
  const top = types[0]?.id as string;
  const sub = types[1]?.id as string;

  /** A draft through the tool, as the given assistant. */
  const draft = async (who: Run, title: string, parentId?: string) =>
    (await who('create_ticket', {
      workspaceId, projectId, typeId: parentId === undefined ? top : sub, title, draft: true, ...(parentId === undefined ? {} : { parentId }),
    })) as { ticketId: string; draft: boolean; key: string | null };
  const titles = async (who: Run) =>
    ((await who('list_my_drafts', { workspaceId })) as { items: Array<{ title: string }> }).items.map((i) => i.title).sort();
  return { app, otp, owner, ownerToken: owner.token, as, run, workspaceId, projectId, draft, titles };
}

async function eventually(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the condition never held within 5 s');
}

describe('28.142 a draft\'s life through the hosted door', () => {
  it('28.142 create (no key) -> list -> read -> publish parent then child (DRRP-1, DRRP-2) -> discard behind a preview, then gone', async () => {
    const w = await world('+911100002842');
    const parent = await w.draft(w.run, 'Quarterly stock count');
    expect(parent).toMatchObject({ draft: true, key: null });
    const child = await w.draft(w.run, 'Count the cold room', parent.ticketId);

    const listed = (await w.run('list_my_drafts', { workspaceId: w.workspaceId })) as {
      items: Array<{ ticketId: string; title: string; projectName: string; parentId: string | null }>;
    };
    expect(listed.items.map((i) => [i.title, i.projectName, i.parentId]).sort()).toEqual([
      ['Count the cold room', 'Repairs', parent.ticketId],
      ['Quarterly stock count', 'Repairs', null],
    ]);
    expect(await w.run('get_ticket', { workspaceId: w.workspaceId, ticketId: parent.ticketId })).toMatchObject({ draft: true, key: null });

    expect(await w.run('publish_draft', { workspaceId: w.workspaceId, ticketId: parent.ticketId })).toEqual({
      ticketId: parent.ticketId, key: 'DRRP-1', published: true,
    });
    expect(await w.titles(w.run)).toEqual(['Count the cold room']); // the list shrank
    expect(await w.run('publish_draft', { workspaceId: w.workspaceId, ticketId: child.ticketId })).toEqual({
      ticketId: child.ticketId, key: 'DRRP-2', published: true,
    });
    expect(await w.titles(w.run)).toEqual([]);
    const published = await w.run('get_ticket', { workspaceId: w.workspaceId, ticketId: parent.ticketId });
    expect(published).toMatchObject({ key: 'DRRP-1' });
    expect('draft' in (published as object)).toBe(false); // CONTROL: published, so no draft member

    const created = await db.pool.query(
      `SELECT origin, actor_id FROM events WHERE workspace_id = $1 AND type = 'ticket.created'`,
      [w.workspaceId],
    );
    expect(created.rows).toHaveLength(2);
    expect(created.rows.every((r) => r.origin === 'mcp' && r.actor_id === w.owner.userId)).toBe(true);
    const publishedRows = await db.pool.query(
      `SELECT origin, actor_id FROM events WHERE workspace_id = $1 AND type = 'ticket.published'`,
      [w.workspaceId],
    );
    expect(publishedRows.rows).toHaveLength(2);
    expect(publishedRows.rows.every((r) => r.origin === 'mcp' && r.actor_id === w.owner.userId)).toBe(true);

    // Discard: a draft with a sub-draft, a preview that names both, then the exact title.
    const doomed = await w.draft(w.run, 'Throwaway plan');
    await w.draft(w.run, 'Throwaway step', doomed.ticketId);
    const preview = await w.run('discard_draft', { workspaceId: w.workspaceId, ticketId: doomed.ticketId });
    expect(preview).toMatchObject({
      preview: true,
      wouldChange: 'Erases the draft "Throwaway plan", 1 sub-drafts and 0 attachments uploaded to them (permanently deleted). Linked notes are kept. This cannot be undone.',
      counts: { subDrafts: 1, attachments: 0 },
      nothingChanged: true,
    });
    expect(await w.titles(w.run)).toEqual(['Throwaway plan', 'Throwaway step']); // the preview changed nothing
    expect(await w.run('discard_draft', { workspaceId: w.workspaceId, ticketId: doomed.ticketId, confirm_name: 'Throwaway plan' })).toEqual({
      ticketId: doomed.ticketId, discarded: true,
    });
    await eventually(async () => (await w.titles(w.run)).length === 0);
    await expect(w.run('get_ticket', { workspaceId: w.workspaceId, ticketId: doomed.ticketId })).rejects.toThrow(
      'ticket not found or not visible to you',
    );
    await w.app.close();
  });
});

describe('28.143 nobody else\'s assistant', () => {
  it('28.143 the owner\'s assistant cannot list, read, publish or discard a member\'s draft; it is still the author\'s', async () => {
    const w = await world('+911100002843');
    const member = await signInWithPhone(w.app, w.otp, '+911100002844');
    await seedMember(db.pool, w.workspaceId, member.userId, 'member', [{ projectId: w.projectId }]);
    const asMember = await w.as(member.userId);
    const mine = await w.draft(asMember, 'Ask the supplier about the freezer');
    expect(await w.titles(asMember)).toEqual(['Ask the supplier about the freezer']);

    expect(await w.titles(w.run)).toEqual([]); // the owner's list is empty
    await expect(w.run('get_ticket', { workspaceId: w.workspaceId, ticketId: mine.ticketId })).rejects.toThrow(
      'ticket not found or not visible to you',
    );
    const NOT_VISIBLE = 'refused by permission.visibility: This ticket is not visible to you.';
    await expect(w.run('publish_draft', { workspaceId: w.workspaceId, ticketId: mine.ticketId })).rejects.toThrow(NOT_VISIBLE);
    // The same words for an id that does not exist at all: the refusal is no oracle for what a draft is.
    await expect(w.run('publish_draft', { workspaceId: w.workspaceId, ticketId: '01J0DRFT00000000000000ZZ99' })).rejects.toThrow(NOT_VISIBLE);
    await expect(
      w.run('discard_draft', { workspaceId: w.workspaceId, ticketId: mine.ticketId, confirm_name: 'Ask the supplier about the freezer' }),
    ).rejects.toThrow('ticket not found or not visible to you');

    // CONTROL, same `it`: the attempts changed nothing - it is still the author's draft.
    expect(await w.titles(asMember)).toEqual(['Ask the supplier about the freezer']);
    expect(await asMember('get_ticket', { workspaceId: w.workspaceId, ticketId: mine.ticketId })).toMatchObject({ draft: true, key: null });
    await w.app.close();
  });
});

describe('28.144 a refused publish passes through and changes nothing', () => {
  it('28.144 a sub-draft cannot publish before its parent; both stay drafts; then it can', async () => {
    const w = await world('+911100002845');
    const parent = await w.draft(w.run, 'Open the new shop');
    const child = await w.draft(w.run, 'Paint the sign', parent.ticketId);

    await expect(w.run('publish_draft', { workspaceId: w.workspaceId, ticketId: child.ticketId })).rejects.toThrow(
      /^refused by draft\.parent-unpublished: /,
    );
    expect(await w.titles(w.run)).toEqual(['Open the new shop', 'Paint the sign']); // nothing published

    // CONTROL: parent first, then the same call succeeds.
    await w.run('publish_draft', { workspaceId: w.workspaceId, ticketId: parent.ticketId });
    expect(await w.run('publish_draft', { workspaceId: w.workspaceId, ticketId: child.ticketId })).toMatchObject({ published: true });
    await w.app.close();
  });
});

describe('28.145 the other tools on a draft, through the real server', () => {
  it('28.145 update and assign work; a comment is refused in G1\'s words; delete is refused with the discard pointer', async () => {
    const w = await world('+911100002846');
    const mine = await w.draft(w.run, 'Order shelving');
    const target = { workspaceId: w.workspaceId, ticketId: mine.ticketId };

    await w.run('update_ticket', { ...target, title: 'Order the shelving' });
    // `assign_ticket` takes a person's id (only `create_ticket` reads "me"), so the caller's own.
    await w.run('assign_ticket', { ...target, assigneeId: w.owner.userId });
    expect(await w.titles(w.run)).toEqual(['Order the shelving']);

    await expect(w.run('add_comment', { ...target, text: 'Quote is in' })).rejects.toThrow(
      /^refused by draft\.not-allowed: A draft cannot be .*Publish it first, or discard it\.$/,
    );
    const DELETE = 'refused by draft.not-allowed: A draft cannot be deleted. Discard it instead.';
    // The tool's early refusal and the server's own answer are the same words (decision 7).
    await expect(w.run('delete_ticket', { ...target })).rejects.toThrow(DELETE);
    const server = await w.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${w.ownerToken}` },
      payload: {
        events: [
          newSubmittedEvent({
            workspaceId: w.workspaceId,
            entity: { kind: 'ticket', id: mine.ticketId },
            type: 'ticket.deleted',
            payload: {},
            actorId: w.owner.userId,
            origin: 'web',
          }),
        ],
      },
    });
    expect((server.json() as { results: unknown[] }).results[0]).toMatchObject({
      status: 'refused', rule: 'draft.not-allowed', reason: 'A draft cannot be deleted. Discard it instead.',
    });
    await expect(w.run('delete_ticket', { ...target, confirm_name: mine.ticketId })).rejects.toThrow(DELETE);

    // CONTROL: the draft is intact and still the author's.
    expect(await w.run('get_ticket', target)).toMatchObject({ draft: true });
    await w.app.close();
  });
});
