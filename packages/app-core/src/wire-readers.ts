import type { DeletedItem } from '@gisik-nokma/domain';

/**
 * The wire readers the Deleted items mapper needs, kept OUTSIDE `src/online/`
 * because the replica maps its cached `GET /v1/me/deleted-items` body too and
 * `no-http-in-views` (3.35) forbids any import of `online/` from there.
 * `online/mappers.ts` re-exports `MappingError` and `mapDeletedItems`, so every
 * existing importer is unchanged (trash Plan 3 Task 9; ledgered ruling).
 */
export class MappingError extends Error {
  constructor(path: string, expected: string) {
    super(`response mapping failed at ${path}: expected ${expected}`);
    this.name = 'MappingError';
  }
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MappingError(path, 'an object');
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new MappingError(path, 'an array');
  return value;
}

export function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new MappingError(path, 'a string');
  return value;
}

export function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number') throw new MappingError(path, 'a number');
  return value;
}

/**
 * A string the wire declares REQUIRED but whose VALUE may honestly be `null`
 * (`DeletedItem.projectId` et al.) — the key itself must be present, exactly
 * the discipline every other required field in this module gets, but unlike
 * `asString` a `null` value is not a `MappingError`: it is a real, distinct
 * claim this type carries ("no project", "not marked"), not a second spelling
 * of "the route forgot to answer".
 */
export function asStringOrNull(record: Record<string, unknown>, key: string, path: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new MappingError(path, `a "${key}" key that is present and either a string or null`);
  }
  const value = record[key];
  if (value === null) return null;
  return asString(value, path);
}

const DELETED_ITEM_KINDS: readonly string[] = ['workspace', 'project', 'ticket', 'note'];

export function asDeletedItemKind(value: unknown, path: string): DeletedItem['kind'] {
  const text = asString(value, path);
  if (!DELETED_ITEM_KINDS.includes(text)) throw new MappingError(path, `one of ${DELETED_ITEM_KINDS.join('/')}`);
  return text as DeletedItem['kind'];
}

/**
 * `GET /v1/me/deleted-items` → `DeletedItem[]` (trash series, Plan 1 Task 8;
 * spec §6.3's read). Every field is REQUIRED on the wire, `purgeDueAt`
 * included — a row missing it is a `MappingError` (case 19.070) rather than a
 * default to `null`, the same `WorkspaceRef.archived` discipline: an omitted
 * key is a route that did not answer this question, not a claim about the
 * item. `projectId`/`projectName`/`purgeMarkedAt`/`purgeDueAt` are the
 * exception WITHIN "required" — the key must be present, but `null` is one of
 * the two honest values it may hold (`asStringOrNull`).
 */
export function mapDeletedItems(raw: unknown): DeletedItem[] {
  const record = asRecord(raw, 'deleted-items');
  return asArray(record['items'], 'deleted-items.items').map((entry, index) => {
    const path = `deleted-items.items[${index}]`;
    const item = asRecord(entry, path);
    return {
      kind: asDeletedItemKind(item['kind'], `${path}.kind`),
      id: asString(item['id'], `${path}.id`),
      workspaceId: asString(item['workspaceId'], `${path}.workspaceId`),
      workspaceName: asString(item['workspaceName'], `${path}.workspaceName`),
      projectId: asStringOrNull(item, 'projectId', `${path}.projectId`),
      projectName: asStringOrNull(item, 'projectName', `${path}.projectName`),
      label: asString(item['label'], `${path}.label`),
      deletedBy: asString(item['deletedBy'], `${path}.deletedBy`),
      deletedByName: asStringOrNull(item, 'deletedByName', `${path}.deletedByName`),
      deletedAt: asString(item['deletedAt'], `${path}.deletedAt`),
      purgeMarkedAt: asStringOrNull(item, 'purgeMarkedAt', `${path}.purgeMarkedAt`),
      purgeDueAt: asStringOrNull(item, 'purgeDueAt', `${path}.purgeDueAt`),
      containedCount: asNumber(item['containedCount'], `${path}.containedCount`),
    };
  });
}

