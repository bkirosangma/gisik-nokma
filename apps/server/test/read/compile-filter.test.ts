import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filterSpecSchema, type FilterSpec } from '@gisik-nokma/domain';
import { BLOCKED_STATES_CTE, compileFilterSpec, likePattern } from '../../src/read/compile-filter.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

describe('SqlParams', () => {
  it('hands out sequential placeholders and keeps values in order', () => {
    const params = new SqlParams();
    expect(params.add('a')).toBe('$1');
    expect(params.add(2)).toBe('$2');
    expect(params.toArray()).toEqual(['a', 2]);
  });

  it('hands back a copy — a caller mutating the array cannot desynchronise it from the placeholders', () => {
    const params = new SqlParams();
    params.add('a');
    const first = params.toArray();
    first.push('smuggled');
    expect(params.toArray()).toEqual(['a']);
    expect(params.add('b')).toBe('$2');
  });
});

describe('compileFilterSpec — emitted SQL', () => {
  it('compiles each clause with parameters only', () => {
    const params = new SqlParams();
    const { clauses, needsBlockedCte } = compileFilterSpec(
      {
        assigneeId: 'usr_01',
        collaboratorId: 'usr_02',
        typeId: 'task',
        stateId: 'doing',
        stateCategory: 'active',
        due: { before: '2026-08-31', after: '2026-08-01' },
      },
      params,
    );
    expect(clauses).toEqual([
      't.assignee_id = $1',
      't.collaborator_ids @> to_jsonb($2::text)',
      't.type_id = $3',
      't.state_id = $4',
      't.state_category = $5',
      "(t.fields -> 'dueDate' -> 'value' ->> 'date') <= $6",
      "(t.fields -> 'dueDate' -> 'value' ->> 'date') >= $7",
    ]);
    expect(params.toArray()).toEqual(['usr_01', 'usr_02', 'task', 'doing', 'active', '2026-08-31', '2026-08-01']);
    expect(needsBlockedCte).toBe(false);
  });

  it('compiles blocked via the blocked-states CTE, correlated on the ticket own workspace', () => {
    const params = new SqlParams();
    const { clauses, needsBlockedCte } = compileFilterSpec({ blocked: true }, params);
    expect(clauses).toEqual([
      '(t.workflow_id, t.state_id) IN (SELECT workflow_id, state_id FROM blocked_states WHERE workspace_id = t.workspace_id)',
    ]);
    expect(needsBlockedCte).toBe(true);
    expect(BLOCKED_STATES_CTE).toContain('proj_workflows');
    expect(params.toArray()).toEqual([]);
  });

  it('compiles blocked: false as the negation', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec({ blocked: false }, params);
    expect(clauses).toEqual([
      'NOT ((t.workflow_id, t.state_id) IN (SELECT workflow_id, state_id FROM blocked_states WHERE workspace_id = t.workspace_id))',
    ]);
  });

  it('joins the text term through proj_search FTS', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec({ text: 'GST portal' }, params);
    expect(clauses).toEqual([
      "t.ticket_id IN (SELECT ticket_id FROM proj_search WHERE workspace_id = t.workspace_id AND tsv @@ websearch_to_tsquery('simple', $1))",
    ]);
    expect(params.toArray()).toEqual(['GST portal']);
  });

  it('compiles custom-field eq and contains against the FieldClaim value', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec(
      { fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }, { fieldId: 'notes', op: 'contains', value: '50%_done' }] },
      params,
    );
    expect(clauses).toEqual([
      "t.fields -> $1::text ->> 'value' = $2",
      "t.fields -> $3::text ->> 'value' ILIKE $4 ESCAPE '\\'",
    ]);
    expect(params.toArray()).toEqual(['amount', '4200', 'notes', '%50\\%\\_done%']);
  });

  it('emits nothing for the empty filter — an empty filter narrows nothing and must not widen anything either', () => {
    const params = new SqlParams();
    expect(compileFilterSpec({}, params)).toEqual({ clauses: [], needsBlockedCte: false });
    expect(params.toArray()).toEqual([]);
  });

  /**
   * The structural guard for the half parameterisation does not cover.
   * Every clause this compiler emits is a conjunct over the alias `t`; the
   * two that reach ANOTHER table (proj_search, blocked_states) must correlate
   * on `t.workspace_id`, or a filter term would answer from a neighbouring
   * tenant's rows. This test enumerates every term so a future term added
   * without a correlation fails here rather than in production.
   */
  it('every clause that reaches another table correlates on t.workspace_id', () => {
    const terms: FilterSpec[] = [
      { assigneeId: 'u' },
      { collaboratorId: 'u' },
      { typeId: 't' },
      { stateId: 's' },
      { stateCategory: 'open' },
      { blocked: true },
      { blocked: false },
      { text: 'q' },
      { due: { before: '2026-08-31' } },
      { due: { after: '2026-08-01' } },
      { fields: [{ fieldId: 'f', op: 'eq', value: 'v' }] },
      { fields: [{ fieldId: 'f', op: 'contains', value: 'v' }] },
    ];
    // Positive control: the enumeration really does produce clauses, so an
    // all-passing verdict is not a verdict over an empty set.
    let seen = 0;
    let reaching = 0;
    for (const spec of terms) {
      const { clauses } = compileFilterSpec(spec, new SqlParams());
      expect(clauses).toHaveLength(1);
      seen += 1;
      const clause = clauses[0] ?? '';
      expect(clause).not.toBe('');
      if (clause.includes('SELECT')) {
        reaching += 1;
        expect(clause).toContain('workspace_id = t.workspace_id');
      }
    }
    expect(seen).toBe(terms.length);
    expect(reaching).toBe(3); // blocked:true, blocked:false, text
  });
});

