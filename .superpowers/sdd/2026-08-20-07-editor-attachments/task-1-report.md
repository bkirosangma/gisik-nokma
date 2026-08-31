# Task 1 — `packages/editor` scaffold and document schema v1

**Status: DONE_WITH_CONCERNS** (concerns are inherited-contract notes for later tasks, not
defects in this change set; enumerated at the end).

Branch `exec/07-editor-client`, worktree `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8`.
Base HEAD `0b969eb`.

---

## Gate result

`export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && pnpm turbo run build test typecheck`

```
 Tasks:    18 successful, 18 total
```

**18/18**, up from 15/15. Six workspaces × three tasks; `@gisik-nokma/editor` contributes the
three new ones.

Per-package test counts after the change:

| package | tests |
|---|---|
| `@gisik-nokma/domain` | 163 |
| `@gisik-nokma/rule-engine` | 115 |
| `@gisik-nokma/server` | 93 |
| `@gisik-nokma/ui` | 31 |
| `@gisik-nokma/app-core` | 5 |
| **`@gisik-nokma/editor` (new)** | **16** |
| **total** | **423** |

**The dispatch's baseline of 371 is stale.** The five pre-existing workspaces sum to **407**, not
371, at base HEAD `0b969eb` — and this change touches none of them (`git status` shows exactly
`M pnpm-lock.yaml` plus the untracked `packages/editor/`), so the arithmetic is
407 + 16 = 423 by construction rather than by measurement. Nothing was lost; the number the
dispatch carried was taken before the last few commits on this branch landed.

`pnpm install --frozen-lockfile` exits 0 against the committed lockfile, so the gate auto-merge
depends on will not trip on a stale lock.

---

## A3 — the full probe output

Nothing was installed when this task began (`node_modules/@tiptap` absent, zero tiptap entries in
`pnpm-lock.yaml`), so every claim below is from the installed tree, not from the plan text.

**Registry check before writing the manifest.** All thirteen `@tiptap/*` packages the plan names
publish `3.30.5` as `latest`, so every `^3.22.3` range resolves and none had to be substituted.
`@tiptap/extension-placeholder` — A3's flagged candidate for having been folded into a plural
`@tiptap/extensions` — still publishes independently at 3.30.5. (`@tiptap/extensions` also exists;
the standalone package remains the right import.)

**Installed resolution: every package at `3.30.5`.**

Named-export dump (`Object.keys` of each module):

```
@tiptap/extension-document      ["Document","default"]
@tiptap/extension-link          ["Link","default","isAllowedUri","pasteRegex"]
@tiptap/extension-placeholder   ["Placeholder","default"]
@tiptap/extension-table         ["DEFAULT_CELL_LINE_SEPARATOR","Table","TableCell","TableHeader",
                                 "TableKit","TableRow","TableView","createColGroup","createTable",
                                 "escapeTableCellPipes","preprocessTablePipes",
                                 "renderTableToMarkdown","updateColumns"]
@tiptap/extension-table-row     ["TableRow","default"]
@tiptap/extension-table-header  ["TableHeader","default"]
@tiptap/extension-table-cell    ["TableCell","default"]
@tiptap/suggestion              ["Suggestion","SuggestionPluginKey","default","exitSuggestion",
                                 "findSuggestionMatch"]
@tiptap/starter-kit             ["StarterKit","default"]
```

`@tiptap/core` exports 148 names. The ones that mattered here are `Editor`, `Extensions` (type),
`getSchema` and `resolveExtensions`; A3 asks for the full dump, so here it is in full:

```
CommandManager DECORATION_MANAGER_PLUGIN_KEY Decoration DecorationManager Editor Extendable
Extension Fragment InlineDecoration InputRule MappablePosition Mark MarkView Node NodeDecoration
NodePos NodeView PasteRule ResizableNodeView ResizableNodeview Tracker WidgetDecoration
attrsEqual callOrReturn canInsertNode combineTransactionSteps commands
createAtomBlockMarkdownSpec createBlockMarkdownSpec createChainableState createDocument
createElement createInlineMarkdownSpec createMappablePosition createNodeFromContent
createStyleTag createWidgetDecoration decodeHtmlEntities defaultBlockAt deleteProps
elementFromString encodeHtmlEntities escapeForRegEx extensions findChildren findChildrenInRange
findDuplicates findParentNode findParentNodeClosestToPos flattenExtensions fromString
generateHTML generateJSON generateText getAttributes getAttributesFromExtensions
getChangedRanges getDebugJSON getExtensionField getHTMLFromFragment getMarkAttributes
getMarkRange getMarkType getMarksBetween getNodeAtPosition getNodeAttributes getNodeType
getPreviousBlockSibling getRenderedAttributes getSchema getSchemaByResolvedExtensions
getSchemaTypeByName getSchemaTypeNameByName getSplittedAttributes getStyleProperty getText
getTextBetween getTextContentFromNodes getTextSerializersFromSchema getUpdatedPosition h
injectExtensionAttributesToParseRule inputRulesPlugin isActive isAndroid isAtEndOfNode
isAtStartOfNode isEmptyObject isExtensionRulesEnabled isFirefox isFunction isList isMacOS
isMarkActive isNodeActive isNodeEmpty isNodeSelection isNodeViewSelected isNumber isPlainObject
isProseMirrorAddMarkStep isProseMirrorAddNodeMarkStep isProseMirrorAttrStep
isProseMirrorCellSelection isProseMirrorDocAttrStep isProseMirrorFragment
isProseMirrorNodeSelection isProseMirrorRemoveMarkStep isProseMirrorRemoveNodeMarkStep
isProseMirrorReplaceAroundStep isProseMirrorReplaceStep isProseMirrorSlice isProseMirrorStep
isProseMirrorStepResult isRegExp isSafari isString isTextSelection isiOS liveWidgetKeys
markInputRule markPasteRule markdown marksEqual mergeAttributes mergeDeep minMax nodeInputRule
nodePasteRule objectIncludes parseAttributes parseIndentedBlocks pasteRulesPlugin posToDOMRect
removeDuplicates renderNestedMarkdownContent resolveExtensions resolveFocusPosition
rewriteUnknownContent selectionToInsertionEnd serializeAttributes sortExtensions splitExtensions
textInputRule textPasteRule textblockTypeInputRule updateMarkViewAttributes wrappingInputRule
```

**Every capitalised named export the plan assumed exists. No substitutions were required, so there
is nothing for the commit message to record on that score.**

**One named type was added to the public API that the brief's verbatim `index.ts` block does not
carry: `MentionCandidate`.** The brief is inconsistent with itself here — its Produces contract
writes `queryUsers?: (query: string) => Promise<MentionCandidate[]>`, naming the type, while its
`extensions.ts` code block inlines the same shape as `Array<{ userId: string; name: string }>` and
its `index.ts` block exports no such name. Consumers cannot satisfy the Produces signature against
an anonymous inline type, and Task 4 builds the mention picker on it, so the type is declared and
re-exported (`export { …, type MentionCandidate }`). The structural shape is byte-identical to the
brief's inline form; only the name is new. Flagged because it is an API-surface addition the
controller will meet in the diff.

One further deviation from the brief's code block, in the safe direction: the brief writes
`import StarterKit from '@tiptap/starter-kit'` (default) while importing everything else by name.
The probe shows `StarterKit` is a named export, so it is imported by name like its siblings — one
convention in the file instead of two, and consistent with the knowledge-base lesson the plan cites.

### StarterKit's actual composition — and the finding that changed the schema

```
STARTERKIT NODES: ["paragraph","blockquote","bulletList","codeBlock","doc","hardBreak",
                   "heading","horizontalRule","listItem","orderedList","text"]
STARTERKIT MARKS: ["link","bold","code","italic","strike","underline"]
STARTERKIT RESOLVED EXTENSIONS: ["link","paragraph","listItemBranchingDeleteKeymap","starterKit",
  "bold","blockquote","bulletList","code","codeBlock","doc","dropCursor","gapCursor","hardBreak",
  "heading","undoRedo","horizontalRule","italic","listItem","listKeymap","orderedList","strike",
  "text","underline","trailingNode"]
```

Reconciled against `StarterKit.configure`'s legal option keys, read from
`node_modules/@tiptap/starter-kit/dist/index.d.ts` (runtime keys cannot answer this — the failure
would be a type error, not a runtime one):

- **`document: false` is legal and required.** Typed as literally `false` (no options object).
  StarterKit bundles `doc`; without the disable, `VersionedDocument` would double-register.
