import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FilterSpec } from '@gisik-nokma/domain';
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
 * The hostile inputs. The schema refuses shapes and lengths, never bytes, so
 * each of these reaches the compiler exactly as an attacker would send it —
 * with one boundary worth naming rather than glossing: the 500-character
 * string is a legal `text` value (max 500) but NOT a legal `fieldId` (max
 * 200), so in that one slot it is over the door's limit. The tests send it
 * there anyway, which tests the compiler on input stricter callers would
 * already have refused — a superset, never a false green.
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
} as const;
const HOSTILE_VALUES = Object.values(HOSTILE);

describe('compileFilterSpec — hostile bytes never reach SQL text', () => {
  it('PLANTED DEFECT: hostile fieldId and text never reach the SQL text — parameters only', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec(
      { text: HOSTILE.deleteEvents, fields: [{ fieldId: HOSTILE.statement, op: 'contains', value: HOSTILE.deleteEvents }] },
      params,
    );
    const sql = clauses.join(' AND ');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DELETE FROM');
    expect(params.toArray()).toContain(HOSTILE.deleteEvents);
    expect(params.toArray().some((v) => typeof v === 'string' && v.includes('DROP TABLE'))).toBe(true);
  });

  it('no hostile byte-string appears anywhere in the compiled SQL, whichever slot it is sent through', () => {
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
      const sql = clauses.join(' AND ');
      expect(sql).not.toContain(hostile);
      // …and it is genuinely present as DATA (an assertion that only checks
      // absence passes on a compiler that dropped the term entirely).
      expect(params.toArray().filter((v) => v === hostile).length).toBeGreaterThanOrEqual(5);
    }
  });
});

/**
 * The half no string comparison can prove. A compiler that concatenates and a
 * compiler that binds produce different SQL, but only an executing database
 * says which of them is safe — and only a row count says whether a bound
 * parameter actually addressed what it named.
 *
 * NOTE FOR TASK 6: `proj_search` is created here as a STAND-IN with the three
 * columns this compiler's text clause depends on (`ticket_id`, `workspace_id`,
 * `tsv`). Task 6 ships the real migration; if it names those columns
 * differently, this test keeps passing and the product breaks — so Task 6 must
 * keep these three names, or change this clause with it.
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
    await db.pool.query(`CREATE TABLE proj_search (
      ticket_id text PRIMARY KEY,
      workspace_id text NOT NULL,
      project_id text NOT NULL,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      comments text NOT NULL DEFAULT '',
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', title)) STORED
    )`);

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

    await db.pool.query(
      `INSERT INTO proj_search (ticket_id, workspace_id, project_id, title) VALUES
        ('tkt-1', $1, 'prj', 'Renew the trade licence'),
        ('tkt-2', $1, 'prj', 'File the GST return'),
        ('tkt-3', $1, 'prj', 'Something else entirely')`,
      [WS_A],
    );
  });

  afterAll(async () => {
    await db.drop();
  });

  it('every ordinary term matches the row it names (the positive control the exclusions need)', async () => {
    expect(await run({})).toEqual(['tkt-1', 'tkt-2', 'tkt-3']);
    expect(await run({ assigneeId: 'usr_01' })).toEqual(['tkt-1']);
    expect(await run({ collaboratorId: 'usr_02' })).toEqual(['tkt-1']);
    expect(await run({ typeId: 'task' })).toEqual(['tkt-1', 'tkt-2', 'tkt-3']);
    expect(await run({ stateId: 'doing' })).toEqual(['tkt-1']);
    expect(await run({ stateCategory: 'open' })).toEqual(['tkt-3']);
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
    expect(await run({ blocked: false })).toEqual(['tkt-1', 'tkt-3']);
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
});
