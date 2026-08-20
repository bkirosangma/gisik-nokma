# Foundation & Event Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the monorepo foundation and the append-only event ledger with deterministic, verifiable projections — the core that makes every later feature a claim the board cannot lie about.

**Architecture:** An event-sourced core: clients submit event envelopes to `POST /v1/events`; the server validates the envelope (pure `parseEvent`), assigns `serverTime`, a per-entity `seq`, and a per-workspace `workspace_seq` stream cursor inside a transaction, gates each event through the shared rule engine (pass-through in this plan), appends accepted events to an append-only Postgres `events` table, and applies registered projections in the same transaction. Both sequences are assigned under advisory locks, and **lock order is always workspace first, then entity — one global order across the whole server, so two ingests can never deadlock by taking the pair in opposite orders.** Every projection is rebuildable from scratch; a verifier CLI re-derives them into a shadow schema and diffs against live.

**Tech Stack:** pnpm 9 workspaces + Turborepo, TypeScript strict (Node 22 LTS, ESM), Fastify 5, Postgres 16 via `pg`, node-pg-migrate, zod 3, ulidx, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` (this plan implements sections 1 and 3 — the honesty contract's server-side floor, the ledger, and projections).

**Series:** This is **Plan 1 of an 11-plan series**. Later plans consume the **Interfaces → Produces** blocks below verbatim — package names, exported types, function signatures, table shapes, and the HTTP contract are cross-plan API. Do not rename anything a Produces block declares.

## Global Constraints

Copied from the binding engineering contract (identical across all parallel plan-writers):

- MONOREPO: pnpm workspaces + Turborepo, TypeScript strict everywhere, Node 22 LTS, pnpm 9.
  - `packages/domain` — shared types + zod schemas (event envelope, entities, ids)
  - `packages/rule-engine` — pure validation, no I/O (Plan 1 creates the package with interface + pass-through implementation; Plan 2 fills it)
  - `apps/server` — Fastify 5 HTTP + WebSocket server, Postgres 16 via `pg`, migrations via node-pg-migrate
  - (later plans add `packages/ui`, `packages/sync-client`, `apps/web`, `apps/mobile`, `apps/desktop` — do not create them)
- TESTING: Vitest. IDS: ULID via `ulidx`.
- EVENT ENVELOPE (packages/domain, exact — later plans depend on these names):

```ts
type EventEnvelope = {
  id: string;              // ULID, client-generated
  workspaceId: string;
  entity: { kind: 'workspace'|'project'|'ticket'|'workflow'|'ticket-type'|'membership'; id: string };
  type: string;            // 'ticket.transitioned' etc.
  version: number;         // schema version of this event type
  payload: unknown;        // validated per-type by zod schema from packages/domain
  actorId: string;
  origin: 'web'|'mobile'|'desktop'|'server';
  clientTime: string;      // ISO 8601 — the actor's claim about when
  serverTime: string;      // ISO 8601 — assigned at ingest
  seq: number;             // per-entity sequence, assigned at ingest
}
```

- RULE ENGINE INTERFACE (exact):

```ts
type Refusal = { refused: true; rule: string; reason: string }  // reason: plain language, names the rule
type Accept  = { refused: false }
type EngineContext = {
  getEntityState(kind: EventEnvelope['entity']['kind'], id: string): Promise<EntityState | null>;
  getChildrenStates(ticketId: string): Promise<TicketState[]>;
  getWorkflowDef(workflowId: string, version?: number): Promise<WorkflowDef | null>;
}
declare function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal>
```

- DB: `events` table append-only; projections in tables prefixed `proj_`; every projection registered in a projection registry with deterministic `apply(event, tx)` and `reset(tx)`, rebuildable from scratch; rebuild-and-diff verifier CLI at `apps/server/src/tools/verify-projections.ts`. Snapshots table bounds per-entity replay.

Engineering addenda binding on every task in this plan:

- ESM everywhere: every `package.json` has `"type": "module"`; `module`/`moduleResolution` are `NodeNext`; **relative imports in source carry the `.js` suffix** (e.g. `import { newUlid } from './ids.js'`).
- `pg` import convention: value import `import pg from 'pg'` (use `new pg.Pool(...)`); type imports named: `import type { Pool, PoolClient } from 'pg'`. Requires devDependency `@types/pg`.
- Postgres `int8` (OID 20) arrives as a string; `apps/server/src/db.ts` installs `pg.types.setTypeParser(20, ...)` once so `seq` reads as `number` (safe: seq stays far below 2^53). Test helpers must route pool creation through `createPool` so the parser is installed.
- `jsonb` parameters are always passed as `JSON.stringify(value)` — never raw objects (pg mangles arrays otherwise).
- TypeScript: `strict: true` plus `noUncheckedIndexedAccess`. `exactOptionalPropertyTypes` is deliberately OFF (it fights zod/pg row types for no Plan-1 gain) — do not enable it mid-series.
- Timestamps: ISO 8601 limited to **at most millisecond precision** (regex-enforced at the envelope), so every stored claim reads back byte-identical. `client_time` is stored as `text` verbatim (the actor's claim, offset preserved); `server_time` as `timestamptz` (the system's orderable fact).
- Canonical replay order for projections: `ORDER BY entity_kind, entity_id, seq` — a total order (the triple is unique). Replay guarantees per-entity causality only; **a projection's table contents must be a pure function of the ledger's rows, never of cross-entity arrival interleaving**.
- Dependency versions (caret ranges): `turbo ^2.5.0`, `typescript ^5.6.3`, `vitest ^3.1.0`, `zod ^3.25.0` (v3 API — our own ISO regex sidesteps zod v3/v4 datetime drift), `ulidx ^2.4.1`, `fastify ^5.3.0`, `pg ^8.13.0`, `@types/pg ^8.11.0`, `node-pg-migrate ^7.9.0`, `tsx ^4.19.0`, `@types/node ^22.10.0`.
- The executor runs all commands from the repo root (`/Users/kiro/my_projects/gisik-nokma`) unless a step says otherwise. `reference/` is frozen — never touch it.
- Every refusal path introduced here is proven against a planted defect: construct the bad input, assert the exact refusal (spec §1 invariant 6).

## File Structure

```
gisik-nokma/
├── package.json                  # root: workspace scripts, turbo
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── docker-compose.yml            # dev/test Postgres 16 on port 54329
├── packages/
│   ├── domain/                   # @gisik-nokma/domain
│   │   ├── src/ids.ts            # ULID helpers, Brand
│   │   ├── src/envelope.ts       # EventEnvelope, SubmittedEvent, zod schemas
│   │   ├── src/registry.ts       # event-type registry
│   │   ├── src/vocabulary.ts     # domainRegistry + provisional seed types
│   │   ├── src/parse-event.ts    # parseEvent → ParsedEvent | EnvelopeError
│   │   ├── src/state.ts          # EntityHead (authoritative entity/workflow state types land in Plan 2)
│   │   ├── src/provisional.ts    # PROVISIONAL EntityState/TicketState/WorkflowDef stubs — Plan 2 Task 2 replaces
│   │   └── src/index.ts
│   └── rule-engine/              # @gisik-nokma/rule-engine
│       └── src/engine.ts         # Accept/Refusal, EngineContext, evaluateEvent (pass-through)
└── apps/server/                  # @gisik-nokma/server
    ├── migrations/               # node-pg-migrate SQL migrations
    ├── src/config.ts             # env → AppConfig
    ├── src/db.ts                 # createPool + int8 parser
    ├── src/app.ts                # buildApp (Fastify factory)
    ├── src/index.ts              # boot
    ├── src/ledger/event-store.ts # lock/seq/insert/read, canonical order
    ├── src/ledger/snapshot-store.ts
    ├── src/projections/registry.ts
    ├── src/projections/rebuild.ts
    ├── src/projections/entity-heads.ts   # proj_entity_heads reference projection
    ├── src/projections/index.ts  # buildProjectionRegistry — single wiring point
    ├── src/engine-context.ts     # EngineContext over a transaction client
    ├── src/ingest/ingest-service.ts      # batch ingest + onEventCommitted hook
    ├── src/routes/events.ts      # POST /v1/events
    ├── src/tools/verify-projections.ts   # rebuild-and-diff CLI
    └── test/                     # Vitest integration tests + helpers + fixtures
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (repo root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the workspace every later task installs into — root scripts `pnpm turbo run build | test | typecheck`; `tsconfig.base.json` that every package extends; workspace globs `packages/*` and `apps/*`.

- [ ] **Step 1: Write the root `package.json`**

```json
{
  "name": "gisik-nokma",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22.0.0 <23"
  },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml` and `turbo.json`**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

`turbo.json` — `test` is uncacheable on purpose: integration tests hit a live Postgres, and a cached green from a different database state would be exactly the kind of stale claim this product exists to refuse:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": ["DATABASE_URL", "TEST_DATABASE_ADMIN_URL"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "cache": false
    }
  }
}
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4: Extend `.gitignore`**

Append these lines to the existing `.gitignore` (keep every existing line):

```
.turbo/
*.tsbuildinfo
coverage/
```

- [ ] **Step 5: Update `README.md` status and add the workspace layout**

In `README.md`, replace the line:

```
**Status: pre-brainstorm.** Nothing about the product is designed yet — not the audience, not the data model, not the stack. The design session starts from `docs/brainstorm-kickoff.md`. What exists here is the base it will start from.
```

with:

```
**Status: building.** The product design spec is approved — `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md`. Implementation follows the plan series in `docs/superpowers/plans/`. What follows below is the base the design started from.
```

Then add this section immediately after the title paragraph (before `## The base`):

```markdown
## Workspace layout

pnpm workspaces + Turborepo (Node 22, TypeScript strict, ESM, Vitest):

- `packages/domain` — shared types and zod schemas: the event envelope, entity kinds, id helpers, the versioned event-type registry.
- `packages/rule-engine` — pure validation, no I/O: `evaluateEvent` returns Accept or a Refusal that names its rule.
- `apps/server` — Fastify server; the append-only Postgres event ledger and its projections; migrations via node-pg-migrate.
- Later plans add `packages/ui`, `packages/sync-client`, `apps/web`, `apps/mobile`, `apps/desktop`.

Dev database: `docker compose up -d` starts Postgres 16 on port 54329. Then `pnpm install` and `pnpm turbo run build test`.
```

- [ ] **Step 6: Install and verify the empty pipeline**

Run: `pnpm install`
Expected: succeeds, creates `pnpm-lock.yaml`, installs `turbo`.

Run: `pnpm turbo run build`
Expected: exits 0 reporting no tasks ran (no packages exist yet — that is correct at this point).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore README.md pnpm-lock.yaml
git commit -m "Scaffold the pnpm/Turborepo workspace: the three-package layout every plan in the series builds inside"
```

---

### Task 2: Domain package — ULID helpers and the event envelope

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/tsconfig.typecheck.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/ids.ts`
- Create: `packages/domain/src/envelope.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/test/ids.test.ts`
- Test: `packages/domain/test/envelope.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` from Task 1.
- Produces (cross-plan API, package `@gisik-nokma/domain`):
  - `ULID_REGEX: RegExp`, `type Ulid`, `type Brand<T, B>`, `newUlid(): Ulid`, `isUlid(value: string): value is Ulid`
  - `ENTITY_KINDS` const tuple, `type EntityKind`, `ORIGINS` const tuple, `type Origin`, `ISO_DATETIME_REGEX: RegExp`
  - `type EventEnvelope` (exact contract shape), `type SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>`
  - `submittedEventSchema`, `eventEnvelopeSchema` (zod)

- [ ] **Step 1: Write the package scaffold**

`packages/domain/package.json`:

```json
{
  "name": "@gisik-nokma/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.typecheck.json"
  },
  "dependencies": {
    "ulidx": "^2.4.1",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

`packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/domain/tsconfig.typecheck.json` (tests are transpiled untyped by Vitest's esbuild, so typechecking them needs this second config):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`packages/domain/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

Run: `pnpm install`
Expected: succeeds, links the new package into the workspace.

- [ ] **Step 2: Write the failing ids test**

`packages/domain/test/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ULID_REGEX, isUlid, newUlid } from '../src/ids.js';

describe('ULID helpers', () => {
  it('newUlid generates 26-char Crockford base32 ids that pass their own regex', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(newUlid()).toMatch(ULID_REGEX);
    }
  });

  it('isUlid accepts a valid literal', () => {
    expect(isUlid('01J60000000000000000000WKA')).toBe(true);
  });

  it('isUlid refuses wrong length, lowercase, and the excluded letters I L O U', () => {
    expect(isUlid('01J60000000000000000000WK')).toBe(false); // 25 chars
    expect(isUlid('01j60000000000000000000wka')).toBe(false); // lowercase
    expect(isUlid('01J6000000000000000000ILOU')).toBe(false); // excluded alphabet
    expect(isUlid('81J60000000000000000000WKA')).toBe(false); // first char > 7 overflows 48-bit time
  });
});
```

- [ ] **Step 3: Run the ids test to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain test`
Expected: FAIL — `Cannot find module '../src/ids.js'` (or equivalent resolve error).

- [ ] **Step 4: Implement `src/ids.ts`**

```ts
import { ulid } from 'ulidx';

declare const brandSymbol: unique symbol;

/** Nominal typing helper: Brand<string, 'Ulid'> is assignable to string, never the reverse. */
export type Brand<T, B extends string> = T & { readonly [brandSymbol]: B };

/** Crockford base32, 26 chars; first char 0-7 because the 48-bit timestamp bounds it. */
export const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export type Ulid = Brand<string, 'Ulid'>;

export function newUlid(): Ulid {
  return ulid() as Ulid;
}

export function isUlid(value: string): value is Ulid {
  return ULID_REGEX.test(value);
}
```

- [ ] **Step 5: Run the ids test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain test`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing envelope test**

`packages/domain/test/envelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import { eventEnvelopeSchema, submittedEventSchema } from '../src/envelope.js';

function validSubmitted(): Record<string, unknown> {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
}

describe('submittedEventSchema', () => {
  it('accepts a well-formed submitted event', () => {
    expect(submittedEventSchema.safeParse(validSubmitted()).success).toBe(true);
  });

  it('accepts an offset clientTime — a claim keeps its stated timezone', () => {
    const event = { ...validSubmitted(), clientTime: '2026-08-20T14:30:00.000+05:30' };
    expect(submittedEventSchema.safeParse(event).success).toBe(true);
  });

  it('planted defect: refuses a non-ULID id', () => {
    const event = { ...validSubmitted(), id: 'not-a-ulid' };
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses an unknown entity kind', () => {
    const event = { ...validSubmitted(), entity: { kind: 'shop', id: newUlid() } };
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses microsecond precision — stored claims must read back byte-identical', () => {
    const event = { ...validSubmitted(), clientTime: '2026-08-20T09:00:00.123456Z' };
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses a clientTime that is not a real datetime', () => {
    const event = { ...validSubmitted(), clientTime: 'yesterday' };
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses a missing actorId — every claim is attributed', () => {
    const event = validSubmitted();
    delete event['actorId'];
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });
});

describe('eventEnvelopeSchema', () => {
  it('additionally requires serverTime and a positive seq', () => {
    const full = { ...validSubmitted(), serverTime: '2026-08-20T09:00:01.000Z', seq: 1 };
    expect(eventEnvelopeSchema.safeParse(full).success).toBe(true);
  });

  it('planted defect: refuses seq 0 — sequences start at 1', () => {
    const full = { ...validSubmitted(), serverTime: '2026-08-20T09:00:01.000Z', seq: 0 };
    expect(eventEnvelopeSchema.safeParse(full).success).toBe(false);
  });
});
```

- [ ] **Step 7: Run the envelope test to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain test`
Expected: FAIL — cannot resolve `../src/envelope.js`.

- [ ] **Step 8: Implement `src/envelope.ts` and `src/index.ts`**

`packages/domain/src/envelope.ts`:

```ts
import { z } from 'zod';
import { ULID_REGEX } from './ids.js';

