import { describe, expect, it } from 'vitest';
import { compareAbsent, quotedSpans, stripComments } from '../../../../scripts/help-content.mjs';

/**
 * Case 15.35 — the half of `check:help` that is about the PRODUCT rather than
 * about the generator.
 *
 * Until F2 (2026-09-21) `pnpm check:help` verified that the generated module
 * matched `docs/manual.md` + `docs/faq.md` and could not fail on whether either
 * document was true of the build. `scripts/help-content.mjs` now also compares
 * every quoted string in the two documents against the source under `apps/` +
 * `packages/`, ratcheted against `scripts/help-quoted-strings-absent.json`.
 *
 * WHY THE RATCHET AND NOT THE OBVIOUS ASSERTION. "Every quoted string must
 * exist in the product" was MEASURED before it was written and is false of this
 * corpus: **59 of its 171 distinct quoted strings are legitimately absent** —
 * the manual's worked examples, its illustrative labels, and its paraphrases of
 * what a screen says. The baseline is that measurement, and it fails in BOTH
 * directions: a new absence the baseline does not carry, and a baselined absence
 * the product now contains (a rotted entry, which is how such a list becomes a
 * blanket permission).
 *
 * ⚠ THOSE EXAMPLES ARE NOT QUOTED HERE, DELIBERATELY, AND IT IS NOT STYLE. The
 * gate's haystack is every file under `apps/` and `packages/` — INCLUDING this
 * one — so a docblock (or a fixture) that quotes one of the absent strings makes
 * the gate read it as the product saying it, and the entry is reported as rotted.
 * A first draft of this file did exactly that and the gate went red naming three
 * strings this file had introduced. Describe them; do not quote them.
 *
 * WHY THIS FILE EXISTS ON TOP OF THE SCRIPT'S OWN SELF-TEST. The gate's sweep
 * is real and runs in CI, and it can only tell you `EXIT=0` on the tree it was
 * handed. These cases pin the RULE's semantics against fixtures, in the runner a
 * developer already has open — the END-TO-END sweep deliberately stays in
 * `check:help`, because reading every file under `apps/` and `packages/` inside
 * a package unit suite is a repo-wide concern, not this package's.
 *
 * WHAT IT IS NOT. It does not read the corpus or the product, so a green here
 * says the rule behaves and nothing about whether the manual is true today.
 */