- **`link: false` is legal and required.** StarterKit v3.30.5 **does** bundle Link — the brief's
  two-sided risk resolves to the safe side, and the key must stay. Dropping it would double-register
  the mark; the key being invalid was the other possibility and it did not materialise.
- **`underline: false` — ADDED, and it is the substantive finding of this task.**
  **StarterKit bundles an `underline` mark. Schema v1's mark vocabulary is `bold`, `italic`,
  `strike`, `code`, `link` — five, not six.** Nothing in the brief disables it, and nothing in the
  brief's test would have noticed: its assertions are `toContain`, so a sixth mark passes. Left
  alone, every client would have accepted and stored an `underline` mark that no spec text names
  and no toolbar would offer, and the drift would have been invisible until some other client
  refused a document this one produced. `underline` is a legal `| false` option key, so the fix is
  one line. See "the closed vocabulary" below for the check that now makes this un-regressable.

`Table`, `TableRow`, `TableHeader` and `TableCell` are **not** in StarterKit, so the explicit
imports do not collide and need no disable keys. `dropCursor`, `gapCursor`, `undoRedo`,
`listKeymap`, `listItemBranchingDeleteKeymap` and `trailingNode` contribute no schema types and are
correctly left alone (`trailingNode` has a behavioural consequence — recorded under Concerns).

---

## The closed vocabulary is now a check, not an adjective

The brief's first test asserts `toContain` for each expected node and mark. That is a one-sided
check: it proves nothing went missing and says nothing about what arrived uninvited. The spec calls
the vocabulary **closed**, so a second case asserts **set equality** in both directions, against
lists held in the test file:

```
it('exposes NOTHING the spec does not name — the vocabulary is closed', ...)
```

Falsifiability, with `md5` proving each restoration (never any `diff`-family output):

| mutant | pristine md5 | mutant md5 | result |
|---|---|---|---|
| remove `underline: false` from `extensions.ts` | `a9493e44…` | `769dee1f…` | **1 failed, 7 passed** — dies *only* on the new closed-vocabulary case; the brief's `toContain` case stayed green, which is precisely the hole |
| remove `TableCell` from the extension list | `a9493e44…` | `8a888681…` | **8 failed** — the schema cannot be constructed at all |

Restored file md5 `a9493e44478c06c587d551593ea2b481`, identical to pristine.

The lists live in the test rather than in `src`. They are a contract statement, and Tasks 3 and 4
widen them by one line each when they add `image` and `mention` — which is the intended cost of
"closed". No unplanned public export was added to the package's API surface for them.

---

## Conformance to `doc-text.ts` — turned from a claim into a check

`packages/domain/src/doc-text.ts` names Plan 7's editor as the thing that conforms to it. Read in
full. **No irreconcilable conflict — nothing is BLOCKED.** Schema v1's node names are all in the
walker's accepted camelCase set; the doc node's `attrs.schemaVersion` is invisible to it (doc attrs
are never read); the mention shape it fixes is Task 4's to honour, not Task 1's.

That conformance was going to survive as a sentence in a comment, so it is now
`test/doc-text-conformance.test.ts` (5 cases) — real editor output fed through the shipped walker,
not hand-written JSON that could agree with the walker while the editor disagreed with both.
`@gisik-nokma/domain` was already a declared dependency of this package.

**`doc-text.ts` was NOT modified.** It was temporarily mutated to prove the cases can fail, then
restored; pristine md5 `55a9a261ddf88a45d4d2892e6bb95efe`, final md5 identical, and
`git status --porcelain packages/domain` prints nothing.

Mutant sweep, deleting one entry at a time from the walker's `BLOCK_NODE_TYPES`:

| deleted entry | result |
|---|---|
| `paragraph` | **2 failed** |
| `heading` | **1 failed** |
| `codeBlock` | **1 failed** |
| `hardBreak` arm (whole branch) | **1 failed** |
| `doc` | survives |
| `blockquote` | survives |
| `bulletList` | survives |
| `listItem` | survives |

**`codeBlock` survived the first sweep and that was a real hole in my test**, not a fact about the
walker: the codeBlock was the last block in the fixture, and a trailing newline is trimmed away, so
the walker could forget codeBlock was a block and still produce the expected string. A paragraph now
follows it and the mutant dies. All three textblock types are pinned.

**The four survivors cannot be pinned and the test file says so in a comment.** `doc`, `blockquote`,
`bulletList` and `listItem` contain only other blocks in schema v1, so the child emits the newline
regardless and the walker's `\n{2,}` collapse hides the duplicate. Their entries are inert for this
editor's output. Recorded so a later reader does not mistake these five cases for whole-set coverage.

One case documents a fact worth knowing: **tables render one cell per line only by accident of
nesting.** `table`/`tableRow`/`tableHeader`/`tableCell` are all unknown to the walker; a cell's
content is a `paragraph`, which is known. A cell whose content stopped being a paragraph would fuse
an entire row into one unbroken string in `proj_search` and in notifications, with nothing else in
the system reporting it.

---

## Heading levels 1–6 — the one Produces clause the tests did not reach

The contract says `heading (levels 1–6)`, and the suite exercises only level 1 (typed via the input
rule) and level 2 (fixture). Probed directly: each of levels 1–6 was `setContent` with
`errorOnInvalidContent: true` and re-serialised.

```
level 1 -> type=heading level=1        level 4 -> type=heading level=4
level 2 -> type=heading level=2        level 5 -> type=heading level=5
level 3 -> type=heading level=3        level 6 -> type=heading level=6
```

All six round-trip with the level intact and none is refused or clamped, so StarterKit's Heading
default of `[1,2,3,4,5,6]` matches the contract and there is nothing to fix. Recorded as a probe
rather than added as a test: the complementary claim (a level-7 heading is refused) would NOT hold,
because ProseMirror validates attribute *names*, not their values, so an out-of-range level is not
the kind of thing `errorOnInvalidContent` catches. A test asserting only the positive half is worth
less than this recorded probe, and one asserting the negative half would fail for reasons outside
the brief's contract.

---

## Falsifiability of the brief's planted defect

Step 4, against the pre-fix state (`src/` did not yet exist), verbatim:

```
FAIL  test/schema.test.ts [ test/schema.test.ts ]
Error: Failed to resolve import "../src/doc.js" from "test/schema.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: .../packages/editor/test/schema.test.ts:2:56
 Test Files  1 failed (1)
      Tests  no tests
```

The `marquee` refusal itself is only as load-bearing as the flag that produces it, so a seventh case
pins the contrast: **without `errorOnInvalidContent`, the same document is silently stripped.**
Tiptap logs `[tiptap warn]: Invalid content … RangeError: Unknown node type: marquee` to stderr and
returns normally, so a caller that forgets the flag stores a document missing content the user
wrote. That case is why the refusal test cannot pass for an unrelated reason.

---

## Binding adaptations — disposition

- **A1 (second tsconfig) — applied, and it immediately earned itself.** `tsconfig.typecheck.json`
  (`noEmit`, `include: ["src","test"]`) alongside the build config, shape copied from
  `packages/ui`'s (repeats `jsx` and `lib` because `extends` does not inherit from a sibling).
  `typecheck` points at it. **The brief's form would have shipped a broken helper**: see
  `type-text.ts` below, an error that lives in `test/` and that `include: ["src"]` never sees.
- **A2 (`@types/node`) — applied** at `^22.10.0`, with **no `types` field** in either tsconfig,
  matching `packages/ui`.
- **A3 (probe everything) — applied.** Full output above; `underline` was the finding.
- **A4 (manifest shape) — applied.** `0.1.0`, `private: true`, conditional exports with explicit
  `types` conditions on both `.` and `./webview-bridge`, `main`/`types` retained alongside.
- **A5 (`verbatimModuleSyntax`/`isolatedModules`/`noUncheckedIndexedAccess`) — honoured.**
  `import type` throughout, `export { …, type DocJson }`, and every array index in the tests guarded
  through optional chaining.
- **A6 (keep `vite ^6.0.0`) — applied.** The lockfile now carries `vite@6.4.3` and `vite@7.3.6`.
  **The predicted peer warning did not materialise** — `pnpm install` reported no peer or unmet-peer
  lines at all, only two pre-existing deprecated-subdependency warnings (`glob@11.0.3`,
  `whatwg-encoding@3.1.1`) unrelated to this package. Worth noting that vitest 3.2.7 runs the tests
  on vite **7.3.6** regardless of the declared `^6`; the `^6` pin exists for Task 15's
  `build:webview` with `@vitejs/plugin-react ^4.3.4`, which is where it will actually matter.