describe('likePattern', () => {
  it('escapes LIKE metacharacters and backslashes', () => {
    expect(likePattern('50%_done\\')).toBe('%50\\%\\_done\\\\%');
  });

  it('leaves ordinary text alone and always wraps', () => {
    expect(likePattern('done')).toBe('%done%');
    expect(likePattern('')).toBe('%%');
  });
});

/**
 * The hostile inputs. The schema refuses shapes, lengths and exactly one byte
 * (U+0000, which Postgres text cannot carry); it never launders the rest, so
 * each of these reaches the compiler exactly as an attacker would send it —
 * with one boundary worth naming rather than glossing: the 500-character string
 * is a legal `text` and `fields[].value` (max 500 each) but is over the 200
 * limit in the OTHER FIVE slots — `assigneeId`, `collaboratorId`, `typeId`,
 * `stateId` and `fieldId`. The tests send it through all seven anyway, which
 * tests the compiler on input stricter callers would already have refused — a
 * superset, never a false green.
 *
 * The last five entries are here for a different reason than the first eight.
 * They are not attacks; they are the strings that a substring check like
 * `expect(sql).not.toContain(value)` would REDDEN on while the compiler is
 * perfectly correct — `$1` is emitted verbatim by a correct compiler, and so
 * are `t.`, `SELECT`, `->>` and `ESCAPE`. They are in the set to keep the
 * assertions below honest: a guard that fires on correct code is worse than no
 * guard, because the next person deletes it. Nothing here asserts on substrings
 * any more; the SQL is pinned as a constant instead, which is the property the
 * substring check was reaching for and could not state.
 */
const HOSTILE = {
  quote: "O'Brien",
  statement: "x'); DROP TABLE proj_tickets; --",
  comment: "-- ",
  alwaysTrue: "nobody' OR 't'='t",
  parenPayload: "') OR (SELECT count(*) FROM proj_tickets) > 0 OR ('",
  unicodeEscape: "U&'\\0041' \\u0041 é",
  deleteEvents: "'); DELETE FROM events; --",
  long: 'A'.repeat(500),
  placeholder: '$1',
  aliasColumn: 't.assignee_id',
  selectKeyword: 'SELECT ticket_id FROM proj_search',
  jsonArrow: "->> 'value'",
  escapeClause: "ESCAPE '\\'",
} as const;
const HOSTILE_VALUES = Object.values(HOSTILE);