export const ENTITY_KINDS = ['workspace', 'project', 'ticket', 'workflow', 'ticket-type', 'membership'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ORIGINS = ['web', 'mobile', 'desktop', 'server'] as const;
export type Origin = (typeof ORIGINS)[number];

/**
 * ISO 8601 with whole seconds and AT MOST 3 fractional digits, 'Z' or a numeric
 * offset. Bounding precision at milliseconds keeps every stored claim
 * byte-identical on readback (JS Date and our text storage both survive it).
 */
export const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const isoDatetime = z
  .string()
  .regex(ISO_DATETIME_REGEX, 'must be ISO 8601 with at most millisecond precision')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a real calendar datetime');

const ulidString = z.string().regex(ULID_REGEX, 'must be a ULID');

export type EventEnvelope = {
  id: string;              // ULID, client-generated
  workspaceId: string;
  entity: { kind: EntityKind; id: string };
  type: string;            // 'ticket.transitioned' etc.
  version: number;         // schema version of this event type
  payload: unknown;        // validated per-type by zod schema from packages/domain
  actorId: string;
  origin: Origin;
  clientTime: string;      // ISO 8601 — the actor's claim about when
  serverTime: string;      // ISO 8601 — assigned at ingest
  seq: number;             // per-entity sequence, assigned at ingest
};

/** What a client submits: the envelope minus the two fields the server assigns at ingest. */
export type SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>;

export const submittedEventSchema = z.object({
  id: ulidString,
  workspaceId: ulidString,
  entity: z.object({ kind: z.enum(ENTITY_KINDS), id: ulidString }),
  type: z.string().min(1),
  version: z.number().int().positive(),
  payload: z.unknown(),
  actorId: ulidString,
  origin: z.enum(ORIGINS),
  clientTime: isoDatetime,
});

export const eventEnvelopeSchema = submittedEventSchema.extend({
  serverTime: isoDatetime,
  seq: z.number().int().positive(),
});
```

`packages/domain/src/index.ts`:

```ts
export * from './ids.js';
export * from './envelope.js';
```

- [ ] **Step 9: Run all domain tests and the build**

Run: `pnpm --filter @gisik-nokma/domain test && pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/domain typecheck`
Expected: all tests PASS; `dist/` emitted; typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add packages/domain pnpm-lock.yaml
git commit -m "Domain package: ULID helpers and the exact EventEnvelope contract, with planted-defect tests on every envelope refusal"
```

---

### Task 3: Domain package — event-type registry and parseEvent

**Files:**
- Create: `packages/domain/src/registry.ts`
- Create: `packages/domain/src/vocabulary.ts`
- Create: `packages/domain/src/parse-event.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/registry.test.ts`
- Test: `packages/domain/test/parse-event.test.ts`

**Interfaces:**
- Consumes: `submittedEventSchema`, `SubmittedEvent` from Task 2.
- Produces (cross-plan API):
  - `type EventTypeRegistration = { type: string; version: number; payloadSchema: z.ZodTypeAny }`
  - `type EventTypeRegistry = { register(r: EventTypeRegistration): void; get(type: string, version: number): EventTypeRegistration | undefined; hasType(type: string): boolean }`
  - `createEventTypeRegistry(): EventTypeRegistry`
  - `domainRegistry: EventTypeRegistry` — the shared registry, pre-loaded with the **provisional** seed vocabulary `workspace.created` v1 and `workspace.renamed` v1 (payload `{ name: string }`, strict). Later plans register the full closed vocabulary of spec §3 here.
  - `type EnvelopeErrorCode = 'malformed-envelope' | 'unknown-event-type' | 'unknown-event-version' | 'invalid-payload'`
  - `type ParsedEvent = { ok: true; event: SubmittedEvent }`
  - `type EnvelopeError = { ok: false; code: EnvelopeErrorCode; message: string; eventId: string | null }`
  - `parseEvent(raw: unknown, registry?: EventTypeRegistry): ParsedEvent | EnvelopeError` — pure, no I/O; defaults to `domainRegistry`.

- [ ] **Step 1: Write the failing registry test**

`packages/domain/test/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEventTypeRegistry } from '../src/registry.js';

describe('event-type registry', () => {
  it('registers and retrieves a type at an exact version', () => {
    const registry = createEventTypeRegistry();
    const registration = { type: 'test.happened', version: 1, payloadSchema: z.object({}) };
    registry.register(registration);
    expect(registry.get('test.happened', 1)).toBe(registration);
    expect(registry.hasType('test.happened')).toBe(true);
  });

  it('returns undefined for an unregistered version of a known type', () => {
    const registry = createEventTypeRegistry();
    registry.register({ type: 'test.happened', version: 1, payloadSchema: z.object({}) });
    expect(registry.get('test.happened', 2)).toBeUndefined();
  });

  it('planted defect: refuses double registration of the same type@version', () => {
    const registry = createEventTypeRegistry();
    registry.register({ type: 'test.happened', version: 1, payloadSchema: z.object({}) });
    expect(() =>
      registry.register({ type: 'test.happened', version: 1, payloadSchema: z.object({}) }),
    ).toThrowError('event type already registered: test.happened@1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain test`
Expected: FAIL — cannot resolve `../src/registry.js`.

- [ ] **Step 3: Implement `src/registry.ts` and `src/vocabulary.ts`**

`packages/domain/src/registry.ts`:

```ts
import type { z } from 'zod';

export type EventTypeRegistration = {
  type: string;              // e.g. 'workspace.created'
  version: number;           // e.g. 1
  payloadSchema: z.ZodTypeAny;
};

export type EventTypeRegistry = {
  register(registration: EventTypeRegistration): void;
  get(type: string, version: number): EventTypeRegistration | undefined;
  hasType(type: string): boolean;
};

export function createEventTypeRegistry(): EventTypeRegistry {
  const byKey = new Map<string, EventTypeRegistration>();
  const types = new Set<string>();
  return {
    register(registration) {
      const key = `${registration.type}@${registration.version}`;
      if (byKey.has(key)) {
        throw new Error(`event type already registered: ${key}`);
      }
      byKey.set(key, registration);
      types.add(registration.type);
    },
    get(type, version) {
      return byKey.get(`${type}@${version}`);
    },
    hasType(type) {
      return types.has(type);
    },
  };
}
```

`packages/domain/src/vocabulary.ts`:

```ts
import { z } from 'zod';
import { createEventTypeRegistry } from './registry.js';

/**
 * The shared event-type registry. The two seed types below are PROVISIONAL:
 * they exist so the ledger, projections, and fixtures have something real to
 * carry in Plan 1. Later plans own the full closed vocabulary of spec §3
 * ('ticket.created', 'ticket.transitioned', 'workflow.defined', …) and may
 * revise these payloads before any production data exists.
 */
export const domainRegistry = createEventTypeRegistry();

domainRegistry.register({
  type: 'workspace.created',
  version: 1,
  payloadSchema: z.object({ name: z.string().min(1) }).strict(),
});

domainRegistry.register({
  type: 'workspace.renamed',
  version: 1,
  payloadSchema: z.object({ name: z.string().min(1) }).strict(),
});
```

- [ ] **Step 4: Run the registry test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain test`
Expected: registry tests PASS (envelope/ids suites still green).

- [ ] **Step 5: Write the failing parseEvent test**

`packages/domain/test/parse-event.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import { parseEvent } from '../src/parse-event.js';

function rawWorkspaceCreated(): Record<string, unknown> {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
}

describe('parseEvent', () => {
  it('accepts a valid workspace.created and returns the typed submitted event', () => {
    const raw = rawWorkspaceCreated();
    const result = parseEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe('workspace.created');
      expect(result.event.payload).toEqual({ name: 'Convenience Corner' });
    }
  });

  it('planted defect: refuses an unknown event type, naming it', () => {
    const raw = { ...rawWorkspaceCreated(), type: 'shop.opened' };
    const result = parseEvent(raw);
    expect(result).toMatchObject({
      ok: false,
      code: 'unknown-event-type',
      eventId: raw['id'],
    });
    if (!result.ok) {
      expect(result.message).toContain("shop.opened");
    }
  });

  it('planted defect: refuses a known type at an unknown version', () => {
    const raw = { ...rawWorkspaceCreated(), version: 2 };
    const result = parseEvent(raw);
    expect(result).toMatchObject({ ok: false, code: 'unknown-event-version' });
    if (!result.ok) {
      expect(result.message).toContain('workspace.created');
      expect(result.message).toContain('2');
    }
  });

  it('planted defect: refuses a payload missing its required field', () => {
    const raw = { ...rawWorkspaceCreated(), payload: {} };
    const result = parseEvent(raw);
    expect(result).toMatchObject({ ok: false, code: 'invalid-payload' });
    if (!result.ok) {
      expect(result.message).toContain('name');
    }
  });

  it('planted defect: refuses a payload smuggling extra keys (strict schemas)', () => {
    const raw = { ...rawWorkspaceCreated(), payload: { name: 'CC', sneaky: true } };
    const result = parseEvent(raw);
    expect(result).toMatchObject({ ok: false, code: 'invalid-payload' });
  });

  it('planted defect: refuses a non-object with a null eventId', () => {
    const result = parseEvent(42);
    expect(result).toMatchObject({ ok: false, code: 'malformed-envelope', eventId: null });
  });

  it('echoes a readable claimed id even when the envelope is malformed', () => {
    const raw = { ...rawWorkspaceCreated(), origin: 'carrier-pigeon' };
    const result = parseEvent(raw);
    expect(result).toMatchObject({ ok: false, code: 'malformed-envelope', eventId: raw['id'] });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain test`
Expected: FAIL — cannot resolve `../src/parse-event.js`.

- [ ] **Step 7: Implement `src/parse-event.ts` and export everything**

`packages/domain/src/parse-event.ts`:

```ts
import { submittedEventSchema, type SubmittedEvent } from './envelope.js';
import type { EventTypeRegistry } from './registry.js';
import { domainRegistry } from './vocabulary.js';

export type EnvelopeErrorCode =
  | 'malformed-envelope'
  | 'unknown-event-type'
  | 'unknown-event-version'
  | 'invalid-payload';

export type ParsedEvent = { ok: true; event: SubmittedEvent };

export type EnvelopeError = {
  ok: false;
  code: EnvelopeErrorCode;
  message: string;          // plain language, safe to show the submitting user
  eventId: string | null;   // the claimed id, when one was readable
};

/**
 * Pure gatekeeper for the ledger: validates envelope shape, event-type
 * registration, version, and payload. No I/O — callable identically on
 * client and server (spec §1 invariant 2). An EnvelopeError is NOT a rule
 * refusal: it means the submission is not a well-formed claim at all.
 */
export function parseEvent(
  raw: unknown,
  registry: EventTypeRegistry = domainRegistry,
): ParsedEvent | EnvelopeError {
  const claimedId = extractClaimedId(raw);

  const envelope = submittedEventSchema.safeParse(raw);
  if (!envelope.success) {
    const issue = envelope.error.issues[0];
    const at = issue !== undefined && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    return {
      ok: false,
      code: 'malformed-envelope',
      message: `event envelope is malformed${at}: ${issue?.message ?? 'invalid'}`,
      eventId: claimedId,
    };
  }

  const { type, version } = envelope.data;
  if (!registry.hasType(type)) {
    return {
      ok: false,
      code: 'unknown-event-type',
      message: `unknown event type '${type}' — the ledger accepts only what it can later replay`,
      eventId: envelope.data.id,
    };
  }

  const registration = registry.get(type, version);
  if (registration === undefined) {
    return {
      ok: false,
      code: 'unknown-event-version',
      message: `unknown version ${version} of event type '${type}'`,
      eventId: envelope.data.id,
    };
  }

  const payload = registration.payloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    const issue = payload.error.issues[0];
    const at = issue !== undefined && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    return {
      ok: false,
      code: 'invalid-payload',
      message: `payload for '${type}' v${version} is invalid${at}: ${issue?.message ?? 'invalid'}`,
      eventId: envelope.data.id,
    };
  }

  const event: SubmittedEvent = { ...envelope.data, payload: payload.data as unknown };
  return { ok: true, event };
}

function extractClaimedId(raw: unknown): string | null {
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === 'string') {
      return id;
    }
  }
  return null;
}
```

Replace the full contents of `packages/domain/src/index.ts` with:

```ts
export * from './ids.js';
export * from './envelope.js';
export * from './registry.js';
export * from './vocabulary.js';
export * from './parse-event.js';
```

- [ ] **Step 8: Run all domain tests, build, typecheck**

Run: `pnpm --filter @gisik-nokma/domain test && pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/domain typecheck`
Expected: all PASS, build and typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add packages/domain
git commit -m "parseEvent and the versioned event-type registry: unknown types, unknown versions, and invalid payloads are refused at the door, each proven by a planted defect"
```

---

### Task 4: State types and the rule-engine package (pass-through)

**Files:**
- Create: `packages/domain/src/state.ts`
- Create: `packages/domain/src/provisional.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/rule-engine/package.json`
- Create: `packages/rule-engine/tsconfig.json`
- Create: `packages/rule-engine/tsconfig.typecheck.json`
- Create: `packages/rule-engine/vitest.config.ts`
- Create: `packages/rule-engine/src/engine.ts`
- Create: `packages/rule-engine/src/index.ts`
- Test: `packages/rule-engine/test/engine.test.ts`

**Interfaces:**
- Consumes: `EventEnvelope`, `EntityKind` from `@gisik-nokma/domain` (Tasks 2-3).
- Produces (cross-plan API):
  - In `@gisik-nokma/domain`: `type EntityHead = { kind: EntityKind; id: string; headSeq: number; headEventId: string; headEventType: string }` (the head pointer — `proj_entity_heads`' natural product; named `EntityHead`, not `EntityState`, because the coordination doc §4 reserves `EntityState` for Plan 2's discriminated union). `TicketState`, `WorkflowDef`, `WorkflowState`, and `StateCategory` are defined authoritatively in Plan 2's domain tasks; until Plan 2 lands, `provisional.ts` ships PROVISIONAL, contract-exact stubs of them (plus `FieldClaim`, `MembershipState`, `OtherEntityState`, and the `EntityState` union) so `@gisik-nokma/rule-engine` typechecks — Plan 2 Task 2 replaces the file, byte-compatible with the coordination doc.
  - In package `@gisik-nokma/rule-engine`: `type Refusal = { refused: true; rule: string; reason: string }`; `type Accept = { refused: false }`; `type Verdict = Accept | Refusal`; `type EngineContext` (exact contract shape); `evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal>` — pass-through in Plan 1; **Plan 2 replaces the internals, never the signature**.

- [ ] **Step 1: Add the state types to the domain package**

`packages/domain/src/state.ts`:

```ts
import type { EntityKind } from './envelope.js';

/**
 * The head pointer for an entity — exactly what proj_entity_heads materialises.
 * Named EntityHead, not EntityState: the coordination doc (§4) reserves
 * EntityState for Plan 2's discriminated union of per-kind entity states.
 */
export type EntityHead = {
  kind: EntityKind;
  id: string;
  headSeq: number;        // seq of the newest committed event for this entity
  headEventId: string;
  headEventType: string;
};

// TicketState, WorkflowDef, WorkflowState, and StateCategory live in
// ./provisional.ts as PROVISIONAL stubs until Plan 2's domain tasks land
// the authoritative definitions (coordination doc §4).
```

`packages/domain/src/provisional.ts` — the contract-exact stubs the rule-engine package needs to typecheck before Plan 2 lands. No Plan-1 code reads any field of these; they exist so `EngineContext`'s signatures are real types, not `unknown`:

```ts
/**
 * PROVISIONAL — Plan 2 Task 2 replaces this file with the authoritative
 * definitions; shapes must stay byte-compatible with the coordination doc.
 */

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type StateCategory = 'open' | 'active' | 'terminal';

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type WorkflowState = {
  id: string;
  name: string;
  category: StateCategory;
  blocked?: boolean; // amendment 9: the attention strip's "blocked" bucket reads this
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type WorkflowDef = {
  id: string;
  version: number;
  name: string;
  initialStateId: string;
  states: WorkflowState[];
  transitions: { from: '*' | string; to: string; rules: unknown[] }[];
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type TicketState = {
  kind: 'ticket';
  id: string;
  workspaceId: string;
  projectId: string;
  typeId: string;
  parentId: string | null;
  workflowId: string;
  workflowVersion: number;
  stateId: string;
  stateCategory: StateCategory;
  assigneeId: string | null;
  collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number }[];
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type MembershipState = {
  kind: 'membership';
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type OtherEntityState = {
  kind: 'workspace' | 'project' | 'workflow' | 'ticket-type';
  id: string;
};

/** PROVISIONAL — replaced by Plan 2 Task 2; see file header. */
export type EntityState = TicketState | MembershipState | OtherEntityState;
```

Replace the full contents of `packages/domain/src/index.ts` with:

```ts
export * from './ids.js';
export * from './envelope.js';
export * from './registry.js';
export * from './vocabulary.js';
export * from './parse-event.js';
export * from './state.js';
export * from './provisional.js';
```

Run: `pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/domain typecheck`
Expected: clean.

- [ ] **Step 2: Scaffold the rule-engine package**

`packages/rule-engine/package.json`:

```json
{
  "name": "@gisik-nokma/rule-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.typecheck.json"
  },
  "dependencies": {
    "@gisik-nokma/domain": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

`packages/rule-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/rule-engine/tsconfig.typecheck.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`packages/rule-engine/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

Run: `pnpm install`
Expected: links `@gisik-nokma/domain` into the new package.

- [ ] **Step 3: Write the failing engine test**

`packages/rule-engine/test/engine.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent, type EngineContext, type Refusal, type Verdict } from '../src/engine.js';

function envelope(): EventEnvelope {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'server',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq: 1,
  };
}

function spyContext(): { ctx: EngineContext; calls: () => number } {
  const getEntityState = vi.fn(async () => null);
  const getChildrenStates = vi.fn(async () => []);
  const getWorkflowDef = vi.fn(async () => null);
  return {
    ctx: { getEntityState, getChildrenStates, getWorkflowDef },
    calls: () =>
      getEntityState.mock.calls.length +
      getChildrenStates.mock.calls.length +
      getWorkflowDef.mock.calls.length,
  };
}

