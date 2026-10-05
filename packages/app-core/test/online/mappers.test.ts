import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_PREFS, type RosterMember } from '../../src/view-types.js';
import { SYSTEM_ACTOR_AUTO_CLOSE, SYSTEM_ACTOR_NAMES } from '@gisik-nokma/domain';
import { actorLabel } from '../../src/provenance.js';
import type { BoardView } from '../../src/view-types.js';
import type {
  AttentionResponse,
  BoardResponse,
  BoardTicketCard,
  DeletedItemsRead,
  MemberListResponse,
  ListCard,
  ListResponse,
  MyWorkResponse,
  SearchResponse,
  TicketCard,
  WorkflowResponse,
} from '@gisik-nokma/domain';
import {
  MappingError,
  SERVING_GAPS,
  ServingGapError,
  UnexpressibleFilterError,
  boardWorkspaceId,
  mapActorNames,
  mapActors,
  mapAttention,
  mapBoardView,
  mapDeletedItems,
  mapGroupRows,
  mapHistory,
  mapIngestResults,
  mapListPage,
  mapMyWork,
  mapPreferences,
  mapRollup,
  mapSearchHits,
  mapTicketLinks,
  mapTicketRead,
  mapWorkflowDef,
  mapWorkspaceRefs,
  mapWorkspaceSettings,
  rosterByActorId,
  toClientFilterSpec,
  toServerFilterSpec,
  toServerPreferences,
} from '../../src/online/mappers.js';

/**
 * Every fixture below is typed with the SERVER's own response type, imported as
 * a TYPE from `@gisik-nokma/domain` (erased at runtime, so no `dist` decides
 * what this file sees). A fixture that drifted from the shipped shape would
 * therefore fail `typecheck`, not merely disagree with a comment — which is the
 * only thing that stops a client-side mapper suite from testing a body nobody
 * sends.
 *
 * Cases 3.37, 3.38 and 3.39 (`test-cases/03-foundation-ledger.md`).
 */
const ANSELMA = '01J9GUSA000000000000000000';
const BIREN = '01J9GUSB000000000000000000';

function serverCard(overrides: Partial<TicketCard> = {}): TicketCard {
  return {
    ticketId: '01J9GTKA000000000000000000',
    workspaceId: '01J9GWS0000000000000000000',
    projectId: '01J9GPRJ000000000000000000',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf-errand',
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: ANSELMA,
    collaboratorIds: [],
    title: 'File the GST return',
    dueDate: { state: 'never-claimed' },
    // Spec 2026-09-22: the card carries its key, or `null` when the ledger holds no prefix.
    key: 'CCSO-7',
    // REQUIRED on the wire (spec 2026-09-22) and read unconditionally by both
    // card mappers; `P2` is the birth default `assembleTicketCards` serves for a
    // ticket nobody has re-prioritised. The `3.968`/`3.969` cases below are the
    // ones about priority itself.
    priority: {
      value: 'P2',
      actorId: ANSELMA,
      clientTime: '2026-08-19T09:58:12.000Z',
      serverTime: '2026-08-19T10:00:00.000Z',
    },
    fields: {},
    stateProvenance: {
      actorId: ANSELMA,
      clientTime: '2026-08-19T09:58:12.000Z',
      serverTime: '2026-08-19T10:00:00.000Z',
      cause: null,
    },
    rollup: null,
    closed: null,
    // REQUIRED on the wire (spec §8.1) and read unconditionally by
    // `mapListRow`; `null` here is the wire's word for "never ranked", which is
    // the default for every `3.4x` case in this file that is not about rank.
    rank: null,
    ...overrides,
  };
}

/**
 * `serverCard()`, widened onto `BoardTicketCard` — the wire shape ONLY the
 * board serves (owner request, 2026-09-23: parent-key badge, epic chip).
 * `parent`/`epic` default to `null` (a root ticket under no epic), the same
 * "nothing to narrow by" default `boardCardSeed` (`test/helpers/seed.ts`)
 * takes for the CLIENT-side fixture one layer over — a case that wants
 * either badge passes one.
 */
function serverBoardCard(overrides: Partial<BoardTicketCard> = {}): BoardTicketCard {
  const { parent, epic, ...cardOverrides } = overrides;
  return {
    ...serverCard(cardOverrides),
    parent: parent ?? null,
    epic: epic ?? null,
  };
}

describe('3.37 mapRollup — three fields line up, the fourth is refused', () => {
  it('drops uncategorizedChildren when it is zero and keeps the other three', () => {
    expect(
      mapRollup({
        totalChildren: 8,
        terminalChildren: 5,
        uncategorizedChildren: 0,
        restrictedCount: 2,
      }),
    ).toEqual({ totalChildren: 8, terminalChildren: 5, restrictedCount: 2 });
  });

  it('answers null for null — a childless parent has no rollup, not a zeroed one', () => {
    expect(mapRollup(null)).toBeNull();
  });

  it('3.37 REFUSES a nonzero uncategorizedChildren rather than rendering an incomplete total as a complete one', () => {
    expect(() =>
      mapRollup({
        totalChildren: 8,
        terminalChildren: 5,
        uncategorizedChildren: 1,
        restrictedCount: 0,
      }),
    ).toThrow(/rollup\.uncategorizedChildren.*counted 1 children/s);
    // It is a MappingError and not a ServingGapError: the server said something
    // true and complete, and this client cannot hold it. Nobody owes a route.
    expect(() =>
      mapRollup({
        totalChildren: 8,
        terminalChildren: 5,
        uncategorizedChildren: 1,
        restrictedCount: 0,
      }),
    ).toThrow(MappingError);
  });

  it('3.37 refuses a rollup missing the fourth field at all — silence is not a zero', () => {
    expect(() => mapRollup({ totalChildren: 1, terminalChildren: 0, restrictedCount: 0 })).toThrow(
      /rollup\.uncategorizedChildren: expected a number/,
    );
  });
});

describe('3.37 mapActors — {userId, displayName, role} is a rename plus the role', () => {
  it('throws MappingError naming the path on a garbled member', () => {
    expect(() => mapActors({ workspaceId: 'w', members: [{ userId: 1 }] })).toThrow(
      /members\.members\[0\]\.userId: expected a string/,
    );
  });
});

/**
 * 13.760 — `role` is CARRIED end to end, and an entry without one is REFUSED.
 *
 * This case exists for the one failure shape this repo has already been bitten
 * by: a field the server sends and the client silently drops, where every VIEW
 * test drives a fake data source and therefore cannot see the drop at all. So
 * the assertion here is made at the mapper — the single seam the wire crosses —
 * against a fixture typed as the SERVER's own `MemberListResponse`, which is
 * what stops this suite from testing a body nobody sends (see the file
 * docblock).
 *
 * The two arms are deliberately a matched pair. The first says the value
 * survives; the second says its ABSENCE does not silently become some default,
 * because "the server did not say" and "this person is a member" are different
 * claims about a person's standing and only one of them is true of a body that
 * lost the key.
 */
describe('13.760 mapActors carries `role`, and refuses a member that has none', () => {
  const body: MemberListResponse = {
    workspaceId: '01J9GWS0000000000000000000',
    members: [
      { userId: ANSELMA, displayName: 'Anselma Marak', role: 'owner' },
      { userId: BIREN, displayName: 'Biren Sangma', role: 'member' },
    ],
  };

  it('carries the role for a real server-shaped payload, alongside the id and the name', () => {
    expect(mapActors(body)).toEqual([
      { id: ANSELMA, name: 'Anselma Marak', role: 'owner' },
      { id: BIREN, name: 'Biren Sangma', role: 'member' },
    ]);
    // The roster JOIN is unchanged by the wider shape, and that is asserted
    // rather than assumed: it is the one shipped consumer that only ever
    // wanted id→name, and the reason `RosterMember` extends `Actor` instead of
    // replacing it.
    expect(rosterByActorId(mapActors(body)).get(BIREN)).toBe('Biren Sangma');
  });

  it('REFUSES a member with no role, rather than defaulting one', () => {
    // The positive control runs FIRST and through the SAME path the refusal is
    // measured on: the identical body WITH its role maps cleanly. Without it a
    // refusal could be about any of the three fields, and this case would be
    // asserting the fixture rather than the missing key.
    expect(mapActors({ ...body, members: [{ userId: ANSELMA, displayName: 'Anselma Marak', role: 'member' }] }))
      .toEqual([{ id: ANSELMA, name: 'Anselma Marak', role: 'member' }]);

    expect(() =>
      mapActors({ workspaceId: 'w', members: [{ userId: ANSELMA, displayName: 'Anselma Marak' }] }),
    ).toThrow(/members\.members\[0\]\.role: expected a string/);
    // A MappingError, not a ServingGapError: the route DOES send this field, so
    // a body without one is a body this client cannot read rather than a fact
    // nobody serves.
    expect(() =>
      mapActors({ workspaceId: 'w', members: [{ userId: ANSELMA, displayName: 'Anselma Marak' }] }),
    ).toThrow(MappingError);
  });
});

/**
 * **The roster's second carried field — and the first whose ABSENCE is a
 * decision rather than a defect.**
 *
 * `role` is REQUIRED and refused when missing, because the route always sends it
 * and a body without one is a body this client cannot read. `email` is the
 * opposite: the server WITHHOLDS it for a phone-only member, whose address is
 * synthesised from the phone number under an invalid domain
 * (`apps/server/src/auth/synthetic-address.ts` carries the measurement). So a
 * missing key here is the product saying "nothing to show", not a lost field.
 *
 * **`toStrictEqual` and not `toEqual`, and that is the case's whole spine:**
 * `toEqual` IGNORES a key whose value is `undefined`, so a mapper that spread
 * `email: undefined` onto every withheld member would pass an `toEqual`
 * assertion written about the same body. The distinction this case exists to
 * protect — *absent* versus *present and empty* — is exactly the one `toEqual`
 * is blind to.
 */
describe('13.959 mapActors carries `email` when the server sent one, and passes its ABSENCE through untouched', () => {
  const roster: MemberListResponse = {
    workspaceId: '01J9GWS0000000000000000000',
    members: [
      // A magic-link sign-up: a REAL address and an EMPTY name, which is the
      // population the owner's fallback exists for.
      { userId: ANSELMA, displayName: '', role: 'owner', email: 'anselma@example.test' },
      // A phone-only sign-up: the address was withheld, and the name is the
      // phone itself, so this row never reaches the fallback.
      { userId: BIREN, displayName: '+919000700001', role: 'member' },
    ],
  };

  it('carries the address for the member that has one, and leaves the withheld member with NO `email` key', () => {
    const mapped = mapActors(roster);

    expect(mapped).toStrictEqual([
      { id: ANSELMA, name: '', role: 'owner', email: 'anselma@example.test' },
      { id: BIREN, name: '+919000700001', role: 'member' },
    ]);
    // The property, stated in the form `toEqual` cannot check: the key is ABSENT,
    // not present-and-`undefined`. **The claim above is MEASURED, not assumed** —
    // under the very mutation that sets `email: undefined` on the withheld row,
    // `toStrictEqual` fails and a `toEqual` written over the SAME body passes.
    // The two matchers differ on exactly this shape, and this is the only shape in
    // this file where the difference decides anything.
    expect('email' in (mapped[0] as RosterMember)).toBe(true);
    expect('email' in (mapped[1] as RosterMember)).toBe(false);
  });

  it('REFUSES a present-but-not-a-string address, rather than coercing or dropping it', () => {
    // The positive control runs FIRST through the SAME path: an absent key is
    // accepted (above), so a refusal here cannot be about the key being missing.
    expect(() =>
      mapActors({
        workspaceId: 'w',
        members: [{ userId: ANSELMA, displayName: 'A', role: 'owner', email: null }],
      }),
    ).toThrow(/members\.members\[0\]\.email: expected a string/);
    // `null` is deliberately NOT this field's spelling of absent. Absent is the
    // server withholding; `null` is a body this client cannot read, and letting
    // the two look alike is how a malformed payload starts rendering as a
    // person with no address.
    expect(() =>
      mapActors({
        workspaceId: 'w',
        members: [{ userId: ANSELMA, displayName: 'A', role: 'owner', email: null }],
      }),
    ).toThrow(MappingError);
  });
});

