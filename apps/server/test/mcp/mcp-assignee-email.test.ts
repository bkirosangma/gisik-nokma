import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { canSee } from '../../src/visibility/can-see.js';
import { callTool } from './helpers/door-matrix.js';
import { buildEmailWorld, type EmailWorld, type Person } from './helpers/email-world.js';
import { event, mustCommit } from './helpers/sweep2.js';

/**
 * MCP sweep 2 T7, hosted half of cases 14.640-14.642, 14.645-14.650 and 14.652 (the package half is `assignee-email.test.ts`).
 * Every call is a `tools/call` on `POST /mcp` against the real app and database. Run LOCALLY.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

type Reply = Record<string, unknown>;
type Preview = { preview: boolean; wouldChange: string; person: { userId: string; name: string; inWorkspace: boolean }; joinsAsGuest: boolean; confirm: string };
const MISS = 'No user with that email. Someone you can already see in this workspace is assigned with assigneeId (find their userId with list_members).';

type HRow = {
  tool: 'assign_ticket' | 'create_ticket';
  claim: 'ticket.assigned' | 'ticket.created';
  args(w: EmailWorld, email: string, extra?: Reply): Reply;
  /** The ticket the committed reply is about. */
  ticketOf(w: EmailWorld, reply: Reply): string;
  /** Make the SERVER refuse the claim after call 1: returns the extra arguments call 2 must carry. */
  sabotage(w: EmailWorld): Promise<Reply>;
};
export const HROWS: HRow[] = [
  {
    tool: 'assign_ticket', claim: 'ticket.assigned',
    args: (w, email, extra = {}) => ({ workspaceId: w.workspaceId, ticketId: w.ticketId, assignee_email: email, ...extra }),
    ticketOf: (w) => w.ticketId,
    // The ticket is soft-deleted between the calls; call 2 does not read it, so the engine's refusal is what comes back.
    sabotage: async (w) => {
      await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'ticket', id: w.ticketId }, 'ticket.deleted', {})]);
      return {};
    },
  },
  {
    tool: 'create_ticket', claim: 'ticket.created',
    args: (w, email, extra = {}) => ({ workspaceId: w.workspaceId, projectId: w.projectId, typeId: 'task', title: `Born assigned ${email}`, assignee_email: email, ...extra }),
    ticketOf: (_w, reply) => reply['ticketId'] as string,
    // call 2 names a type that does not exist: the engine refuses the creation (the confirmation is the userId only, so the other arguments may differ).
    sabotage: async () => ({ typeId: 'no-such-type' }),
  },
];

const ask = (w: EmailWorld, who: Person, row: HRow, email: string, extra: Reply = {}) => callTool(w.app, who.token, row.tool, row.args(w, email, extra));
const roleOf = async (w: EmailWorld, userId: string): Promise<string | null> =>
  (await w.db.pool.query<{ role: string }>(`SELECT role FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`, [w.workspaceId, userId])).rows[0]?.role ?? null;
const membershipLedger = async (w: EmailWorld, userId: string) =>
  (await w.db.pool.query<{ type: string; origin: string; actor_id: string }>(
    `SELECT type, origin, actor_id FROM events WHERE workspace_id = $1 AND entity_kind = 'membership' AND entity_id = $2 ORDER BY workspace_seq`, [w.workspaceId, `${w.workspaceId}:${userId}`])).rows;
const claimsOn = async (w: EmailWorld, ticketId: string, type: string) =>
  (await w.db.pool.query<{ origin: string; actor_id: string; payload: { assigneeId?: string } }>(
    `SELECT origin, actor_id, payload FROM events WHERE entity_id = $1 AND type = $2 ORDER BY workspace_seq`, [ticketId, type])).rows;
const assigneeOf = async (w: EmailWorld, ticketId: string) =>
  (await w.db.pool.query<{ assignee_id: string | null }>(`SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1`, [ticketId])).rows[0]?.assignee_id ?? null;

