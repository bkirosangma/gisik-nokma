import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import {
  checkPermission,
  GUESTS_CANNOT_CREATE_REASON,
  NAMED_PERSON_NOT_IN_WORKSPACE_REASON,
  PERMISSION_ROLE_RULE,
  PERMISSION_VISIBILITY_RULE,
  TICKET_DELETE_UNRESOLVED_REASON,
  TICKET_NOT_VISIBLE_REASON,
  ticketDeleteAuthorityReason,
  VISIBILITY_AUTHORITY_REASON,
  VISIBILITY_CLAIM_MISMATCH_REASON,
  WORKSPACE_RENAME_REASON,
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
      reason: GUESTS_CANNOT_CREATE_REASON,
    });
  });

  /**
   * AMENDED 2026-09-29, owner ruling (A) and deviation D7. This was "creating a
   * ticket requires being ON the project — there is no admin shortcut". Rule A
   * puts an admin and a member on every FOUNDED project, so both now create; the
   * refusal `NOT_ON_PROJECT_REASON` is unreachable by any shipped role (a guest
   * is refused earlier, an unfounded project earlier still) — recorded as D7.
   */
  it('rule A: an admin and a member off every roster create tickets in a founded project', async () => {
    const { workspaceId, projectId } = await workspace();
    const admin = newUlid();
    const member = newUlid();
    await seedMember(db.pool, workspaceId, admin, 'admin');
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId: newUlid() }]);

    for (const actor of [admin, member]) {
      expect(await gate(createTicketEvent(workspaceId, projectId, actor), actor)).toBeNull();
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

/**
 * 13.1362–13.1363 (owner request 2026-09-23) — THE BIRTH ASSIGNEE, held to the
 * same named-person rule `ticket.assigned` is held to.
 *
 * The New ticket dialog can name an assignee at creation, so `ticket.created`
 * carries an optional `assigneeId`. **That member must not become a way around
 * the assign permission**, and the reason it needs saying is that the check
 * already exists one branch away: E6-17 refuses a `ticket.assigned` naming a
 * person with no role in the workspace, and that refusal lives AFTER the
 * `canSee` test. A birth has no ticket to `canSee` — the row does not exist yet
 * — so the `ticket.created` branch RETURNS before reaching it, and a birth
 * assignee that relied on the existing block would be admitted unchecked.
 *
 * Measured before this existed: `ticket.assigned` naming `nobody-here` is
 * refused, and the identical name arriving on a `ticket.created` was
 * `committed`. The read side then serves it — `mappers.ts` renders
 * `roster.get(id) ?? id` as an assignee NAME, the list's `assigneeId` filter
 * matches it, and `groupBy=assignee` makes a column for it — so a typo in the
 * dialog was a permanent, attributed claim naming nobody.
 */
describe('13.1362 a birth assignee is held to the same named-person rule as ticket.assigned', () => {
  function createTicketAssignedTo(
    workspaceId: string,
    projectId: string,
    actorId: string,
    assigneeId: string | null,
  ): EventEnvelope {
    return testEnvelope({
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title: 'A new ticket', assigneeId },
      actorId,
    });
  }

  it('13.1362 PLANTED DEFECT: a birth naming a NON-MEMBER is refused, in the SAME sentence ticket.assigned gives', async () => {
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);
    const stranger = newUlid();

    // Asserted as the whole refusal object, not the rule alone: this module
    // reports `permission.role` from four different places (the module's own
    // docblock enumerates them), so a case reading only `rule` could not tell
    // the named-person refusal from the project-membership one — and the actor
    // here really is on the project, so nothing else could have fired.
    expect(await gate(createTicketAssignedTo(workspaceId, projectId, member, stranger), member)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: NAMED_PERSON_NOT_IN_WORKSPACE_REASON,
    });
  });

  it('13.1363 CONTROL: naming a real member is admitted — and so are both spellings of nobody', async () => {
    // Without this arm, "refuses every birth assignee" passes the case above.
    // The two nobody-arms are the other half of the same control: `null` and an
    // omitted member must both still be admitted, or the fix would have made
    // the dialog's Unassigned option — the default — unsubmittable.
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    const colleague = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);
    await seedMember(db.pool, workspaceId, colleague, 'member', [{ projectId }]);

    expect(await gate(createTicketAssignedTo(workspaceId, projectId, member, colleague), member)).toBeNull();
    expect(await gate(createTicketAssignedTo(workspaceId, projectId, member, null), member)).toBeNull();
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

/**
 * 6.11 — both halves, the HTTP one added by Task 12: a guest acting on a ticket no explicit list names them in is refused `permission.visibility` at the INGEST door, walked over TWO event types (`ticket.transitioned` and `comment.added`) because the refusal is one line covering every ticket event and a single type would not establish that. Both were measured as ADMITTED on `main` first, so the refusal is a change and not a restatement.
 */
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

  /**
   * AMENDED 2026-09-29, owner ruling (A). This read "a member acting on another
   * project's ticket by direct id is refused". A member is on every founded
   * project now, so the member acts on it; the refusal is the GUEST's, who is on
   * no project by any rule.
   */
  it("rule A: a member acts on another project's ticket by direct id; a guest is refused it", async () => {
    // The probe Task 8 answers with an indistinguishable 404 on the read path,
    // met here at the ingest door. Mutation: delete the canSee call.
    const workspaceId = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const member = newUlid();
    const guest = newUlid();
    const ticketId = newUlid();
    await seedProject(db.pool, workspaceId, mine);
    await seedProject(db.pool, workspaceId, theirs);
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId: mine }]);
    await seedGuest(db.pool, workspaceId, guest);
    await seedTicket(db.pool, { workspaceId, projectId: theirs, ticketId });

    // The control the refusal needs: same ticket, same event, the member acts.
    expect(
      await gate(ticketEvent(workspaceId, 'ticket.assigned', ticketId, member, { assigneeId: member }), member),
    ).toBeNull();
    expect(
      await gate(ticketEvent(workspaceId, 'comment.added', ticketId, guest, { body: 'x' }), guest),
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

  /**
   * 6.76 — a ticket that never existed and one the actor may not see are the SAME answer at the WRITE door too, not only on the read side.
   */
  it('a ticket that never existed and one the actor may not see answer IDENTICALLY', async () => {
    // The oracle that would otherwise sit one layer below Task 8's 404s: if the
    // gate distinguished "no such ticket" from "not yours", a member could
    // enumerate ticket ids by submitting claims against them and reading the
    // refusals. canSee cannot tell the two apart by design, and this asserts
    // the whole refusal object rather than the rule, because a differing
    // `reason` would be the oracle just as surely as a differing rule.
    //
    // AMENDED 2026-09-29, owner ruling (A): the actor was a member off the
    // ticket's project. A member is on every founded project now, so the actor who
    // cannot see the ticket is a GUEST (on no project by any rule, named on no
    // list).
    const workspaceId = newUlid();
    const theirs = newUlid();
    const guest = newUlid();
    const invisible = newUlid();
    await seedProject(db.pool, workspaceId, theirs);
    await seedGuest(db.pool, workspaceId, guest);
    await seedTicket(db.pool, { workspaceId, projectId: theirs, ticketId: invisible });

    const forInvisible = await gate(
      ticketEvent(workspaceId, 'ticket.transitioned', invisible, guest, { to: 'done' }),
      guest,
    );
    const forNonexistent = await gate(
      ticketEvent(workspaceId, 'ticket.transitioned', newUlid(), guest, { to: 'done' }),
      guest,
    );
    expect(forInvisible).toEqual(forNonexistent);
    // Non-vacuity: both really are refusals, not two nulls agreeing.
    expect(forInvisible).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });
  });

  /**
   * **THIS CASE USED TO ASSERT THE OPPOSITE, AND ITS INVERSION IS THE RULING.**
   *
   * It read: *"a workspace-entity event from a member who can see no ticket at
   * all passes this pass untouched — `workspace.renamed` is admitted, including
   * for a guest, and nothing in this module asks who may rename a workspace.
   * That is recorded as an open absence in `check-permission.ts` rather than
   * closed here on this task's own authority."*
   *
   * **Every word of that was measured and true**, and the entry it cites is
   * still in `check-permission.ts` — struck through, with the closure recorded
   * beside it rather than deleted. The owner ruled on 2026-09-19 that **a
   * member's or a guest's rename must be refused**. So the assertion inverts,
   * and the case is kept here rather than moved because the reason it exists is
   * unchanged: **it is the pin that makes the ruling loud.** A future edit that
   * re-opens the absence has to come through this test **(case 6.77)**. Its two
   * refusal arms — a MEMBER here, a GUEST in the next test — and the ADMIN
   * control after them are all read from this file.
   */
  it('the rename ruling: a MEMBER is refused, and the refusal names the act', async () => {
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
    expect(await gate(renamed, member)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      // By CONSTANT, not by string: the ruling closed a measured absence, and
      // pinning the sentence here is what stops a later edit from changing what
      // the refusal SAYS while every test stays green.
      reason: WORKSPACE_RENAME_REASON,
    });
  });

  it('the rename ruling refuses a GUEST too — the case the absence was originally measured on', async () => {
    const workspaceId = newUlid();
    const guest = newUlid();
    // `seedGuest`, not `seedMember(…, 'guest')`: the latter's role union is
    // `'owner' | 'admin' | 'member'`, and the gate here caught an earlier draft
    // that tried it. A guest is seeded by its own helper because a guest's
    // reach comes from `visibility.set` lists rather than from a project row.
    await seedGuest(db.pool, workspaceId, guest);

    const renamed = testEnvelope({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.renamed',
      payload: { name: 'Renamed' },
      actorId: guest,
    });
    expect(await gate(renamed, guest)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_RENAME_REASON,
    });
  });

  it('an ADMIN renames freely — the control the two refusals above need', async () => {
    // Without this, a gate that refused `workspace.renamed` outright — for
    // everyone, including the owner — would pass both cases above. That is the
    // same shape as `ticket.created`'s pair: the refusals say what is refused
    // only if something alongside them says what is not.
    const workspaceId = newUlid();
    const admin = newUlid();
    await seedMember(db.pool, workspaceId, admin, 'admin');

    const renamed = testEnvelope({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.renamed',
      payload: { name: 'Renamed' },
      actorId: admin,
    });
    expect(await gate(renamed, admin)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Check 5 — who may retarget a ticket's audience. Reported as
// `permission.role`: it is authority, not audience.
// ---------------------------------------------------------------------------

/**
 * 6.19 — cited on the block: `visibility.set` demands project-admin rights OR ticket creatorship, and the row’s four paths are the tests here — plain member refused, creator allowed (read from the LEDGER, since no projection carries it), project admin allowed, and project-admin rights asked of the TICKET’s project. The row’s "must name the ticket it is attached to" clause is check 3 above.
 */
/**
 * 6.80 — a RECORD rather than an assertion, kept beside the suite it describes: every planted defect in this task was killed by its NAMED mutation, and the counts are recorded rather than claimed. Nine mutations were run against the committed tree, each reverted before the next — including one where deleting the guest branch reddens on the REASON rather than the rule, because the guest then falls through to the project-membership refusal. A case asserting only `rule` would have survived it.
 */
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

  /**
   * 6.75 — creatorship is read from the LEDGER because no projection carries it: `proj_tickets` does not exist and `proj_visibility` has no creator column, so `getTicketCreator` selects `events.actor_id` on the ticket's own `ticket.created` row. The fixture change with teeth is asserted here too — `seedTicket` appends to the ledger, and without it this is the one line that reddens.
   */
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

  /**
   * 6.74 — check 5 must run AFTER check 4, or it is an existence oracle: an unseeable ticket answers the audience refusal, not the authority one. The actor that proves it is an ADMIN, who would otherwise pass check 5.
   */
  it('check 5 runs AFTER check 4: an unseeable ticket answers the audience refusal, not the authority one', async () => {
    // The ordering that keeps check 5 from being an existence oracle. The actor
    // is a workspace ADMIN, so hasProjectAdminRights is true on every project
    // that exists — meaning check 5 would ADMIT them on a real ticket and
    // REFUSE them on a nonexistent one, telling them apart. Run after check 4,
    // both answer the same sentence. Mutation: hoist the check 5 block above
    // the canSee call and the two lines below diverge.
    //
    // AMENDED 2026-09-29, owner ruling (A): the ticket was project-mode and the
    // admin sat off the roster. An admin is on every founded project now, so the
    // ticket the admin cannot see is an EXPLICIT one that does not list them —
    // the explicit-mode arm is unchanged by rule A. A guest could not stand in:
    // a guest has no project-admin rights, so the mutation would not diverge.
    const workspaceId = newUlid();
    const projectId = newUlid();
    const admin = newUlid();
    const listed = newUlid();
    const invisible = newUlid();
    await seedProject(db.pool, workspaceId, projectId);
    await seedMember(db.pool, workspaceId, admin, 'admin');
    await seedMember(db.pool, workspaceId, listed, 'member');
    await seedTicket(db.pool, { workspaceId, projectId, ticketId: invisible, createdBy: newUlid() });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, invisible, 'explicit', [listed])]);

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

// ---------------------------------------------------------------------------
// Check 6 — the soft delete's authority.
//
// ADDED BY THE SOFT-DELETE CHANGE, not by the plan this file otherwise tests,
// and the first thing worth saying is that it is a SIXTH check rather than a
// restatement of one of the five. Before it existed, `ticket.deleted` was
// registered in the domain and appeared in NO branch of this module, so it fell
// through the whole gate: the only thing standing between a workspace GUEST and
// a deleted ticket was check 4's `canSee`, which a guest can satisfy by being
// named on one explicit list. That is the measured hole
// (`docs/lanes/executor-state.md`: *"Nothing gates `ticket.deleted`"*).
//
// The level is `hasProjectAdminRights` and NOT `ADMIN_ONLY_TYPES`, on the same
// line `visibility.set` already draws one branch above: a project admin runs
// their project's people and their tickets' visibility, and deleting one ticket
// is that same act on that same object. Retiring the PROJECT is the
// workspace's, which is why `project.archived` sits in `ADMIN_ONLY_TYPES` and
// this does not.
// ---------------------------------------------------------------------------

/**
 * A founded project with ONE live ticket, its own `proj_visibility` row, and
 * three people the cases below walk: a plain project MEMBER, a project ADMIN
 * (workspace role `member` plus this project's flag — the cell that separates a
 * project gate from a workspace one), and a workspace OWNER.
 *
 * The ticket is `seedTicket`'s default PROJECT visibility mode, so every one of
 * those three can SEE it and nothing below is a check-4 case wearing a check-6
 * label. That is the property that makes these assertions about authority at
 * all: an actor who cannot see the ticket is refused three lines earlier, with a
 * different sentence, and would prove nothing here.
 */
async function deletableTicket() {
  const workspaceId = newUlid();
  const projectId = newUlid();
  const ticketId = newUlid();
  const member = newUlid();
  const projectAdmin = newUlid();
  const owner = newUlid();
  await seedProject(db.pool, workspaceId, projectId);
  await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);
  await seedMember(db.pool, workspaceId, projectAdmin, 'member', [{ projectId, projectAdmin: true }]);
  await seedMember(db.pool, workspaceId, owner, 'owner', [{ projectId, projectAdmin: true }]);
  await seedTicket(db.pool, { workspaceId, projectId, ticketId });
  return { workspaceId, projectId, ticketId, member, projectAdmin, owner };
}

/** The pair's two envelopes, built the way a client sends them: empty payload. */
const deleteTicket = (workspaceId: string, ticketId: string, actorId: string): EventEnvelope =>
  ticketEvent(workspaceId, 'ticket.deleted', ticketId, actorId);
const restoreTicket = (workspaceId: string, ticketId: string, actorId: string): EventEnvelope =>
  ticketEvent(workspaceId, 'ticket.restored', ticketId, actorId);

describe('check 6 — who may delete or restore a ticket', () => {
  it('planted defect: a plain project MEMBER is refused, naming the fault — and the project admin beside them is ADMITTED', async () => {
    // MEASURED on main before this branch existed: `ticket.deleted` from a
    // plain project member — and from a guest, below — was ADMITTED, because a
    // newly registered ticket event appears in no other branch of this module.
    //
    // Both halves go through the IDENTICAL call with only the session user
    // changed. The admitted half is the control: without it, a branch that
    // refused every delete would satisfy the first assertion and this file
    // would certify a feature nobody can use.
    const { workspaceId, ticketId, member, projectAdmin } = await deletableTicket();

    expect(await gate(deleteTicket(workspaceId, ticketId, member), member)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: ticketDeleteAuthorityReason('delete'),
    });
    // A FRESH envelope naming the admin as its actor, not the member's envelope
    // re-gated under a second session: `checkRolePermission` refuses an envelope
    // whose `actorId` is not the session user (`IDENTITY_SPOOF_REASON`), so
    // reusing the member's would refuse the admin one check earlier and the
    // control would be about identity rather than authority.
    expect(await gate(deleteTicket(workspaceId, ticketId, projectAdmin), projectAdmin)).toBeNull();
  });

  it('a workspace OWNER is admitted, and so is an ADMIN who is on the project', async () => {
    // `hasProjectAdminRights` answers true for `owner` and `admin` at the
    // workspace level, so an admin needs no roster row — but they DO need
    // check 4, and the case below is where an admin who cannot see the ticket
    // is answered. (AMENDED 2026-09-29, owner ruling (A): an admin with no roster
    // row is now admitted too, asserted at the foot of this case.)
    const { workspaceId, ticketId, owner } = await deletableTicket();
    expect(await gate(deleteTicket(workspaceId, ticketId, owner), owner)).toBeNull();

    // A separate world for the admin, because the roster above is the thing
    // being varied: this one puts the admin ON the project, which is the only
    // way the workspace-level arm of `hasProjectAdminRights` is reachable.
    const second = await deletableTicket();
    const admin = newUlid();
    await seedMember(db.pool, second.workspaceId, admin, 'admin', [{ projectId: second.projectId }]);
    expect(await gate(deleteTicket(second.workspaceId, second.ticketId, admin), admin)).toBeNull();

    // Rule A: the same admin with NO roster row is on the project all the same.
    const third = await deletableTicket();
    const rosterless = newUlid();
    await seedMember(db.pool, third.workspaceId, rosterless, 'admin');
    expect(await gate(deleteTicket(third.workspaceId, third.ticketId, rosterless), rosterless)).toBeNull();
  });

  it('planted defect: a GUEST explicitly named on the ticket is refused — check 4 admits them and check 6 does not', async () => {
    // The measured hole, in its exact shape. The guest is put on the ticket's
    // explicit list, so `canSee` answers TRUE and check 4 passes: this refusal
    // can only come from check 6. A guest NOT on the list is refused three
    // lines earlier with `TICKET_NOT_VISIBLE_REASON`, which would make this case
    // pass for a reason unrelated to the property it names.
    //
    // Mutation: delete the check-6 branch. This line returns null — but so does
    // it for the member above, so the two cases together are what pin the gate.
    const { workspaceId, projectId, ticketId } = await deletableTicket();
    const guest = newUlid();
    await seedGuest(db.pool, workspaceId, guest);
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'explicit', [guest])]);

    // The precondition, asserted rather than assumed: the guest really can read
    // this ticket, so the refusal below is the authority gate and not the
    // audience one. `ticket.transitioned` is the probe because it is the event
    // check 4 alone decides.
    expect(await gate(ticketEvent(workspaceId, 'ticket.transitioned', ticketId, guest, { to: 'doing' }), guest)).toBeNull();

    expect(await gate(deleteTicket(workspaceId, ticketId, guest), guest)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: ticketDeleteAuthorityReason('delete'),
    });
  });

  it('check 6 runs AFTER check 4: an admin who cannot see the ticket answers the AUDIENCE refusal, so authority is not a read bypass', async () => {
    // A workspace admin holds project-admin rights on every project that exists
    // — including this one — so a check-6-first ordering would ADMIT them on a
    // real ticket and REFUSE them on one nobody has, telling the two apart and
    // rebuilding the existence oracle Task 8 removed. Run after check 4, both
    // answer the same sentence.
    //
    // MEASURED, in the same invocation: hoisting the check-6 block above the
    // `canSee` call makes this line return `ticketDeleteAuthorityReason('delete')`
    // for BOTH envelopes, while the `toBeNull` in the owner case two tests up
    // stays green — a mutation this case alone kills.
    //
    // AMENDED 2026-09-29, owner ruling (A): the admin was "in the workspace, on no
    // project" and the ticket project-mode. An admin is on every founded project
    // now, so the ticket is made EXPLICIT to the plain member alone — the
    // explicit-mode arm (an unlisted admin does not see it) is unchanged.
    const { workspaceId, ticketId, member } = await deletableTicket();
    const admin = newUlid();
    await seedMember(db.pool, workspaceId, admin, 'admin');
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'explicit', [member])]);
    // The ticket is explicit to the member and this admin is not listed, so they
    // cannot see it — asserted through the probe rather than inferred, because
    // "the admin cannot see it" is the premise of the case.
    expect(await gate(ticketEvent(workspaceId, 'ticket.transitioned', ticketId, admin, { to: 'doing' }), admin)).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });

    const onInvisible = await gate(deleteTicket(workspaceId, ticketId, admin), admin);
    const onNonexistent = await gate(deleteTicket(workspaceId, newUlid(), admin), admin);
    expect(onInvisible).toEqual(onNonexistent);
    expect(onInvisible).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });
  });

  it('a caller with no membership at all is refused before either audience or authority is asked', async () => {
    // The boundary of the pair above: `resolveEffectiveRole` answers
    // `workspaceRole: null`, so check 1 refuses. Cheap, and it keeps this block
    // from reading as if check 6 were the first thing a stranger meets.
    const { workspaceId, ticketId } = await deletableTicket();
    const stranger = newUlid();
    const answer = await gate(deleteTicket(workspaceId, ticketId, stranger), stranger);
    expect(answer).toMatchObject({ refused: true, rule: PERMISSION_ROLE_RULE });
    expect(answer?.reason).not.toBe(ticketDeleteAuthorityReason('delete'));
  });

  it('the UNDO is gated identically: the plain member is refused, the project admin is admitted', async () => {
    // `ticket.restored` is the same act in reverse and gets the same gate, on
    // purpose. If the undo were the looser door, a member refused the delete
    // could still close the ticket's own history by restoring a row an admin
    // removed — and the asymmetry would be invisible, because the refusing half
    // only ever runs on the path the member was already denied.
    const { workspaceId, ticketId, member, projectAdmin } = await deletableTicket();
    // The realistic fixture: a genuinely deleted row, so the engine's own
    // `not-deleted` guard cannot be what refuses the member below. `checkPermission`
    // runs BEFORE the engine, but a fixture that would be refused for a second,
    // unrelated reason is a fixture that makes this case pass by accident.
    await db.pool.query('UPDATE proj_tickets SET deleted_at = now(), deleted_by = $2 WHERE ticket_id = $1', [
      ticketId,
      projectAdmin,
    ]);

    expect(await gate(restoreTicket(workspaceId, ticketId, member), member)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: ticketDeleteAuthorityReason('restore'),
    });
    expect(await gate(restoreTicket(workspaceId, ticketId, projectAdmin), projectAdmin)).toBeNull();
  });

  it('the delete and restore sentences differ, because they instruct different repairs', async () => {
    // A shared sentence would leave an admin told to "grant delete rights" when
    // the act they attempted was an undo. The two strings are built by one
    // function taking the act, so this pins that the argument is not dropped.
    expect(ticketDeleteAuthorityReason('delete')).not.toBe(ticketDeleteAuthorityReason('restore'));
    expect(ticketDeleteAuthorityReason('delete')).toContain('delete');
    expect(ticketDeleteAuthorityReason('restore')).toContain('restore');
  });

  it('an unreadable ticket cannot be deleted even by an admin — the resolution failure is named', async () => {
    // The `getTicketStateFromDb` null arm. It is reachable only where the two
    // projections DISAGREE — `canSee` answers from `proj_visibility`, this gate
    // reads `proj_tickets`, and a visibility row with no head row is the
    // recorded divergence class (case 6.57). That world is constructed here
    // rather than left to be met by accident, because the alternative — no case
    // at all — would make the branch an assertion nobody has ever run.
    //
    // Mutation: replace the null arm with `return null` and this case admits an
    // admin on a ticket whose project cannot be resolved, which is a delete by
    // somebody whose rights over the project were never established.
    const { workspaceId, ticketId, projectAdmin } = await deletableTicket();
    await db.pool.query('DELETE FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
    // The precondition: `proj_visibility` still stands, so check 4 passes and
    // the branch below is genuinely reached.
    expect(await gate(ticketEvent(workspaceId, 'ticket.transitioned', ticketId, projectAdmin, { to: 'doing' }), projectAdmin)).toBeNull();

    expect(await gate(deleteTicket(workspaceId, ticketId, projectAdmin), projectAdmin)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: TICKET_DELETE_UNRESOLVED_REASON,
    });
  });
});