describe('3.37 mapBoardView — a pure regrouping of the flat columns, plus the roster join', () => {
  const body: BoardResponse = {
    projectId: '01J9GPRJ000000000000000000',
    workspaceId: '01J9GWS0000000000000000000',
    columns: [
      {
        workflowId: 'wf-errand',
        workflowName: 'Errand',
        workflowVersion: 2,
        stateId: 'doing',
        name: 'Doing',
        category: 'active',
        blocked: false,
        creatable: true,
        cards: [serverBoardCard()],
      },
      {
        workflowId: 'wf-errand',
        workflowName: 'Errand',
        workflowVersion: 2,
        stateId: 'waiting',
        name: 'Waiting on counterparty',
        category: 'active',
        blocked: true,
        // Independent of `blocked` — a workflow setting can forbid creation
        // in a non-terminal state too (starting-status design). `false` here,
        // against `columns[0]`'s `true`, is what lets 13.1434 assert BOTH
        // real booleans travel rather than one masking a default.
        creatable: false,
        cards: [],
      },
      {
        workflowId: 'wf-triage',
        workflowName: 'Triage',
        workflowVersion: 1,
        stateId: 'new',
        name: 'New',
        category: 'open',
        blocked: false,
        creatable: true,
        cards: [],
      },
    ],
  };

  it('groups by workflow, keeps the blocked flag, and settles pending to false', () => {
    const view = mapBoardView(body, new Map([[ANSELMA, 'Anselma Marak']]));
    expect(view.projectId).toBe('01J9GPRJ000000000000000000');
    expect(view.groups.map((group) => [group.workflowId, group.workflowVersion])).toEqual([
      ['wf-errand', 2],
      ['wf-triage', 1],
    ]);
    expect(view.groups[0]?.columns.map((column) => column.stateId)).toEqual(['doing', 'waiting']);
    expect(view.groups[0]?.columns[1]?.blocked).toBe(true);
    const card = view.groups[0]?.columns[0]?.cards[0];
    expect(card?.pending).toBe(false);
    expect(card?.assignee).toEqual({ id: ANSELMA, name: 'Anselma Marak' });
    expect(card?.stateProvenance.actorName).toBe('Anselma Marak');
    // REARRANGEMENT, never a filter: every column the server sent is in exactly
    // one group, and the count is what says so.
    expect(view.groups.flatMap((group) => group.columns)).toHaveLength(body.columns.length);
  });

  it('3.37 keys groups on (workflowId, workflowVersion), so a straggler never joins the real states', () => {
    const withStraggler: BoardResponse = {
      ...body,
      columns: [
        ...body.columns,
        {
          workflowId: 'wf-errand',
          workflowName: 'Errand',
          // `0` — routes/board.ts's straggler pass: no published definition
          // names this column.
          workflowVersion: 0,
          stateId: 'ancient',
          name: 'ancient',
          category: 'open',
          blocked: false,
          // A real straggler is always `false` — `routes/board.ts`'s own
          // convention, no published definition to read the flag off.
          creatable: false,
          cards: [serverBoardCard({ ticketId: '01J9GTKB000000000000000000', stateId: 'ancient' })],
        },
      ],
    };
    const view = mapBoardView(withStraggler);
    expect(view.groups.map((group) => `${group.workflowId}@${group.workflowVersion}`)).toEqual([
      'wf-errand@2',
      'wf-triage@1',
      'wf-errand@0',
    ]);
    // The pin that matters: the straggler is NOT among the real definition's
    // columns. Grouping by workflowId alone would have put it there.
    expect(view.groups[0]?.columns.map((column) => column.stateId)).toEqual(['doing', 'waiting']);
  });

  it('3.37 names an unrostered assignee by id rather than calling them nobody', () => {
    const view = mapBoardView(body, new Map());
    const card = view.groups[0]?.columns[0]?.cards[0];
    // Not null — that would say nobody is assigned to a ticket somebody is
    // assigned to. The id is what actorLabel renders for a null name anyway.
    expect(card?.assignee).toEqual({ id: ANSELMA, name: ANSELMA });
    expect(card?.stateProvenance.actorName).toBeNull();
  });

  /**
   * 3.43 — the two undefended defaults `mapBoardColumn` used to carry.
   *
   * `blocked: boolean` and `cards: TicketCard[]` are both REQUIRED on the wire
   * `BoardColumn` (`packages/domain/src/read-models.ts`), so `record['blocked']
   * === true` and `asArray(record['cards'] ?? [], …)` defended against nothing
   * the contract permits and both chose a value that reads on screen as a claim
   * about the work: not blocked, and nothing in this state.
   *
   * The fixtures below are cast because they are DELIBERATELY off-contract — a
   * typed `BoardResponse` cannot express a column that lost a field, which is
   * exactly the body being pinned.
   */
  it('3.43 REFUSES a column whose cards are missing rather than rendering it empty', () => {
    const { cards: _dropped, ...columnWithoutCards } = body.columns[0] as BoardResponse['columns'][number];
    const lost = { ...body, columns: [columnWithoutCards] } as unknown as BoardResponse;
    expect(() => mapBoardView(lost)).toThrow(MappingError);
    expect(() => mapBoardView(lost)).toThrow(/board\.columns\[0\]\.cards: expected an array/);
    // Control, same run: the column that DOES carry an (empty) cards array maps,
    // so "empty column" is still an answer the server is allowed to give.
    const empty = { ...body, columns: [{ ...body.columns[1] }] } as BoardResponse;
    expect(mapBoardView(empty).groups[0]?.columns[0]?.cards).toEqual([]);
  });

  it('3.43 REFUSES an unreadable blocked flag rather than answering the harmless direction', () => {
    for (const bad of [undefined, 'true', 1, null]) {
      const column = { ...body.columns[1], blocked: bad };
      const mangled = { ...body, columns: [column] } as unknown as BoardResponse;
      expect(() => mapBoardView(mangled), String(bad)).toThrow(
        /board\.columns\[0\]\.blocked: expected a boolean/,
      );
    }
    // Controls, same run: both real booleans still travel, and `false` is not
    // swallowed by the check that refuses a missing one.
    expect(mapBoardView(body).groups[0]?.columns[0]?.blocked).toBe(false);
    expect(mapBoardView(body).groups[0]?.columns[1]?.blocked).toBe(true);
  });

  /**
   * 13.1434 — starting-status design, 2026-09-23. `creatable` is REQUIRED on
   * the wire `BoardColumn` for the identical reason `blocked` is, two cases
   * up: a garbled or absent read must fail loudly rather than default to a
   * value that reads on screen as a claim about the work ("Add a ticket" for
   * a state the workflow forbids, or its silent absence from a state that
   * allows it).
   */
  it('13.1434 REFUSES an unreadable creatable flag rather than defaulting it, and both real booleans travel', () => {
    for (const bad of [undefined, 'true', 1, null]) {
      const column = { ...body.columns[1], creatable: bad };
      const mangled = { ...body, columns: [column] } as unknown as BoardResponse;
      expect(() => mapBoardView(mangled), String(bad)).toThrow(
        /board\.columns\[0\]\.creatable: expected a boolean/,
      );
    }
    // Controls, same run: `body.columns[0]` is creatable, `body.columns[1]`
    // is not — both real booleans travel, and `false` is not swallowed by
    // the check that refuses a missing one.
    expect(mapBoardView(body).groups[0]?.columns[0]?.creatable).toBe(true);
    expect(mapBoardView(body).groups[0]?.columns[1]?.creatable).toBe(false);
  });

  it('3.43 REFUSES a cause kind it does not know rather than rendering an anonymous flip', () => {
    const withUnknownCause = {
      ...body,
      columns: [
        {
          ...body.columns[0],
          cards: [
            {
              ...serverCard(),
              stateProvenance: {
                ...serverCard().stateProvenance,
                cause: { kind: 'reopened-by-decree', childTicketId: 'child_1' },
              },
            },
          ],
        },
      ],
    } as unknown as BoardResponse;
    expect(() => mapBoardView(withUnknownCause)).toThrow(
      /stateProvenance\.cause\.kind: expected reopened-for-child, led-to, reopened-by-flow, branch-not-taken \(got reopened-by-decree\)/,
    );
    // Control: `null` is the wire's own value for "no cause" and still passes.
    expect(mapBoardView(body).groups[0]?.columns[0]?.cards[0]?.cause).toBeNull();
  });

  it('29.207 maps the three flow kinds to { kind } only; reopened-for-child keeps its child; reopened-by-decree still throws', () => {
    const withCause = (cause: unknown) =>
      ({
        ...body,
        columns: [
          {
            ...body.columns[0],
            cards: [{ ...serverBoardCard(), stateProvenance: { ...serverBoardCard().stateProvenance, cause } }],
          },
        ],
      }) as unknown as BoardResponse;
    const mapped = (cause: unknown) => mapBoardView(withCause(cause)).groups[0]?.columns[0]?.cards[0]?.cause;
    // The server serves a flow cause as its kind (`servedCause`); a stray id on the wire is dropped, never carried.
    expect(mapped({ kind: 'led-to' })).toEqual({ kind: 'led-to' });
    expect(mapped({ kind: 'reopened-by-flow' })).toEqual({ kind: 'reopened-by-flow' });
    expect(mapped({ kind: 'branch-not-taken', decisionTicketId: 'dec_1' })).toEqual({ kind: 'branch-not-taken' });
    // Control: the old kind still carries its child, and an unknown kind still refuses.
    expect(mapped({ kind: 'reopened-for-child', childTicketId: 'child_1' })).toEqual({ kind: 'reopened-for-child', childTicketId: 'child_1' });
    expect(() => mapped({ kind: 'reopened-by-decree' })).toThrow(/got reopened-by-decree/);
  });

  it('3.43 REFUSES a card whose required nullable fields are ABSENT, not merely null', () => {
    const drop = (key: 'assigneeId' | 'rollup' | 'cause') => {
      const card = { ...serverCard() } as Record<string, unknown>;
      if (key === 'cause') {
        const provenance = { ...serverCard().stateProvenance } as Record<string, unknown>;
        delete provenance['cause'];
        card['stateProvenance'] = provenance;
      } else {
        delete card[key];
      }
      return { ...body, columns: [{ ...body.columns[0], cards: [card] }] } as unknown as BoardResponse;
    };
    expect(() => mapBoardView(drop('assigneeId'))).toThrow(/\.assigneeId: expected a string/);
    expect(() => mapBoardView(drop('rollup'))).toThrow(/\.rollup: expected an object/);
    expect(() => mapBoardView(drop('cause'))).toThrow(/\.cause: expected an object/);
    // Controls, same run: every one of the three is `null` on the real fixture
    // and every one of them still travels.
    const card = mapBoardView(body).groups[0]?.columns[0]?.cards[0];
    expect(card?.rollup).toBeNull();
    expect(card?.cause).toBeNull();
    expect(mapRollup(null)).toBeNull();
  });

  it('3.37 lifts the cause out of stateProvenance onto the card', () => {
    const reopened: BoardResponse = {
      ...body,
      columns: [
        {
          ...body.columns[0]!,
          cards: [
            serverBoardCard({
              stateProvenance: {
                actorId: ANSELMA,
                clientTime: 'c',
                serverTime: 's',
                cause: { kind: 'reopened-for-child', childTicketId: 'child_1' },
              },
            }),
          ],
        },
      ],
    };
    const card = mapBoardView(reopened).groups[0]?.columns[0]?.cards[0];
    expect(card?.cause).toEqual({ kind: 'reopened-for-child', childTicketId: 'child_1' });
    expect(card?.stateProvenance).not.toHaveProperty('cause');
  });

  /**
   * 13.1464 — `parent`/`epic` cross the wire (owner request, 2026-09-23,
   * board-card badges). A MISSING key is a refusal, the same rule every other
   * required field on this card already keeps — `null` is a real answer
   * (no parent/no epic, or an unreadable one, `BoardCard.parent`'s own
   * docblock) and an absent key is a body this client cannot read.
   */
  describe('13.1464 mapBoardCard carries parent/epic; an absent key is a refusal, not undefined', () => {
    /** The `body` fixture above, its one card replaced by a fresh `serverBoardCard()`. */
    const withCard = (overrides: Parameters<typeof serverBoardCard>[0]): BoardResponse => ({
      ...body,
      columns: [{ ...body.columns[0]!, cards: [serverBoardCard(overrides)] }],
    });

    it('null on the wire stays null — no parent, no epic', () => {
      const view = mapBoardView(withCard({ parent: null, epic: null }));
      const card = view.groups[0]?.columns[0]?.cards[0];
      expect(card?.parent).toBeNull();
      expect(card?.epic).toBeNull();
    });

    it('a real parent/epic object crosses whole, key included', () => {
      const view = mapBoardView(
        withCard({
          parent: { ticketId: 'parent_1', key: 'CCSO-1' },
          epic: { ticketId: 'epic_1', key: 'CCSO-2', title: 'Cold-chain rollout' },
        }),
      );
      const card = view.groups[0]?.columns[0]?.cards[0];
      expect(card?.parent).toEqual({ ticketId: 'parent_1', key: 'CCSO-1' });
      expect(card?.epic).toEqual({ ticketId: 'epic_1', key: 'CCSO-2', title: 'Cold-chain rollout' });
    });

    it('a `key: null` on a real parent/epic survives — the ledger holds no prefix, which is a fact and not an absence', () => {
      const view = mapBoardView(
        withCard({
          parent: { ticketId: 'parent_1', key: null },
          epic: { ticketId: 'epic_1', key: null, title: 'Cold-chain rollout' },
        }),
      );
      const card = view.groups[0]?.columns[0]?.cards[0];
      expect(card?.parent).toEqual({ ticketId: 'parent_1', key: null });
      expect(card?.epic).toEqual({ ticketId: 'epic_1', key: null, title: 'Cold-chain rollout' });
    });

    it("a MISSING `parent`/`epic` key refuses — an absent field is not this shape's spelling of null", () => {
      const raw = withCard({}) as unknown as { columns: [{ cards: [Record<string, unknown>] }] };
      const card = { ...raw.columns[0].cards[0] };
      delete card['parent'];
      raw.columns[0].cards = [card as never];
      expect(() => mapBoardView(raw)).toThrow(/\.parent: expected an object/);
    });

    it("a `parent`/`epic` object missing ITS OWN `ticketId` refuses, naming the nested path", () => {
      const raw = withCard({ parent: { ticketId: 'p1', key: null } }) as unknown as {
        columns: [{ cards: [Record<string, unknown>] }];
      };
      raw.columns[0].cards[0]['parent'] = { key: null };
      expect(() => mapBoardView(raw)).toThrow(/\.parent\.ticketId: expected a string/);
    });
  });

  it('3.37 throws MappingError naming the path on a malformed response', () => {
    expect(() => mapBoardView({ projectId: 'p', columns: 'nope' })).toThrow(MappingError);
    expect(() => mapBoardView({ projectId: 'p', columns: 'nope' })).toThrow(
      /board\.columns: expected an array/,
    );
    expect(() => mapBoardView({ projectId: 'p', columns: [{ workflowId: 'w' }] })).toThrow(
      /board\.columns\[0\]\.workflowVersion: expected a number/,
    );
  });

  it('3.37 boardWorkspaceId reads the workspace the roster join is fetched for', () => {
    expect(boardWorkspaceId(body)).toBe('01J9GWS0000000000000000000');
    expect(() => boardWorkspaceId({ projectId: 'p', columns: [] })).toThrow(
      /board\.workspaceId: expected a string/,
    );
  });
});

describe('3.37 mapHistory and mapWorkflowDef — the two shapes that already agree', () => {
  it('validates every history event rather than casting the array', () => {
    const events = mapHistory({
      ticketId: 't',
      events: [
        {
          id: 'e1',
          type: 'ticket.created',
          version: 1,
          payload: { title: 'x' },
          actorId: ANSELMA,
          origin: 'web',
          clientTime: 'c',
          serverTime: 's',
          seq: 1,
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.seq).toBe(1);
    expect(() => mapHistory({ ticketId: 't', events: [{ id: 'e1' }] })).toThrow(
      /history\.events\[0\]\.type: expected a string/,
    );
  });

  it('unwraps the workflow and checks its required fields', () => {
    const body: WorkflowResponse = {
      workspaceId: '01J9GWS0000000000000000000',
      workflow: {
        id: 'wf-errand',
        version: 2,
        name: 'Errand',
        initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }],
        transitions: [{ from: '*', to: 'todo', rules: [] }],
      },
    };
    expect(mapWorkflowDef(body).version).toBe(2);
    expect(() => mapWorkflowDef({ workspaceId: 'w', workflow: { id: 'x' } })).toThrow(
      /workflow\.workflow\.version: expected a number/,
    );
  });

  /**
   * 3.44 — the elements, which the docblock claimed were checked and were not.
   *
   * `states` and `transitions` were read for ARRAY-NESS and then cast, so
   * `states: [null]` and `transitions: [{from: 7}]` both passed a mapper whose
   * stated stake is that "the builder republishes what it loads, so a field this
   * client quietly mangled is a field the next publish deletes". Element-level
   * mangling is precisely what that sentence is about.
   */
  it('3.44 validates each state and each transition, not merely the two arrays', () => {
    const withStates = (states: unknown, transitions: unknown = []) => () =>
      mapWorkflowDef({
        workspaceId: 'w',
        workflow: {
          id: 'wf',
          version: 1,
          name: 'W',
          initialStateId: 'todo',
          states,
          transitions,
        },
      });
    expect(withStates([null])).toThrow(/workflow\.workflow\.states\[0\]: expected an object/);
    expect(withStates([{ name: 'To do', category: 'open' }])).toThrow(
      /workflow\.workflow\.states\[0\]\.id: expected a string/,
    );
    expect(withStates([{ id: 'todo', name: 'To do', category: 'someday' }])).toThrow(
      /workflow\.workflow\.states\[0\]\.category: expected one of open\/active\/terminal/,
    );
    expect(withStates([{ id: 'todo', name: 'To do', category: 'open', blocked: 'yes' }])).toThrow(
      /workflow\.workflow\.states\[0\]\.blocked: expected a boolean/,
    );
    const good = [{ id: 'todo', name: 'To do', category: 'open' }];
    expect(withStates(good, [{ from: 7, to: 'todo', rules: [] }])).toThrow(
      /workflow\.workflow\.transitions\[0\]\.from: expected a string/,
    );
    expect(withStates(good, [{ from: '*', to: 'todo' }])).toThrow(
      /workflow\.workflow\.transitions\[0\]\.rules: expected an array/,
    );
    expect(withStates(good, [{ from: '*', to: 'todo', rules: ['require-comment'] }])).toThrow(
      /workflow\.workflow\.transitions\[0\]\.rules\[0\]: expected an object/,
    );
    // Controls, same run: `blocked` really IS optional on `workflowStateSchema`,
    // and a rule OBJECT travels without this module restating the five-arm union
    // that belongs to the rule engine.
    const def = withStates(good, [
      { from: '*', to: 'todo', rules: [{ kind: 'require-comment' }] },
    ])();
    expect(def.states).toEqual(good);
    expect(def.transitions[0]?.rules).toEqual([{ kind: 'require-comment' }]);
  });
});

describe('3.37 mapIngestResults — index alignment and the arm, both checked', () => {
  it('requires one result per submitted event', () => {
    const raw = { results: [{ status: 'committed', eventId: 'e1', seq: 3, serverTime: 's' }] };
    expect(mapIngestResults(raw, 1)).toHaveLength(1);
    expect(() => mapIngestResults(raw, 2)).toThrow(MappingError);
    expect(() => mapIngestResults(raw, 2)).toThrow(/2 index-aligned results \(got 1\)/);
  });

  it('refuses an unknown status and a refusal missing its rule', () => {
    expect(() => mapIngestResults({ results: [{ status: 'maybe' }] }, 1)).toThrow(
      /results\[0\]\.status: expected one of committed\/invalid\/refused/,
    );
    expect(() =>
      mapIngestResults({ results: [{ status: 'refused', eventId: 'e1', reason: 'no' }] }, 1),
    ).toThrow(/results\[0\]\.rule: expected a value/);
  });
});

/**
 * 3.63 — ruling P24’s OTHER asymmetry, closed at the type: the server keeps `listColumns` and `grouping` as two records keyed independently, and this block asserts P24 in both directions.
 */
describe('3.38 preferences — ruling P24 both ways', () => {
  /**
   * RULING P24, the half that is ABSENT — and this test replaced one that
   * asserted the opposite.
   *
   * The superseded assertion was *"defaults the half that is absent"*: a project
   * in `listColumns` and not in `grouping` came back carrying
   * `DEFAULT_VIEW_PREFS.grouping`, indistinguishable from a person who had
   * chosen `'epic'`. P24 forbids exactly that — *"reaching for
   * `DEFAULT_VIEW_PREFS` there invents a preference the user never set … a
   * project missing from `grouping` surfaces as **not set**, never as a default
   * wearing a user's authority."*
   *
   * Both projects here are half-set, MIRRORED, so a mapper that hard-wired one
   * side would fail on the other; and the assertion is on `origin`, which is the
   * only thing that distinguishes the two situations, since the VALUE a view
   * ends up rendering is the same `'epic'` either way. That is the whole finding
   * in one line: the old shape could not tell them apart.
   */
  /**
   * 3.64 — a half nobody chose is never STORED: the ABSENT half is reported as not set rather than defaulted under the user’s name, so a half-set project round-trips as half-set.
   */
  it('reports the half that is ABSENT as not set, rather than defaulting it under the user’s name', () => {
    const prefs = mapPreferences({
      savedFilters: [],
      listColumns: { '01J9GPRJ000000000000000000': ['status', 'assignee'] },
      grouping: { '01J9GPRJ111111111111111111': 'flat' },
    });
    expect(prefs).toEqual({
      version: 1,
      projects: {
        '01J9GPRJ000000000000000000': {
          columns: { origin: 'stored', value: ['status', 'assignee'] },
          grouping: { origin: 'default' },
        },
        '01J9GPRJ111111111111111111': {
          columns: { origin: 'default' },
          grouping: { origin: 'stored', value: 'flat' },
        },
      },
      savedFilters: [],
    });
    // Stated as the refusal it is: no half the server did not send carries a
    // value at all, so no consumer can read one as a choice. `toEqual` alone
    // would pass against a `{origin:'default', value:…}` shape.
    expect(prefs.projects['01J9GPRJ000000000000000000']?.grouping).not.toHaveProperty('value');
    expect(prefs.projects['01J9GPRJ111111111111111111']?.columns).not.toHaveProperty('value');
    // CONTROL, same run: a project the server names in BOTH records is `stored`
    // on both halves — so "everything is default now" is not what this measures.
    const both = mapPreferences({
      savedFilters: [],
      listColumns: { '01J9GPRJ222222222222222222': ['status'] },
      grouping: { '01J9GPRJ222222222222222222': 'type' },
    });
    expect(both.projects['01J9GPRJ222222222222222222']).toEqual({
      columns: { origin: 'stored', value: ['status'] },
      grouping: { origin: 'stored', value: 'type' },
    });
  });

  it('3.38 refuses a stored grouping or column id nothing renders, rather than casting it through', () => {
    expect(() =>
      mapPreferences({ savedFilters: [], listColumns: {}, grouping: { p: 'by-vibes' } }),
    ).toThrow(
      /preferences\.grouping\.p: expected one of epic\/status\/assignee\/type\/priority\/flat/,
    );
    expect(() =>
      mapPreferences({ savedFilters: [], listColumns: { p: ['statuz'] }, grouping: {} }),
    ).toThrow(/preferences\.listColumns\.p\[0\]/);
    // Controls, same run: the closed member and the open `field:` arm both pass
    // — and since spec 2026-09-22 the closed list carries a SIXTH member and a
    // SEVENTH column. `priority` is asserted positively here rather than left to
    // the refusal above, because a stored preference is the one path where a
    // grouping the client can still render would otherwise be refused on
    // re-open: the enumeration in that message and the list in `GROUPINGS` are
    // two spellings of one fact, and this arm is the one that reddens if only
    // the refusal is updated.
    expect(
      mapPreferences({
        savedFilters: [],
        listColumns: { p: ['status', 'field:amount', 'priority'] },
        grouping: { p: 'priority' },
      }).projects['p'],
    ).toEqual({
      columns: { origin: 'stored', value: ['status', 'field:amount', 'priority'] },
      grouping: { origin: 'stored', value: 'priority' },
    });
    // Control, same run: the closed member and the open `field:` arm both pass.
    expect(
      mapPreferences({
        savedFilters: [],
        listColumns: { p: ['status', 'field:amount'] },
        grouping: { p: 'flat' },
      }).projects['p'],
    ).toEqual({
      columns: { origin: 'stored', value: ['status', 'field:amount'] },
      grouping: { origin: 'stored', value: 'flat' },
    });
  });

  /**
   * 3.42 — the 404 no longer becomes the empty document, and the pair is what
   * makes that a measurement.
   *
   * The server's answer for a person who has never saved anything is a **200
   * carrying the empty document** (`apps/server/src/preferences/store.ts`: a
   * missing row answers `EMPTY_PREFERENCES`), so the two situations were
   * indistinguishable at this function by construction — and the one it chose to
   * render was the one that erases a revoked member's standing. The 404 is now
   * raised as `HttpError` one layer out; a `null` reaching the mapper is a caller
   * bug and fails at `asRecord`.
   */
  it('3.42 REFUSES a null where it used to answer defaults, while a 200 empty document still reads as empty', () => {
    expect(() => mapPreferences(null)).toThrow(MappingError);
    expect(() => mapPreferences(null)).toThrow(/preferences: expected an object/);
    // Control, same run: the server's own never-saved body — which is what the
    // old branch was imitating — still maps to the empty client document. The two
    // answers are now different answers.
    expect(mapPreferences({ savedFilters: [], listColumns: {}, grouping: {} })).toEqual({
      version: 1,
      projects: {},
      savedFilters: [],
    });
  });

  /**
   * 3.42 — `preferencesDocSchema` is `.strict()` and declares all three keys
   * required (`packages/domain/src/preferences.ts`), so a body missing one is a
   * body this client cannot read, not a person who saved nothing.
   */
  it('3.42 refuses a document missing any of the three required keys rather than defaulting it', () => {
    expect(() => mapPreferences({ listColumns: {}, grouping: {} })).toThrow(
      /preferences\.savedFilters: expected an array/,
    );
    expect(() => mapPreferences({ savedFilters: [], grouping: {} })).toThrow(
      /preferences\.listColumns: expected an object/,
    );
    expect(() => mapPreferences({ savedFilters: [], listColumns: {} })).toThrow(
      /preferences\.grouping: expected an object/,
    );
  });

  it('3.38 REFUSES a saved filter carrying a term the client FilterSpec has no key for', () => {
    expect(() =>
      mapPreferences({
        savedFilters: [{ id: 'f', name: 'Blocked work', filterSpec: { blocked: true } }],
        listColumns: {},
        grouping: {},
      }),
    ).toThrow(ServingGapError);
    expect(() =>
      mapPreferences({
        savedFilters: [{ id: 'f', name: 'Blocked work', filterSpec: { blocked: true } }],
        listColumns: {},
        grouping: {},
      }),
    ).toThrow(/FilterSpec\.blocked/);
    // Control, one key apart, same run: the filter that DOES translate.
    expect(
      mapPreferences({
        savedFilters: [
          { id: 'f', name: 'Mine', filterSpec: { assigneeId: ANSELMA, due: { before: '2026-09-30' } } },
        ],
        listColumns: {},
        grouping: {},
      }).savedFilters,
    ).toEqual([
      { id: 'f', name: 'Mine', filter: { assigneeIds: [ANSELMA], dueBefore: '2026-09-30' } },
    ]);
  });

  /** 13.580 — `toClientFilterSpec` reads `closed` as a REQUIRED-boolean wire term, not a passthrough (`asBoolean`'s own docblock: a `'true'` string must not silently become `true`). */
  it('13.580 toClientFilterSpec round-trips closed, and refuses a non-boolean', () => {
    expect(toClientFilterSpec({ closed: true }, 'f')).toEqual({ closed: true });
    expect(toClientFilterSpec({ closed: false }, 'f')).toEqual({ closed: false });
    expect(toClientFilterSpec({}, 'f')).toEqual({});
    expect(() => toClientFilterSpec({ closed: 'true' }, 'f')).toThrow(MappingError);
  });

  it('3.38 refuses a contains clause and a duplicated field id, which Record cannot hold', () => {
    expect(() =>
      toClientFilterSpec({ fields: [{ fieldId: 'amount', op: 'contains', value: '42' }] }, 'f'),
    ).toThrow(/op 'contains'/);
    expect(() =>
      toClientFilterSpec(
        {
          fields: [
            { fieldId: 'amount', op: 'eq', value: '42' },
            { fieldId: 'amount', op: 'eq', value: '43' },
          ],
        },
        'f',
      ),
    ).toThrow(/amount appears twice/);
  });

  it('writes the server document back, savedFilters translated', () => {
    expect(
      toServerPreferences({
        version: 1,
        projects: {
          '01J9GPRJ000000000000000000': {
            columns: { origin: 'stored', value: ['status'] },
            grouping: { origin: 'stored', value: 'epic' },
          },
        },
        savedFilters: [{ id: 'f', name: 'Mine', filter: { assigneeIds: [ANSELMA] } }],
      }),
    ).toEqual({
      savedFilters: [{ id: 'f', name: 'Mine', filterSpec: { assigneeId: ANSELMA } }],
      listColumns: { '01J9GPRJ000000000000000000': ['status'] },
      grouping: { '01J9GPRJ000000000000000000': 'epic' },
    });
  });

  /**
   * The WRITE side of P24, which is where a default becomes permanent.
   *
   * A half nobody chose contributes NO KEY. Writing one would spend a stock
   * value on it and PUT that value under the user's name — the substitution
   * `mapPreferences` stopped making, one layer over and unrecoverable, because
   * once it is in storage nothing downstream can tell it from a choice.
   *
   * The round trip is asserted whole rather than the write alone: a `default`
   * half that survives `toServerPreferences` → `mapPreferences` as `default` is
   * the fixed point that makes the pair of functions total, which is the thing
   * P24 said the client type could not express.
   */
  it('declines to STORE a half nobody chose, and the half-set project round-trips as half-set', () => {
    const halfSet = {
      version: 1 as const,
      projects: {
        '01J9GPRJ000000000000000000': {
          columns: { origin: 'default' as const },
          grouping: { origin: 'stored' as const, value: 'type' as const },
        },
      },
      savedFilters: [],
    };
    const document = toServerPreferences(halfSet);
    expect(document).toEqual({
      savedFilters: [],
      listColumns: {},
      grouping: { '01J9GPRJ000000000000000000': 'type' },
    });
    // Round trip: what the server would hand back reads as the same half-set
    // project, NOT as a user who chose the stock columns.
    expect(mapPreferences(document)).toEqual(halfSet);

    // CONTROL, same run, one origin apart: the identical columns marked
    // `stored` DO reach storage. Without this, a `toServerPreferences` that
    // dropped `listColumns` entirely passes the assertion above.
    const chosen = toServerPreferences({
      ...halfSet,
      projects: {
        '01J9GPRJ000000000000000000': {
          columns: { origin: 'stored', value: ['status', 'assignee', 'dueDate', 'progress'] },
          grouping: { origin: 'stored', value: 'type' },
        },
      },
    });
    expect(chosen['listColumns']).toEqual({
      '01J9GPRJ000000000000000000': ['status', 'assignee', 'dueDate', 'progress'],
    });

    // And a project whose halves are BOTH unchosen disappears from the
    // document — the truth about a project nobody has arranged.
    expect(
      toServerPreferences({
        version: 1,
        projects: { '01J9GPRJ111111111111111111': DEFAULT_VIEW_PREFS },
        savedFilters: [],
      }),
    ).toEqual({ savedFilters: [], listColumns: {}, grouping: {} });
  });
});

describe('3.38 toServerFilterSpec — the plural/singular disagreement, made loud', () => {
  it('narrows a one-element array and translates the due bounds and fields', () => {
    expect(
      toServerFilterSpec({
        text: 'gst',
        assigneeIds: [ANSELMA],
        stateCategories: ['active'],
        dueBefore: '2026-09-30',
        fields: { amount: '4200' },
      }),
    ).toEqual({
      text: 'gst',
      assigneeId: ANSELMA,
      stateCategory: 'active',
      due: { before: '2026-09-30' },
      fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }],
    });
  });

  /** 7.706 — the plural SERVER keys (MCP CRUD plan Task 3) are not the web client's: it keeps sending the singular wire keys. */
  it('7.706 emits only the singular wire keys for every UI axis — never a plural server key', () => {
    const wire = toServerFilterSpec({
      assigneeIds: [ANSELMA],
      collaboratorIds: [ANSELMA],
      typeIds: ['bug'],
      stateIds: ['todo'],
      stateCategories: ['active'],
      priorities: ['P1'],
    });
    // control: every axis IS present, as its singular key
    expect(wire).toEqual({
      assigneeId: ANSELMA,
      collaboratorId: ANSELMA,
      typeId: 'bug',
      stateId: 'todo',
      stateCategory: 'active',
      priority: 'P1',
    });
    for (const plural of ['assigneeIds', 'collaboratorIds', 'typeIds', 'stateIds', 'stateCategories', 'priorities']) {
      expect(Object.keys(wire)).not.toContain(plural);
    }
    // and a two-value axis is still refused loudly, not sent as a list
    expect(() => toServerFilterSpec({ priorities: ['P1', 'P2'] })).toThrow(UnexpressibleFilterError);
  });

  it('THROWS on a multi-assignee filter, naming the key and the count', () => {
    expect(() => toServerFilterSpec({ assigneeIds: [ANSELMA, BIREN] })).toThrow(
      UnexpressibleFilterError,
    );
    expect(() => toServerFilterSpec({ assigneeIds: [ANSELMA, BIREN] })).toThrow(
      /filter key assigneeIds .* one assigneeId and this filter names 2/s,
    );
    // An empty array is not a filter and is dropped rather than refused.
    expect(toServerFilterSpec({ assigneeIds: [] })).toEqual({});
  });

  it('THROWS on projectIds at any length — the server has no project term at all', () => {
    expect(() => toServerFilterSpec({ projectIds: ['01J9GPRJ000000000000000000'] })).toThrow(
      /projectIds .* no project term/s,
    );
  });

  it('THROWS on more than ten field clauses', () => {
    const fields = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`f${index}`, String(index)]),
    );
    expect(() => toServerFilterSpec({ fields })).toThrow(/at most 10 field clauses/);
  });

  /** 13.544 — the wire has no negation term (exclude-mode spec §2); a dropped exclusion would answer a different question under the user's label. */
  it('13.544 THROWS on a non-empty exclude, naming the key and the axes', () => {
    expect(() =>
      toServerFilterSpec({ exclude: { assigneeIds: [ANSELMA], typeIds: ['bug'] } }),
    ).toThrow(UnexpressibleFilterError);
    expect(() => toServerFilterSpec({ exclude: { typeIds: ['bug'] } })).toThrow(
      /filter key exclude .*no negation term.*typeIds/,
    );
  });

  it('13.544 does NOT throw on an empty exclude object or on empty exclude lists — they exclude nothing', () => {
    expect(toServerFilterSpec({ text: 'gst', exclude: {} })).toEqual({ text: 'gst' });
    expect(toServerFilterSpec({ text: 'gst', exclude: { typeIds: [] } })).toEqual({ text: 'gst' });
  });

  /**
   * 13.580 — `closed` (backlog/closed spec §3.2/§4, 2026-09-17): the wire and
   * the client spell it the same, so this is a plain carry, not a rename —
   * the same shape `text` gets above, and unlike the plural axes there is no
   * singular/plural disagreement to refuse over.
   */
  it('13.580 carries closed through unchanged, true and false alike', () => {
    expect(toServerFilterSpec({ closed: true })).toEqual({ closed: true });
    expect(toServerFilterSpec({ closed: false })).toEqual({ closed: false });
    // Absent contributes no key — the same "caller named nothing" rule every
    // other optional axis follows here.
    expect(toServerFilterSpec({})).toEqual({});
  });

  /**
   * 3.968 — the `priorities` axis (spec 2026-09-22) is the SAME
   * plural/singular disagreement every other id axis here has, and it is
   * asserted on the same three arms as `assigneeIds` above: one value maps,
   * two THROW, an empty list is not a filter. The wire's `filterSpecSchema`
   * carries ONE `priority`, so narrowing two levels to the first would answer a
   * different question under the user's own label.
   */
  it('3.968 priorities: one level becomes the wire\'s singular `priority`; two THROW; empty contributes nothing', () => {
    expect(toServerFilterSpec({ priorities: ['P1'] })).toEqual({ priority: 'P1' });
    expect(toServerFilterSpec({ priorities: ['P3'] })).toEqual({ priority: 'P3' });
    expect(() => toServerFilterSpec({ priorities: ['P1', 'P2'] })).toThrow(UnexpressibleFilterError);
    expect(() => toServerFilterSpec({ priorities: ['P1', 'P2'] })).toThrow(
      /filter key priorities .* one priority and this filter names 2/s,
    );
    expect(toServerFilterSpec({ priorities: [] })).toEqual({});
  });
});

