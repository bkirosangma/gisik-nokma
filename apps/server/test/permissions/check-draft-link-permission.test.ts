import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import {
  checkPermission,
  LINK_TARGET_NOT_VISIBLE_REASON,
  PERMISSION_VISIBILITY_RULE,
  TICKET_NOT_VISIBLE_REASON,
} from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Drafts T6, case 28.114 (spec R41, R43; plan decision 4): the link block of the ingest gate asks `canOpen` of
 * every OTHER end a link payload names, `targetId` for the plain form and `from` for the from form. The head
 * (`gate`, `ticketEvent`, `workspace()`) is `check-draft-permission.test.ts`'s (T4).
 *
 * The ledger is append-only and nothing here truncates it: every workspace, project, ticket and user is a fresh
 * ULID per case, so the scopes are disjoint.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const gate = (env: EventEnvelope, sessionUserId: string) =>
  checkPermission(env, { db: db.pool, sessionUserId });

function ticketEvent(
  workspaceId: string,
  type: string,
  ticketId: string,
  actorId: string,
  payload: unknown = {},
): EventEnvelope {
  return testEnvelope({ workspaceId, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId });
}

/** A workspace with one founded project. Every case starts from one. */
async function workspace() {
  const workspaceId = newUlid();
  const projectId = newUlid();
  await seedProject(db.pool, workspaceId, projectId);
  return { workspaceId, projectId };
}

describe('28.114 the link gate for draft-side links', () => {
  async function world() {
    const { workspaceId, projectId } = await workspace();
    const [author, owner, other] = [newUlid(), newUlid(), newUlid()];
    await seedMember(db.pool, workspaceId, owner, 'owner');
    await seedMember(db.pool, workspaceId, author, 'member');
    await seedMember(db.pool, workspaceId, other, 'member');
    const [draftId, ownDraft2, theirDraft, discarded, publishedId, hiddenId] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: draftId, draftBy: author });
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: ownDraft2, draftBy: author });
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: theirDraft, draftBy: other });
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: discarded, draftBy: author });
    await db.pool.query('UPDATE proj_tickets SET draft_discarded = true WHERE ticket_id = $1', [discarded]);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: publishedId, createdBy: owner });
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: hiddenId, createdBy: owner });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, hiddenId, 'explicit', [owner], owner)]);
    return { workspaceId, author, owner, other, draftId, ownDraft2, theirDraft, discarded, publishedId, hiddenId };
  }

  it('admits the author\'s from form when they see S, and answers every unseeable end with one sentence; CONTROL: the owner links the same published pair', async () => {
    const w = await world();
    const link = (entity: string, actor: string, payload: Record<string, unknown>) =>
      gate(ticketEvent(w.workspaceId, 'ticket.link_added', entity, actor, { kind: 'blocks', ...payload }), actor);
    const unseeable = { refused: true, rule: PERMISSION_VISIBILITY_RULE, reason: LINK_TARGET_NOT_VISIBLE_REASON };

    expect(await link(w.draftId, w.author, { targetId: w.draftId, from: w.publishedId })).toBeNull();
    expect(await link(w.draftId, w.author, { targetId: w.draftId, from: w.hiddenId })).toEqual(unseeable);
    expect(await link(w.draftId, w.author, { targetId: w.draftId, from: w.theirDraft })).toEqual(unseeable);
    expect(await link(w.draftId, w.author, { targetId: w.draftId, from: newUlid() })).toEqual(unseeable);

    // plain form: the author's OWN drafts reach the engine (it says draft.link-form); everyone else's are nothing
    expect(await link(w.publishedId, w.owner, { targetId: w.draftId })).toEqual(unseeable); // the owner does not own D
    expect(await link(w.draftId, w.author, { targetId: w.ownDraft2 })).toBeNull();
    expect(await link(w.draftId, w.author, { targetId: w.theirDraft })).toEqual(unseeable);
    expect(await link(w.draftId, w.author, { targetId: w.discarded })).toEqual(unseeable);
    expect(await link(w.draftId, w.author, { targetId: newUlid() })).toEqual(unseeable);

    // anyone else filing on the author's draft stream: the unknown-ticket answer
    const notVisible = { refused: true, rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON };
    for (const actor of [w.owner, w.other]) {
      expect(await link(w.draftId, actor, { targetId: w.draftId, from: w.publishedId }), actor).toEqual(notVisible);
    }
    // CONTROL: the same actor, a published pair
    expect(await link(w.publishedId, w.owner, { targetId: w.hiddenId })).toBeNull();
  });

  it('the author\'s plain link naming their own draft passes the gate for the published source they can see', async () => {
    const w = await world();
    expect(
      await gate(ticketEvent(w.workspaceId, 'ticket.link_added', w.publishedId, w.author, { kind: 'blocks', targetId: w.draftId }), w.author),
    ).toBeNull();
  });
});
