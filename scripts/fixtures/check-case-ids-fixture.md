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

This sentence cites 13.99 in prose, mid-sentence, and must NOT be counted -- only line-head ids count.
