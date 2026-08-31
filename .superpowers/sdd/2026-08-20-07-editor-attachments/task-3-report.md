# Task 3 report — the image node, and layer 1 of image-only embedding

**Status: DONE.** Gate 18/18. Editor package 24 → **37** tests. `packages/ui` 31/31 green
(the colour scanner now has `packages/editor/src` in scope — see the by-catch below, it went
red once and the red was mine).

Repo totals after this change: domain 216 · rule-engine 115 · server 102 · editor 37 · ui 31 ·
app-core 5 = **506**.

---

## What shipped

| file | what |
|---|---|
| `packages/editor/src/extensions/ticket-image.ts` | new — the `image` node, `IMAGE_WRAP_MODES`, `ImageWrapMode`, `TicketImageOptions`, `insertTicketImage`, `setImageWrap` |
| `packages/editor/src/styles/editor.css` | new — the three wrap rules, structural only, zero colour of any kind |
| `packages/editor/src/schema/extensions.ts` | `TicketImage` wired into the one schema origin |
| `packages/editor/src/index.ts` | four exports appended |
| `packages/editor/test/ticket-image.test.ts` | new — 13 cases |
| `packages/editor/test/schema.test.ts` | `'image'` added to `SCHEMA_V1_NODES`; **still set-equality**, proven live by mutant M8 |

`packages/domain/src/doc-text.ts` **untouched** (MUST). Nothing outside `packages/editor`
changed — `git status` before staging listed exactly the six paths above.

---

## The census: UNCHANGED

Method as dispatched: `getExtensionField(extension, 'addPasteRules' | 'addInputRules', context)`
— the same field core reads at dist:5220 — over `resolveExtensions(buildEditorExtensions())`,
counting the returned rules.

| | before | after |
|---|---|---|
| paste rules | **7 across 5 extensions** (`bold` 2, `italic` 2, `code` 1, `strike` 1, `link` 1) | **7 across 5** — identical per-extension breakdown |
| input rules | **18 across 10 extensions** (`heading` 6, `bold` 2, `italic` 2, `codeBlock` 2, `blockquote` 1, `bulletList` 1, `code` 1, `orderedList` 1, `strike` 1, `horizontalRule` 1) | **18 across 10** — identical |

`TicketImage` defines neither `addInputRules` nor `addPasteRules` and pulls in no extension of
its own, so it contributes zero to both. **The comment block in `extensions.ts` needed no edit
and got none**; its two censuses remain true of tiptap 3.30.5 on this extension list.

Freshness guard against the obvious way to get a vacuous "unchanged": the census script imports
`./dist/index.js`, so I rebuilt (`tsc -p tsconfig.json`) before the second run and used the
resolved-name list as the check — `image` is the last name in it, so the count was taken on a
list that actually contains the new node. The script lived at `packages/editor/census.mjs` for
the duration and was **deleted before staging** (a copy is in the session scratchpad); the
brief's `git add packages/editor` would otherwise have swept it into the commit.

---

## The adaptation: the brief's `wrap` validation was dead code, and I have it on video

The brief validates `wrap` on the parse path inside the node-level `parseHTML().getAttrs`.
That does not work, for a reason in tiptap's own source.

`injectExtensionAttributesToParseRule` (@tiptap/core@3.30.5 **dist:1452-1472**) rebuilds every
parse rule's `getAttrs` as:

```js
const oldAttributes = parseRule.getAttrs ? parseRule.getAttrs(node) : parseRule.attrs;
const newAttributes = extensionAttributes.reduce(…);   // dist:1461
return { ...oldAttributes, ...newAttributes };
```

The per-attribute results are spread **second**, so they overwrite the node-level ones. And the
per-attribute default, for an attribute that declares no `parseHTML`, is
`fromString(node.getAttribute(item.name))` — i.e. it reads the bare attribute `wrap`.

The other half of the trap is that the brief's own `renderHTML` **emits** that bare attribute.
An `addAttributes` entry with no `renderHTML` is serialized under its own name, so the
brief-verbatim node writes:

```html
<img attachmentid="01J9…" wrap="inline-left" alt="x" src="/v1/attachments/01J9…"
     data-attachment-id="01J9…" data-wrap="inline-left" class="editor-image editor-image--inline-left">
```

Two spellings of every fact, of which only one is validated on the way back in.

**This was not settled by reading the dist.** I implemented the brief verbatim first, ran the
two new cases against it, and recorded the failures:

```
× planted defect: a bare `wrap` attribute cannot outrank the validated one
    AssertionError: expected 'float-up' to be 'block'
× serializes each attribute under exactly one name
    expected '<img attachmentid="01J9GIMA0000000000…' not to match /\swrap=/
```