- **A17 (lane 4's React conventions) — applied.** `react`/`react-dom` `^19.0.0` in **both**
  `peerDependencies` and `devDependencies`; `@testing-library/react` aligned **up** to `^16.2.0`;
  `@testing-library/jest-dom ^6.6.3`, `@testing-library/user-event ^14.6.1`, `@types/react ^19.0.0`,
  `@types/react-dom ^19.0.0`, `jsdom ^25.0.1`, `typescript ^5.6.3`, `vitest ^3.1.0`.
  `vitest.config.ts` carries **`esbuild: { jsx: 'automatic' }`** and the
  `['test/**/*.test.{ts,tsx}']` glob. **No `test/setup.ts`** — Task 1 renders no React and RTL's
  cleanup has nothing to clean; the task that adds the first `.tsx` test should add it, wired via
  `setupFiles`, copying `packages/ui/test/setup.ts` (its comment explains why `afterEach(cleanup)`
  must be wired by hand under explicit-import hooks).

---

## `type-text.ts` — the brief's version does not compile, and the reason is semantic

`tsc` on `tsconfig.typecheck.json`:

```
test/helpers/type-text.ts(15,67): error TS2554: Expected 5 arguments, but got 4.
```

The installed prosemirror-view declares

```ts
handleTextInput?: (this: P, view: EditorView, from: number, to: number,
                   text: string, deflt: () => Transaction) => boolean | void;
```

The fifth argument is not padding: `deflt` builds the transaction the editor would have applied
unaided, and a handler is entitled to call it — several compose with it rather than replacing it.
The brief's four-argument call hands such a handler `undefined`, and it dies on
`deflt is not a function`. No schema test would ever reach that. The helper now passes the same
factory the fallback dispatches, so the default transaction has **one** definition instead of two
that could drift.

**This is the error A1 exists to catch.** Under the brief's single-tsconfig form, `typecheck` reads
`include: ["src"]`, `test/` is never checked, and this ships into eleven tasks that all call
`typeText`.

Because the helper's call semantics changed, it is no longer untested: `test/type-text.test.ts`
(3 cases) proves it **drives input rules** — typing `# GST filing` yields a `heading` node — with a
contrast case showing `insertContent('# GST filing')` leaves a `paragraph` holding the literal text.
A helper that quietly stopped driving input rules would leave every downstream test asserting
against documents no user could produce, while staying green, because the text would still be there.

---

## Colour-discipline scanner

Creating `packages/editor/src` activates lane 4's repo-wide scanner, which names
`packages/editor/src` in `CLIENT_SOURCE_ROOTS` and skips trees that do not exist.

**`packages/ui` passes: 31/31, unchanged.** That is asserted twice over — by the full 18/18 gate
above, and by running its suite directly after the change.

Green *for the right reason*, not because the tree was skipped: planting
`const brand = '#ff0000';` in `packages/editor/src/doc.ts` **fails**
`packages/ui/test/token-discipline.test.ts` (`1 failed | 3 passed`, "colour literals outside the
origin"). Restored; pristine md5 `366b19c22b2f986e4687c863121dbf81`, final md5 identical, and the
suite is back to 31/31. **From here, a colour literal anywhere in `packages/editor` fails a test in
a package this lane does not own** — Task 7 onward should take colours from
`packages/ui/src/tokens.ts`, the one legal origin.

---

## Concerns (the DONE_WITH_CONCERNS)

1. **`trailingNode` mutates documents, asymmetrically, and every later task will meet it.**
   StarterKit v3.30.5 bundles `trailingNode`, which appends an empty paragraph when the document
   ends with a non-paragraph block. It is an `appendTransaction` plugin, so **initial content is
   untouched and the first keystroke changes the document**: loading `{doc:[heading]}` yields
   exactly that back, but typing `# GST filing` yields `[heading, paragraph]` and
   `getText() === 'GST filing\n\n'`. Kept — it adds no node or mark type, so the closed vocabulary
   is unaffected, it round-trips stably, `docToPlainText` is unbothered (pinned by a conformance
   case), and switching off a StarterKit editing affordance is not Task 1's call. But a later task
   asserting "the document has exactly one node after typing a heading" will be wrong, and it is
   pinned in both `type-text.test.ts` and `doc-text-conformance.test.ts` so the behaviour is stated
   rather than rediscovered eleven times. **If the product decides a stored document must not gain
   content the user did not write, `trailingNode: false` is a one-line change here** — flagging it
   as a product question rather than deciding it.
2. **`./webview-bridge` points at `dist/webview/bridge.js`, which Task 1 does not emit.** Inert:
   nothing imports it, and neither `tsc` nor pnpm validates `exports` targets. It resolves when
   Task 15 lands the bridge. Recorded rather than left silent.
3. **`build:webview` references `vite.webview.config.ts`, which does not exist yet.** Kept per the
   brief. No turbo task runs it, so the gate never invokes it; Task 15 creates the config.
4. **Two vite majors in the lockfile** (6.4.3 declared, 7.3.6 via vitest) — A6's accepted
   duplication, not breakage. Recorded so a later reader does not "fix" it into a broken Task 15.
5. **The dispatch's 371-test baseline is stale**; the real pre-change total is 407. See the gate
   table. No tests were lost.

Per the dispatch, **no `Features.md` or `test-cases/` entries** were written — the catalogue is a
separate closing change set. `packages/editor` will need entries there.

---
---

# Fix round 1 — `linkOnPaste`, the behavioural-option sweep, and four minors

Second commit on this task. Gate re-run: **18/18 turbo tasks, 429 tests**, up from 423 —
`@gisik-nokma/editor` 16 → **22**; `domain` 163, `rule-engine` 115, `server` 93, `ui` 31,
`app-core` 5 all unchanged.

---

## IMPORTANT — `linkOnPaste` left at the library default, under a comment claiming the opposite

**Confirmed independently against the installed tree before changing anything.**

`node_modules/@tiptap/extension-link/dist/index.js`:

```
324:            linkOnPaste: true,                                    ← addOptions() default
502:    if (this.options.linkOnPaste) plugins.push(pasteHandler({     ← conditional registration
253:            key: new PluginKey("handlePasteLink"),                ← the plugin it registers
```

And the resolved options of the shipped `Link.configure` call, dumped from the built extension
list, carried `"linkOnPaste":true` alongside the `"autolink":false` set two properties away.

The ruling is right and the reasoning holds on all three grounds. The one detail worth adding from
reading `pasteHandler` itself: the handler returns early when the selection is **empty**
(`if (empty) return false`), so the defect fires when a URL is pasted **over selected text**, not on
every paste. That narrows the blast radius; it does not change the verdict, because pasting a URL
over a selected phrase is the ordinary way a person links a phrase, and it was the one path where
doing so silently produced markup.

**`linkOnPaste: false` is set.** Recorded here as a **deviation from the plan's verbatim config**,
ruled by the controller in review round 1, on the grounds that spec §2 says "nothing silently
becomes markup", that `autolink: false` is its typed-side sibling in the same call, and that it is
the same defect class as `underline` — an unaudited library default entering the single origin of
the document schema.

`markdownLinks: false` is now also **stated explicitly** rather than left implicit. The library
already defaults it false, so this changes no behaviour; it is written down because it is the third
path by which text becomes link markup (pasted `[text](url)` syntax), and "correct by accident"
and "correct on purpose" look identical until someone edits the call. The comment in
`extensions.ts` now enumerates all three paths instead of the two the plan named.

### Falsifiability — the plugin, not the option value

Three cases, in a new `describe('behavioural options that spec §2 constrains')`:

1. **Structural** — `editor.state.plugins` contains no plugin keyed `handlePasteLink` (and none
   keyed `autolink`). This is the check the ruling asked for: it proves the **wiring is gone**,
   where asserting `options.linkOnPaste === false` would only echo the source file back.
2. **Behavioural** — with 'the portal' selected, a `Slice` carrying `https://gst.gov.in` is pushed
   through `view.someProp('handlePaste', …)`. No handler claims it and no `link` mark appears.
3. **Option-level** — the four Link options and `table.resizable` are pinned so a later edit cannot
   drop one silently.

Mutant: delete the `linkOnPaste: false` line, restoring the library default.

| | md5 | result |
|---|---|---|
| pristine | `3b892700d23e68f7b336087175f541b3` | 13 passed |
| mutant | `010505e2951378fd735c7a88b76fcd06` | **3 failed, 9 passed (12)** |
| restored | `3b892700d23e68f7b336087175f541b3` | identical to pristine |

> **Correction (fix round 2).** These two rows were run at different moments and the table put
> them side by side as if they were comparable: the mutant ran on a 12-case file, the pristine row
> after the heading option pin took it to 13. Three cases die either way — the substance holds —
> but the row is not a like-for-like pair. Fix round 2 re-ran every mutant against one fixed file;
> see that round's table for figures that are internally consistent.

All three new cases die. The behavioural one fails with **`expected true to be falsy`** — the paste
handler *ran and returned true*, meaning it applied the link mark. That is the defect reproduced
directly, not inferred from a config value.

---

## The general form: a resolved-option sweep of every configured extension

Set-equality proved the vocabulary. Nothing proved the behaviour, and the two failure modes are
different in kind: an extra node type is a thing a document may CONTAIN, while an option is a thing
the editor DOES to a document — it can alter a user's content without adding a single node or mark,
so no vocabulary check would ever see it.

`resolveExtensions(buildEditorExtensions())` was dumped, every extension's `.options` printed. All
28 resolved extensions were read. Findings against stated constraints:

| extension | resolved options | verdict |
|---|---|---|
| `link` | `openOnClick:false, autolink:false, **linkOnPaste:true**, markdownLinks:false, protocols:[], defaultProtocol:'http', HTMLAttributes:{target:'_blank', rel:'noopener noreferrer nofollow'}` | **the defect above** |
| `heading` | `levels:[1,2,3,4,5,6]` | matches the Produces clause; now pinned (minor 1) |
| `table` | `resizable:false, lastColumnResizable:true, allowTableNodeSelection:false` | `resizable:false` set; the other two are inert while it is false |
| `trailingNode` | `notAfter:[]` | ruled **keep** by the controller; unchanged |
| `codeBlock` | `exitOnTripleEnter/ArrowDown/ArrowUp:true, tabSize:4, enableTabIndentation:false` | editing affordances; transform no content, constrain nothing |
| `dropCursor` | `color:'currentColor', width:1` | a keyword, not a colour literal — the colour scanner is not engaged |
| `placeholder` | `showOnlyWhenEditable:true, showOnlyCurrent:true` | UX defaults; flagged for Task 7 below |
| `bulletList`/`orderedList` | `keepMarks:false, keepAttributes:false` | no constraint |
| `hardBreak` | `keepMarks:true` | no constraint |
| `undoRedo` | `depth:100, newGroupDelay:500` | no constraint |
| `listKeymap` | `listTypes` naming `taskItem`/`taskList` | references node types outside v1 that do not exist, so it can never match — and the set-equality test independently proves they are not in the schema |
| everything else | `{}` or `HTMLAttributes:{}` | nothing |

**`linkOnPaste` was the only option contradicting a stated constraint.** Two non-defects worth
handing forward rather than burying:

- **`defaultProtocol: 'http'`** — not `https`.

  > **Correction (fix round 2): the mechanism stated here was wrong, and so was "does not fire
  > today".** `setLink` passes `defaultProtocol` only into `isAllowedUri`'s ctx, and the default
  > `isAllowedUri` ignores it — setting `defaultProtocol: 'https'` was tried and a pasted bare
  > domain still resolved to `http://gst.gov.in`. The `http` comes from linkifyjs's own `find()`
  > default: extension-link calls `find(text)` with NO options at `dist:450`, the live
  > `addPasteRules` path, while the `find(textContent, { defaultProtocol })` at `dist:264` sits on
  > the `pasteHandler` path that `linkOnPaste: false` shut off. And it is not dormant — **bare
  > domains already become `http://` links on paste today**, which is the fourth-path defect below.
  > Task 7 cannot fix this by setting the option.
- **`placeholder.showOnlyCurrent: true`** — the placeholder shows only on the focused node, not on
  every empty one. Task 7 should confirm that is the intended behaviour for an empty comment box.

`Link`'s `rel: 'noopener noreferrer nofollow'` and `target: '_blank'` defaults are the safe ones and
are left alone.

---

## The four minors

**1. `heading (levels 1–6)` — it took TWO checks, and the first one I wrote was not enough.**

The obvious pin (levels 1–6 round-trip under `errorOnInvalidContent`) was written, then mutated:
configuring `heading: { levels: [1,2,3] }` **survived it**. That is not a weak test so much as a
fact about Tiptap — the `levels` option governs what the toolbar and input rules OFFER and places no
constraint whatsoever on what a document may store, so a level-6 heading round-trips intact under
`levels: [1,2,3]`, exactly as `level: 99` does. The clause spans two separate things and each check
is blind to the other's failure, so both are now asserted:

| mutant | md5 | round-trip case | new option case |
|---|---|---|---|
| `heading: { levels: [1,2,3] }` | `97a4f690…` | **survives** | **fails** (`[1,2,3]` ≠ `[1,2,3,4,5,6]`) |
| `heading: false` | `dd74f134…` | **fails** | **fails** |

Restored to `3b892700d23e68f7b336087175f541b3`. A comment in `extensions.ts` records that levels are
**unvalidated and cannot be validated here** — ProseMirror validates attribute names, not values —
and that range enforcement, if ever wanted, belongs at the server door.

**2. The 12-line stderr spray is now an assertion.** `vi.spyOn(console, 'warn')` with a
`mockRestore` in a `finally`; the case asserts the warning fired and that its first argument contains
`Invalid content`. The suite runs clean. This is strictly better than silencing it: the claim the
case makes is "Tiptap warns and returns normally", and that claim was previously being *printed*
rather than *checked* — a reader learns to skip a twelve-line stack, and skipping it is how the day
it stops appearing goes unnoticed.

**3. `setupFiles` defused with a comment, file not added.** `vitest.config.ts` now explains that
`@testing-library/jest-dom` and `user-event` are present as devDependencies but **unwired**, that the
symptom is `toBeInTheDocument()` failing as "not a function" rather than as a missing element, that
auto-cleanup is unregistered for the same reason, and that the fix is to copy
`packages/ui/test/setup.ts`. Per the ruling, the setup file itself is left to the first `.tsx` task.

**4. `orderedList` and `horizontalRule` added to the conformance suite.** One case, `before` /
`hr` / ordered list / `hr` / `after`, asserting `'before\nfile GSTR-1\nfile GSTR-3B\nafter'` — two
rules between three blocks leave no trace at all.

Their pinning strength differs and the test says so. `orderedList` joins the `paragraph` mutant's
kill set (that mutant now fails **3** conformance cases, up from 2). `horizontalRule` cannot be
broken by *deleting* anything — an `hr` has no content, so it contributes nothing either way — but
it **can** be broken by *adding*: teaching the walker to render it as `'---'` fails the case.
Verified, and it does fail. I first wrote the comment claiming this case was unfalsifiable; the
mutant proved otherwise and the comment was corrected. It guards the plausible future change, where
a later hand decides a rule should be visible in plain text and starts injecting punctuation into
every indexed document.

Walker restored throughout: pristine and final md5 both `55a9a261ddf88a45d4d2892e6bb95efe`, and
`git status --porcelain packages/domain` prints nothing. **`doc-text.ts` remains unmodified.**

---

## Verification

Every mutation above was restored and proven by `md5`; no `diff`-family output was used as evidence
anywhere in either round.

```
pnpm turbo run build test typecheck   →  Tasks: 18 successful, 18 total
```

| package | before | after |
|---|---|---|
| `@gisik-nokma/editor` | 16 | **22** |
| domain / rule-engine / server / ui / app-core | 163 / 115 / 93 / 31 / 5 | unchanged |
| **total** | 423 | **429** |

`packages/ui` still 31/31, so the colour scanner is unaffected by this round.

---

## Appendix — exact commands and raw output

Every command below was run from the repo root
`/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8` with
`export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` already applied, except where a `cd`
into `packages/editor` is shown (pnpm does not hoist, and the agent's cwd resets between calls).

### Confirming the `linkOnPaste` default in the installed library

```bash
cd packages/editor
sed -n '320,330p' node_modules/@tiptap/extension-link/dist/index.js
grep -n "linkOnPaste"  node_modules/@tiptap/extension-link/dist/index.js
grep -nE "PluginKey\(" node_modules/@tiptap/extension-link/dist/index.js
sed -n "$(grep -n 'function pasteHandler' node_modules/@tiptap/extension-link/dist/index.js | cut -d: -f1),+30p" \
  node_modules/@tiptap/extension-link/dist/index.js
```

Output (abridged to the load-bearing lines; the `pasteHandler` body is quoted in full because the
empty-selection early return is the detail that sizes the defect):

```
324:            linkOnPaste: true,
502:    if (this.options.linkOnPaste) plugins.push(pasteHandler({

 33:            key: new PluginKey("autolink"),
 93:            key: new PluginKey("handleClickLink"),
253:            key: new PluginKey("handlePasteLink"),

function pasteHandler(options) {
    return new Plugin({
        key: new PluginKey("handlePasteLink"),
        props: { handlePaste: (view, _event, slice) => {
            const { shouldAutoLink } = options;
            const { state } = view;
            const { selection } = state;
            const { empty } = selection;
            if (empty) return false;                       ← fires only over a selection
            ...
            return options.editor.commands.setMark(options.type, { href: link.href });
        } }
    });
}
```

### The resolved-options sweep

The probe is written as a throwaway test file (it needs the jsdom environment and the package's own
module resolution), run, then deleted:

```bash
cd packages/editor
cat > test/probe-opts.test.ts <<'EOF'
import { it } from 'vitest';
import { resolveExtensions } from '@tiptap/core';
import { buildEditorExtensions } from '../src/schema/extensions.js';

it('resolved options sweep', () => {
  const resolved = resolveExtensions(buildEditorExtensions());
  for (const ext of resolved) {
    const opts = (ext as unknown as { options?: Record<string, unknown> }).options ?? {};
    const printable: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(opts)) {
      printable[k] = typeof v === 'function' ? '[fn]' : v;
    }
    console.log(`### ${ext.name} :: ${JSON.stringify(printable)}`);
  }
});
EOF
npx vitest run test/probe-opts.test.ts 2>&1 | grep "^###"
rm test/probe-opts.test.ts
```

**Raw output, all 28 resolved extensions, AFTER the fix.** The only line that differs from the
pre-fix dump is `link`, which read `"linkOnPaste":true` before:

```
paragraph :: {"HTMLAttributes":{}}
link :: {"openOnClick":false,"enableClickSelection":false,"linkOnPaste":false,"markdownLinks":false,"autolink":false,"protocols":[],"defaultProtocol":"http","HTMLAttributes":{"target":"_blank","rel":"noopener noreferrer nofollow","class":null},"isAllowedUri":"[fn]","validate":"[fn]","shouldAutoLink":"[fn]"}
listItemBranchingDeleteKeymap :: {}
starterKit :: {"document":false,"link":false,"underline":false}
bold :: {"HTMLAttributes":{}}
blockquote :: {"HTMLAttributes":{}}
bulletList :: {"itemTypeName":"listItem","HTMLAttributes":{},"keepMarks":false,"keepAttributes":false}
code :: {"HTMLAttributes":{}}
codeBlock :: {"languageClassPrefix":"language-","exitOnTripleEnter":true,"exitOnArrowDown":true,"exitOnArrowUp":true,"defaultLanguage":null,"enableTabIndentation":false,"tabSize":4,"HTMLAttributes":{}}
dropCursor :: {"color":"currentColor","width":1}
gapCursor :: {}
hardBreak :: {"keepMarks":true,"HTMLAttributes":{}}
heading :: {"levels":[1,2,3,4,5,6],"HTMLAttributes":{}}
undoRedo :: {"depth":100,"newGroupDelay":500}
horizontalRule :: {"HTMLAttributes":{},"nextNodeType":"paragraph"}
italic :: {"HTMLAttributes":{}}
listItem :: {"HTMLAttributes":{},"bulletListTypeName":"bulletList","orderedListTypeName":"orderedList"}
listKeymap :: {"listTypes":[{"itemName":"listItem","wrapperNames":["bulletList","orderedList"]},{"itemName":"taskItem","wrapperNames":["taskList"]}]}
orderedList :: {"itemTypeName":"listItem","HTMLAttributes":{},"keepMarks":false,"keepAttributes":false}
strike :: {"HTMLAttributes":{}}
text :: {}
trailingNode :: {"notAfter":[]}
doc :: {}
placeholder :: {"emptyEditorClass":"is-editor-empty","emptyNodeClass":"is-empty","dataAttribute":"placeholder","placeholder":"Write…","showOnlyWhenEditable":true,"showOnlyCurrent":true,"includeChildren":false}
table :: {"HTMLAttributes":{},"resizable":false,"renderWrapper":false,"handleWidth":5,"cellMinWidth":25,"View":"[fn]","lastColumnResizable":true,"allowTableNodeSelection":false}
tableRow :: {"HTMLAttributes":{}}
tableHeader :: {"HTMLAttributes":{}}
tableCell :: {"HTMLAttributes":{}}
```

### The mutants

Each follows the same shape — snapshot to the scratchpad, `md5` the pristine file, mutate with
`perl -0pi`, run, restore by copying the snapshot back, `md5` again and compare. **No `diff`-family
command is used as evidence at any point in either round.**

```bash
SP=<scratchpad>
F=packages/editor/src/schema/extensions.ts
cp "$F" "$SP/ext.round2.pristine.ts"; md5 -q "$F"        # 3b892700d23e68f7b336087175f541b3
restore(){ cp "$SP/ext.round2.pristine.ts" "$F"; }
trap restore EXIT

