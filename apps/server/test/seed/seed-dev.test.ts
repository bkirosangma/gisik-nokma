import { newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { readPlanSeries } from '../../src/seed/plan-series.js';
import { existingSeedEventIds } from '../../src/seed/seed-convenience-corner.js';
import { buildDevSeedEvents, seedDevWorkspace } from '../../src/seed/seed-dev-workspace.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Plan 11 Task 10 — the Gisik Nokma dev seed: one epic per plan document, one
 * task ticket per `### Task N:` heading, titles verbatim.
 *
 * Reuses Task 9's `CcSeedDeps`/`SeedReport` shape exactly, including its two
 * divergences from the plan text: `ingest` is narrowed to the gated CLIENT
 * door (`SeedIngest`, `ingestClientBatch` only — `ingestBatch` does not
 * compile against this seed), and `existingEventIds` is a required field, not
 * optional, so idempotence is answered by the ledger one step before the
 * gate rather than by a `duplicate-event-id` this seed's own events could
 * never reach (the same three earlier refusals Task 9 measured apply here:
 * `workspace.created`, `ticket.created`, and — not present here at all —
 * `ticket.transitioned`).
 */
const plansDir = new URL('../../../../docs/superpowers/plans', import.meta.url).pathname;
const ownerUserId = newUlid();
const resolveUserId = async (email: string): Promise<string | null> =>
  email === 'kiro@example.com' ? ownerUserId : null;

describe('buildDevSeedEvents — the calendar stays empty', () => {
  const docs = readPlanSeries(plansDir);
  const events = buildDevSeedEvents(docs, ownerUserId, '2026-08-20T12:00:00.000Z');

  it('planted defect (invariant 4): no date claims at all — the plan series claims no dates', () => {
    const dateClaims = events.filter((event) => {
      if (event.type !== 'ticket.field_set') return false;
      const fieldId = (event.payload as { fieldId: string }).fieldId;
      return fieldId === 'dueDate' || fieldId === 'startDate';
    });
    expect(dateClaims).toHaveLength(0);
  });

  it('planted defect: no transitions — no script claims progress on work it did not do', () => {
    expect(events.filter((event) => event.type === 'ticket.transitioned')).toHaveLength(0);
  });

  it('every event wears the client door\'s origin, not the internal door\'s', () => {
    expect(events.every((event) => event.origin === 'web')).toBe(true);
  });

  it('the owner joins the one project this seed creates, before any ticket.created', () => {
    const memberAddedIndex = events.findIndex((event) => event.type === 'project.member_added');
    const firstTicketCreatedIndex = events.findIndex((event) => event.type === 'ticket.created');
    expect(memberAddedIndex).toBeGreaterThanOrEqual(0);
    expect(memberAddedIndex).toBeLessThan(firstTicketCreatedIndex);
    const payload = events[memberAddedIndex]?.payload as { userId: string; projectAdmin: boolean };
    expect(payload.userId).toBe(ownerUserId);
  });

  it('one epic per plan, one task ticket per task heading, titles verbatim', () => {
    const created = events.filter((event) => event.type === 'ticket.created');
    const epics = created.filter((event) => (event.payload as { typeId: string }).typeId === 'epic');
    const tasks = created.filter((event) => (event.payload as { typeId: string }).typeId === 'task');
    expect(epics).toHaveLength(docs.length);
    expect(tasks).toHaveLength(docs.reduce((sum, doc) => sum + doc.tasks.length, 0));
    const eleven = docs.find((doc) => doc.planNumber === '11');
    expect(epics.some((event) => (event.payload as { title: string }).title === eleven?.title)).toBe(true);
  });

  it('builds no duplicate event ids across the whole batch', () => {
    const ids = events.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('seedDevWorkspace', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);
  afterAll(async () => {
    await db.drop();
  });

  function makeDeps() {
    const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
    return {
      ingest,
      resolveUserId,
      existingEventIds: (ids: readonly string[]) => existingSeedEventIds(db.pool, ids),
    };
  }

  it('refuses when the owner has never signed in — people are not invented', async () => {
    await expect(
      seedDevWorkspace(
        { ...makeDeps(), resolveUserId: async () => null },
        { plansDir, ownerEmail: 'nobody@example.com' },
      ),
    ).rejects.toThrowError(/sign in once/);
  });

  it('lands, and a re-run is a no-op', async () => {
    const first = await seedDevWorkspace(makeDeps(), { plansDir, ownerEmail: 'kiro@example.com' });
    expect(first.committed).toBeGreaterThan(0);
    const second = await seedDevWorkspace(makeDeps(), { plansDir, ownerEmail: 'kiro@example.com' });
    expect(second.committed).toBe(0);
    expect(second.skippedExisting).toBe(first.committed);
  });
});
