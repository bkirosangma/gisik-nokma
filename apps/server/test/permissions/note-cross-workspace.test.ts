import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope, newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { checkPermission } from '../../src/permissions/check-permission.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * Cases 18.500–18.502 (task/notes-cross-workspace-attach, a PRODUCTION privacy hole): a note links only to tickets of
 * its OWN workspace. `canSee` resolves the role in the TICKET's workspace and the ingest door's
 * entity↔workspace guard binds only the NOTE, so before this task a person who is in BOTH workspaces linked a W2 note
 * to a WS ticket (and W2's readers then read that ticket's title). Every refusal here is the one an unknown ticket id
 * gets, so it is no existence oracle for the other workspace's ticket ids.
 *
 * The world is the notes fixture's WS plus a second workspace W2 that `author` OWNS; `author` is also a member on P in
 * WS, so TP is a ticket they may see and a WS note a note they may link. Everything is SEEDED in `beforeAll` and
 * every act after it goes through the CLIENT door (`ingestClientBatch`, the permission gate, the engine, the
 * projections, the production gates): the door numbers a workspace's events from the ledger and `applyCommitted` from a
 * process-local map, so nothing may be seeded into WS or W2 once the door has written there.
 *
 * The sentence and the rule are asserted as LITERALS, never through the module's constant: a test that imported it
 * would follow a mutated literal and stay green.
 */
const RULE = 'permission.note';
const UNKNOWN_TICKET = 'You cannot see the ticket this note would be attached to.';

let db: TestDatabase;
let world: NotesFixture;
let ingest: IngestService;
let W2: string;
let P2: string;
/** A workspace-scope note homed in W2, authored by `author`. */
let away: string;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  W2 = newUlid();
  P2 = newUlid();
  away = newUlid();
  const inW2 = { workspaceId: W2, actorId: world.ids.author };
  await applyCommitted(db.pool, [
    makeCommitted({ ...inW2, entity: { kind: 'workspace', id: W2 }, type: 'workspace.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'membership', id: `${W2}:${world.ids.author}` },
      type: 'membership.granted',
      payload: { userId: world.ids.author, role: 'owner' },
    }),
    makeCommitted({ ...inW2, entity: { kind: 'project', id: P2 }, type: 'project.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'note', id: away },
      type: 'note.created',
      payload: { title: 'Homed in the second workspace', homeProjectId: P2, scope: { mode: 'workspace' } },
    }),
  ]);
  ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry(), gates: buildServerGates() });
}, 120_000);

afterAll(async () => {
  await db.drop();
});

/** One event from `author` through the client door. */
async function door(workspaceId: string, noteId: string, type: string, payload: unknown) {
  const [result] = await ingest.ingestClientBatch(
    [
      {
        id: newUlid(),
        workspaceId,
        entity: { kind: 'note', id: noteId },
        type,
        version: 1,
        payload,
        actorId: world.ids.author,
        origin: 'web',
        clientTime: '2026-10-06T12:00:00.000Z',
      },
    ],
    world.ids.author,
  );
  return result as { status: string; rule?: string; reason?: string };
}

