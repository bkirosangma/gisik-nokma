import { describe, expect, it } from 'vitest';
import { foldSearchText } from '../src/search-fold.js';

/**
 * 18.130 — `foldSearchText` (spec §7.2, Plan 3 of 6).
 *
 * The four marks the function removes are four spellings of the SAME Garo
 * letter: `a·chik`, `a'chik`, `a’chik` and `aʼchik` are one word, and a person
 * typing any of them must find a note that holds any other. The rule that makes
 * this a rule rather than a strip is the position test — the mark goes only
 * BETWEEN TWO LETTERS — and the two controls below are what pin it in each
 * direction: `'quoted'` keeps both of its quotes, and `compressor` comes back
 * unchanged.
 *
 * The mark is removed, and nothing is put back. Substituting an apostrophe for
 * the raka would make `a'chik` match itself and nothing else, which is the
 * opposite of the point.
 *
 * NFC first, so a decomposed `Café` and a composed one are one string before
 * anything else looks at it — the projection and the query path both fold, and
 * a difference here would be a difference in what the two sides index.
 *
 * Mutation: skip step 3 (the mark removal).
 */
describe('18.130 — foldSearchText', () => {
  it('unifies every spelling of the raka mark between letters, and leaves a mark that is not', () => {
    expect(foldSearchText('a·chik')).toBe('achik');
    expect(foldSearchText("a'chik")).toBe('achik');
    expect(foldSearchText('a’chik')).toBe('achik');
    expect(foldSearchText('aʼchik')).toBe('achik');
    expect(foldSearchText("don't"), 'between two letters, so removed').toBe('dont');

    expect(foldSearchText("'quoted'"), 'control: no letter before the first or after the last').toBe("'quoted'");
    expect(foldSearchText('compressor'), 'control: a string with no mark is unchanged but for case').toBe('compressor');

    expect(foldSearchText('  Cold   Room ')).toBe('cold room');
    expect(foldSearchText('Café'), 'NFC before anything else').toBe('café');
    expect(foldSearchText(''), 'total, including the empty string').toBe('');
  });
});
