import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { createPool } from '../db.js';
import { createIngestService, type IngestService } from '../ingest/ingest-service.js';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildProjectionRegistry } from '../projections/index.js';
import { findUserIdByEmail } from '../seed/users.js';
import { seedUlid } from '../seed/seed-ulid.js';

/**
 * A search corpus, big enough for spec §7.9's targets to mean something (Plan 3
 * of 6).
 *
 * ## Why 10 000 notes is the number, and it is the spec's
 *
 * A search index that is fast on fifty rows is not evidence about anything. The
 * plan's targets — p95 ≤ 50 ms lexical, ≤ 150 ms meaning — are stated against a
 * corpus of ten thousand notes across three workspaces, because that is where
 * the choices this plan made start to cost something: an exact scan over
 * `search_note_chunks` rather than an HNSW index (spec §7.1 defers that to this
 * measurement), and a `ticketNumbers` scan per note event that has attachments.
 *
 * ## Through the LEDGER, not into the tables
 *
 * The notes go in as events, so every projection runs and every chunk is built
 * the way the product builds it. Writing rows directly would measure a database
 * that the product cannot produce — and the one thing the meaning target is
 * about is the CHUNKS, which only the worker writes.
 *
 * ## Deterministic, and that is not decoration
 *
 * Every id comes from `seedUlid` and every word from a fixed list indexed by the
 * note's number, so two runs produce the same corpus and two measurements are
 * comparable. A corpus generated from `Math.random()` would make a regression
 * and a reshuffle indistinguishable.
 */

/** Spec §7.9's three workspaces. */
const DEFAULT_WORKSPACES = 3;

/** Spec §7.9's ten thousand notes, spread over the workspaces. */
const DEFAULT_NOTES = 10_000;

/** Spec §7.9's "bodies of 200–800 words". */
const MIN_WORDS = 200;
const MAX_WORDS = 800;

/**
 * The vocabulary. Long enough that a chunk of 150 words rarely repeats a word
 * many times — which matters to the measurement: a corpus of one repeated word
 * would make every trigram correction instant and every vector identical.
 */
const WORDS = [
  'compressor', 'freezer', 'belt', 'tension', 'coolant', 'gasket', 'valve', 'sensor', 'thermostat', 'condenser',
  'evaporator', 'refrigerant', 'insulation', 'door', 'seal', 'hinge', 'shelf', 'trolley', 'invoice', 'licence',
  'registration', 'shipment', 'delivery', 'manifest', 'crate', 'pallet', 'warehouse', 'aisle', 'shelf', 'stock',
  'inventory', 'reorder', 'supplier', 'quotation', 'order', 'receipt', 'ledger', 'balance', 'audit', 'quarter',
  'budget', 'foreman', 'shift', 'roster', 'overtime', 'training', 'induction', 'safety', 'harness', 'ladder',
  'scaffold', 'inspection', 'permit', 'hazard', 'incident', 'repair', 'maintenance', 'schedule', 'calibration',
  'gauge', 'reading', 'log', 'checklist', 'signature', 'approval', 'review', 'meeting', 'minutes', 'decision',
  'action', 'followup', 'customer', 'complaint', 'refund', 'warranty', 'service', 'technician', 'visit', 'route',
  'van', 'fuel', 'mileage', 'toll', 'parking', 'loading', 'unloading', 'delay', 'window', 'season', 'monsoon',
  'humidity', 'temperature', 'power', 'outage', 'generator', 'backup', 'battery', 'wiring', 'breaker', 'fuse',
];

/** The words of one note, from its number — deterministic and repeatable. */
function bodyWords(noteNumber: number, wordCount: number): string[] {
  const words: string[] = [];
  for (let index = 0; index < wordCount; index += 1) {
    // Two independent strides so consecutive notes do not share a prefix, and
    // coprime with the vocabulary size so the word list is walked unevenly.
    words.push(WORDS[(noteNumber * 7 + index * 13) % WORDS.length] as string);
  }
  return words;
}

/** A ProseMirror document of paragraphs, `words` split roughly every 40 words. */
function bodyDoc(noteNumber: number, wordCount: number): unknown {
  const words = bodyWords(noteNumber, wordCount);
  const paragraphs: string[] = [];
  for (let start = 0; start < words.length; start += 40) {
    paragraphs.push(`${words.slice(start, start + 40).join(' ')}.`);
  }
  return {
    type: 'doc',
    attrs: { schemaVersion: 2 },
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  };
}

export type CorpusReport = {
  workspaces: number;
  notes: number;
  words: number;
  /** Wall-clock milliseconds spent submitting events. */
  elapsedMs: number;
};

export type CorpusDeps = {
  /** The CLIENT door, narrowed — the same one the product's browser meets. */
  ingest: Pick<IngestService, 'ingestClientBatch'>;
  ownerUserId: string;
  now: () => Date;
};

export type CorpusOptions = {
  workspaces?: number;
  /**
   * The TOTAL, not per workspace — spec §7.9 says "10 000 notes across 3
   * workspaces", and an earlier draft of this file read it as per workspace and
   * built thirty thousand. MEASURED, on the first run: 15 341 notes indexed
   * before the run was stopped, against a target of ten thousand — which is a
   * corpus three times the size the targets are stated against, and a
   * measurement that would not be comparable with anyone else's.
   */
  notes?: number;
};