// ---------------------------------------------------------------------------
// E6-17 — who may be NAMED by an assignment or a collaborator add. Reported as
// `permission.role`: it is the named person's role, resolved through the same
// `resolveEffectiveRole` the gate reads the actor's through.
// ---------------------------------------------------------------------------
describe('E6-17 — the person an assignment names must be in the workspace', () => {
  /** A member on a project, and a ticket in it every member can see. */
  async function assignableTicket() {
    const { workspaceId, projectId } = await workspace();
    const member = newUlid();
    const ticketId = newUlid();
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId, projectAdmin: false }]);
    await seedTicket(db.pool, { workspaceId, projectId, ticketId, createdBy: member });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'workspace')]);
    return { workspaceId, projectId, member, ticketId };
  }
  const assign = (workspaceId: string, ticketId: string, actorId: string, assigneeId: string | null) =>
    ticketEvent(workspaceId, 'ticket.assigned', ticketId, actorId, { assigneeId });
  const addCollaborator = (workspaceId: string, ticketId: string, actorId: string, userId: string) =>
    ticketEvent(workspaceId, 'ticket.collaborator_added', ticketId, actorId, { userId });

  /**
   * 6.151 — planted defect: `ticket.assigned` and `ticket.collaborator_added`
   * naming someone with no role in the workspace — a fresh ULID nobody owns,
   * a signed-up person who is not a member, the string `nobody-here` — are
   * refused `permission.role` with the named person's sentence. MEASURED
   * before the fix through `POST /v1/events` as the owner: all four committed,
   * and the board rendered `"assigneeId":"nobody-here"` on the card.
   */
  it('planted defect: naming a non-member, a fresh ULID or "nobody-here" is refused, and says so', async () => {
    const { workspaceId, ticketId, member } = await assignableTicket();
    const refusal = { refused: true, rule: PERMISSION_ROLE_RULE, reason: NAMED_PERSON_NOT_IN_WORKSPACE_REASON };
    // A signed-up person with no membership here: seeded as a member of a
    // DIFFERENT workspace, so the lookup is tenancy-scoped and not a bare
    // "does this id exist anywhere".
    const strangerElsewhere = newUlid();
    await seedMember(db.pool, newUlid(), strangerElsewhere, 'member');
    for (const named of [newUlid(), strangerElsewhere, 'nobody-here']) {
      expect(await gate(assign(workspaceId, ticketId, member, named), member), `assign ${named}`).toEqual(refusal);
      expect(
        await gate(addCollaborator(workspaceId, ticketId, member, named), member),
        `collaborator ${named}`,
      ).toEqual(refusal);
    }
  });

  /**
   * 6.152 — the controls for 6.151, each on a line the refusal above could
   * have been written to catch by mistake: a MEMBER and a GUEST are both in
   * the workspace and pass (whether a guest can see the ticket is the read
   * side's question, case 7.27); `assigneeId: null` names nobody and passes;
   * `collaborator_removed` of a non-member is a cleanup and passes; and an
   * actor who cannot see the ticket is answered with the audience sentence
   * BEFORE the named person's membership is consulted, so the door never
   * discloses whether somebody is in the workspace to a person with no
   * standing on the ticket.
   */
  it('a member or guest may be named, unassigning and removing pass, and the audience refusal comes first', async () => {
    const { workspaceId, projectId, ticketId, member } = await assignableTicket();
    const other = newUlid();
    const guest = newUlid();
    await seedMember(db.pool, workspaceId, other, 'member', [{ projectId, projectAdmin: false }]);
    await seedGuest(db.pool, workspaceId, guest);
    expect(await gate(assign(workspaceId, ticketId, member, other), member)).toBeNull();
    expect(await gate(assign(workspaceId, ticketId, member, guest), member)).toBeNull();
    expect(await gate(addCollaborator(workspaceId, ticketId, member, guest), member)).toBeNull();
    expect(await gate(assign(workspaceId, ticketId, member, null), member)).toBeNull();
    expect(
      await gate(ticketEvent(workspaceId, 'ticket.collaborator_removed', ticketId, member, { userId: 'nobody-here' }), member),
    ).toBeNull();

    // Ordering: an admin of ANOTHER workspace naming a non-member on a ticket
    // they cannot see gets the audience refusal, not the membership one — the
    // role gate refuses a non-member actor even earlier, so the actor here is
    // a member of THIS workspace who cannot see the ticket.
    //
    // AMENDED 2026-09-29, owner ruling (A): "not on the ticket's project, with the
    // ticket in project mode". A member is on every founded project now, so the
    // ticket is EXPLICIT to `member` alone, which an unlisted member cannot see.
    const outsider = newUlid();
    await seedMember(db.pool, workspaceId, outsider, 'member');
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'explicit', [member])]);
    expect(await gate(assign(workspaceId, ticketId, outsider, 'nobody-here'), outsider)).toEqual({
      refused: true,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });
  });
});