/**
 * What a correct compiler emits for the seven-slot spec below, whatever bytes
 * travel through it. Pinned as a CONSTANT rather than probed with substring
 * assertions: "no slot's value appears in the SQL" is a claim about whether the
 * value LOOKS LIKE SQL, and it reddens on a correct compiler the moment the
 * value is `$1` or `t.` or `SELECT`. "The SQL does not depend on the value at
 * all" is the claim that was actually meant, and a concatenating compiler
 * fails it for every one of the thirteen inputs, `$1` included.
 */
const SEVEN_SLOT_SQL = [
  't.assignee_id = $1',
  't.collaborator_ids @> to_jsonb($2::text)',
  't.type_id = $3',
  't.state_id = $4',
  "t.ticket_id IN (SELECT ticket_id FROM proj_search WHERE workspace_id = t.workspace_id AND tsv @@ websearch_to_tsquery('simple', $5))",
  "t.fields -> $6::text ->> 'value' = $7",
  "t.fields -> $8::text ->> 'value' ILIKE $9 ESCAPE '\\'",
];

describe('compileFilterSpec — hostile bytes never reach SQL text', () => {
  it('PLANTED DEFECT: a hostile fieldId and text compile to the pinned SQL and travel entirely in the parameter array', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec(
      { text: HOSTILE.deleteEvents, fields: [{ fieldId: HOSTILE.statement, op: 'contains', value: HOSTILE.deleteEvents }] },
      params,
    );
    expect(clauses).toEqual([
      "t.ticket_id IN (SELECT ticket_id FROM proj_search WHERE workspace_id = t.workspace_id AND tsv @@ websearch_to_tsquery('simple', $1))",
      "t.fields -> $2::text ->> 'value' ILIKE $3 ESCAPE '\\'",
    ]);
    // Exact, not `toContain`: a compiler that dropped a term, doubled one, or
    // reordered the bindings would still satisfy a containment assertion.
    expect(params.toArray()).toEqual([
      HOSTILE.deleteEvents,
      HOSTILE.statement,
      likePattern(HOSTILE.deleteEvents),
    ]);
  });

  it('the compiled SQL is a CONSTANT — identical for all thirteen inputs, with the bytes only ever in the parameters', () => {
    for (const hostile of HOSTILE_VALUES) {
      const params = new SqlParams();
      const { clauses } = compileFilterSpec(
        {
          assigneeId: hostile,
          collaboratorId: hostile,
          typeId: hostile,
          stateId: hostile,
          text: hostile,
          fields: [
            { fieldId: hostile, op: 'eq', value: hostile },
            { fieldId: hostile, op: 'contains', value: hostile },
          ],
        },
        params,
      );
      expect(clauses, `slot SQL varied with the value ${JSON.stringify(hostile)}`).toEqual(SEVEN_SLOT_SQL);
      // …and the value is genuinely present as DATA, in every slot, exactly
      // once each. An assertion that only checks the SQL passes on a compiler
      // that dropped the term entirely; an inequality (`>= 5`) passes on one
      // that lost two of them.
      expect(params.toArray()).toEqual([
        hostile, hostile, hostile, hostile, hostile, hostile, hostile, hostile,
        likePattern(hostile),
      ]);
    }
    expect(HOSTILE_VALUES).toHaveLength(13);
  });
});

/**
 * The half no string comparison can prove. A compiler that concatenates and a
 * compiler that binds produce different SQL, but only an executing database
 * says which of them is safe — and only a row count says whether a bound
 * parameter actually addressed what it named.
 *
 * `proj_search` USED TO BE CREATED HERE as a stand-in, with the three columns
 * this compiler's text clause depends on (`ticket_id`, `workspace_id`, `tsv`)
 * and a `tsv` generated from the title alone. Plan 5 Task 6 shipped the real
 * migration, so the stand-in is gone and this file now exercises the SHIPPED
 * table — which is the stronger arrangement, since the note that stood here
 * ("if Task 6 names those columns differently, this test keeps passing and the
 * product breaks") described a seam a string-pinned compiler cannot feel. Task
 * 6 kept all three names and the `'simple'` configuration; the real `tsv` also
 * covers `description` and `comments`, which this file leaves empty, so every
 * expectation below is unchanged.
 */