describe('evaluateEvent (Plan 1 pass-through)', () => {
  it('accepts every parsed event', async () => {
    const { ctx } = spyContext();
    await expect(evaluateEvent(envelope(), ctx)).resolves.toEqual({ refused: false });
  });

  it('consults nothing — the pass-through must not fake judgement it does not have', async () => {
    const { ctx, calls } = spyContext();
    await evaluateEvent(envelope(), ctx);
    expect(calls()).toBe(0);
  });

  it('a refusal names its rule and gives a plain-language reason', () => {
    const refusal: Refusal = {
      refused: true,
      rule: 'require-comment',
      reason: 'This transition requires a comment (rule require-comment).',
    };
    const verdict: Verdict = refusal;
    if (verdict.refused) {
      expect(verdict.rule).toBe('require-comment');
      expect(verdict.reason).toContain('require-comment');
    } else {
      expect.unreachable('verdict must be a refusal');
    }
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/rule-engine`
Expected: FAIL — cannot resolve `../src/engine.js`. (Turbo builds `@gisik-nokma/domain` first via `dependsOn ^build`.)

- [ ] **Step 5: Implement the engine**

`packages/rule-engine/src/engine.ts`:

```ts
import type { EntityState, EventEnvelope, TicketState, WorkflowDef } from '@gisik-nokma/domain';

export type Refusal = { refused: true; rule: string; reason: string }; // reason: plain language, names the rule
export type Accept = { refused: false };
export type Verdict = Accept | Refusal;

export type EngineContext = {
  getEntityState(kind: EventEnvelope['entity']['kind'], id: string): Promise<EntityState | null>;
  getChildrenStates(ticketId: string): Promise<TicketState[]>;
  getWorkflowDef(workflowId: string, version?: number): Promise<WorkflowDef | null>;
};

/**
 * Plan 1 pass-through: accepts every parsed event and consults nothing.
 * Plan 2 replaces these internals with real rule evaluation (pure, no I/O —
 * all state arrives through ctx). The signature is cross-plan contract:
 * it must not change.
 */
export async function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  void env;
  void ctx;
  return { refused: false };
}
```

`packages/rule-engine/src/index.ts`:

```ts
export * from './engine.js';
```

- [ ] **Step 6: Run tests, build, typecheck**

Run: `pnpm turbo run test typecheck --filter=@gisik-nokma/rule-engine`
Expected: PASS and clean — clean because `provisional.ts` (Step 1) supplies the `EntityState`/`TicketState`/`WorkflowDef` shapes `engine.ts` imports; without the stubs this plan alone could not build.

- [ ] **Step 7: Commit**

```bash
git add packages/rule-engine packages/domain pnpm-lock.yaml
git commit -m "Rule-engine package boundary: the exact Accept/Refusal interface Plan 2 fills, plus the state types its context names — pass-through proven to consult nothing"
```

---

### Task 5: Server skeleton — config, pool, Fastify app, health endpoint

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/tsconfig.typecheck.json`
- Create: `apps/server/vitest.config.ts`
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/db.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`
- Test: `apps/server/test/config.test.ts`
- Test: `apps/server/test/app.test.ts`

**Interfaces:**
- Consumes: workspace scaffold (Task 1); `@gisik-nokma/domain`, `@gisik-nokma/rule-engine` as dependencies.
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): AppConfig` where `type AppConfig = { databaseUrl: string; port: number; host: string; logLevel: 'fatal'|'error'|'warn'|'info'|'debug'|'trace' }`; throws `ConfigError` naming the offending variable(s).
  - `createPool(databaseUrl: string): Pool` (installs the int8→number parser).
  - `type HealthDb = { query(sql: string): Promise<unknown> }`; `type AppDeps = { db: HealthDb }` (**Task 11 extends this to `{ db: HealthDb; ingest: IngestService }` — that is the final shape**); `buildApp(deps: AppDeps, options?: { logLevel?: string }): FastifyInstance` with `GET /healthz`.
  - Env contract: `DATABASE_URL` (required), `PORT` (default 3000), `HOST` (default 127.0.0.1), `LOG_LEVEL` (default info).

- [ ] **Step 1: Scaffold the server package**

`apps/server/package.json`:

```json
{
  "name": "@gisik-nokma/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.typecheck.json",
    "dev": "tsx src/index.ts",
    "migrate": "node-pg-migrate up --migrations-dir migrations",
    "verify:projections": "tsx src/tools/verify-projections.ts"
  },
  "dependencies": {
    "@gisik-nokma/domain": "workspace:*",
    "@gisik-nokma/rule-engine": "workspace:*",
    "fastify": "^5.3.0",
    "pg": "^8.13.0",
    "ulidx": "^2.4.1",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/pg": "^8.11.0",
    "node-pg-migrate": "^7.9.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

(`migrate` and `verify:projections` point at files Tasks 6 and 12 create; the scripts are inert until then.)

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

`apps/server/tsconfig.typecheck.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`apps/server/vitest.config.ts` (integration tests create real databases; give them room):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

Run: `pnpm install`
Expected: succeeds, links workspace packages.

- [ ] **Step 2: Write the failing config test**

`apps/server/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const VALID_ENV = {
  DATABASE_URL: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
};

describe('loadConfig', () => {
  it('reads DATABASE_URL and applies defaults for the rest', () => {
    const config = loadConfig(VALID_ENV);
    expect(config).toEqual({
      databaseUrl: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
      port: 3000,
      host: '127.0.0.1',
      logLevel: 'info',
    });
  });

  it('honours explicit PORT, HOST, LOG_LEVEL', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '8080', HOST: '0.0.0.0', LOG_LEVEL: 'debug' });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('debug');
  });

  it('planted defect: a missing DATABASE_URL is refused with the variable named', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('planted defect: a non-numeric PORT is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' })).toThrowError(/PORT/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/config.js`.

- [ ] **Step 4: Implement `src/config.ts` and `src/db.ts`**

`apps/server/src/config.ts`:

```ts
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
};

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string>): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new ConfigError(`invalid server configuration — check: ${variables}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
  };
}
```

`apps/server/src/db.ts`:

```ts
import pg from 'pg';
import type { Pool } from 'pg';

// Postgres int8 (OID 20) arrives as a string by default. Sequence numbers stay
// far below Number.MAX_SAFE_INTEGER (2^53), so parse to number once, globally.
// Every pool in app and tests must come through createPool so this holds.
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));

export function createPool(databaseUrl: string): Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}
```

- [ ] **Step 5: Run the config test to verify it passes**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: config tests PASS (app tests do not exist yet).

- [ ] **Step 6: Write the failing app test**

`apps/server/test/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const healthyDb = { query: async () => [{ ok: 1 }] };
const brokenDb = {
  query: async () => {
    throw new Error('connection refused');
  },
};