/**
 * 29.135 (spec DC-4: "Permission: the same right as `ticket.field_set` on the ticket"). Nothing in the permission
 * files names either type: `checkRolePermission` has no branch for them and `checkVisibilityPermission` judges every
 * ticket-kind event it has no arm for by `canSee`. Both types walk the same three readers in ONE `it`, so a gate that
 * answered `ticket.decided` by type in either direction goes red against `ticket.field_set`'s answer beside it.
 */
describe("29.135 ticket.decided has ticket.field_set's right", () => {
  it('29.135 a guest who cannot see the ticket is refused both; the same guest shared explicitly, and a member, pass both', async () => {
    for (const [type, payload] of [
      ['ticket.decided', { outcome: 'Yes' }],
      ['ticket.field_set', { fieldId: 'title', value: 'x' }],
    ] as const) {
      const { workspaceId, projectId } = await workspace();
      const guest = newUlid();
      const member = newUlid();
      const ticketId = newUlid();
      await seedGuest(db.pool, workspaceId, guest);
      await seedMember(db.pool, workspaceId, member, 'member', [{ projectId }]);
      await seedTicket(db.pool, { workspaceId, projectId, ticketId }); // project mode by default
      expect(await gate(ticketEvent(workspaceId, type, ticketId, guest, payload), guest), type).toEqual({
        refused: true,
        rule: PERMISSION_VISIBILITY_RULE,
        reason: TICKET_NOT_VISIBLE_REASON,
      });
      expect(await gate(ticketEvent(workspaceId, type, ticketId, member, payload), member), type).toBeNull(); // control: a member
      await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'explicit', [guest])]);
      expect(await gate(ticketEvent(workspaceId, type, ticketId, guest, payload), guest), type).toBeNull(); // control: shared
    }
  });
});
