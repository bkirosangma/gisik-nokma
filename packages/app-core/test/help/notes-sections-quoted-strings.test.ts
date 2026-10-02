import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareAbsent, productText, quotedSpans } from '../../../../scripts/help-content.mjs';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { entryText } from '../../src/help/types.js';
import type { HelpEntry } from '../../src/help/types.js';

/**
 * Case 15.37 — every quoted UI string the help-notes task wrote is real
 * product copy, checked against the ACTUAL source under `apps/` and
 * `packages/` rather than a fixture.
 *
 * ## Why this is not a duplicate of case 15.35
 *
 * 15.35 (`corpus-vs-product.test.ts`) pins the RATCHET's own semantics
 * against small fixtures — it deliberately never reads the real corpus or
 * the real product, and its own docblock says the end-to-end sweep over the
 * whole corpus belongs in `pnpm check:help`, not a package unit suite. This
 * case is narrower and does the opposite on purpose: it reads the REAL
 * product tree, but only for the small set of entries this task wrote —
 * the notes sections, and (from Unit 4) the starting-status and board-badge
 * passages — rather than the whole corpus. `check:help` already covers the
 * whole corpus in CI; this pins the sub-claim that matters for review: the
 * strings THIS TASK introduced are genuine — the notes sections (Units 1-2)
 * and the starting-status / board-badge passages (Unit 4).
 *
 * ## Why the strings are never written as literals here
 *
 * 15.35's own gate treats every file under `apps/` and `packages/` as
 * product text EXCEPT `content.generated.ts` — and this file lives under
 * `packages/`. Typing one of the checked strings into this file would make
 * the gate find it here and call it "found in the product" for the wrong
 * reason (the same defect class 15.35's own docblock records for its first
 * draft). So every string here is read out of the ALREADY-PARSED generated
 * content at runtime (`entryText`), never typed into this source file.
 *
 * ## What "the source" is
 *
 * `productText(REPO_ROOT)` — the same function `check:help` calls, walking
 * `apps/` and `packages/`, excluding `content.generated.ts` (a copy of the
 * corpus, which would make every quoted string "found" inside itself) and, since F-7
 * (2026-10-02), every test file and test directory (`isTestPath`): a string only a test
 * asserts is not one the product shows.
 *
 * Mutation witnessed: hand-editing one checked entry's quoted string to a
 * value no product file contains reddened `missing`, naming that string;
 * reverting restored green. Not left in the file as a planted case, because
 * unlike `help-content.mjs`'s own self-test this does not certify a parser —
 * it certifies THIS TASK's prose, which a planted defect cannot stand in for.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function entries(documentId: 'manual' | 'faq', sectionId: string, titles?: readonly string[]): HelpEntry[] {
  const doc = HELP_CONTENT.find((d) => d.id === documentId);
  if (doc === undefined) throw new Error(`no help document "${documentId}"`);
  const section = doc.sections.find((s) => s.id === sectionId);
  if (section === undefined) throw new Error(`no section "${sectionId}" in "${documentId}"`);
  if (titles === undefined) return [...section.entries];
  const found = section.entries.filter((entry) => titles.includes(entry.title));
  // A title that no longer matches (a rename, a typo here) would silently
  // shrink the checked set rather than error — that is a false GREEN this
  // case exists to prevent, so a mismatch fails loudly instead.
  if (found.length !== titles.length) {
    throw new Error(
      `entries(${documentId}, ${sectionId}): expected ${titles.length} titles, found ${found.length} — ` +
        `have: ${section.entries.map((entry) => entry.title).join(' | ')}`,
    );
  }
  return found;
}

/**
 * Every entry this task wrote or edited. The manual's §15 and the FAQ's
 * Notes section are wholly new, so every one of their entries qualifies;
 * the touched entries elsewhere name only the specific ### subsections (or
 * FAQ questions) this task's Unit 4 actually changed — an untouched sibling
 * entry is not this task's claim to verify.
 */