describe('GET /healthz', () => {
  it('answers ok when the database responds', async () => {
    const app = buildApp({ db: healthyDb });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('planted defect: answers 503 unavailable when the database is down — never a fake ok', async () => {
    const app = buildApp({ db: brokenDb });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    await app.close();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/app.js`.

- [ ] **Step 8: Implement `src/app.ts` and `src/index.ts`**

`apps/server/src/app.ts`:

```ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export type HealthDb = { query(sql: string): Promise<unknown> };

export type AppDeps = {
  db: HealthDb;
};

export function buildApp(deps: AppDeps, options: { logLevel?: string } = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logLevel === undefined ? false : { level: options.logLevel },
  });

  app.get('/healthz', async (_request, reply) => {
    try {
      await deps.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  return app;
}
```

`apps/server/src/index.ts`:

```ts
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);
  const app = buildApp({ db: pool }, { logLevel: config.logLevel });
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 9: Run tests, build, typecheck**

Run: `pnpm turbo run test typecheck --filter=@gisik-nokma/server`
Expected: PASS and clean.

- [ ] **Step 10: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "Server skeleton: env config that refuses to boot half-configured, a pool with honest int8 parsing, and a health endpoint that never fakes ok"
```

---

### Task 6: Postgres infrastructure — compose, first migration, test-database helper

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `apps/server/migrations/<timestamp>_events-and-snapshots.sql` (filename generated by node-pg-migrate in Step 2)
- Create: `apps/server/test/helpers/db.ts`
- Test: `apps/server/test/migrations.test.ts`

**Interfaces:**
- Consumes: `createPool` from Task 5.
- Produces:
  - `events` table (append-only): columns `id text PK`, `workspace_id text`, `entity_kind text`, `entity_id text`, `type text`, `version integer`, `payload jsonb`, `actor_id text`, `origin text`, `client_time text` (claim verbatim), `server_time timestamptz`, `seq bigint`, `workspace_seq bigint` (the workspace stream cursor, coordination §18); constraint `events_entity_seq_unique UNIQUE (entity_kind, entity_id, seq)` (doubles as the per-entity replay index); constraint `events_workspace_seq_unique UNIQUE (workspace_id, workspace_seq)` (doubles as the `(workspace_id, workspace_seq)` range index the stream reads resume through); index `events_workspace_server_time_idx (workspace_id, server_time)`; trigger `events_no_update_no_delete` + `events_no_truncate` raising `events is append-only`.
  - `snapshots` table: `entity_kind text`, `entity_id text`, `seq bigint`, `state jsonb`, `created_at timestamptz default now()`, PK `(entity_kind, entity_id, seq)`.
  - Test helper `createTestDatabase(): Promise<TestDatabase>` where `type TestDatabase = { pool: Pool; url: string; drop(): Promise<void> }` — creates a uniquely named database, runs all migrations, returns a parser-correct pool. Admin URL from `TEST_DATABASE_ADMIN_URL`, default `postgres://gisik:gisik@localhost:54329/postgres`.
  - Dev database: `docker compose up -d` → Postgres 16 on port 54329, user/password `gisik`/`gisik`, database `gisik_nokma`.

- [ ] **Step 1: Write `docker-compose.yml` and start Postgres**

`docker-compose.yml` (repo root):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: gisik
      POSTGRES_PASSWORD: gisik
      POSTGRES_DB: gisik_nokma
    ports:
      - "54329:5432"
```

Run: `docker compose up -d && until docker compose exec postgres pg_isready -U gisik >/dev/null 2>&1; do sleep 0.5; done && echo ready`
Expected: `ready`.

- [ ] **Step 2: Generate the migration file, then replace its contents**

Run: `pnpm --filter @gisik-nokma/server exec node-pg-migrate create events-and-snapshots --migration-file-language sql --migrations-dir migrations`
Expected: creates `apps/server/migrations/<timestamp>_events-and-snapshots.sql`. The generator owns the filename and any marker-comment format.

The generated file contains an "Up" marker comment and a "Down" marker comment. Put this SQL under the Up marker and the Down SQL under the Down marker, deleting any placeholder content. (If the generated file has no marker comments, the whole file runs as Up — in that case use only the Up SQL and omit the Down section.)

Up SQL:

```sql
CREATE TABLE events (
  id           text PRIMARY KEY,
  workspace_id text NOT NULL,
  entity_kind  text NOT NULL,
  entity_id    text NOT NULL,
  type         text NOT NULL,
  version      integer NOT NULL,
  payload      jsonb NOT NULL,
  actor_id     text NOT NULL,
  origin       text NOT NULL,
  client_time  text NOT NULL,
  server_time  timestamptz NOT NULL,
  seq          bigint NOT NULL,
  workspace_seq bigint NOT NULL,
  CONSTRAINT events_entity_seq_unique UNIQUE (entity_kind, entity_id, seq),
  CONSTRAINT events_workspace_seq_unique UNIQUE (workspace_id, workspace_seq)
);

COMMENT ON TABLE events IS 'Append-only ledger: every row is an immutable, attributed claim.';
COMMENT ON COLUMN events.client_time IS 'The actor''s claim about when — stored verbatim, offset preserved.';
COMMENT ON COLUMN events.server_time IS 'The system''s fact about when — assigned at ingest.';
COMMENT ON COLUMN events.seq IS 'Per-entity sequence: entity history, replay, snapshots.';
COMMENT ON COLUMN events.workspace_seq IS 'Per-workspace stream cursor (coordination §18): the only order a workspace stream may resume by. Its unique index doubles as the (workspace_id, workspace_seq) range index those resumes scan.';

CREATE INDEX events_workspace_server_time_idx ON events (workspace_id, server_time);

CREATE FUNCTION events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_no_update_no_delete
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_append_only();

CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION events_append_only();

CREATE TABLE snapshots (
  entity_kind text NOT NULL,
  entity_id   text NOT NULL,
  seq         bigint NOT NULL,
  state       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_id, seq)
);

COMMENT ON TABLE snapshots IS 'Bounds per-entity replay: state as of seq. Written by a later plan; created here so the ledger schema is complete.';
```

Down SQL:

```sql
DROP TABLE snapshots;
DROP TRIGGER events_no_truncate ON events;
DROP TRIGGER events_no_update_no_delete ON events;
DROP FUNCTION events_append_only();
DROP TABLE events;
```

- [ ] **Step 3: Write the failing migrations test (helper does not exist yet)**

`apps/server/test/migrations.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function insertEventSql(id: string, seq: number, workspaceSeq = seq): { text: string; values: unknown[] } {
  return {
    text: `INSERT INTO events
             (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    values: [
      id,
      '01J60000000000000000000WKA',
      'workspace',
      '01J60000000000000000000WKA',
      'workspace.created',
      1,
      JSON.stringify({ name: 'Convenience Corner' }),
      '01J6000000000000000000ACTR',
      'server',
      '2026-08-20T14:30:00.000+05:30',
      '2026-08-20T09:00:00.000Z',
      seq,
      workspaceSeq,
    ],
  };
}

describe('events and snapshots schema', () => {
  it('migrations create events, snapshots, and the pgmigrations bookkeeping table', async () => {
    const result = await db.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const names = result.rows.map((row: { table_name: string }) => row.table_name);
    expect(names).toContain('events');
    expect(names).toContain('snapshots');
    expect(names).toContain('pgmigrations');
  });

  it('a stored claim reads back exactly: jsonb payload, verbatim client_time with its offset, both seqs as numbers', async () => {
    const query = insertEventSql('01J6000000000000000000TT01', 1);
    await db.pool.query(query.text, query.values);
    const read = await db.pool.query(
      'SELECT payload, client_time, seq, workspace_seq FROM events WHERE id = $1',
      ['01J6000000000000000000TT01'],
    );
    expect(read.rows[0]).toEqual({
      payload: { name: 'Convenience Corner' },
      client_time: '2026-08-20T14:30:00.000+05:30',
      seq: 1,
      workspace_seq: 1,
    });
  });

  it('planted defect: a duplicate (entity_kind, entity_id, seq) violates events_entity_seq_unique', async () => {
    // workspace_seq 99 is free, so the entity constraint is the one that fires.
    const query = insertEventSql('01J6000000000000000000TT02', 1, 99);
    await expect(db.pool.query(query.text, query.values)).rejects.toMatchObject({
      code: '23505',
      constraint: 'events_entity_seq_unique',
    });
  });

  it('planted defect: a duplicate (workspace_id, workspace_seq) violates events_workspace_seq_unique — the stream cursor cannot fork', async () => {
    // A different entity in the same workspace, reusing workspace_seq 1: the
    // per-entity constraint is satisfied, and the workspace constraint refuses.
    const query = insertEventSql('01J6000000000000000000TT03', 1, 1);
    query.values[2] = 'project';
    query.values[3] = '01J60000000000000000000PRA';
    await expect(db.pool.query(query.text, query.values)).rejects.toMatchObject({
      code: '23505',
      constraint: 'events_workspace_seq_unique',
    });
  });

  it('planted defect: UPDATE on events is refused — the ledger cannot be rewritten', async () => {
    await expect(
      db.pool.query(`UPDATE events SET payload = '{}' WHERE id = $1`, ['01J6000000000000000000TT01']),
    ).rejects.toThrowError(/events is append-only/);
  });

  it('planted defect: DELETE on events is refused', async () => {
    await expect(
      db.pool.query('DELETE FROM events WHERE id = $1', ['01J6000000000000000000TT01']),
    ).rejects.toThrowError(/events is append-only/);
  });

  it('planted defect: TRUNCATE on events is refused', async () => {
    await expect(db.pool.query('TRUNCATE events')).rejects.toThrowError(/events is append-only/);
  });

  it('snapshots stores state keyed by (entity_kind, entity_id, seq)', async () => {
    await db.pool.query(
      'INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ($1, $2, $3, $4)',
      ['workspace', '01J60000000000000000000WKA', 1, JSON.stringify({ name: 'Convenience Corner' })],
    );
    const read = await db.pool.query(
      'SELECT seq, state FROM snapshots WHERE entity_kind = $1 AND entity_id = $2',
      ['workspace', '01J60000000000000000000WKA'],
    );
    expect(read.rows).toEqual([{ seq: 1, state: { name: 'Convenience Corner' } }]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `./helpers/db.js`.

- [ ] **Step 5: Implement the test-database helper**

`apps/server/test/helpers/db.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Pool } from 'pg';
import runner from 'node-pg-migrate';
import { createPool } from '../../src/db.js';

const ADMIN_URL =
  process.env['TEST_DATABASE_ADMIN_URL'] ?? 'postgres://gisik:gisik@localhost:54329/postgres';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

export type TestDatabase = {
  pool: Pool;
  url: string;
  drop(): Promise<void>;
};

/**
 * Creates a uniquely named database, runs every migration, and returns a pool
 * built via createPool (so the int8 parser is installed). Each test file gets
 * its own database — files can run in parallel without sharing state.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `gisik_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  await runner({
    databaseUrl: url,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  const pool = createPool(url);
  return {
    pool,
    url,
    async drop() {
      await pool.end();
      const cleaner = new pg.Client({ connectionString: ADMIN_URL });
      await cleaner.connect();
      await cleaner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleaner.end();
    },
  };
}
```

If the `runner` default import fails at runtime with an ESM/default-export error, replace the import and call with a CLI spawn — this is the sanctioned fallback, not an improvisation:

```ts
import { execFileSync } from 'node:child_process';
// in place of the runner(...) call:
execFileSync('pnpm', ['exec', 'node-pg-migrate', 'up', '--migrations-dir', MIGRATIONS_DIR], {
  env: { ...process.env, DATABASE_URL: url },
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
});
```

- [ ] **Step 6: Run the migrations test to verify it passes**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: PASS — schema exists, the roundtrip is exact, and all five planted defects (duplicate entity seq, duplicate workspace_seq, UPDATE, DELETE, TRUNCATE) are refused. This proves the append-only floor before anything is built on it.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml apps/server/migrations apps/server/test
git commit -m "The append-only ledger schema: events cannot be updated, deleted, or truncated, per-entity seq is unique, the workspace stream cursor cannot fork, and a claim's client_time survives storage byte-for-byte"
```

---

### Task 7: Ledger stores — sequenced append and canonical reads

**Files:**
- Create: `apps/server/src/ledger/event-store.ts`
- Create: `apps/server/src/ledger/snapshot-store.ts`
- Create: `apps/server/test/helpers/events.ts`
- Test: `apps/server/test/event-store.test.ts`
- Test: `apps/server/test/snapshot-store.test.ts`

**Interfaces:**
- Consumes: `EventEnvelope`, `SubmittedEvent`, `EntityKind`, `newUlid` from `@gisik-nokma/domain`; `createTestDatabase` from Task 6.
- Produces (later plans call these):
  - `lockEntity(client: PoolClient, kind: EntityKind, id: string): Promise<void>` — advisory xact lock serialising all seq assignment for one entity; released at COMMIT/ROLLBACK.
  - `nextSeq(client: PoolClient, kind: EntityKind, id: string): Promise<number>` — max(seq)+1, starts at 1; only meaningful after `lockEntity` in the same transaction.
  - `lockWorkspace(client: PoolClient, workspaceId: string): Promise<void>` — advisory xact lock serialising all `workspace_seq` assignment for one workspace (coordination §18). Its key namespace is deliberately disjoint from `lockEntity`'s, so a workspace-entity lock and a workspace-stream lock never collide.
  - `nextWorkspaceSeq(client: PoolClient, workspaceId: string): Promise<number>` — max(workspace_seq)+1 for the workspace, starts at 1; only meaningful after `lockWorkspace` in the same transaction.
  - **Lock order is always workspace first, then entity — one global order across the whole server, so two ingests can never deadlock by taking the pair in opposite orders.**
  - `type LedgerEvent = EventEnvelope & { workspaceSeq: number }` — what the ledger actually stores: the contract-frozen domain envelope plus the server-assigned stream cursor. The domain `EventEnvelope` does NOT gain the field (see Open questions); only server-side code sees `LedgerEvent`.
  - `insertEvent(client: PoolClient, event: LedgerEvent): Promise<void>`
  - `readEntityEvents(client: PoolClient | Pool, kind: EntityKind, id: string, afterSeq?: number): Promise<LedgerEvent[]>` — per-entity seq order (entity history; a *workspace* stream resumes by `workspace_seq` instead — Plan 4's `visibleEventsFor`).
  - `readLedger(client: PoolClient | Pool): Promise<LedgerEvent[]>` — the CANONICAL REPLAY ORDER (`entity_kind, entity_id, seq`), unchanged by the workspace cursor.
  - `rowToEnvelope(row: EventRow): LedgerEvent` and `type EventRow` (snake_case row shape) — readers emit the optional, server-enriched `workspaceSeq` alongside the frozen envelope fields.
  - `isUniqueViolation(error: unknown, constraint: string): boolean`
  - `type Snapshot = { entityKind: EntityKind; entityId: string; seq: number; state: Record<string, unknown> }`; `writeSnapshot(client, snapshot)`; `readLatestSnapshot(client, kind, id): Promise<Snapshot | null>` — no caller writes snapshots in Plan 1; the repo exists so the plan that introduces replayed entity state has the bounded-replay primitive ready.
  - Test helper: `submittedWorkspaceCreated(overrides?: Partial<SubmittedEvent>): SubmittedEvent` and `committed(submitted: SubmittedEvent, seq: number, serverTime?: string, workspaceSeq?: number): LedgerEvent` (`workspaceSeq` defaults to `seq` — in these fixtures the entity IS the workspace, so the two counters coincide; tests that need them to diverge pass it explicitly).

- [ ] **Step 1: Write the shared event test helper**

`apps/server/test/helpers/events.ts`:

```ts
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../../src/ledger/event-store.js';

/** A valid workspace.created submission; each call invents a fresh workspace. */
export function submittedWorkspaceCreated(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * Completes a submission into a full ledger event the way ingest would.
 * `workspaceSeq` defaults to `seq`: these fixtures are workspace entities, so
 * the per-entity and per-workspace counters coincide. Tests that need them to
 * diverge — a second entity in the same workspace, or a deliberate collision —
 * pass it explicitly.
 */
export function committed(
  submitted: SubmittedEvent,
  seq: number,
  serverTime = '2026-08-20T09:00:01.000Z',
  workspaceSeq = seq,
): LedgerEvent {
  return { ...submitted, serverTime, seq, workspaceSeq };
}
```

- [ ] **Step 2: Write the failing event-store test**

`apps/server/test/event-store.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import {
  insertEvent,
  isUniqueViolation,
  lockEntity,
  lockWorkspace,
  nextSeq,
  nextWorkspaceSeq,
  readEntityEvents,
  readLedger,
} from '../src/ledger/event-store.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { committed, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('event store', () => {
  it('seq starts at 1 and increments per entity', async () => {
    const first = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await lockEntity(client, 'workspace', first.entity.id);
      const seq1 = await nextSeq(client, 'workspace', first.entity.id);
      expect(seq1).toBe(1);
      await insertEvent(client, committed(first, seq1));
      await client.query('COMMIT');

      await client.query('BEGIN');
      await lockEntity(client, 'workspace', first.entity.id);
      const seq2 = await nextSeq(client, 'workspace', first.entity.id);
      expect(seq2).toBe(2);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('two concurrent appends to one entity serialise to consecutive seqs, no violation', async () => {
    const base = submittedWorkspaceCreated();
    const append = async (eventId: string): Promise<number> => {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await lockEntity(client, 'workspace', base.entity.id);
        const seq = await nextSeq(client, 'workspace', base.entity.id);
        await insertEvent(client, committed({ ...base, id: eventId }, seq));
        await client.query('COMMIT');
        return seq;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    const seqs = await Promise.all([append(newUlid()), append(newUlid())]);
    expect([...seqs].sort()).toEqual([1, 2]);
  });

  it('planted defect: bypassing the lock and reusing a seq hits events_entity_seq_unique', async () => {
    const base = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(base, 1));
      let caught: unknown;
      try {
        // workspaceSeq 2 is free, so the per-entity constraint is the one that fires.
        await insertEvent(client, committed({ ...base, id: newUlid() }, 1, undefined, 2));
      } catch (error) {
        caught = error;
      }
      expect(isUniqueViolation(caught, 'events_entity_seq_unique')).toBe(true);
      expect(isUniqueViolation(caught, 'events_pkey')).toBe(false);
    } finally {
      client.release();
    }
  });

  it('readEntityEvents returns per-entity seq order and honours afterSeq', async () => {
    const base = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(base, 1));
      await insertEvent(
        client,
        committed({ ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'CC HQ' } }, 2),
      );
    } finally {
      client.release();
    }
    const all = await readEntityEvents(db.pool, 'workspace', base.entity.id);
    expect(all.map((event) => event.seq)).toEqual([1, 2]);
    expect(all[1]?.payload).toEqual({ name: 'CC HQ' });
    expect(all[0]?.serverTime).toBe('2026-08-20T09:00:01.000Z');

    const tail = await readEntityEvents(db.pool, 'workspace', base.entity.id, 1);
    expect(tail.map((event) => event.seq)).toEqual([2]);
  });

  it('readLedger returns the canonical replay order regardless of arrival order', async () => {
    const ledger = await readLedger(db.pool);
    const keys = ledger.map((event) => `${event.entity.kind}|${event.entity.id}|${event.seq}`);
    expect(keys).toEqual([...keys].sort());
    expect(ledger.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2a: Add the workspace-cursor tests to the same file — still failing, for the same reason**

Coordination §18: per-entity `seq` cannot order a workspace stream, because every entity restarts at 1. `workspace_seq` is the cursor a stream resumes by; `seq` keeps entity history, replay and snapshots. Append to `apps/server/test/event-store.test.ts`:

```ts
describe('workspace stream cursor (coordination §18)', () => {
  /** A second entity inside an existing workspace. The store stores rows; the
   *  vocabulary gate lives at the door (Task 3), so any kind is fine here. */
  function siblingEntity(workspaceId: string, kind: 'project' | 'ticket'): SubmittedEvent {
    return submittedWorkspaceCreated({ workspaceId, entity: { kind, id: newUlid() } });
  }

  async function appendUnderBothLocks(submitted: SubmittedEvent): Promise<number> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock order is always workspace first, then entity — one global order
      // across the whole server, so two ingests can never deadlock by taking
      // the pair in opposite orders.
      await lockWorkspace(client, submitted.workspaceId);
      await lockEntity(client, submitted.entity.kind, submitted.entity.id);
      const workspaceSeq = await nextWorkspaceSeq(client, submitted.workspaceId);
      const seq = await nextSeq(client, submitted.entity.kind, submitted.entity.id);
      await insertEvent(client, committed(submitted, seq, undefined, workspaceSeq));
      await client.query('COMMIT');
      return workspaceSeq;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('two events on different entities in one workspace get strictly increasing workspace_seq', async () => {
    const first = submittedWorkspaceCreated();
    const second = siblingEntity(first.workspaceId, 'project');
    expect(await appendUnderBothLocks(first)).toBe(1);
    expect(await appendUnderBothLocks(second)).toBe(2);

    const stream = await db.pool.query<{ id: string; seq: number; workspace_seq: number }>(
      'SELECT id, seq, workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [first.workspaceId],
    );
    expect(stream.rows.map((row) => [row.id, row.workspace_seq])).toEqual([
      [first.id, 1],
      [second.id, 2],
    ]);
    // The defect §18 names: per-entity seq says NOTHING about stream order —
    // both entities honestly start at 1, so resuming at seq 1 would skip the
    // second entity's first event forever.
    expect(stream.rows.map((row) => row.seq)).toEqual([1, 1]);
  });

  it('planted defect: concurrent appends to different entities never mint one workspace_seq twice', async () => {
    const first = submittedWorkspaceCreated();
    const cursors = await Promise.all([
      appendUnderBothLocks(first),
      appendUnderBothLocks(siblingEntity(first.workspaceId, 'project')),
      appendUnderBothLocks(siblingEntity(first.workspaceId, 'ticket')),
    ]);
    // Without the workspace lock these three transactions read the same
    // max(workspace_seq) and events_workspace_seq_unique rejects two of them.
    expect([...cursors].sort()).toEqual([1, 2, 3]);
  });

  it('replay is unaffected: the canonical order is still (entity_kind, entity_id, seq)', async () => {
    const ledger = await readLedger(db.pool);
    const keys = ledger.map((event) => `${event.entity.kind}|${event.entity.id}|${event.seq}`);
    expect(keys).toEqual([...keys].sort());

    const perWorkspace = new Map<string, number[]>();
    for (const event of ledger) {
      expect(typeof event.workspaceSeq).toBe('number');
      perWorkspace.set(event.workspaceId, [...(perWorkspace.get(event.workspaceId) ?? []), event.workspaceSeq]);
    }
    for (const cursors of perWorkspace.values()) {
      expect(new Set(cursors).size).toBe(cursors.length);
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/ledger/event-store.js`.

- [ ] **Step 4: Implement the event store**

`apps/server/src/ledger/event-store.ts`:

```ts
import type { Pool, PoolClient } from 'pg';
import type { EntityKind, EventEnvelope, Origin } from '@gisik-nokma/domain';

/**
 * Serialises all seq assignment for one entity within the current transaction.
 * Key: 64-bit hash of 'kind:id'. Released automatically at COMMIT/ROLLBACK.
 */
export async function lockEntity(client: PoolClient, kind: EntityKind, id: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${kind}:${id}`]);
}

/** Next per-entity sequence number; only meaningful after lockEntity in the same transaction. */
export async function nextSeq(client: PoolClient, kind: EntityKind, id: string): Promise<number> {
  const result = await client.query<{ head: number }>(
    'SELECT coalesce(max(seq), 0)::bigint AS head FROM events WHERE entity_kind = $1 AND entity_id = $2',
    [kind, id],
  );
  return (result.rows[0]?.head ?? 0) + 1;
}

/**
 * Serialises all workspace_seq assignment for one workspace within the current
 * transaction (coordination §18). Key: 64-bit hash of 'workspace-seq:<id>' —
 * a namespace deliberately disjoint from lockEntity's 'workspace:<id>', so the
 * stream lock and the workspace-entity lock never collide.
 *
 * Lock order is always workspace first, then entity — one global order across
 * the whole server, so two ingests can never deadlock by taking the pair in
 * opposite orders.
 */
export async function lockWorkspace(client: PoolClient, workspaceId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `workspace-seq:${workspaceId}`,
  ]);
}

/** Next workspace stream cursor; only meaningful after lockWorkspace in the same transaction. */
export async function nextWorkspaceSeq(client: PoolClient, workspaceId: string): Promise<number> {
  const result = await client.query<{ head: number }>(
    'SELECT coalesce(max(workspace_seq), 0)::bigint AS head FROM events WHERE workspace_id = $1',
    [workspaceId],
  );
  return (result.rows[0]?.head ?? 0) + 1;
}

/**
 * What the ledger stores: the contract-frozen domain envelope plus the
 * server-assigned workspace stream cursor. `EventEnvelope` itself does not
 * gain the field — clients never author it and treat it as opaque.
 */
export type LedgerEvent = EventEnvelope & { workspaceSeq: number };

export async function insertEvent(client: PoolClient, event: LedgerEvent): Promise<void> {
  await client.query(
    `INSERT INTO events
       (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      event.id,
      event.workspaceId,
      event.entity.kind,
      event.entity.id,
      event.type,
      event.version,
      JSON.stringify(event.payload),
      event.actorId,
      event.origin,
      event.clientTime,
      event.serverTime,
      event.seq,
      event.workspaceSeq,
    ],
  );
}

/** snake_case row shape of the events table as pg returns it. */
export type EventRow = {
  id: string;
  workspace_id: string;
  entity_kind: EntityKind;
  entity_id: string;
  type: string;
  version: number;
  payload: unknown;
  actor_id: string;
  origin: Origin;
  client_time: string;
  server_time: Date;
  seq: number;
  workspace_seq: number;
};

export function rowToEnvelope(row: EventRow): LedgerEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entity: { kind: row.entity_kind, id: row.entity_id },
    type: row.type,
    version: row.version,
    payload: row.payload,
    actorId: row.actor_id,
    origin: row.origin,
    clientTime: row.client_time,
    serverTime: row.server_time.toISOString(),
    seq: row.seq,
    workspaceSeq: row.workspace_seq,
  };
}

/**
 * Per-entity history in seq order; afterSeq supports per-entity catch-up.
 * A WORKSPACE stream resumes by workspace_seq instead — per-entity seq cannot
 * order a workspace (coordination §18); Plan 4's visibleEventsFor owns that read.
 */
export async function readEntityEvents(
  client: PoolClient | Pool,
  kind: EntityKind,
  id: string,
  afterSeq = 0,
): Promise<LedgerEvent[]> {
  const result = await client.query<EventRow>(
    'SELECT * FROM events WHERE entity_kind = $1 AND entity_id = $2 AND seq > $3 ORDER BY seq',
    [kind, id, afterSeq],
  );
  return result.rows.map(rowToEnvelope);
}

/**
 * CANONICAL REPLAY ORDER: (entity_kind, entity_id, seq) — a total order over
 * the ledger (the triple is unique). Replay guarantees per-entity causality
 * only; a projection's table contents must be a pure function of the ledger's
 * rows, never of cross-entity arrival interleaving. workspace_seq changes
 * nothing here: it orders live streams, never replay.
 * In-memory load is fine at Plan-1 scale; the plan that first ships a
 * large-ledger deployment swaps this for a cursor without changing callers.
 */
export async function readLedger(client: PoolClient | Pool): Promise<LedgerEvent[]> {
  const result = await client.query<EventRow>(
    'SELECT * FROM events ORDER BY entity_kind, entity_id, seq',
  );
  return result.rows.map(rowToEnvelope);
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  return candidate.code === '23505' && candidate.constraint === constraint;
}
```

- [ ] **Step 5: Run the event-store test to verify it passes**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: PASS, including the concurrency serialisation, the planted seq-conflict defect, and the workspace-cursor block (strictly increasing across entities, no duplicate cursor under parallel transactions, canonical replay order untouched).

- [ ] **Step 6: Write the failing snapshot-store test**

`apps/server/test/snapshot-store.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readLatestSnapshot, writeSnapshot } from '../src/ledger/snapshot-store.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('snapshot store', () => {
  it('returns null when no snapshot exists', async () => {
    await expect(readLatestSnapshot(db.pool, 'workspace', '01J60000000000000000000WKA')).resolves.toBeNull();
  });

  it('returns the highest-seq snapshot for an entity', async () => {
    const client = await db.pool.connect();
    try {
      await writeSnapshot(client, {
        entityKind: 'workspace',
        entityId: '01J60000000000000000000WKA',
        seq: 1,
        state: { name: 'Convenience Corner' },
      });
      await writeSnapshot(client, {
        entityKind: 'workspace',
        entityId: '01J60000000000000000000WKA',
        seq: 3,
        state: { name: 'CC HQ' },
      });
    } finally {
      client.release();
    }
    await expect(
      readLatestSnapshot(db.pool, 'workspace', '01J60000000000000000000WKA'),
    ).resolves.toEqual({
      entityKind: 'workspace',
      entityId: '01J60000000000000000000WKA',
      seq: 3,
      state: { name: 'CC HQ' },
    });
  });
});
```

- [ ] **Step 7: Run it to verify it fails, then implement the snapshot store**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/ledger/snapshot-store.js`.

`apps/server/src/ledger/snapshot-store.ts`:

```ts
import type { Pool, PoolClient } from 'pg';
import type { EntityKind } from '@gisik-nokma/domain';

/**
 * Snapshots bound per-entity replay: state as of seq, so a replay starts from
 * the latest snapshot instead of event 1. Plan 1 ships the primitive only —
 * nothing writes snapshots yet (see Open questions).
 */
export type Snapshot = {
  entityKind: EntityKind;
  entityId: string;
  seq: number;
  state: Record<string, unknown>;
};

export async function writeSnapshot(client: PoolClient, snapshot: Snapshot): Promise<void> {
  await client.query(
    'INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ($1, $2, $3, $4)',
    [snapshot.entityKind, snapshot.entityId, snapshot.seq, JSON.stringify(snapshot.state)],
  );
}

export async function readLatestSnapshot(
  client: PoolClient | Pool,
  kind: EntityKind,
  id: string,
): Promise<Snapshot | null> {
  const result = await client.query<{ seq: number; state: Record<string, unknown> }>(
    `SELECT seq, state FROM snapshots
     WHERE entity_kind = $1 AND entity_id = $2
     ORDER BY seq DESC LIMIT 1`,
    [kind, id],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return { entityKind: kind, entityId: id, seq: row.seq, state: row.state };
}
```

- [ ] **Step 8: Run all server tests, typecheck**

Run: `pnpm turbo run test typecheck --filter=@gisik-nokma/server`
Expected: PASS and clean.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/ledger apps/server/test
git commit -m "Ledger stores: advisory-locked per-entity sequencing and the per-workspace stream cursor beside it — workspace lock first, then entity, one order so nothing deadlocks — both proven under concurrency, with canonical replay reads left exactly as they were"
```

---

### Task 8: Projection framework — registry and rebuild

**Files:**
- Create: `apps/server/src/projections/registry.ts`
- Create: `apps/server/src/projections/rebuild.ts`
- Test: `apps/server/test/projection-framework.test.ts`

**Interfaces:**
- Consumes: `readLedger`, `insertEvent` from Task 7; `createTestDatabase` (Task 6); event helpers (Task 7).
- Produces (cross-plan API — every later projection author implements `Projection` and registers it):
  - `type Projection = { name: string; tables: readonly string[]; apply(event: EventEnvelope, tx: PoolClient): Promise<void>; reset(tx: PoolClient): Promise<void> }` — `apply` must be deterministic (no clocks, no randomness, nothing outside the event and its own tables) and **insensitive to cross-entity arrival interleaving** (per-entity seq order is the only replay guarantee); `tables` lists every table it writes (all `proj_`-prefixed); `reset` empties them.
  - `type ProjectionRegistry = { register(p: Projection): void; get(name: string): Projection | undefined; all(): readonly Projection[] }`; `createProjectionRegistry(): ProjectionRegistry` — duplicate names refused.
  - `rebuildProjection(name: string, deps: { pool: Pool; projections: ProjectionRegistry }): Promise<void>` — resets then replays the whole ledger in canonical order, one transaction. **It truncates the projection's LIVE tables: an offline/operational action, never a request-path one.** (The verifier never calls it against live — it rebuilds into a shadow schema, Task 12.)

- [ ] **Step 1: Write the failing framework test**

`apps/server/test/projection-framework.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { createProjectionRegistry, type Projection } from '../src/projections/registry.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { committed, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function recordingProjection(name: string): {
  projection: Projection;
  applied: string[];
  resets: () => number;
} {
  const applied: string[] = [];
  let resets = 0;
  const projection: Projection = {
    name,
    tables: [],
    async apply(event) {
      applied.push(`${event.entity.kind}:${event.entity.id}:${event.seq}`);
    },
    async reset() {
      resets += 1;
      applied.length = 0;
    },
  };
  return { projection, applied, resets: () => resets };
}

describe('projection registry', () => {
  it('registers, retrieves by name, and lists all', () => {
    const registry = createProjectionRegistry();
    const { projection } = recordingProjection('proj_a');
    registry.register(projection);
    expect(registry.get('proj_a')).toBe(projection);
    expect(registry.all()).toEqual([projection]);
  });

  it('planted defect: refuses a duplicate projection name', () => {
    const registry = createProjectionRegistry();
    registry.register(recordingProjection('proj_a').projection);
    expect(() => registry.register(recordingProjection('proj_a').projection)).toThrowError(
      'projection already registered: proj_a',
    );
  });
});

describe('rebuildProjection', () => {
  it('planted defect: refuses an unknown projection name', async () => {
    const registry = createProjectionRegistry();
    await expect(rebuildProjection('proj_nope', { pool: db.pool, projections: registry })).rejects.toThrowError(
      'unknown projection: proj_nope',
    );
  });

  it('resets once, then applies the whole ledger in canonical order — not arrival order', async () => {
    // Two workspaces; arrival order deliberately interleaves and inverts entity grouping.
    const a = submittedWorkspaceCreated();
    const b = submittedWorkspaceCreated();
    const [first, second] =
      a.entity.id < b.entity.id ? [a, b] : [b, a]; // 'first' sorts before 'second'
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(second, 1));
      await insertEvent(client, committed(first, 1));
      await insertEvent(
        client,
        committed({ ...second, id: newUlid(), type: 'workspace.renamed', payload: { name: 'B2' } }, 2),
      );
      await insertEvent(
        client,
        committed({ ...first, id: newUlid(), type: 'workspace.renamed', payload: { name: 'A2' } }, 2),
      );
    } finally {
      client.release();
    }

    const registry = createProjectionRegistry();
    const { projection, applied, resets } = recordingProjection('proj_recording');
    registry.register(projection);

    await rebuildProjection('proj_recording', { pool: db.pool, projections: registry });

    expect(resets()).toBe(1);
    expect(applied).toEqual([
      `workspace:${first.entity.id}:1`,
      `workspace:${first.entity.id}:2`,
      `workspace:${second.entity.id}:1`,
      `workspace:${second.entity.id}:2`,
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/projections/registry.js`.

- [ ] **Step 3: Implement registry and rebuild**

`apps/server/src/projections/registry.ts`:

```ts
import type { PoolClient } from 'pg';
import type { EventEnvelope } from '@gisik-nokma/domain';

/**
 * A projection is a deterministic read model over the ledger.
 * Contract for every implementor, now and in later plans:
 * - apply(event, tx) is deterministic: same event + same prior table state =>
 *   same rows. No clocks, no randomness, nothing outside the event and the
 *   projection's own tables.
 * - Table contents must be a pure function of the ledger's rows — never of
 *   cross-entity arrival interleaving. Replay (rebuild, verify) delivers
 *   canonical order (entity_kind, entity_id, seq): per-entity causality only.
 * - tables lists every table the projection writes (all prefixed proj_);
 *   reset(tx) empties them so a rebuild starts from scratch.
 * - The registry applies projections in REGISTRATION order within each
 *   event's ingest transaction (all() preserves insertion order), and later
 *   plans depend on the order proj_entity_heads, proj_workflows,
 *   proj_ticket_types, proj_tickets, proj_rollups, proj_memberships,
 *   proj_visibility (coordination doc §8).
 */
export type Projection = {
  name: string;
  tables: readonly string[];
  apply(event: EventEnvelope, tx: PoolClient): Promise<void>;
  reset(tx: PoolClient): Promise<void>;
};

export type ProjectionRegistry = {
  register(projection: Projection): void;
  get(name: string): Projection | undefined;
  all(): readonly Projection[];
};

export function createProjectionRegistry(): ProjectionRegistry {
  const byName = new Map<string, Projection>();
  return {
    register(projection) {
      if (byName.has(projection.name)) {
        throw new Error(`projection already registered: ${projection.name}`);
      }
      byName.set(projection.name, projection);
    },
    get(name) {
      return byName.get(name);
    },
    all() {
      return [...byName.values()];
    },
  };
}
```

`apps/server/src/projections/rebuild.ts`:

```ts
import type { Pool } from 'pg';
import { readLedger } from '../ledger/event-store.js';
import type { ProjectionRegistry } from './registry.js';

/**
 * Rebuilds ONE projection's LIVE tables from the ledger inside a single
 * transaction: reset, then apply every event in canonical replay order.
 * This truncates live projection tables — an offline/operational action,
 * never a request-path one. The verifier CLI never calls this against live;
 * it rebuilds into a shadow schema instead.
 */
export async function rebuildProjection(
  name: string,
  deps: { pool: Pool; projections: ProjectionRegistry },
): Promise<void> {
  const projection = deps.projections.get(name);
  if (projection === undefined) {
    throw new Error(`unknown projection: ${name}`);
  }
  const client = await deps.pool.connect();
  try {
    await client.query('BEGIN');
    await projection.reset(client);
    const ledger = await readLedger(client);
    for (const event of ledger) {
      await projection.apply(event, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run the framework test to verify it passes**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: PASS — canonical order proven against interleaved arrival, both planted defects refused.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/projections apps/server/test
git commit -m "Projection framework: a registry of deterministic apply/reset read models and a rebuild that replays canonical order, proven against interleaved arrival"
```

---

### Task 9: proj_entity_heads — the reference projection

**Files:**
- Create: `apps/server/migrations/<timestamp>_proj-entity-heads.sql` (filename generated in Step 1)
- Create: `apps/server/src/projections/entity-heads.ts`
- Create: `apps/server/src/projections/index.ts`
- Test: `apps/server/test/entity-heads.test.ts`

**Interfaces:**
- Consumes: `Projection`, `createProjectionRegistry` (Task 8); `EntityHead` from `@gisik-nokma/domain` (Task 4); `insertEvent`, `rebuildProjection`, test helpers.
- Produces:
  - Table `proj_entity_heads`: `entity_kind text`, `entity_id text`, `workspace_id text`, `head_seq bigint`, `head_event_id text`, `head_event_type text`, `head_server_time timestamptz`, PK `(entity_kind, entity_id)` — every column derives from ledger rows alone.
  - `entityHeadsProjection: Projection` (name `'proj_entity_heads'`).
  - `readEntityHead(client: PoolClient | Pool, kind: EntityKind, id: string): Promise<EntityHead | null>` — the head pointer, `null` for an entity with no committed events.
  - `buildProjectionRegistry(): ProjectionRegistry` in `src/projections/index.ts` — **the single wiring point**: server boot, the verifier CLI, and tests all call it; later plans register their projections inside it.

- [ ] **Step 1: Generate and fill the migration**

Run: `pnpm --filter @gisik-nokma/server exec node-pg-migrate create proj-entity-heads --migration-file-language sql --migrations-dir migrations`
Expected: creates `apps/server/migrations/<timestamp>_proj-entity-heads.sql`.

Up SQL (under the Up marker, as in Task 6):

```sql
CREATE TABLE proj_entity_heads (
  entity_kind      text NOT NULL,
  entity_id        text NOT NULL,
  workspace_id     text NOT NULL,
  head_seq         bigint NOT NULL,
  head_event_id    text NOT NULL,
  head_event_type  text NOT NULL,
  head_server_time timestamptz NOT NULL,
  PRIMARY KEY (entity_kind, entity_id)
);

COMMENT ON TABLE proj_entity_heads IS 'Projection: newest committed event (the head) per entity. Rebuildable from the ledger; never authored.';
```

Down SQL:

```sql
DROP TABLE proj_entity_heads;
```

- [ ] **Step 2: Write the failing projection test**

`apps/server/test/entity-heads.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { entityHeadsProjection, readEntityHead } from '../src/projections/entity-heads.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { committed, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('proj_entity_heads', () => {
  it('readEntityHead is null for an entity with no committed events', async () => {
    await expect(readEntityHead(db.pool, 'workspace', newUlid())).resolves.toBeNull();
  });

  it('tracks the newest event per entity as events apply in order', async () => {
    const base = submittedWorkspaceCreated();
    const renameId = newUlid();
    const client = await db.pool.connect();
    try {
      const created = committed(base, 1, '2026-08-20T09:00:01.000Z');
      const renamed = committed(
        { ...base, id: renameId, type: 'workspace.renamed', payload: { name: 'CC HQ' } },
        2,
        '2026-08-20T09:00:02.000Z',
      );
      await insertEvent(client, created);
      await entityHeadsProjection.apply(created, client);
      await insertEvent(client, renamed);
      await entityHeadsProjection.apply(renamed, client);
    } finally {
      client.release();
    }
    await expect(readEntityHead(db.pool, 'workspace', base.entity.id)).resolves.toEqual({
      kind: 'workspace',
      id: base.entity.id,
      headSeq: 2,
      headEventId: renameId,
      headEventType: 'workspace.renamed',
    });
  });

  it('planted defect: a stale replayed apply cannot regress the head', async () => {
    const base = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      const first = committed(base, 1);
      const second = committed({ ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'X' } }, 2);
      await insertEvent(client, first);
      await insertEvent(client, second);
      await entityHeadsProjection.apply(second, client); // arrives at the projection first
      await entityHeadsProjection.apply(first, client);  // stale apply must not win
    } finally {
      client.release();
    }
    const head = await readEntityHead(db.pool, 'workspace', base.entity.id);
    expect(head?.headSeq).toBe(2);
  });

  it('rebuild derives the same heads from the raw ledger', async () => {
    const registry = buildProjectionRegistry();
    await rebuildProjection('proj_entity_heads', { pool: db.pool, projections: registry });
    const rows = await db.pool.query(
      'SELECT entity_id, head_seq FROM proj_entity_heads ORDER BY entity_id',
    );
    const direct = await db.pool.query(
      `SELECT entity_id, max(seq)::bigint AS head_seq FROM events
       WHERE entity_kind = 'workspace' GROUP BY entity_id ORDER BY entity_id`,
    );
    expect(rows.rows).toEqual(direct.rows);
  });

  it('buildProjectionRegistry registers exactly the known projections', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual(['proj_entity_heads']);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/projections/entity-heads.js`.

- [ ] **Step 4: Implement the projection and the wiring point**

`apps/server/src/projections/entity-heads.ts`:

```ts
import type { Pool, PoolClient } from 'pg';
import type { EntityHead, EntityKind } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Reference projection: the newest committed event (the head) per entity.
 * One row per entity; every column derives from ledger rows alone.
 * The head_seq guard makes apply idempotent and replay-safe: a stale or
 * duplicate apply can never move a head backwards.
 */
export const entityHeadsProjection: Projection = {
  name: 'proj_entity_heads',
  tables: ['proj_entity_heads'],

  async apply(event, tx) {
    await tx.query(
      `INSERT INTO proj_entity_heads
         (entity_kind, entity_id, workspace_id, head_seq, head_event_id, head_event_type, head_server_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entity_kind, entity_id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         head_seq = excluded.head_seq,
         head_event_id = excluded.head_event_id,
         head_event_type = excluded.head_event_type,
         head_server_time = excluded.head_server_time
       WHERE excluded.head_seq > proj_entity_heads.head_seq`,
      [
        event.entity.kind,
        event.entity.id,
        event.workspaceId,
        event.seq,
        event.id,
        event.type,
        event.serverTime,
      ],
    );
  },

  async reset(tx) {
    await tx.query('TRUNCATE proj_entity_heads');
  },
};

export async function readEntityHead(
  client: PoolClient | Pool,
  kind: EntityKind,
  id: string,
): Promise<EntityHead | null> {
  const result = await client.query<{ head_seq: number; head_event_id: string; head_event_type: string }>(
    'SELECT head_seq, head_event_id, head_event_type FROM proj_entity_heads WHERE entity_kind = $1 AND entity_id = $2',
    [kind, id],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    kind,
    id,
    headSeq: row.head_seq,
    headEventId: row.head_event_id,
    headEventType: row.head_event_type,
  };
}
```

`apps/server/src/projections/index.ts`:

```ts
import { entityHeadsProjection } from './entity-heads.js';
import { createProjectionRegistry, type ProjectionRegistry } from './registry.js';

/**
 * The single wiring point for projections. Server boot, the verify CLI, and
 * tests all call this, so they can never disagree about what is registered.
 * Later plans add their projections here.
 */
export function buildProjectionRegistry(): ProjectionRegistry {
  const registry = createProjectionRegistry();
  registry.register(entityHeadsProjection);
  return registry;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: PASS, including the stale-apply planted defect and the rebuild-equals-ledger check.

- [ ] **Step 6: Commit**

```bash
git add apps/server/migrations apps/server/src/projections apps/server/test
git commit -m "proj_entity_heads: the reference projection — head pointers derived only from the ledger, replay-safe against stale applies, wired through one registry"
```

---

### Task 10: Ingest service — parse, sequence, evaluate, persist, notify

**Files:**
- Create: `apps/server/src/engine-context.ts`
- Create: `apps/server/src/ingest/ingest-service.ts`
- Test: `apps/server/test/ingest.test.ts`

**Interfaces:**
- Consumes: `parseEvent`, `domainRegistry`, `EnvelopeErrorCode`, `SubmittedEvent`, `EventEnvelope` (`@gisik-nokma/domain`); `evaluateEvent`, `EngineContext` (`@gisik-nokma/rule-engine`); `lockEntity`, `nextSeq`, `lockWorkspace`, `nextWorkspaceSeq`, `insertEvent`, `isUniqueViolation`, `LedgerEvent` (Task 7); `readEntityHead` (Task 9); `ProjectionRegistry` (Task 8).
- Produces (cross-plan API — Plan 5's WebSocket layer and the sync plans build directly on this):
  - `createEngineContext(client: PoolClient): EngineContext` — state reads see the world as of the events committed before the one under evaluation.
  - `type IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id'`
  - `type IngestResult =`
    - `| { status: 'committed'; eventId: string; seq: number; serverTime: string }`
    - `| { status: 'invalid'; eventId: string | null; code: IngestErrorCode; message: string }` — envelope errors: not a well-formed claim, never touches the rule engine
    - `| { status: 'refused'; eventId: string; rule: string; reason: string }` — a rule refusal: a well-formed claim the rules reject
  - `type IngestDeps = { pool: Pool; evaluate: typeof evaluateEvent; projections: ProjectionRegistry; registry?: EventTypeRegistry; now?: () => Date }`
  - `type CommittedEventListener = (event: LedgerEvent) => void` — listeners receive the server-enriched event, so Plan 5's stream can carry `workspaceSeq` as its resume cursor without re-reading the ledger.
  - `type IngestService = { ingestBatch(rawEvents: unknown[]): Promise<IngestResult[]>; onEventCommitted(listener: CommittedEventListener): () => void }` — `ingestBatch` processes in order, `result[i]` answers `rawEvents[i]`, each event commits or fails independently; `onEventCommitted` fires AFTER the transaction commits, never for invalid/refused events, returns an unsubscribe function.
  - `createIngestService(deps: IngestDeps): IngestService`
  - **Sequencing inside the transaction (coordination §18):** the workspace stream cursor is assigned beside the per-entity seq. **Lock order is always workspace first, then entity — one global order across the whole server, so two ingests can never deadlock by taking the pair in opposite orders.** `IngestResult` is unchanged: `seq` stays the per-entity number clients already receive, and the cursor stays server-side and opaque.

- [ ] **Step 1: Write the failing ingest test**

`apps/server/test/ingest.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function service(overrides: Partial<Parameters<typeof createIngestService>[0]> = {}) {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
    ...overrides,
  });
}

describe('ingestBatch', () => {
  it('answers per event, in order: committed, unknown type, invalid payload', async () => {
    const valid = submittedWorkspaceCreated();
    const unknownType = { ...submittedWorkspaceCreated(), type: 'shop.opened' };
    const badPayload = { ...submittedWorkspaceCreated(), payload: {} };

    const results = await service().ingestBatch([valid, unknownType, badPayload]);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: 'committed', eventId: valid.id, seq: 1 });
    expect(results[1]).toMatchObject({ status: 'invalid', code: 'unknown-event-type', eventId: unknownType.id });
    expect(results[2]).toMatchObject({ status: 'invalid', code: 'invalid-payload', eventId: badPayload.id });
    if (results[0]?.status === 'committed') {
      expect(results[0].serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('assigns consecutive seqs to one entity across batches', async () => {
    const ingest = service();
    const base = submittedWorkspaceCreated();
    const rename = {
      ...base,
      id: newUlid(),
      type: 'workspace.renamed',
      payload: { name: 'CC HQ' },
    };
    const [first] = await ingest.ingestBatch([base]);
    const [second] = await ingest.ingestBatch([rename]);
    expect(first).toMatchObject({ status: 'committed', seq: 1 });
    expect(second).toMatchObject({ status: 'committed', seq: 2 });
  });

  it('planted defect: a rule refusal is reported verbatim and leaves NO trace in ledger or projections', async () => {
    const refuseAll: typeof evaluateEvent = async () => ({
      refused: true,
      rule: 'planted.rule',
      reason: 'planted: refused so the test can watch the door',
    });
    const event = submittedWorkspaceCreated();
    const results = await service({ evaluate: refuseAll }).ingestBatch([event]);

    expect(results[0]).toEqual({
      status: 'refused',
      eventId: event.id,
      rule: 'planted.rule',
      reason: 'planted: refused so the test can watch the door',
    });
    const ledger = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [event.id]);
    expect(ledger.rows[0]).toEqual({ n: 0 });
    const heads = await db.pool.query(
      'SELECT count(*)::int AS n FROM proj_entity_heads WHERE entity_id = $1',
      [event.entity.id],
    );
    expect(heads.rows[0]).toEqual({ n: 0 });
  });

  it('planted defect: a replayed event id is answered duplicate-event-id', async () => {
    const ingest = service();
    const event = submittedWorkspaceCreated();
    await ingest.ingestBatch([event]);
    const results = await ingest.ingestBatch([event]);
    expect(results[0]).toMatchObject({
      status: 'invalid',
      code: 'duplicate-event-id',
      eventId: event.id,
    });
    if (results[0]?.status === 'invalid') {
      expect(results[0].message).toContain(event.id);
    }
  });

  it('applies projections in the same transaction as the event', async () => {
    const event = submittedWorkspaceCreated();
    await service().ingestBatch([event]);
    const head = await db.pool.query(
      'SELECT head_seq, head_event_id FROM proj_entity_heads WHERE entity_kind = $1 AND entity_id = $2',
      ['workspace', event.entity.id],
    );
    expect(head.rows).toEqual([{ head_seq: 1, head_event_id: event.id }]);
  });

  it('the engine sees the world as of the previous event — not the one under evaluation', async () => {
    const observed: Array<number | null> = [];
    const peeking: typeof evaluateEvent = async (env, ctx) => {
      const state = await ctx.getEntityState(env.entity.kind, env.entity.id);
      observed.push(state === null ? null : state.headSeq);
      return { refused: false };
    };
    const ingest = service({ evaluate: peeking });
    const base = submittedWorkspaceCreated();
    await ingest.ingestBatch([base]);
    await ingest.ingestBatch([
      { ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'CC HQ' } },
    ]);
    expect(observed).toEqual([null, 1]);
  });
});

describe('onEventCommitted', () => {
  it('fires after commit with the full envelope, and only for committed events', async () => {
    const ingest = service();
    const seen: EventEnvelope[] = [];
    ingest.onEventCommitted((event) => seen.push(event));

    const valid = submittedWorkspaceCreated();
    const invalid = { ...submittedWorkspaceCreated(), type: 'shop.opened' };
    await ingest.ingestBatch([valid, invalid]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id: valid.id, seq: 1, type: 'workspace.created' });
  });

  it('never fires for refused events', async () => {
    const refuseAll: typeof evaluateEvent = async () => ({
      refused: true,
      rule: 'planted.rule',
      reason: 'planted: refused',
    });
    const ingest = service({ evaluate: refuseAll });
    const seen: EventEnvelope[] = [];
    ingest.onEventCommitted((event) => seen.push(event));
    await ingest.ingestBatch([submittedWorkspaceCreated()]);
    expect(seen).toEqual([]);
  });

  it('unsubscribe stops delivery', async () => {
    const ingest = service();
    const seen: EventEnvelope[] = [];
    const unsubscribe = ingest.onEventCommitted((event) => seen.push(event));
    unsubscribe();
    await ingest.ingestBatch([submittedWorkspaceCreated()]);
    expect(seen).toEqual([]);
  });

  it('planted defect: a throwing listener cannot break ingest or starve other listeners', async () => {
    const ingest = service();
    const seen: EventEnvelope[] = [];
    ingest.onEventCommitted(() => {
      throw new Error('broken listener');
    });
    ingest.onEventCommitted((event) => seen.push(event));
    const results = await ingest.ingestBatch([submittedWorkspaceCreated()]);
    expect(results[0]?.status).toBe('committed');
    expect(seen).toHaveLength(1);
  });
});
```

- [ ] **Step 1a: Add the ingest workspace-cursor tests to the same file**

The batch above proves per-entity sequencing; this block proves the workspace stream cursor the whole realtime layer resumes by (coordination §18). Append to `apps/server/test/ingest.test.ts`:

```ts
describe('workspace stream cursor (coordination §18)', () => {
  it('two entities in one workspace get strictly increasing workspace_seq while both keep seq 1', async () => {
    const ingest = service();
    const workspaceCreated = submittedWorkspaceCreated();
    const workspaceId = workspaceCreated.workspaceId;
    const renamed = {
      ...workspaceCreated,
      id: newUlid(),
      type: 'workspace.renamed',
      payload: { name: 'CC HQ' },
    };
    const otherWorkspace = submittedWorkspaceCreated();

    await ingest.ingestBatch([workspaceCreated, renamed, otherWorkspace]);

    const stream = await db.pool.query<{ id: string; seq: number; workspace_seq: number }>(
      'SELECT id, seq, workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [workspaceId],
    );
    expect(stream.rows.map((row) => [row.id, row.workspace_seq])).toEqual([
      [workspaceCreated.id, 1],
      [renamed.id, 2],
    ]);
    // Cursors are per workspace, so a second workspace starts at 1 again —
    // and never appears in this workspace's stream.
    const other = await db.pool.query<{ workspace_seq: number }>(
      'SELECT workspace_seq FROM events WHERE workspace_id = $1',
      [otherWorkspace.workspaceId],
    );
    expect(other.rows.map((row) => row.workspace_seq)).toEqual([1]);
  });

  it('onEventCommitted hands the listener the cursor the stream resumes by', async () => {
    const ingest = service();
    const cursors: number[] = [];
    ingest.onEventCommitted((event) => cursors.push(event.workspaceSeq));
    const base = submittedWorkspaceCreated();
    await ingest.ingestBatch([base]);
    await ingest.ingestBatch([{ ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'CC HQ' } }]);
    expect(cursors).toEqual([1, 2]);
  });

  it('planted defect: concurrent ingests to different entities never mint a cursor twice', async () => {
    const ingest = service();
    const anchor = submittedWorkspaceCreated();
    const workspaceId = anchor.workspaceId;
    // Four DIFFERENT entities in one workspace: the per-entity lock cannot
    // serialise them, so only the per-workspace lock keeps the cursor unique.
    // Without it all four read the same max(workspace_seq) and
    // events_workspace_seq_unique refuses the losers.
    const racers = [
      anchor,
      submittedWorkspaceCreated({ workspaceId, entity: { kind: 'project', id: newUlid() } }),
      submittedWorkspaceCreated({ workspaceId, entity: { kind: 'ticket', id: newUlid() } }),
      submittedWorkspaceCreated({ workspaceId, entity: { kind: 'membership', id: newUlid() } }),
    ];
    const results = await Promise.all(racers.map((event) => ingest.ingestBatch([event])));
    expect(results.flat().filter((result) => result.status === 'committed')).toHaveLength(4);
    const cursors = await db.pool.query<{ workspace_seq: number }>(
      'SELECT workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [workspaceId],
    );
    expect(cursors.rows.map((row) => row.workspace_seq)).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/ingest/ingest-service.js`.

- [ ] **Step 3: Implement the engine context**

`apps/server/src/engine-context.ts`:

```ts
import type { PoolClient } from 'pg';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import { readEntityHead } from './projections/entity-heads.js';

/**
 * EngineContext over the ingest transaction's client. The event under
 * evaluation is not yet applied, so every read answers with the world as of
 * the previously committed events — which is exactly what rules must judge
 * against.
 *
 * getChildrenStates and getWorkflowDef answer for a world in which no
 * hierarchy or workflow events can exist (their types are not in the Plan-1
 * vocabulary): the empty answers are true answers, not stubs. The plans that
 * introduce ticket hierarchy and workflow.defined replace these bodies with
 * real queries.
 */
export function createEngineContext(client: PoolClient): EngineContext {
  return {
    async getEntityState(kind, id) {
      return readEntityHead(client, kind, id);
    },
    async getChildrenStates(ticketId) {
      void ticketId;
      return [];
    },
    async getWorkflowDef(workflowId, version) {
      void workflowId;
      void version;
      return null;
    },
  };
}
```

- [ ] **Step 4: Implement the ingest service**

`apps/server/src/ingest/ingest-service.ts`:

```ts
import type { Pool } from 'pg';
import {
  domainRegistry,
  parseEvent,
  type EnvelopeErrorCode,
  type EventTypeRegistry,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../engine-context.js';
import {
  insertEvent,
  isUniqueViolation,
  lockEntity,
  lockWorkspace,
  nextSeq,
  nextWorkspaceSeq,
  type LedgerEvent,
} from '../ledger/event-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';

export type IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id';

export type IngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: IngestErrorCode; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string };

export type IngestDeps = {
  pool: Pool;
  evaluate: typeof evaluateEvent;
  projections: ProjectionRegistry;
  registry?: EventTypeRegistry; // defaults to domainRegistry
  now?: () => Date;             // injectable clock for tests
};

export type CommittedEventListener = (event: LedgerEvent) => void;

export type IngestService = {
  /** Processes a batch in order; result[i] answers rawEvents[i]. Each event
   * commits or fails independently — one bad event never rolls back its
   * neighbours. */
  ingestBatch(rawEvents: unknown[]): Promise<IngestResult[]>;
  /** Broadcast hook: fires AFTER an event's transaction commits, never for
   * refused or invalid events. Returns an unsubscribe function. Plan 5 wires
   * WebSocket fan-out onto this. */
  onEventCommitted(listener: CommittedEventListener): () => void;
};

export function createIngestService(deps: IngestDeps): IngestService {
  const registry = deps.registry ?? domainRegistry;
  const now = deps.now ?? (() => new Date());
  const listeners = new Set<CommittedEventListener>();

  function notifyCommitted(event: LedgerEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A broken listener must never break ingest or starve other
        // listeners; Plan 5 adds logging when the broadcast layer arrives.
      }
    }
  }

  async function commitOne(submitted: SubmittedEvent): Promise<IngestResult> {
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock order is always workspace first, then entity — one global order
      // across the whole server, so two ingests can never deadlock by taking
      // the pair in opposite orders.
      await lockWorkspace(client, submitted.workspaceId);
      await lockEntity(client, submitted.entity.kind, submitted.entity.id);
      const workspaceSeq = await nextWorkspaceSeq(client, submitted.workspaceId);
      const seq = await nextSeq(client, submitted.entity.kind, submitted.entity.id);
      const serverTime = now().toISOString();
      const envelope: LedgerEvent = { ...submitted, serverTime, seq, workspaceSeq };

      const verdict = await deps.evaluate(envelope, createEngineContext(client));
      if (verdict.refused) {
        await client.query('ROLLBACK');
        return { status: 'refused', eventId: envelope.id, rule: verdict.rule, reason: verdict.reason };
      }

      await insertEvent(client, envelope);
      for (const projection of deps.projections.all()) {
        await projection.apply(envelope, client);
      }
      await client.query('COMMIT');
      notifyCommitted(envelope);
      return { status: 'committed', eventId: envelope.id, seq, serverTime };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error, 'events_pkey')) {
        return {
          status: 'invalid',
          eventId: submitted.id,
          code: 'duplicate-event-id',
          message: `an event with id ${submitted.id} is already in the ledger`,
        };
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async ingestBatch(rawEvents) {
      const results: IngestResult[] = [];
      for (const raw of rawEvents) {
        const parsed = parseEvent(raw, registry);
        if (!parsed.ok) {
          results.push({
            status: 'invalid',
            eventId: parsed.eventId,
            code: parsed.code,
            message: parsed.message,
          });
          continue;
        }
        results.push(await commitOne(parsed.event));
      }
      return results;
    },
    onEventCommitted(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 5: Run the ingest test to verify it passes**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: PASS — all three outcome shapes exact, refusals leave no trace, the hook fires only after commit carrying the workspace cursor, the engine reads the pre-event world, and the workspace stream cursor stays unique and gap-free under four racing ingests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ingest apps/server/src/engine-context.ts apps/server/test
git commit -m "Ingest pipeline: parse at the door, take the workspace lock then the entity lock, stamp both the entity seq and the stream cursor, let the rule engine judge the pre-event world, persist with projections atomically, notify only what truly committed"
```

---

### Task 11: HTTP route POST /v1/events and server wiring

**Files:**
- Create: `apps/server/src/routes/events.ts`
- Modify: `apps/server/src/app.ts` (extend `AppDeps`, register the route)
- Modify: `apps/server/src/index.ts` (wire ingest into boot)
- Modify: `apps/server/test/app.test.ts` (pass a fake ingest)
- Test: `apps/server/test/events-route.test.ts`

**Interfaces:**
- Consumes: `IngestService` (Task 10), `buildProjectionRegistry` (Task 9), `evaluateEvent` (Task 4), `buildApp` (Task 5).
- Produces (cross-plan API — the client plans call this endpoint):
  - `POST /v1/events`, request body `{ "events": [ <raw envelope>, … ] }`, 1–100 events (`MAX_BATCH_SIZE = 100`).
  - Response 200: `{ "results": [ <IngestResult>, … ] }`, index-aligned with the request array. Envelope problems and rule refusals are per-event results, never HTTP errors.
  - Response 400 (Fastify schema refusal): body not an object, `events` missing/not an array/empty/over 100. HTTP errors mean "this was not a batch"; per-event results mean "this batch was heard".
  - Final `AppDeps` shape: `{ db: HealthDb; ingest: IngestService }`.

- [ ] **Step 1: Write the failing route test**

`apps/server/test/events-route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../src/app.js';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function app() {
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  return buildApp({ db: db.pool, ingest });
}

describe('POST /v1/events', () => {
  it('answers 200 with index-aligned per-event results', async () => {
    const server = app();
    const valid = submittedWorkspaceCreated();
    const unknownType = { ...submittedWorkspaceCreated(), type: 'shop.opened' };
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [valid, unknownType] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: Array<{ status: string }> };
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ status: 'committed', eventId: valid.id, seq: 1 });
    expect(body.results[1]).toMatchObject({ status: 'invalid', code: 'unknown-event-type' });
    await server.close();
  });

  it('planted defect: a body without events is a 400, not a half-heard batch', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: {} });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('planted defect: an empty batch is a 400', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events: [] } });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('planted defect: a batch over 100 events is a 400', async () => {
    const server = app();
    const events = Array.from({ length: 101 }, () => submittedWorkspaceCreated());
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events } });
    expect(response.statusCode).toBe(400);
    await server.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — `POST /v1/events` answers 404 in every route test (the route is not registered; `buildApp` ignores the extra `ingest` property at runtime). Typecheck would also flag `AppDeps` — both get fixed in the next steps.

- [ ] **Step 3: Implement the route and extend the app**

`apps/server/src/routes/events.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { IngestService } from '../ingest/ingest-service.js';

export const MAX_BATCH_SIZE = 100;

/**
 * Batch ingest. HTTP errors mean "this was not a batch" (schema refusal);
 * per-event results mean "this batch was heard" — envelope errors and rule
 * refusals ride inside results, index-aligned with the request array.
 */
export function registerEventRoutes(app: FastifyInstance, ingest: IngestService): void {
  app.post(
    '/v1/events',
    {
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          additionalProperties: false,
          properties: {
            events: { type: 'array', minItems: 1, maxItems: MAX_BATCH_SIZE },
          },
        },
      },
    },
    async (request) => {
      const { events } = request.body as { events: unknown[] };
      const results = await ingest.ingestBatch(events);
      return { results };
    },
  );
}
```

Replace the full contents of `apps/server/src/app.ts` with:

```ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { IngestService } from './ingest/ingest-service.js';
import { registerEventRoutes } from './routes/events.js';

export type HealthDb = { query(sql: string): Promise<unknown> };

export type AppDeps = {
  db: HealthDb;
  ingest: IngestService;
};

export function buildApp(deps: AppDeps, options: { logLevel?: string } = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logLevel === undefined ? false : { level: options.logLevel },
  });

  app.get('/healthz', async (_request, reply) => {
    try {
      await deps.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  registerEventRoutes(app, deps.ingest);

  return app;
}
```

Replace the full contents of `apps/server/src/index.ts` with:

```ts
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createIngestService } from './ingest/ingest-service.js';
import { buildProjectionRegistry } from './projections/index.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections });
  const app = buildApp({ db: pool, ingest }, { logLevel: config.logLevel });
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Update the health test for the final AppDeps shape**

In `apps/server/test/app.test.ts`, add this import and helper after the existing imports, and pass `ingest: fakeIngest()` in both `buildApp` calls:

```ts
import type { IngestService } from '../src/ingest/ingest-service.js';

function fakeIngest(): IngestService {
  return {
    ingestBatch: async () => [],
    onEventCommitted: () => () => {},
  };
}
```

The two calls become `buildApp({ db: healthyDb, ingest: fakeIngest() })` and `buildApp({ db: brokenDb, ingest: fakeIngest() })`.

- [ ] **Step 5: Run all server tests, typecheck**

Run: `pnpm turbo run test typecheck --filter=@gisik-nokma/server`
Expected: PASS — route tests green, health tests green against the final `AppDeps`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "POST /v1/events: the batch door — schema refusals for non-batches, honest per-event verdicts for everything the server heard"
```

---

### Task 12: verify-projections CLI — rebuild-and-diff against a shadow schema

**Files:**
- Create: `apps/server/src/tools/verify-projections.ts`
- Test: `apps/server/test/verify-projections.test.ts`

**Interfaces:**
- Consumes: `readLedger` (Task 7), `buildProjectionRegistry` (Task 9), `loadConfig`/`createPool` (Task 5), ingest service (Task 10, to seed honest state in tests).
- Produces:
  - `type TableDiff = { table: string; missingFromLive: number; extraInLive: number; samples: string[] }` (samples: up to 5 differing rows per direction, labelled).
  - `type VerifyReport = { clean: boolean; diffs: TableDiff[] }` (diffs contains drifted tables only).
  - `verifyProjections(deps: { pool: Pool; projections: ProjectionRegistry }): Promise<VerifyReport>` — re-derives every registered projection into shadow schema `verify_shadow`, diffs both directions against live, never writes a live table, always drops the shadow schema. (Fixed schema name: two concurrent verifies against one database collide — acceptable for an operational CLI; the second run simply restarts the shadow.)
  - `formatReport(report: VerifyReport): string`
  - CLI: `pnpm --filter @gisik-nokma/server run verify:projections` — reads `DATABASE_URL`, prints the report, exit code 0 when clean, 1 on drift. This is spec §3's scheduled verifier ("the freshness gate reborn"); scheduling itself is a deployment concern for a later plan.

- [ ] **Step 1: Write the failing verifier test**

`apps/server/test/verify-projections.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { formatReport, verifyProjections } from '../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  const results = await ingest.ingestBatch([
    submittedWorkspaceCreated(),
    submittedWorkspaceCreated(),
    submittedWorkspaceCreated(),
  ]);
  if (results.some((result) => result.status !== 'committed')) {
    throw new Error('seeding failed — verifier tests need an honest baseline');
  }
});

afterAll(async () => {
  await db.drop();
});

async function shadowSchemaExists(): Promise<boolean> {
  const result = await db.pool.query(
    "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'verify_shadow'",
  );
  return result.rows[0].n > 0;
}

describe('verifyProjections', () => {
  it('reports clean when live projections match their rebuild, and drops its shadow schema', async () => {
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
    await expect(shadowSchemaExists()).resolves.toBe(false);
  });

  it('planted defect: a corrupted live row is reported with the table named and both directions counted', async () => {
    const victim = await db.pool.query('SELECT entity_id FROM proj_entity_heads LIMIT 1');
    const entityId: string = victim.rows[0].entity_id;
    await db.pool.query('UPDATE proj_entity_heads SET head_seq = 999 WHERE entity_id = $1', [entityId]);

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs).toHaveLength(1);
    expect(report.diffs[0]).toMatchObject({
      table: 'proj_entity_heads',
      missingFromLive: 1, // the honest row the ledger derives
      extraInLive: 1,     // the corrupted row live holds
    });
    expect(report.diffs[0]?.samples.join('\n')).toContain('999');
    await expect(shadowSchemaExists()).resolves.toBe(false);

    // Repair via rebuild, then verify is clean again — the loop closes.
    const { rebuildProjection } = await import('../src/projections/rebuild.js');
    await rebuildProjection('proj_entity_heads', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    const repaired = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(repaired.clean).toBe(true);
  });

  it('planted defect: a deleted live row is one missing, zero extra', async () => {
    const victim = await db.pool.query('SELECT entity_id FROM proj_entity_heads LIMIT 1');
    const entityId: string = victim.rows[0].entity_id;
    await db.pool.query('DELETE FROM proj_entity_heads WHERE entity_id = $1', [entityId]);

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs[0]).toMatchObject({ table: 'proj_entity_heads', missingFromLive: 1, extraInLive: 0 });

    const { rebuildProjection } = await import('../src/projections/rebuild.js');
    await rebuildProjection('proj_entity_heads', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
  });
});

describe('formatReport', () => {
  it('says clean plainly', () => {
    expect(formatReport({ clean: true, diffs: [] })).toBe(
      'verify-projections: clean — every projection matches its rebuild from the ledger',
    );
  });

  it('names each drifted table with counts and samples', () => {
    const text = formatReport({
      clean: false,
      diffs: [
        {
          table: 'proj_entity_heads',
          missingFromLive: 1,
          extraInLive: 1,
          samples: ['missing from live: {"head_seq":2}', 'extra in live: {"head_seq":999}'],
        },
      ],
    });
    expect(text).toContain('DRIFT DETECTED');
    expect(text).toContain('proj_entity_heads: 1 row(s) missing from live, 1 extra in live');
    expect(text).toContain('extra in live: {"head_seq":999}');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: FAIL — cannot resolve `../src/tools/verify-projections.js`.

- [ ] **Step 3: Implement the verifier**

`apps/server/src/tools/verify-projections.ts`:

```ts
import { pathToFileURL } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { readLedger } from '../ledger/event-store.js';
import { buildProjectionRegistry } from '../projections/index.js';
import type { ProjectionRegistry } from '../projections/registry.js';

const SHADOW_SCHEMA = 'verify_shadow';

export type TableDiff = {
  table: string;
  missingFromLive: number; // rows the ledger derives that live lacks
  extraInLive: number;     // rows live holds that the ledger does not derive
  samples: string[];       // up to 5 differing rows per direction, labelled
};

export type VerifyReport = {
  clean: boolean;
  diffs: TableDiff[]; // drifted tables only
};

/**
 * The rebuild-and-diff discipline (spec §3): re-derive every registered
 * projection from the ledger into a shadow schema, then diff shadow against
 * live in both directions. Live tables are never written. The shadow schema
 * is always dropped, drift or not. Fixed schema name: two concurrent verifies
 * on one database collide — acceptable for an operational CLI.
 *
 * Trick: with search_path set to (verify_shadow, public), each projection's
 * unqualified table names resolve to its shadow copies, while 'events' — which
 * has no shadow copy — still resolves to public.events. Projections replay
 * unchanged, into the shadow.
 */
export async function verifyProjections(deps: {
  pool: Pool;
  projections: ProjectionRegistry;
}): Promise<VerifyReport> {
  const client = await deps.pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${SHADOW_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SHADOW_SCHEMA}`);
    const projections = deps.projections.all();
    for (const projection of projections) {
      for (const table of projection.tables) {
        await client.query(`CREATE TABLE ${SHADOW_SCHEMA}.${table} (LIKE public.${table} INCLUDING ALL)`);
      }
    }

    await client.query(`SET search_path TO ${SHADOW_SCHEMA}, public`);
    const ledger = await readLedger(client);
    for (const projection of projections) {
      await projection.reset(client);
      for (const event of ledger) {
        await projection.apply(event, client);
      }
    }
    await client.query('RESET search_path');

    const diffs: TableDiff[] = [];
    for (const projection of projections) {
      for (const table of projection.tables) {
        const diff = await diffTable(client, table);
        if (diff.missingFromLive > 0 || diff.extraInLive > 0) {
          diffs.push(diff);
        }
      }
    }
    return { clean: diffs.length === 0, diffs };
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${SHADOW_SCHEMA} CASCADE`).catch(() => {});
    client.release();
  }
}

async function diffTable(client: PoolClient, table: string): Promise<TableDiff> {
  const missing = await client.query<{ row: string }>(
    `SELECT row_to_json(d)::text AS row
     FROM (SELECT * FROM ${SHADOW_SCHEMA}.${table} EXCEPT SELECT * FROM public.${table}) d`,
  );
  const extra = await client.query<{ row: string }>(
    `SELECT row_to_json(d)::text AS row
     FROM (SELECT * FROM public.${table} EXCEPT SELECT * FROM ${SHADOW_SCHEMA}.${table}) d`,
  );
  const samples = [
    ...missing.rows.slice(0, 5).map((entry) => `missing from live: ${entry.row}`),
    ...extra.rows.slice(0, 5).map((entry) => `extra in live: ${entry.row}`),
  ];
  return { table, missingFromLive: missing.rows.length, extraInLive: extra.rows.length, samples };
}

export function formatReport(report: VerifyReport): string {
  if (report.clean) {
    return 'verify-projections: clean — every projection matches its rebuild from the ledger';
  }
  const lines = ['verify-projections: DRIFT DETECTED'];
  for (const diff of report.diffs) {
    lines.push(`  ${diff.table}: ${diff.missingFromLive} row(s) missing from live, ${diff.extraInLive} extra in live`);
    for (const sample of diff.samples) {
      lines.push(`    ${sample}`);
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);
  try {
    const report = await verifyProjections({ pool, projections: buildProjectionRegistry() });
    console.log(formatReport(report));
    process.exitCode = report.clean ? 0 : 1;
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
```

- [ ] **Step 4: Run the verifier test to verify it passes**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: PASS — clean baseline, both planted-drift flavours named with counts and samples, shadow schema gone after every run, rebuild closes the repair loop.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/tools apps/server/test
git commit -m "verify-projections: the freshness gate reborn — every projection re-derived into a shadow schema and diffed against live, drift named row by row, nonzero exit"
```

---

### Task 13: Determinism proof — the fixture ledger replays byte-identically

**Files:**
- Create: `apps/server/test/fixtures/ledger-fixture.ts`
- Test: `apps/server/test/determinism.test.ts`

**Interfaces:**
- Consumes: `insertEvent`, `LedgerEvent`, `rebuildProjection`, `buildProjectionRegistry`, `createTestDatabase`, `ULID_REGEX`.
- Produces: `FIXTURE_EVENTS: readonly LedgerEvent[]` (10 events, 3 workspaces, fixed ids and times) plus `FIXTURE_WORKSPACE_A/B/C`, `FIXTURE_ACTOR` — the shared deterministic ledger later plans reuse for replay tests. Every fixture entity IS its workspace, so `workspaceSeq` equals `seq` here; the fixture states it rather than leaving the coincidence to be rediscovered.

- [ ] **Step 1: Write the fixture**

`apps/server/test/fixtures/ledger-fixture.ts`:

```ts
import type { LedgerEvent } from '../../src/ledger/event-store.js';

/**
 * A fixed ledger: three workspaces, ten events, hand-built deterministic ids.
 * ULIDs are Crockford base32 (no I, L, O, U); every literal here is 26 chars
 * with a leading 0 — the determinism test asserts each against ULID_REGEX so
 * a bad literal fails loudly, not silently.
 */
export const FIXTURE_WORKSPACE_A = '01J6000000000000000000WKSA';
export const FIXTURE_WORKSPACE_B = '01J6000000000000000000WKSB';
export const FIXTURE_WORKSPACE_C = '01J6000000000000000000WKSC';
export const FIXTURE_ACTOR = '01J6000000000000000000ACTR';

function eventId(index: number): string {
  return `01J6000000000000000000EV${String(index).padStart(2, '0')}`;
}

function fixtureEvent(input: {
  index: number;         // 1-based position; drives id and both timestamps
  workspace: string;
  seq: number;
  type: 'workspace.created' | 'workspace.renamed';
  name: string;
}): LedgerEvent {
  const second = String(input.index).padStart(2, '0');
  return {
    id: eventId(input.index),
    workspaceId: input.workspace,
    entity: { kind: 'workspace', id: input.workspace },
    type: input.type,
    version: 1,
    payload: { name: input.name },
    actorId: FIXTURE_ACTOR,
    origin: 'server',
    clientTime: `2026-08-20T09:00:${second}.000Z`,
    serverTime: `2026-08-20T09:01:${second}.000Z`,
    seq: input.seq,
    // Every fixture entity IS its workspace, so the two counters coincide.
    workspaceSeq: input.seq,
  };
}

export const FIXTURE_EVENTS: readonly LedgerEvent[] = [
  fixtureEvent({ index: 1, workspace: FIXTURE_WORKSPACE_A, seq: 1, type: 'workspace.created', name: 'Convenience Corner' }),
  fixtureEvent({ index: 2, workspace: FIXTURE_WORKSPACE_A, seq: 2, type: 'workspace.renamed', name: 'Convenience Corner HQ' }),
  fixtureEvent({ index: 3, workspace: FIXTURE_WORKSPACE_A, seq: 3, type: 'workspace.renamed', name: 'CC HQ' }),
  fixtureEvent({ index: 4, workspace: FIXTURE_WORKSPACE_A, seq: 4, type: 'workspace.renamed', name: 'Corner HQ' }),
  fixtureEvent({ index: 5, workspace: FIXTURE_WORKSPACE_B, seq: 1, type: 'workspace.created', name: 'Gisik Nokma Build' }),
  fixtureEvent({ index: 6, workspace: FIXTURE_WORKSPACE_B, seq: 2, type: 'workspace.renamed', name: 'Gisik Nokma' }),
  fixtureEvent({ index: 7, workspace: FIXTURE_WORKSPACE_B, seq: 3, type: 'workspace.renamed', name: 'GN Build' }),
  fixtureEvent({ index: 8, workspace: FIXTURE_WORKSPACE_C, seq: 1, type: 'workspace.created', name: 'Personal' }),
  fixtureEvent({ index: 9, workspace: FIXTURE_WORKSPACE_C, seq: 2, type: 'workspace.renamed', name: 'Personal Errands' }),
  fixtureEvent({ index: 10, workspace: FIXTURE_WORKSPACE_C, seq: 3, type: 'workspace.renamed', name: 'Errands' }),
];
```

- [ ] **Step 2: Write the failing determinism test**

`apps/server/test/determinism.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { ULID_REGEX } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import {
  FIXTURE_ACTOR,
  FIXTURE_EVENTS,
  FIXTURE_WORKSPACE_A,
  FIXTURE_WORKSPACE_B,
  FIXTURE_WORKSPACE_C,
} from './fixtures/ledger-fixture.js';
import { createTestDatabase } from './helpers/db.js';

async function insertFixture(pool: Pool, events: typeof FIXTURE_EVENTS): Promise<void> {
  const client = await pool.connect();
  try {
    for (const event of events) {
      await insertEvent(client, event);
    }
  } finally {
    client.release();
  }
}

async function rebuildAndDump(pool: Pool): Promise<string> {
  await rebuildProjection('proj_entity_heads', { pool, projections: buildProjectionRegistry() });
  const result = await pool.query<{ row: string }>(
    `SELECT row_to_json(h)::text AS row FROM proj_entity_heads h ORDER BY h.entity_kind, h.entity_id`,
  );
  return result.rows.map((entry) => entry.row).join('\n');
}

describe('determinism (the rebuild-and-diff discipline, spec §3)', () => {
  it('every hand-built fixture id is a real ULID — a bad literal fails here, not in a mystery downstream', () => {
    const ids = [
      FIXTURE_WORKSPACE_A,
      FIXTURE_WORKSPACE_B,
      FIXTURE_WORKSPACE_C,
      FIXTURE_ACTOR,
      ...FIXTURE_EVENTS.map((event) => event.id),
      ...FIXTURE_EVENTS.map((event) => event.workspaceId),
    ];
    for (const id of ids) {
      expect(id, `not a valid ULID literal: ${id}`).toMatch(ULID_REGEX);
    }
  });

  it('replaying the fixture ledger twice yields byte-identical projection rows, with the expected heads', async () => {
    const db = await createTestDatabase();
    try {
      await insertFixture(db.pool, FIXTURE_EVENTS);
      const first = await rebuildAndDump(db.pool);
      const second = await rebuildAndDump(db.pool);
      expect(second).toBe(first);

      // Golden check: identical twice is not enough — it must also be RIGHT.
      const rows = first.split('\n').map((line) => JSON.parse(line) as { entity_id: string; head_seq: number; head_event_type: string });
      expect(rows.map((row) => [row.entity_id, row.head_seq, row.head_event_type])).toEqual([
        [FIXTURE_WORKSPACE_A, 4, 'workspace.renamed'],
        [FIXTURE_WORKSPACE_B, 3, 'workspace.renamed'],
        [FIXTURE_WORKSPACE_C, 3, 'workspace.renamed'],
      ]);
    } finally {
      await db.drop();
    }
  });

  it('arrival order changes nothing: a reversed-arrival ledger derives the same bytes', async () => {
    const inOrder = await createTestDatabase();
    const reversed = await createTestDatabase();
    try {
      await insertFixture(inOrder.pool, FIXTURE_EVENTS);
      await insertFixture(reversed.pool, [...FIXTURE_EVENTS].reverse());
      const dumpInOrder = await rebuildAndDump(inOrder.pool);
      const dumpReversed = await rebuildAndDump(reversed.pool);
      expect(dumpReversed).toBe(dumpInOrder);
    } finally {
      await inOrder.drop();
      await reversed.drop();
    }
  });
});
```

- [ ] **Step 3: Run the determinism suite**

Run: `pnpm turbo run test --filter=@gisik-nokma/server`
Expected: all three tests PASS. This task is the integration proof over an already-built stack, so there is no failing-first phase here — the failing-first evidence for each component lives in Tasks 6–12. If the ULID test fails, it names the malformed fixture literal: fix that literal. If either replay test fails, that is a real determinism bug in a projection or the canonical order — stop and debug it with superpowers:systematic-debugging; do not adjust the test.

- [ ] **Step 4: Run the full workspace suite**

Run: `pnpm turbo run build test typecheck`
Expected: every package green.

- [ ] **Step 5: Commit**

```bash
git add apps/server/test
git commit -m "Determinism proven: the fixture ledger replays byte-identical twice, derives the right heads, and shrugs at arrival order — projections are functions of the ledger, nothing else"
```

---

### Task 14: Features.md, test-cases, and the end-to-end smoke

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/README.md`
- Create: `test-cases/03-foundation-ledger.md`

Workspace convention note: `Features.md`/`test-cases/` must move in the same change set as the work. This plan's change set is the single PR the whole plan ships as — this task lands the catalogue inside that same PR, before merge, satisfying the convention at PR granularity.

**Interfaces:**
- Consumes: everything — this task verifies the whole plan end-to-end.
- Produces: `Features.md` §3 "Foundation & event ledger"; `test-cases/03-foundation-ledger.md` (cases 3.1–3.20).

- [ ] **Step 1: End-to-end smoke against the dev database**

```bash
docker compose up -d
export DATABASE_URL='postgres://gisik:gisik@localhost:54329/gisik_nokma'
pnpm --filter @gisik-nokma/server run migrate
pnpm --filter @gisik-nokma/server run verify:projections
```

Expected: migrations apply (idempotent if already applied); the verifier prints the clean line and exits 0 (empty ledger derives empty projections — clean).

- [ ] **Step 2: Boot, health-check, ingest one event, verify again**

```bash
pnpm --filter @gisik-nokma/server run dev &
sleep 2
curl -s http://127.0.0.1:3000/healthz
curl -s -X POST http://127.0.0.1:3000/v1/events \
  -H 'content-type: application/json' \
  -d '{"events":[{"id":"01J6000000000000000000EV99","workspaceId":"01J6000000000000000000WKSA","entity":{"kind":"workspace","id":"01J6000000000000000000WKSA"},"type":"workspace.created","version":1,"payload":{"name":"Convenience Corner"},"actorId":"01J6000000000000000000ACTR","origin":"server","clientTime":"2026-08-20T09:00:00.000Z"}]}'
kill %1
pnpm --filter @gisik-nokma/server run verify:projections
```

Expected: `{"status":"ok"}` from healthz; the POST answers `{"results":[{"status":"committed","eventId":"01J6000000000000000000EV99","seq":1,...}]}`; the verifier still exits 0 — the live projection written on the request path matches its rebuild. (Re-running the POST answers `duplicate-event-id`, which is also correct.)

- [ ] **Step 3: Add Features.md section 3**

Append to `Features.md`:

```markdown

## 3. Foundation & event ledger

- ⚙️ **Monorepo workspace** — pnpm workspaces + Turborepo, TypeScript strict, Node 22, ESM, Vitest; packages `@gisik-nokma/domain`, `@gisik-nokma/rule-engine`, `@gisik-nokma/server`. Root configs `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`; dev Postgres via `docker-compose.yml`.
- ⚙️ **Event envelope & vocabulary** — the exact `EventEnvelope` contract with zod validation, ULID helpers, and the versioned event-type registry; pure `parseEvent` refuses unknown types, unknown versions, invalid payloads, malformed envelopes. Provisional seed vocabulary: `workspace.created` v1, `workspace.renamed` v1. `packages/domain/`
- ⚙️ **Rule-engine boundary** — `evaluateEvent(env, ctx)` returning Accept or a Refusal that names its rule; pass-through internals that Plan 2 replaces. `packages/rule-engine/`
- ✅ **Event ingest API** — `POST /v1/events` batch ingest: parse at the door → advisory-locked per-entity `seq` and per-workspace `workspace_seq` (workspace lock first, then entity) + `serverTime` → rule-engine gate → append + projections in one transaction → index-aligned per-event committed/invalid/refused results. `GET /healthz`. `apps/server/src/routes/events.ts`, `apps/server/src/ingest/`
- ⚙️ **Append-only ledger** — Postgres `events` table where UPDATE/DELETE/TRUNCATE are refused by trigger, `(entity_kind, entity_id, seq)` is unique, and `client_time` is stored verbatim as the actor's claim beside `server_time` the system's fact; `snapshots` table ready to bound future replay. `apps/server/migrations/`
- ⚙️ **Workspace stream cursor** — `workspace_seq`, unique per `(workspace_id, workspace_seq)` and assigned in the ingest transaction under a per-workspace advisory lock, is the only order a workspace stream may resume by; per-entity `seq` keeps entity history, replay and snapshots. Server-enriched and opaque to clients (coordination §18). `apps/server/src/ledger/event-store.ts`
- ⚙️ **Projection framework** — registry of deterministic `apply`/`reset` read models applied in the ingest transaction; `rebuildProjection` replays the canonical order; reference projection `proj_entity_heads` (newest event per entity, replay-safe). `apps/server/src/projections/`
- ⚙️ **Broadcast hook** — `onEventCommitted(cb)` fires only after commit, never for refused or invalid events; Plan 5 attaches WebSocket fan-out. `apps/server/src/ingest/ingest-service.ts`
- ⚙️ **Projection verifier** — `verify-projections` CLI re-derives every projection into a shadow schema, diffs against live in both directions, names drifted rows, exits nonzero on drift. `apps/server/src/tools/verify-projections.ts`
```

- [ ] **Step 4: Create the test-case bucket and update the test-cases README**

`test-cases/03-foundation-ledger.md`:

```markdown
# 3. Foundation & event ledger

Mirrors `Features.md` §3. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope.

- **3.1** ✅ A well-formed submitted event passes envelope validation; a non-ULID id, unknown entity kind, missing actor, unreal datetime, or micro-second timestamp is refused (planted defects). — `packages/domain/test/envelope.test.ts`
- **3.2** ✅ An event of an unregistered type is refused `unknown-event-type` with the type named (planted defect). — `packages/domain/test/parse-event.test.ts`
- **3.3** ✅ A registered type at an unregistered version is refused `unknown-event-version` (planted defect). — `packages/domain/test/parse-event.test.ts`
- **3.4** ✅ A payload missing a required field or smuggling extra keys is refused `invalid-payload` (planted defects). — `packages/domain/test/parse-event.test.ts`
- **3.5** ✅ Registering the same event type@version twice, or the same projection name twice, is refused (planted defects). — `packages/domain/test/registry.test.ts`, `apps/server/test/projection-framework.test.ts`
- **3.6** ✅ The pass-through rule engine accepts every event and consults nothing; a Refusal carries `rule` + plain-language `reason`. — `packages/rule-engine/test/engine.test.ts`
- **3.7** ✅ UPDATE, DELETE and TRUNCATE on `events` are refused by the append-only trigger (planted defects). — `apps/server/test/migrations.test.ts`
- **3.8** ✅ A duplicate `(entity_kind, entity_id, seq)` violates `events_entity_seq_unique` (planted defect); two concurrent appends to one entity serialise to consecutive seqs. — `apps/server/test/migrations.test.ts`, `apps/server/test/event-store.test.ts`
- **3.9** ✅ A stored claim reads back exactly: jsonb payload intact, `client_time` verbatim with its offset, `seq` as a number. — `apps/server/test/migrations.test.ts`
- **3.10** ✅ Snapshots store and return the highest-seq state per entity; absent means null. — `apps/server/test/snapshot-store.test.ts`
- **3.11** ✅ Batch ingest answers per event, index-aligned: committed with seq/serverTime, invalid with named code, refused with rule + reason. — `apps/server/test/ingest.test.ts`
- **3.12** ✅ A rule-refused event leaves NO trace in ledger or projections (planted defect). — `apps/server/test/ingest.test.ts`
- **3.13** ✅ A replayed client event id is answered `duplicate-event-id` (planted defect). — `apps/server/test/ingest.test.ts`
- **3.14** ✅ Projections apply in the same transaction as the event; the rule engine judges the world as of the previous event. — `apps/server/test/ingest.test.ts`
- **3.15** ✅ `onEventCommitted` fires only after commit, never for invalid/refused; unsubscribe works; a throwing listener cannot break ingest (planted defect). — `apps/server/test/ingest.test.ts`
- **3.16** ✅ `POST /v1/events` returns 200 with per-event results; a missing/empty/oversized `events` array is a 400 (planted defects). — `apps/server/test/events-route.test.ts`
- **3.17** ✅ `GET /healthz` answers ok only when the database responds; 503 otherwise (planted defect). — `apps/server/test/app.test.ts`
- **3.18** ✅ `rebuildProjection` resets once then replays the canonical order regardless of arrival interleaving; unknown projection names are refused (planted defect). — `apps/server/test/projection-framework.test.ts`
- **3.19** ✅ `proj_entity_heads` tracks the newest event per entity; a stale replayed apply cannot regress a head (planted defect); rebuild equals a direct ledger derivation. — `apps/server/test/entity-heads.test.ts`
- **3.20** ✅ verify-projections is clean on honest state; corrupted and deleted live rows are named with per-direction counts and samples, the shadow schema is always dropped, and a rebuild repairs the drift (planted defects). — `apps/server/test/verify-projections.test.ts`
- **3.21** ✅ Replaying the fixture ledger twice yields byte-identical projection rows with the expected heads; reversed arrival derives the same bytes; every fixture id is regex-proven a ULID. — `apps/server/test/determinism.test.ts`
- **3.22** ✅ Boot refuses a missing `DATABASE_URL` or non-numeric `PORT` with the variable named (planted defects). — `apps/server/test/config.test.ts`
- **3.23** 🧪 End-to-end smoke: compose up, migrate, verify clean, boot, healthz ok, one event ingested over HTTP, verify clean again — run per release (Plan 1 Task 14 steps 1–2).
- **3.24** ✅ A duplicate `(workspace_id, workspace_seq)` violates `events_workspace_seq_unique` (planted defect); two entities in one workspace get strictly increasing cursors while both honestly keep `seq` 1; concurrent appends and four racing ingests never mint one cursor twice (planted defects). — `apps/server/test/migrations.test.ts`, `apps/server/test/event-store.test.ts`, `apps/server/test/ingest.test.ts`
- **3.25** ✅ The workspace cursor changes nothing about replay: canonical order stays `(entity_kind, entity_id, seq)`, every stored row carries a cursor unique within its workspace, and `onEventCommitted` hands listeners the cursor a stream resumes by. — `apps/server/test/event-store.test.ts`, `apps/server/test/ingest.test.ts`
```

In `test-cases/README.md`, replace the line beginning `Buckets so far: none —` with:

```markdown
Buckets so far: `03-foundation-ledger.md` (Features.md §3). Sections 1–2 are reference/spec material and carry no runnable scenarios. (`reference/` is frozen upstream code and carries its own upstream test catalogue; it gets no bucket here.)
```

- [ ] **Step 5: Final full verification**

Run: `pnpm turbo run build test typecheck`
Expected: every package green — this is the evidence for every ✅ above.

- [ ] **Step 6: Commit**

```bash
git add Features.md test-cases
git commit -m "Catalogue the foundation: Features.md section 3 and 25 test cases, every refusal path traced to the planted defect that proves it"
```

---

## Open questions

Flagged per instruction rather than silently resolved; none blocks execution of this plan as written.

1. **Provisional seed vocabulary.** The contract requires an event-type registry but names no Plan-1 types; spec §3's vocabulary (`ticket.created` …) belongs to later plans. This plan registers `workspace.created` v1 and `workspace.renamed` v1 (payload `{ name: string }`, strict) so the ledger, projections, and fixtures carry something real. Marked provisional: the plan that owns workspace lifecycle may revise these payloads before any production data exists.
2. **Shapes the contract references but never defines.** `EntityState`, `TicketState`, `WorkflowDef` appear in the contract's `EngineContext` with no definition. Settled by the coordination doc (§4): they are defined authoritatively in Plan 2's domain tasks. This plan's own head-pointer type is `EntityHead` (`readEntityHead → EntityHead | null`); because the rule-engine package type-imports the contract shapes, this plan ships them as PROVISIONAL, contract-exact stubs in `packages/domain/src/provisional.ts` (byte-compatible with the coordination doc) so Plan 1 builds alone — Plan 2 Task 2 deletes the stub file when it lands the authoritative definitions.
3. **Duplicate event id = `invalid` for now.** A replayed client id answers `duplicate-event-id`. The offline outbox (sync plans) may prefer idempotent-accept ("already committed, here is its seq") for retry-after-network-failure. Changing this later is additive; deciding it belongs to the sync plan.
4. **Snapshots have no writer.** The contract mandates the snapshots table ("bounds per-entity replay"); this plan ships table + read/write repo, but no snapshot-taking policy exists yet. The plan that introduces replayed entity state (Plan 2 or 3) should own when snapshots are written.
5. **Features.md/test-cases numbering across four parallel plan-writers.** This plan claims Features.md §3 and `test-cases/03-foundation-ledger.md`. The other parallel plans must claim distinct section numbers; the orchestrator should check for collisions before execution.
6. **`client_time` storage.** The contract fixes `payload jsonb` but not the time columns. Chosen here: `client_time text` verbatim (the claim keeps its stated offset — honesty-aligned per spec §3 "both are true in different senses") and `server_time timestamptz`. If a later plan needs to ORDER BY client time, it casts (`client_time::timestamptz`) or projects a derived column — the stored claim itself stays untouched.
7. **Contract's "entities" zod schemas.** The contract describes `packages/domain` as "shared types + zod schemas (event envelope, entities, ids)". Plan 1 ships envelope + ids + state types; per-entity aggregate schemas (ticket, project, workspace documents) belong to the plans that own those entities.
8. **`workspace_seq` is server-enriched; the domain envelope stays frozen (coordination §18).** The `EventEnvelope` contract in Global Constraints does NOT gain a required `workspaceSeq` — it is the pinned cross-plan type, and clients never author the cursor. The column is `NOT NULL` in the ledger, and server-side readers emit it as an optional, server-enriched `workspaceSeq?: number` (typed here as `LedgerEvent = EventEnvelope & { workspaceSeq: number }`, which every read path returns). **Clients treat the cursor as an opaque resume token** — they may pass back what they were given and must never compute, compare across workspaces, or display it. Consequence for the siblings: any test helper that inserts into `events` directly rather than through `insertEvent` must supply `workspace_seq` (Plan 4's `appendTestEvent` and Plan 5's `applyCommitted` are amended; Plan 9's and Plan 10's direct inserts are an execution-time adaptation the orchestrator owns).

## Self-review (performed by the plan author)

**1. Spec coverage — sections 1 and 3, scoped to Plan 1:**
- §1 "one TypeScript/Node server … ledger owns the facts, projections computed" → Tasks 1, 6, 7, 8, 9. ✓
- §1 honesty contract (1) provenance floor: every event carries actor/origin/times and is stored verbatim → Tasks 2, 6. ✓ (UI unfolding is a client-plan concern.)
- §1 (2) refusals over intentions: the engine interface + refusal reporting through ingest → Tasks 4, 10; rule content itself is Plan 2 (contract says so). ✓
- §1 (3) parents/children and (5) contested claims: later plans (workflow rules, sync) — deliberately absent here per assignment scope. ✓
- §1 (4) nothing is invented: projections derive only from ledger rows; `head_server_time` from the event, never `now()` → Tasks 8, 9, 13. ✓
- §1 (6) planted defects: every refusal path in this plan has one (envelope, type, version, payload, duplicate id, seq conflict, append-only trigger, refusal-no-trace, drift, config). ✓
- §3 ledger fields (ULID, workspace, entity, type+payload, actor, origin, both times, per-entity seq) → Tasks 2, 6, 7. ✓ Plus the per-workspace `workspace_seq` stream cursor (coordination §18) → Tasks 6, 7, 10, with the domain envelope left frozen (Open questions 8). ✓
- §3 unknown types refused at ingest → Tasks 3, 10. ✓
- §3 projections rebuilt deterministically + scheduled verifier re-derives and diffs → Tasks 8, 12, 13 (scheduling itself deferred to deployment, noted in Task 12). ✓
- §3 realtime WebSocket push → hook only (`onEventCommitted`), per assignment; Plan 5 wires transport. ✓
- §3 schema evolution (events never rewritten, versioned types, snapshots bound replay) → append-only triggers (Task 6), versioned registry (Task 3), snapshots table + repo (Tasks 6, 7; policy flagged in Open questions 4). ✓
- History view = filtered ledger → `readEntityEvents` provides the read primitive; the view is a client plan. ✓

**2. Placeholder scan:** none of the skill's forbidden placeholder patterns appear in any step; every code step contains complete code; the two `node-pg-migrate create` steps intentionally let the tool own filenames, with the full SQL given. The pass-through engine and empty-world context answers are real Plan-1 semantics (documented as such), not deferred work; the PROVISIONAL stubs in `provisional.ts` are complete, contract-exact shapes with a named replacement (Plan 2 Task 2), not placeholders.

**3. Type consistency (spot-checked across tasks):** `EnvelopeErrorCode` union identical in Tasks 3 and 10; `IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id'` only at ingest; `AppDeps` evolution spelled in both Task 5 and Task 11 with the final shape stated in both; `EntityHead` fields (`kind, id, headSeq, headEventId, headEventType`) match between Task 4 (type), Task 9 (`readEntityHead`), and Task 10 (context test expecting `headSeq`); constraint names `events_entity_seq_unique`/`events_workspace_seq_unique`/`events_pkey` consistent across Tasks 6, 7, 10, with the lock-order sentence (workspace first, then entity) stated identically in the Architecture paragraph, Task 7's Produces block, and Task 10's ingest transaction; `LedgerEvent` is the single stored-event type across Tasks 7, 10, 13; canonical order stated identically in Global Constraints, Task 7 (`readLedger`), Task 8 (registry doc + rebuild), Task 12 (shadow replay); fixture ids are 26-char literals validated by a dedicated test (Task 13); `buildProjectionRegistry` is the single registry source in Tasks 9–12 and boot.
