import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * R3 (server) — `/actor-names` labels a blank name by the verified email,
 * names a FORMER member (`removed: true`), and serves a GUEST only the people
 * on the tickets they can see. Cases 6.245–6.250.
 *
 * Its own file and its own database, not the read-only world of
 * `builder-reads.test.ts`: these cases need a guest on an explicit list, a
 * member who is revoked and one who is re-granted, and a second workspace —
 * all of which are ledger writes that world keeps to the end of its file.
 * Accounts are made the product's way (`signInWithEmail` through the real
 * magic-link door), and people join through a real invitation.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

type Caller = { userId: string; email: string; phone: string | null; headers: { authorization: string } };
let n = 0;

async function person(name: string | null): Promise<Caller> {
  const email = `p${n++}-${newUlid().toLowerCase()}@example.test`;
  const u = await signInWithEmail(app, magic, email);
  await db.pool.query('UPDATE "user" SET "name" = $1 WHERE "id" = $2', [name ?? '', u.userId]);
  return { userId: u.userId, email, phone: null, headers: { authorization: `Bearer ${u.token}` } };
}

async function phonePerson(name: string): Promise<Caller> {
  n += 1;
  const phone = `+9190017${String(n).padStart(5, '0')}`;
  const u = await signInWithPhone(app, otp, phone);
  await db.pool.query('UPDATE "user" SET "name" = $1 WHERE "id" = $2', [name, u.userId]);
  return { userId: u.userId, email: '', phone, headers: { authorization: `Bearer ${u.token}` } };
}

const post = (caller: Caller, url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, headers: caller.headers, payload: payload as Record<string, unknown> });
const get = (caller: Caller, ws: string, path: string) =>
  app.inject({ method: 'GET', url: `/v1/workspaces/${ws}${path}`, headers: caller.headers });

async function found(owner: Caller): Promise<string> {
  const res = await post(owner, '/v1/workspaces', { name: 'Convenience Corner' });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

/**
 * Joins `who` at `role` the way the product does: an admin's invitation, accepted
 * BY THE ACCOUNT IT NAMES (its own email, or its own phone) — so this helper
 * survives the link-acceptance rule (R4), which refuses any other account.
 */
async function join(owner: Caller, ws: string, who: Caller, role: 'admin' | 'member' | 'guest'): Promise<void> {
  const invite =
    who.phone === null ? { address: who.email, channel: 'email' } : { address: who.phone, channel: 'phone' };
  const minted = await post(owner, `/v1/workspaces/${ws}/invites`, { ...invite, role });
  expect(minted.statusCode, minted.body).toBe(201);
  const token = (minted.json() as { url: string }).url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
  const accepted = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: who.headers });
  expect(accepted.statusCode, accepted.body).toBe(200);
}

function ev(ws: string, actorId: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent {
  return { id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId, origin: 'web', clientTime: new Date().toISOString() };
}

async function submit(caller: Caller, events: SubmittedEvent[]) {
  const res = await post(caller, '/v1/events', { events });
  return (res.json() as { results: Array<{ status: string; reason?: string }> }).results;
}

async function revoke(owner: Caller, ws: string, who: Caller): Promise<void> {
  const [r] = await submit(owner, [
    ev(ws, owner.userId, { kind: 'membership', id: membershipId(ws, who.userId) }, 'membership.revoked', { userId: who.userId }),
  ]);
  expect(r?.status, JSON.stringify(r)).toBe('committed');
}

async function projectOf(owner: Caller, ws: string): Promise<string> {
  const id = newUlid();
  const [r] = await submit(owner, [ev(ws, owner.userId, { kind: 'project', id }, 'project.created', { name: 'Stock' })]);
  expect(r?.status, JSON.stringify(r)).toBe('committed');
  return id;
}

/** A ticket `by` creates, born assigned to `assignee`, made explicit to `listed` (`by` files every event). */
async function listedTicket(by: Caller, ws: string, prj: string, assignee: Caller | null, listed: string[]): Promise<string> {
  const id = newUlid();
  const [c, v] = await submit(by, [
    ev(ws, by.userId, { kind: 'ticket', id }, 'ticket.created', {
      typeId: 'task',
      projectId: prj,
      parentId: null,
      title: 'Count the till',
      ...(assignee === null ? {} : { assigneeId: assignee.userId }),
    }),
    ev(ws, by.userId, { kind: 'ticket', id }, 'visibility.set', { ticketId: id, mode: 'explicit', userIds: listed }),
  ]);
  expect(c?.status, JSON.stringify(c)).toBe('committed');
  expect(v?.status, JSON.stringify(v)).toBe('committed');
  return id;
}

type Names = { userId: string; displayName: string; removed?: true }[];
async function namesFor(caller: Caller, ws: string): Promise<Names> {
  const res = await get(caller, ws, '/actor-names');
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { names: Names }).names;
}