/**
 * 3.969 — the priority claim crosses the wire as a CLAIM (spec 2026-09-22), on
 * BOTH card sites, and its absence or an off-ladder value is a refusal rather
 * than a silent P2.
 *
 * ⚠ **THE PLAN TEXT'S SIGNATURE WROTE THIS AS UNPASSABLE, AND IT WAS RIGHT WHEN
 * IT WAS WRITTEN — but that premise EXPIRED on 2026-09-22.** The plan wrote
 * `mapListPage(listPageFixtureWith(...), roster)` with `actorName: 'Anselma
 * Marak'`; the shipped `mapListPage` then took NO roster and built an empty one
 * internally, so a list row's `actorName` was ALWAYS `null` and the assertion
 * could never have passed. The roster-resolving half was therefore asserted on
 * the BOARD mapper, which did take one.
 *
 * **The premise is no longer true and the reading is repointed rather than left
 * standing:** `mapListPage(raw, roster)` takes one now, because the list BODY
 * names its workspace (case 13.1287) and `getTickets` joins the roster off it
 * (13.1288). The arm below therefore asserts the EMPTY-ROSTER DEFAULT rather
 * than the only possible answer — a real shape, since a roster the caller may
 * not read arrives as an empty map (13.1289) — and the plan's own assertion is
 * made, for real, by 13.1292.
 */
describe('3.969 the priority claim crosses the wire as a claim; absence and an off-ladder value are refusals', () => {
  const roster = new Map([[ANSELMA, 'Anselma Marak']]);
  const boardOf = (card: TicketCard): BoardResponse => ({
    projectId: '01J9GPRJ000000000000000000',
    workspaceId: '01J9GWS0000000000000000000',
    columns: [
      {
        workflowId: 'wf-errand',
        workflowName: 'Errand',
        workflowVersion: 2,
        stateId: 'doing',
        name: 'Doing',
        category: 'active',
        blocked: false,
        creatable: true,
        // Widened to `BoardTicketCard` here rather than at every `serverCard()`
        // call this helper wraps: `card` is a plain `TicketCard` because this
        // describe is about the PRIORITY claim, not the board's two hierarchy
        // facts — `null`/`null` is the same "nothing to narrow by" default
        // `serverBoardCard` above takes.
        cards: [{ ...card, parent: null, epic: null }],
      },
    ],
  });
  /**
   * `ListResponse.groups[].cards` is `ListCard[]`, not `TicketCard[]` — the wire
   * adds the five list-only facts — so the list fixture is built on the same
   * base and widened the way `serverListCard` (inside the 3.42 describe) does.
   * Spelled again here rather than hoisted: that one is scoped to its own
   * describe, and hoisting it would edit a landed case's surroundings for this
   * one's convenience.
   */
  const listCardOf = (overrides: Partial<ListCard> = {}): ListCard => ({
    ...serverCard(),
    typeRank: 3,
    epicId: '01J9GTKE000000000000000000',
    stateName: 'Doing',
    assignedProvenance: {
      actorId: BIREN,
      clientTime: '2026-08-19T09:59:00.000Z',
      serverTime: '2026-08-19T10:01:00.000Z',
    },
    hasRestrictedParent: false,
    ...overrides,
  });
  const listOf = (card: ListCard): ListResponse => ({
    workspaceId: '01J9GWS0000000000000000000',
    projectId: '01J9GPRJ000000000000000000',
    groupBy: 'flat',
    groups: [{ key: 'all', label: 'All tickets', cards: [card] }],
    nextCursor: null,
  });

  it('the board card carries value and provenance, with the actorName resolved through the roster', () => {
    const view = mapBoardView(
      boardOf(
        serverCard({ priority: { value: 'P1', actorId: ANSELMA, clientTime: 'c', serverTime: 's' } }),
      ),
      roster,
    );
    expect(view.groups[0]?.columns[0]?.cards[0]?.priority).toEqual({
      value: 'P1',
      claim: { actorId: ANSELMA, actorName: 'Anselma Marak', clientTime: 'c', serverTime: 's' },
    });
  });

  it('the list row carries the same claim, with `actorName` null when THIS call hands no roster', () => {
    const page = mapListPage(
      listOf(
        listCardOf({
          priority: { value: 'P3', actorId: ANSELMA, clientTime: 'c', serverTime: 's' },
        }),
      ),
    );
    expect(page.rows[0]?.priority).toEqual({
      value: 'P3',
      claim: { actorId: ANSELMA, actorName: null, clientTime: 'c', serverTime: 's' },
    });
  });

  it('a card with NO priority THROWS naming the path — never a silent P2', () => {
    const { priority: _dropped, ...without } = listCardOf();
    // The cast is what makes the hazard reachable: the fixtures are typed as the
    // server's own response, so only a deliberate widening can hand the mapper a
    // body the server would not send. That is the point — this case is about the
    // mapper's behaviour on a stale projection, not about a legal wire body.
    expect(() => mapListPage(listOf(without as ListCard))).toThrow(/cards\[0\]\.priority/);
  });

  it('a card whose priority is off the ladder THROWS naming the three levels', () => {
    expect(() =>
      mapListPage(
        listOf(
          listCardOf({
            // The cast is load-bearing and deliberate: `P7` is not a `Priority`,
            // and reaching the mapper's own guard is the property under test.
            priority: { value: 'P7' as 'P1', actorId: ANSELMA, clientTime: 'c', serverTime: 's' },
          }),
        ),
      ),
    ).toThrow(/one of P1\/P2\/P3/);
  });
});

/**
 * 3.39 — the refusals. Each asserts the enumeration, not the partiality:
 * WHICH facts are absent and WHO closes them.
 *
 * **NONE of them, and it was six.** ⚠ **CORRECTED 2026-09-20** — this read *"**FOUR
 * of them, and it was six.**"*, and the count kept falling: 4 → 3 (P32/P38) → 1
 * (P39/P40) → **0 on 2026-09-19**, when `search`, the last key, was served.
 * `SERVING_GAPS` is EMPTY, and the case that owns the register — *"3.39 the register
 * is EMPTY — no mapper in this file refuses outright"*, the last one in this block —
 * asserts exactly that. ⚠ **It said *"this block's own first assertion"*, and the
 * register assertion is the block's LAST case: the first case here is `mapSearchHits`
 * answering.** **The
 * block is kept because the history is its content:** `getTickets` and `getTicket`
 * answered with a `ServingGapError` until ruling P25 clause 1's buildable subset
 * landed; their entries are gone from `SERVING_GAPS` rather than emptied, and 3.42
 * below is what replaced them — the same two methods asserted to MAP, over bodies
 * carrying the facts that used to be missing. The case id is kept and its claim
 * inverted, on 7.189's precedent: a divergence that closed can silently re-open,
 * and deleting the case is what makes that invisible.
 *
 * These were pinned on the SERVER side too, and that is where they once went red
 * for the right reason: `apps/server/test/integration/client-contract.test.ts`
 * read `src/online/mappers.ts`, extracted each absence list, and asserted every
 * `wireKey` it named was genuinely missing from a real `/v1` body. Nothing in
 * this package can do that — there is no server here. ⚠ **CORRECTED 2026-09-20:
 * there are no absence lists left to extract and the cross-check helper has no
 * callers, so that half is HISTORY rather than a live pin — it is stated in the
 * past tense because the mechanism it describes is gone.** What the cases below
 * pin now is the half that replaced it: that these mappers answer with the facts
 * those lists used to name, over fixtures typed as the server's own response
 * shapes, so a rename or a drop fails `typecheck` here rather than a comment.
 */
