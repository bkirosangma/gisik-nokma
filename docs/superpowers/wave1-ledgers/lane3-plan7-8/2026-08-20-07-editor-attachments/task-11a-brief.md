### Task 11a: Attachment kinds in the domain, and the refusal that keeps evidence uploaded

Spec §2, Drive rule 1: **a Drive reference can never satisfy `require-evidence`.** Where the check lives is decided by what each layer can see. The shared rule engine cannot see it: Plan 3's reducer treats `attachment.added` as state-free (`case 'attachment.added': return state;`), so `TicketState` never carries attachments and a pure rule has nothing to read. The evidence gate already runs inside the ingest transaction with the ledger and the `attachments` table in front of it — so the refusal belongs here, beside the evidence-exists check it completes. What Plan 3 must change is only the payload vocabulary; the exact amendment is written out at the end of Open questions.

The rule id and its reason are written **once**, in `@gisik-nokma/domain`, and imported by the gate, the editor surface (Task 13a) and every test. A refusal the user reads must be one sentence in one place; copies drift.

**Files:**
- Create: `packages/domain/src/attachment-kinds.ts`
- Modify: `packages/domain/src/index.ts` (export the new module)
- Modify: `apps/server/src/gates/evidence-gate.ts` (full replacement, Step 3)
- Create: `apps/server/test/helpers/drive-reference.ts` (shared seed helper; Task 12c imports it too)
- Test: `packages/domain/test/attachment-kinds.test.ts`
- Test: `apps/server/test/gates/evidence-gate.test.ts` (append cases — the existing ones are untouched)

**Interfaces:**
- Consumes: `Queryable` (Plan 4); the gate seam and `RULE_EVIDENCE_UNKNOWN` (Task 11); the `events` table columns (Plan 1: `entity_kind`, `entity_id`, `type`, `payload`, `seq`, `workspace_seq`).
- Produces (cross-plan API — Plans 3, 6, 8, 10 all consume these names):
  - `type AttachmentKind = 'upload' | 'drive-reference'` — the discriminator, always declared, never inferred.
  - `type DriveReference = { driveFileId: string; name: string; mimeType: string; webViewLink: string; iconLink?: string; capturedAt: string }`
  - `isDriveReference(value: unknown): value is DriveReference`
  - `DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'` — the non-sensitive per-file scope, the only Drive scope this product ever requests.
  - `RULE_EVIDENCE_DRIVE_REFERENCE = 'attachment.evidence-drive-reference'` and `EVIDENCE_DRIVE_REFERENCE_REASON` — **the single origin of that sentence**; nothing anywhere retypes it.
  - Gate behaviour: a `ticket.transitioned` naming a Drive reference of **this** ticket as `evidenceAttachmentId` is refused `attachment.evidence-drive-reference`; a reference belonging to another ticket, or an id that is nothing at all, keeps the existing `attachment.evidence-unknown` refusal, byte-identical between those two cases (no existence leak).

- [ ] **Step 1: Write the failing domain test**

`packages/domain/test/attachment-kinds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DRIVE_FILE_SCOPE,
  EVIDENCE_DRIVE_REFERENCE_REASON,
  RULE_EVIDENCE_DRIVE_REFERENCE,
  isDriveReference,
} from '../src/attachment-kinds.js';

const REFERENCE = {
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  capturedAt: '2026-08-20T10:00:00.000Z',
};

describe('attachment kinds', () => {
  it('requests exactly the per-file Drive scope', () => {
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it('pins the evidence refusal id and names the remedy in its reason', () => {
    expect(RULE_EVIDENCE_DRIVE_REFERENCE).toBe('attachment.evidence-drive-reference');
    expect(EVIDENCE_DRIVE_REFERENCE_REASON).toContain('cannot serve as evidence');
    expect(EVIDENCE_DRIVE_REFERENCE_REASON).toContain('Upload the file to this ticket');
  });

  it('accepts a complete reference, with iconLink optional', () => {
    expect(isDriveReference(REFERENCE)).toBe(true);
    expect(isDriveReference({ ...REFERENCE, iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf' })).toBe(true);
  });

  it('planted defect: an incomplete or mistyped reference is not a reference', () => {
    for (const broken of [
      null,
      'a string',
      { ...REFERENCE, driveFileId: '' },
      { ...REFERENCE, capturedAt: undefined },
      { ...REFERENCE, webViewLink: 42 },
      { ...REFERENCE, iconLink: 7 },
    ]) {
      expect(isDriveReference(broken), `${JSON.stringify(broken)} must not pass`).toBe(false);
    }
  });
});
```

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/attachment-kinds.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 2: Implement the domain module**

