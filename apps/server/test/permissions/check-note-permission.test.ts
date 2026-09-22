import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope, newUlid } from '@gisik-nokma/domain';
import { checkPermission, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, NOTES_USERS, type NotesUser } from '../helpers/notes-fixture.js';

/**
 * Spec §4.2's matrix: who may write which note event.
 *
 * Driven through `checkPermission` — the ONE gate the ingest service applies at
 * the client door — rather than through `checkNotePermission` directly, because
 * the chain's ORDER is half of what the spec asserts: a guest creating a note is
 * refused `permission.role` by the role check before the note check is reached
 * (case 18.027), and a note check called on its own could not show that.
 *
 * ## The envelopes are submitted envelopes, not envelopes built for the reducer
 *
 * `actorId = sessionUserId` on every one, because `checkRolePermission`'s FIRST
 * assertion is that the actor is the session (identity spoofing), and an
 * envelope that failed it would refuse every cell for a reason that has nothing
 * to do with notes.
 */

let db: TestDatabase;
let WS: string;
let P: string;
let TP: string;
let TE: string;
let ids: Record<NotesUser, string>;
let NOTES: Record<string, string>;

const USERS = NOTES_USERS;

beforeAll(async () => {
  db = await createTestDatabase();
  const fixture = await seedNotesFixture(db.pool);
  ({ WS, P, TP, TE, ids, NOTES } = fixture);
});

afterAll(async () => {
  await db.drop();
});

/** One envelope per (event, note, actor), put through the real gate. */
async function permits(type: string, payload: unknown, note: string, noteId: string, who: NotesUser) {
  const env = makeEnvelope({
    type,
    payload,
    entity: { kind: 'note', id: noteId },
    workspaceId: WS,
    actorId: ids[who],
    origin: 'web',
  });
  return checkPermission(env, { db: db.pool, sessionUserId: ids[who] });
}

const DOC = { type: 'doc' };

/**
 * The rows, and what each one is here to separate.
 *
 * `nWorkspace` gives the admin column a READER, and `nProject` gives the SAME
 * person a non-reader — one person, two cells, which is what makes "an admin
 * edits what they can read" different from "an admin edits anything".
 * `nPrivate` separates the author arm from every scope arm. `nExplicit` puts a
 * GUEST on the readable side, so "a reader may comment" and "a member may
 * comment" cannot be confused.
 */
const ROWS: Array<{ type: string; payload: unknown; note: string; allowed: NotesUser[] }> = [
  // admin READS a workspace note → isAdminReader; memberIn reads it and is
  // neither author nor admin → refused, which is the D6 narrowing.
  { type: 'note.renamed', payload: { title: 'x' }, note: 'nWorkspace', allowed: ['author', 'owner', 'admin'] },
  { type: 'note.renamed', payload: { title: 'x' }, note: 'nPrivate', allowed: ['author', 'owner'] },
  // admin is NOT on P, so this is the admin-NON-reader cell.
  { type: 'note.body_set', payload: { body: DOC }, note: 'nProject', allowed: ['author', 'owner'] },
  { type: 'note.scope_set', payload: { mode: 'workspace' }, note: 'nExplicit', allowed: ['author', 'owner'] },
  { type: 'note.deleted', payload: {}, note: 'nWorkspace', allowed: ['author', 'owner', 'admin'] },
  // comment.added: readable is ENOUGH — no author requirement.
  {
    type: 'comment.added',
    payload: { body: DOC },
    note: 'nWorkspace',
    allowed: ['author', 'owner', 'admin', 'memberIn', 'memberOut'],
  },
  { type: 'comment.added', payload: { body: DOC }, note: 'nExplicit', allowed: ['author', 'owner', 'guestListed'] },
];

describe('18.024 the write matrix of spec §4.2', () => {
  for (const row of ROWS) {
    it(`18.024 ${row.type} on ${row.note}`, async () => {
      for (const who of USERS) {
        const refusal = await permits(row.type, row.payload, row.note, NOTES[row.note]!, who);
        expect(refusal === null, `${row.type}/${row.note}/${who}`).toBe(row.allowed.includes(who));
      }
    });
  }
});

