import { PRIORITIES, type Priority, type SubmittedEvent } from '@gisik-nokma/domain';
import { seedDescriptionDoc } from './doc-text.js';
import { readPlanSeries, type PlanDoc } from './plan-series.js';
import type { CcSeedDeps, SeedReport } from './seed-convenience-corner.js';
import { seedUlid } from './seed-ulid.js';

/**
 * Gisik Nokma's own build, seeded into itself: one epic per plan document,
 * one task ticket per `### Task N:` heading, titles verbatim from the
 * documents (the record this seed reads — see `plan-series.ts`).
 *
 * ADAPTED FROM PLAN TEXT in the same three ways Task 9's sibling module
 * already had to be:
 *
 * 1. **The door.** The plan's example calls `deps.ingest.ingestBatch(...)` —
 *    the ungated internal door. This seed goes through `ingestClientBatch`
 *    only, via `CcSeedDeps`'s `SeedIngest` narrowing (imported, not
 *    redefined) — the same product rules a person's browser meets, including
 *    the requirement that the owner join a project before creating tickets
 *    in it (`checkVisibilityPermission`, `ticket.created` branch).
 * 2. **Origin.** Every event carries `origin: 'web'`, not the plan text's
 *    `'server'` — the client door refuses a client-submitted event wearing
 *    server provenance (`check-permission.ts`, `SERVER_ORIGIN_REASON`).
 * 3. **No re-founding.** `workspace.created` alone triggers
 *    `bootstrapWorkspace` (Plan 4), which appends the simple-Kanban workflow,
 *    the five built-in ticket types — including `epic` and `task`, both used
 *    here — and the founder's owner grant, all through the internal door,
 *    regardless of which door received the founding event. This seed never
 *    emits its own `workflow.defined` or `ticket-type.defined`: doing so
 *    would be a second, divergent founding sequence for types the workspace
 *    already has for free.
 *
 * `CcSeedDeps`/`SeedReport` are imported as types from Task 9's module
 * (`seed-convenience-corner.ts`) rather than redefined — including that
 * module's own divergence from the plan text: `existingEventIds` is
 * required, and `ingest` is narrowed to `SeedIngest`. See that module's
 * doc comment on `CcSeedDeps` for why both are load-bearing.
 */
export function buildDevSeedEvents(docs: PlanDoc[], ownerUserId: string, clientTime: string): SubmittedEvent[] {
  const workspaceId = seedUlid('workspace', 'gisik-nokma-dev');
  const projectId = seedUlid('project', 'dev#build');
  const events: SubmittedEvent[] = [];
  const push = (key: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): void => {
    events.push({
      id: seedUlid('event', key),
      workspaceId,
      entity,
      type,
      version: 1,
      payload,
      actorId: ownerUserId,
      // 'web', not 'server' — this seed submits through the client door (see
      // the module doc comment, correction 2).
      origin: 'web',
      clientTime,
    });
  };

  // Founding is NOT re-implemented here — see the module doc comment,
  // correction 3. This seed adds only the project and the plan-series
  // content.
  push('dev#workspace#created', { kind: 'workspace', id: workspaceId }, 'workspace.created', { name: 'Gisik Nokma' });
  push('dev#project#build', { kind: 'project', id: projectId }, 'project.created', { name: 'Build — the plan series' });
  // THE OWNER JOINS THEIR OWN PROJECT — required by the client door before any
  // `ticket.created` in it (`checkVisibilityPermission`; `eff.projects` is
  // built from `project.member_added` and nowhere else). Without this every
  // epic and task ticket below is refused `permission.role`, "You are not a
  // member of this project, so you cannot create tickets in it." Measured on
  // Task 9's sibling seed, not merely inferred.
  push('dev#project#owner-joined', { kind: 'project', id: projectId }, 'project.member_added', {
    userId: ownerUserId,
    projectAdmin: true,
  });

  /**
   * The next level for the next `ticket.created`, cycling P1 → P2 → P3
   * (spec 2026-09-22). A fresh database must SHOW the whole ladder, not only
   * its middle: without this every seeded ticket would take the reducer's birth
   * default and the dev stack would read as a product with one priority.
   *
   * ONE counter across epics AND tasks, not one index per plan or per epic. Off
   * the plan number (`doc.planNumber % 3`, the shape the plan text sketches) a
   * two-plan corpus — which is exactly `seed-dev.test.ts`'s fixture, chosen
   * there for measured reasons and not for this — reaches only P2 and P3 and the
   * case would be asserting something the fixture cannot produce. Counting every
   * created ticket makes "all three levels are present" true of any corpus of
   * three or more, which is the property the spec actually asks for.
   *
   * Deterministic off the position in the series, never random: the seed is a
   * fixture, and a re-run must rebuild byte-identical payloads.
   */
  let priorityCursor = 0;
  const nextPriority = (): Priority => PRIORITIES[priorityCursor++ % PRIORITIES.length]!;

  for (const doc of docs) {
    const epicId = seedUlid('ticket', `dev#plan-${doc.planNumber}`);
    push(`dev#plan-${doc.planNumber}#created`, { kind: 'ticket', id: epicId }, 'ticket.created', {
      // 'epic' is a built-in ticket type bound to the default simple-Kanban
      // workflow by `bootstrapWorkspace` — no `ticket-type.defined` needed.
      typeId: 'epic',
      projectId,
      parentId: null,
      title: doc.title,
      priority: nextPriority(),
    });
    if (doc.goal) {
      push(`dev#plan-${doc.planNumber}#description`, { kind: 'ticket', id: epicId }, 'ticket.field_set', {
        // 'description' is a BUILT-IN field (BUILTIN_FIELD_IDS) — no custom
        // field declaration needed, and none exists to declare it against
        // since this seed defines no ticket type of its own.
        fieldId: 'description',
        // The plan's own goal is prose and is parsed (the owner's 2026-09-20
        // ruling); the `source:` line is a RECORD line and is not, for the
        // reason `doc-text.ts` gives — a path is not a sentence.
        value: seedDescriptionDoc([
          { kind: 'markdown', text: `Goal: ${doc.goal}` },
          { kind: 'literal', text: `source: docs/superpowers/plans/${doc.file}` },
        ]),
      });
    }
    for (const task of doc.tasks) {
      const taskTicketId = seedUlid('ticket', `dev#plan-${doc.planNumber}#task-${task.number}`);
      push(
        `dev#plan-${doc.planNumber}#task-${task.number}#created`,
        { kind: 'ticket', id: taskTicketId },
        'ticket.created',
        {
          // 'task' is likewise built-in.
          typeId: 'task',
          projectId,
          parentId: epicId,
          title: `Task ${task.number}: ${task.title}`,
          priority: nextPriority(),
        },
      );
      push(
        `dev#plan-${doc.planNumber}#task-${task.number}#description`,
        { kind: 'ticket', id: taskTicketId },
        'ticket.field_set',
        {
          fieldId: 'description',
          value: seedDescriptionDoc([
            { kind: 'literal', text: `source: docs/superpowers/plans/${doc.file} § Task ${task.number}` },
          ]),
        },
      );
    }
  }
  // Deliberately: no dates, no transitions. The plan series claims no dates
  // (planted-defect invariant 4 — the calendar stays empty), and execution
  // state is authored in the product, by the humans doing the work, as it
  // happens — a seed script does not get to claim progress on its own.
  return events;
}

