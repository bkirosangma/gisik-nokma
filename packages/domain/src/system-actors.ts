import { ULID_REGEX } from './ids.js';

/**
 * ## The reserved actor, and why it is a ULID that cannot belong to anybody
 *
 * The auto-close sweep (backlog/closed spec §8.2) closes tickets on nobody's
 * behalf. It has to file that under SOME actor id, because every ledger event
 * carries one and the sheet renders it, and the two obvious alternatives are
 * both worse than a reserved constant:
 *
 * - **A real user, or the workspace's owner.** That is a lie the history view
 *   would repeat forever. "Closed by Anselma Marak" on a ticket Anselma never
 *   opened is the exact class of claim this product exists to refuse — the
 *   record would name a person for a decision they did not make.
 * - **A readable sentinel like `'system'`.** `submittedEventSchema` requires
 *   `actorId` to be a ULID (`ids.ts`), so a non-ULID id is refused at the
 *   ingest door before any payload schema is consulted: every auto-close would
 *   come back `refused`, the sweep would report `closed: 0` forever, and the
 *   failure would present as a permissions or rule problem rather than as a
 *   malformed constant. This is why the value below is checked against
 *   `ULID_REGEX` by case 13.722 rather than merely being spelled carefully.
 *
 * **Why `00000000000000000000SYS0AC` is reserved rather than random.** A
 * generated ULID would collide with a real one only by astronomically bad
 * luck, but "unlikely to collide" is a different property from "cannot
 * collide", and this id has to hold the stronger one: it is written into the
 * ledger as an actor and read back by every provenance surface. The 20-zero
 * prefix sorts below every ULID `newUlid()` can mint, and the `SYS0AC` tail
 * makes the reservation legible at the point of reading. **No user row ever
 * carries it** — `newUlid()` cannot produce it, nothing in the product accepts
 * an actor id from a client, and this constant is the only writer. Case 13.722
 * pins the match against `ULID_REGEX` with a negative control, so a future edit
 * to this line reddens a test rather than a sweep.
 *
 * The name is NOT carried here. `SYSTEM_ACTOR_NAMES` is the one place the
 * display name lives, and `actorLabel` (`packages/app-core/src/provenance.ts`)
 * consults it BEFORE the workspace roster — so a roster row that happened to
 * hold this id could not rename the system actor, which case 13.725 asserts.
 */
export const SYSTEM_ACTOR_AUTO_CLOSE = '00000000000000000000SYS0AC';

/**
 * The reserved actors, id → display name. A `ReadonlyMap` rather than an
 * object literal so a lookup of an arbitrary actor id cannot reach
 * `Object.prototype` — an id of `'constructor'` is not in the key space
 * (`ULID_REGEX` forbids it), but this map is also consulted with ids that
 * arrived over the wire, and `'toString' in {}` is the shape of bug that
 * costs an afternoon.
 *
 * `SYSTEM_ACTOR_AUTO_CLOSE` is the only entry today. Task 8's sweep is its one
 * consumer; the name is the string the sheet's closed badge renders, and
 * `Auto-close` is the spelling spec §8.2 fixes.
 */
export const SYSTEM_ACTOR_NAMES: ReadonlyMap<string, string> = new Map([
  [SYSTEM_ACTOR_AUTO_CLOSE, 'Auto-close'],
]);

/** Whether `id` is one of this product's reserved system actors. */
export function isSystemActor(id: string): boolean {
  return SYSTEM_ACTOR_NAMES.has(id);
}
