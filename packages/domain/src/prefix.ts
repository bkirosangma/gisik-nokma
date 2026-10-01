import { z } from 'zod';

/**
 * The ticket key: `<workspace prefix><project prefix>-<number>`, e.g. `CCSO-1183`.
 *
 * ## The owner's spec, which is the whole of the requirement
 *
 * *"prefix will be decided at the creation of the workspace and project. i can
 * enter up to 3 letters for the workspace and during project creation up to 3
 * letters for it. for example for convenience corner if i choose CC and then
 * for the project Shop Operations i choose SO, the key will look something
 * like CCSO-xxxx where the xx are the counter per project."* (2026-09-20.)
 *
 * So a prefix is up to three capital letters, ENTERED by a person at creation
 * time and immutable afterwards, and the number is scoped PER PROJECT.
 *
 * ## Why a derivation exists at all, when the prefix is entered
 *
 * Every workspace and project that already exists was founded before this
 * field did, so none of them carries a prefix in its ledger — and the ledger
 * cannot be given one after the fact: `events` carries a `BEFORE UPDATE OR
 * DELETE` trigger that RAISES (`migrations/1787841717635_events-and-snapshots.sql`,
 * `events_append_only`), so no migration can write a prefix into a founding
 * event, and a value written only into a projection table would be a value the
 * projection cannot reproduce on replay — which `tools/verify-projections.ts`
 * fails, because it diffs live against a rebuild with `EXCEPT` in both
 * directions.
 *
 * `derivePrefix` is the answer to that, and it is a DERIVATION and not a
 * guess: it is a pure function of the name, and the name IS in the ledger.
 * **A project derives from the name it was FOUNDED under**, never its current
 * one — a rename must not re-key it (`proj_projects.founding_name`; a workspace
 * does the same, `workspaces/workspace-name.ts`). So
 * a workspace or project with no stored prefix still composes a key that is
 * stable across replays, and one that matches what its owner would have typed
 * — the three rows the owner named on 2026-09-20 come out of this rule as
 * `CC`, `SO` and `GG` (`docs/lanes/executor-2-state.md` §3 item 2).
 *
 * **It is the fallback, never the rule.** A stored prefix always wins
 * (`resolveProjectPrefixes`), because a person's stated choice outranks a
 * derivation from their own words.
 *
 * ## The rule, stated exactly
 *
 * Split the name into its runs of letters. If there are two or more, take the
 * first letter of the first two (`Convenience Corner` → `CC`). If there is
 * exactly one, take its first two letters (`gggg` → `GG`). If there are none,
 * return `XX`.
 *
 * The last branch is not dead code and not decoration: `displayName` refuses
 * only a BLANK name, so `42` is a name the door admits, and a rule that took
 * `words[0][0]` off an empty list would either throw inside a projection or
 * emit the empty string — and an empty workspace prefix composes `SO-1`, a key
 * with no workspace half, which is worse than a dull one.
 */

/** The longest prefix the owner may enter, and the longest this module may produce. */
export const PREFIX_MAX_LENGTH = 3;

/**
 * REFUSES rather than normalises, for `displayName`'s own reason
 * (`events/membership.ts`): the ledger stores the claim as it was made, so
 * quietly rewriting `cc` to `CC` would put words in the actor's mouth. The
 * New-workspace and New-project forms upper-case as the owner types, which is
 * where that belongs; the door answers what it was given.
 */
export const prefixSchema = z
  .string()
  .regex(/^[A-Z]{1,3}$/, 'must be 1 to 3 capital letters, A to Z');

export type Prefix = z.infer<typeof prefixSchema>;

/** The fallback for a name with no letters in it anywhere. A constant, so it is the same everywhere. */
export const PREFIX_WITHOUT_LETTERS = 'XX';

/**
 * The prefix a name derives. Pure, total, and deterministic — see this
 * module's docblock for the rule and for why it exists.
 */