# M1 — linkOnPaste back to the library default  -> 3 failed, 9 passed
perl -0pi -e "s/      linkOnPaste: false,\n//" "$F"

# M2 — narrow the offered heading levels        -> round-trip SURVIVES, option case fails
perl -0pi -e "s/      underline: false,\n/      underline: false,\n      heading: { levels: [1, 2, 3] },\n/" "$F"

# M3 — drop Heading from the schema entirely    -> both heading cases fail (3 total)
perl -0pi -e "s/      underline: false,\n/      underline: false,\n      heading: false,\n/" "$F"

restore; md5 -q "$F"                                     # 3b892700d23e68f7b336087175f541b3
pnpm --filter @gisik-nokma/editor exec vitest run test/schema.test.ts
```

Walker mutants for the conformance suite, against `packages/domain/src/doc-text.ts`
(pristine `55a9a261ddf88a45d4d2892e6bb95efe`). `@gisik-nokma/domain` must be rebuilt between
mutations because the editor's tests import its `dist/`:

```bash
W=packages/domain/src/doc-text.ts
cp "$W" "$SP/doc-text.pristine.ts"; md5 -q "$W"
restore(){ cp "$SP/doc-text.pristine.ts" "$W"; pnpm --filter @gisik-nokma/domain build >/dev/null 2>&1; }
trap restore EXIT