const links = async (noteId: string, ticketId: string) =>
  (await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_note_attachments WHERE note_id = $1 AND ticket_id = $2', [noteId, ticketId]))
    .rows[0]?.n;

describe('18.500 a note links only to tickets of its own workspace (note.attached, note.detached)', () => {
  it('18.500 a W2 note attached to a WS ticket by a person in both workspaces is refused with the unknown-ticket sentence, and so is the detach; the same person links a WS note to TP', async () => {
    // CONTROL first, same person, same ticket: a note homed in WS attaches and detaches, so the refusals below are
    // about the workspace and not about this person or this ticket.
    expect(await door(world.WS, world.NOTES.nWorkspace, 'note.attached', { ticketId: world.TP })).toMatchObject({ status: 'committed' });
    expect(await links(world.NOTES.nWorkspace, world.TP)).toBe(1);

    const attached = await door(W2, away, 'note.attached', { ticketId: world.TP });
    expect(attached).toMatchObject({ status: 'refused', rule: RULE, reason: UNKNOWN_TICKET });
    expect(await links(away, world.TP)).toBe(0);

    // A detach naming a WS ticket from a W2 note is the same door: before this task it committed (a no-op when nothing
    // was linked) and wrote the WS ticket's id into W2's note history. Refused alike.
    const detached = await door(W2, away, 'note.detached', { ticketId: world.TP });
    expect(detached).toMatchObject({ status: 'refused', rule: RULE, reason: UNKNOWN_TICKET });
    expect(await door(world.WS, world.NOTES.nWorkspace, 'note.detached', { ticketId: world.TP })).toMatchObject({ status: 'committed' });
    expect(await links(world.NOTES.nWorkspace, world.TP)).toBe(0);
  });

  it('18.500 (K4) the bind compares the ticket with the NOTE\'s workspace, not the envelope\'s: a W2 note filed under WS at the gate is refused', async () => {
    // At the door the entity guard already refuses this envelope (the note belongs to W2), so only the gate alone can
    // tell "the note's workspace" from "the workspace the event names". `author` reads the note (they wrote it) and can
    // see TP, so the bind is the only clause that refuses.
    const env = makeEnvelope({
      type: 'note.attached',
      payload: { ticketId: world.TP },
      entity: { kind: 'note', id: away },
      workspaceId: world.WS,
      actorId: world.ids.author,
      origin: 'web',
    });
    expect(await checkPermission(env, { db: db.pool, sessionUserId: world.ids.author })).toEqual({ refused: true, rule: RULE, reason: UNKNOWN_TICKET });
    // CONTROL: the same gate, the same person and ticket, a WS note: allowed.
    const control = makeEnvelope({
      type: 'note.attached',
      payload: { ticketId: world.TP },
      entity: { kind: 'note', id: world.NOTES.nWorkspace },
      workspaceId: world.WS,
      actorId: world.ids.author,
      origin: 'web',
    });
    expect(await checkPermission(control, { db: db.pool, sessionUserId: world.ids.author })).toBeNull();
  });
});

describe('18.501 note.created {attachTicketId} binds the ticket to the new note\'s workspace', () => {
  it('18.501 creating a W2 note attached to a WS ticket is refused with the unknown-ticket sentence and writes no note; creating a WS note attached to TP commits', async () => {
    const homeless = newUlid();
    const created = await door(W2, homeless, 'note.created', {
      title: 'Would be linked across',
      homeProjectId: P2,
      scope: { mode: 'workspace' },
      attachTicketId: world.TP,
    });
    expect(created).toMatchObject({ status: 'refused', rule: RULE, reason: UNKNOWN_TICKET });
    expect((await db.pool.query('SELECT 1 FROM proj_notes WHERE note_id = $1', [homeless])).rowCount).toBe(0);
    expect(await links(homeless, world.TP)).toBe(0);

    // CONTROL: the same person, ticket and payload, homed in WS: commits and links.
    const home = newUlid();
    const control = await door(world.WS, home, 'note.created', {
      title: 'Linked at home',
      homeProjectId: world.P,
      scope: { mode: 'workspace' },
      attachTicketId: world.TP,
    });
    expect(control).toMatchObject({ status: 'committed' });
    expect(await links(home, world.TP)).toBe(1);
  });
});

describe('18.502 the refusal for a foreign REAL ticket is the refusal for a made-up one (no existence oracle)', () => {
  it('18.502 note.attached and note.created naming WS\'s TP from W2 answer byte for byte what a never-issued ticket id answers', async () => {
    const madeUp = newUlid();
    const pick = (r: { rule?: string; reason?: string }) => ({ rule: r.rule, reason: r.reason });
    const foreignAttach = pick(await door(W2, away, 'note.attached', { ticketId: world.TP }));
    const unknownAttach = pick(await door(W2, away, 'note.attached', { ticketId: madeUp }));
    expect(foreignAttach).toEqual(unknownAttach);
    expect(unknownAttach).toEqual({ rule: RULE, reason: UNKNOWN_TICKET });

    const create = (ticketId: string) =>
      door(W2, newUlid(), 'note.created', { title: 'Probe', homeProjectId: P2, scope: { mode: 'workspace' }, attachTicketId: ticketId });
    const foreignCreate = pick(await create(world.TP));
    const unknownCreate = pick(await create(madeUp));
    expect(foreignCreate).toEqual(unknownCreate);
    expect(unknownCreate).toEqual({ rule: RULE, reason: UNKNOWN_TICKET });
  });
});