describe('compileFilterSpec — executed against Postgres', () => {
  let db: TestDatabase;

  const WS_A = 'ws-a';
  const WS_B = 'ws-b';
  const WF = 'wf-shared-id';

  async function seedTicket(row: {
    id: string;
    workspaceId: string;
    stateId: string;
    stateCategory?: string;
    assigneeId?: string | null;
    collaborators?: string[];
    fields?: Record<string, unknown>;
  }): Promise<void> {
    await db.pool.query(
      `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id,
         workflow_version, state_id, state_category, assignee_id, collaborator_ids, fields, transitions)
       VALUES ($1, $2, 'prj', 'task', NULL, $3, 1, $4, $5, $6, $7, $8, '[]'::jsonb)`,
      [
        row.id,
        row.workspaceId,
        WF,
        row.stateId,
        row.stateCategory ?? 'active',
        row.assigneeId ?? null,
        JSON.stringify(row.collaborators ?? []),
        JSON.stringify(row.fields ?? {}),
      ],
    );
  }

  async function seedWorkflow(workspaceId: string, version: number, blockedStateId: string): Promise<void> {
    const definition = {
      id: WF,
      version,
      name: 'Errands',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active', blocked: blockedStateId === 'doing' },
        { id: 'waiting', name: 'Waiting', category: 'active', blocked: blockedStateId === 'waiting' },
      ],
      transitions: [],
    };
    await db.pool.query(
      `INSERT INTO proj_workflows (workspace_id, workflow_id, version, name, definition, defined_by, defined_at, published_workspace_seq)
       VALUES ($1, $2, $3, 'Errands', $4, 'actor', now(), $5)`,
      [workspaceId, WF, version, JSON.stringify(definition), version],
    );
  }

  /** Exactly the assembly Tasks 9–11 use: caller-supplied scope AND the compiled clauses. */
  async function run(spec: FilterSpec, workspaceId = WS_A): Promise<string[]> {
    const params = new SqlParams();
    const compiled = compileFilterSpec(spec, params);
    const where = [`t.workspace_id = ${params.add(workspaceId)}`, ...compiled.clauses];
    const cte = compiled.needsBlockedCte ? `WITH ${BLOCKED_STATES_CTE} ` : '';
    const { rows } = await db.pool.query(
      `${cte}SELECT t.ticket_id FROM proj_tickets t WHERE ${where.join(' AND ')} ORDER BY t.ticket_id`,
      params.toArray(),
    );
    return rows.map((r) => (r as { ticket_id: string }).ticket_id);
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    // wsA's own latest workflow blocks 'waiting'.
    await seedWorkflow(WS_A, 1, 'waiting');
    // wsB reuses the SAME workflow_id at a HIGHER version and blocks a
    // DIFFERENT state. The primary key is (workflow_id, version), so this is
    // a row Postgres accepts today, and it is what a global "latest version
    // per workflow_id" CTE would answer wsA's blocked filter from.
    await seedWorkflow(WS_B, 2, 'doing');

    await seedTicket({ id: 'tkt-1', workspaceId: WS_A, stateId: 'doing', assigneeId: 'usr_01', collaborators: ['usr_02'], fields: {
      title: { value: 'Renew the trade licence', actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
      dueDate: { value: { date: '2026-08-20' }, actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
      amount: { value: '4200', actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
      notes: { value: '50%_done', actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
    } });
    await seedTicket({ id: 'tkt-2', workspaceId: WS_A, stateId: 'waiting', assigneeId: 'usr_02', fields: {
      dueDate: { value: { date: '2026-09-30' }, actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
    } });
    // The ticket whose field KEY is a hostile string, and whose field VALUE is
    // one too: the positive control for "the parameter addressed what it named".
    await seedTicket({ id: 'tkt-3', workspaceId: WS_A, stateId: 'todo', stateCategory: 'open', fields: {
      [HOSTILE.statement]: { value: HOSTILE.alwaysTrue, actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
    } });
    // The declared-semantics fixture for `contains: ''`. `memo` carries the
    // EMPTY string (a value, and a real `eq` target); `blank` carries JSON null
    // (a key present with no value); no other ticket carries either key.
    await seedTicket({ id: 'tkt-4', workspaceId: WS_A, stateId: 'todo', stateCategory: 'open', fields: {
      memo: { value: '', actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
      blank: { value: null, actorId: 'usr_01', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
    } });
    // A ticket in the OTHER workspace. Every `run()` below scopes to one
    // workspace, so nothing that behaves correctly can ever see it — which is
    // what makes it the witness for the widening demonstration: if it appears
    // in an answer, a filter term crossed a tenant boundary.
    await seedTicket({ id: 'tkt-b1', workspaceId: WS_B, stateId: 'doing', fields: {
      amount: { value: '9999', actorId: 'usr_09', clientTime: '2026-08-01T00:00:00.000Z', serverTime: '2026-08-01T00:00:00.000Z' },
    } });

    await db.pool.query(
      `INSERT INTO proj_search (ticket_id, workspace_id, project_id, title) VALUES
        ('tkt-1', $1, 'prj', 'Renew the trade licence'),
        ('tkt-2', $1, 'prj', 'File the GST return'),
        ('tkt-3', $1, 'prj', 'Something else entirely')`,
      [WS_A],
    );
    // MIS-FILED ON PURPOSE. tkt-4 is a WS_A ticket; its search row says WS_B.
    //
    // This is the only shape in which the text clause's tenancy correlation is
    // executable, and the reason is worth stating: `proj_tickets.ticket_id` is
    // `text NOT NULL PRIMARY KEY`, so ticket_id → workspace is a FUNCTION, and
    // a correctly-filed neighbouring row can never satisfy an outer
    // `t.ticket_id IN (…)` for a ticket in another tenant. Seeding a second
    // workspace's ordinary search rows therefore reddens nothing. What the
    // correlation defends against is projection DRIFT — a row filed under the
    // wrong workspace — and that is what is seeded here.
    await db.pool.query(
      `INSERT INTO proj_search (ticket_id, workspace_id, project_id, title)
       VALUES ('tkt-4', $1, 'prj', 'Quarterly audit')`,
      [WS_B],
    );
  });

  afterAll(async () => {
    await db.drop();
  });

  it('every ordinary term matches the row it names (the positive control the exclusions need)', async () => {
    // tkt-b1 is a WS_B ticket and appears in NONE of these: every run() scopes
    // to WS_A, which is the baseline the widening test below is measured against.
    expect(await run({})).toEqual(['tkt-1', 'tkt-2', 'tkt-3', 'tkt-4']);
    expect(await run({ assigneeId: 'usr_01' })).toEqual(['tkt-1']);
    expect(await run({ collaboratorId: 'usr_02' })).toEqual(['tkt-1']);
    expect(await run({ typeId: 'task' })).toEqual(['tkt-1', 'tkt-2', 'tkt-3', 'tkt-4']);
    expect(await run({ stateId: 'doing' })).toEqual(['tkt-1']);
    expect(await run({ stateCategory: 'open' })).toEqual(['tkt-3', 'tkt-4']);
    expect(await run({ due: { before: '2026-08-31' } })).toEqual(['tkt-1']);
    expect(await run({ due: { after: '2026-08-21' } })).toEqual(['tkt-2']);
    expect(await run({ text: 'licence' })).toEqual(['tkt-1']);
    expect(await run({ fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }] })).toEqual(['tkt-1']);
    expect(await run({ fields: [{ fieldId: 'notes', op: 'contains', value: '50%_done' }] })).toEqual(['tkt-1']);
  });

  it('LIKE metacharacters in a contains value are literal, not wildcards', async () => {
    // '50%_done' matches only because the % and _ are escaped; if they were
    // wildcards, '5%d' would match too — and it must not.
    expect(await run({ fields: [{ fieldId: 'notes', op: 'contains', value: '50%_done' }] })).toEqual(['tkt-1']);
    expect(await run({ fields: [{ fieldId: 'notes', op: 'contains', value: '5%d' }] })).toEqual([]);
    expect(await run({ fields: [{ fieldId: 'notes', op: 'contains', value: '0%_d' }] })).toEqual(['tkt-1']);
  });

  it('the blocked filter answers from the ticket own workspace, not from a neighbouring tenant reusing the workflow id', async () => {
    // wsA's own definition blocks 'waiting' → tkt-2. wsB's higher-versioned
    // row for the same workflow_id blocks 'doing' → tkt-1. A global
    // latest-version CTE answers tkt-1 here; a workspace-correlated one
    // answers tkt-2.
    expect(await run({ blocked: true })).toEqual(['tkt-2']);
    expect(await run({ blocked: false })).toEqual(['tkt-1', 'tkt-3', 'tkt-4']);
  });

  it('executes every hostile input as data: no error, no damage, and empty only where empty is the truth', async () => {
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_tickets');
    const eventsBefore = await db.pool.query('SELECT count(*)::int AS n FROM events');

    for (const hostile of HOSTILE_VALUES) {
      expect(await run({ assigneeId: hostile })).toEqual([]);
      expect(await run({ collaboratorId: hostile })).toEqual([]);
      expect(await run({ typeId: hostile })).toEqual([]);
      expect(await run({ stateId: hostile })).toEqual([]);
      expect(await run({ text: hostile })).toEqual([]);
      expect(await run({ fields: [{ fieldId: hostile, op: 'eq', value: hostile }] })).toEqual([]);
      expect(await run({ fields: [{ fieldId: hostile, op: 'contains', value: hostile }] })).toEqual([]);
    }

    // The positive control that makes every [] above meaningful: the SAME
    // hostile bytes, sent as the field id and value that genuinely exist on
    // tkt-3, MATCH. The parameter carried the bytes and addressed the key.
    expect(await run({ fields: [{ fieldId: HOSTILE.statement, op: 'eq', value: HOSTILE.alwaysTrue }] })).toEqual(['tkt-3']);
    expect(await run({ fields: [{ fieldId: HOSTILE.statement, op: 'contains', value: "OR 't'='t" }] })).toEqual(['tkt-3']);

    // Nothing was dropped, deleted, or otherwise executed.
    expect((await db.pool.query('SELECT count(*)::int AS n FROM proj_tickets')).rows[0]).toEqual(before.rows[0]);
    expect((await db.pool.query('SELECT count(*)::int AS n FROM events')).rows[0]).toEqual(eventsBefore.rows[0]);
    const { rows } = await db.pool.query(`SELECT to_regclass('proj_tickets') IS NOT NULL AS alive`);
    expect((rows[0] as { alive: boolean }).alive).toBe(true);
  });

  it('an always-true payload stays a string: it narrows to nothing instead of widening to everything', async () => {
    // Concatenated, `nobody' OR 't'='t` closes the literal and ORs a
    // tautology, returning all three rows. Bound, it is one assignee id
    // nobody has.
    expect(await run({ assigneeId: HOSTILE.alwaysTrue })).toEqual([]);
    expect(await run({ typeId: HOSTILE.alwaysTrue })).toEqual([]);
    expect(await run({ stateId: HOSTILE.parenPayload })).toEqual([]);
  });

  it('websearch_to_tsquery treats a hostile query as a phrase — the FTS term cannot be a syntax error either', async () => {
    // to_tsquery would raise a syntax error on these; websearch_to_tsquery
    // does not, which is why the compiler names it. A refusal that arrives as
    // a 500 is still a refusal the attacker taught us to produce.
    for (const hostile of HOSTILE_VALUES) {
      await expect(run({ text: hostile })).resolves.toEqual([]);
    }
    expect(await run({ text: 'trade licence' })).toEqual(['tkt-1']);
  });

  /**
   * The one byte the door refuses, executed. Every assertion above sends bytes
   * the store can hold; U+0000 is the byte it cannot, and the schema's refusal
   * is only load-bearing if the alternative is a real database error rather
   * than a hypothesis. So the spec is built as a `FilterSpec` DIRECTLY — past
   * the door, which is the only way to reach the compiler with a NUL at all —
   * and the query is run.
   */
  describe('U+0000 — refused at the door because Postgres cannot carry it', () => {
    const NUL = String.fromCharCode(0);
    const withNul = `a${NUL}b`;

    const slots: Array<[string, FilterSpec]> = [
      ['assigneeId', { assigneeId: withNul }],
      ['collaboratorId', { collaboratorId: withNul }],
      ['typeId', { typeId: withNul }],
      ['stateId', { stateId: withNul }],
      ['text', { text: withNul }],
      ['fields[].fieldId', { fields: [{ fieldId: withNul, op: 'eq', value: 'v' }] }],
      ['fields[].value', { fields: [{ fieldId: 'memo', op: 'eq', value: withNul }] }],
    ];

    it('the door refuses it in all seven slots', () => {
      expect(slots).toHaveLength(7);
      for (const [name, spec] of slots) {
        expect(filterSpecSchema.safeParse(spec).success, `${name} admitted a NUL`).toBe(false);
      }
    });

    it('and past the door every one of those slots is a 22021, which is what the refusal is FOR', async () => {
      for (const [name, spec] of slots) {
        // `compileFilterSpec` is happy: it parses, compiles and binds this
        // correctly. The failure is at the wire, which is exactly why a schema
        // that admitted it would have moved a 400 to a 500.
        const params = new SqlParams();
        expect(compileFilterSpec(spec, params).clauses).toHaveLength(1);
        await expect(run(spec), `${name} did not raise`).rejects.toMatchObject({ code: '22021' });
      }
    });

    it('the paired positive control: the same seven specs with the NUL removed pass the door AND execute', async () => {
      const clean: Array<[string, FilterSpec]> = [
        ['assigneeId', { assigneeId: 'ab' }],
        ['collaboratorId', { collaboratorId: 'ab' }],
        ['typeId', { typeId: 'ab' }],
        ['stateId', { stateId: 'ab' }],
        ['text', { text: 'ab' }],
        ['fields[].fieldId', { fields: [{ fieldId: 'ab', op: 'eq', value: 'v' }] }],
        ['fields[].value', { fields: [{ fieldId: 'memo', op: 'eq', value: 'ab' }] }],
      ];
      expect(clean).toHaveLength(slots.length);
      for (const [name, spec] of clean) {
        expect(filterSpecSchema.safeParse(spec).success, `${name} clean spec refused`).toBe(true);
        await expect(run(spec), `${name} clean spec raised`).resolves.toEqual([]);
      }
    });
  });

  /**
   * DELIBERATELY UNSAFE — the compiler this project does NOT have.
   *
   * It interpolates the field id and value as quoted SQL literals instead of
   * binding them. It exists so the `fieldId` slot has an execution-grade kill
   * that is a WIDENED RESULT SET rather than a syntax error: a syntax error is
   * the weak kind of evidence, because it only shows the payload produced
   * *invalid* SQL, not that binding is what keeps the answer correct. Do not
   * export it, do not call it from `src/`, do not "fix" it.
   */
  function unsafeConcatenatedFieldClause(fieldId: string, value: string): string {
    return `t.fields -> '${fieldId}' ->> 'value' = '${value}'`;
  }

  /** Runs the unsafe clause with the SAME caller scope `run()` uses. */
  async function runConcatenated(fieldId: string, value: string, workspaceId = WS_A): Promise<string[]> {
    const params = new SqlParams();
    const scope = `t.workspace_id = ${params.add(workspaceId)}`;
    const { rows } = await db.pool.query(
      `SELECT t.ticket_id FROM proj_tickets t WHERE ${scope} AND ${unsafeConcatenatedFieldClause(fieldId, value)}`,
      params.toArray(),
    );
    // Sorted in JS: the payload's trailing `--` comments out the ORDER BY, so
    // the reference query cannot be relied on to order its own rows.
    return rows.map((r) => (r as { ticket_id: string }).ticket_id).sort();
  }

  it('a concatenated fieldId WIDENS the answer across the tenant boundary; the bound one narrows to nothing', async () => {
    // Concatenated, this closes the jsonb key literal, ORs a tautology and
    // comments away the tail — including the caller's own ORDER BY and, by
    // precedence, the effect of the workspace scope: `(ws = $1 AND …) OR TRUE`.
    const widening = "amount' ->> 'value' IS NOT NULL OR '1'='1' --";

    // The kill, and it is a widening rather than an error: another tenant's row.
    const leaked = await runConcatenated(widening, 'v');
    expect(leaked).toContain('tkt-b1');
    expect(leaked).toEqual(['tkt-1', 'tkt-2', 'tkt-3', 'tkt-4', 'tkt-b1']);

    // The real compiler, same bytes: the payload is one jsonb key nothing has.
    expect(await run({ fields: [{ fieldId: widening, op: 'eq', value: 'v' }] })).toEqual([]);

    // The positive control that makes the widening evidence about the PAYLOAD
    // rather than about the reference compiler being broken in general: on a
    // benign field id the unsafe compiler answers exactly what the real one does.
    expect(await runConcatenated('amount', '4200')).toEqual(['tkt-1']);
    expect(await run({ fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }] })).toEqual(['tkt-1']);
  });

  it('a mis-filed search row cannot answer out of the wrong workspace — the correlation is what refuses it', async () => {
    // tkt-4 is a WS_A ticket whose proj_search row is filed under WS_B.
    // With the correlation, a WS_A search for its title finds nothing.
    expect(await run({ text: 'audit' })).toEqual([]);

    // Positive control #1: the row exists and the term genuinely matches it, so
    // the empty above is a refusal and not an absent fixture.
    const { rows: searchRows } = await db.pool.query(
      `SELECT ticket_id, workspace_id FROM proj_search WHERE tsv @@ websearch_to_tsquery('simple', $1)`,
      ['audit'],
    );
    expect(searchRows).toEqual([{ ticket_id: 'tkt-4', workspace_id: WS_B }]);

    // Positive control #2 — the killer. The SAME query with the correlation
    // deleted returns tkt-4: that one conjunct is the whole difference, and
    // removing it from the compiler reddens the assertion above.
    const { rows: uncorrelated } = await db.pool.query(
      `SELECT t.ticket_id FROM proj_tickets t
         WHERE t.workspace_id = $1
           AND t.ticket_id IN (SELECT ticket_id FROM proj_search WHERE tsv @@ websearch_to_tsquery('simple', $2))`,
      [WS_A, 'audit'],
    );
    expect(uncorrelated.map((r) => (r as { ticket_id: string }).ticket_id)).toEqual(['tkt-4']);

    // And the ordinary path still works, so the correlation has not broken search.
    expect(await run({ text: 'licence' })).toEqual(['tkt-1']);
  });

  it("contains: '' is a field-PRESENCE predicate, exactly as the schema declares — and still cannot widen", async () => {
    // `eq: ''` is a value claim: only the ticket whose `memo` IS the empty string.
    expect(await run({ fields: [{ fieldId: 'memo', op: 'eq', value: '' }] })).toEqual(['tkt-4']);
    // `contains: ''` compiles to ILIKE '%%', which every non-NULL text matches:
    // presence, not content. It matches the empty memo…
    expect(await run({ fields: [{ fieldId: 'memo', op: 'contains', value: '' }] })).toEqual(['tkt-4']);
    // …and a non-empty value of another key, on the ticket that carries it.
    expect(await run({ fields: [{ fieldId: 'notes', op: 'contains', value: '' }] })).toEqual(['tkt-1']);
    // The two ways it does NOT widen: a key no ticket carries matches nothing,
    // and a key present with a JSON null value matches nothing either — `->>`
    // yields SQL NULL, and NULL ILIKE '%%' is not true.
    expect(await run({ fields: [{ fieldId: 'no-such-field', op: 'contains', value: '' }] })).toEqual([]);
    expect(await run({ fields: [{ fieldId: 'blank', op: 'contains', value: '' }] })).toEqual([]);
    // The control for that last one: the key really is there.
    const { rows } = await db.pool.query(
      `SELECT (fields -> 'blank' -> 'value') IS NOT NULL AS present FROM proj_tickets WHERE ticket_id = 'tkt-4'`,
    );
    expect((rows[0] as { present: boolean }).present).toBe(true);
  });
});
