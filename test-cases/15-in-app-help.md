# 15. In-app manual & FAQ

The manual and FAQ as a **feature of the product**, not files in a repository — reachable from the web
app, the desktop app and the phone app, with no session, no network and no workspace required.

**Legend:** ✅ covered by a test · ❌ not yet · 🚫 out of scope, with a reason.

*Numbering starts at 15.1. §14 is reserved for the MCP server
(`docs/superpowers/plans/2026-09-07-mcp-server.md` Task 11), which is planned and not yet built.*

## The shared content model (`packages/app-core`)

*The markdown is parsed ONCE at build time into a closed set of block kinds. React Native cannot render
HTML, so the web's renderer can never be the phone's — parsing once is what stops three renderers from
becoming three parsers that disagree about one sentence. These cases run against the REAL generated
content rather than a fixture, because a fixture would only prove the code works on a document written
to make it work.*

- **15.1** ✅ Both documents are present, with sections and entries, and no entry has an empty id or title — (`packages/app-core/test/help/search.test.ts`)
- **15.2** ✅ Entry ids are unique within a document, so a deep link is unambiguous — (`packages/app-core/test/help/search.test.ts`)
- **15.3** ✅ The CORRECTED due-date passage survives the parse — the coverage map's own near-miss, pinned, because a build-time transform is where a carefully corrected sentence could quietly lose its correction — (`packages/app-core/test/help/search.test.ts`)
- **15.4** ✅ Emphasis survives rather than flattening to plain text; the documents mark their load-bearing claims with it — (`packages/app-core/test/help/search.test.ts`)
- **15.5** ✅ Numbered steps parse as an ORDERED list and bullets do not, both present — a hard-coded flag would make one count zero — (`packages/app-core/test/help/search.test.ts`)

## Search (`packages/app-core`)

*Currently the only search a web user can reach at all — the product has none of its own.*

- **15.6** ✅ Conjunctive and order-independent: "due date" and "date due" return the same set, and one absent term kills the query rather than falling back to OR — (`packages/app-core/test/help/search.test.ts`)
- **15.7** ✅ A title hit outranks a body mention — (`packages/app-core/test/help/search.test.ts`)
- **15.8** ✅ Says WHICH KIND of nothing it found: an empty query and a real miss are different, and the miss reports how many entries were searched, because "nothing matched" and "nothing was searched" are different failures — (`packages/app-core/test/help/search.test.ts`)
- **15.9** ✅ The excerpt shows why the entry matched, rather than being decoration — (`packages/app-core/test/help/search.test.ts`)
- **15.10** ✅ Stable: the same query twice returns the same order — (`packages/app-core/test/help/search.test.ts`)
- **15.11** ✅ `findHelpEntry` resolves a deep link, and refuses the same id under the wrong document — (`packages/app-core/test/help/search.test.ts`)
- **15.12** ✅ `spansToText` joins without inventing whitespace, so a bold word does not gain spaces — (`packages/app-core/test/help/search.test.ts`)

## The freshness gate (`scripts/help-content.mjs`)

*A generated artifact with no check against its source goes stale silently — users reading an old manual
while `docs/manual.md` says something else, with no symptom until somebody follows an instruction that
stopped being true. The parser also self-tests against planted defects before `--check` certifies
anything: a parser reporting "224 entries" tells you it ran, not that it was right.*

- **15.13** 🚫 The parser's own cases live in `scripts/help-content.mjs`'s self-test (10 cases, 4 of them planted defects) and run on every `pnpm check:help`, rather than as vitest cases — the same shape `check-runbook-commands.mjs` uses, and for the same reason: the gate must refuse to certify content when its own instrument is broken.

## The three surfaces

- **15.14** ❌ Web `/help` renders the browser and its search — *no test yet; the shared model and search are covered above, and the DOM rendering is not.*
- **15.15** ❌ Desktop reaches the same component, including from the signed-out branch.
- **15.16** ❌ Mobile's React Native screen renders the same parsed content.

*15.14–15.16 are honest ❌ rather than quiet omissions. What they would cover is the drawing, not the content or the search; both of those are pinned above, and the two DOM surfaces share one component so there is one thing to test rather than two. Owner: whoever next touches the help surfaces — most naturally alongside pre-launch checklist items 6 and 7, which will exercise these screens in a real viewport anyway.*
