/**
 * `tint` is a KEY, not a colour: an id whose hash picks one of the four tints
 * below. Callers pass the entity's own id so the same workspace is the same
 * colour on every device and after every reload, and so two workspaces with the
 * same initials are still told apart. Omitting it keeps the neutral surface the
 * avatar shipped with — the tint is opt-in, so nothing that already renders an
 * avatar changes colour.
 */
export type AvatarProps = { name: string; size?: 'small' | 'medium'; tint?: string };

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '?';
  const last = words[words.length - 1] ?? first;
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

/**
 * How many tints there are, and WHY it is four rather than a nicer number.
 *
 * Each tint is one of the four token pairs `CONTRAST_PAIRS` already measures at
 * the 4.5:1 TEXT minimum in every theme and every style — `accent/accentText`,
 * `success/successText`, `warning/warningText`, `danger/dangerText`. A monogram
 * is read text on a fill, so it owes the text minimum, and reusing pairs the
 * gate already covers means this palette cannot drift out of contrast without
 * `packages/ui/test/tokens.test.ts` going red. Inventing a fifth hue would have
 * meant a new primitive and a new pair, for decoration.
 *
 * The obvious objection is that `danger` and `warning` carry meaning elsewhere.
 * They do — on a chip dot or a refusal. Here the shape (a circle of initials)
 * and the accessible name (the workspace's own name) carry the meaning, and the
 * colour is only an identity aid; no state is ever encoded in it.
 */
export const AVATAR_TINTS = 4;

/**
 * A stable small integer from an arbitrary id.
 *
 * FNV-1a over the code units, then `% AVATAR_TINTS`. It has to be stable across
 * reloads and devices, which rules out anything derived from insertion order or
 * from `Math.random`, and it has to be pure so a test can assert the same id
 * always lands on the same tint. `>>> 0` on every step keeps it inside 32 bits
 * rather than drifting into the float range, where two different ids can hash
 * equal for a reason nobody can reproduce.
 */
export function tintIndexOf(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % AVATAR_TINTS;
}

export function Avatar({ name, size = 'medium', tint }: AvatarProps) {
  const tintClass = tint === undefined ? '' : ` gn-avatar--tint-${tintIndexOf(tint)}`;
  return (
    <span className={`gn-avatar gn-avatar--${size}${tintClass}`} title={name} aria-label={name}>
      {initialsOf(name)}
    </span>
  );
}
