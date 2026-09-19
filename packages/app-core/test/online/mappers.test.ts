import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_PREFS, type RosterMember } from '../../src/view-types.js';
import type {
  AttentionResponse,
  BoardResponse,
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
  mapActors,
  mapAttention,
  mapBoardView,
  mapHistory,
  mapIngestResults,
  mapListPage,
  mapMyWork,
  mapPreferences,
  mapRollup,
  mapSearchHits,
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
        cards: [serverCard()],
      },
      {
        workflowId: 'wf-errand',
        workflowName: 'Errand',
        workflowVersion: 2,
        stateId: 'waiting',
        name: 'Waiting on counterparty',
        category: 'active',
        blocked: true,
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
          cards: [serverCard({ ticketId: '01J9GTKB000000000000000000', stateId: 'ancient' })],
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
      /stateProvenance\.cause\.kind: expected reopened-for-child \(got reopened-by-decree\)/,
    );
    // Control: `null` is the wire's own value for "no cause" and still passes.
    expect(mapBoardView(body).groups[0]?.columns[0]?.cards[0]?.cause).toBeNull();
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
            serverCard({
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
    ).toThrow(/preferences\.grouping\.p: expected one of epic\/status\/assignee\/type\/flat/);
    expect(() =>
      mapPreferences({ savedFilters: [], listColumns: { p: ['statuz'] }, grouping: {} }),
    ).toThrow(/preferences\.listColumns\.p\[0\]/);
    // Controls, same run: the closed member and the open `field:` arm both pass.
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
});

/**
 * 3.39 — the refusals. Each asserts the enumeration, not the partiality:
 * WHICH facts are absent and WHO closes them.
 *
 * **FOUR of them, and it was six.** `getTickets` and `getTicket` answered with a
 * `ServingGapError` until ruling P25 clause 1's buildable subset landed; their
 * entries are gone from `SERVING_GAPS` rather than emptied, and 3.42 below is
 * what replaced them — the same two methods asserted to MAP, over bodies
 * carrying the facts that used to be missing. The case id is kept and its claim
 * inverted, on 7.189's precedent: a divergence that closed can silently re-open,
 * and deleting the case is what makes that invisible.
 *
 * These are pinned on the SERVER side too, and that is where they can go red for
 * the right reason: `apps/server/test/integration/client-contract.test.ts` reads
 * `src/online/mappers.ts`, extracts each list, and asserts every `wireKey` is
 * genuinely missing from a real `/v1` body. Nothing in this package can do that
 * — there is no server here — so what these cases pin is that the refusal fires
 * and says what it must.
 */
describe('3.39 the blocked methods refuse, and enumerate what is absent', () => {
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
        { kind: 'blocked', card, stateName: 'Waiting', reason: 'In "Waiting" — a blocked state.' },
        {
          kind: 'stale',
          card,
          enteredStateAt: '2026-08-19T10:00:00.000Z',
          daysInFlight: 14,
          thresholdDays: 7,
          reason: 'In an active state since 2026-08-19 — past the 7-day staleness threshold.',
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
          reason: 'Needed by 2026-08-25 — due within 7 days.',
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
    expect(items[0]?.reason).toBe('In "Waiting" — a blocked state.');
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
          reason: 'In "Waiting" — a blocked state.',
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

  it('13.703 refuses a wire rank that is not a rank key, rather than passing it through', () => {
    // `mapRank` is not a `typeof raw === 'string'` check. A space is outside
    // the alphabet, so `''`-or-anything would let a key reach `compareByRank`,
    // whose `<` on strings still "works" — silently ordering the Backlog tab
    // by a key the domain would have refused at the door. The mapper is the
    // last place this can be caught, and it is caught by the SAME predicate the
    // domain door uses (`isRankKey`) rather than a second copy of the rule.
    const body: ListResponse = {
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
  ): Record<string, unknown> {
    return {
      // The `proj_visibility` row the route still serves. The client reads
      // nothing from it; it is here because the real body carries it.
      ticket: { ticket_id: '01J9GTKA000000000000000000', own_mode: 'inherit', seq: 4 },
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
    };
  }
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
        { workspaceId: 'ws1', name: 'Convenience Corner', role, nameRestrictedProjectCount: 0, projects: [] },
      ],
    };
  }

  it('maps role onto WorkspaceRef', () => {
    expect(mapWorkspaceRefs(body('admin'))[0]).toEqual({
      id: 'ws1',
      name: 'Convenience Corner',
      role: 'admin',
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
    return { projectId: 'p1', name: 'Delivery', archived: false, description: null, ...extra };
  }
  function body(projects: Record<string, unknown>[]): { workspaces: unknown[] } {
    return {
      workspaces: [
        {
          workspaceId: 'ws1',
          name: 'Meghalaya Rollout',
          role: 'member',
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
    return { projectId: 'p1', name: 'Shop operations', archived: false, description: null, ...extra };
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
          role: 'guest',
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
      archived: true,
      ticketCount: null,
      blockedCount: null,
    });
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
      ticket: { ticket_id: '01J9GTKA000000000000000000', own_mode: 'inherit', seq: 4 },
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
      },
      title: 'File the GST return',
      stateProvenance: claim,
      assignedProvenance,
      parent: null,
      rollup: null,
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
