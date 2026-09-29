import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ticketKey } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { ticketNumber, ticketNumbers } from '../../src/read/ticket-numbers.js';
import { visibleProjects } from '../../src/read/visible-projects.js';
import { workspaceIdentityFromLedger } from '../../src/workspaces/workspace-name.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedProject, seedTicket } from '../helpers/seed.js';

/**
 * The ticket key — `<workspace prefix><project prefix>-<number>` (owner spec
 * 2026-09-20).
 *
 * ## Three halves, three sources, and every one of them is the LEDGER
 *
 * The key is composed from a workspace prefix (a founding claim, or a
 * derivation from the name), a project prefix (a founding claim, or the same
 * derivation) and a number (the ticket's position among its project's
 * creations). Nothing here is stored outside the ledger, so nothing here can
 * disagree with a rebuild — which is the property `tools/verify-projections.ts`
 * enforces and the reason this design derives rather than allocates.
 *
 * ## The ORDER the number comes from is the case worth reading
 *
 * `ticketNumbers` orders by `workspace_seq`. The tests below seed tickets in a
 * known order and then assert the numbers, because the whole rule is "position
 * in the ledger" and a suite that only checked `1, 2, 3` on a tidily-inserted
 * fixture would pass equally against `ticket_id` order, insertion order, or a
 * clock. The subset case is the one that distinguishes a window from a counter.
 */