`packages/domain/src/attachment-kinds.ts`:

```ts
/**
 * An attachment is one of exactly two kinds, and the kind is always
 * declared on the claim, never inferred from what is or is not in a
 * table (spec §2):
 *
 *  - 'upload'          — bytes this product holds: sniffed, hashed, stored.
 *  - 'drive-reference' — a pointer to a Google Drive file it does not hold.
 *
 * The distinction is load-bearing, not cosmetic: a file we do not hold can
 * be renamed, edited, moved, re-permissioned or deleted after it is
 * attached, so the product may not speak about its contents at all.
 */
export type AttachmentKind = 'upload' | 'drive-reference';

/**
 * The non-sensitive, per-file Google Drive scope. The picker grants this
 * product access to the individual files a user picks — nothing else in
 * their Drive — and it is the ONLY Drive scope this product ever asks for.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * What is stored when a Drive file is attached. Every field is a
 * last-seen observation, not a standing fact: `name` and `mimeType` are
 * what Drive said at `capturedAt`, and may already be stale by the time
 * anyone reads them. That is why the renderer dates them (Task 12b).
 */
export type DriveReference = {
  driveFileId: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  /** ISO-8601 instant at which these observations were captured. */
  capturedAt: string;
};

/** Rule id for spec §2's first Drive rule: evidence must be an upload. */
export const RULE_EVIDENCE_DRIVE_REFERENCE = 'attachment.evidence-drive-reference';

/**
 * The one place this sentence exists. The gate refuses with it, the
 * evidence picker shows it, the tests assert against the constant — so
 * every copy a user might see is the same words, and there is exactly one
 * file to edit if the wording ever improves.
 */
export const EVIDENCE_DRIVE_REFERENCE_REASON =
  'A Google Drive link cannot serve as evidence: the board holds a pointer, not the file, and a Drive file can be renamed, edited, moved or deleted after it is attached. Upload the file to this ticket and name the uploaded copy as the evidence instead.';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isDriveReference(value: unknown): value is DriveReference {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate['iconLink'] !== undefined && !isNonEmptyString(candidate['iconLink'])) return false;
  return (
    isNonEmptyString(candidate['driveFileId']) &&
    isNonEmptyString(candidate['name']) &&
    isNonEmptyString(candidate['mimeType']) &&
    isNonEmptyString(candidate['webViewLink']) &&
    isNonEmptyString(candidate['capturedAt'])
  );
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './attachment-kinds.js';
```

Run the domain test again — expected: PASS (4 tests).

