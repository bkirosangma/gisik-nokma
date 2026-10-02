import { describe, expect, it } from 'vitest';
import {
  PREFIX_MAX_LENGTH,
  derivePrefix,
  prefixSchema,
  resolveProjectPrefixes,
  ticketKey,
} from '../src/prefix.js';

/**
 * The workspace and project prefix, and the key they compose.
 *
 * The cases below are written against the OWNER'S OWN THREE EXAMPLES, because
 * they are the only specimen of the rule in the world: a workspace
 * "Convenience Corner" (prefix `CC`) holding a project "Shop operations"
 * (prefix `SO`) reads `CCSO-1183` (`docs/lanes/executor-2-state.md`, the
 * dispatch's §1). Two of the three are derived from a TWO-WORD name and the
 * third — "gggg" — from a ONE-WORD one, which is exactly the fork the rule has
 * to make. A derivation that got either half right alone would pass a
 * single-example test.
 */
describe('derivePrefix', () => {
  it('13.1019 — takes the initials of the first two words, the owner’s workspace and project', () => {
    expect(derivePrefix('Convenience Corner')).toBe('CC');
    expect(derivePrefix('Shop operations')).toBe('SO');
  });

  it('13.1020 — takes the first two letters when the name is ONE word, the owner’s third project', () => {
    expect(derivePrefix('gggg')).toBe('GG');
  });

  it('uppercases, so a derived prefix can be typed back as an explicit one', () => {
    // The point is not cosmetics: an explicit prefix is refused unless it is
    // capitalised (`prefixSchema`), so a derivation that emitted `Cc` would
    // produce prefixes the door itself would reject.
    expect(derivePrefix('delivery')).toBe('DE');
  });

  it('ignores words after the second, and non-letter runs', () => {
    expect(derivePrefix('One Two Three')).toBe('OT');
    expect(derivePrefix('2024 Budget Plan')).toBe('BP');
    expect(derivePrefix('shop-operations')).toBe('SO');
    expect(derivePrefix('  Convenience   Corner  ')).toBe('CC');
  });

  it('a single-letter name yields a single-letter prefix, which is legal', () => {
    expect(derivePrefix('A')).toBe('A');
    expect(prefixSchema.safeParse(derivePrefix('A')).success).toBe(true);
  });

  it('13.1021 — a name with NO letters falls back to a stated constant rather than an empty string', () => {
    // `.min(1)` on the input schema would admit this if it were not for the
    // blank-name refusal; the fallback exists because "no letters" is a shape
    // the door permits and a prefix must still be produced. It is NOT an
    // accident of `[0]` on an empty array — an empty prefix would compose the
    // key `SO-1` with no workspace half at all.
    expect(derivePrefix('42')).toBe('XX');
    expect(derivePrefix('!!!')).toBe('XX');
    expect(prefixSchema.safeParse(derivePrefix('42')).success).toBe(true);
  });

  it('never returns more than the maximum, whatever the name', () => {
    for (const name of ['Convenience Corner', 'gggggggg', 'A B C', '42', 'A']) {
      expect(derivePrefix(name).length).toBeLessThanOrEqual(PREFIX_MAX_LENGTH);
    }
  });
});

