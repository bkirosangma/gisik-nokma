/**
 * Order-preserving fractional string keys (backlog/closed spec §8.1).
 *
 * A rank is a non-empty string over the alphabet `0-9a-z` (36 symbols, so
 * plain string comparison IS the order). `rankBetween` returns a key strictly
 * between its neighbours by extending the shorter side, so inserting between
 * the same two keys forever only lengthens the key — nobody else is ever
 * renumbered, which is what makes a reorder exactly ONE `ticket.ranked`.
 *
 * Keys never end in `0`. The reason is not cosmetic and not what it first looks
 * like: a trailing `0` is not equal to its prefix, it is UNORDERABLE below.
 * Nothing in the alphabet sorts under `'0'`, so there is no key strictly
 * between `'a'` and `'a0'` — and this function has no way to say so. Measured
 * on the algorithm below before the door was tightened: `rankBetween('a', 'a0')`
 * neither throws nor returns, it appends `'0'` forever (step-capped probe:
 * `NONTERMINATING at i=20001`). Two things keep it out:
 *   - every key this module RETURNS obeys the rule by construction — the digit
 *     it appends is a midpoint with `h - l > 1`, hence always >= 1, and the
 *     `(null, null)` key is `'i'`;
 *   - `isRankKey` is the predicate that DEFINES the space, and
 *     `ticketRankedPayload` uses it rather than the looser `RANK_KEY_REGEX`,
 *     so a hand-written `'a0'` is refused at the door instead of reaching a
 *     caller that would hang on it.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;
export const RANK_KEY_REGEX = /^[0-9a-z]+$/;
const MID = ALPHABET[Math.floor(BASE / 2)] as string; // 'i'

export function isRankKey(value: unknown): value is string {
  return typeof value === 'string' && RANK_KEY_REGEX.test(value) && !value.endsWith('0');
}

function digit(key: string, index: number): number {
  return index < key.length ? ALPHABET.indexOf(key[index] as string) : 0;
}

/**
 * Strictly between `before` and `after`; `null` means "no neighbour on that
 * side". Throws when `before >= after` — the caller's neighbours are wrong,
 * and a silent answer here would corrupt the shared order.
 *
 * The contract is that both neighbours are ranks (`isRankKey`), and the
 * algorithm is total over that space — an independent reviewer fuzzed 522,753
 * ordered pairs of valid keys and found zero non-terminating pairs. Outside
 * that space it is not total, and the shape that breaks it is narrower than "a
 * trailing zero": it needs `before` to be a STRICT PREFIX of `after` with every
 * remaining digit `0`, so that no digit ever diverges and the loop keeps
 * appending. `rankBetween(null, 'a0')` terminates fine for exactly that reason.
 * The shipped rule — refuse any key ending in `0` — is therefore SUFFICIENT
 * (every non-terminating pair has such an `after`) while being broader than the
 * mechanism, which is the safe direction for a rule enforced at a door.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before === null && after === null) return MID;
  if (before !== null && after !== null && before >= after) {
    throw new Error(`rankBetween: neighbours must be strictly ordered (got "${before}" >= "${after}")`);
  }
  const lo = before ?? '';
  const hi = after ?? '';
  // Once `hi` has diverged upward from `lo` at some digit (gap exactly 1), it
  // no longer binds any later digit — the upper bound below that point is
  // BASE (open above). With no `after` at all it is open from the start.
  let hiOpen = after === null;
  let out = '';
  for (let i = 0; ; i += 1) {
    const l = digit(lo, i);
    const h = hiOpen ? BASE : digit(hi, i);
    if (h - l > 1) return out + ALPHABET[l + Math.floor((h - l) / 2)];
    out += ALPHABET[l];
    if (h - l === 1) hiOpen = true;
    // h === l: both share this digit; keep descending with `hi` still binding.
  }
}

/**
 * The Backlog tab's order: ranked tickets first, by key; then the unranked, by
 * `ticketId` ascending (a ULID is creation order). A rank is meaningful only
 * within one project, so callers sort one project's rows.
 *
 * Equal ranks fall back to `ticketId` rather than returning 0, so the order is
 * total and stable — a comparator that reported equality here would let the
 * sort's own tie-breaking decide a shared manual order nobody chose.
 */
export function compareByRank(
  a: { rank: string | null; ticketId: string },
  b: { rank: string | null; ticketId: string },
): number {
  if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  if (a.rank !== null && b.rank === null) return -1;
  if (a.rank === null && b.rank !== null) return 1;
  return a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0;
}