# drop a block-node entry (run for each of: paragraph heading codeBlock
# blockquote bulletList orderedList listItem doc)
perl -0pi -e "s/^  '<ENTRY>',\n//m" "$W"

# give horizontalRule a text rendering — the ADDITION that kills the hr case
perl -0pi -e "s/  if \(candidate\.type === 'hardBreak'/  if (candidate.type === 'horizontalRule') return '---';\n  if (candidate.type === 'hardBreak'/" "$W"

pnpm --filter @gisik-nokma/domain build >/dev/null 2>&1
pnpm --filter @gisik-nokma/editor exec vitest run test/doc-text-conformance.test.ts
restore; md5 -q "$W"; git status --porcelain packages/domain   # prints nothing
```

Colour-scanner check (round 1), against `packages/ui`'s repo-wide scan:

```bash
F=packages/editor/src/doc.ts
cp "$F" "$SP/doc.pristine.ts"; md5 -q "$F"               # 366b19c22b2f986e4687c863121dbf81
printf '\n// probe: const brand = %s;\n' "'#ff0000'" >> "$F"
pnpm --filter @gisik-nokma/ui exec vitest run test/token-discipline.test.ts   # 1 failed | 3 passed
cp "$SP/doc.pristine.ts" "$F"; md5 -q "$F"               # 366b19c22b2f986e4687c863121dbf81
pnpm --filter @gisik-nokma/ui exec vitest run            # 31 passed
```

### Gate

```bash
pnpm turbo run build test typecheck        #  Tasks: 18 successful, 18 total
pnpm install --frozen-lockfile             #  exit 0 — what CI runs
```

Per-package tallies were read from
`pnpm turbo run test 2>&1 | grep -E ":test:\s+Tests\s+[0-9]+ passed"`.

---
---

# Fix round 2 — the fourth path, and a green check that certified its absence

Third commit. Gate: **18/18 turbo tasks, 431 tests** (429 → 431; editor 22 → **24**; every other
package unchanged). Editor stderr still silent.

---

## IMPORTANT — the finding is correct in every particular, and reproduced before anything changed

`@tiptap/extension-link@3.30.5`:

```
dist:445-482  addPasteRules() {
                ... if (this.options.markdownLinks) return [markdownLinkPasteRule({...})];
                return [markPasteRule({ find: findPlainUrls, type: this.type, ... })];   ← unconditional
              }