describe('13.1004-13.1013 the ticket key', () => {
  let db: TestDatabase;
  const ws = newUlid();
  /** Two projects in ONE workspace, so a scoped counter has something to leak into. */
  const shop = newUlid();
  const other = newUlid();
  /** The shop's three tickets, in creation order, named across cases. */
  const shopTickets: string[] = [];

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedProject(db.pool, ws, shop, 'Shop operations', undefined, 'SO');
    await seedProject(db.pool, ws, other, 'Delivery');
  });

  afterAll(async () => {
    await db.drop();
  });

  it('13.1004 — numbers a project’s tickets by their position in the ledger', async () => {
    const a = newUlid();
    const b = newUlid();
    const c = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: shop, ticketId: a });
    await seedTicket(db.pool, { workspaceId: ws, projectId: shop, ticketId: b });
    await seedTicket(db.pool, { workspaceId: ws, projectId: shop, ticketId: c });

    shopTickets.push(a, b, c);
    const numbers = await ticketNumbers(db.pool, ws, [a, b, c]);
    expect([numbers.get(a), numbers.get(b), numbers.get(c)]).toEqual([1, 2, 3]);
    // And the key they compose, at the surface a reader sees.
    expect(ticketKey('CC', 'SO', numbers.get(c)!)).toBe('CCSO-3');
  });

  it('13.1005 — the counter is per PROJECT: a second project starts at 1', async () => {
    // Without this, a workspace-wide counter and a per-project one are the same
    // function on a fixture with one project — which is every fixture above.
    const d = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: other, ticketId: d });
    expect((await ticketNumbers(db.pool, ws, [d])).get(d)).toBe(1);
  });

  it('13.1006 — a SUBSET keeps its project-wide numbers; the filter is applied AFTER the window', async () => {
    // THE CASE THAT DISTINGUISHES A WINDOW FROM A COUNTER. Asking for the third
    // ticket alone must answer 3, not 1. A query that filtered the ids into the
    // window's input would renumber every survivor and answer 1 — and it would
    // agree with the correct implementation on every full-list read above.
    const subset = await ticketNumbers(db.pool, ws, [newUlid()]);
    expect(subset.size).toBe(0);
    // ...and the same call shape on an id that DOES exist. Without this pair,
    // `size === 0` would also pass against a `ticketNumbers` that always
    // returned an empty map.
    expect((await ticketNumbers(db.pool, ws, [shopTickets[2]!])).get(shopTickets[2]!)).toBe(3);
    // The project's own three, in order — read as a SUBSET, so the numbers are
    // the project-wide ones and not 1, 2, 3-of-three.
    const shopOnly = await ticketNumbers(db.pool, ws, shopTickets);
    expect(shopTickets.map((id) => shopOnly.get(id))).toEqual([1, 2, 3]);
    // And one at a time, which is the shape a single-ticket read uses.
    expect((await ticketNumbers(db.pool, ws, [shopTickets[2]!])).get(shopTickets[2]!)).toBe(3);

    const all = await ticketNumbers(db.pool, ws);
    // The other project's ticket is in the same workspace and is number 1 of ITS
    // project, so the workspace map is `1, 1, 2, 3` and NOT `1, 2, 3, 4`: a
    // workspace-wide counter would produce the latter.
    expect([...all.values()].sort((x, y) => x - y)).toEqual([1, 1, 2, 3]);
    // The fixture holds exactly four tickets, so the whole-workspace map is the
    // positive control for the three assertions above: a `ticketNumbers` that
    // returned an empty map would satisfy `size === 0` on the subset and fail
    // here.
    expect(all.size).toBe(4);
  });

  it('13.1007 — one ticket and no event answers null rather than inventing a number', async () => {
    const all = await ticketNumbers(db.pool, ws);
    const one = [...all.keys()][0]!;
    expect(await ticketNumber(db.pool, ws, one)).toBe(1);
    expect(await ticketNumber(db.pool, ws, newUlid())).toBeNull();
  });

  it('13.1008 — a project prefix that was ENTERED is used verbatim', async () => {
    const eff = await resolveEffectiveRole(db.pool, newUlid(), ws);
    const projects = await visibleProjects(db.pool, eff, ws);
    // `resolveEffectiveRole` for a stranger has no projects, so this asserts the
    // owner path separately below; here the store is read directly through the
    // same function the route uses.
    expect(projects).toEqual([]);
    const owner = newUlid();
    await seedMember(db.pool, ws, owner, 'owner');
    const ownerEff = await resolveEffectiveRole(db.pool, owner, ws);
    const visible = await visibleProjects(db.pool, ownerEff, ws);
    const shopRow = visible.find((p) => p.projectId === shop)!;
    expect(shopRow.prefix).toBe('SO');
  });

  it('13.1009 — a project with NO entered prefix derives one from its name', async () => {
    const owner = newUlid();
    await seedMember(db.pool, ws, owner, 'owner');
    const eff = await resolveEffectiveRole(db.pool, owner, ws);
    const visible = await visibleProjects(db.pool, eff, ws);
    // 'Delivery' -> DE, and the stored 'SO' beside it is untouched — the two
    // branches run in ONE call, so a resolver that applied the derivation to
    // everything would fail on the row above.
    expect(visible.find((p) => p.projectId === other)!.prefix).toBe('DE');
    expect(visible.find((p) => p.projectId === shop)!.prefix).toBe('SO');
  });

  it('13.1010 — the prefix does not depend on WHO is asking, including a deduplicated one', async () => {
    // Two projects whose names collide on `DE`, so the suffixing path is live.
    const second = newUlid();
    await seedProject(db.pool, ws, second, 'Design');
    const owner = newUlid();
    await seedMember(db.pool, ws, owner, 'owner');

    const ownerEff = await resolveEffectiveRole(db.pool, owner, ws);
    const asOwner = await visibleProjects(db.pool, ownerEff, ws);
    const deliveryPrefix = asOwner.find((p) => p.projectId === other)!.prefix;
    const designPrefix = asOwner.find((p) => p.projectId === second)!.prefix;

    // The two are DISTINCT, which is the owner's uniqueness ruling: a second
    // `DE` in one workspace would make `CCDE-1` name two tickets.
    expect(deliveryPrefix).toBe('DE');
    expect(designPrefix).not.toBe(deliveryPrefix);

    // And no viewer may shift what another viewer reads. The resolution runs over the WHOLE workspace before the role
    // filter, so one owner's answer cannot depend on another caller's rows. It
    // is asserted through a SECOND OWNER rather than a guest only because a
    // guest's list is empty by construction and could not show a difference;
    // what the pair pins is that the answer is a function of the workspace and
    // not of the asker.
    const ownerAgain = newUlid();
    await seedMember(db.pool, ws, ownerAgain, 'owner');
    const secondEff = await resolveEffectiveRole(db.pool, ownerAgain, ws);
    const asSecondOwner = await visibleProjects(db.pool, secondEff, ws);
    expect(asSecondOwner.map((p) => [p.projectId, p.prefix])).toEqual(
      asOwner.map((p) => [p.projectId, p.prefix]),
    );
    // Amended 2026-09-29, owner ruling (A): a MEMBER on no roster is on every
    // founded project, so their list is the owner's and the prefixes agree too.
    const member = newUlid();
    await seedMember(db.pool, ws, member, 'member', []);
    const memberEff = await resolveEffectiveRole(db.pool, member, ws);
    const asMember = await visibleProjects(db.pool, memberEff, ws);
    expect(asMember.map((p) => [p.projectId, p.prefix])).toEqual(
      asOwner.map((p) => [p.projectId, p.prefix]),
    );
  });

  it('13.1011 — the workspace prefix is derived from the name for a founding claim that never carried one', async () => {
    const legacy = newUlid();
    const event = testEnvelope({
      workspaceId: legacy,
      entity: { kind: 'workspace', id: legacy },
      type: 'workspace.created',
      payload: { name: 'Convenience Corner' },
      actorId: newUlid(),
    });
    await appendTestEvent(db.pool, event);
    // The owner's own row, and the derivation that has to reproduce it: the
    // founding event has no `prefix` key at all.
    expect(await workspaceIdentityFromLedger(db.pool, legacy)).toEqual({
      name: 'Convenience Corner',
      prefix: 'CC',
    });
  });

  it('13.1012 — a stored workspace prefix wins, and a rename moves the NAME and never the prefix', async () => {
    const modern = newUlid();
    const actor = newUlid();
    await appendTestEvent(
      db.pool,
      testEnvelope({
        workspaceId: modern,
        entity: { kind: 'workspace', id: modern },
        type: 'workspace.created',
        payload: { name: 'Corner Shop', prefix: 'XY' },
        actorId: actor,
      }),
    );
    expect(await workspaceIdentityFromLedger(db.pool, modern)).toEqual({
      name: 'Corner Shop',
      prefix: 'XY',
    });

    // A rename. The name is a LATER claim and moves; the prefix is immutable and
    // does not — otherwise every ticket key in the workspace would change under
    // a reader who had already quoted one. `workspace.renamed` carries no
    // `prefix` key at all (its schema is `.strict()`), so this is also the case
    // that would break a fold reading the prefix off the LATEST event.
    await appendTestEvent(
      db.pool,
      testEnvelope({
        workspaceId: modern,
        entity: { kind: 'workspace', id: modern },
        type: 'workspace.renamed',
        payload: { name: 'Corner Emporium' },
        actorId: actor,
      }),
    );
    expect(await workspaceIdentityFromLedger(db.pool, modern)).toEqual({
      name: 'Corner Emporium',
      prefix: 'XY',
    });
  });

  it('13.1027 — a rename does not move a DERIVED prefix either, which 13.1012 could not see', async () => {
    // ⚠ THE CASE THE SUITE WAS MISSING, and it was missing it in the way that
    // matters: 13.1012 stores a prefix, so it only ever exercised the forward
    // (stored) branch. Every workspace in the ledger takes the OTHER branch —
    // none of them entered a prefix — so the derived half was the one that
    // shipped, and it read the CURRENT name: renaming this workspace to
    // 'Corner Emporium' moved the prefix from `CC` to `CE` and rewrote every
    // ticket key in it. Measured by an independent reviewer against a probe
    // database; the fix is that the derivation reads the FOUNDING name.
    const derived = newUlid();
    const actor = newUlid();
    await appendTestEvent(
      db.pool,
      testEnvelope({
        workspaceId: derived,
        entity: { kind: 'workspace', id: derived },
        type: 'workspace.created',
        payload: { name: 'Convenience Corner' },
        actorId: actor,
      }),
    );
    expect(await workspaceIdentityFromLedger(db.pool, derived)).toEqual({
      name: 'Convenience Corner',
      prefix: 'CC',
    });

    await appendTestEvent(
      db.pool,
      testEnvelope({
        workspaceId: derived,
        entity: { kind: 'workspace', id: derived },
        type: 'workspace.renamed',
        payload: { name: 'Corner Emporium' },
        actorId: actor,
      }),
    );
    // The NAME moves — that is what a rename is for. The PREFIX does not, and
    // `CE` here would mean every `CCSO-*` key in the workspace had silently
    // become `CESO-*`.
    expect(await workspaceIdentityFromLedger(db.pool, derived)).toEqual({
      name: 'Corner Emporium',
      prefix: 'CC',
    });
  });

  it('13.1013 — a workspace with no naming event answers null for both halves', async () => {
    expect(await workspaceIdentityFromLedger(db.pool, newUlid())).toEqual({
      name: null,
      prefix: null,
    });
  });
});