describe('assignee_email through the hosted door', () => {
  it('14.640 call 1 for an outsider says they WILL BE ADDED AS A GUEST and adds nobody: the roster has no new membership afterwards', async () => {
    for (const [i, row] of HROWS.entries()) {
      const w = await buildEmailWorld(db, `2640${i}`);
      const out = await w.outsider(`out-640-${row.tool}@example.test`);
      const preview = await ask(w, w.owner, row, out.email!);
      expect(preview.isError, preview.text).toBe(false);
      expect((preview.json as unknown as Preview)).toMatchObject({ preview: true, joinsAsGuest: true, person: { userId: out.userId, inWorkspace: false } });
      expect((preview.json as unknown as Preview).wouldChange).toContain('WILL BE ADDED AS A GUEST');
      expect(await roleOf(w, out.userId)).toBeNull();
      expect(await membershipLedger(w, out.userId)).toEqual([]);
      // CONTROL, same `it`: a member of the workspace is previewed as already in.
      const inside = await w.outsider(`in-640-${row.tool}@example.test`);
      await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'membership', id: `${w.workspaceId}:${inside.userId}` }, 'membership.granted', { userId: inside.userId, role: 'member' })]);
      expect(((await ask(w, w.owner, row, inside.email!)).json as unknown as Preview)).toMatchObject({ joinsAsGuest: false, person: { inWorkspace: true } });
    }
  });

  it('14.641 call 2 for a person in the workspace commits ONE claim with origin mcp and the caller as actor, and adds no membership', async () => {
    for (const [i, row] of HROWS.entries()) {
      const w = await buildEmailWorld(db, `2641${i}`);
      const asha = await w.outsider(`asha-641-${row.tool}@example.test`);
      await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'membership', id: `${w.workspaceId}:${asha.userId}` }, 'membership.granted', { userId: asha.userId, role: 'member' })]);
      const preview = (await ask(w, w.owner, row, asha.email!)).json as unknown as Preview;
      const done = await ask(w, w.owner, row, asha.email!, { confirm_assignee: preview.person.userId });
      expect(done.isError, done.text).toBe(false);
      const ticketId = row.ticketOf(w, done.json as Reply);
      const claims = await claimsOn(w, ticketId, row.claim);
      expect(claims.at(-1)).toMatchObject({ origin: 'mcp', actor_id: w.owner.userId });
      expect(claims.at(-1)!.payload.assigneeId).toBe(asha.userId);
      expect(await assigneeOf(w, ticketId)).toBe(asha.userId);
      expect((await membershipLedger(w, asha.userId)).map((m) => m.type)).toEqual(['membership.granted']); // only the setup's own grant
    }
  });

  it('14.642 call 2 for an outsider grants a GUEST membership (origin server, the caller as actor) and then commits the claim (origin mcp); the guest sees that ticket only', async () => {
    for (const [i, row] of HROWS.entries()) {
      const w = await buildEmailWorld(db, `2642${i}`);
      const out = await w.outsider(`out-642-${row.tool}@example.test`);
      const preview = (await ask(w, w.member, row, out.email!)).json as unknown as Preview; // a MEMBER may pull an outsider in (`routes/people.ts:168-170`: any member, not only an admin)
      const done = await ask(w, w.member, row, out.email!, { confirm_assignee: preview.person.userId });
      expect(done.isError, done.text).toBe(false);
      const ticketId = row.ticketOf(w, done.json as Reply);
      expect(await roleOf(w, out.userId)).toBe('guest');
      expect(await membershipLedger(w, out.userId)).toEqual([{ type: 'membership.granted', origin: 'server', actor_id: w.member.userId }]);
      expect((await claimsOn(w, ticketId, row.claim)).at(-1)).toMatchObject({ origin: 'mcp', actor_id: w.member.userId });
      expect(await assigneeOf(w, ticketId)).toBe(out.userId);
      expect(await canSee(db.pool, out.userId, ticketId)).toBe(true);
      expect(await canSee(db.pool, out.userId, w.secondTicketId)).toBe(false); // CONTROL: only that ticket
    }
  });

  it('14.645 four different reasons for "no such person" are answered with the same sentence: an unknown address, an unverified account, a synthetic phone address, and an address held by two case-variant accounts', async () => {
    for (const [i, row] of HROWS.entries()) {
      const w = await buildEmailWorld(db, `2645${i}`);
      const unverified = await w.outsider(`unverified-645-${row.tool}@example.test`);
      await db.pool.query(`UPDATE "user" SET "emailVerified" = false WHERE id = $1`, [unverified.userId]);
      const phoneEmail = (await db.pool.query<{ email: string }>(`SELECT "email" FROM "user" WHERE id = $1`, [w.stranger.userId])).rows[0]!.email;
      await db.pool.query(`UPDATE "user" SET "emailVerified" = true WHERE id = $1`, [w.stranger.userId]); // verified on purpose: only the synthetic-address guard may answer null (6.207)
      await w.outsider(`twin-645-${row.tool}@example.test`);
      const second = await w.outsider(`twin2-645-${row.tool}@example.test`);
      await db.pool.query(`UPDATE "user" SET "email" = $2 WHERE id = $1`, [second.userId, `Twin-645-${row.tool}@Example.test`]);
      for (const [label, email] of [['unknown', `nobody-645-${row.tool}@example.test`], ['unverified', unverified.email!], ['synthetic', phoneEmail], ['case twins', `twin-645-${row.tool}@example.test`]] as const) {
        const miss = await ask(w, w.owner, row, email);
        expect(miss.isError, label).toBe(true);
        expect(miss.text, label).toBe(MISS);
    }
    // CONTROL, same `it`: a verified, unique address resolves.
    const real = await w.outsider(`real-645-${row.tool}@example.test`);
    expect(((await ask(w, w.owner, row, real.email!)).json as unknown as Preview).person.userId).toBe(real.userId);
    }
  });

  it('14.646 a guest caller gets the workspace sentence from the lookup; a stranger is stopped one step earlier by the ticket read; a member is not refused', async () => {
    const w = await buildEmailWorld(db, '2646');
    const row = HROWS[0]!;
    const target = await w.outsider('target-646@example.test');
    // The guest must be able to READ the ticket to reach the lookup at all: assign it to them first.
    await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'ticket', id: w.ticketId }, 'ticket.assigned', { assigneeId: w.guest.userId })]);
    const guest = await ask(w, w.guest, row, target.email!);
    expect(guest.isError).toBe(true);
    expect(guest.text).toBe('workspace not found or not visible to you');
    const stranger = await ask(w, w.stranger, row, target.email!);
    expect(stranger.isError).toBe(true);
    expect(stranger.text).toBe('ticket not found or not visible to you');
    expect((await ask(w, w.member, row, target.email!)).isError).toBe(false); // CONTROL
  });

  it('14.647 a refusal after confirmation is the server\'s words (never "answered 422"); after a refused outsider assignment no guest membership remains', async () => {
    for (const [i, row] of HROWS.entries()) {
      for (const outsider of [false, true]) {
        const w = await buildEmailWorld(db, `2647${i}${outsider ? 1 : 0}`);
        const who = await w.outsider(`who-647-${row.tool}-${outsider}@example.test`);
        if (!outsider) await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'membership', id: `${w.workspaceId}:${who.userId}` }, 'membership.granted', { userId: who.userId, role: 'member' })]);
        const preview = (await ask(w, w.member, row, who.email!)).json as unknown as Preview;
        // Precondition: call 1 resolved THIS person on the arm under test, so call 2 below is a confirmed write, not a fresh preview.
        expect(preview).toMatchObject({ preview: true, joinsAsGuest: outsider, person: { userId: who.userId } });
        const extra = await row.sabotage(w);
        const refused = await ask(w, w.member, row, who.email!, { confirm_assignee: preview.person.userId, ...extra });
        expect(refused.isError, `${row.tool} outsider=${outsider}`).toBe(true);
        expect(refused.text).toMatch(/^refused by [\w.-]+: .+/);
        expect(refused.text).not.toContain('answered 422');
        if (outsider) {
          expect(await roleOf(w, who.userId)).toBeNull();
          expect((await membershipLedger(w, who.userId)).map((m) => m.type)).toEqual(['membership.granted', 'membership.revoked']); // the compensation
        }
        // CONTROL, same `it`: the same confirmation against a target the sabotage did not touch commits (assign: the second
        // ticket; create: the ordinary arguments, without the sabotage's extra).
        const untouched = row.tool === 'assign_ticket' ? { ticketId: w.secondTicketId } : {};
        const control = await ask(w, w.member, row, who.email!, { confirm_assignee: preview.person.userId, ...untouched });
        expect(control.isError, `${row.tool} outsider=${outsider} control: ${control.text}`).toBe(false);
      }
    }
  });

  it('14.648 when the lookup budget is spent the assistant is told in a sentence, not "answered 429"', async () => {
    const security = { webOrigin: null, trustProxy: false, rateLimit: { authMax: 1000, eventsMax: 1000, inviteMax: 1, mcpMax: 1000, signInMax: 1000, windowSec: 60 } };
    const w = await buildEmailWorld(db, '2648', { security });
    const row = HROWS[0]!;
    const target = await w.outsider('target-648@example.test');
    expect((await ask(w, w.owner, row, target.email!)).isError).toBe(false); // the one lookup the budget allows
    const second = await ask(w, w.owner, row, target.email!);
    expect(second.isError).toBe(true);
    expect(second.text).toMatch(/^Looking people up by email is rate limited right now\. Wait about \d+ seconds? and call this again; nothing was changed\.$/);
  });

  it('14.649 the address is trimmed and case-folded by the route: " ASHA@Example.TEST " resolves to the same person, and the confirmation (a userId) is unaffected', async () => {
    for (const [i, row] of HROWS.entries()) {
      const w = await buildEmailWorld(db, `2649${i}`);
      const asha = await w.outsider(`asha-649-${row.tool}@example.test`);
      const padded = ((await ask(w, w.owner, row, ` ASHA-649-${row.tool}@Example.TEST `)).json as unknown as Preview);
      expect(padded.person.userId).toBe(asha.userId);
      const done = await ask(w, w.owner, row, `asha-649-${row.tool}@example.test`, { confirm_assignee: padded.person.userId });
      expect(done.isError, done.text).toBe(false);
    }
  });

  it('14.650 the assignment is in the ticket\'s History as the assistant\'s, assign_ticket with assigneeId null removes it, and the guest membership stays', async () => {
    const w = await buildEmailWorld(db, '2650');
    const row = HROWS[0]!;
    const out = await w.outsider('out-650@example.test');
    const preview = (await ask(w, w.owner, row, out.email!)).json as unknown as Preview;
    const assigned = await ask(w, w.owner, row, out.email!, { confirm_assignee: preview.person.userId });
    expect(assigned.isError, assigned.text).toBe(false);
    const history = (await callTool(w.app, w.owner.token, 'get_ticket_history', { ticketId: w.ticketId })).json as { events: Array<{ type: string; origin: string }> };
    expect(history.events.find((e) => e.type === 'ticket.assigned')).toMatchObject({ origin: 'mcp' });
    expect(await assigneeOf(w, w.ticketId)).toBe(out.userId); // precondition: the unassign below has something to remove
    expect(await roleOf(w, out.userId)).toBe('guest'); // precondition: the grant the unassign must leave alone
    const removed = await callTool(w.app, w.owner.token, 'assign_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId, assigneeId: null });
    expect(removed.isError, removed.text).toBe(false);
    expect(await assigneeOf(w, w.ticketId)).toBeNull();
    expect(await roleOf(w, out.userId)).toBe('guest'); // unassigning does not undo the grant (as in the app)
  });

  it('14.652 a person who is already a guest is shown as already in the workspace, and assigning them grants nothing a second time', async () => {
    for (const [i, row] of HROWS.entries()) {
      const w = await buildEmailWorld(db, `2652${i}`);
      const guest = await w.outsider(`guest-652-${row.tool}@example.test`);
      await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'membership', id: `${w.workspaceId}:${guest.userId}` }, 'membership.granted', { userId: guest.userId, role: 'guest' })]);
      const preview = (await ask(w, w.owner, row, guest.email!)).json as unknown as Preview;
      expect(preview).toMatchObject({ joinsAsGuest: false, person: { inWorkspace: true } });
      expect(preview.wouldChange).not.toContain('ADDED AS A GUEST');
      const done = await ask(w, w.owner, row, guest.email!, { confirm_assignee: preview.person.userId });
      expect(done.isError, done.text).toBe(false);
      expect((await membershipLedger(w, guest.userId)).map((m) => m.type)).toEqual(['membership.granted']); // the setup's own grant, no second one, no demotion
      expect(await roleOf(w, guest.userId)).toBe('guest');
    }
  });
});