```

`@tiptap/core` registers it and fires it from `pasteRulesPlugin`'s `appendTransaction`:

```
dist:5121  const isPaste = transaction.getMeta("uiEvent") === "paste" && !isPastedFromProseMirror;
```

and `prosemirror-view@1.42.3`'s `doPaste` sets that meta **after** `handlePaste` declines:

```js
function doPaste(view, text, html, preferPlain, event) {
    let slice = parseFromClipboard(...);
    if (view.someProp("handlePaste", f => f(view, event, slice || Slice.empty))) return true;   // ← round 1 stopped here
    ...
    view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));      // ← the rule fires from this
}
```

**None of `autolink`, `linkOnPaste` or `markdownLinks` gates it.** Worse for my round-1 reasoning:
`markdownLinks: false` — which I added *as a guard* — is the very condition that selects the plain
URL `markPasteRule` branch. It routes into the path, not away from it.

Reproduced against the shipped `buildEditorExtensions()` by replicating `doPaste` in full:

```
BARE CURSOR : text "https://gst.gov.in"  marks [link href="https://gst.gov.in"]
OVER SELECT : text "https://gst.gov.in"  marks [link href="https://gst.gov.in"]
BARE DOMAIN : text "gst.gov.in"          marks [link href="http://gst.gov.in"]
PASTE "**due soon**"  -> text "due soon"     marks [bold]
PASTE "*soon*"        -> text "soon"         marks [italic]
PASTE "`npm run gst`" -> text "npm run gst"  marks [code]
PASTE "~~gone~~"      -> text "gone"         marks [strike]

paste-rule inventory across the configured list:
RULES link: 1   RULES bold: 2   RULES italic: 2   RULES code: 1   RULES strike: 1     (7 rules, 5 extensions)
```

The bare-cursor case is **broader than the round-1 defect** — `pasteHandler` returned early on an
empty selection, and this path does not.

### Both false artifacts, named

1. **`extensions.ts` claimed exhaustiveness** — "that takes three options … because Tiptap turns
   text into links along three separate paths". There are four and the fourth was live.
2. **`test/schema.test.ts` certified the absence of the behaviour.** The case drove
   `view.someProp('handlePaste', …)` only — an entry point that *structurally cannot observe an
   `appendTransaction` paste rule*. It reported "no link was created" while the product, on that
   same paste, created one.

The second is this branch's named defect class with my own name on it. Round 1 closed a real hole
and, in the same commit, minted a green check for a property the product does not have — which is
worse than the hole, because a hole is merely open while a false check tells the next person to
stop looking. It is the exact failure the `underline` finding was about (a `toContain` that could
not see an extra mark), reproduced by me one layer down, in the commit that fixed it.

---

## What was done — and what was deliberately NOT

**NOT done: the paste rules are not disabled.** Per the ruling: it is a product decision about how
spec §2's "nothing silently becomes markup" should be honoured, it spans five extensions, it is
owned by **Task 5 (the escape-suggestion mechanic)** — the task the plan created for this
requirement — and `enablePasteRules` is an `Editor` option `buildEditorExtensions` structurally
cannot reach. Confirmed independently: the only in-function lever is per-extension
`.extend({ addPasteRules: () => [] })`, five times over, which is a worse shape for the same
decision.

**1. Comment corrected.** The exhaustiveness claim is gone. It now states that there are four
paths, that three are closed by option, that the fourth is `addPasteRules` → `pasteRulesPlugin`'s
`appendTransaction` and is ungated by any of the three, that `markdownLinks: false` routes *into*
it, that it is live across `link`/`bold`/`italic`/`code`/`strike` with the seven-rule inventory,
and that **Task 5 owns the decision**.

**2. The misleading test is replaced by three honest ones**, and the replacement keeps the true
part of the old one rather than discarding it:

- `declines the paste in handlePaste — the linkOnPaste path really is shut` — the old assertion,
  correctly scoped. `linkOnPaste: false` genuinely does shut its path; the old test's error was
  claiming that settled the question.
- `CURRENT BEHAVIOUR pending Task 5: a pasted URL becomes a link anyway` — drives the real path
  (a `pasteInto` helper replicating `doPaste`'s tail: `handlePaste` first, then
  `replaceSelection(...).setMeta('paste', true).setMeta('uiEvent', 'paste')`), and asserts the link
  IS created, over a selection, at a bare cursor, and with `http://` prepended to a bare domain.
- `CURRENT BEHAVIOUR pending Task 5: pasted markdown syntax becomes marks` — bold, italic, code,
  strike, because Task 5's decision is not link-only.

Both are labelled `CURRENT BEHAVIOUR pending Task 5` and their comments say: when Task 5 closes the
path this test fails, that failure is the notification the fix landed, **flip the expectations then
— do not delete the case.** A test that records an unwanted behaviour truthfully is worth more than
one that denies it falsely.

The `pasteInto` helper's own docblock states why both halves are load-bearing, so the next person
to write a paste test does not repeat the mistake.

**3. The three option pins are kept.** They close three real paths and none of them was the error.

### Falsifiability — every mutant re-run against ONE fixed 15-case file

| # | mutant | md5 | result |
|---|---|---|---|
| — | pristine | `d6c251c866234e341d36344e290a520f` | **15 passed** |
| M1 | delete `linkOnPaste: false` | `010505e2951378fd735c7a88b76fcd06` | **3 failed, 12 passed** — plugin-absence, handlePaste-declines, option pin |
| M4 | `Link.extend({ addPasteRules: () => [] })` (Task 5, link only) | `ba99d7199345661c3e8df97a9c695de9` | **1 failed, 14 passed** — the URL case |
| M5 | `enablePasteRules: false` in the test helper (Task 5, all rules) | helper `01e989e1ddcd960b7db6c71b894008b2` | **2 failed, 13 passed** — both CURRENT BEHAVIOUR cases |

M4 and M5 are the proof the ruling asked for: **the new tests fail the moment the behaviour
changes**, at both the granularity Task 5 might use. M5 is the more likely shape of that fix and it
kills both cases. All files restored; `extensions.ts` back to `d6c251c866234e341d36344e290a520f`,
`create-editor.ts` back to `83c6f822cee34809c8dd11606abb35ef`.

---

## The three minors

**1. The M1 evidence table was off by one — and the real error was worse than an arithmetic slip.**
It paired a pristine row of `13 passed` with a mutant row of `3 failed, 9 passed (12)`: the two
rows were run at different moments, the mutant on a 12-case file and the pristine row after the
heading option pin took it to 13. Three cases die either way, so the substance stood, but the pair
was not like-for-like and the table presented it as though it were. Rather than patch the numbers,
**every mutant was re-run against one fixed file** (the table above), and a correction note is left
at the round-1 table rather than editing the record silently.

**2. The `orderedList` claim was wrong.** I wrote that it "is load-bearing the same way
`bulletList` is". Verified: deleting `orderedList`, `listItem`, `bulletList` **or** `doc` from the
walker's block set all leave the case green — only deleting `paragraph` kills it, because a list
item's newline is paid for by the paragraph inside it. Corrected to say the entry is **inert**, and
that what the case genuinely pins is that the numbering is presentational (no digits, no `1.`
markers, no separators). `orderedList` added to the file's inert-entries list at the top, which had
not been updated when the case landed. A sentence was also added naming the general shape: **only
the three textblock entries are load-bearing, and an entry earns its keep exactly when its node
holds text directly.**

**3. The `defaultProtocol` hand-forward had the wrong mechanism and the wrong tense.** Verified
both halves:

```
dist:264  find(textContent, { defaultProtocol: options.defaultProtocol })   ← pasteHandler — OFF via linkOnPaste
dist:450  find(text)                                                        ← addPasteRules — LIVE, no options
```

Setting `defaultProtocol: 'https'` was tried against the live path: the pasted href still came back
`http://gst.gov.in`. `setLink` passes the option only into `isAllowedUri`'s ctx and the default
`isAllowedUri` ignores it; the `http` is linkifyjs's own `find()` default. So Task 7 **cannot** fix
this by setting the option, and it is not a dormant future concern — **bare domains already become
`http://` links on paste today**, which is a facet of the fourth-path defect. The round-1 note is
corrected in place with a marked correction block.

---

## Not acted on, as instructed