describe('18.025 note.created', () => {
  it('18.025 refuses a guest, refuses a home the actor is not on, and requires ticket visibility', async () => {
    const created = (who: NotesUser, payload: unknown) => permits('note.created', payload, 'none', newUlid(), who);
    const base = { title: 'Cold room', homeProjectId: '', scope: { mode: 'private' } };

    // CONTROL: a member ON the project creates. Without this the three
    // refusals below could all be true of a check that refuses everything.
    expect(await created('memberIn', base)).toBeNull();
    // A guest is refused — and by the ROLE check, before the note check runs.
    const guestRefusal = await created('guestListed', base);
    expect(guestRefusal?.rule).toBe(PERMISSION_ROLE_RULE);
    // A member on NO project cannot file a note under P.
    const notOnProject = await created('memberOut', { ...base, homeProjectId: P, scope: { mode: 'project' } });
    expect(notOnProject).not.toBeNull();
    // The owner may file under any project of the workspace.
    expect(await created('owner', { ...base, homeProjectId: P, scope: { mode: 'project' } })).toBeNull();
    // `attachTicketId` must be a ticket the actor can SEE: TE is
    // explicit-to-guest, so memberIn cannot attach to it but can to TP.
    const cannotSeeTicket = await created('memberIn', { ...base, scope: { mode: 'inherit' }, attachTicketId: TE });
    expect(cannotSeeTicket).not.toBeNull();
    expect(await created('memberIn', { ...base, attachTicketId: TP })).toBeNull();
    // NOT `guestListed` attaching to TE: a guest cannot create a note at all (the
    // role check above refuses first, which is what 18.027 pins), so the one
    // person who can see TE cannot reach this clause. The pair that witnesses it
    // is `memberIn` refused for TE and allowed for TP — same actor, same event,
    // the ticket the only variable.
  });
});

describe('18.026 note.attached needs both halves', () => {
  it('18.026 requires reading the note AND seeing the ticket', async () => {
    // Reads the note (workspace scope), cannot see TE → refused.
    expect(await permits('note.attached', { ticketId: TE }, 'nWorkspace', NOTES['nWorkspace']!, 'memberIn')).not.toBeNull();
    // Sees TE, cannot read the note (private, not the author) → refused.
    expect(await permits('note.attached', { ticketId: TE }, 'nPrivate', NOTES['nPrivate']!, 'guestListed')).not.toBeNull();
    // Sees TE and reads the note (explicit names them) → allowed.
    expect(await permits('note.attached', { ticketId: TE }, 'nExplicit', NOTES['nExplicit']!, 'guestListed')).toBeNull();
    // CONTROL for the first line: the same actor and the same event on a ticket
    // they CAN see is allowed, so the refusal above is about the ticket and not
    // about attaching at all.
    expect(await permits('note.attached', { ticketId: TP }, 'nWorkspace', NOTES['nWorkspace']!, 'memberIn')).toBeNull();
    // `note.detached` is the same gate.
    expect(await permits('note.detached', { ticketId: TE }, 'nWorkspace', NOTES['nWorkspace']!, 'memberIn')).not.toBeNull();
  });
});

describe('18.027 rule ids and reasons', () => {
  it('18.027 note refusals carry permission.note with a plain-language reason', async () => {
    const refusal = await permits('note.renamed', { title: 'x' }, 'nWorkspace', NOTES['nWorkspace']!, 'memberIn');
    expect(refusal).toEqual({
      refused: true,
      rule: 'permission.note',
      reason: 'Only the note’s author, an admin who can read it, or the workspace owner can change it.',
    });
    // The visibility rule id is NOT used: a reader being told
    // `permission.visibility` would name a rule about ticket audiences.
    expect(refusal?.rule).not.toBe('permission.visibility');
    // And the unreadable-note refusal is its own sentence, not the "not yours"
    // one — a person who cannot see a note is told that, rather than being told
    // it is not theirs.
    const unreadable = await permits('note.renamed', { title: 'x' }, 'nPrivate', NOTES['nPrivate']!, 'memberIn');
    expect(unreadable).toEqual({ refused: true, rule: 'permission.note', reason: 'You cannot see this note.' });
  });
});
