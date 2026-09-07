import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_PREFS } from '../../src/view-types.js';
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

describe('3.37 mapActors — {userId, displayName} is a rename and nothing more', () => {
  it('maps the roster and drops role, which the client type has no room for', () => {
    const body: MemberListResponse = {
      workspaceId: '01J9GWS0000000000000000000',
      members: [
        { userId: ANSELMA, displayName: 'Anselma Marak', role: 'owner' },
        { userId: BIREN, displayName: 'Biren Sangma', role: 'member' },
      ],
    };
    expect(mapActors(body)).toEqual([
      { id: ANSELMA, name: 'Anselma Marak' },
      { id: BIREN, name: 'Biren Sangma' },
    ]);
    expect(rosterByActorId(mapActors(body)).get(BIREN)).toBe('Biren Sangma');
  });

  it('throws MappingError naming the path on a garbled member', () => {
    expect(() => mapActors({ workspaceId: 'w', members: [{ userId: 1 }] })).toThrow(
      /members\.members\[0\]\.userId: expected a string/,
    );
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
  const REFUSALS: ReadonlyArray<{
    method: string;
    call: () => unknown;
    fields: readonly string[];
  }> = [
    {
      method: 'search',
      call: () => {
        const body: SearchResponse = { workspaceId: 'w', query: 'q', hits: [] };
        return mapSearchHits(body);
      },
      fields: ['SearchHit.matchedIn'],
    },
  ];

  for (const { method, call, fields } of REFUSALS) {
    it(`${method} refuses, naming ${fields.length} absent fact(s) and an owner for each`, () => {
      let thrown: unknown;
      try {
        call();
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `${method} did not refuse`).toBeInstanceOf(ServingGapError);
      const gap = thrown as ServingGapError;
      // The enumeration, whole and in order — not "it threw something".
      expect(gap.absences.map((absence) => absence.field)).toEqual(fields);
      // Every absence says WHY and WHO. An owner-less gap is a gap that gets
      // dropped rather than deferred.
      for (const absence of gap.absences) {
        expect(absence.because.length, absence.field).toBeGreaterThan(20);
        expect(absence.owner.length, absence.field).toBeGreaterThan(4);
        // `wireRoute` is what the server-side cross-check measures `wireKey`
        // against, so a key with no route is a check with no body: either both
        // are stated or neither is, and "neither" means no route can close it.
        expect(
          absence.wireKey === null ? absence.wireRoute === null : typeof absence.wireRoute,
          `${absence.field}: wireKey and wireRoute must agree about whether a route can close it`,
        ).toBe(absence.wireKey === null ? true : 'string');
      }
      // The message a developer actually sees carries the field names.
      for (const field of fields) expect(gap.message).toContain(field);
      // And the exported register agrees with what was thrown.
      expect(SERVING_GAPS[method]).toEqual(gap.absences);
    });
  }

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
      settings: { staleDays: 7, dueSoonDays: 7, provenance: null },
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
      settings: { staleDays: 7, dueSoonDays: 7, provenance: null },
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

  it('3.39 the register covers exactly ONE blocked method, and it is the only DATA gap', () => {
    // Six under P25 clause 1, four after it served `getTickets`/`getTicket`,
    // three after P32/P38 served `getMyWorkspaces`, ONE now that P39 and P40
    // have served `getMyWork` and `getAttention`. The number in this title has
    // been wrong three times by being right when written, which is why the
    // membership below is asserted INDIVIDUALLY rather than trusted to a count.
    //
    // `search` is last because it is the only gap of the six that a join could
    // never close: `routes/search.ts` destroys which column matched inside the
    // query, so `SearchHit.matchedIn` is absent from the SERVER'S OWN answer
    // rather than merely unread by this client.
    expect(Object.keys(SERVING_GAPS).sort()).toEqual(['search']);
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

  function ticketReadBody(
    parent: Record<string, unknown>,
    rollup: unknown = null,
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
      },
      title: 'File the GST return',
      stateProvenance: {
        actorId: ANSELMA,
        clientTime: '2026-08-19T09:58:12.000Z',
        serverTime: '2026-08-19T10:00:00.000Z',
        cause: null,
      },
      parent,
      rollup,
    };
  }
});

