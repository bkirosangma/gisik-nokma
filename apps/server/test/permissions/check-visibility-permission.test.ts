import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import {
  checkPermission,
  GUESTS_CANNOT_CREATE_TICKETS_REASON,
  NOT_ON_PROJECT_REASON,
  PERMISSION_ROLE_RULE,
  PERMISSION_VISIBILITY_RULE,
  TICKET_NOT_VISIBLE_REASON,
  VISIBILITY_AUTHORITY_REASON,
  VISIBILITY_CLAIM_MISMATCH_REASON,
} from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import {
  applyAll,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';

/**
 * Plan 4 Task 9 — the visibility-dependent half of the ingest gate.
 *
 * ## Every case reaches the check it names
 *
 * A refusal that fires before the interesting code proves nothing, so every
 * actor below holds a real workspace membership, every project below is really
 * founded (Step 3b refuses events naming one that is not), and every ticket is
 * created through the real `ticket.created` event. What is left wrong with each
 * submission is the one thing its case is about.
 *
 * ## The reasons are asserted, not only the rules
 *
 * Five of the refusals here report `permission.role` and two report
 * `permission.visibility`, so a case asserting the rule alone could not tell a
 * guest-ceiling refusal from a project-membership one, nor an audience refusal
 * from a coherence one (ruling P20). Every expectation is a whole-object
 * `toEqual` against the exported sentence.
 *
 * ## Ids are ULIDs
 *
 * The plan text's `wks_01` / `usr_guest` / `tkt_1` fixtures are refused by the
 * envelope schema and by the payload schemas the projections parse with — they
 * would throw at the parse, before any assertion. Everything here is
 * `newUlid()`.
 *
 * The ledger is append-only and nothing here truncates it: every workspace,
 * project, ticket and user is a fresh ULID per case, so the scopes are disjoint.
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

function createTicketEvent(workspaceId: string, projectId: string, actorId: string): EventEnvelope {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId: null, title: 'A new ticket' },
    actorId,
  });
}

/** A workspace with one founded project. Every case starts from one. */
async function workspace() {
  const workspaceId = newUlid();
  const projectId = newUlid();
  await seedProject(db.pool, workspaceId, projectId);
  return { workspaceId, projectId };
}

// ---------------------------------------------------------------------------
// Check 2 — who may create a ticket. Both halves report `permission.role`, and
// they live in different functions: the guest half in `checkRolePermission`,
// the project half in `checkVisibilityPermission` after the existence check.
// ---------------------------------------------------------------------------

describe('check 2 — creating a ticket', () => {
  it('planted defect: a guest cannot create a ticket, and is told so as a guest', async () => {
    // MEASURED on main before this line existed: a workspace guest was ADMITTED
    // for ticket.created.
    //
    // Mutation: delete the guest branch in checkRolePermission. This does NOT
    // go green — the guest falls through to the project-membership refusal,
    // because a guest is on no project — it goes red on the REASON, which is
    // exactly why the reason is asserted. The two refusals share a rule id and
    // a case checking only `rule` could not tell them apart.
    const { workspaceId, projectId } = await workspace();
    const guest = newUlid();
    await seedGuest(db.pool, workspaceId, guest);

    expect(await gate(createTicketEvent(workspaceId, projectId, guest), guest)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: GUESTS_CANNOT_CREATE_TICKETS_REASON,
    });
  });

  it('planted defect: creating a ticket requires being ON the project — there is no admin shortcut', async () => {
    // Both a workspace admin and a plain member off the project are walked,
    // because "no admin shortcut" is a claim about the admin specifically and
    // the member case alone would pass against a build that had one.
    // Mutation: `|| ctx.eff.workspaceRole === 'admin'` on the project check —
    // the admin line reddens, the member line does not.
    const { workspaceId, projectId } = await workspace();
    const admin = newUlid();
    const member = newUlid();
    await seedMember(db.pool, workspaceId, admin, 'admin');
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId: newUlid() }]);

    for (const actor of [admin, member]) {
      expect(await gate(createTicketEvent(workspaceId, projectId, actor), actor)).toEqual({
        refused: true,
        rule: PERMISSION_ROLE_RULE,
        reason: NOT_ON_PROJECT_REASON,
      });
    }
  });

  it('a project member creates tickets freely — the control the two refusals above need', async () => {
    // Without this, "refuses every ticket.created" passes both cases above.
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);

    expect(await gate(createTicketEvent(workspaceId, projectId, member), member)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Check 3 — a claim must name the ticket it rides on.
// ---------------------------------------------------------------------------

describe('check 3 — a visibility.set must name its own ticket', () => {
  it('planted defect: payload.ticketId disagreeing with the entity is refused', async () => {
    // proj_visibility keys on the ENTITY regardless (case 6.55), so without
    // this refusal one ticket's stream authors another ticket's audience — a
    // cross-entity write that makes live application and canonical replay
    // disagree. Mutation: delete the mismatch branch; the answer becomes the
    // authority refusal instead, which is a different reason and reddens.
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    const mine = newUlid();
    const other = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: mine, createdBy: member });
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: other });

    const claim = testEnvelope({
      workspaceId,
      entity: { kind: 'ticket', id: mine },
      type: 'visibility.set',
      payload: { ticketId: other, mode: 'workspace' },
      actorId: member,
    });
    expect(await gate(claim, member)).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: VISIBILITY_CLAIM_MISMATCH_REASON,
    });
  });

  it('the mismatch is refused BEFORE anything is looked up', async () => {
    // The ordering claim, made falsifiable: the entity here is a ticket that
    // does not exist at all, so if the mismatch check ran after canSee the
    // answer would be TICKET_NOT_VISIBLE_REASON. Only a check that fires first
    // can produce the sentence below.
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);

    const claim = testEnvelope({
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'visibility.set',
      payload: { ticketId: newUlid(), mode: 'workspace' },
      actorId: member,
    });
    expect(await gate(claim, member)).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: VISIBILITY_CLAIM_MISMATCH_REASON,
    });
  });
});