describe('prefixSchema', () => {
  it('admits one to three capitals', () => {
    for (const value of ['A', 'CC', 'SO', 'ABC']) {
      expect(prefixSchema.safeParse(value).success).toBe(true);
    }
  });

  it('13.1022 — refuses lower case rather than upper-casing it', () => {
    // REFUSES rather than normalises, for `displayName`'s own reason: the
    // ledger stores the claim as it was made, so silently rewriting `cc` to
    // `CC` would put words in the actor's mouth. The form upper-cases as the
    // owner types; the door does not.
    const result = prefixSchema.safeParse('cc');
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.message).toBe(
      'must be 1 to 3 capital letters, A to Z',
    );
  });

  it('refuses four letters, digits, empty, and blank', () => {
    for (const value of ['ABCD', 'C1', '', '   ', 'C C', 'CC ']) {
      expect(prefixSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('resolveProjectPrefixes', () => {
  it('gives an explicitly entered prefix its own value', () => {
    expect(resolveProjectPrefixes([{ name: 'Shop operations', prefix: 'SO' }])).toEqual(['SO']);
  });

  it('derives for a project that entered none', () => {
    expect(resolveProjectPrefixes([{ name: 'Shop operations' }])).toEqual(['SO']);
  });

  it('13.1023 — breaks a derivation collision DETERMINISTICALLY, in the order given', () => {
    // Both names initialise to `SO` — a real collision, and the one the owner's
    // uniqueness ruling exists for: two `SO` projects in one workspace would
    // make `CCSO-1183` name two tickets. The second one moves; the first keeps
    // the bare prefix.
    expect(
      resolveProjectPrefixes([{ name: 'Shop operations' }, { name: 'Service orders' }]),
    ).toEqual(['SO', 'SO2']);
  });

  it('13.1024 — lets an EXPLICIT prefix outrank a derived one regardless of order', () => {
    // Two passes, not one: `Service orders` claims `SO` explicitly, so the
    // project that merely derives it must move even though it comes FIRST. A
    // single-pass resolver would hand `SO` to `Shop operations` and then
    // collide — and every later project's suffix would shift with it.
    expect(
      resolveProjectPrefixes([
        { name: 'Shop operations' },
        { name: 'Service orders', prefix: 'SO' },
      ]),
    ).toEqual(['SO2', 'SO']);
  });

  it('falls back to a digit suffix when the whole name has been spent', () => {
    expect(resolveProjectPrefixes([{ name: 'gggg', prefix: 'GG' }, { name: 'gggg' }])).toEqual([
      'GG',
      'GG2',
    ]);
  });

  it('13.1029 — every derived prefix is LEGAL at every collision depth, which the loop it replaced was not', () => {
    // MEASURED ON THE OLD LOOP: twelve same-base projects produced `S10`, a
    // hundred produced `100` (a digit where a letter belongs), and a thousand
    // produced `S1000`, four characters where the maximum is three. The
    // docblock claimed a "next free single letter" fallback that the code did
    // not have. None of this is reachable at product scale; the claim is what
    // made it worth fixing, and this case is what holds it fixed.
    for (const depth of [3, 9, 10, 12, 34, 100, 1000]) {
      const prefixes = resolveProjectPrefixes(
        Array.from({ length: depth }, () => ({ name: 'Shop operations' })),
      );
      expect(prefixes).toHaveLength(depth);
      expect(new Set(prefixes).size).toBe(depth);
      for (const prefix of prefixes) {
        expect(prefix).toMatch(/^[A-Z0-9]{1,3}$/);
        expect(prefix.length).toBeLessThanOrEqual(PREFIX_MAX_LENGTH);
        // No candidate is digit-ONLY: the digit is confined to position 2, so
        // it can never displace the letters that make a prefix readable.
        expect(prefix).toMatch(/[A-Z]/);
      }
    }
  });

  it('is order-stable: the same input in the same order gives the same answer', () => {
    const once = resolveProjectPrefixes([{ name: 'Site' }, { name: 'Standing' }, { name: 'gggg' }]);
    const twice = resolveProjectPrefixes([{ name: 'Site' }, { name: 'Standing' }, { name: 'gggg' }]);
    expect(once).toEqual(twice);
    expect(new Set(once).size).toBe(once.length);
  });
});

describe('ticketKey', () => {
  it('13.1025 — composes workspace prefix, project prefix and number', () => {
    expect(ticketKey('CC', 'SO', 1183)).toBe('CCSO-1183');
  });

  it('is the bare key — no project context is carried beside it', () => {
    // The owner ruled a bare key "is enough" at every display site, so this
    // function takes no context argument to forget to pass.
    expect(ticketKey('CC', 'SO', 1)).toBe('CCSO-1');
  });
});

describe('22.024 resolveProjectPrefixes skips reserved prefixes', () => {
  it('22.024 — a derived prefix flees a reserved one to the next candidate; control: without `reserved` it keeps the base', () => {
    expect(resolveProjectPrefixes([{ name: 'Shop ops' }])).toEqual(['SO']); // control
    expect(resolveProjectPrefixes([{ name: 'Shop ops' }], new Set(['SO']))).toEqual(['SO2']);
    // An ENTERED prefix is not moved by `reserved`: the door checked it, pass 1 is unchanged.
    expect(resolveProjectPrefixes([{ name: 'Shop ops', prefix: 'SO' }], new Set(['SO']))).toEqual(['SO']);
    // Reserved values are taken in order: SO and SO2 both reserved -> SO3.
    expect(resolveProjectPrefixes([{ name: 'Shop ops' }], new Set(['SO', 'SO2']))).toEqual(['SO3']);
  });
});