describe('create_ticket by email through the hosted door', () => {
  const CREATE = (): HRow => HROWS.find((r) => r.tool === 'create_ticket')!;
  const ticketCount = async (w: EmailWorld) => Number((await w.db.pool.query(`SELECT count(*) AS n FROM proj_tickets WHERE project_id = $1`, [w.projectId])).rows[0].n);
  const eventTotal = async (w: EmailWorld) => Number((await w.db.pool.query(`SELECT count(*) AS n FROM events WHERE workspace_id = $1`, [w.workspaceId])).rows[0].n);

  it('14.654 call 1 for an outsider creates no ticket and appends no event; the project\'s tickets and the ledger are unchanged', async () => {
    const w = await buildEmailWorld(db, '26540');
    const out = await w.outsider('out-654@example.test');
    const before = { tickets: await ticketCount(w), events: await eventTotal(w) };
    const preview = await ask(w, w.member, CREATE(), out.email!);
    expect((preview.json as unknown as Preview)).toMatchObject({ preview: true, joinsAsGuest: true });
    expect({ tickets: await ticketCount(w), events: await eventTotal(w) }).toEqual(before);
    // CONTROL, same `it`: call 2 creates exactly one ticket.
    await ask(w, w.member, CREATE(), out.email!, { confirm_assignee: out.userId });
    expect(await ticketCount(w)).toBe(before.tickets + 1);
  });

  it('14.655 the created ticket is assigned to the resolved person from birth, in both arms, and the guest sees it', async () => {
    const w = await buildEmailWorld(db, '26550');
    const inside = await w.outsider('inside-655@example.test');
    await mustCommit(w.app, w.owner, [event(w.workspaceId, w.owner, { kind: 'membership', id: `${w.workspaceId}:${inside.userId}` }, 'membership.granted', { userId: inside.userId, role: 'member' })]);
    const a = await ask(w, w.owner, CREATE(), inside.email!, { confirm_assignee: inside.userId });
    expect(a.isError, a.text).toBe(false);
    const aId = (a.json as { ticketId: string }).ticketId;
    expect(await assigneeOf(w, aId)).toBe(inside.userId);
    const out = await w.outsider('out-655@example.test');
    const b = await ask(w, w.member, CREATE(), out.email!, { confirm_assignee: out.userId });
    expect(b.isError, b.text).toBe(false);
    const bId = (b.json as { ticketId: string }).ticketId;
    expect(await assigneeOf(w, bId)).toBe(out.userId);
    expect(await roleOf(w, out.userId)).toBe('guest');
    expect(await canSee(db.pool, out.userId, bId)).toBe(true);
    expect(await canSee(db.pool, out.userId, aId)).toBe(false); // CONTROL: only the ticket they were born onto
  });

  it('14.656 a refusal after confirmation (an unknown ticket type; a project the caller is not in) is the server\'s words, creates nothing, and leaves no guest membership; the ledger shows the grant taken back', async () => {
    const w = await buildEmailWorld(db, '26560');
    const out = await w.outsider('out-656@example.test');
    const before = await ticketCount(w);
    const badType = await ask(w, w.member, CREATE(), out.email!, { confirm_assignee: out.userId, typeId: 'no-such-type' });
    expect(badType.isError).toBe(true);
    expect(badType.text).toMatch(/^refused by [\w.-]+: .+/);
    expect(badType.text).not.toContain('answered 422');
    // A second project the member is NOT on.
    const other = newUlid();
    await mustCommit(w.app, w.owner, [
      event(w.workspaceId, w.owner, { kind: 'project', id: other }, 'project.created', { name: 'Closed room' }),
      event(w.workspaceId, w.owner, { kind: 'project', id: other }, 'project.member_added', { userId: w.owner.userId, projectAdmin: true }),
    ]);
    const notOn = await ask(w, w.member, CREATE(), out.email!, { confirm_assignee: out.userId, projectId: other });
    expect(notOn.isError, 'if the server lets a workspace member create in a project they are not on, say so in the HANDOFF and drop this arm: the unknown-type arm above already owns the claim').toBe(true);
    expect(await ticketCount(w)).toBe(before);
    expect(await roleOf(w, out.userId)).toBeNull();
    const ledger = (await membershipLedger(w, out.userId)).map((m) => m.type);
    expect(ledger.length).toBeGreaterThanOrEqual(2); // the unknown-type arm reaches the engine AFTER the grant
    expect(ledger.filter((t) => t === 'membership.granted')).toHaveLength(ledger.filter((t) => t === 'membership.revoked').length); // every grant was taken back
    expect(ledger.at(-1)).toBe('membership.revoked');
    // CONTROL, same `it`: the same confirmation with the ordinary arguments creates.
    const ok = await ask(w, w.member, CREATE(), out.email!, { confirm_assignee: out.userId });
    expect(ok.isError, ok.text).toBe(false);
    expect(await ticketCount(w)).toBe(before + 1);
  });
});