So `<img data-attachment-id="X" data-wrap="block" wrap="float-up">` stored `wrap: 'float-up'`
under the brief's code. The fix moves validation to where the last writer is: each attribute
declares its own `parseHTML` (coercing through `toImageWrapMode`) and its own `renderHTML`
(one `data-` spelling each). The node-level rule keeps only its tag selector,
`img[data-attachment-id]` — deliberately not bare `img`, so a `<img src="https://…">` pasted
from a web page is not adopted into the doc with a remote URL in it.

**Recorded as an adaptation** per the standing law: the shipped library beats the plan text.

---

## Every refusal, and the mutant that proved it

Ten mutants (the table below has ten rows; M7 is one of them). Each was applied to the shipped code, the suite run, the named case observed
**failing**, then the file restored and verified by **`md5`** — never by any `diff`-family
command. Pristine hashes: `ticket-image.ts` `3faa9a0939ea4e2b5c7362957bc38aaa`,
`extensions.ts` `8fcc2ab35423ad4b78cd5a52c118c954`, `schema.test.ts`
`126da46c3ecf8243a51a74dde8680012`, `editor.css` `1e4525b3264f8b6f674f5c2c97de774c`. Every
restore printed the same hash it started with.

| # | mutant | case that went red |
|---|---|---|
| M1 | mime guard deleted from `insertTicketImage` | *planted defect (layer 1): a non-image mime is refused and the doc is untouched* |
| M2 | wrap guard deleted from `insertTicketImage` | *planted defect: insertTicketImage refuses a wrap outside the vocabulary* |
| M3 | wrap guard deleted from `setImageWrap` | *setImageWrap updates the selected image and refuses invented modes* |
| M4 | `src` null-guard removed | *renders no src at all for an image node carrying no attachmentId* |
| M5 | per-attribute wrap `parseHTML` trusts the raw `data-wrap` | *coerces an unknown data-wrap to the default rather than storing it* |
| M5b | per-attribute wrap `parseHTML` deleted entirely (core's `getAttribute('wrap')` default takes over) | *a bare `wrap` attribute cannot outrank the validated one* + *survives a full HTML round trip* |
| M6 | per-attribute `renderHTML` deleted | *serializes each attribute under exactly one name* + 2 others |
| M7 | `configure` passes `resolveAttachmentUrl` unconditionally | *falls back to the default resolver whether the option is absent or undefined* + 7 others |
| M8 | `'image'` removed from `SCHEMA_V1_NODES` | *exposes NOTHING the spec does not name — the vocabulary is closed* |
| M9 | `.editor-image--inline-right` rule deleted | *the stylesheet carries a wrap rule for exactly the vocabulary* |

Before any of that, the whole new test file was run against HEAD with no implementation at all:
**11 failed / 11**, the majority on `editor.commands.insertTicketImage is not a function`.

### Two refusals the brief specified and did not test

1. **`insertTicketImage`'s wrap guard.** The brief's code contains
   `if (attrs.wrap !== undefined && !IMAGE_WRAP_MODES.includes(attrs.wrap)) return false;` and
   no case exercises it. A refusal with nothing behind it is this branch's named defect class,
   so it got M2's case.
2. **The parse path.** Neither the brief nor the plan tests it at all, and it is the door a
   hostile or foreign document actually uses — the two commands are the doors a cooperating
   client uses. M5/M5b cover it now.

---

## The one-origin work, and the trap inside it

The dispatch pinned the wrap vocabulary as byte-identical everywhere. `IMAGE_WRAP_MODES` is the
only place the three literals are written in TypeScript; `DEFAULT_IMAGE_WRAP` is the only place
`'block'` is written; `isImageWrapMode` / `toImageWrapMode` are the only readers, and all three
guards plus the attribute default go through them. Enumerated explicitly rather than by a
recursive sweep (`find … -print0 | xargs -0 grep -n`, per the search discipline): outside
`ticket-image.ts` the literals appear only in test expectations, in the CSS class names, and in
`packages/domain/test/doc-embeds.test.ts`'s fixture.

**The CSS class names were a fourth spelling nothing bound.** `renderHTML` builds the class as
`editor-image--${wrap}`, so a mode added to the constant without a matching rule renders an
unstyled image and no test notices — the markup stays correct and only the appearance goes
missing. The new last case reads `editor.css` off disk and asserts set-equality between the
declared `.editor-image--X` rules and `IMAGE_WRAP_MODES`, in both directions (a rule for a
retired mode is dead CSS nobody deletes). M9 is its proof. It uses
`fileURLToPath(import.meta.url)` + `resolve` rather than `new URL('…', import.meta.url)`,
because Vite statically rewrites the latter under Vitest — the reason is already written out in
`packages/ui/test/helpers/colour-scan.ts` and it applies here identically.

**`configure` and the `undefined` clobber.** The brief spells the default route twice — once in
`addOptions`, once as the `??` fallback at the `configure` site. Collapsing that to the obvious
`TicketImage.configure({ resolveAttachmentUrl: options.resolveAttachmentUrl })` is **worse than
either**, and M7 is the proof: 8 of 12 cases died with
`TypeError: this.options.resolveAttachmentUrl is not a function`. `configure` merges with
`mergeDeep` (core **dist:4654-4661**), whose body is
`Object.keys(source).forEach(key => output[key] = source[key])` — an explicitly-passed
`undefined` is a key like any other and **replaces** the default rather than falling back to it.
`exactOptionalPropertyTypes` is off, so `{ resolveAttachmentUrl: props.maybeUndefined }` — the
ordinary way a React host forwards an optional prop — type-checks straight into that. Shipped
form is a conditional spread, the option travels only when it exists, and the test drives both
shapes (`{}` and `{ resolveAttachmentUrl: undefined }`) because they are not the same shape to
`configure`.

---

## BY-CATCH: the colour scanner cannot read a stylesheet that names what it forbids

Worth carrying to the coordination doc, because every remaining CSS-touching task (T12, T12b,
T13, T13a) will meet it.

My first `editor.css` opened with a comment spelling out the prohibited forms, exactly as the
dispatch spells them, so a later reader would know all three kinds are banned including the
bare keywords the scanner misses. `packages/ui`'s suite went **red**:

```
packages/editor/src/styles/editor.css:2 rgb(
packages/editor/src/styles/editor.css:2 hsl(
packages/editor/src/styles/editor.css:2 oklch(
packages/editor/src/styles/editor.css:3 color-mix(
```

`scanTreeForColourLiterals` walks lines and matches `COLOUR_LITERAL` against each; it has no
notion of a CSS comment. **A stylesheet in scope therefore cannot name a colour function even to
prohibit it.** The shipped comment says "no hex, no colour function, and no bare keyword such as
`red` either" and states explicitly why it spells none of them out. `red` is safe only because
the scanner does not match bare keywords — which is the same gap Plan 6 T2 is due to close, and
when it does, **this comment will need rewording again**. Flagged rather than pre-emptively
defused, because pre-emptively defusing it means writing a comment that names nothing at all.

Two smaller notes on the same scan: lane 4's `relative(REPO_ROOT, path)` correction **has
landed** — the red above named the package, which was the point of it. And the ruling stands:
`packages/editor` ships **no** colour guard of its own, and I added none.

---

## Deliberate non-additions

- **No `"./editor.css"` subpath export.** `packages/ui` has the precedent (`"./ui.css":
  "./src/ui.css"`) and progress.md records it for this file, but no consumer in any of the 14
  briefs uses it — T15's webview entry does `import '../styles/editor.css'`, a relative import
  inside the package. Adding an export nothing imports is API surface with no caller. Whoever
  mounts the editor from `apps/web` should add it then; the precedent is already recorded.
- **No ProseMirror `validate` on the `wrap` attribute.** Value validation deliberately does not
  live in this schema — the same reason `heading` cannot pin its levels, written out in
  `extensions.ts` and pinned by two cases there. A doc JSON claiming
  `{ type: 'image', attrs: { wrap: 'float-up' } }` round-trips with the `'float-up'` intact.
  Layer 1 is the editor's own doors; layer 3 (the server ingest gate) owns the stored-document
  question. This is stated in the node's docblock so the next reader does not mistake the gap
  for an oversight.
- **No `Features.md` / `test-cases/` entry** — the catalogue is this branch's separate closing
  change set.

---

## Concerns

1. **`group: 'block'` with two float modes is a layout contract nobody has looked at.** The
   `image` node is a block-group atom, and `inline-left` / `inline-right` are CSS floats on it,
   so text does not flow around an image the way "inline" suggests unless the following
   paragraph is a sibling in the same block flow — which it is here, so it works, but the
   arrangement is untested visually and no test in this package can test it. T12's wrap picker
   is the first place a human will see it. If the product actually wants the image *inside* a
   paragraph, the group is wrong and the change is cheap now and expensive after Task 6 pins
   `docToPlainText` behaviour around it.
2. **`alt` has no length or content constraint.** It goes into the doc verbatim and out through
   `renderHTML` into an HTML attribute. Escaping is ProseMirror's `DOMSerializer`, not ours, so
   there is no injection here — but nothing caps it, and the wrap picker (T12) will be the
   thing that types into it.
3. **The census is still version-pinned prose, not a test.** Task 1's report already raised
   this and I did not act on it: turning the ~20-line `getExtensionField` script into a counting
   test would enforce 7/5 and 18/10 against a dependency bump instead of asserting them. My
   change did not move the numbers, so this stays exactly as inherited — but I ran the script
   twice by hand this task, which is the second time someone has, and that is usually the signal.
4. **`packages/editor` still ships no colour guard**, per the standing ruling, so the bare-keyword
   gap in `editor.css` is covered by review only until Plan 6 T2 widens `findColourLiterals`.
   Unchanged by me; restated because my file is now the first one in that tree.

---
---

# Fix round 1 — a comment claimed a library limitation that does not exist

Second commit. **Two Important findings, both comments; one Minor, one line of behaviour.**
Gate 18/18. Editor **37 → 38** (see the count note below). `packages/ui` 31/31. Census re-run
on the rebuilt dist with `image` confirmed last in the resolved list: **7 paste rules across 5
extensions, 18 input rules across 10 — still unchanged**, so `extensions.ts`'s census sentences
were not touched.

## Important 1 — `validate` exists, is forwarded, and my docblock said otherwise

The claim I shipped — "ProseMirror validates attribute NAMES, not their values" — is **false in
the installed stack**, and it was the *sole stated reason* for leaving the JSON door unguarded.
I did not take the reviewer's word for it; falsifiability cuts the same way when the finding is
against me. Read, then built both ways:

| fact | source | verified |
|---|---|---|
| an attr spec's `validate` is run over every attr | `prosemirror-model@1.25.11` dist:2058-2066 (`if (attrs[attr].validate) attrs[attr].validate(values[attr])`) | read, line-exact |
| `checkAttrs` fires on every `Node.fromJSON` | dist:1542 (`node.type.checkAttrs(node.attrs)`) | read |
| Tiptap forwards an extension attribute's `validate` into the spec | `@tiptap/core@3.30.5` dist:1491 (`buildAttributeSpec`: `spec.validate = extensionAttribute.attribute.validate`) | read |
| the shipped node accepts junk; the same node with `validate` throws | — | **empirical, built both ways in one process** |
| **Heading declares no `validate`** — the corrected comment's load-bearing clause | — | **empirical**: `heading.spec.attrs.level` has keys `["default"]`. Level-99 survival proves no validate *rejects* 99; it does not prove none *exists*, so this was inferred until observed. Swept the whole schema while there: **no node in v1 declares a `validate` on any attribute**, so `wrap` would be the first |

```
SHIPPED (no validate)   wrap spec keys = ["default"]
                        nodeFromJSON  -> accepted, wrap="float-up"
SAME NODE + validate    wrap spec keys = ["default","validate"]
                        nodeFromJSON  -> THREW RangeError: bad wrap: float-up
```

**The design stands** (coordinator's ruling, and I agree with the reasoning): `validate` throws
at LOAD, so one stored junk-wrap document would fail the whole editor hard rather than degrade
to `block`, and that trade is an owner's call. **What changed is the reason.** The docblock now
says the mechanism exists, cites all three dist lines, records that it was built both ways, and
gives the real division — layer 3 rejects at the door, layer 1 coerces whatever it is handed.

**Fixed at all three sites, not just mine.** The claim was seeded in Task 1's files and my
docblock propagated it by cross-reference:

- `src/extensions/ticket-image.ts` — the reason replaced, cross-reference to the disproven
  claim dropped.
- `src/schema/extensions.ts` — the origin. Now says `levels` is not a `validate` and **Heading
  declares none**, which is the actual reason `level: 99` round-trips; it names the earlier
  sentence as false rather than quietly overwriting it, and points at the image node's docblock
  for the same trade reasoned out.
- `test/schema.test.ts` — same correction; its "it cannot be done here" is now "it would throw
  at load", which is the true version.

The heading **tests** were not touched: they pin that `level: 99` round-trips, which is true and
stays true. Only the explanation of *why* was wrong. Enumerated afterwards with
`find … -print0 | xargs -0 grep -niE` (never a bare recursive sweep): the phrase now survives at
exactly one line in the tree — inside the correction that quotes it.

## Important 2 — the stylesheet note named the keyword it claimed not to name

`editor.css:3` said "no bare keyword such as `red` either" while `:8` said the note "spells none
of the forms it prohibits" — falsified within six lines, and my own report had already predicted
that `red` goes red when Plan 6 T2 widens `findColourLiterals`. A known future failure planted
in another package's suite. The example word is gone; the rule reads "no bare colour keyword
either". Swept the file against the named-colour list afterwards: none present. The note is now
self-consistent and survives the widened scanner.

## Minor taken — `data-wrap` rendered uncoerced while the class was coerced

The branch's own theme in miniature. For a stored `wrap: 'float-up'` the node emitted
`data-wrap="float-up"` beside `class="editor-image editor-image--block"` — two spellings of one
fact that disagree, which is exactly what per-attribute `renderHTML` was introduced to kill.
Observed before fixing, against the shipped bytes:

```
× renders a coerced wrap in both spellings when the stored one is junk
  expected '<img data-attachment-id="01J9…" data-wrap="float-up" alt="" src="…"
             class="editor-image editor-image--block">' to contain 'data-wrap="block"'
```

`toImageWrapMode(attributes.wrap)` in the attribute's own `renderHTML` closes it. **M11**:
coercion reverted → that one case red → restored, `md5 bf09f8c26070e4888819933d385749a5` both
sides. Eleven mutants on this task now.

**Count note: 37 → 38, and the extra case is deliberate.** The dispatch said to confirm 37
holds. Falsifiability needs a case that fails against the uncoerced render, and no existing one
could produce a junk stored wrap — the two commands refuse it, which is the point of them. I
could have folded the assertion into the existing junk-node case and kept 37; I did not, because
that case pins the `src` null-guard and this one pins the render vocabulary, and this file's own
neighbour (`schema.test.ts`'s two heading cases) splits exactly this way for exactly this reason
— each claim blind to the other's failure. Per the lane's standing ruling: additive, nothing
deleted, number corrected rather than the tests trimmed to match it.

## Not fixed, per the coordinator's ruling

Float containment (T12's editor root, `display: flow-root`), the `alt` length cap (T12's
picker), and the report's mutant-table denominators. `group: 'block'` **stays** — the argument
given is right and better than mine, and concern 1 of the first round is **withdrawn**:
`inline-left`/`inline-right` name text-wrap behaviour, not inline flow, and an inline node would
be a different feature that makes `block` incoherent as a third member of the same union.

## Concerns after this round

1. **The `validate` trade is now stated but not ruled.** The docblock says why layer 1 coerces
   instead of throwing; nobody has decided whether a junk-wrap document *should* fail loudly. It
   is a one-line change in either direction and the reasoning is written down at the point of
   change, which is the most I can do from inside the node.
2. **Concern 3 of round 1 stands** — the census is still version-pinned prose, not a counting
   test. I have now run the script by hand four times across two rounds.
3. **The stylesheet note will need rewording once more** when Plan 6 T2 widens
   `findColourLiterals` to bare keywords, because the sentence about "the third kind it does not
   yet match" becomes false at that moment. It is phrased as a statement about the scanner's
   current state rather than a permanent one, but it is still prose with an expiry date.

---
---

# Fix round 2 — the mechanism was true and the consequence was invented

Third commit. **Documentation only**: two comment sentences, no behaviour, no test touched.
`test/schema.test.ts` deliberately NOT touched — its parenthetical claims only "it would throw
at load" and asserts no editor-level consequence, so it was already correct. Gate 18/18, editor
**38 holds**, ui 31/31.

**Documentation-only proof, TypeScript printer (`removeComments: true`), both sides through the
same printer** — HEAD blob via `git show HEAD:<path>` against the edited working file:

| file | stripped md5 at HEAD `1702ff7` | stripped md5 after edit |
|---|---|---|
| `src/extensions/ticket-image.ts` | `3c580b60c1850689090969149632313a` | `3c580b60c1850689090969149632313a` |
| `src/schema/extensions.ts` | `8357301ff2050199e779bfa9e69b83bc` | `8357301ff2050199e779bfa9e69b83bc` |

## What was wrong — a different failure from round 1's, and worth naming as its own shape

Round 1 replaced a false claim with a mechanism verified line-by-line. The mechanism was right.
**The consequence I attached to it was never checked.** I wrote that `validate` throwing at load
means "one stored document with a junk wrap would fail the whole editor hard rather than degrade
to `block`" — reasoning from what the library *does* to what this product *experiences*, across
three files and a default option, with a citation that proved only the first half.

Traced the chain rather than assuming it, then built it:

| link | source | verified |
|---|---|---|
| `Editor` passes `enableContentCheck` in as `errorOnInvalidContent` | core dist:6419 | read, line-exact |
| `createDocument` forwards it to `createNodeFromContent` | dist:1052-1058 | read |
| on the catch branch, without the flag: `console.warn` then `createNodeFromContent('')` | dist:592-602 | read |
| `enableContentCheck` defaults **false** | dist:6150 | read |
| it is set nowhere in this repo, and there is exactly ONE `new Editor(` site | `test/helpers/create-editor.ts:9` | enumerated with `find … -print0 \| xargs -0 grep -n`, never a bare recursive sweep |

Then built, on a document of two paragraphs of real user prose either side of one bad image:

```
SHIPPED node, default options
   CONSTRUCTED — doc = [paragraph "the GST receipt is attached", image(float-up), paragraph "filed on the 20th"]
   console.warn: none
VALIDATING node, DEFAULT options (enableContentCheck unset)
   CONSTRUCTED — doc = [{"type":"paragraph"}]
   console.warn: ["[tiptap warn]: Invalid content."]
VALIDATING node, enableContentCheck: true
   THREW Error: [tiptap error]: Invalid JSON content
```

**Both paragraphs are gone.** The real trade is not "fail hard versus degrade to `block`" — it
is **silent total document loss versus degrade to `block`**, and the text destroyed had nothing
to do with the attribute that failed. That is quieter and considerably worse than my sentence
claimed, and it makes the design conclusion *easier*, not harder: leaving `validate` off is more
clearly right than the comment made it look. Nothing about the ruling changes.

Both sentences now separate what was read from what was run — the trace carries dist lines, the
consequence is labelled as built.

**One thing I observed and am NOT explaining:** the `enableContentCheck: true` run also emitted
the warn, though dist:592-602 throws before warning on that branch, so it comes from a call site
I did not chase. Recorded rather than rationalised; neither of my two claims rests on it.

## The generalisation, in my own words

Round 1's lesson was "do not assert a library limitation you have not checked". Round 2's is
narrower and sharper: **verifying a mechanism is not verifying its consequence.** The dist really
does throw. What this editor does with the throw is a separate question with a separate answer,
living in a different file behind a default option, and the citation that proves the first says
nothing about the second.

**Three shapes from one paragraph now, and I owe the middle one an honest entry**:

1. **A false claim** — "ProseMirror validates attribute NAMES, not their values", shipped in
   `f840f4e`.
2. **An inferred fact stated as observed** — "Heading declares none", shipped in `1702ff7`
   inside the very correction that was replacing shape 1. It happened to be true, and I only
   found that out by building it *after* it was committed. A true sentence asserted without
   evidence is the same failure as a false one; it just settles the bet in your favour.
3. **A true mechanism with an assumed consequence** — this round's, shipped in `1702ff7` and
   corrected in `0037562`.

The check that would have caught all three is one check: for each sentence, ask what was
verified and what is being inferred from it, and either cite both or claim only the first.

## Recorded from the reviewer's method notes

**Third live confirmation of the `diff` hazard on this branch**: `diff` reported the two commit
trees as identical, which is how the reviewer knew to fall back to blob-by-blob `git ls-tree`
comparison. The LANE-CONTEXT prohibition is not defensive folklore; it has now misfired three
times where someone was watching.

## Carried, no action (coordinator's ruling)

`editor.css:11` names `currentColor` — not a CSS named colour, and the mechanism the note itself
prescribes, but the one token in that file a widened `findColourLiterals` could match. That is
round-1 concern 3 arriving at a specific line number; carried to Plan 6 T2 rather than reworded
pre-emptively.

## Concerns after this round

1. **The throw-vs-coerce trade is now accurately stated and still not ruled.** It is a better
   documented open question than it was: the cost of getting it wrong is a silently emptied
   document, which is now written at the point of change.
2. **Census still version-pinned prose** — unchanged, and I have now hand-run the script five
   times across three rounds.
3. **`enableContentCheck` is false everywhere and nothing pins that.** The whole consequence
   above turns on a default that no test asserts and one `new Editor(` site that no test
   guards. If a later task constructs an `Editor` with `enableContentCheck: true`, this
   comment silently becomes wrong again — the fourth shape of the same paragraph. A one-line
   assertion on the resolved option would close it; out of scope for a documentation-only round,
   and I am flagging rather than smuggling it in.

---
---

# Fix round 3 — the hinge of a shipped comment, pinned on the resolved option

Fourth commit. **One test case.** Gate 18/18, editor **38 → 39**, ui 31/31. One file touched:
`test/schema.test.ts`. No source change, so nothing to re-census and no comment edited.

## What it pins, and why on the resolved option

`src/extensions/ticket-image.ts`'s corrected consequence rests entirely on
`enableContentCheck` being false: `Editor` passes it in as `errorOnInvalidContent` (core
dist:6419 → dist:1052-1058 → dist:592-602), and only on the false branch does the catch swallow
rather than rethrow. Nothing asserted it. A later task setting it true would silently falsify a
shipped comment — the fourth shape of that paragraph, and **the first one no reviewer could
catch by reading**, because the comment would still be internally consistent and only its
relationship to the configuration would have changed.

Asserted on `editor.options.enableContentCheck` — **the resolved editor option**, never on the
absence of a key in the helper's source. An absent key proves nothing about what Tiptap
resolved, and the gap between what a citation proves and what a sentence claims is this
paragraph's whole history; pinning the source would have been that gap one more time.

The case has a second half, driven rather than described, so the pin and the comment cannot
drift apart while both stay green: a document of two paragraphs of user prose either side of one
unloadable node comes back as `[{ type: 'paragraph' }]`, `getText()` is `''`, the prose is gone
from the JSON, and `console.warn` fired with `Invalid content`. `marquee` reaches the same catch
a `validate` throw would, so the path is the product's own with no invented validating node in
it. That last clause shipped in `2a8fa3b` as an inferred mechanism — shape 2 again, inside the
test that exists because of shape 2 — and is now **read**: `Schema.nodeType(name)`
(prosemirror-model@1.25.11 dist:2497-2501) is `if (!found) throw new RangeError("Unknown node
type: " + name)`, called from `Node.fromJSON` at dist:1541. The clause is correct; it was
committed without evidence, which is the failure regardless of how the bet settled. **The assertion and the comment say the
same thing** — checked, as instructed, rather than assumed.

**M12**: `enableContentCheck: true` added at the single construction site → both halves red
(`expected true to be false`, and the consequence half throwing `[tiptap error]: Invalid JSON
content` instead of swallowing) → restored, `md5 83c6f822cee34809c8dd11606abb35ef` both sides.
Twelve mutants on this task.

## Two honest limits on what this buys

1. **It was already half-caught, by accident.** M12 also turned Task 1's
   *"and without errorOnInvalidContent the same doc is stripped with only a console warning"*
   red, because that case shares the helper. So the option was not entirely unguarded — but that
   test names a different property (what `setContent` does without the flag), and its failure
   would read as a broken content-stripping test, not as *someone changed
   `enableContentCheck`*. What the new case adds is the **name**, not the detection: a red that
   says which decision was reversed.
2. **It guards the construction site that exists today, and only that one.** Both cases run
   through `createTestEditor`. A NEW `new Editor(` — T12's React component, T15's webview entry
   — could set `enableContentCheck: true` and neither case would see it. Enumerating
   construction sites and asserting the option on each is the version of this that would
   actually hold; one assertion at today's single site is what this round is scoped to, and I
   would rather say so than let the pin read as broader than it is.

## Out of scope this round, per the coordinator

The throw-vs-coerce product question goes to the coordination doc as a ruling request with the
costing from round 2 (silent total document loss, unrelated content destroyed, versus coercing
to `block`). The census counting test moves to **Task 4** as a named deliverable — and the churn
argument against it was wrong in a way worth recording: the census counts rules **declared** on
extensions, while Task 5's levers gate plugin **registration** at the `Editor`, so the numbers
are invariant under whatever Task 5 decides. Five hand-runs was the friction evidence; the
reasoning is what makes it safe to land early.

## Concerns after this round

1. **The pin does not survive a second `Editor` construction site** (limit 2 above). T12 and T15
   both create one. Whoever writes them should assert the resolved option there too, or the
   guard silently narrows to a test helper while the comment it protects talks about the
   product.
2. **The throw-vs-coerce trade is still unruled** — now accurately costed, and now pinned on
   both sides: the comment states the consequence and a test holds the configuration it depends
   on.
3. **Census: handed to Task 4**, no longer mine to carry.

---
---

# Post-rebase reconciliation — and an rtk hazard that invented a repository state

**Not a fix round.** No commit, no file changed. Recorded because two things in this report were
made stale by events outside the session, and because the way I nearly missed it is worth more
than the correction.

## The branch was rebased under me; the work survived intact

Every sha in this report above this section has been **rewritten** — the rebase replayed the
whole branch onto an updated `main`, so my four commits kept their messages and order and got
new identities. The report has been updated in place; the mapping is:

| round | sha as committed | sha after the rebase |
|---|---|---|
| Task 3 | `fd796aa` | **`f840f4e`** |
| fix round 1 | `26d6073` | **`1702ff7`** |
| fix round 2 | `2591d98` | **`8e60448`** |
| fix round 3 | `cb3b073` | **`2a8fa3b`** |

The base moved too: `f1b6c0c` (the HEAD my dispatch named) is now `49b822b`.

**Content verified for ALL FOUR pairs, not assumed** — blob by blob per LANE-CONTEXT, never a
`diff`. Rewriting the shas in this report would otherwise have converted three *measured* facts
(the stripped-md5 tables, each taken against an old blob) into inferred ones, so every pair was
checked, not just the tip:

| pair | blobs | listing md5 (both sides) |
|---|---|---|
| `fd796aa` → `f840f4e` | 16 | `c4b8c0bca4ce627e79c3a5526c02660e` |
| `26d6073` → `1702ff7` | 16 | `2f26247d961f3979e981dc6a6f878d55` |
| `2591d98` → `8e60448` | 16 | `9d74c93f68e120d8b223b5560dbaad0f` |
| `cb3b073` → `2a8fa3b` | 16 | `32c509bd527fc12a86714a75bfc7ccda` |

Identical on every pair — none changed, added, or dropped. Nothing of mine was altered by the
rewrite, and every rewritten citation above is now observed rather than substituted on the
assumption that the tip pair generalised.

**A false result on the way there, worth recording**: the first attempt at this comparison ran
the four pairs through a shell loop whose word splitting silently failed, so both shas arrived
as one argument. It reported **all four pairs DIFFER** — and the tell was that all four "new"
listings hashed identically to each other while the tip pair disagreed with its own
independently verified value. A verification harness that fails open produces confident false
findings in whichever direction its bug points; this one nearly manufactured a data-loss report
about a rebase that had lost nothing.

## Two figures in this report were stale, and one claim had to be re-checked

- **The gate is 21/21, not 18/18.** The rebase brought in packages that did not exist when I ran
  it — `@gisik-nokma/sync-client` among them. Re-run on the actual current tree: domain 241 ·
  rule-engine 128 · server 106 · editor **39** · ui 31 · sync-client 8 · app-core 5 = **558**,
  all green. Every "18/18" above is true of the tree it was run on and false of this one.
- **The dependency versions every citation is pinned to are unchanged.** The lockfile is the one
  file the rebase had to merge, and an install demonstrably ran (sync-client's tests pass), so
  the `dist:NNN` line references in `ticket-image.ts` and `extensions.ts` and the census's
  "pinned to tiptap 3.30.5" were all live claims about a tree that had moved. Checked:
  `@tiptap+core@3.30.5` and `prosemirror-model@1.25.11`, both unchanged. Every citation stands.
- **`editor.css`'s claim had to be re-verified, because a rebase could have falsified it without
  my touching a byte.** The comment says the scanner "does not yet match" bare colour keywords.
  Read `COLOUR_LITERAL` on the post-rebase tree: still
  `/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\s*\(/g` — hex and functions
  only. The claim holds. Had lane 4's widening landed in this rebase, that sentence would have
  become false **by arriving**, which is the fourth shape of the paragraph reaching the tree
  through someone else's merge rather than my keyboard. Worth stating as a class: a
  version-pinned prose claim about another package's code can be falsified by a rebase, and
  nothing in this repo would go red.

## THE HAZARD: rtk's filtered git output reported a repository state that did not exist

This is the part to carry to LANE-CONTEXT, next to the `diff` prohibition.

While appending to this report, `git status --short` and `git log` (through the rtk proxy that
rewrites Bash git commands) reported:

```
rebase in progress
* HEAD (no branch)
A  packages/editor/package.json          ← 13 staged additions
...
UU pnpm-lock.yaml                        ← a merge conflict
```

and `git log -4` showed four commits that were **not** my branch's tip. A filtered
`git rev-parse exec/07-editor-client` returned `cb3b073` — the pre-rebase sha.

**None of it was true.** `rtk proxy git status --porcelain=v2 --branch` — the same command
unfiltered — returned:

```
# branch.oid 2a8fa3bffba0bf225753a7bc94136d508b5e7e52
# branch.head exec/07-editor-client
# branch.upstream origin/main
# branch.ab +12 -1
```

No conflict, no staged entries, **clean tree, HEAD attached to the branch**. There was no
rebase in progress: no `rebase-merge` or `rebase-apply` directory existed in the worktree's
git-dir, which is what made me distrust the filtered answer rather than act on it.

**The danger is specific and severe.** The obvious responses to that fabricated picture are
`git rebase --abort` or resolving the phantom `pnpm-lock.yaml` conflict. Either would have
damaged a branch that was completely healthy, and the destruction would have been *caused* by
the diagnostic. I do not know the mechanism — stale cache, a summariser hallucinating a
conflict, or a real transient state cached past its life — and I am not guessing, because
guessing at a mechanism from its output is the exact defect this task has now recorded three
times.

**The rule, stated the way I would want to read it:** the recorded pitfall for rtk was about
*search* returning silent empty results. It is broader than that. **rtk's filtered output can
fabricate git state, including conflicts and detached HEADs, and can serve stale refs.** Any
git command whose answer is about to be acted on — status, log, rev-parse, branch state —
must go through `rtk proxy`, and porcelain formats (`--porcelain=v2`) resist reformatting where
human-readable ones do not. This is the same failure family as the `diff` prohibition: a tool
that is trusted precisely when you are least able to check it.

## Nothing outstanding from this section

Four commits, content-verified identical across the rewrite, gate green at 21/21 on the tree
that actually exists. The branch is **behind `origin/main` and moving** — −1 when I began this
reconciliation (`5ca8fe3`, a coordination-doc commit), −2 by the time I finished it. Rebasing
onto it is not mine to decide, and the drift figure is a moving target rather than a fact to
quote.
