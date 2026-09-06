This fixture exists only to prove scripts/check-case-citations.mjs's extraction and malformed-id
guard fire on every shape this repo actually uses (or could plausibly produce), BEFORE that script
trusts a result from the real test-cases/ files. Expected checked ids: 90.1, 90.2, 90.3, 90.4 —
nothing else. Expected malformed lines: exactly one, naming 90.5.1.

- 90.1 ✅ bare style, trailing marker: a bare id straight after the dash, status after it
- **90.2** ✅ bold style, trailing marker: the id wrapped in `**`, status after it
- ✅ **90.3 — marker-first, bold: an emoji marker before the id, bold continues into the title
- ✅ 90.4 marker-first, bare: an emoji marker before the id, no bold at all

The four lines below use every OTHER real status marker and must NOT be counted as checked:

- 🧪 **90.10 — manual verification only, not automated
- ❌ **90.11 — not covered by anything
- 🟡 **90.12 — partially covered
- 🚫 **90.13 — out of scope, with a reason

This line renumbers rather than defining a case and must not be counted under either id:

- **90.20** → absorbed into **90.21**, which covers both together.

This line has a malformed, three-part id — `90.5.1` is not an N.M id, and must be reported as
malformed rather than silently truncated to `90.5`:

- ✅ 90.5.1 nonsense: a three-part number must not silently become 90.5

This paragraph cites 90.99 in prose, mid-sentence, and must NOT be counted — only line-head ids
in the shapes above count, exactly as check-case-ids.mjs's own fixture establishes for id
extraction generally.
