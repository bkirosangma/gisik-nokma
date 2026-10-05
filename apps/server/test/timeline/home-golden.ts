import { ULID_REGEX } from '@gisik-nokma/domain';

/**
 * A `HomeResponse` (or any read body) as a string that survives a fresh world: the read world mints its ids with `newUlid()`
 * on every run (`test/helpers/read-scenario.ts`), so a raw JSON golden would fail on its second run. Every id the world
 * NAMES becomes its field name (so a failure says WHICH entity moved), every other ULID becomes `#`, arrays are sorted,
 * keys are sorted, and `generatedAt` is dropped. Arrays are sorted, so an ORDER change in the ids is NOT caught here; KG
 * Home's `home.test.ts` (27.601 "newest first") keeps that.
 */
export function normaliseHome(body: object, world: Record<string, unknown>): string {
  const names = new Map(Object.entries(world).filter(([, v]) => typeof v === 'string').map(([k, v]) => [v as string, k]));
  const norm = (o: unknown): unknown =>
    typeof o === 'string'
      ? (names.get(o) ?? (ULID_REGEX.test(o) ? '#' : o))
      : Array.isArray(o)
        ? o.map(norm).map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x) as unknown)
        : o !== null && typeof o === 'object'
          ? Object.fromEntries(
              Object.entries(o)
                .filter(([k]) => k !== 'generatedAt')
                .sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([k, v]) => [k, norm(v)]),
            )
          : o;
  return JSON.stringify(norm(body), null, 1) + '\n';
}