export async function seedDevWorkspace(
  deps: CcSeedDeps,
  options: { plansDir: string; ownerEmail: string },
): Promise<SeedReport> {
  const ownerUserId = await deps.resolveUserId(options.ownerEmail);
  if (!ownerUserId) {
    throw new Error(
      `no user has the email ${options.ownerEmail} — the owner must sign in once before seeding; the seed never invents people.`,
    );
  }
  const docs = readPlanSeries(options.plansDir);
  const clientTime = (deps.now?.() ?? new Date()).toISOString();
  const events = buildDevSeedEvents(docs, ownerUserId, clientTime);

  // Same self-collision guard as Task 9's sibling seed: a collision here
  // would be silently counted as "already present" and half the series would
  // quietly not be seeded.
  const ids = events.map((event) => event.id);
  if (new Set(ids).size !== ids.length) {
    const seenIds = new Set<string>();
    const repeatedIds = new Set<string>();
    for (const id of ids) {
      if (seenIds.has(id)) repeatedIds.add(id);
      seenIds.add(id);
    }
    const repeated = [...repeatedIds];
    throw new Error(
      `the seed built ${repeated.length} duplicate event id(s) (${repeated.join(', ')}) — two records share a key, so one of them would be silently skipped as "already present".`,
    );
  }

  // Idempotence by the same mechanism as Task 9's sibling seed, and for the
  // same reason: `duplicate-event-id` is unreachable for most of these
  // events on a second run (a re-submitted `workspace.created` is refused
  // `permission.role` — "This workspace has already been founded" — before
  // the ledger's primary key ever gets a say; a re-submitted `ticket.created`
  // is refused `ticket.already-exists` by the engine). So the ledger is asked
  // one step earlier which of these ids it already holds, and only the rest
  // are submitted — every one of THOSE still goes through `ingestClientBatch`
  // in full.
  const alreadyPresent = await deps.existingEventIds(ids);
  const pending = events.filter((event) => !alreadyPresent.has(event.id));
  let committed = 0;
  let skippedExisting = events.length - pending.length;

  const results = await deps.ingest.ingestClientBatch(pending, ownerUserId);
  results.forEach((result, index) => {
    if (result.status === 'committed') {
      committed += 1;
    } else if (result.status === 'invalid' && result.code === 'duplicate-event-id') {
      skippedExisting += 1;
    } else {
      const event = pending[index];
      throw new Error(
        `dev seed event ${event?.type} (${event?.id}) was not accepted: ${JSON.stringify(result)} — a seed that cannot land cleanly must fail loudly, not partially.`,
      );
    }
  });

  const tickets = docs.reduce((sum, doc) => sum + doc.tasks.length, 0);
  return { committed, skippedExisting, tickets, guestConfigured: false };
}