describe('3.39 the register is EMPTY — the blocked methods ANSWER, and the facts they refused are SERVED', () => {
  /**
   * 3.39 — `mapSearchHits` ANSWERS. **This is what replaced the REFUSALS table
   * that stood here, and the table held exactly ONE entry: `search`.**
   *
   * That entry recorded `SearchHit.matchedIn` as absent, and named the cause
   * precisely: the route concatenated the three columns before one
   * `ts_headline`, so *which* one matched was destroyed IN THE QUERY. The owner
   * ruled the query must derive it (2026-09-19), the route now does, and the
   * entry is gone from the register.
   *
   * **The case id is kept and its claim inverted**, on 7.189's precedent this
   * file's own header cites — *"a divergence that closed can silently
   * re-open, and deleting the case is what makes that invisible."* So the
   * assertion that stood here (the refusal fires and names its absence) is
   * replaced by the assertion that the FIELD IT NAMED now arrives.
   */
  it('3.39 search MAPS — the fact the register listed as absent is SERVED, and a fourth spelling is still refused', () => {
    const body: SearchResponse = {
      workspaceId: 'w',
      query: 'q',
      // Required on the response since the notes series' search plan; the
      // ticket half of this case is what it is about, and `mapSearchHits`
      // reads `hits` alone.
      notes: [],
      hits: [
        {
          card: serverCard({ ticketId: 'tkt-h1', projectId: '01J9GPRJ000000000000000000' }),
          snippet: 'a **delivery** note',
          // Deliberately NOT the commonest case. A mapper that defaulted to
          // 'title' — the invention the old refusal existed to prevent — passes
          // a fixture whose answer IS 'title' and fails this one.
          matchedIn: 'description',
        },
      ],
    };

    const hits = mapSearchHits(body);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedIn).toBe('description');
    expect(hits[0]?.snippet).toContain('delivery');
    expect(hits[0]?.ticketId).toBe('tkt-h1');
    expect(hits[0]?.projectId).toBe('01J9GPRJ000000000000000000');

    // AND THE CLOSED UNION STILL REFUSES. A server that answered a fourth word
    // would be answering a question this client did not ask; narrowing it to the
    // nearest known value is the same invention, one layer down.
    expect(() =>
      mapSearchHits({
        ...body,
        hits: [{ ...body.hits[0]!, matchedIn: 'assignee' }],
      }),
    ).toThrow(MappingError);
    // A MISSING key refuses too, rather than reading as a default — the field is
    // the whole of what this method asks, so an absent one is not "no answer
    // needed".
    expect(() =>
      mapSearchHits({ ...body, hits: [{ card: body.hits[0]!.card, snippet: 'x' }] }),
    ).toThrow(MappingError);
  });

  /**
   * 18.271 — Plan 7 Task 4 (spec §14.2): `key` rides on every search hit, the
   * same field `mapTicketRead` and the board's card mappers already read off
   * `TicketCard` — this mapper simply started dropping it, since search hits
   * predate `:ticket`'s picker. Control in the same `it`: every other field
   * stays exactly as 3.39 already proved.
   */
  it('18.271 mapSearchHits exposes key from the card; null stays null; other fields unchanged (control)', () => {
    const body: SearchResponse = {
      workspaceId: 'w',
      query: 'q',
      notes: [],
      hits: [
        { card: serverCard({ ticketId: 'tkt-h1', key: 'CCSO-9' }), snippet: 's1', matchedIn: 'title' },
        { card: serverCard({ ticketId: 'tkt-h2', key: null }), snippet: 's2', matchedIn: 'comment' },
      ],
    };
    const hits = mapSearchHits(body);
    expect(hits[0]?.key).toBe('CCSO-9');
    expect(hits[1]?.key).toBeNull();
    // CONTROL: the other fields still read exactly as 3.39 pins them.
    expect(hits[0]?.ticketId).toBe('tkt-h1');
    expect(hits[0]?.snippet).toBe('s1');
    expect(hits[0]?.matchedIn).toBe('title');
    expect(hits[1]?.matchedIn).toBe('comment');
  });

  /**
   * 12.250 — `mapMyWork` ANSWERS, and this is what replaced case 3.41.
   *
   * 3.41 asserted that the two contested refusals blamed `/v1/contests` rather
   * than the routes that owed nothing. Both refusals are gone (P39 removed the
   * field; P40 moved the door), so the case is REPLACED rather than deleted: a
   * removed refusal leaves nothing that would notice the day this mapper is
   * rewritten to invent a `stateName` or a `serverTime` again.
   *
   * The fixture is typed `MyWorkResponse`, so a server field renamed or dropped
   * fails `typecheck` here rather than disagreeing with a comment.
   */
  it('12.250 mapMyWork flattens the three server groups in order and reads both sibling maps', () => {
    const other = '01J9GPRJ00000000000000000B';
    const body: MyWorkResponse = {
      workspaceId: 'w',
      shared: [],
      groups: {
        // `stateCategory` is overridden per group because it is the key the
        // server BUCKETS by (`bucketFor` reads it off the card), so a card in
        // `open` carrying 'active' is a body the route cannot emit. Stated here
        // because the first draft of this fixture did exactly that and the
        // assertion below caught it.
        open: [serverCard({ ticketId: 'tkt-open', stateCategory: 'open' })],
        active: [serverCard({ ticketId: 'tkt-active', stateCategory: 'active' })],
        terminal: [
          serverCard({ ticketId: 'tkt-done', projectId: other, stateCategory: 'terminal' }),
        ],
      },
      projectNames: { '01J9GPRJ000000000000000000': 'Accounts' },
      stateNames: { 'tkt-open': 'To do', 'tkt-active': 'Doing', 'tkt-done': 'Done' },
      contested: [],
    };
    const view = mapMyWork(body, new Map());

    // Concatenated open → active → terminal. Every card the server sent becomes
    // exactly one item, and the ORDER is asserted rather than the length: a
    // length check passes for a mapper that emitted the same group three times.
    expect(view.assigned.map((item) => item.ticketId)).toEqual([
      'tkt-open',
      'tkt-active',
      'tkt-done',
    ]);
    // The state name comes from the map keyed by TICKET id — not from the
    // card's `stateId`, which is `doing` on all three. If the mapper fell back
    // to the state id these would all read 'doing'.
    expect(view.assigned.map((item) => item.stateName)).toEqual(['To do', 'Doing', 'Done']);
    expect(view.assigned.map((item) => item.stateId)).toEqual(['doing', 'doing', 'doing']);
    // The category survives, which is what lets a client rebuild the server's
    // buckets without a second read.
    expect(view.assigned.map((item) => item.stateCategory)).toEqual([
      'open',
      'active',
      'terminal',
    ]);
    // `inTransit` is a structural emptiness and not a read that came back
    // empty: an online-only shell has no outbox.
    expect(view.inTransit).toEqual([]);
  });

  /**
   * 12.251 — THE EXCLUSION, and the two map misses do NOT mean the same thing.
   *
   * This is the half a permitted-case suite would miss. A `projectNames` miss is
   * the visibility rule applying (P32/P38) and must degrade to `null` with the
   * id kept; a `stateNames` miss is a malformed body and must REFUSE, because
   * the route documents that map as total and `WorkItem.stateName` is required.
   * A mapper that treated both the same way would either blank a legal name or
   * put a slug where a name goes, and only one case can tell those apart.
   */
  it('12.251 a withheld project NAME degrades to null with the id kept; a missing state name refuses', () => {
    const withheld = '01J9GPRJ00000000000000000C';
    const base: MyWorkResponse = {
      workspaceId: 'w',
      shared: [],
      groups: {
        open: [serverCard({ ticketId: 'tkt-1' }), serverCard({ ticketId: 'tkt-2', projectId: withheld })],
        active: [],
        terminal: [],
      },
      projectNames: { '01J9GPRJ000000000000000000': 'Accounts' },
      stateNames: { 'tkt-1': 'To do', 'tkt-2': 'To do' },
      contested: [],
    };
    const view = mapMyWork(base, new Map());
    // Named for the project in the map...
    expect(view.assigned[0]?.projectName).toBe('Accounts');
    // ...and id-only for the one withheld — the id is still there, so the item
    // renders rather than vanishing. Positive control in the same run: the
    // FIRST item proves a name can arrive at all, so `null` here is the rule
    // applying and not a mapper that never reads the map.
    expect(view.assigned[1]?.projectName).toBeNull();
    expect(view.assigned[1]?.projectId).toBe(withheld);

    // The other miss is not a rule. Same body, one state name removed.
    const missing: MyWorkResponse = { ...base, stateNames: { 'tkt-1': 'To do' } };
    expect(() => mapMyWork(missing, new Map())).toThrow(MappingError);
    // And it names the key it wanted, so a reader is sent to the map and not to
    // the card.
    expect(() => mapMyWork(missing, new Map())).toThrow(/stateNames\.tkt-2/);
  });

  /**
   * 12.252 — a contested claim maps, and it has NO `serverTime` to map.
   *
   * Ruling P39 did not find the instant; it removed the field. The strongest
   * available assertion is therefore about what the mapper does NOT produce —
   * the excluding fixture P39 named: the mapper never populates anything called
   * `serverTime` for a contested claim, and a mutation that copies
   * `contestedAt` into one must redden this.
   */
  /**
   * 3.159 — `shared` (case 13.176) goes through the SAME `mapWorkItem` as the
   * three groups, and this case exists to keep it that way.
   *
   * A second mapper for shared cards is the obvious shortcut and the wrong one:
   * `projectNames` and `stateNames` carry two DIFFERENT meanings for a miss —
   * one is a rule applying, the other is a malformed body — and a copy is free
   * to drift on either. The fixture puts a withheld project on a SHARED card
   * specifically, because that is the normal case for the guest this key exists
   * for, and asserts the group card beside it as the control.
   */
  it('3.159 mapMyWork reads `shared` through the same item mapper — a withheld project name degrades, a missing state name refuses', () => {
    const withheld = '01J9GPRJ00000000000000000C';
    const named = '01J9GPRJ000000000000000000';
    const body: MyWorkResponse = {
      workspaceId: 'w',
      groups: { open: [serverCard({ ticketId: 'tkt-mine', projectId: named })], active: [], terminal: [] },
      shared: [
        serverCard({ ticketId: 'tkt-shared', projectId: withheld }),
        serverCard({ ticketId: 'tkt-shared-named', projectId: named }),
      ],
      projectNames: { [named]: 'Registrations' },
      stateNames: { 'tkt-mine': 'Doing', 'tkt-shared': 'Doing', 'tkt-shared-named': 'Doing' },
      contested: [],
    };

    const view = mapMyWork(body, new Map());
    expect(view.shared.map((item) => item.ticketId)).toEqual(['tkt-shared', 'tkt-shared-named']);

    // The withheld one keeps its ID and loses only the NAME — `null`, never ''
    // and never the id wearing a name's clothes.
    expect(view.shared[0]?.projectName).toBeNull();
    expect(view.shared[0]?.projectId).toBe(withheld);
    // The named one in the SAME array proves the lookup runs at all, so the
    // `null` above is the rule applying and not a map that was never read.
    expect(view.shared[1]?.projectName).toBe('Registrations');
    // And the group card is the cross-section control: one rule, both sections.
    expect(view.assigned[0]?.projectName).toBe('Registrations');

    // The OTHER map's miss is not a rule, and must refuse rather than degrade —
    // `WorkItem.stateName` is required, and a fallback to the state id would put
    // a slug where a name goes. Asserted on a SHARED card, which is the arm that
    // did not exist before this key.
    const missing: MyWorkResponse = {
      ...body,
      stateNames: { 'tkt-mine': 'Doing', 'tkt-shared-named': 'Doing' },
    };
    expect(() => mapMyWork(missing, new Map())).toThrow(/tkt-shared/);

    // The key itself is required: a body that omits `shared` entirely is
    // malformed and says so, rather than being read as "nothing is shared with
    // you" — which is a sentence about the world, not about the body.
    const { shared: _dropped, ...withoutShared } = body;
    expect(() => mapMyWork(withoutShared, new Map())).toThrow(/myWork\.shared/);
  });

  it('12.252 mapMyWork maps a contested claim with both recorded instants and no serverTime', () => {
    const body: MyWorkResponse = {
      workspaceId: 'w',
      shared: [],
      groups: { open: [], active: [], terminal: [] },
      projectNames: {},
      stateNames: {},
      contested: [
        {
          ticketId: 'tkt-9',
          title: 'File the GST return',
          rule: 'state-machine',
          reason: 'no transition from done to doing',
          claim: {
            actorId: ANSELMA,
            clientTime: '2026-08-19T09:58:12.000Z',
            contestedAt: '2026-08-19T10:00:00.000Z',
          },
        },
        // The withheld half, in the same body: a contest whose ticket this
        // viewer may no longer see keeps its row and loses only its title.
        {
          ticketId: 'tkt-10',
          title: null,
          rule: 'visibility',
          reason: 'the ticket left this audience',
          claim: {
            actorId: ANSELMA,
            clientTime: '2026-08-19T09:59:00.000Z',
            contestedAt: '2026-08-19T10:01:00.000Z',
          },
        },
      ],
    };
    const view = mapMyWork(body, new Map());
    expect(view.contested[0]?.claim).toEqual({
      actorId: ANSELMA,
      clientTime: '2026-08-19T09:58:12.000Z',
      contestedAt: '2026-08-19T10:00:00.000Z',
    });
    // `toEqual` above already forbids extra keys, but the property is stated
    // separately so the FAILURE names it: a claim shaped like a ClaimProvenance
    // is the defect, and `serverTime` is the member that would make it one.
    expect(Object.keys(view.contested[0]?.claim ?? {}).sort()).toEqual([
      'actorId',
      'clientTime',
      'contestedAt',
    ]);
    expect(view.contested[0]?.claim).not.toHaveProperty('serverTime');
    // The title register, both halves in one run.
    expect(view.contested[0]?.title).toBe('File the GST return');
    expect(view.contested[1]?.title).toBeNull();
    expect(view.contested[1]?.ticketId).toBe('tkt-10');
  });

  /**
   * 12.253 — `mapAttention` maps the three SHIPPED kinds, each with the claim
   * the item is actually about.
   *
   * The `due-soon` arm is the one that can go wrong quietly: `card.stateProvenance`
   * is present on every arm, so a mapper that reached for it everywhere would
   * produce a perfectly well-formed strip that attributes a DEADLINE to whoever
   * last transitioned the ticket. The two provenances are given different
   * actors and different instants in this fixture precisely so that substitution
   * cannot pass.
   */
  it('12.253 mapAttention maps blocked/stale/due-soon, and due-soon carries the DUE claim', () => {
    const BHUPEN = '01J9GUSB000000000000000000';
    const card = serverCard({
      dueDate: {
        state: 'claimed',
        claim: {
          date: '2026-08-25',
          actorId: BHUPEN,
          clientTime: '2026-08-20T04:00:00.000Z',
          serverTime: '2026-08-20T04:00:01.000Z',
        },
      },
    });
    const body: AttentionResponse = {
      workspaceId: 'w',
      generatedAt: '2026-09-02T10:00:00.000Z',
      settings: { staleDays: 7, dueSoonDays: 7, autoCloseAfterDays: null, provenance: null },
      items: [
        { kind: 'blocked', card, stateName: 'Waiting', reason: 'In the blocked state "Waiting".' },
        {
          kind: 'stale',
          card,
          enteredStateAt: '2026-08-19T10:00:00.000Z',
          daysInFlight: 14,
          thresholdDays: 7,
          reason: 'In an active state since 19 Aug, past the 7-day staleness threshold.',
        },
        {
          kind: 'due-soon',
          card,
          due: {
            date: '2026-08-25',
            actorId: BHUPEN,
            clientTime: '2026-08-20T04:00:00.000Z',
            serverTime: '2026-08-20T04:00:01.000Z',
          },
          windowDays: 7,
          reason: 'due 25 Aug (in 5 days)',
        },
      ],
    };
    const items = mapAttention(body, { contests: [] }, new Map());
    expect(items.map((item) => item.kind)).toEqual(['blocked', 'stale', 'due-soon']);
    // Flattened off the nested card, not invented.
    expect(items.map((item) => item.title)).toEqual([
      'File the GST return',
      'File the GST return',
      'File the GST return',
    ]);
    // The route's own sentence, verbatim — this client does not paraphrase a
    // reason composed from workspace settings it does not hold.
    expect(items[0]?.reason).toBe('In the blocked state "Waiting".');
    // The claim per kind. blocked/stale are about the STATE...
    expect(items[0]?.claim?.actorId).toBe(ANSELMA);
    expect(items[1]?.claim?.actorId).toBe(ANSELMA);
    // ...and due-soon is about the DUE DATE, by a different actor at a
    // different instant, so the substitution is visible if it is ever made.
    expect(items[2]?.claim?.actorId).toBe(BHUPEN);
    expect(items[2]?.claim?.serverTime).toBe('2026-08-20T04:00:01.000Z');

    // A fourth wire arm is REFUSED, never skipped: silently dropping it would
    // shorten a strip whose emptiness the user reads as an answer.
    expect(() =>
      mapAttention(
        { ...body, items: [{ ...body.items[0], kind: 'invented' }] },
        { contests: [] },
        new Map(),
      ),
    ).toThrow(MappingError);
  });

  /**
   * 21.242 — the `overdue` arm (NP-06) maps like `due-soon`: it is about the DUE DATE, so the
   * claim is the due claim (not the state's), and the server's reason travels verbatim.
   */
  it('21.242 mapAttention maps an overdue arm carrying the DUE claim and the server reason; CONTROL: an unknown arm is still refused', () => {
    const BHUPEN = '01J9GUSB000000000000000000';
    const due = {
      date: '2026-08-17',
      actorId: BHUPEN,
      clientTime: '2026-08-10T04:00:00.000Z',
      serverTime: '2026-08-10T04:00:01.000Z',
    };
    const card = serverCard({ dueDate: { state: 'claimed', claim: due } });
    const body: AttentionResponse = {
      workspaceId: 'w',
      generatedAt: '2026-10-01T10:00:00.000Z',
      settings: { staleDays: 7, dueSoonDays: 7, autoCloseAfterDays: null, provenance: null },
      items: [{ kind: 'overdue', card, due, daysOverdue: 45, reason: 'was due 17 Aug (45 days ago)' }],
    };
    const items = mapAttention(body, { contests: [] }, new Map());
    expect(items.map((item) => item.kind)).toEqual(['overdue']);
    expect(items[0]?.reason).toBe('was due 17 Aug (45 days ago)');
    expect(items[0]?.claim?.actorId).toBe(BHUPEN);
    expect(items[0]?.claim?.actorId).not.toBe(ANSELMA);
    expect(() =>
      mapAttention({ ...body, items: [{ ...body.items[0], kind: 'invented' }] }, { contests: [] }, new Map()),
    ).toThrow(MappingError);
  });

  /**
   * 12.254 — the FOURTH kind is the join, and it carries `claim: null`.
   *
   * `AttentionItem.claim` is `ClaimProvenance | null`, so a contested claim
   * having no server instant costs the item its provenance line rather than
   * making the item unformable — which is exactly the difference from
   * `ContestedClaim.claim`, non-nullable, which needed a type of its own. Both
   * halves are asserted in one run so "null" here is the type working and not a
   * mapper that fills nothing.
   */
  it('12.254 mapAttention appends contested items from /v1/contests with a null claim', () => {
    const body: AttentionResponse = {
      workspaceId: 'w',
      generatedAt: '2026-09-02T10:00:00.000Z',
      settings: { staleDays: 7, dueSoonDays: 7, autoCloseAfterDays: null, provenance: null },
      items: [
        {
          kind: 'blocked',
          card: serverCard(),
          stateName: 'Waiting',
          reason: 'In the blocked state "Waiting".',
        },
      ],
    };
    const items = mapAttention(
      body,
      {
        contests: [
          {
            ticketId: 'tkt-9',
            title: 'Chase the licence renewal',
            projectId: '01J9GPRJ000000000000000000',
            rule: 'state-machine',
            reason: 'no transition from done to doing',
          },
        ],
      },
      new Map(),
    );
    // The swept kind survives and the joined one is appended — the strip is the
    // union, not one or the other.
    expect(items.map((item) => item.kind)).toEqual(['blocked', 'contested']);
    const contested = items[1];
    // The two fields that used to make this kind unformable, both off the
    // contest row itself rather than a second route.
    expect(contested?.title).toBe('Chase the licence renewal');
    expect(contested?.projectId).toBe('01J9GPRJ000000000000000000');
    expect(contested?.reason).toBe('no transition from done to doing');
    // Null, and the blocked item in the same run proves a claim can arrive.
    expect(contested?.claim).toBeNull();
    expect(items[0]?.claim).not.toBeNull();
  });

  it('3.39 the register is EMPTY — no mapper in this file refuses outright', () => {
    // Six under P25 clause 1, four after it served `getTickets`/`getTicket`,
    // three after P32/P38 served `getMyWorkspaces`, one after P39 and P40 served
    // `getMyWork` and `getAttention`, and **ZERO since the owner ruled the search
    // QUERY must derive `matchedIn`** (2026-09-19). The number in this title has
    // been wrong by being right when written more than once, which is why the
    // membership below is asserted INDIVIDUALLY rather than trusted to a count.
    //
    // **`search` was the last, and it was the one gap a join could never close:**
    // `routes/search.ts` concatenated the three columns before a single
    // `ts_headline`, destroying which one matched. That was a QUERY defect, not a
    // missing capability — `proj_search` had stored the three separately, and
    // weighted them apart, all along.
    //
    // **An empty register is not a claim that no read is missing.** It says no
    // MAPPER here refuses outright; a refusal that MOVES has its own home, and a
    // view with nothing to render says so where it renders.
    expect(Object.keys(SERVING_GAPS).sort()).toEqual([]);
    // Positive control on the sort above: the methods NOT here are the ones this
    // source answers. `getBoard` is the one P25 clause 1 unblocked first;
    // `getTickets` and `getTicket` are the two it unblocked in this change set,
    // and they are asserted ABSENT here rather than merely left out, because an
    // entry hollowed to `[]` would still be a key.
    expect(SERVING_GAPS['getBoard']).toBeUndefined();
    expect(SERVING_GAPS['getMembers']).toBeUndefined();
    expect(SERVING_GAPS['getTickets']).toBeUndefined();
    expect(SERVING_GAPS['getTicket']).toBeUndefined();
    // `getMyWorkspaces` pinned as SERVED for the same reason: a refusal that
    // stops refusing must leave a trace, or the only record it ever refused is
    // a shorter array.
    expect(SERVING_GAPS['getMyWorkspaces']).toBeUndefined();
    // The two this change set unblocked, pinned ABSENT for the same reason: a
    // refusal that stops refusing must leave a trace, or the only record it ever
    // refused is a shorter array.
    expect(SERVING_GAPS['getMyWork']).toBeUndefined();
    expect(SERVING_GAPS['getAttention']).toBeUndefined();
  });
});
/**
 * 3.42 — the two methods ruling P25 clause 1 UNBLOCKED, asserted to map.
 *
 * This is what replaced two of 3.39's six entries. A deleted refusal leaves
 * nothing that would notice the day the mapper is rewritten to invent a
 * `stateName` again, so the refusal case is not merely removed: the same two
 * methods are pinned mapping real bodies, and — the half a permitted-case suite
 * would miss — pinned WITHHOLDING on the body where the rule excludes.
 *
 * The list fixture is typed `ListResponse`, so a `ListCard` field that is
 * renamed or dropped on the server fails `typecheck` here rather than
 * disagreeing with a comment. The ticket-read fixture cannot be: that route
 * composes its body inline and no domain type names it. Stated rather than left
 * looking equivalent — the server half of that shape is 7.203 in
 * `apps/server/test/integration/client-contract.test.ts`, against a real body.
 */
