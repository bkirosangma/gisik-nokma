This fixture exists only to prove scripts/check-case-ids.mjs's own line-head matcher can fire on
every id-line style this repo actually uses, BEFORE that script trusts a result from the real
test-cases/ files. A matcher that returns zero on every real file is indistinguishable, from the
outside, from a matcher that cannot fire at all -- this file is what tells them apart.

- 13.90 ✅ bare style: a bare id straight after the dash, no marker, no bold
- **13.91** ✅ bold style: the id wrapped in `**`, no marker before it
- 🧪 **13.92 — marker-first style: an emoji marker, then a bold id
- ❌ **13.93 — marker-first style, a different marker: still marker-first

This sentence cites 13.99 in prose, mid-sentence, and must NOT be counted -- only line-head ids count.