- [ ] **Step 3: Extend the evidence gate (full replacement of Task 11's file)**

`apps/server/src/gates/evidence-gate.ts`:

```ts
import { EVIDENCE_DRIVE_REFERENCE_REASON, RULE_EVIDENCE_DRIVE_REFERENCE } from '@gisik-nokma/domain';
import type { GateRefusal, ServerGate } from './server-gate.js';

export const RULE_EVIDENCE_UNKNOWN = 'attachment.evidence-unknown';
export { RULE_EVIDENCE_DRIVE_REFERENCE };

/**
 * Plan 2's require-evidence rule checks that a transition CARRIES
 * evidence; this gate checks the named evidence is something this product
 * can vouch for. Two refusals, in this order:
 *
 *  1. The id names a Drive reference on this ticket — it exists, and it is
 *     still not evidence (spec §2, rule 1). Saying "does not exist" here
 *     would be a small lie about something the user can see in the list.
 *  2. The id names nothing on this ticket — the original refusal, shared
 *     with "belongs to another ticket" so no refusal reveals whether a
 *     foreign id exists anywhere.
 */
export function makeEvidenceGate(): ServerGate {
  return {
    eventType: 'ticket.transitioned',
    async check(event, db): Promise<GateRefusal | null> {
      const payload = event.payload as { evidenceAttachmentId?: unknown };
      const evidenceId = payload.evidenceAttachmentId;
      if (typeof evidenceId !== 'string') return null;

      const uploaded = await db.query('SELECT 1 FROM attachments WHERE id = $1 AND ticket_id = $2', [
        evidenceId,
        event.entity.id,
      ]);
      if ((uploaded.rows as unknown[]).length > 0) return null;

      // Not an upload. Ask the ledger — where a reference's whole record
      // lives, since a reference has no bytes and therefore no row — before
      // deciding which truth to tell.
      const reference = await db.query(
        `SELECT 1 FROM events
          WHERE entity_kind = 'ticket'
            AND entity_id = $1
            AND type = 'attachment.added'
            AND payload->>'kind' = 'drive-reference'
            AND payload->>'attachmentId' = $2
          LIMIT 1`,
        [event.entity.id, evidenceId],
      );
      if ((reference.rows as unknown[]).length > 0) {
        return { rule: RULE_EVIDENCE_DRIVE_REFERENCE, reason: EVIDENCE_DRIVE_REFERENCE_REASON };
      }

      return {
        rule: RULE_EVIDENCE_UNKNOWN,
        reason: `The attachment named as evidence (${evidenceId}) does not exist on this ticket, so this move cannot carry it as evidence.`,
      };
    },
  };
}
```

- [ ] **Step 4: Append the failing gate cases**

Append inside the existing `describe('evidence gate', …)` block of `apps/server/test/gates/evidence-gate.test.ts`:

```ts
  it('planted defect: a Drive reference on THIS ticket is refused as evidence, with the remedy named', async () => {
    const referenceId = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: TICKET, attachmentId: referenceId, actorId: ACTOR });
    const [result] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: referenceId })]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_DRIVE_REFERENCE });
    if (result!.status === 'refused') {
      // Byte-identical to the single origin — the user and the test read the same sentence.
      expect(result.reason).toBe(EVIDENCE_DRIVE_REFERENCE_REASON);
      expect(result.reason).not.toContain(referenceId);
    }
  });

  it("planted defect: a Drive reference on ANOTHER ticket refuses as unknown — the drive refusal never leaks existence elsewhere", async () => {
    const elsewhere = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: OTHER_TICKET, attachmentId: elsewhere, actorId: ACTOR });
    const [foreign] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: elsewhere })]);
    const fake = newUlid();
    const [fabricated] = await ingest.ingestBatch([transition({ toStateId: 'done', evidenceAttachmentId: fake })]);
    expect(foreign).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (foreign!.status === 'refused' && fabricated!.status === 'refused') {
      expect(foreign.reason.replace(elsewhere, 'ID')).toBe(fabricated.reason.replace(fake, 'ID'));
    }
  });
```

Add to that file's imports:

```ts
import { EVIDENCE_DRIVE_REFERENCE_REASON, RULE_EVIDENCE_DRIVE_REFERENCE } from '@gisik-nokma/domain';
import { RULE_EVIDENCE_UNKNOWN } from '../../src/gates/evidence-gate.js';
```

(`RULE_EVIDENCE_UNKNOWN` is already imported by the existing cases — keep one import.)

And create the shared seed helper (Task 12c's server case imports the same one):

`apps/server/test/helpers/drive-reference.ts`:

```ts
import { newUlid } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';

let driveSeq = 9000;

/**
 * Seed a committed `attachment.added` Drive reference straight into the
 * ledger. A reference has no bytes, so it has no attachments row — the
 * ledger IS its record. Writing the row directly (rather than through
 * ingest) keeps these gate tests independent of the pending Plan 3 payload
 * amendment: the REGISTRATION is proven in Plan 3's own suite, and the
 * gate's input is a committed row either way.
 */
export async function seedDriveReference(
  db: Queryable,
  params: { workspaceId: string; ticketId: string; attachmentId: string; actorId: string },
): Promise<void> {
  driveSeq += 1;
  await db.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload,
                         actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, 'ticket', $3, 'attachment.added', 1, $4::jsonb, $5, 'web', $6, now(), $7, $7)`,
    [
      newUlid(),
      params.workspaceId,
      params.ticketId,
      JSON.stringify({
        kind: 'drive-reference',
        attachmentId: params.attachmentId,
        driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
        name: 'GST filing Aug 2026.pdf',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
        capturedAt: '2026-08-20T10:00:00.000Z',
      }),
      params.actorId,
      '2026-08-20T10:00:00.000Z',
      driveSeq,
    ],
  );
}
```

and import it in the gate test: `import { seedDriveReference } from '../helpers/drive-reference.js';`

If Task 11's evidence-gate test does not already declare `OTHER_TICKET`, add `const OTHER_TICKET = '01J9GTKB000000000000000000';` beside its other constants — it needs no seeded ticket row, because the gate reads only the ledger and the attachments table.

- [ ] **Step 5: Run both suites**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/attachment-kinds.test.ts && pnpm --filter @gisik-nokma/server exec vitest run test/gates/`
Expected: PASS — 4 domain cases, and the gate suite with its two new refusals plus everything Task 11 already proved.

- [ ] **Step 6: Commit**

```bash
git add packages/domain apps/server
git commit -m "A Drive link is not evidence: the gate refuses it by name and tells the user to upload the file, and refusing it never reveals whether someone else's reference exists"
```

---