The re-review's out-of-scope note that `packages/editor/tsconfig.json` has `include: ["src"]` so
`pnpm typecheck` never checks `test/` is **wrong** — it read the build config, while the `typecheck`
script targets `tsconfig.typecheck.json`, which includes `test`. The script output confirms it on
every run (`tsc -p tsconfig.typecheck.json`), and round 1's whole `type-text.ts` `TS2554` finding
came *from* `test/` being checked. **Configs left alone.**

---

## Verification

```
pnpm turbo run build test typecheck   →  Tasks: 18 successful, 18 total
```

| package | round 1 | now |
|---|---|---|
| `@gisik-nokma/editor` | 22 | **24** |
| domain / rule-engine / server / ui / app-core | 163 / 115 / 93 / 31 / 5 | unchanged |
| **total** | 429 | **431** |

Net +2: one false case removed, three honest ones added. Every mutation restored and proven by
`md5`; no `diff`-family output used as evidence in any round.

---
---

# Fix round 3 — documentation accuracy in the single-origin file

Fourth commit. **Documentation only**: no behaviour changed, `Link.configure` untouched, tsconfigs
untouched, lockfile untouched. Gate holds at **18/18, 431 tests** (editor 24, unchanged).

**Proof it is documentation-only, by `md5` rather than any diff:** each of the three files was
stripped of block and line comments and hashed before and after. All three are byte-identical.

| file | code-only md5 before | after |
|---|---|---|
| `src/schema/extensions.ts` | `7fcb6b19ab513bb45573fdc0df12ca93` | `7fcb6b19ab513bb45573fdc0df12ca93` |
| `test/schema.test.ts` | `d5b4f25d6bbc474caa676053add7ca6b` | `d5b4f25d6bbc474caa676053add7ca6b` |
| `test/doc-text-conformance.test.ts` | `3745bbb9fdd04ce3aef84a281ca083b1` | `3745bbb9fdd04ce3aef84a281ca083b1` |

Since this round is prose, every factual claim written into the tree is cited below to the `dist`
file and line it was verified against, plus an empirical check where one was possible. This file has
now carried three false claims; a comment is a claim like any other.

---

## 1. My headline framing was FALSE — `markdownLinks` selects an implementation, not a behaviour

I wrote, and the coordinator propagated, that `markdownLinks: false` was "a defensive addition
actively enabling the defect". **That is wrong**, and the correction is more useful than the claim.

| claim | source | verified |
|---|---|---|
| `markdownLinkPasteRule` merges plain-URL matches in alongside markdown ones | `extension-link` dist:225-237 | read; the library's own docblock there says "and links the plain URLs from `findPlainUrls`" |
| both branches therefore link plain URLs | dist:445-482 vs 225-237 | read |
| flipping the option changes nothing observable | — | **empirical** |

Empirical check, same extension list, only the option flipped (`extensions.ts`
`d6c251c866234e341d36344e290a520f` → mutant `ca7f227de5a924787bb32902f70355c9` → restored to
`d6c251c866234e341d36344e290a520f`):

```
                   markdownLinks: false        markdownLinks: true
PASTE plain url    href=https://gst.gov.in     href=https://gst.gov.in
PASTE bare domain  href=http://gst.gov.in      href=http://gst.gov.in
DROP  plain url    href=https://gst.gov.in     href=https://gst.gov.in
DROP  bare domain  href=http://gst.gov.in      href=http://gst.gov.in
```

**Identical.** No value of the option escapes the defect. The sentence "routes INTO this branch
rather than away from it" was literally accurate about branch selection but invited the inference
that flipping would help — so the comment now states outright that both branches link plain URLs
and that flipping only changes which rule object implements it.

The lesson is now recorded in its correct, narrower form: **an option that looks like it selects
between a safe and an unsafe branch may be selecting between two implementations of the same
behaviour.** My round-2 version reached for a bigger and false one.

---

## 2. The comment was exhaustive-by-assertion again — so it no longer counts

Round 2 replaced "three paths" with "four paths" and thereby repeated the shape it was called to
fix. **The rewritten comment names no total at all** and says why: a count is a claim of
completeness, and it was false both times. Both omissions the re-review identified are corrected:

| claim now in the comment | source | note |
|---|---|---|
| `markdownLinks` gates **two** mechanisms | `extension-link` dist:434-435 | `addInputRules()` returns `[]` unless `markdownLinks`; otherwise a `markdownLinkInputRule` — a **TYPED** `[text](url)` rule. My round-2 gloss said only "pasted", omitting the typed half. |
| `uiEvent === 'paste'` **and** `!isPastedFromProseMirror` | `@tiptap/core` dist:5121 | the conjunct my round-2 text dropped |
| `uiEvent === 'drop'` is a live trigger | core dist:5122; `prosemirror-view` dist:3902 (`view.dispatch(tr.setMeta("uiEvent","drop"))`) | **empirically confirmed above — dragging text in produces the same links as pasting.** Round 2 presented this as paste-only. |
| an `applyPasteRules` meta also fires them | core dist:5123 | Tiptap's simulated paste |
| the guard returns only if none of the three | core dist:5125 | read |

The mitigation the coordinator noted is kept in the text rather than dropped, because it is the
honest counterweight: **nothing live is left unnamed.** Everything not closed by option is the same
rule set under a different trigger, so one lever covers all of it — `enablePasteRules`, which this
function structurally cannot reach. Task 5 still owns the decision.

---

## 3. `pasteInto` no longer claims to replicate `doPaste` "in full"

It does not. `doPaste` (`prosemirror-view` dist:3754-3765) takes `sliceSingleNode(slice)` and uses
`replaceSelectionWith(singleNode, preferPlain)` where that yields a node, then adds
`scrollIntoView()`; the helper always calls `replaceSelection(slice)` and never scrolls.

Per the ruling, **the words changed, not the helper** — the two are outcome-equivalent for the
single-text-node slices these tests use, and `scrollIntoView` is a no-op in jsdom. The docblock now
says it replicates the **meta-setting tail**, names both divergences explicitly, and says why they
do not matter here, rather than hiding them behind "full".

---

## 4. The walker rule's "exactly" was falsified inside the walker's own set

I wrote that an entry "earns its keep exactly when its node holds text directly". **`code_block`
falsifies it**: it holds text directly, exactly as `codeBlock` does, and is still inert here.

And the inert list named 5 of 9. The set has **12 entries** (counted in
`packages/domain/src/doc-text.ts`): 3 load-bearing (`paragraph`, `heading`, `codeBlock`), 9 inert.
My list omitted `code_block`, `bullet_list`, `ordered_list`, `list_item`.

The comment now lists **all nine**, split by the two genuinely different reasons for inertness —
which is why no single rule covers it, and why the "exactly" had to go:

- `doc`, `blockquote`, `bulletList`, `orderedList`, `listItem` — **containment**: each holds only
  other blocks, so the child pays for the newline and the `\n{2,}` collapse hides the duplicate.
- `code_block`, `bullet_list`, `ordered_list`, `list_item` — **spelling**: the snake_case aliases
  are unreachable from this editor at all, since schema v1 emits camelCase only. The walker carries
  them for documents from other producers.

`code_block` is called out as the case that kills the generalisation.

---

## Verification

```
pnpm turbo run build test typecheck   →  Tasks: 18 successful, 18 total
```

| package | round 2 | now |
|---|---|---|
| `@gisik-nokma/editor` | 24 | 24 |
| domain / rule-engine / server / ui / app-core | 163 / 115 / 93 / 31 / 5 | unchanged |
| **total** | 431 | **431** |

`pnpm-lock.yaml`, `tsconfig.json` and `tsconfig.typecheck.json` confirmed untouched.

---
---

# Fix round 4 — the completeness claim itself, removed in every grammatical form

Fifth commit, fresh implementer. **Documentation only**: no behaviour changed, `Link.configure`
untouched, tsconfigs untouched, lockfile untouched, `packages/domain/src/doc-text.ts` untouched,
nothing under `apps/server/`. Gate holds at **18/18, 431 tests** (editor 24, unchanged;
163/115/93/31/5 elsewhere).

**Documentation-only proof, TypeScript printer (`removeComments: true`), both sides through the
same printer** — the HEAD blob (via `git show HEAD:<path>`) and the edited working file hash
identically once comments are stripped:

| file | stripped md5 at HEAD `0458d1e` | stripped md5 after edit |
|---|---|---|
| `src/schema/extensions.ts` | `dde0e738c095736ef14495ff71eca803` | `dde0e738c095736ef14495ff71eca803` |
| `test/schema.test.ts` | `eb91995968c9a01296ca482fe45b07b6` | `eb91995968c9a01296ca482fe45b07b6` |