describe('3.42 getTickets and getTicket map, and the withheld case is withheld', () => {
  function serverListCard(overrides: Partial<ListCard> = {}): ListCard {
    return {
      ...serverCard(),
      typeRank: 3,
      epicId: '01J9GTKE000000000000000000',
      stateName: 'Doing',
      assignedProvenance: {
        actorId: BIREN,
        clientTime: '2026-08-19T09:59:00.000Z',
        serverTime: '2026-08-19T10:01:00.000Z',
      },
      hasRestrictedParent: false,
      ...overrides,
    };
  }

  it('maps a list body into rows carrying all five formerly-absent facts', () => {
    const body: ListResponse = {
      workspaceId: '01J9GWS0000000000000000000',
      projectId: '01J9GPRJ000000000000000000',
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All tickets', cards: [serverListCard()] }],
      nextCursor: null,
    };
    const view = mapListPage(body);
    expect(view.projectId).toBe('01J9GPRJ000000000000000000');
    const row = view.rows[0];
    // The five, by value and not by presence: a `toHaveProperty` sweep would
    // pass on a mapper that read every one of them off the wrong key.
    expect(row?.typeRank).toBe(3);
    expect(row?.epicId).toBe('01J9GTKE000000000000000000');
    expect(row?.stateName).toBe('Doing');
    expect(row?.assignedProvenance?.actorId).toBe(BIREN);
    expect(row?.hasRestrictedParent).toBe(false);
    // The roster is empty by force (no workspace id is on this body or in the
    // signature), so the assignee degrades to its id and the provenance name to
    // null — both documented absence values, neither an invented name.
    expect(row?.assignee).toEqual({ id: ANSELMA, name: ANSELMA });
    expect(row?.assignedProvenance?.actorName).toBeNull();
  });

  /**
   * 13.580 — `ListRow.closed` (backlog/closed spec §1.2/§3.3, 2026-09-17):
   * REQUIRED on the wire (`TicketCard.closed`, read-models.ts) and read onto
   * the row unchanged, both when the wire names an actor and clock and when
   * it is `null` — the same "present and null" pair `serverCard()`'s own
   * default already exercises for every other `3.4x` case in this file.
   */
  it('13.580 mapListPage carries the wire card\'s closed flag onto the row, present and null', () => {
    const bodyClosed: ListResponse = {
      workspaceId: '01J9GWS0000000000000000000',
      projectId: 'p',
      groupBy: 'flat',
      groups: [
        {
          key: 'all',
          label: 'All',
          cards: [
            serverListCard({
              ticketId: 't-closed',
              closed: { actorId: ANSELMA, at: '2026-09-17T00:00:00.000Z' },
            }),
          ],
        },
      ],
      nextCursor: null,
    };
    expect(mapListPage(bodyClosed).rows[0]?.closed).toEqual({ actorId: ANSELMA, at: '2026-09-17T00:00:00.000Z' });

    const bodyOpen: ListResponse = {
      workspaceId: '01J9GWS0000000000000000000',
      projectId: 'p',
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All', cards: [serverListCard({ ticketId: 't-open', closed: null })] }],
      nextCursor: null,
    };
    expect(mapListPage(bodyOpen).rows[0]?.closed).toBeNull();
  });

  /**
   * **13.703 — the Global Constraint's case, and it is named for exactly that.**
   *
   * `docs/superpowers/plans/2026-09-17-backlog-and-closed-second-wave.md`
   * states the rule this case exists for: *"Every new wire field is carried end
   * to end in ONE task — server assembler → JSON → `mappers.ts` — with a mapper
   * test. The core plan's final review found the closed flag dead in production
   * because every view test drove a fake data source; that must not recur."*
   * `rank` is that field for Task 3, and this is the mapper half of it: the
   * server side is `apps/server/test/projections/tickets-rank.test.ts` (13.702,
   * the column and `rowToTicketState`) and the replica side is 13.704.
   *
   * **Both routes, because there are two.** `rank` reaches a client on the list
   * body (`mapListPage` → `mapListRow`) AND on the single-ticket body
   * (`mapTicketRead` → `mapTicketState`), and those two mappers enumerate their
   * fields by hand — which is the mechanism by which 13.603's blocker happened:
   * `mapTicketState` was missing `closed` for a whole task while every one of
   * its own consumers' tests stayed green against a fake. A case that proved
   * only `mapListRow` would leave the other half of the same wire unwatched.
   */
  it("13.703 mapListPage and mapTicketRead both carry the wire's rank onto the read model, present and null", () => {
    const ranked = (): ListResponse => ({
      workspaceId: '01J9GWS0000000000000000000',
      projectId: 'p',
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All', cards: [serverListCard({ ticketId: 't-ranked', rank: 'i' })] }],
      nextCursor: null,
    });
    expect(mapListPage(ranked()).rows[0]?.rank).toBe('i');

    // `null` is the wire's own word for "never ranked" and it must survive as
    // `null` rather than become `undefined`: `ListRow.rank` is REQUIRED, and
    // the Backlog tab's order (`compareByRank`) separates "ranked" from
    // "unranked" by exactly this distinction.
    const unranked = (): ListResponse => ({
      workspaceId: '01J9GWS0000000000000000000',
      projectId: 'p',
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All', cards: [serverListCard({ ticketId: 't-unranked', rank: null })] }],
      nextCursor: null,
    });
    expect(mapListPage(unranked()).rows[0]?.rank).toBeNull();

    // The single-ticket route, through its own mapper pair. `ticketReadBody`'s
    // `ticketState.rank` default is `null`, so the value assertion needs the
    // override; the pair is asserted together so a `mapTicketState` that read
    // the key but dropped it cannot pass on the "present and null" arm alone.
    expect(
      mapTicketRead(
        ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }, null, null, 'n'),
      ).ticket.rank,
    ).toBe('n');
    expect(
      mapTicketRead(ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' })).ticket.rank,
    ).toBeNull();
  });

  /**
   * **13.724 — `reopenedAt` reaches the client, and it is the LAST field on this
   * mapper that would have gone dead the 13.603 way.**
   *
   * The route serves a whole `TicketState` and `mapTicketState` enumerates its
   * members BY HAND, so a member added to `rowToTicketState` and not added here
   * is silently dropped on this route alone — which is exactly how `closed` was
   * dead in production for a whole task while every consumer's test drove a
   * fake (13.603).
   *
   * **Why this one is tolerant where `closed` and `rank` are strict.** Both of
   * those are RENDERED — a dropped `closed` hides the badge and a dropped
   * `rank` reorders the Backlog tab — so an absent key there is a silent,
   * visible product defect and `mapClosed`/`mapRank` throw on it. `reopenedAt`
   * is a SWEEP INPUT (spec §8.2): no client surface reads it, the sweep is
   * server-side, and its only job on this mapper is that the mapped
   * `TicketState` have the same SHAPE as the one the replica folds locally
   * (`replica-data-source.ts` gets it free from the shared reducer), so the two
   * remain comparable. An absent key therefore reads as `null` here — the same
   * answer as an explicit null — rather than throwing on a body whose only
   * fault is a key nothing renders. **The value is still policed**: a non-null
   * value that is not a string is refused, because `string | null` is the whole
   * type and coercing a number into it would be a claim nobody made.
   */
  it("13.724 mapTicketRead carries the wire ticketState's reopenedAt onto TicketState.reopenedAt", () => {
    const reopenedAt = '2026-08-20T19:00:00.000Z';
    expect(
      mapTicketRead(
        ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }, null, null, null, reopenedAt),
      ).ticket.reopenedAt,
    ).toBe(reopenedAt);

    // Present-and-null, the arm every pre-existing call site exercises: the two
    // must not collapse into one value, because `null` ("never reopened, or
    // transitioned since") and a stamp are different facts about the ticket.
    expect(
      mapTicketRead(ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' })).ticket
        .reopenedAt,
    ).toBeNull();

    // The absent key, tolerated by this mapper and by no other reader of a
    // `closed`/`rank`-shaped field on this body — asserted so the tolerance is
    // a stated behaviour rather than an accident of `??`.
    const omitted = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
    delete (omitted['ticketState'] as Record<string, unknown>)['reopenedAt'];
    expect(mapTicketRead(omitted).ticket.reopenedAt).toBeNull();

    // The value is policed: a number is not in `string | null`.
    expect(() =>
      mapTicketRead(
        ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }, null, null, null, 42),
      ),
    ).toThrow(MappingError);
  });

  it('29.358 mapTicketRead carries a Decision outcome and passes onto TicketState; absent when absent', () => {
    const passes = [
      {
        pass: 1,
        outcome: 'Yes',
        by: 'u',
        at: '2026-10-03T09:00:00.000Z',
        revisions: [{ from: null, to: 'Yes', by: 'v', at: '2026-10-03T09:05:00.000Z' }],
      },
    ];
    const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
    const wire = body['ticketState'] as Record<string, unknown>;
    const mapped = mapTicketRead({ ...body, ticketState: { ...wire, outcome: 'Yes', passes } }).ticket;
    expect(mapped.outcome).toBe('Yes');
    expect(mapped.passes).toEqual(passes);
    // control: a ticket never decided maps to a state with neither key (the wire omits both)
    expect(['outcome', 'passes'].filter((k) => k in mapTicketRead(body).ticket)).toEqual([]);
    // a cleared outcome sent as null is absent too; the pass record stays
    const cleared = mapTicketRead({ ...body, ticketState: { ...wire, outcome: null, passes } }).ticket;
    expect('outcome' in cleared).toBe(false);
    expect(cleared.passes).toEqual(passes);
    // the VALUE is policed: a numeric pass is refused, not cast
    expect(() => mapTicketRead({ ...body, ticketState: { ...wire, passes: [{ ...passes[0], pass: '1' }] } })).toThrow(MappingError);
  });

  it('13.703 refuses a wire rank that is not a rank key, rather than passing it through', () => {
    // `mapRank` is not a `typeof raw === 'string'` check. A space is outside
    // the alphabet, so `''`-or-anything would let a key reach `compareByRank`,
    // whose `<` on strings still "works" — silently ordering the Backlog tab
    // by a key the domain would have refused at the door. The mapper is the
    // last place this can be caught, and it is caught by the SAME predicate the
    // domain door uses (`isRankKey`) rather than a second copy of the rule.
    const body: ListResponse = {
      workspaceId: '01J9GWS0000000000000000000',
      projectId: 'p',
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All', cards: [serverListCard({ ticketId: 't-bad', rank: 'a b' })] }],
      nextCursor: null,
    };
    expect(() => mapListPage(body)).toThrow(MappingError);
    // The error NAMES the field, which is what makes this assertion about
    // `.rank` rather than about "something threw" — `mapListPage` has many
    // reasons to throw and a bare `toThrow(MappingError)` would accept any of
    // them.
    expect(() => mapListPage(body)).toThrow(/\.rank/);
  });

  it('flattens groups in order and loses no card', () => {
    const body: ListResponse = {
      workspaceId: '01J9GWS0000000000000000000',
      projectId: 'p',
      groupBy: 'status',
      groups: [
        { key: 'a', label: 'A', cards: [serverListCard({ ticketId: 't1' })] },
        {
          key: 'b',
          label: 'B',
          cards: [serverListCard({ ticketId: 't2' }), serverListCard({ ticketId: 't3' })],
        },
      ],
      // `null`, and it USED to read `'t3'` here. This case is about flattening
      // groups in order, and it carried a non-null cursor incidentally — which
      // means it asserted that a PAGE maps to a complete list. The fixture was
      // encoding the defect, not merely failing to catch it.
      nextCursor: null,
    };
    expect(mapListPage(body).rows.map((row) => row.ticketId)).toEqual(['t1', 't2', 't3']);
  });

  /**
   * **12.256 — THE C2 REFUSAL FLIPS TO THE SERVED PATH (ruling P41, Door B).**
   *
   * This case used to assert that `mapListView` THREW on a non-null cursor,
   * because `TicketListView` had nowhere to say "there is more" and serving the
   * rows would have presented a page as the whole project. The refusal was
   * right and it is now unnecessary rather than wrong: the mapper no longer
   * claims to produce the view. It maps a PAGE and CARRIES THE CURSOR OUT, and
   * `onlineDataSource.getTickets` follows it to exhaustion (12.257).
   *
   * The property that mattered is preserved one level up, not abandoned: no
   * caller can still mistake a page for a project, because no caller ever
   * receives a page. What changed is WHO enforces it.
   */
  it('12.256 carries the cursor out instead of refusing — a page is a page, and it says so', () => {
    const paged = {
      projectId: 'p',
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'A', cards: [serverListCard({ ticketId: 't1' })] }],
      nextCursor: 't1',
    };
    const page = mapListPage(paged);
    expect(page.nextCursor).toBe('t1');
    expect(page.rows.map((row) => row.ticketId)).toEqual(['t1']);

    // THE CONTROL, same run, same body: with the cursor null the identical rows
    // map and the cursor is null. So `nextCursor` is being READ, not defaulted
    // — a mapper that hard-coded either value would fail one of these two.
    const complete = mapListPage({ ...paged, nextCursor: null });
    expect(complete.nextCursor).toBeNull();
    expect(complete.rows.map((row) => row.ticketId)).toEqual(['t1']);

    // And an ABSENT key is the same answer as null, which is deliberate: the
    // server omits the key on some terminal shapes and a mapper that
    // distinguished them would make an unobservable wire detail load-bearing.
    const { nextCursor: _dropped, ...withoutKey } = paged;
    expect(mapListPage(withoutKey).nextCursor).toBeNull();

    // A cursor of the wrong TYPE is a mapping error rather than a silent
    // stringify — it would otherwise become a request the server cannot
    // resolve, and the loop would page forever against it.
    expect(() => mapListPage({ ...paged, nextCursor: 7 })).toThrow(MappingError);
  });

  it('refuses a row whose hasRestrictedParent is missing rather than reading it as false', () => {
    // The harmful direction of this flag is `false` — "no parent is being kept
    // from you" — so a body that lost it must fail loudly. `record['x'] === true`
    // would have answered `false` here and rendered a complete-looking row.
    const card = serverListCard() as Record<string, unknown>;
    delete card['hasRestrictedParent'];
    expect(() =>
      mapListPage({ projectId: 'p', groupBy: 'flat', groups: [{ key: 'all', label: 'A', cards: [card] }] }),
    ).toThrow(MappingError);
  });

  it('maps a ticket read whose parent is VISIBLE, title and all', () => {
    const read = mapTicketRead(ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }));
    expect(read.title).toBe('File the GST return');
    expect(read.ticket.kind).toBe('ticket');
    expect(read.ticket.stateId).toBe('doing');
    expect(read.ticket.transitions).toHaveLength(1);
    expect(read.stateProvenance.actorId).toBe(ANSELMA);
    expect(read.parent).toEqual({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
  });

  it('THE EXCLUSION — a restricted parent arrives as existence-without-title, and no title reaches the view', () => {
    const read = mapTicketRead(ticketReadBody({ kind: 'restricted', id: 'parent-1' }));
    expect(read.parent).toEqual({ kind: 'restricted', id: 'parent-1' });
    // Structural, not merely absent-valued: the restricted arm of `ParentRef`
    // has no `title` field, so this asserts the mapper did not smuggle one in
    // under a shape the type would have allowed to pass unread.
    expect(Object.keys(read.parent ?? {}).sort()).toEqual(['id', 'kind']);
    // The control in the same run: the ticket's OWN title is still there, so
    // "no title on the parent" is not "this mapper produced nothing".
    expect(read.title).toBe('File the GST return');
  });

  /**
   * THE CASE EVERY OTHER TICKET-READ CASE SKIPS, and the reason it is written
   * out rather than folded into one of them: `ticketReadBody`'s `rollup`
   * defaulted to `null`, so all four cases above exercise a LEAF, and the
   * branch that reads the rollup's keys was never entered. `getTicket` was
   * recorded as SERVED on the strength of those four, and it answered a
   * `MappingError` for every ticket that has children — the whole app-core
   * suite green throughout.
   *
   * A fixture default is not neutral. `rollup: null` reads as "unset" and is
   * in fact a choice of the one shape that skips the mapper's only branch.
   */
  it('maps a ticket that HAS CHILDREN — the branch four leaf fixtures never entered', () => {
    const read = mapTicketRead(
      ticketReadBody(
        { kind: 'ticket', id: 'parent-1', title: 'Quarterly filings' },
        { totalChildren: 3, terminalChildren: 1, uncategorizedChildren: 0, restrictedCount: 1 },
      ),
    );
    // THREE keys, not four: `RollupToViewer` has no `uncategorizedChildren`
    // field, and `mapRollup` refuses outright when that count is non-zero
    // rather than rendering an admittedly incomplete total as a complete one.
    // An exact `toEqual` is what says so — `toMatchObject` would have passed
    // whether the key were dropped, kept, or renamed.
    expect(read.rollup).toEqual({
      totalChildren: 3,
      terminalChildren: 1,
      restrictedCount: 1,
    });
    // The control in the same run: a leaf still answers null, so this is a fact
    // about the rollup branch and not about the mapper having stopped refusing.
    expect(mapTicketRead(ticketReadBody({ kind: 'ticket', id: 'p', title: 't' })).rollup).toBeNull();
  });

  it("REFUSES rollupFor's own spelling, so a route regressing to it cannot pass silently", () => {
    // `RollupView` — `{total, terminal, uncategorized, restrictedCount}` — is
    // what `rollupFor` computes and what this route used to serve verbatim.
    // The client has exactly ONE rollup vocabulary (`TicketRollup`, the shape
    // `assembleTicketCards` already translates every card into), and a body in
    // the other spelling is a body it cannot read. Pinning the REFUSAL matters
    // more than pinning the success: the failure this guards against is the
    // route quietly reverting, and a mapper that coerced the other spelling
    // would hide that forever.
    expect(() =>
      mapTicketRead(
        ticketReadBody(
          { kind: 'ticket', id: 'parent-1', title: 'Quarterly filings' },
          { total: 3, terminal: 1, uncategorized: 0, restrictedCount: 1 },
        ),
      ),
    ).toThrow(MappingError);
  });

  it('refuses a parent whose kind it does not know rather than reading it as no parent', () => {
    // `null` means "this ticket is a ROOT" — a statement about the work. A body
    // that could not be read must not become one.
    expect(() => mapTicketRead(ticketReadBody({ kind: 'hidden', id: 'parent-1' }))).toThrow(
      MappingError,
    );
  });

  /**
   * 13.603 — Finding 1 (final whole-branch review, BLOCKER, 2026-09-17):
   * `mapTicketState` enumerated every `TicketState` field BY HAND and never
   * read `record['closed']`, so `mapTicketRead` — the sole producer of
   * `TicketRead.ticket` for the shipped web shell (`onlineDataSource.getTicket`
   * → `mapTicketRead` → `mapTicketState`) — silently dropped the flag. Every
   * reader of the field spells `state.closed ?? null`, so the wrong answer was
   * indistinguishable from the right one for a ticket that had never been
   * closed, which is exactly why four surfaces (`ticket-sheet.tsx`'s
   * Close/Reopen/badge, `precheck.ts`'s `closed-ticket`/`already-closed`
   * gates, `create-ticket-flow.tsx`'s `parentClosed`) were dead in production
   * while every one of THEIR OWN tests stayed green — each seeds a fake
   * `DataSource` or `ticketStateSeed` directly and never crosses this mapper.
   * `mapClosed` (`:1247`, already proven by 13.580's `ListRow.closed` case)
   * is the exact `{actorId, at} | null` shape `TicketState.closed` also wants,
   * required on the wire per spec §1.2 ("the wire types … carry it REQUIRED"),
   * so it throws rather than defaulting when the key is absent — which is why
   * `ticketReadBody`'s own `ticketState` fixture below now states `closed`
   * explicitly instead of leaving the key out and relying on this mapper's
   * old silence.
   */
  it("13.603 mapTicketRead carries the wire ticketState's closed flag onto TicketState.closed, present and null", () => {
    const closedRead = mapTicketRead(
      ticketReadBody(
        { kind: 'ticket', id: 'parent-1', title: 'The epic' },
        null,
        { actorId: ANSELMA, at: '2026-09-17T00:00:00.000Z' },
      ),
    );
    expect(closedRead.ticket.closed).toEqual({ actorId: ANSELMA, at: '2026-09-17T00:00:00.000Z' });

    const openRead = mapTicketRead(
      ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }, null, null),
    );
    expect(openRead.ticket.closed).toBeNull();
  });

  it('13.603 refuses a ticketState whose closed key is missing rather than reading it as never-closed', () => {
    // Backs up this case's own docblock claim that `mapClosed` "throws on an
    // absent key rather than defaulting" — the same shape this file already
    // proves for `ListRow.hasRestrictedParent` above. Without this, a mutant
    // reading `record['closed'] === undefined ? null : mapClosed(record
    // ['closed'], path)` would satisfy both assertions above (a present claim
    // still validates through `mapClosed`, and an EXPLICIT `null` still maps)
    // while silently reintroducing exactly Finding 1's defect for any wire
    // body that omits the key outright — which `mapClosed`'s own docblock
    // (`:1247`) already argues is a different claim than an explicit `null`,
    // and which this case is what actually holds it to. Planted and
    // confirmed: that exact mutant reddens ONLY this `it`, `PASS (62)
    // FAIL (1)` of the file's 63 (`cp`/`sha256sum` restore).
    const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }) as {
      ticketState: Record<string, unknown>;
    };
    delete body.ticketState['closed'];
    expect(() => mapTicketRead(body)).toThrow(MappingError);
  });

  /**
   * **NO CASE ID, deliberately.** The coordinator owns the `test-cases/`
   * catalogue and the id allocation for this round, so this pair is added
   * without one rather than minting a number; it is the soft delete's member of
   * the family `13.603` opened and `13.703`/`13.724` continued, and it belongs
   * under whichever id the coordinator assigns.
   *
   * The defect it closes is the FOURTH recurrence of one shape: `mapTicketState`
   * enumerates `TicketState` by hand, so every new domain member is dropped
   * until somebody adds it. `rowToTicketState` writes `deleted` unconditionally,
   * so the single read's body carries it and this mapper did not read it — the
   * `13.603` BLOCKER's exact mechanism (four UI surfaces dead in production,
   * every one of their own tests green because they seed a fake `DataSource`).
   */
  it('carries the wire ticketState\'s deleted flag onto TicketState.deleted, present and null', () => {
    const deletedRead = mapTicketRead(
      ticketReadBody(
        { kind: 'ticket', id: 'parent-1', title: 'The epic' },
        null,
        null,
        null,
        null,
        null,
        { actorId: ANSELMA, at: '2026-09-20T00:00:00.000Z' },
      ),
    );
    expect(deletedRead.ticket.deleted).toEqual({ actorId: ANSELMA, at: '2026-09-20T00:00:00.000Z' });

    // The positive control in the SAME invocation: a never-deleted ticket reads
    // `null`. Without it this case would pass on a mapper that returned the
    // claim unconditionally.
    const liveRead = mapTicketRead(
      ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }, null, null),
    );
    expect(liveRead.ticket.deleted).toBeNull();
  });

  it('refuses a ticketState whose deleted key is missing rather than reading it as never-deleted', () => {
    // `13.603`'s second case, for the same reason and against the same mutant:
    // a mapper reading `record['deleted'] === undefined ? null : …` would
    // satisfy the two assertions above while silently reintroducing the drop for
    // any body that omits the key outright.
    const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }) as {
      ticketState: Record<string, unknown>;
    };
    delete body.ticketState['deleted'];
    expect(() => mapTicketRead(body)).toThrow(MappingError);
  });

  function ticketReadBody(
    parent: Record<string, unknown>,
    rollup: unknown = null,
    closed: unknown = null,
    rank: unknown = null,
    reopenedAt: unknown = null,
    /**
     * Who assigned the ticket, or `null` — and `null` is the DEFAULT because the
     * route always emits the key and answers `null` for an unassigned ticket
     * (`read/assigned-provenance.ts`: there is no claim without an actor). A case
     * that wants an assignment claim passes one.
     */
    assignedProvenance: unknown = null,
    /**
     * The soft-delete flag, or `null` — REQUIRED on the wire exactly as `closed`
     * is, because `rowToTicketState` reads the two columns unconditionally
     * (soft delete, 2026-09-20). A trailing 7th parameter rather than an
     * insertion beside `closed`: every existing call site passes its arguments
     * POSITIONALLY, and inserting in the middle would silently re-point the 3rd
     * through 6th of all of them.
     */
    deleted: unknown = null,
    /**
     * The ticket's key, or `null` (2026-09-20). ⚠ **`unknown` with a `null`
     * default, NOT `string | null`**, on this helper's own existing rule: several
     * cases deliberately send a WRONG TYPE to prove the mapper refuses it, and a
     * parameter typed to the happy path could not express that. `null` is the
     * default because most cases are not about the key — but it is still SENT,
     * because `mapTicketRead` distinguishes a `null` key from a MISSING one.
     */
    key: unknown = null,
    /** The grandparent, or `null` — the same three answers `parent` takes. */
    epic: unknown = null,
  ): Record<string, unknown> {
    return {
      // The `proj_visibility` row the route serves, under the route's own key
      // for it. **⚠ CORRECTED 2026-09-20 — this comment read *"The client reads
      // nothing from it; it is here because the real body carries it."* The
      // second clause is still true; the first is not, and was the whole defect:
      // `mapTicketRead` now reads this row's two MODE columns
      // (`TicketRead.visibility`).** `resolved_mode` is REQUIRED here for the
      // same reason the route always emits it — a body without it is one this
      // client cannot read, and `mapTicketVisibility` says so by name.
      ticket: {
        ticket_id: '01J9GTKA000000000000000000',
        own_mode: 'inherit',
        resolved_mode: 'project',
        seq: 4,
      },
      ticketState: {
        kind: 'ticket',
        id: '01J9GTKA000000000000000000',
        workspaceId: '01J9GWS0000000000000000000',
        projectId: '01J9GPRJ000000000000000000',
        typeId: 'task',
        parentId: 'parent-1',
        workflowId: 'wf-errand',
        workflowVersion: 2,
        stateId: 'doing',
        stateCategory: 'active',
        assigneeId: ANSELMA,
        collaboratorIds: [BIREN],
        fields: {
          title: {
            value: 'File the GST return',
            actorId: ANSELMA,
            clientTime: '2026-08-19T09:58:12.000Z',
            serverTime: '2026-08-19T10:00:00.000Z',
          },
        },
        transitions: [
          {
            toStateId: 'doing',
            actorId: ANSELMA,
            seq: 4,
            workflowId: 'wf-errand',
            workflowVersion: 2,
          },
        ],
        // 13.603: REQUIRED on the wire (spec §1.2) — defaults to `null` so
        // every pre-existing call site in this file, none of which is ABOUT
        // this flag, keeps exercising the "never closed" arm unchanged.
        closed,
        // 13.703, on the same rule: `rank` is REQUIRED on the wire (spec §8.1)
        // and this default is the same "never ranked" arm.
        rank,
        // 13.724. The wire DOES always carry this key — `rowToTicketState`
        // reads the column unconditionally — so a fixture that omits it is
        // exercising `mapTicketState`'s deliberate tolerance rather than a
        // shape the server ever produces. See that case for why it is tolerant
        // where `closed` and `rank` are strict.
        reopenedAt,
        // The fourth member, on `closed`'s exact rule: REQUIRED on the wire,
        // defaulted to `null` so every pre-existing call site in this file —
        // none of which is ABOUT this flag — keeps exercising the
        // "never deleted" arm unchanged.
        deleted,
      },
      title: 'File the GST return',
      stateProvenance: {
        actorId: ANSELMA,
        clientTime: '2026-08-19T09:58:12.000Z',
        serverTime: '2026-08-19T10:00:00.000Z',
        cause: null,
      },
      assignedProvenance,
      parent,
      rollup,
      // The two crumb fields (2026-09-20), TRAILING for the reason the
      // `deleted` parameter's docblock states: every call site above passes its
      // arguments POSITIONALLY, and inserting these beside `parent` would
      // silently re-point every one of them.
      //
      // ⚠ `key` defaults to `null` and the fixture must still SEND it — the
      // mapper's `=== null` arm is the discriminator, so a body that omits the
      // key REFUSES (case 16.71). Emitting it here is what makes every
      // pre-existing case in this file exercise "this read composed no key"
      // rather than "this producer forgot the field".
      key,
      epic,
    };
  }

  /**
   * 3.167 — the `proj_visibility` row's two MODE columns reach the read, each
   * from ITS OWN key.
   *
   * The fixture's pair is `inherit` / `project`, and they DIFFER on purpose: a
   * mapper that read one key twice cannot pass this, whichever key it picked —
   * `own_mode` for both fails on `resolvedMode`, `resolved_mode` for both fails
   * on `ownMode`. A fixture whose two modes agreed would be a body no client
   * could tell apart, and this case would report coverage of the read while
   * constraining nothing.
   */
  it('3.167 mapTicketRead carries the wire audience onto the read — own and resolved, separately', () => {
    const mapped = mapTicketRead(
      ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }),
    );
    expect(mapped.visibility).toEqual({ ownMode: 'inherit', resolvedMode: 'project' });
  });

  /**
   * 3.168 — a row that OMITS a mode is not the same answer as "no audience was
   * served". `null` on `TicketRead.visibility` means the read carried no row at
   * all (the replica), and a garbled response must not be able to reach it.
   */
  it('3.168 REFUSES a visibility row missing a mode rather than answering null', () => {
    const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
    // The positive control runs FIRST and through the SAME path: the only
    // difference below is the deleted key, so a throw there cannot be about the
    // fixture. (An assertion placed above a control MASKS it.)
    expect(mapTicketRead(body).visibility).toEqual({ ownMode: 'inherit', resolvedMode: 'project' });
    delete (body['ticket'] as Record<string, unknown>)['resolved_mode'];
    expect(() => mapTicketRead(body)).toThrow(/ticket\.resolved_mode/);
    expect(() => mapTicketRead(body)).toThrow(MappingError);
  });

  /**
   * 3.169 — `resolved_mode: 'inherit'` is refused, and `own_mode: 'inherit'` is
   * not. The pair IS the assertion: `proj_visibility` walks the inherit chain at
   * write time so the resolved column cannot hold `inherit`, while a ticket is
   * BORN claiming it. A mapper that refused `inherit` on both would refuse
   * nearly every ticket in the product.
   */
  it('3.169 REFUSES a resolved mode of `inherit`, and accepts the same value as own_mode', () => {
    const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
    const row = body['ticket'] as Record<string, unknown>;
    row['resolved_mode'] = 'inherit';
    expect(() => mapTicketRead(body)).toThrow(/ticket\.resolved_mode/);
    // …and the control on the same body: put the value back where it belongs
    // and the read answers, carrying `inherit` as the OWN mode.
    row['resolved_mode'] = 'project';
    expect(mapTicketRead(body).visibility?.ownMode).toBe('inherit');
  });

  /**
   * 16.71 — `mapTicketRead` carries the ticket's KEY and its GRANDPARENT, and
   * **`key`'s `null` is a DISCRIMINATOR rather than a convenience**.
   *
   * ## Why this case is a mapper case at all
   *
   * The route's own cases (`16.69`, `16.70`) prove the server sends the right
   * bytes; they say nothing about what this client makes of them. A `key` that
   * reached the wire and was never read — or was read and collapsed into the same
   * value as a missing one — would leave every one of those green.
   *
   * ## The refusal is the load-bearing half
   *
   * `null` means *"this read could not compose a key"*: the workspace has no
   * founding claim, or the project is absent from the prefix map, or the number
   * falls outside the snapshot. A body that OMITS the field means something else
   * entirely — a producer that stopped sending it — and the two must not become
   * one reading, because the first has a defined absence rendering and the second
   * is a wire change this client has not agreed to read. That is the same fork
   * `TicketRead.visibility` argues, and the same one `assignedProvenance` above
   * is pinned with; the control for the refusal runs FIRST and differs only in
   * that one key.
   */
  describe('16.71 mapTicketRead carries the key and the grandparent, and refuses a body without the key', () => {
    /**
     * `ticketReadBody`'s own builder, so this case cannot drift from it.
     *
     * The parent is a real VISIBLE one: that helper's first parameter is typed
     * `Record<string, unknown>` and is not nullable, and these cases are about
     * the key and the grandparent — so the parent stays at the file's own idiom
     * rather than widening a shared signature to suit them.
     */
    function body(key: unknown, epic: unknown): Record<string, unknown> {
      return ticketReadBody(
        { kind: 'ticket', id: 'parent-1', title: 'The epic' },
        null, null, null, null, null, null, key, epic,
      );
    }
  
    it('maps a composed key and a visible grandparent through to the read', () => {
      const mapped = mapTicketRead(
        body('CCSO-1183', { kind: 'ticket', id: '01J9GEPIC00000000000000000', title: 'Open Questions' }),
      );
      expect(mapped.key).toBe('CCSO-1183');
      expect(mapped.epic).toEqual({
        kind: 'ticket',
        id: '01J9GEPIC00000000000000000',
        title: 'Open Questions',
      });
    });
  
    it('answers `null` for the wire`s null key — no key composed — rather than throwing', () => {
      // THE CONTROL, and it runs before the refusal below through the same path.
      expect(mapTicketRead(body(null, null)).key).toBeNull();
      expect(mapTicketRead(body(null, null)).epic).toBeNull();
    });
  
    it('REFUSES a body that OMITS the key — absent is not the same answer as null', () => {
      const omitted = body(null, null);
      delete omitted['key'];
      expect(() => mapTicketRead(omitted)).toThrow(/ticket\.key/);
      expect(() => mapTicketRead(omitted)).toThrow(MappingError);
    });
  
    it('carries the grandparent`s RESTRICTED arm as existence-without-title', () => {
      const mapped = mapTicketRead(body(null, { kind: 'restricted', id: '01J9GSECRET000000000000000' }));
      // `toEqual` is exact, so a title travelling on this arm reddens — and the
      // id it must carry is asserted in the same breath.
      expect(mapped.epic).toEqual({ kind: 'restricted', id: '01J9GSECRET000000000000000' });
    });
  });

  /**
   * 13.1292 — **THE ROSTER JOIN'S VALUE IS THE MEMBER'S LABEL**, so every name
   * the join produces already carries the email fallback.
   *
   * The join was `id → displayName`, and `displayName` is `''` for exactly the
   * population the owner's instruction is about: better-auth's magic-link plugin
   * creates a user with `name: name || ""` and the sign-in page sends no name.
   * So a blank-named member joined to `''` — never to their address — and the
   * board and the list rendered an empty name where the sheet's pickers, which
   * had their own copy of the fallback, rendered an address. One person, two
   * names, decided by which surface you were looking at.
   *
   * `memberLabel` is what the join's VALUE is built with now, which is what makes
   * `mapAssignee` and `mapProvenance` correct on all three card sites without
   * either of them knowing an address exists — and, in Task 5's half, without
   * every joining surface having to remember to call the label itself.
   *
   * ⚠ **THE ROSTER IS BUILT THE WAY THE SOURCE BUILDS IT — a members BODY through
   * `mapActors` carrying `displayName: ''`.** A fixture that handed
   * `rosterByActorId` a literal map, or that drove these mappers against an EMPTY
   * roster, would read back the actor id and the email branch would never run:
   * green for the wrong reason, which is the exact failure the `3.969` paragraph
   * above records about a signature that could not express the assertion it
   * wanted.
   */
  it('13.1292 a blank-named member with a real address is named by the ADDRESS through every join, on all three card sites', () => {
    const roster = rosterByActorId(
      mapActors({
        workspaceId: '01J9GWS0000000000000000000',
        members: [
          { userId: 'u1', displayName: 'Kiro', role: 'owner' },
          { userId: 'u2', displayName: '', role: 'guest', email: 'accountant@example.test' },
        ],
      }),
    );

    // THE BOARD, through BOTH doors into the one map from a single card: the
    // assignee (`mapAssignee`) and the state claim's actor (`mapProvenance`).
    const boardView = mapBoardView(
      {
        projectId: '01J9GPRJ000000000000000000',
        workspaceId: '01J9GWS0000000000000000000',
        columns: [
          {
            workflowId: 'wf-errand',
            workflowName: 'Errand',
            workflowVersion: 2,
            stateId: 'doing',
            name: 'Doing',
            category: 'active',
            blocked: false,
            creatable: true,
            cards: [
              serverBoardCard({
                assigneeId: 'u2',
                stateProvenance: { actorId: 'u2', clientTime: 'c', serverTime: 's', cause: null },
              }),
            ],
          },
        ],
      },
      roster,
    );
    const boardCard = boardView.groups[0]?.columns[0]?.cards[0];
    expect(boardCard?.assignee).toEqual({ id: 'u2', name: 'accountant@example.test' });
    expect(boardCard?.stateProvenance.actorName).toBe('accountant@example.test');

    // THE LIST — the surface the owner's first screenshot was about.
    const page = mapListPage(
      {
        workspaceId: '01J9GWS0000000000000000000',
        projectId: '01J9GPRJ000000000000000000',
        groupBy: 'flat',
        groups: [
          {
            key: 'all',
            label: 'All',
            cards: [
              serverListCard({
                assigneeId: 'u2',
                stateProvenance: { actorId: 'u2', clientTime: 'c', serverTime: 's', cause: null },
              }),
            ],
          },
        ],
        nextCursor: null,
      },
      roster,
    );
    expect(page.rows[0]?.assignee).toEqual({ id: 'u2', name: 'accountant@example.test' });
    expect(page.rows[0]?.stateProvenance.actorName).toBe('accountant@example.test');

    // THE TICKET READ — the second screenshot. `ticketReadBody` fixes the state
    // claim to a named actor, so the join is exercised through the ASSIGNMENT
    // claim, which is the other `mapProvenance` call site on this body. The
    // `parent` is a visible one, as in the helper's other call sites — this
    // case is about a name, and an absent parent would exercise an arm of
    // `mapParentRef` that has its own cases.
    const read = mapTicketRead(
      ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' }, null, null, null, null, {
        actorId: 'u2',
        clientTime: 'c',
        serverTime: 's',
      }),
      roster,
    );
    expect(read.assignedProvenance?.actorName).toBe('accountant@example.test');

    // THE CONTROL, through the SAME roster and on the SAME three surfaces: the
    // NAMED member still reads as their name. Without it, a join that returned
    // the first member's label for every id — or the address for everybody —
    // would pass everything above.
    expect(roster.get('u1')).toBe('Kiro');
    const namedBoard = mapBoardView(
      {
        projectId: '01J9GPRJ000000000000000000',
        workspaceId: '01J9GWS0000000000000000000',
        columns: [
          {
            workflowId: 'wf-errand',
            workflowName: 'Errand',
            workflowVersion: 2,
            stateId: 'doing',
            name: 'Doing',
            category: 'active',
            blocked: false,
            creatable: true,
            cards: [serverBoardCard({ assigneeId: 'u1' })],
          },
        ],
      },
      roster,
    );
    expect(namedBoard.groups[0]?.columns[0]?.cards[0]?.assignee).toEqual({
      id: 'u1',
      name: 'Kiro',
    });
  });

  /**
   * 13.1293 — **`actorLabel`'s ORDER IS UNTOUCHED: system actor, then the label,
   * then the id.**
   *
   * The change above put an EMAIL into the join's value, and that value is what
   * `actorLabel` is handed for every claim in this client. So the two properties
   * that keep the email from leaking where it must not are asserted here rather
   * than assumed:
   *
   * 1. **A reserved actor WINS, even against a roster row carrying that id.** A
   *    person's name printed over a decision no person made is the claim
   *    `provenance.ts`'s honesty contract exists to refuse, and "the roster is
   *    authoritative for every id" would produce it.
   * 2. **Auto-close is never given an address.** It has no roster row, so the
   *    email step cannot reach it — and if a body ever minted one, the system
   *    step above still answers first. Both halves are asserted, because only the
   *    second survives a future joining bug.
   */
  it('13.1293 actorLabel still puts the system actor first, and never renders an address for it', () => {
    const systemName = SYSTEM_ACTOR_NAMES.get(SYSTEM_ACTOR_AUTO_CLOSE);
    expect(systemName).toBe('Auto-close');

    // The system step wins over a label that a join could produce — INCLUDING an
    // address, which is the shape this change made reachable.
    expect(actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, 'Auto-close')).toBe(systemName);
    expect(actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, 'accountant@example.test')).toBe(systemName);

    // The control, on the same function and in the same case: an ORDINARY actor
    // takes the label it was handed, so the two assertions above are about the
    // reserved id and not about `actorLabel` ignoring its argument.
    expect(actorLabel('u1', 'Kiro')).toBe('Kiro');
    // And `actorLabel`'s own floor is `Unknown person` (Amended 2026-09-29 by 6.254 (R3 N4); it was the id) — it
    // is handed a claim's `{actorId, actorName}` and has no address to reach
    // for, which is why the email step lives in the JOIN and not here.
    expect(actorLabel('u1', null)).toBe('Unknown person');
  });

  /**
   * 13.1337 — the LIST half of 13.1280 (owner request 2026-09-22: *"on the left
   * of the title, add the ticket key column"*).
   *
   * `ListCard` is `TicketCard & {…}` and `TicketCard.key` has ridden the wire
   * since #681, so the list BODY already carried this field — the row type and
   * this mapper were the two places that did not look at it. The three arms are
   * 13.1280's three arms, deliberately: the same two states cross the same wire
   * and have to survive the same way on both card mappers. A key crosses; `null`
   * is the server's own word for "no prefix in the ledger" and must arrive as
   * `null` rather than collapse to `undefined` (`ListRow.key` is REQUIRED, and
   * `undefined` is what a forgotten field looks like); and an ABSENT key is a
   * body the server does not send, refused by name so that a mapper which forgot
   * the field cannot pass for a workspace without a prefix.
   */
  it('13.1337 mapListPage carries a card key onto the row, keeps null, and refuses absence', () => {
    const body = (card: Partial<ListCard>): ListResponse => ({
      workspaceId: '01J9GWS0000000000000000000',
      projectId: 'p',
      groupBy: 'flat',
      groups: [{ key: 'all', label: 'All', cards: [serverListCard(card)] }],
      nextCursor: null,
    });

    expect(mapListPage(body({ key: 'CCSO-7' })).rows[0]?.key).toBe('CCSO-7');

    // The positive control for the refusal below, and it runs through the SAME
    // path: this body differs from the one above in this one key alone, so a
    // throw there cannot be about the fixture. `toBeNull` and not `toBeFalsy` —
    // the whole assertion is that a real `null` survived rather than an absent
    // field reading as one.
    expect(mapListPage(body({ key: null })).rows[0]?.key).toBeNull();

    const { key: _dropped, ...without } = serverCard();
    const absent = body({});
    absent.groups[0]!.cards = [without as ListCard];
    expect(() => mapListPage(absent)).toThrow(MappingError);
    // The error NAMES the field: a bare `toThrow(MappingError)` would accept any
    // of this mapper's many other reasons to throw.
    expect(() => mapListPage(absent)).toThrow(/\.key/);
  });
  it('27.063 mapTicketState carries links, mapHistory carries linkTarget, mapTicketLinks refuses an unknown kind or direction by name; control: a wire with no links maps to no key', () => {
    const X = '01J9GTKX000000000000000000';
    const stateWith = (links: unknown) => {
      const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
      if (links !== undefined) (body['ticketState'] as Record<string, unknown>)['links'] = links;
      return mapTicketRead(body).ticket;
    };
    expect(stateWith([{ kind: 'blocks', targetId: X }]).links).toEqual([{ kind: 'blocks', targetId: X }]);
    expect('links' in stateWith([])).toBe(false); // the domain's absent-not-empty rule
    expect('links' in stateWith(undefined)).toBe(false); // control: no links on the wire
    expect(() => stateWith([{ kind: 'parent', targetId: X }])).toThrow(/ticket\.ticketState\.links\[0\]\.kind: expected one of blocks\/relates\/duplicates/);

    const historyEvent = (extra: Record<string, unknown>) =>
      mapHistory({
        ticketId: 't',
        events: [
          { id: 'e1', type: 'ticket.link_added', version: 1, payload: { kind: 'blocks', targetId: null }, actorId: ANSELMA, origin: 'web', clientTime: 'c', serverTime: 's', seq: 1, ...extra },
        ],
      })[0]!;
    expect(historyEvent({ linkTarget: null }).linkTarget).toBeNull();
    expect(historyEvent({ linkTarget: { key: 'GN-1' } }).linkTarget).toEqual({ key: 'GN-1' });
    expect('linkTarget' in historyEvent({})).toBe(false);

    const row = (over: Record<string, unknown>) => ({
      kind: 'blocks',
      direction: 'out',
      ticket: { id: X, projectId: 'p1', key: 'GN-1', title: 'One', stateCategory: 'open' },
      ...over,
    });
    expect(() => mapTicketLinks({ links: [row({ kind: 'parent' })] })).toThrow(MappingError);
    expect(() => mapTicketLinks({ links: [row({ kind: 'parent' })] })).toThrow(/links\.links\[0\]\.kind/);
    expect(() => mapTicketLinks({ links: [row({ direction: 'sideways' })] })).toThrow(/links\.links\[0\]\.direction/);
    // N5 (AMEND p11): each member of the direction allow-list has a passing row.
    const two = {
      links: [
        row({}),
        { kind: 'relates', direction: 'in', ticket: { id: 'T2', projectId: 'p1', key: null, title: 'Two', stateCategory: 'active' } },
      ],
    };
    expect(mapTicketLinks(two)).toEqual(two.links);
  });
  it('29.126 mapTicketState and mapTicketLinks carry a leads_to label and write no label key when there is none; a non-string label is refused by its path', () => {
    const X = '01J9GTKX000000000000000000';
    const Y = '01J9GTKY000000000000000000';
    const stateWith = (links: unknown) => {
      const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
      (body['ticketState'] as Record<string, unknown>)['links'] = links;
      return mapTicketRead(body).ticket;
    };
    const st = stateWith([{ kind: 'leads_to', targetId: X, label: 'Yes' }, { kind: 'blocks', targetId: Y }]);
    expect(st.links).toEqual([{ kind: 'leads_to', targetId: X, label: 'Yes' }, { kind: 'blocks', targetId: Y }]);
    expect(Object.keys(st.links![1]!).sort()).toEqual(['kind', 'targetId']); // control: no `label` key at all
    expect(() => stateWith([{ kind: 'leads_to', targetId: X, label: 7 }])).toThrow(/ticket\.ticketState\.links\[0\]\.label/);
    const views = mapTicketLinks({ links: [
      { kind: 'leads_to', direction: 'out', ticket: { id: X, projectId: 'p1', key: 'GN-1', title: 't', stateCategory: 'active' }, label: 'Yes' },
      { kind: 'blocks', direction: 'in', ticket: { id: Y, projectId: 'p1', key: 'GN-2', title: 'u', stateCategory: 'active' } },
    ] });
    expect(views[0]!.label).toBe('Yes');
    expect('label' in views[1]!).toBe(false); // control
    expect(() => mapTicketLinks({ links: [
      { kind: 'leads_to', direction: 'out', ticket: { id: X, projectId: 'p1', key: 'GN-1', title: 't', stateCategory: 'active' }, label: null },
    ] })).toThrow(/links\.links\[0\]\.label/);
  });

  it("28.196 mapHistory carries linkDirection 'in' and 'out', keeps an absent one absent, and refuses any other value by its path", () => {
    const historyEvent = (extra: Record<string, unknown>) =>
      mapHistory({
        ticketId: 't',
        events: [
          { id: 'e1', type: 'ticket.link_added', version: 1, payload: { kind: 'blocks', targetId: null, from: null }, actorId: ANSELMA, origin: 'web', clientTime: 'c', serverTime: 's', seq: 1, ...extra },
        ],
      })[0]!;
    expect(historyEvent({ linkDirection: 'in' }).linkDirection).toBe('in');
    expect(historyEvent({ linkDirection: 'out' }).linkDirection).toBe('out');
    expect('linkDirection' in historyEvent({})).toBe(false); // an older server: absent, and the copy reads it out
    expect(() => historyEvent({ linkDirection: 'sideways' })).toThrow(MappingError);
    expect(() => historyEvent({ linkDirection: 'sideways' })).toThrow(/history\.events\[0\]\.linkDirection: expected one of out\/in/);
  });

  it('28.126 mapTicketState carries a draft-side link\'s from and leaves the key off a plain one', () => {
    const body = ticketReadBody({ kind: 'ticket', id: 'parent-1', title: 'The epic' });
    (body['ticketState'] as Record<string, unknown>)['links'] = [
      { kind: 'blocks', targetId: 'draft-1', from: 'src-1' },
      { kind: 'relates', targetId: 'other-1' },
    ];
    const links = mapTicketRead(body).ticket.links;
    expect(links).toEqual([
      { kind: 'blocks', targetId: 'draft-1', from: 'src-1' },
      { kind: 'relates', targetId: 'other-1' },
    ]);
    expect(links?.[1]).not.toHaveProperty('from');
  });
});

