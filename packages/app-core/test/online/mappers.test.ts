import { describe, expect, it } from 'vitest';
import type {
  AttentionResponse,
  BoardResponse,
  MemberListResponse,
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
  mapListView,
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

describe('3.38 preferences — ruling P24 both ways', () => {
  it('folds listColumns and grouping into projects and defaults the half that is absent', () => {
    const prefs = mapPreferences({
      savedFilters: [],
      listColumns: { '01J9GPRJ000000000000000000': ['status', 'assignee'] },
      grouping: { '01J9GPRJ111111111111111111': 'flat' },
    });
    expect(prefs).toEqual({
      version: 1,
      projects: {
        '01J9GPRJ000000000000000000': { columns: ['status', 'assignee'], grouping: 'epic' },
        '01J9GPRJ111111111111111111': {
          columns: ['status', 'assignee', 'dueDate', 'progress'],
          grouping: 'flat',
        },
      },
      savedFilters: [],
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
    ).toEqual({ columns: ['status', 'field:amount'], grouping: 'flat' });
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
        projects: { '01J9GPRJ000000000000000000': { columns: ['status'], grouping: 'epic' } },
        savedFilters: [{ id: 'f', name: 'Mine', filter: { assigneeIds: [ANSELMA] } }],
      }),
    ).toEqual({
      savedFilters: [{ id: 'f', name: 'Mine', filterSpec: { assigneeId: ANSELMA } }],
      listColumns: { '01J9GPRJ000000000000000000': ['status'] },
      grouping: { '01J9GPRJ000000000000000000': 'epic' },
    });
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
 * 3.39 — the six refusals. Each asserts the enumeration, not the partiality:
 * WHICH facts are absent and WHO closes them.
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
      method: 'getMyWorkspaces',
      call: () => mapWorkspaceRefs({ workspaces: [{ workspaceId: 'w', name: 'n', role: 'owner' }] }),
      fields: ['WorkspaceRef.projects'],
    },
    {
      method: 'getTickets',
      call: () => mapListView({ projectId: 'p', groupBy: 'flat', groups: [], nextCursor: null }),
      fields: [
        'ListRow.typeRank',
        'ListRow.epicId',
        'ListRow.stateName',
        'ListRow.hasRestrictedParent',
        'ListRow.assignedProvenance',
      ],
    },
    {
      method: 'getTicket',
      call: () => mapTicketRead({ ticket: { ticket_id: 't' }, parent: null, rollup: null }),
      fields: [
        'TicketRead.title',
        'TicketRead.stateProvenance',
        'TicketRead.ticket (a domain TicketState)',
      ],
    },
    {
      method: 'search',
      call: () => {
        const body: SearchResponse = { workspaceId: 'w', query: 'q', hits: [] };
        return mapSearchHits(body);
      },
      fields: ['SearchHit.matchedIn'],
    },
    {
      method: 'getMyWork',
      call: () => {
        const body: MyWorkResponse = {
          workspaceId: 'w',
          groups: { open: [serverCard()], active: [], terminal: [] },
        };
        return mapMyWork(body);
      },
      fields: [
        'WorkItem.projectName',
        'WorkItem.stateName',
        'ContestedClaim.title',
        'ContestedClaim.claim.serverTime',
      ],
    },
    {
      method: 'getAttention',
      call: () => {
        const body: AttentionResponse = {
          workspaceId: 'w',
          generatedAt: '2026-09-02T10:00:00.000Z',
          settings: { staleDays: 7, dueSoonDays: 7, provenance: null },
          items: [],
        };
        return mapAttention(body);
      },
      fields: ["AttentionItem kind 'contested' — its title"],
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
   * 3.41 — the two contested refusals name `/v1/contests`, which SHIPPED.
   *
   * The refusals used to blame `/v1/me/work` and `routes/attention.ts` for not
   * reading `proj_contested`. Both sentences were true and both sent a fixer to a
   * file that owes nothing: `GET /v1/contests` is registered in `app.ts` today, so
   * the rows are a client-side join away and what actually blocks the join is one
   * missing field on the contest row (plus, for `ContestedClaim`, an instant that
   * was never recorded because the claim was refused).
   *
   * This case is the client half. The server half — that `/v1/contests` really
   * does not carry these keys — is 7.208 in
   * `apps/server/test/integration/client-contract.test.ts`, which is the only
   * place a real body exists.
   */
  it('3.41 the contested refusals point at /v1/contests, not at the routes that owe nothing', () => {
    const contested = [
      ...(SERVING_GAPS['getMyWork'] ?? []),
      ...(SERVING_GAPS['getAttention'] ?? []),
    ].filter((absence) => absence.wireRoute === '/v1/contests');
    expect(contested.map((absence) => absence.field)).toEqual([
      'ContestedClaim.title',
      'ContestedClaim.claim.serverTime',
      "AttentionItem kind 'contested' — its title",
    ]);
    expect(contested.map((absence) => absence.wireKey)).toEqual([
      'title',
      'serverTime',
      'title',
    ]);
    // Control, same run: the OTHER two my-work absences are genuinely about
    // `/v1/me/work`, so "points at /v1/contests" is a distinction this filter can
    // actually draw rather than a list that swallowed everything.
    expect(
      (SERVING_GAPS['getMyWork'] ?? [])
        .filter((absence) => absence.wireRoute === '/v1/me/work')
        .map((absence) => absence.field),
    ).toEqual(['WorkItem.projectName', 'WorkItem.stateName']);
    // And no refusal still says the shipped read does not exist.
    for (const absence of contested) {
      expect(absence.because, absence.field).not.toMatch(/never reads it|never reads proj_contested/);
    }
    // The two `title` gaps name the route that would close them; the
    // `serverTime` gap names why NO route can — the claim was refused, so it was
    // never stamped. Those are two different kinds of absence and the reasons say
    // so rather than sharing one sentence.
    expect(contested[0]?.because).toContain('/v1/contests');
    expect(contested[2]?.because).toContain('/v1/contests');
    expect(contested[1]?.because).toContain('never committed');
  });

  it('3.39 the register covers exactly the six blocked methods', () => {
    expect(Object.keys(SERVING_GAPS).sort()).toEqual([
      'getAttention',
      'getMyWork',
      'getMyWorkspaces',
      'getTicket',
      'getTickets',
      'search',
    ]);
    // Positive control on the sort above: the six that are NOT here are the six
    // this source answers, and `getBoard` is the one P25 clause 1 unblocked.
    expect(SERVING_GAPS['getBoard']).toBeUndefined();
    expect(SERVING_GAPS['getMembers']).toBeUndefined();
  });
});