(These differ from round 3's numbers because round 3 used a different stripper; each round's
before/after pair is what carries the proof, not cross-round comparison.)

---

## What was wrong, confirmed before writing

`extensions.ts:99-102` claimed: "Nothing live is left unnamed above. Everything not closed by
option is the same rule set under a different trigger, so one lever covers all of it —
`enablePasteRules`." **False**, exactly as the round-3 re-review found. Input rules are a second,
disjoint rule set:

| claim | source | how verified |
|---|---|---|
| input rules gated separately, on `enableInputRules` | core dist:5220-5221 (`isExtensionRulesEnabled(extension, editor.options.enableInputRules)`) | read, line-exact |
| into a different plugin | core dist:4804 (`inputRulesPlugin`), firing via `handleTextInput` at dist:4834 | read |
| paste rules gated on `enablePasteRules` | core dist:5233 | read |
| both options default `true` | core dist:6147 (`enableInputRules`), dist:6148 (`enablePasteRules`) | read |
| census: **18 input rules across 10 extensions** — `heading` 6, `bold` 2, `italic` 2, `codeBlock` 2, `blockquote` 1, `bulletList` 1, `code` 1, `orderedList` 1, `strike` 1, `horizontalRule` 1 | executed `getExtensionField(extension, 'addInputRules', context)` — the same field core reads at dist:5220 — over `resolveExtensions(buildEditorExtensions())`, counting returned rules | **empirical**, matches the reviewer's census exactly |
| census: **7 paste rules across 5 extensions** — `bold` 2, `italic` 2, `code` 1, `strike` 1, `link` 1 | same method, `addPasteRules` field | **empirical** |
| the typed rules are live on this list | jsdom, `handleTextInput` driven directly | **empirical**: typing `**due soon**` → bold, `` `npm run gst` `` → code, `# ` → heading level 1, `- ` → bulletList |

**The levers are disjoint, proven both ways** — same extension list, only the `Editor` option
varied:

```
                          typed **due soon**    pasted URL
(defaults)                BOLD                  LINK
enablePasteRules: false   BOLD                  plain text
enableInputRules: false   literal text          LINK
```

`enablePasteRules: false` — the lever the old comment said "covers all of it" — leaves every typed
input rule firing. So the sentence was false not only as an inventory but in its practical advice:
Task 5 pulling that one lever would have shipped the defect through the keyboard.

---

## What changed, and the shape it changed to

**The comment no longer makes a completeness claim in any grammatical form.** Rounds 1 and 2
counted ("three paths", "four paths") and were wrong as arithmetic; round 3 swore off counting and
made the identical claim as prose ("nothing live is left unnamed"). The rewritten comment:

- opens by saying the options **do not achieve** §2 and that this version enumerates only what was
  counted and verified — with the dist lines to check each item by, and a pointer to this report
  for the full analysis;
- states the censuses as censuses ("seven paste rules across five extensions", "eighteen input
  rules across ten extensions"), **pinned to tiptap 3.30.5 in the text** so a dependency bump
  cannot silently falsify them — the sentence stays true as a statement about a named snapshot;
- names **both** levers with their gate lines (`enablePasteRules` core dist:5233,
  `enableInputRules` dist:5221, defaults dist:6147-6148) and says this function returns
  `Extensions`, never constructs an `Editor`, and so can reach neither;
- fixes the round-2-era collateral: Task 5's decision is now stated as spanning **ten** extensions
  and **both** levers, not five and one;
- contains no sentence of the form "nothing else exists" / "that covers all of it" / "there are N
  paths" / "everything not closed by X is Y".

Every factual sentence in the new comment, with its citation and verification:

| sentence in the comment | source | how verified |
|---|---|---|
| `autolink: false` — the autolink plugin is not registered | extension-link dist:486 (`if (this.options.autolink) plugins.push(autolink(…))`) | read |
| `linkOnPaste: false` — the pasteHandler plugin is not registered | dist:502 (`if (this.options.linkOnPaste) plugins.push(pasteHandler(…))`) | read; the existing wiring test pins the absence |
| `markdownLinks: false` — the typed `[text](url)` input rule is not registered | dist:434-435 (`addInputRules()` returns `[]` unless `markdownLinks`); the rule itself at dist:204 | read; census confirms `link` contributes 0 input rules |
| no value of `markdownLinks` stops a pasted plain URL from linking; both `addPasteRules` branches link plain URLs | dist:474 (plain branch), dist:465 + 225-234 (`markdownLinkPasteRule` merges `findPlainUrls` matches; the library's own docblock at dist:225) | read; round 3's flip table already showed identical behaviour both ways |
| even inside pasted `[text](url)`, the URL half gets linked | dist:474 + `findPlainUrls` at dist:446-464 | **empirical this round**: pasting `[docs](https://gst.gov.in)` with `markdownLinks: false` yields literal `[docs](` + linked `https://gst.gov.in` + `)`. The advisor caught my draft claiming "pasted [text](url) stays literal" — false, the same defect class, removed before writing |
| paste rules fire on external paste, external drop, or an `applyPasteRules` meta | core dist:5121 (`'paste' && !isPastedFromProseMirror`), dist:5122 (`'drop' && !isDroppedFromProseMirror`, external = `dragSourceElement !== view.dom.parentElement`, dist:5097), dist:5123 (meta), guard at dist:5125 | read; "external" is the conjunct round 2 dropped |
| `**due soon**` arrives bold whether pasted, dropped, or typed | paste: round-2/3 tests; drop: **empirical this round** (uiEvent `'drop'` meta → bold); typed: **empirical this round** (`handleTextInput` → bold) | all three run against this exact extension list |
| the two censused sets are disjoint; disabling either leaves the other firing | the lever table above | **empirical** |
| this function can reach neither option | `buildEditorExtensions` returns `Extensions`; `enableInputRules`/`enablePasteRules` are `Editor` constructor options (core dist:6147-6148) | structural, read |

**Test docblocks.** The second `CURRENT BEHAVIOUR pending Task 5` docblock framed the paste-rule
census as "the reason Task 5's decision is bigger than links" — with input rules in frame that
scoping quietly tells Task 5 the paste set is the whole job. It now says "part of why", names the
typed sibling set and its separate lever, and states the verified disjointness ("disabling either
lever was verified to leave the other set firing, so no single lever settles Task 5's decision").
The first docblock was left unchanged, deliberately: it describes one path ("when Task 5 closes
this path, this test fails") and makes no lever or scope claim — there is nothing in it to
correct, and editing prose that is already true is how new false prose gets minted.

---

## The judgement call put to me: should this comment be this long at all?

**My opinion: no — and the rewrite acts on it.** The block went from 58 lines to 45, and the
deeper change is what kind of sentence it is now made of. Four versions failed because the comment
kept trying to be a complete account of a library's behaviour, and a source comment is the worst
possible home for one: it is not executable, not versioned against the dependency it describes,
and audited only when it has already misled someone. The honest form for a comment over a config
object is (a) what each option verifiably does, (b) the statement that they do NOT achieve the
spec's requirement, (c) the censuses that size the remaining decision, pinned to the version they
were counted on, and (d) a pointer to where the durable analysis lives. That is what stands there
now. I kept the censuses in the comment rather than pushing them entirely into this report because
Task 5's implementer will read this file first, and "ten extensions, two levers" is the sizing
fact that stops a one-lever fix from looking sufficient — but each is phrased as a count of a list
that was enumerated, never as a boundary on what exists.

## Concerns

1. **The typed path is live and untested.** The two `CURRENT BEHAVIOUR` tests drive pastes only.
   Typing `**due soon**` produces bold through `handleTextInput` and no test records it, so
   Task 5's input-rule half has no failing-test notification wired the way its paste half does.
   Not addable this round (documentation-only, 431 must hold, hash proof) — Task 5 should add
   typed-path cases, and should consider turning the censuses into a **counting test** (the
   `getExtensionField` method above is ~20 lines) so the numbers 7/5 and 18/10 are enforced
   against dependency bumps rather than asserted in prose.
2. **The census numbers are version-pinned prose until then.** A tiptap upgrade can change them;
   the comment survives that truthfully only because it names 3.30.5. The counting test is the
   real fix.
3. **Round-3 history in this report stands uncorrected upstream.** The round-3 section above
   still contains the "nothing live is left unnamed" defence of the sentence this round removed —
   left as the honest record of what was believed then, per this file's convention of correcting
   forward rather than editing the record.