/**
 * 13.357 — `mapWorkspaceRefs` reads `role`, the additions table's one
 * owner-approved invented row: `GET /v1/me/workspaces` has carried it since
 * the route first answered (`apps/server/src/routes/workspaces.ts`), and only
 * the client-side read was missing.
 */
describe('13.357 mapWorkspaceRefs reads role, the server field the client used to ignore', () => {
  function body(role: string): { workspaces: unknown[] } {
    return {
      workspaces: [
        { workspaceId: 'ws1', name: 'Convenience Corner', prefix: 'CC', role, archived: false, nameRestrictedProjectCount: 0, projects: [] },
      ],
    };
  }

  it('maps role onto WorkspaceRef', () => {
    expect(mapWorkspaceRefs(body('admin'))[0]).toEqual({
      id: 'ws1',
      name: 'Convenience Corner',
      // The workspace prefix (owner spec 2026-09-20). Read as a REQUIRED
      // string, never a nullable one — see the mapper. `toEqual` is exact, so
      // this line is also what fails if the mapper ever starts defaulting it.
      prefix: 'CC',
      role: 'admin',
      // Trash series, Plan 1 Task 5 (spec T8). Served for every caller told
      // about this workspace at all.
      archived: false,
      // Task 16. This body carries no `memberCount`, and an absent count is
      // WITHHELD — `null`, never 0. `toEqual` is exact, so this line is also
      // what would fail if the mapper ever started defaulting the absence.
      memberCount: null,
      // Task 18. Unlike the count above it has no withheld state, so a body
      // carrying it maps it straight through — and `toEqual` being exact is
      // what makes this line notice a mapper that started reading it as
      // optional and handing the card `null`.
      nameRestrictedProjectCount: 0,
      projects: [],
    });
  });

  it('refuses a body with no role rather than defaulting one', () => {
    const { workspaces } = body('owner');
    const [entry] = workspaces as Record<string, unknown>[];
    delete entry!['role'];
    expect(() => mapWorkspaceRefs({ workspaces })).toThrow(MappingError);
  });
});

