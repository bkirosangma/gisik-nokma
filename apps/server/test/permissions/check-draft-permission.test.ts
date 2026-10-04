import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DRAFT_ALLOWED_EVENT_TYPES, draftNotAllowedReason, newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import {
  checkPermission,
  DRAFT_NOT_ALLOWED_RULE,
  PERMISSION_VISIBILITY_RULE,
  TICKET_NOT_VISIBLE_REASON,
} from '../../src/permissions/check-permission.js';
import { DRAFT_NOT_ALLOWED_RULE as ENGINE_DRAFT_NOT_ALLOWED_RULE } from '@gisik-nokma/rule-engine';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Drafts T4, case 28.071 (spec §3.3, R6/R7/R9; door G1): the ingest gate's ticket branch is three-way. The author
 * of an openable draft is admitted for the allowlist and refused `draft.not-allowed` for the rest, BEFORE any
 * authority check; everyone else, the owner, the admins and the draft's assignee included, gets the answer an id
 * that never existed gets. The head (`gate`, `ticketEvent`, `workspace()`) is `check-visibility-permission.test.ts`'s.
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

describe('28.071 G1: the author\'s permission gate on a draft', () => {
  async function world() {
    const { workspaceId, projectId } = await workspace();
    const author = newUlid();
    const owner = newUlid();
    const admin = newUlid();
    const assignee = newUlid();
    const other = newUlid();
    await seedMember(db.pool, workspaceId, owner, 'owner');
    await seedMember(db.pool, workspaceId, admin, 'admin');
    await seedMember(db.pool, workspaceId, author, 'member');
    await seedMember(db.pool, workspaceId, assignee, 'member');
    await seedMember(db.pool, workspaceId, other, 'member');
    const draftId = newUlid();
    const publishedId = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: draftId, draftBy: author, birthAssigneeId: assignee });
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: publishedId, createdBy: author });
    return { workspaceId, author, owner, admin, assignee, other, draftId, publishedId };
  }
  const REFUSED = [
    'ticket.transitioned', 'ticket.closed', 'ticket.reopened', 'ticket.ranked',
    'comment.added', 'ticket.collaborator_added', 'visibility.set', 'ticket.deleted',
  ] as const;

  it('admits the allowlist for the author, refuses the rest with draft.not-allowed, and answers everyone else as an unknown ticket', async () => {
    const w = await world();
    const as = (type: string, ticketId: string, actorId: string, payload: unknown = {}) => {
      const env = type === 'visibility.set'
        ? setVisibilityEnv(w.workspaceId, ticketId, 'workspace', undefined, actorId)
        : ticketEvent(w.workspaceId, type, ticketId, actorId, payload);
      return gate(env, actorId);
    };

    for (const type of DRAFT_ALLOWED_EVENT_TYPES) {
      expect(await as(type, w.draftId, w.author), type).toBeNull();
    }
    for (const type of REFUSED) {
      expect(await as(type, w.draftId, w.author), type).toEqual({
        refused: true,
        rule: DRAFT_NOT_ALLOWED_RULE,
        reason: draftNotAllowedReason(type),
      });
    }
    expect(draftNotAllowedReason('ticket.deleted')).toBe('A draft cannot be deleted. Discard it instead.');

    // everyone else, owner and admin and the assignee included: the answer an unknown ticket gets
    const unknown = await as('ticket.field_set', newUlid(), w.owner, { fieldId: 'title', value: 'x' });
    expect(unknown).toEqual({ refused: true, rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON });
    for (const actor of [w.owner, w.admin, w.assignee, w.other]) {
      for (const type of ['ticket.field_set', 'ticket.discarded', 'ticket.closed'] as const) {
        expect(await as(type, w.draftId, actor, { fieldId: 'title', value: 'x' }), `${actor} ${type}`).toEqual(unknown);
      }
    }

    // CONTROL, same `it`: the SAME author's `ticket.closed`, refused above on the draft, is admitted on a published ticket
    expect(await as('ticket.closed', w.publishedId, w.author)).toBeNull();
  });
});

describe('28.090 parity with the engine draft gate', () => {
  it('the engine and this gate refuse a draft with the same rule id, and the sentence is the one the engine tests pin', () => {
    expect(ENGINE_DRAFT_NOT_ALLOWED_RULE).toBe(DRAFT_NOT_ALLOWED_RULE);
    expect(DRAFT_NOT_ALLOWED_RULE).toBe('draft.not-allowed');
    // the same literal `packages/rule-engine/test/draft-gate.test.ts` asserts, so neither side can drift alone
    expect(draftNotAllowedReason('ticket.transitioned')).toBe('A draft cannot be moved. Publish it first, or discard it.');
    expect(draftNotAllowedReason('ticket.deleted')).toBe('A draft cannot be deleted. Discard it instead.');
  });
});