function touchedEntries(): HelpEntry[] {
  return [
    ...entries('manual', '15-notes'),
    ...entries('faq', 'notes'),
    // Unit 4 (starting-status, board card badges): the specific ### entries
    // and FAQ questions this task edited, not their untouched siblings.
    ...entries('manual', '5-adding-a-ticket-and-what-you-can-change-about-it', [
      'Adding a ticket',
      'The things you cannot do to a ticket',
    ]),
    ...entries('manual', '8-looking-at-the-work', ['Board']),
    ...entries('manual', '11-setting-up-your-own-states-owners-and-admins', ['Building one']),
    ...entries('faq', 'tickets', [
      'Can I set the dates when I create the ticket, instead of afterwards?',
      'Can I choose which state a new ticket starts in?',
    ]),
    ...entries('faq', 'boards-lists-and-dates', [
      'Can a new ticket start in a column other than the first?',
      'Why is there no Add button on this column?',
      'What do the coloured badges on a card mean?',
    ]),
  ];
}

describe('15.37 every quoted UI string the help-notes task wrote is real product copy', () => {
  /**
   * Same rule `check:help` applies to the whole corpus (`compareAbsent`,
   * ratcheted against the real `help-quoted-strings-absent.json`), not a
   * stricter one — a touched ### entry carries pre-existing prose this task
   * never wrote too, including the manual's own worked examples (fictional
   * ticket titles and the like), and those are legitimately in the baseline
   * already. Naming this without quoting it is deliberate, for the same
   * reason `corpus-vs-product.test.ts`'s own docblock gives and demonstrates
   * the hard way: this file is itself under `packages/`, inside the real
   * gate's haystack, so a literal quote in a comment here would make the
   * baseline read as rotted the moment this file exists — which is exactly
   * what happened the first time this docblock named one by quoting it.
   * A blanket "must-be-in-product" check over the whole entry ALSO flagged
   * eight such pre-existing, already-baselined spans as failures the first
   * time this case was written — not a defect in the prose, a defect in the
   * check, fixed by matching `check:help`'s own ratcheted rule instead.
   */
  // 20 s (neo main-sync gate, 2026-10-02): the haystack walk over `apps/` + `packages/` is the cost, and under load 41→77 it took
  // 5328 ms against the 5000 ms default. It asserts a set, never a duration. Same precedent as #898 and #918; the global
  // `testTimeout` is unchanged. The control below runs the same walk, so it carries the same value.
  it('15.37 no quoted span in the task’s entries is undeclared-absent from apps/ + packages/', () => {
    const text = touchedEntries()
      .map((entry) => entryText(entry))
      .join('\n');
    const spans = quotedSpans(text);
    // A sanity floor, not a fixture: if this drops to zero, the entry lookup
    // above broke and the assertion below would pass vacuously.
    expect(spans.length).toBeGreaterThan(0);

    const baseline = JSON.parse(readFileSync(resolve(REPO_ROOT, 'scripts/help-quoted-strings-absent.json'), 'utf8'));
    const { undeclared } = compareAbsent({
      documents: [{ source: 'help-notes task entries', text }],
      product: productText(REPO_ROOT),
      baseline,
    });
    expect(undeclared).toEqual([]);
  }, 20_000);

  /**
   * The control half: a span that is deliberately NOT product copy (an
   * invented literal) must be caught by the same comparison this case uses
   * — otherwise a `missing` array that is always empty would pass whether
   * or not the real check does any work.
   *
   * The invented phrase is assembled from two halves at runtime rather than
   * written as one literal — this file is itself under `packages/`, inside
   * `productText`'s own haystack, and a literal match here would make the
   * control find itself, the exact defect 15.35's own docblock records for
   * its first draft (`corpus-vs-product.test.ts`'s docblock names it too).
   */
  it('15.37 control: an invented quoted string, undeclared in the baseline, is caught by the SAME compareAbsent call', () => {
    const half1 = 'a string nothing';
    const half2 = 'in the product says';
    const { undeclared } = compareAbsent({
      documents: [{ source: 'control', text: `This sentence quotes "${half1} ${half2}".` }],
      product: productText(REPO_ROOT),
      baseline: { absent: [] },
    });
    expect(undeclared).toEqual([{ source: 'control', span: `${half1} ${half2}` }]);
  }, 20_000);
});