describe('6.245–6.250 R3 — actor-names labels, former members, guest scope', () => {
  it('6.245 a blank-name member is served by email; CONTROL: a named member by name', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const named = await person('Rina Marak');
    const blank = await person(null);
    const spaces = await person('   ');
    await join(owner, ws, named, 'member');
    await join(owner, ws, blank, 'member');
    await join(owner, ws, spaces, 'member');
    const names = await namesFor(owner, ws);
    expect(names.find((x) => x.userId === named.userId)?.displayName).toBe('Rina Marak'); // control
    expect(names.find((x) => x.userId === blank.userId)?.displayName).toBe(blank.email);
    expect(names.find((x) => x.userId === spaces.userId)?.displayName).toBe(spaces.email);
  });

  it('6.246 a phone-signed member is NOT served, blank name or named; CONTROL: an email member is', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const emailed = await person('Mika Sangma');
    const phoneNamed = await phonePerson('Tengsim');
    const phoneBlank = await phonePerson('');
    for (const who of [emailed, phoneNamed, phoneBlank]) await join(owner, ws, who, 'member');
    const ids = (await namesFor(owner, ws)).map((x) => x.userId);
    expect(ids).toContain(emailed.userId); // control
    expect(ids).not.toContain(phoneNamed.userId);
    expect(ids).not.toContain(phoneBlank.userId);
  });

  it('6.247 a former member is served with removed:true; CONTROL: a current member carries no `removed` key, and a re-granted one is current', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const current = await person('Cara Current');
    const former = await person('Fern Former');
    const formerBlank = await person(null);
    const back = await person('Bea Back');
    for (const who of [current, former, formerBlank, back]) await join(owner, ws, who, 'member');
    for (const who of [former, formerBlank, back]) await revoke(owner, ws, who);
    await join(owner, ws, back, 'member'); // granted, revoked, granted again → current

    const names = await namesFor(owner, ws);
    const by = (c: Caller) => names.find((x) => x.userId === c.userId);
    expect(by(current)).toEqual({ userId: current.userId, displayName: 'Cara Current' }); // control: no `removed` key at all
    expect(Object.keys(by(current)!)).not.toContain('removed');
    expect(by(former)).toEqual({ userId: former.userId, displayName: 'Fern Former', removed: true });
    expect(by(formerBlank)).toEqual({ userId: formerBlank.userId, displayName: formerBlank.email, removed: true });
    expect(by(back)).toEqual({ userId: back.userId, displayName: 'Bea Back' });
  });

  it('6.248 a guest is named only the people on their tickets; CONTROL: /members still 404s for them', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const prj = await projectOf(owner, ws);
    const creator = await person('Cara Creator');
    const assignee = await person('Asha Assignee');
    const bystander = await person('Bo Bystander');
    const guest = await person('Gita Guest');
    for (const who of [creator, assignee, bystander]) await join(owner, ws, who, 'member');
    await join(owner, ws, guest, 'guest');
    await listedTicket(creator, ws, prj, assignee, [creator.userId, assignee.userId, guest.userId]);

    const res = await get(guest, ws, '/actor-names');
    expect(res.statusCode, res.body).toBe(200);
    const ids = (res.json() as { names: { userId: string }[] }).names.map((x) => x.userId).sort();
    expect(ids).toEqual([creator.userId, assignee.userId].sort());
    // CONTROL: the roster is still closed to this guest.
    const roster = await get(guest, ws, '/members');
    expect(roster.statusCode).toBe(404);
    expect(roster.json()).toEqual(READ_NOT_FOUND_BODY);
    // A stranger still gets the shared 404 on the names route itself.
    const stranger = await person('Sam Stranger');
    const refused = await get(stranger, ws, '/actor-names');
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual(READ_NOT_FOUND_BODY);
    // A member reads the whole workspace (unchanged).
    expect((await namesFor(bystander, ws)).map((x) => x.userId)).toContain(bystander.userId);
  });

  it('6.249 the guest’s names follow visibility NOW; CONTROL: a second ticket still on their list keeps its people', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const prj = await projectOf(owner, ws);
    const cara = await person('Cara One');
    const asha = await person('Asha One');
    const dev = await person('Dev Two');
    const eli = await person('Eli Two');
    const guest = await person('Gita Guest');
    for (const who of [cara, asha, dev, eli]) await join(owner, ws, who, 'member');
    await join(owner, ws, guest, 'guest');
    const t1 = await listedTicket(cara, ws, prj, asha, [cara.userId, asha.userId, guest.userId]);
    await listedTicket(dev, ws, prj, eli, [dev.userId, eli.userId, guest.userId]);
    const idsOf = async () => (await namesFor(guest, ws)).map((x) => x.userId).sort();
    expect(await idsOf()).toEqual([cara.userId, asha.userId, dev.userId, eli.userId].sort());

    // The guest comes off t1's list.
    const [r] = await submit(cara, [
      ev(ws, cara.userId, { kind: 'ticket', id: t1 }, 'visibility.set', { ticketId: t1, mode: 'explicit', userIds: [cara.userId, asha.userId] }),
    ]);
    expect(r?.status, JSON.stringify(r)).toBe('committed');
    expect(await idsOf()).toEqual([dev.userId, eli.userId].sort()); // t1's people are gone; t2's stay
  });

  it('6.250 a person of ANOTHER workspace and a person nobody here granted are never served; CONTROL: this workspace’s members are', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const prj = await projectOf(owner, ws);
    const mine = await person('Mina Mine');
    const guest = await person('Gita Guest');
    await join(owner, ws, mine, 'member');
    await join(owner, ws, guest, 'guest');
    await listedTicket(mine, ws, prj, null, [mine.userId, guest.userId]);

    const otherOwner = await person('Olive Other');
    const otherWs = await found(otherOwner);
    const otherFormer = await person('Fay Elsewhere');
    await join(otherOwner, otherWs, otherFormer, 'member');
    await revoke(otherOwner, otherWs, otherFormer);
    const nobody = await person('Nia Nobody'); // an account, never granted anywhere

    for (const caller of [owner, guest]) {
      const ids = (await namesFor(caller, ws)).map((x) => x.userId);
      expect(ids).toContain(mine.userId); // control: a real member is served (to the guest, through the ticket they share)
      expect(ids).not.toContain(otherFormer.userId);
      expect(ids).not.toContain(otherOwner.userId);
      expect(ids).not.toContain(nobody.userId);
    }
  });
});