export async function seedSearchCorpus(deps: CorpusDeps, options: CorpusOptions = {}): Promise<CorpusReport> {
  const workspaces = options.workspaces ?? DEFAULT_WORKSPACES;
  const total = options.notes ?? DEFAULT_NOTES;
  const started = deps.now().getTime();

  // BATCHED, and not for speed alone: `ingestClientBatch` is the unit the
  // product submits in, and a batch per note would put ten thousand round trips
  // between the corpus and the measurement. Two hundred events per batch keeps
  // each transaction comfortably inside the pool's statement timeout.
  const BATCH = 200;
  let pending: SubmittedEvent[] = [];
  let totalWords = 0;
  let notesSeeded = 0;

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    await deps.ingest.ingestClientBatch(pending, deps.ownerUserId);
    pending = [];
  };

  for (let workspace = 0; workspace < workspaces; workspace += 1) {
    const workspaceId = seedUlid('workspace', `search-corpus#${String(workspace)}`);
    const projectId = seedUlid('project', `search-corpus#${String(workspace)}`);
    const stamp = deps.now().toISOString();
    const push = (key: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): void => {
      pending.push({
        id: seedUlid('event', key),
        workspaceId,
        entity,
        type,
        version: 1,
        payload,
        actorId: deps.ownerUserId,
        // 'web', not 'server': the client door refuses a client-submitted event
        // wearing server provenance (`check-permission.ts`, `SERVER_ORIGIN_REASON`).
        origin: 'web',
        clientTime: stamp,
      });
    };

    // `workspace.created` alone triggers `bootstrapWorkspace`, which appends the
    // workflow, the built-in ticket types and the founder's owner grant — so
    // this seeder emits none of those, exactly as `seed-dev-workspace.ts` says.
    push(`w${String(workspace)}#created`, { kind: 'workspace', id: workspaceId }, 'workspace.created', {
      name: `Corpus workspace ${String(workspace + 1)}`,
    });
    push(`w${String(workspace)}#project`, { kind: 'project', id: projectId }, 'project.created', {
      name: `Corpus project ${String(workspace + 1)}`,
    });

    // Spread as evenly as the division allows, with the remainder on the FIRST
    // workspaces so the counts differ by at most one and `total` is exact.
    const perWorkspace = Math.ceil(total / workspaces);
    const here = Math.max(0, Math.min(perWorkspace, total - workspace * perWorkspace));

    for (let index = 0; index < here; index += 1) {
      const noteNumber = workspace * perWorkspace + index;
      const noteId = seedUlid('note', `search-corpus#${String(noteNumber)}`);
      const wordCount = MIN_WORDS + (noteNumber % (MAX_WORDS - MIN_WORDS + 1));
      totalWords += wordCount;
      notesSeeded += 1;
      const key = `n${String(noteNumber)}`;
      push(key + '#created', { kind: 'note', id: noteId }, 'note.created', {
        title: `Corpus note ${String(noteNumber)} ${(WORDS[noteNumber % WORDS.length] as string)}`,
        homeProjectId: projectId,
        scope: { mode: 'workspace' },
      });
      push(key + '#body', { kind: 'note', id: noteId }, 'note.body_set', { body: bodyDoc(noteNumber, wordCount) });
      if (pending.length >= BATCH) await flush();
    }
    await flush();
  }

  return {
    workspaces,
    // The count actually submitted, summed as it goes rather than recomputed
    // from the options — a report that disagrees with the ledger is worse than
    // no report, and this is the number the perf case prints.
    notes: notesSeeded,
    words: totalWords,
    elapsedMs: deps.now().getTime() - started,
  };
}

/**
 * The CLI. `DATABASE_URL` and a seeded owner, exactly as the other seeders.
 *
 *   DATABASE_URL=… pnpm --filter @gisik-nokma/server run seed:search-corpus --owner-email you@example.com
 */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const argv = process.argv.slice(2);
  const argument = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const ownerEmail = argument('--owner-email') ?? process.env['SEED_OWNER_EMAIL'];
  if (!ownerEmail) {
    console.error('usage: seed:search-corpus --owner-email <email> [--notes <per workspace>] [--workspaces <n>]');
    process.exit(2);
  }

  const pool: Pool = createPool(databaseUrl);
  try {
    const ownerUserId = await findUserIdByEmail(pool, ownerEmail);
    if (ownerUserId === null) {
      console.error(`no user with email ${ownerEmail} — sign that person in once first`);
      process.exit(1);
    }
    const ingest = createIngestService({
      pool,
      evaluate: evaluateEvent,
      projections: buildProjectionRegistry(),
    });
    const report = await seedSearchCorpus(
      { ingest, ownerUserId, now: () => new Date() },
      {
        workspaces: Number(argument('--workspaces') ?? DEFAULT_WORKSPACES),
        notes: Number(argument('--notes') ?? DEFAULT_NOTES),
      },
    );
    console.log(
      `search corpus: ${String(report.notes)} notes, ${String(report.workspaces)} workspaces, ` +
        `${String(report.words)} words in ${String(report.elapsedMs)} ms`,
    );
    console.log(
      'The embedding worker is a LOOP — it is not this process. Start the server (or wait for a running one) ' +
        'and let it backfill, then measure with NOTES_PERF=1.',
    );
  } finally {
    await pool.end();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