/**
 * Door A, 2026-09-19 — the project description across the wire.
 *
 * **Two states, and the mapper must not let a third one in.** The route always
 * sends the key: a `string` for a described project, `null` for one nobody has
 * described. On the client those become a `string` and an ABSENT key. A row
 * that carries no key at all is a construction site that forgot the field, and
 * `13.983` is what stops it from arriving as "not described" — which is the
 * half-witnessed-contract failure this repo has been bitten by, because a wrong
 * answer that renders as a correct-looking card is invisible to every
 * assertion that only reads the card.
 */
describe('13.982-13.983 mapWorkspaceRefs reads the project description', () => {
  function row(extra: Record<string, unknown>): Record<string, unknown> {
    return { projectId: 'p1', name: 'Delivery', prefix: 'DE', archived: false, description: null, groupId: null, ...extra };
  }
  function body(projects: Record<string, unknown>[]): { workspaces: unknown[] } {
    return {
      workspaces: [
        {
          workspaceId: 'ws1',
          name: 'Meghalaya Rollout',
          prefix: 'MR',
          role: 'member',
          archived: false,
          nameRestrictedProjectCount: 0,
          projects,
        },
      ],
    };
  }

  it('13.982 — a served description maps through, and a null becomes an ABSENT key', () => {
    const [ref] = mapWorkspaceRefs(
      body([
        row({ description: 'Sprint work for the rollout' }),
        row({ projectId: 'p2', name: 'Site readiness', description: null }),
      ]),
    );

    expect(ref!.projects[0]!.description).toBe('Sprint work for the rollout');
    // NOT DESCRIBED is the ABSENCE of the key — asserted with `in`, not with
    // `toBeUndefined()`, which a mapper writing `description: undefined` would
    // also satisfy. The type's docblock claims absence and this is the line
    // that holds it to that word.
    expect('description' in ref!.projects[1]!).toBe(false);
    // THE CONTROL, same body, same run: one project in it IS described, so the
    // absent key above is this mapper's answer about that row and not a body
    // that carried no descriptions at all.
    expect('description' in ref!.projects[0]!).toBe(true);
    // `''` is the specific wrong value the absence must never be collapsed to —
    // the client renders `undefined` as nothing and `''` as an empty line.
    expect(ref!.projects[1]!.description).not.toBe('');
  });

  it('13.983 — REFUSES a project row that omits the description key, naming its path', () => {
    const orphan = row({});
    delete orphan['description'];

    expect(() => mapWorkspaceRefs(body([orphan]))).toThrow(MappingError);
    // The path, so the failure says WHICH row on WHICH route forgot it. A bare
    // `toThrow(MappingError)` would also pass on any other mapping failure in
    // the same body, which is the shape-rather-than-subject mistake.
    expect(() => mapWorkspaceRefs(body([orphan]))).toThrow(/projects\[0\]\.description/);
    // **AND THE GUARD'S OWN SENTENCE, which is what makes this case specific.**
    // The path alone does NOT identify the property: with the presence check
    // deleted, `asString(undefined, path)` still throws a `MappingError` at the
    // SAME path — so the two assertions above would both stay green while the
    // refusal they exist for had been removed entirely. Only the message
    // separates "the key is missing" from "the value is not a string", so the
    // tail of this one is load-bearing rather than decorative.
    expect(() => mapWorkspaceRefs(body([orphan]))).toThrow(/omitting the key/);

    // CONTROL: the identical row WITH the key parses. Without it, the two
    // assertions above would also pass if `mapWorkspaceRefs` refused this body
    // for an unrelated reason.
    expect(() => mapWorkspaceRefs(body([row({})]))).not.toThrow();
  });

  it('22.102 — a project row carries groupId: a string and null both map through, a missing key is refused naming its path', () => {
    const [ref] = mapWorkspaceRefs(body([row({ groupId: '01GROUP' }), row({ projectId: 'p2', groupId: null })]));
    expect(ref!.projects[0]!.groupId).toBe('01GROUP');
    expect(ref!.projects[1]!.groupId).toBeNull();
    const orphan = row({});
    delete orphan['groupId'];
    expect(() => mapWorkspaceRefs(body([orphan]))).toThrow(/projects\[0\]\.groupId/);
    expect(() => mapWorkspaceRefs(body([orphan]))).toThrow(/never omitted/);
    // CONTROL: a number is not a group id either, so the string arm above is a real check.
    expect(() => mapWorkspaceRefs(body([row({ groupId: 7 })]))).toThrow(MappingError);
  });
});

/**
 * 19.070-19.071 — `GET /v1/me/deleted-items` → `DeletedItem[]` (trash series,
 * Plan 1 Task 8). Only the online twin's mapper is exercised here; the
 * replica twin's `ReplicaGapError` is 19.071, in `replica-data-source.test.ts`.
 */
describe('19.070 mapDeletedItems maps every field and refuses a row missing purgeDueAt', () => {
  function fullRow(): DeletedItemsRead {
    return {
      items: [
        {
          kind: 'ticket',
          id: 'tkt1',
          workspaceId: 'ws1',
          workspaceName: 'Convenience Corner',
          projectId: 'prj1',
          projectName: 'Shop operations',
          label: 'CCSO-3 Renew the lease',
          deletedBy: 'usr1',
          deletedByName: 'Kiro',
          deletedAt: '2026-09-28T10:00:00.000Z',
          purgeMarkedAt: '2026-09-28T11:00:00.000Z',
          purgeDueAt: '2026-10-13T11:00:00.000Z',
          containedCount: 0,
        },
      ],
    };
  }

  it('a full row round-trips', () => {
    expect(mapDeletedItems(fullRow())).toEqual(fullRow().items);
  });

  it('null is a real value for projectId/projectName/purgeMarkedAt/purgeDueAt, not a MappingError', () => {
    const body = fullRow();
    const [item] = body.items;
    item!.projectId = null;
    item!.projectName = null;
    item!.purgeMarkedAt = null;
    item!.purgeDueAt = null;
    expect(mapDeletedItems(body)).toEqual(body.items);
  });

  it('refuses a row missing purgeDueAt rather than defaulting it to null', () => {
    const body = fullRow() as { items: Record<string, unknown>[] };
    delete body.items[0]!['purgeDueAt'];
    expect(() => mapDeletedItems(body)).toThrow(MappingError);
    // The path, so the failure says WHICH row forgot it — the same discipline
    // `mapWorkspaceRefs`'s description case (13.983) holds itself to.
    expect(() => mapDeletedItems(body)).toThrow(/items\[0\]\.purgeDueAt/);

    // CONTROL: the identical row WITH the key parses.
    expect(() => mapDeletedItems(fullRow())).not.toThrow();
  });

  it('19.207 maps deletedByName, refuses a row WITHOUT the key, and keeps null as null', () => {
    expect(mapDeletedItems(fullRow())[0]!.deletedByName).toBe('Kiro');

    const withoutKey = fullRow() as { items: Record<string, unknown>[] };
    delete withoutKey.items[0]!['deletedByName'];
    expect(() => mapDeletedItems(withoutKey)).toThrow(MappingError);

    // CONTROL — null is one of the two honest values (a blank or vanished name).
    const nulled = fullRow();
    nulled.items[0]!.deletedByName = null;
    expect(mapDeletedItems(nulled)[0]!.deletedByName).toBeNull();
  });
});