export function derivePrefix(name: string): string {
  const words = name.match(/[A-Za-z]+/g) ?? [];
  if (words.length === 0) {
    return PREFIX_WITHOUT_LETTERS;
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** One project's contribution to `resolveProjectPrefixes`. */
export type PrefixClaim = {
  name: string;
  /** What a person entered at creation, or `null`/absent when nobody has. */
  prefix?: string | null;
};

/**
 * The prefix each project in ONE workspace ends up with, unique within it.
 *
 * ## Why uniqueness is a computation and not a constraint here
 *
 * The owner ruled project prefixes unique within a workspace — *"yes project
 * prefixes are unique per workspace"* — because a second `SO` in one workspace
 * would make `CCSO-1183` name two tickets, and a key's whole job is to name one
 * thing. A project that ENTERS a prefix is refused a duplicate at the door,
 * against this same function's answer for the workspace's existing projects.
 * A project that entered none cannot be refused anything, so its derived prefix
 * has to move instead — and moving is only meaningful if it moves the same way
 * on every read and every replay, which is why this takes an ORDERED list and
 * never a set.
 *
 * ## Two passes, and the first one is the point
 *
 * Every explicitly entered prefix is claimed before any derived one is handed
 * out. One pass would let an earlier project's DERIVATION take a prefix a later
 * project ENTERED — `Shop operations` would take `SO` and `Service orders`,
 * which asked for it by name, would be pushed to `SO2`. A person's stated
 * choice outranks a derivation from somebody else's words, so the stored ones
 * are all claimed first.
 *
 * Within each pass the input ORDER decides, and the caller supplies project ids
 * ascending. That order is a ledger fact (`project_id` is a ULID, minted at
 * creation) rather than a clock, so the answer is the same on the live read and
 * on a rebuild.
 *
 * ## The suffix
 *
 * A derived prefix that is already taken moves down `collisionCandidates`:
 * `SO`, `SO2` … `SO9`, `SA` … `SZ`, then the three-letter space. **Every
 * candidate is within `PREFIX_MAX_LENGTH`, for every base and any number of
 * collisions, and no candidate is ever digit-ONLY** — see that generator for the
 * sequence and for the measured reason it replaced a loop whose docblock claimed
 * a fallback the code did not have.
 *
 * ⚠ **THE FIRST EIGHT SUFFIXES CONTAIN A DIGIT, and this sentence said "made of
 * capitals" until a reviewer measured it.** 8 of every base's first 35 candidates
 * are `SO2`…`SO9`, and none of those satisfies `prefixSchema`'s `^[A-Z]{1,3}$` — a
 * consequence, not a contradiction, of the two schemas having different jobs: that
 * one governs what may be ENTERED and this governs what is DERIVED when nobody
 * entered anything. See `collisionCandidates` below, which says so at the digit.
 */
export function resolveProjectPrefixes(claims: readonly PrefixClaim[]): string[] {
  const assigned: Array<string | null> = claims.map(() => null);
  const taken = new Set<string>();

  // Pass 1 — every entered prefix, in order. A duplicate entered prefix is not
  // resolved here: the door refuses it (`checkPermission`'s
  // `project.prefix-taken`), so reaching this branch with two of them means a
  // ledger that predates the rule, and keeping the FIRST is the choice that
  // leaves the later project's own stored value untouched for a reader to
  // compare against.
  claims.forEach((claim, index) => {
    const entered = claim.prefix ?? null;
    if (entered === null || taken.has(entered)) {
      return;
    }
    assigned[index] = entered;
    taken.add(entered);
  });

  // Pass 2 — the rest, each fleeing collisions the set already holds.
  claims.forEach((claim, index) => {
    if (assigned[index] !== null) {
      return;
    }
    const base = derivePrefix(claim.name);
    for (const candidate of collisionCandidates(base)) {
      if (!taken.has(candidate)) {
        assigned[index] = candidate;
        taken.add(candidate);
        return;
      }
    }
    // Unreachable for any real workspace — `collisionCandidates` offers 17,610
    // values and the 3-letter space alone admits 17,576 projects sharing one
    // two-letter base. A throw rather than a fallback, because the alternative
    // at this point is an ILLEGAL prefix: the loop above ends only when every
    // candidate is taken, and returning `null` here would put `SO-null` on a
    // ticket key. A read that throws is louder than a key that lies.
    throw new Error(
      `no free project prefix remains for base ${base}: ${taken.size} projects in this workspace already hold one derived from it`,
    );
  });

  return assigned as string[];
}

/**
 * Every candidate a derived prefix may take, in order, each one a legal prefix.
 *
 * ## Why this is a generator rather than the loop it replaces
 *
 * The loop that stood here built `${base.slice(0, 3 - digits)}${n}` and stopped
 * when the value was free. **Measured, it produced values this module's own
 * contract forbids:** at twelve same-base projects it emitted `S10`, at a
 * hundred it emitted `100` — a digit where a letter belongs — and at a thousand
 * it emitted `S1000`, four characters where `PREFIX_MAX_LENGTH` is three. None
 * of that is reachable at product scale (a workspace would need ~100 projects
 * sharing an initial), but the docblock CLAIMED a fallback that did not exist,
 * and a claim like that is worse than the rough edge it hides. An independent
 * reviewer found the same discrepancy.
 *
 * So the sequence is explicit and every member is within the contract:
 *
 *   1. the bare base — `SO`;
 *   2. the base plus a digit, `SO2` … `SO9` — EIGHT values, and the ONLY place a
 *      derived prefix may contain a digit. (`'23456789'` is eight characters; this
 *      line said nine until a reviewer counted the string against it, and the
 *      generator's own total of 17,610 candidates is measured from the code, not
 *      from this list.);
 *   3. the base's first letter plus any other letter — `SA` … `SZ`;
 *   4. the whole three-letter space, `AAA` … `ZZZ`, enumerated in a fixed order.
 *
 * ## The digit, and the one thing it means
 *
 * `SO2` is deliberately NOT something a person may type: `prefixSchema` governs
 * what may be ENTERED and admits capitals only, and this generator governs what
 * the system DERIVES when somebody entered nothing. Keeping the digit for the
 * first nine collisions is a readability choice — `SO2` says "the second `SO`",
 * where `SA` would read as a different project's initials — and it is confined
 * to position 2 so that no candidate ever becomes digit-only.
 */
function* collisionCandidates(base: string): Generator<string> {
  yield base;
  const stem = base.slice(0, PREFIX_MAX_LENGTH - 1);
  for (const digit of '23456789') {
    yield `${stem}${digit}`;
  }
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    yield `${base[0]!}${letter}`;
  }
  for (let index = 0; index < 26 ** PREFIX_MAX_LENGTH; index += 1) {
    let word = '';
    let value = index;
    for (let position = 0; position < PREFIX_MAX_LENGTH; position += 1) {
      word = String.fromCharCode(65 + (value % 26)) + word;
      value = Math.floor(value / 26);
    }
    yield word;
  }
}

/**
 * The key, from its two halves and its number.
 *
 * The owner ruled a BARE key sufficient at every display site — *"it is
 * enough"* — so no project context is carried beside it, and this function
 * takes none: there is nothing for a caller to forget to pass.
 */
export function ticketKey(workspacePrefix: string, projectPrefix: string, number: number): string {
  return `${workspacePrefix}${projectPrefix}-${number}`;
}