describe('15.35 the help corpus against the product', () => {
  const doc = (text: string) => [{ id: 'd', source: 'docs/d.md', text }];

  /**
   * Both directions on one pair, because asserting only the refusal would pass
   * under a rule that reported everything: the declared absence must be silent
   * AND the undeclared one must be named — and the SAME documents against an
   * empty baseline must report, or the first half would pass under a rule that
   * never fires at all.
   */
  it('15.35 — a declared absence is silent, the same absence undeclared is reported', () => {
    const documents = doc('Press "Sign out", or "No such thing".');
    const declared = compareAbsent({
      documents,
      product: 'Sign out',
      baseline: { absent: ['No such thing'] },
    });
    expect(declared.checked).toBe(2);
    expect(declared.undeclared).toEqual([]);
    expect(declared.resolved).toEqual([]);

    const undeclared = compareAbsent({ documents, product: 'Sign out', baseline: { absent: [] } });
    expect(undeclared.undeclared.map((u) => u.span)).toEqual(['No such thing']);
    // The report carries the document, so a failure tells a reader where to look.
    expect(undeclared.undeclared[0]?.source).toBe('docs/d.md');
  });

  /**
   * The direction that stops the baseline rotting into a blanket permission.
   * Deleting this half is how a declared-absent list becomes a list nobody
   * re-reads, with the next real absence hiding behind a stale entry.
   */
  it('15.35 — a baselined absence the product NOW contains is a STALE entry, and reported', () => {
    const { undeclared, resolved } = compareAbsent({
      documents: doc('Press "Sign out".'),
      product: 'Sign out',
      baseline: { absent: ['Sign out', 'a string nobody quotes any more'] },
    });
    expect(undeclared).toEqual([]);
    expect(resolved).toEqual(['Sign out', 'a string nobody quotes any more']);
  });

  /**
   * The edge the first draft got wrong, in the direction that would have made
   * the whole check vacuous: the manual writes product notices as `*"…"*`, and
   * the asterisks sit OUTSIDE the quotes — so a filter that dropped any span
   * near an asterisk would silently skip the sentences most worth checking.
   */
  it('15.35 — an italic-WRAPPED quotation is still checked (the asterisks are outside the quotes)', () => {
    expect(quotedSpans('It says *"No such notice"* here.')).toEqual(['No such notice']);
  });

  /**
   * The other edge, and the reason the sweep is not red: two spans in the manual
   * carry `*` INSIDE the quotes — fragments of emphasis beside a quotation mark,
   * not strings anyone put in the product. Reading them as claims would redden
   * the gate on prose, which is how a check earns the right to be ignored.
   */
  /**
   * 23.196 (U-T11b). A quotation the document's own line width broke in two used to match nothing, so it was
   * never looked up in the product. The stale sentence below wraps exactly as the manual's do.
   */
  it('23.196 — a quotation WRAPPED over a line is checked; a wrapped correct one stays green; the bound is one newline', () => {
    const baseline = { absent: [] };
    const stale = compareAbsent({
      documents: [{ id: 'd', source: 'docs/d.md', text: 'It says *"No such\nthing here"* now.' }],
      product: 'Sign out',
      baseline,
    });
    expect(stale.undeclared.map((u) => u.span)).toEqual(['No such thing here']);
    // CONTROL: the same wrap over a string the product HAS (indented continuation, as in a list item) is silent,
    // so the red above is the wrap being read and not a rule that fires on every wrapped span.
    const right = compareAbsent({
      documents: [{ id: 'd', source: 'docs/d.md', text: 'It says *"Sign\n   out"* now.' }],
      product: 'Sign out',
      baseline,
    });
    expect(right.checked).toBe(1);
    expect(right.undeclared).toEqual([]);
    // The bound: a blank line ends the search, so a stray quote cannot swallow a paragraph.
    expect(quotedSpans('a "stray\n\nb" c')).toEqual([]);
  });

  /**
   * 23.197 (U-T11b addendum). The product haystack used to include comments, so a docblock that quoted the old
   * rollup heading kept the stale manual heading green. Comments are now stripped before the lookup.
   *
   * RULE: the haystack keeps string LITERALS and walks `test/`, so a test literal that equals a doc-quoted string
   * satisfies the checker. This test therefore never spells the stale heading: STALE is assembled at run time.
   */
  it('23.197 — a stale quote that exists only inside a COMMENT is reported; the same text in a string literal is found', () => {
    const STALE = ['5 of 8 done', '2 restricted'].join(' \u00b7 ');
    const documents = [{ id: 'd', source: 'docs/d.md', text: `It reads "${STALE}" now.` }];
    const baseline = { absent: [] };
    const commented = `/** "${STALE}" */\nconst a = 1; // "${STALE}"\n`;
    const stale = compareAbsent({ documents, product: stripComments(commented), baseline });
    expect(stale.undeclared.map((u) => u.span)).toEqual([STALE]);
    // CONTROL: the same text as a string literal is the product's, so the red above is the comment being dropped.
    const live = compareAbsent({ documents, product: stripComments(`const a = '${STALE}';\n`), baseline });
    expect(live.undeclared).toEqual([]);
    // CONTROL: `//` inside a string is not a comment, and a JSX apostrophe does not swallow the next line.
    expect(stripComments("const u = 'http://x'; // gone\n")).toContain('http://x');
    expect(stripComments("<p>can't</p>\n/* gone */ const keep = 1;\n")).toContain('const keep = 1;');
    // CSS: `//` is an ordinary character in a url, but a block comment is still a comment.
    expect(stripComments('a{background:url(//cdn/x.png)} /* gone */', { lineComments: false })).not.toContain('gone');
  });

  it('15.35 — an emphasis ARTEFACT whose content carries * is not read as a product string', () => {
    expect(quotedSpans('a " — an epic * is real work" b')).toEqual([]);
    // Control: the same call DOES find a plain span, so the empty above is the
    // filter working and not the extractor matching nothing.
    expect(quotedSpans('a "a plain string" b')).toEqual(['a plain string']);
  });
});