/**
 * 13.372 — Task 16's counts across the mapper, where ABSENT and `0` must stay
 * two different claims.
 *
 * The failure this exists to catch is not a crash. It is a mapper that writes
 * `?? 0`, after which a guest's withheld count arrives at the card as the
 * assertion "this workspace holds no people you can see" — a sentence nobody
 * computed, in a shape no renderer can tell from a real zero.
 */
describe('13.372 mapWorkspaceRefs distinguishes a WITHHELD count from a counted zero', () => {
  function project(extra: Record<string, unknown>): Record<string, unknown> {
    // `description: null` belongs to the WIRE'S DEFAULT SHAPE, not to this
    // case's subject. The route always sends the key, spelling "nobody has
    // described this project" as `null`, and the mapper REFUSES a row that
    // omits it (13.983) — so a fixture built without it no longer describes a
    // body the server can produce, and every case below would fail on the
    // missing key rather than on the count it is actually about. `...extra`
    // spreads LAST, so a case can still override it.
    return { projectId: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, description: null, groupId: null, ...extra };
  }
  function withProjects(
    workspace: Record<string, unknown>,
    projects: Record<string, unknown>[],
  ): { workspaces: unknown[] } {
    return {
      workspaces: [
        {
          workspaceId: 'ws1',
          name: 'Convenience Corner',
          prefix: 'CC',
          role: 'guest',
          archived: false,
          // A GUEST body, and it carries this count — which is the owner's
          // ruling in one line. `...workspace` spreads AFTER, so a case that
          // wants the key absent or malformed can still override it.
          nameRestrictedProjectCount: 0,
          ...workspace,
          projects,
        },
      ],
    };
  }

  it('maps an absent count to null and a present zero to 0, in one body', () => {
    const [ref] = mapWorkspaceRefs(
      withProjects({}, [
        project({}),
        project({ projectId: 'p2', name: 'Deliveries', ticketCount: 0, blockedCount: 0 }),
      ]),
    );
    // Absent → withheld. Not 0, and asserted with `toBeNull` rather than a
    // falsy check, which 0 also satisfies.
    expect(ref!.memberCount).toBeNull();
    expect(ref!.projects[0]!.ticketCount).toBeNull();
    expect(ref!.projects[0]!.blockedCount).toBeNull();
    // Present zero → 0, in the SAME body, so a mapper that collapsed both to
    // null (the mirror-image bug, and the one a withheld-only fixture misses)
    // fails here.
    expect(ref!.projects[1]!.ticketCount).toBe(0);
    expect(ref!.projects[1]!.blockedCount).toBe(0);
  });

  it('reads a real memberCount, including zero, rather than treating any number as present-or-absent', () => {
    expect(mapWorkspaceRefs(withProjects({ memberCount: 7 }, []))[0]!.memberCount).toBe(7);
    // 0 is falsy; a truthiness-based reader maps it to null and this is the
    // only assertion that would notice.
    expect(mapWorkspaceRefs(withProjects({ memberCount: 0 }, []))[0]!.memberCount).toBe(0);
  });

  it('refuses a count that is present and not a number, rather than reading it as withheld', () => {
    // An explicit `null` on the wire is neither absent nor a count. A server
    // that sent one did something this contract does not describe, and guessing
    // which of the two claims it meant is exactly the invention the mapper
    // exists to refuse.
    expect(() => mapWorkspaceRefs(withProjects({ memberCount: null }, []))).toThrow(MappingError);
    expect(() => mapWorkspaceRefs(withProjects({ memberCount: '3' }, []))).toThrow(MappingError);
    expect(() =>
      mapWorkspaceRefs(withProjects({}, [project({ ticketCount: true })])),
    ).toThrow(MappingError);
  });

  it('requires archived, because it is served to every caller who is told the project name', () => {
    const withoutArchived = { projectId: 'p1', name: 'Shop operations' };
    expect(() => mapWorkspaceRefs(withProjects({}, [withoutArchived]))).toThrow(MappingError);
    // The positive control: the same body with the key present maps.
    expect(mapWorkspaceRefs(withProjects({}, [project({ archived: true })]))[0]!.projects[0]).toEqual({
      id: 'p1',
      name: 'Shop operations',
      // The project prefix (owner spec 2026-09-20) — `SO` in `CCSO-1183`.
      // REQUIRED and never null: there is no "not entered" state on the wire,
      // because the server resolves stored-or-derived before it answers.
      prefix: 'SO',
      archived: true,
      groupId: null,
      ticketCount: null,
      blockedCount: null,
    });
  });
});

/**
 * 19.044 — trash series, Plan 1 Task 5 (spec T8). `mapWorkspaceRefs` maps the
 * new workspace-level `archived` field and refuses a row that omits it, the
 * same discipline `prefix` gets two blocks up — a construction site that
 * forgot the field must fail loudly, never read as unarchived by default.
 */
describe('19.044 mapWorkspaceRefs maps archived and refuses a row without it', () => {
  function workspaceRow(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      workspaceId: 'ws1',
      name: 'Convenience Corner',
      prefix: 'CC',
      role: 'owner',
      archived: false,
      nameRestrictedProjectCount: 0,
      projects: [],
      ...extra,
    };
  }

  it('round-trips true and false', () => {
    expect(mapWorkspaceRefs({ workspaces: [workspaceRow({ archived: true })] })[0]!.archived).toBe(true);
    expect(mapWorkspaceRefs({ workspaces: [workspaceRow({ archived: false })] })[0]!.archived).toBe(false);
  });

  it('refuses a row that omits archived, naming its path', () => {
    const orphan = workspaceRow({});
    delete orphan['archived'];
    expect(() => mapWorkspaceRefs({ workspaces: [orphan] })).toThrow(MappingError);
    expect(() => mapWorkspaceRefs({ workspaces: [orphan] })).toThrow(/workspaces\[0\]\.archived/);
    // control: the same row WITH the key present maps.
    expect(() => mapWorkspaceRefs({ workspaces: [workspaceRow({})] })).not.toThrow();
  });
});

/**
 * Second wave, Task 6 — `mapWorkspaceSettings`, the mapper the plan named and
 * this tree did not have.
 *
 * The task's `Files:` block told the implementer to extend
 * `mapWorkspaceSettings` in this file. No such function existed anywhere in the
 * repo (`/usr/bin/git log -S'mapWorkspaceSettings' --all` returns only the plan
 * commit that wrote the sentence), and `mapAttention` reads `items` and drops
 * the `settings` sibling the server DOES send. So the client could not see a
 * workspace's settings at all, and the `/settings` Workspace tab had nothing to
 * render. This mapper is that missing half; the deviation is recorded in
 * `EXEC-2026-09-18-t6-settings-read.md` and in the PR body.
 *
 * It is deliberately a mapper over the SETTINGS OBJECT rather than over the whole
 * attention body: the response carries `settings` as a sibling of `items`, so the
 * settings read does not need the strip's fixtures, and a caller that wants both
 * calls this beside `mapAttention` rather than through it.
 */
describe('13.715 mapWorkspaceSettings — the workspace settings read', () => {
  const ANSELMA = '01J9ANSELMA00000000000000';
  const roster = new Map([[ANSELMA, 'Anselma Marak']]);

  function settingsBody(overrides: Record<string, unknown> = {}): unknown {
    return {
      staleDays: 7,
      dueSoonDays: 3,
      autoCloseAfterDays: 30,
      provenance: {
        actorId: ANSELMA,
        clientTime: '2026-09-18T04:00:00.000Z',
        serverTime: '2026-09-18T04:00:01.000Z',
      },
      ...overrides,
    };
  }

  /**
   * 13.715 — the three knobs map by name, the provenance gains the roster name
   * for its actor, and `autoCloseAfterDays` arrives as a NUMBER.
   */
  it('13.715 maps all three knobs and names the provenance actor from the roster', () => {
    expect(mapWorkspaceSettings(settingsBody(), 'attention.settings', roster)).toEqual({
      staleDays: 7,
      dueSoonDays: 3,
      autoCloseAfterDays: 30,
      provenance: {
        actorId: ANSELMA,
        actorName: 'Anselma Marak',
        clientTime: '2026-09-18T04:00:00.000Z',
        serverTime: '2026-09-18T04:00:01.000Z',
      },
    });
  });

  /**
   * 13.715 — `autoCloseAfterDays: null` maps to `null` and NOT to an absence or
   * a substituted default. This is the client half of the CASE/COALESCE
   * distinction: the server sends `null` for "auto-close is off", and a mapper
   * that turned it into `undefined` (or dropped the key) would make the
   * settings form render an empty box where "Off" belongs — and, worse, would
   * make "off" indistinguishable from "this build does not know the field".
   */
  it('13.715 carries null through as null — off is a VALUE, not a missing key', () => {
    const mapped = mapWorkspaceSettings(
      settingsBody({ autoCloseAfterDays: null }),
      'attention.settings',
      roster,
    );
    expect(mapped.autoCloseAfterDays).toBeNull();
    // Present-with-null, not omitted: `toEqual` would pass on `{...}` without
    // the key only if the expectation also omitted it, so this asserts the key
    // itself rather than trusting the deep-equal.
    expect(Object.hasOwn(mapped, 'autoCloseAfterDays')).toBe(true);
    // And it is NOT coerced to a number — `0` is not the off spelling anywhere
    // in this feature (the schema refuses it).
    expect(mapped.autoCloseAfterDays).not.toBe(0);
  });

  /**
   * 13.715 — `provenance: null` maps to `null`: a workspace nobody has
   * configured has nobody to attribute its settings to, and inventing an actor
   * would be the client making a claim the ledger never recorded.
   */
  it('13.715 a null provenance stays null rather than inventing an author', () => {
    const mapped = mapWorkspaceSettings(
      settingsBody({ provenance: null }),
      'attention.settings',
      roster,
    );
    expect(mapped.provenance).toBeNull();
    // The positive control, in the same run: the SAME mapper with a provenance
    // present does not answer null, so the line above is the null branch and not
    // a mapper that returns null unconditionally.
    expect(
      mapWorkspaceSettings(settingsBody(), 'attention.settings', roster).provenance,
    ).not.toBeNull();
  });

  /**
   * 13.715 — a knob that is missing or the wrong type is REFUSED, not defaulted.
   *
   * Same rule as every mapper in this file: refuse what cannot happen in
   * production. The server always sends all three keys (`getWorkspaceSettings`
   * applies the defaults itself, so it never omits one), which means a missing
   * key is a body this client does not understand — and substituting 7 for it
   * would render a threshold nobody chose, on the one screen whose entire job is
   * to show what was chosen.
   */
  it('13.715 refuses a missing knob or a mistyped one instead of defaulting it', () => {
    expect(() =>
      mapWorkspaceSettings(
        { dueSoonDays: 3, autoCloseAfterDays: null, provenance: null },
        'attention.settings',
        roster,
      ),
    ).toThrow(MappingError);
    expect(() =>
      mapWorkspaceSettings(
        { staleDays: 7, dueSoonDays: 3, provenance: null },
        'attention.settings',
        roster,
      ),
    ).toThrow(MappingError);
    // A STRING where a nullable number belongs — the shape a JSON round trip
    // through a sloppy serializer produces.
    expect(() =>
      mapWorkspaceSettings(
        settingsBody({ autoCloseAfterDays: '30' }),
        'attention.settings',
        roster,
      ),
    ).toThrow(MappingError);
  });
});

/**
 * **13.967 — `mapTicketRead` carries the assignment's provenance, and REFUSES a
 * body that omits it.**
 *
 * The single-ticket read gained `assignedProvenance` when the sheet's assignee
 * became editable: an edited field that does not say who set it is the one row on
 * that sheet which cannot be trusted, and `read/assigned-provenance.ts` exists to
 * answer exactly that. The list has served the same field on every card since it
 * existed (`TicketCard.assignedProvenance`); the single read was the one place it
 * did not, which is why the sheet had no claim to render.
 *
 * **ABSENT is not `null`, and the two arms below are the whole case.** `null` is
 * a real answer — nobody is assigned, and the server's own reader establishes
 * that there is no claim to carry (`read/assigned-provenance.ts`: there is no such
 * thing as a claim with no actor). An ABSENT key is a body this client cannot
 * read, because the route always emits it; mapping that to `null` would turn a
 * malformed payload into "nobody is assigned".
 */
describe('13.967 mapTicketRead carries assignedProvenance, and refuses a body without it', () => {
  const claim = {
    actorId: ANSELMA,
    clientTime: '2026-08-19T09:58:12.000Z',
    serverTime: '2026-08-19T10:00:00.000Z',
    cause: null,
  };

  /** The route's body, complete: the same shape `ticketReadBody` builds above. */
  function body(assignedProvenance: unknown): Record<string, unknown> {
    return {
      ticket: {
        ticket_id: '01J9GTKA000000000000000000',
        own_mode: 'inherit',
        resolved_mode: 'project',
        seq: 4,
      },
      ticketState: {
        kind: 'ticket',
        id: '01J9GTKA000000000000000000',
        workspaceId: '01J9GWS0000000000000000000',
        projectId: '01J9GPRJ000000000000000000',
        typeId: 'task',
        parentId: 'parent-1',
        workflowId: 'wf-errand',
        workflowVersion: 2,
        stateId: 'doing',
        stateCategory: 'active',
        assigneeId: ANSELMA,
        collaboratorIds: [BIREN],
        fields: {},
        transitions: [],
        closed: null,
        rank: null,
        reopenedAt: null,
        deleted: null,
      },
      title: 'File the GST return',
      stateProvenance: claim,
      assignedProvenance,
      parent: null,
      rollup: null,
      key: null,
      epic: null,
    };
  }

  it('carries the claim the server sent, with the actor resolved through the roster', () => {
    const mapped = mapTicketRead(body(claim), new Map([[ANSELMA, 'Anselma Marak']]));
    expect(mapped.assignedProvenance?.actorId).toBe(ANSELMA);
    expect(mapped.assignedProvenance?.actorName).toBe('Anselma Marak');
    expect(mapped.assignedProvenance?.serverTime).toBe('2026-08-19T10:00:00.000Z');
  });

  it('answers `null` for the wire`s null — nobody is assigned — rather than throwing', () => {
    // The positive control for the refusal below runs FIRST and through the SAME
    // path: this body differs only in this one key, so a throw there cannot be
    // about the fixture.
    expect(mapTicketRead(body(null)).assignedProvenance).toBeNull();
  });

  it('REFUSES a body that OMITS the key — absent is not the same answer as null', () => {
    const omitted = body(null);
    delete omitted['assignedProvenance'];
    expect(() => mapTicketRead(omitted)).toThrow(/ticket\.assignedProvenance: expected an object/);
    expect(() => mapTicketRead(omitted)).toThrow(MappingError);
  });
});

/**
 * 13.1280 — the key crosses the wire as the card's own fact (owner, 2026-09-22).
 * `null` is a real answer ("no prefix in the ledger") and survives; an ABSENT
 * key is a body the server does not send and is refused, so a mapper that
 * forgot the field cannot look like a workspace without a prefix.
 */
describe('13.1280 the board card key', () => {
  const body = (card: Partial<BoardTicketCard>) => ({
    workspaceId: '01J9GWS0000000000000000000',
    projectId: '01J9GPRJ000000000000000000',
    columns: [{ workflowId: 'wf-errand', workflowName: 'Errand', workflowVersion: 2, stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [serverBoardCard(card)] }],
  });
  it('carries the key, keeps null, refuses absence', () => {
    const firstCard = (view: BoardView) => view.groups[0]!.columns[0]!.cards[0]!;
    expect(firstCard(mapBoardView(body({ key: 'CCSO-7' }))).key).toBe('CCSO-7');
    expect(firstCard(mapBoardView(body({ key: null }))).key).toBeNull();
    const { key: _dropped, ...without } = serverBoardCard();
    const absent = body({});
    absent.columns[0]!.cards = [without as BoardTicketCard];
    expect(() => mapBoardView(absent)).toThrow(/key/);
  });
});

describe('6.253 mapActorNames — a former member reads "Name (removed)"', () => {
  it('a removed row reads "Name (removed)"; CONTROL: a current row keeps its bare name', () => {
    const actors = mapActorNames({
      names: [
        { userId: 'u1', displayName: 'Rina Marak', removed: true },
        { userId: 'u2', displayName: 'Tengsim' },
        { userId: 'u3', displayName: 'Ambe', removed: 'yes' },
      ],
    });
    expect(actors).toEqual([
      { id: 'u1', name: 'Rina Marak (removed)' },
      { id: 'u2', name: 'Tengsim' },
      // Only the boolean `true` counts — the mapper's existing strictness.
      { id: 'u3', name: 'Ambe' },
    ]);
  });
});

describe('22.123 mapGroupRows reads the group tree', () => {
  const row = { id: 'g1', parentId: null, level: 1, name: 'Retail', rank: 'a1', projectCount: 2, childCount: 1 };

  it('22.123 maps every row, keeping a null parent as null; a wrong level, a missing field (parentId included) and a stranger body are refused', () => {
    expect(mapGroupRows({ workspaceId: 'w', groups: [row, { ...row, id: 'g2', parentId: 'g1', level: 2 }] })).toEqual([
      row,
      { ...row, id: 'g2', parentId: 'g1', level: 2 },
    ]);
    expect(mapGroupRows({ workspaceId: 'w', groups: [] })).toEqual([]);
    // CONTROL: each refusal names the field, so a drifted route fails loudly rather than drawing a half-tree.
    expect(() => mapGroupRows({ groups: [{ ...row, level: 5 }] })).toThrow(MappingError);
    expect(() => mapGroupRows({ groups: [{ ...row, level: '1' }] })).toThrow(MappingError);
    expect(() => mapGroupRows({ groups: [{ ...row, name: undefined }] })).toThrow(MappingError);
    expect(() => mapGroupRows({ groups: [{ ...row, projectCount: 'many' }] })).toThrow(MappingError);
    // A row with no `parentId` KEY is refused — required-but-nullable, not defaulted to a root.
    const { parentId: _omitted, ...noParent } = row;
    expect(() => mapGroupRows({ groups: [noParent] })).toThrow(MappingError);
    expect(() => mapGroupRows({ groups: [{ ...row, parentId: 7 }] })).toThrow(MappingError);
    // CONTROL: `parentId: null` is a real value and maps to `null`.
    expect(mapGroupRows({ groups: [{ ...row, parentId: null }] })[0]!.parentId).toBeNull();
    expect(() => mapGroupRows({ groups: 'nope' })).toThrow(MappingError);
    expect(() => mapGroupRows(null)).toThrow(MappingError);
  });
});
