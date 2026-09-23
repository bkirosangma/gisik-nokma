import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getAttachment,
  insertAttachment,
  listTicketAttachments,
} from '../../src/attachments/attachment-repo.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const WS = '01J9GWKS000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const USER = '01J9GUSA000000000000000000';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

/**
 * A ticket-owned row, with the two fields the planted-defect cases vary.
 *
 * The override type is spelled out rather than derived as
 * `Partial<Parameters<typeof insertAttachment>[1]>`, which is what it used to be
 * and which STOPS WORKING the moment the parameter becomes a union: `Partial`
 * over a union distributes into a union of partials, so every `row(...)` call
 * returned a union and nine call sites became type errors at once (measured, in
 * this file, when the notes series widened the owner). Naming the two fields the
 * cases actually vary is narrower AND more stable.
 */
function row(
  id: string,
  overrides: Partial<{
    size: number;
    sha256: string;
    filename: string;
    mime: string;
    ticketId: string;
    objectKey: string;
  }> = {},
) {
  return {
    id,
    workspaceId: WS,
    // `noteId: null` AND NOT an omission, since the notes series (Plan 1 of 6):
    // `insertAttachment`'s row is now a union over the owner, and a ticket-owned
    // row must say which arm it is. The `row()` helper above built its overrides
    // from `Partial<Parameters<...>[1]>` — which over a UNION is a union of
    // partials — so omitting the field made every `row(...)` call site a type
    // error rather than a silent ticket default.
    ticketId: TICKET,
    noteId: null,
    uploaderId: USER,
    filename: 'gst-receipt.pdf',
    mime: 'application/pdf',
    size: 48211,
    objectKey: `w/${WS}/a/${id}`,
    ...overrides,
  };
}

describe('attachment repo', () => {
  /**
   * 9.168 — the attachment repo's `insert` → `get` round-trips every column, with `size` read back as a number.
   */
  it('insert → get round-trips every column, size as a number', async () => {
    const id = '01J9GATA000000000000000000';
    await insertAttachment(db.pool, row(id));
    const stored = await getAttachment(db.pool, id);
    expect(stored).toMatchObject({
      id,
      workspaceId: WS,
      ticketId: TICKET,
      uploaderId: USER,
      filename: 'gst-receipt.pdf',
      mime: 'application/pdf',
      size: 48211,
      objectKey: `w/${WS}/a/${id}`,
    });
    expect(typeof stored?.size).toBe('number');
    expect(typeof stored?.createdAt).toBe('string');
  });

  /**
   * 9.169 — `get` on an unknown id answers `null`.
   */
  it('get on an unknown id answers null', async () => {
    expect(await getAttachment(db.pool, '01J9GNON000000000000000000')).toBeNull();
  });

  /**
   * 9.170 — `listTicketAttachments` returns only that ticket's rows, in creation order.
   */
  it('listTicketAttachments returns only that ticket, in creation order', async () => {
    const other = '01J9GTKB000000000000000000';
    await insertAttachment(db.pool, row('01J9GATB000000000000000000', { filename: 'a.png', mime: 'image/png' }));
    await insertAttachment(db.pool, row('01J9GATC000000000000000000', { ticketId: other, objectKey: `w/${WS}/a/01J9GATC000000000000000000` }));
    const list = await listTicketAttachments(db.pool, TICKET);
    expect(list.map((item) => item.ticketId)).toEqual([TICKET, TICKET]);
    expect(list.map((item) => item.id)).toEqual(['01J9GATA000000000000000000', '01J9GATB000000000000000000']);
  });

  /**
   * 9.171 — planted defect: a duplicate `object_key` violates the table's unique constraint.
   */
  it('planted defect: a duplicate object_key violates the unique constraint', async () => {
    const dup = row('01J9GATD000000000000000000', { objectKey: `w/${WS}/a/01J9GATA000000000000000000` });
    await expect(insertAttachment(db.pool, dup)).rejects.toThrow();
  });

  /**
   * 9.172 — planted defect: a negative `size` violates the `CHECK (size >= 0)` constraint.
   */
  it('planted defect: a negative size violates the CHECK (size >= 0) constraint', async () => {
    const negative = row('01J9GATE000000000000000000', { size: -1 });
    await expect(insertAttachment(db.pool, negative)).rejects.toThrow();
  });

  /**
   * 9.173 — a row inserted with no `sha256` reads back as `null` — unknown, never a substituted default.
   */
  it('a row inserted with no sha256 reads back as null — unknown, not a default', async () => {
    const id = '01J9GATF000000000000000000';
    await insertAttachment(db.pool, row(id));
    const stored = await getAttachment(db.pool, id);
    expect(stored?.sha256).toBeNull();
  });

  /**
   * 9.174 — a real lowercase-hex `sha256` round-trips verbatim.
   */
  it('a real lowercase-hex sha256 round-trips verbatim', async () => {
    const id = '01J9GATG000000000000000000';
    const hex = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    await insertAttachment(db.pool, row(id, { sha256: hex }));
    const stored = await getAttachment(db.pool, id);
    expect(stored?.sha256).toBe(hex);
  });

  /**
   * 9.175 — planted defect: a non-hex `sha256` violates the `attachments_sha256_hex` CHECK constraint.
   */
  it('planted defect: a non-hex sha256 violates the attachments_sha256_hex CHECK constraint', async () => {
    const bad = row('01J9GATH000000000000000000', { sha256: 'not-hex'.padEnd(64, '0') });
    await expect(insertAttachment(db.pool, bad)).rejects.toThrow(/attachments_sha256_hex/);
  });

  /**
   * 9.176 — planted defect: UPPERCASE hex violates the same CHECK — the regex is case-sensitive on purpose, so two spellings of the same hash can never both be stored as different bytes.
   */
  it('planted defect: uppercase hex violates the same CHECK — the regex is case-sensitive on purpose', async () => {
    const upper = row('01J9GATJ000000000000000000', { sha256: 'A'.repeat(64) });
    await expect(insertAttachment(db.pool, upper)).rejects.toThrow(/attachments_sha256_hex/);
  });
});