// ---------------------------------------------------------------------------
// Check 4 — the actor must be able to see the ticket they are acting on.
// ---------------------------------------------------------------------------

describe('check 4 — acting on a ticket you cannot see', () => {
  it.each(['ticket.transitioned', 'comment.added'])(
    'planted defect: a guest is refused %s on a ticket not explicitly shared with them',
    async (type) => {
      // MEASURED on main: a guest was ADMITTED for both of these. Two types are
      // walked because the check is a single line covering every ticket event,
      // and one type would not establish that.
      //
      // Mutation: delete the canSee call and this returns null.
      const { workspaceId, projectId } = await workspace();
      const guest = newUlid();
      const ticketId = newUlid();
      await seedGuest(db.pool, workspaceId, guest);
      await seedTicket(db.pool, { workspaceId, projectId, ticketId }); // project mode by default

      expect(await gate(ticketEvent(workspaceId, type, ticketId, guest, { body: 'x' }), guest)).toEqual({
        refused: true,
        rule: PERMISSION_VISIBILITY_RULE,
        reason: TICKET_NOT_VISIBLE_REASON,
      });
    },
  );

  it('a guest acting on a ticket explicitly shared with them passes the gate', async () => {
    // The control without which "refuses every guest" would pass above. It also
    // pins the shape of a guest's write ceiling: it is not a role branch, it is
    // canSee — a guest's canSee is true only for an explicit list naming them.
    const { workspaceId, projectId } = await workspace();
    const guest = newUlid();
    const ticketId = newUlid();
    await seedGuest(db.pool, workspaceId, guest);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'explicit', [guest])]);

    expect(
      await gate(ticketEvent(workspaceId, 'comment.added', ticketId, guest, { body: 'checked' }), guest),
    ).toBeNull();
  });

  it("planted defect: a member acting on another project's ticket by direct id is refused", async () => {
    // The probe Task 8 answers with an indistinguishable 404 on the read path,
    // met here at the ingest door. Mutation: delete the canSee call.
    const workspaceId = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const member = newUlid();
    const ticketId = newUlid();
    await seedProject(db.pool, workspaceId, mine);
    await seedProject(db.pool, workspaceId, theirs);
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId: mine }]);
    await seedTicket(db.pool, { workspaceId, projectId: theirs, ticketId });

    expect(
      await gate(ticketEvent(workspaceId, 'ticket.assigned', ticketId, member, { assigneeId: member }), member),
    ).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });
  });

  it('a member acting on their own project’s ticket passes — the control for the refusal above', async () => {
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    const ticketId = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId });

    expect(
      await gate(ticketEvent(workspaceId, 'ticket.assigned', ticketId, member, { assigneeId: member }), member),
    ).toBeNull();
  });

  it('a ticket that never existed and one the actor may not see answer IDENTICALLY', async () => {
    // The oracle that would otherwise sit one layer below Task 8's 404s: if the
    // gate distinguished "no such ticket" from "not yours", a member could
    // enumerate ticket ids by submitting claims against them and reading the
    // refusals. canSee cannot tell the two apart by design, and this asserts
    // the whole refusal object rather than the rule, because a differing
    // `reason` would be the oracle just as surely as a differing rule.
    const workspaceId = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const member = newUlid();
    const invisible = newUlid();
    await seedProject(db.pool, workspaceId, mine);
    await seedProject(db.pool, workspaceId, theirs);
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId: mine }]);
    await seedTicket(db.pool, { workspaceId, projectId: theirs, ticketId: invisible });

    const forInvisible = await gate(
      ticketEvent(workspaceId, 'ticket.transitioned', invisible, member, { to: 'done' }),
      member,
    );
    const forNonexistent = await gate(
      ticketEvent(workspaceId, 'ticket.transitioned', newUlid(), member, { to: 'done' }),
      member,
    );
    expect(forInvisible).toEqual(forNonexistent);
    // Non-vacuity: both really are refusals, not two nulls agreeing.
    expect(forInvisible).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });
  });

  it('check 1: an event about something other than a ticket is not examined here', async () => {
    // The entity-kind filter, and the boundary of what Task 9 closes. A
    // workspace-entity event from a member who can see no ticket at all passes
    // this pass untouched — `workspace.renamed` is admitted, including for a
    // guest, and nothing in this module asks who may rename a workspace. That
    // is recorded as an open absence in check-permission.ts rather than closed
    // here on this task's own authority.
    const workspaceId = newUlid();
    const member = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member');

    const renamed = testEnvelope({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.renamed',
      payload: { name: 'Renamed' },
      actorId: member,
    });
    expect(await gate(renamed, member)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Check 5 — who may retarget a ticket's audience. Reported as
// `permission.role`: it is authority, not audience.
// ---------------------------------------------------------------------------

describe('check 5 — who may change who sees a ticket', () => {
  it('planted defect: a plain member who is neither project admin nor creator cannot set visibility', async () => {
    // Reached where it can only be itself: the member is ON the project, so
    // canSee passes for a project-mode ticket and the refusal below is check 5's
    // and not check 4's. Mutation: delete the check 5 block and this returns
    // null — an ordinary member permanently retargets someone else's ticket,
    // and the ledger is append-only by trigger, so it could only ever be
    // superseded, never removed.
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    const creator = newUlid();
    const ticketId = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId, createdBy: creator });

    expect(await gate(setVisibilityEnv(workspaceId, ticketId, 'workspace', undefined, member), member)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: VISIBILITY_AUTHORITY_REASON,
    });
  });

  it('the ticket creator may set visibility — read from the LEDGER, since no projection carries it', async () => {
    // The case that proves creatorship is sourced at all: `proj_tickets` does
    // not exist and `proj_visibility` has no creator column, so getTicketCreator
    // reads events.actor_id on the ticket's own ticket.created row. Mutation:
    // make getTicketCreator return null and only this line reddens — which is
    // also why seedTicket appends to the ledger rather than only applying the
    // projection.
    const { workspaceId, projectId } = await workspace();
    const creator = newUlid();
    const ticketId = newUlid();
    await seedMember(db.pool, workspaceId, creator, 'member', [{ projectId }]);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId, createdBy: creator });

    expect(
      await gate(setVisibilityEnv(workspaceId, ticketId, 'explicit', [creator], creator), creator),
    ).toBeNull();
  });

  it('a project admin may set visibility on a ticket they can see, though they did not create it', async () => {
    const { workspaceId, projectId } = await workspace();
    const projectAdmin = newUlid();
    const ticketId = newUlid();
    await seedMember(db.pool, workspaceId, projectAdmin, 'member', [{ projectId, projectAdmin: true }]);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId, createdBy: newUlid() });

    expect(
      await gate(setVisibilityEnv(workspaceId, ticketId, 'project', undefined, projectAdmin), projectAdmin),
    ).toBeNull();
  });

  it("planted defect: project-admin rights are asked of the TICKET's project, not of any project the actor runs", async () => {
    // The actor is a project admin — of a DIFFERENT project — and can see the
    // ticket, because an explicit list names them. Mutation: ask
    // hasProjectAdminRights about the actor's own project, or about
    // `ctx.eff.projects.keys().next().value`, and this goes green while one
    // project's admin retargets every ticket they have ever been shown.
    const workspaceId = newUlid();
    const theirs = newUlid();
    const ours = newUlid();
    const actor = newUlid();
    const ticketId = newUlid();
    await seedProject(db.pool, workspaceId, theirs);
    await seedProject(db.pool, workspaceId, ours);
    await seedMember(db.pool, workspaceId, actor, 'member', [{ projectId: theirs, projectAdmin: true }]);
    await seedTicket(db.pool, { workspaceId, projectId: ours, ticketId, createdBy: newUlid() });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'explicit', [actor])]);

    expect(await gate(setVisibilityEnv(workspaceId, ticketId, 'workspace', undefined, actor), actor)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: VISIBILITY_AUTHORITY_REASON,
    });
  });

  it('planted defect: a guest named in a ticket’s explicit list still cannot retarget it', async () => {
    // MEASURED on main: a guest was ADMITTED for visibility.set. This is the
    // sharp one — the ledger is append-only, so a guest who could widen a
    // ticket to workspace-mode would do it permanently, superseded at best,
    // never removed.
    //
    // The guest must be able to SEE the ticket, or check 4 refuses first and
    // this case would prove nothing about check 5. The creatorship branch is
    // unreachable for a guest by construction — check 2 refuses their
    // ticket.created — so what refuses here is hasProjectAdminRights, which is
    // false for a guest on every project including one a stale roster row might
    // leave them on.
    const { workspaceId, projectId } = await workspace();
    const guest = newUlid();
    const ticketId = newUlid();
    await seedGuest(db.pool, workspaceId, guest);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId, createdBy: newUlid() });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'explicit', [guest])]);

    // The premise, asserted rather than assumed: the guest really can act on
    // this ticket, so the refusal below is about authority and not audience.
    expect(
      await gate(ticketEvent(workspaceId, 'comment.added', ticketId, guest, { body: 'hello' }), guest),
    ).toBeNull();

    expect(await gate(setVisibilityEnv(workspaceId, ticketId, 'workspace', undefined, guest), guest)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: VISIBILITY_AUTHORITY_REASON,
    });
  });

  it('check 5 runs AFTER check 4: an unseeable ticket answers the audience refusal, not the authority one', async () => {
    // The ordering that keeps check 5 from being an existence oracle. The actor
    // is a workspace ADMIN, so hasProjectAdminRights is true on every project
    // that exists — meaning check 5 would ADMIT them on a real ticket and
    // REFUSE them on a nonexistent one, telling them apart. Run after check 4,
    // both answer the same sentence. Mutation: hoist the check 5 block above
    // the canSee call and the two lines below diverge.
    const workspaceId = newUlid();
    const projectId = newUlid();
    const admin = newUlid();
    const invisible = newUlid();
    await seedProject(db.pool, workspaceId, projectId);
    await seedMember(db.pool, workspaceId, admin, 'admin');
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: invisible, createdBy: newUlid() });

    const onInvisible = await gate(
      setVisibilityEnv(workspaceId, invisible, 'workspace', undefined, admin),
      admin,
    );
    const onNonexistent = await gate(
      setVisibilityEnv(workspaceId, newUlid(), 'workspace', undefined, admin),
      admin,
    );
    expect(onInvisible).toEqual(onNonexistent);
    expect(onInvisible).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });
  });
});
