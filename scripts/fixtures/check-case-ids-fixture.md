This fixture exists only to prove scripts/check-case-ids.mjs's own line-head matcher can fire on
every id-line style this repo actually uses, BEFORE that script trusts a result from the real
test-cases/ files. A matcher that returns zero on every real file is indistinguishable, from the
outside, from a matcher that cannot fire at all -- this file is what tells them apart.

- 13.90 ✅ bare style: a bare id straight after the dash, no marker, no bold
- **13.91** ✅ bold style: the id wrapped in `**`, no marker before it
- 🧪 **13.92 — marker-first style: an emoji marker, then a bold id
- ❌ **13.93 — marker-first style, a different marker: still marker-first
- **13.91b** ✅ bold style with a LETTER SUFFIX: a distinct case from 13.91, not a second copy of it.
  The matcher captured `(\d+\.\d+)` until 2026-09-08 and read this line as `13.91`, so this fixture
  scored union 4 against sum 5 and the real sweep called `14.27`/`14.27b` and `14.88`/`14.88b`
  duplicates. This line is what makes that a self-test failure rather than a surprise on real files.
- ✅ **`13.94` — marker-first with the id BACKTICKED inside the bold.** Added 2026-09-19. This is the
  spelling that hid case `13.989` on `main` through several greens: it READS exactly like the
  marker-first line above, and the matcher required a digit immediately after the asterisks, so the
  backtick stopped it at the first character. It must be counted, and it must be counted as
  marker-first, not bold.

This sentence cites 13.99 in prose, mid-sentence, and must NOT be counted -- only line-head ids count.

- ✅ **`13.97`'s six arms** — a POSSESSIVE, not a declaration: the closing backtick is followed by `'s`, so
  the id is being USED rather than claimed, and `13.97` is not declared here. Added 2026-09-19, an hour
  after the backticked rule above landed and took `main` red with it: a CITATION of `3.72` in
  `test-cases/16-remaining-doors.md` wore marker + bold + backticked id, was read as a second declaration
  of a case that is declared once in `03-foundation-ledger.md`, and the sweep reported
  `union 2447 < sum 2448, DUPLICATE 3.72`. It must NOT be counted — and note the direction it fails in:
  a citation in the declaration shape does not merely escape the guard, **it INVENTS a duplicate**, which
  is the loud-but-wrong direction this file has now recorded three times.

- `13.95`/`13.96` retired (a note ABOUT ids, not a declaration) -- and it must NOT be counted either.
  This line is the REASON the backticked rule is restricted to bold: a bare optional backtick made
  bullets like `- `13.439`/`13.444` retired (their subject ...)` match on real files, which gained four
  lines and manufactured three DUPLICATE ids (13.439, 13.447, 13.517) in a measured simulation. A
  marker AND bold must both be present, so a prose bullet that merely begins with a quoted id is not an
  id line. Without this line, loosening the rule again would pass this self-test.
