# Task 4 — Mention node and picker — report

**Status: DONE_WITH_CONCERNS** (one open question for the controller, §9)
**Commit:** `8d883e0adfb7b0892129e6b0191c8d84187e4354` — one commit, on `exec/07-editor-client`, parent `2a8fa3b`.
**Gate:** `pnpm turbo run build test typecheck` → **21/21 successful**. `packages/editor` **64 tests**, counted
from the run itself. The dispatch's **39** is advisory and I did not count it; it reconciles as 64 − 25 new
cases (`mention.test.ts` 20 + `rule-census.test.ts` 3 + `doc-text-conformance.test.ts` 2). `packages/ui`
**31/31** — the repo-wide colour scanner is green on the CSS this task appended.

---

## 1. Files

| Path | Change |
|---|---|
| `packages/editor/src/extensions/mention.ts` | new — node, `mentionLabelOf`, suggestion wiring |
| `packages/editor/src/extensions/mention-popup.ts` | new — plain-DOM renderer |
| `packages/editor/src/schema/extensions.ts` | `Mention` imported and configured; `MentionCandidate` declaration removed (origin moved) |
| `packages/editor/src/index.ts` | barrel: `MentionCandidate` re-pointed, `Mention`/`mentionLabelOf`/`mentionSuggestionKey`/`MentionOptions` added |
| `packages/editor/src/styles/editor.css` | popup + `.editor-mention` structure appended |
| `packages/editor/test/mention.test.ts` | new — 20 cases |
| `packages/editor/test/rule-census.test.ts` | new — 3 cases (the named extra deliverable) |
| `packages/editor/test/schema.test.ts` | `'mention'` added to `SCHEMA_V1_NODES`; **still set-equality** |
| `packages/editor/test/doc-text-conformance.test.ts` | 2 cases for the mention shape |

**`packages/domain/src/doc-text.ts` UNTOUCHED** (a MUST). Proven by blob hash, not by any `diff`-family command:
`git ls-tree -r HEAD -- packages/domain/src/doc-text.ts` → `deae8b56bdf29b29002d9e3dd1cc9aeac73689df`;
`git hash-object` on the working file → the same. Nothing outside `packages/editor` changed — the nine staged
paths above are the complete `git status --porcelain=v2` list, taken on a clean tree with no git operation in
flight. No probe file survived into the commit.

---

## 2. The headline: the brief's attribute validation gives the mention to a different person

The brief puts both attrs in the node-level `parseHTML().getAttrs`. The controller told me to check it the way
Task 3 did — by shipping it and watching a hostile value win — so that is what happened, not a reading.

**Shipped brief-verbatim, then probed.** On
`<span data-mention-user-id="01J9GUSA…" userId="01J9GUSB…" label="Mallory">@Anselma</span>`:

```
- Expected                              + Received
-   "label": "Anselma",                 +   "label": "Mallory",
-   "userId": "01J9GUSA000000000000000000",  +   "userId": "01J9GUSB000000000000000000",
```

Both attrs were overwritten. The mechanism is the one Task 3 recorded:
`injectExtensionAttributesToParseRule` (@tiptap/core@3.30.5 **dist:1452-1472**) rebuilds each parse rule's
`getAttrs` as `{ ...oldAttributes, ...newAttributes }` — node-level first, per-attribute second — and the
per-attribute default when an attribute defines no `parseHTML` is `fromString(node.getAttribute(item.name))`
(**dist:1460**). `getAttribute` is case-insensitive on an HTML element, so `userid="…"` reaches it too.

One detail worth recording because it differs from the `wrap` case and could mislead a later reader:
**dist:1461** skips a per-attribute result that is `null`/`undefined`, so a per-attribute default only wins
when the bare attribute is actually *present* in the markup. The hostile document supplies it, which is the
whole point — but "node-level `getAttrs` is always dead" would be too strong a sentence, and it is not the one
in the code.

**Why it matters more here than for `wrap`.** A bad `wrap` mis-set a float. A bad `userId` means the stored
document says a *different person* was mentioned, in exactly the shape `docToPlainText` feeds to notifications.

The same mechanism runs outward: `getRenderedAttributes` (**dist:1431**) writes an attribute with no
`renderHTML` out under its own name. The brief's version serialized

```html
<span userid="01J9GUSA…" label="Anselma" data-mention-user-id="01J9GUSA…" class="editor-mention">@Anselma</span>
```

— two spellings of each fact, of which only one is read back through a guard.

**Fix:** both attributes carry `parseHTML` *and* `renderHTML`, following `ticket-image.ts` exactly. `label`'s
one spelling is the span's text content; its `renderHTML` returns `{}` so `getRenderedAttributes` adds no
second one. `renderHTML` no longer restates `data-mention-user-id` (it arrives through `HTMLAttributes`).
The node-level rule is now the bare `[{ tag: 'span[data-mention-user-id]' }]`.

---

## 3. The empty-label hazard, and what I chose

`packages/domain/src/doc-text.ts` (frozen) reads:

```ts
typeof attrs.label === 'string' && attrs.label.length > 0 ? attrs.label
  : typeof attrs.userId === 'string' ? attrs.userId : 'unknown'
```

So an empty label prints the ULID. Pinned as a fact about the shipped walker in two places
(`mention.test.ts` and `doc-text-conformance.test.ts`), asserted `toBe('@01J9GUSA000000000000000000')`.

**Decision: refuse, and trim.** `mentionLabelOf(candidate): string | null` trims the name and returns `null`
when nothing is left.

- **Trim, because the length check alone is not enough.** A name of three spaces passes the walker's
  `length > 0` and prints `@   ` — a mention of nobody that no check on the raw string would catch. Trimming
  makes the blank and the empty case one rule, and it also stops `'  Anselma  '` from rendering as `@  Anselma  `.
- **Refuse, not substitute.** The local precedent is `insertTicketImage`, which returns `false` for a
  non-image mime rather than coercing. A stand-in like `'unknown'` would put a name nobody has into a stored
  document and from there into someone's notifications — worse than the ULID, because it *looks* like a name.
- **The door that closes it is `items`, not `command`.** A candidate this editor cannot label is never
  offered, so there is no row to click. A refusal in `command` alone would leave a visible row whose click
  does nothing.

**The `command` guard is honest about being unreachable.** M4 deletes it alone: **all 64 tests stay green.**
That is written into the code comment rather than glossed, because "a check that cannot fail is not evidence"
is the same law that made me delete the popup's Escape branch (§5). It is kept for two stated reasons: it is
what makes `label` a `string` instead of a `string | null` asserted away, and it is live the moment the filter
is not. The evidence for the second is the M3/M5 pair — the same case, reddened with **different documents**:

| mutant | received |
|---|---|
| M3 — `items` filter deleted, `command` guard intact | `[]` — the command refused |
| M5 — both deleted | `[{ label: "   ", userId: "01J9GUSC…" }]` — a mention of nobody reached the document |

**Scope, stated narrowly on purpose.** The guard covers **the label, on the insert path, only.** Two doors are
left open and are pinned open by a test: a document loaded from JSON, and one parsed from HTML, can both carry
`label: ''`. That follows `ticket-image.ts`'s reasoning verbatim — a ProseMirror `validate` is available and
forwarded (core dist:1491), but it throws at load, `enableContentCheck` defaults false, and the catch replaces
the **whole document** with an empty one. Layer 3 is the cheaper place.

---

## 4. The rule-census test (the named extra deliverable)

`packages/editor/test/rule-census.test.ts`, 3 cases. Method unchanged from the five hand runs:
`getExtensionField(extension, field, context)` — the accessor core itself reads at **dist:5220** /
**dist:5232** — over `resolveExtensions(buildEditorExtensions())`, with the same five context keys core builds
at **dist:5195-5201**, counting what the functions return.

**Per-extension maps are asserted, not the totals.** `expect(counts).toEqual({...})`. A change giving `link`
a second paste rule while dropping `strike`'s leaves `7 === 7` and would pass a totals test.

**Before / after: UNCHANGED.**

| | before (pre-mention) | after |
|---|---|---|
| paste | **7 across 5** — `link` 1, `bold` 2, `code` 1, `italic` 2, `strike` 1 | **7 across 5**, identical map |
| input | **18 across 10** — `bold` 2, `blockquote` 1, `bulletList` 1, `code` 1, `codeBlock` 2, `heading` 6, `horizontalRule` 1, `italic` 2, `orderedList` 1, `strike` 1 | **18 across 10**, identical map |

Both runs are real: the baseline was taken before `mention.ts` existed, the after-run printed the resolved
name list and it ends `…,image,mention` — so the count was taken on a list that actually contains the new
node (Task 3's freshness guard).

**Why mention contributes zero, mechanism cited rather than assumed:** it defines neither `addInputRules` nor
`addPasteRules`, and `@tiptap/suggestion` is a plain ProseMirror plugin that reaches core through
`addProseMirrorPlugins` (**dist:5243**) — a different branch from the two rule gates at dist:5220 and
dist:5232. **The comment block in `extensions.ts` needed no edit and got none.**

**The harness can fail.** M1 (`markdownLinks: true`) moves the input census to 19 across 11 and reddens 2 of
the 3 cases. `extensions.ts` restored and re-verified by md5 (`750a0a82…` before and after), never by a diff.

One small correction to the file itself: `getSchema` is handed the **built** list rather than the resolved one
— feeding it an already-resolved list makes it flatten StarterKit's children twice and warn about twenty
duplicate extension names, noise that trains a reader to skip this file's stderr.

The third case pins that the two rule sets are disjoint *as rules* — `bold`, `code`, `italic`, `strike`
contribute to both censuses, `link` only to paste — which is the fact Task 5's "no single lever settles §2"
argument rests on.

---

## 5. Two defects the brief did not know about

**(a) The popup swallowed Enter while it had nothing to offer.** `items` resolves asynchronously, so the popup
exists with zero rows from the moment `@` is typed. The brief returns `true` for Enter, ArrowUp and ArrowDown
unconditionally, so typing `@` then Enter did nothing and the editor looked frozen. Now: `if (items.length === 0)
return false;`. Probe P5 caught it on the brief-verbatim build; M6 reddens the shipped case.

The test asserts the **effect** — the block split — not what `handleKeyDown` returned. My first draft asserted
`toBe(false)` and failed against the *correct* implementation: `someProp` walks on to the next plugin when the
popup declines, so the `true` came from StarterKit's own Enter binding, which is exactly what should happen.
Recorded because it is the same class of error as asserting a citation instead of its consequence.

**(b) The brief's Escape branch is a guard that cannot fail — deleted.** @tiptap/suggestion@3.30.5 owns Escape
at **dist:129-138**: it calls the renderer's `onKeyDown`, then `dispatchExit(view)` **unconditionally**, then
returns `true` whatever the renderer returned. The exit flips plugin state to inactive, which the plugin view
reads as a `stopped` transition and turns into `onExit` (**dist:459-462, 476, 559-563**) — and `onExit` is what
removes the popup. **Run both ways: M9 re-adds the branch and all 64 tests stay green.** It ships as a comment
naming the real handler instead of as dead code dressed as a guard.

**So the brief's "planted defect: Escape" case is not the refusal it says it is**, and the report says so
rather than claiming the credit. Being exact about its evidence, because an earlier draft of this paragraph
was not: against the unmodified pre-Task-4 tree the whole file fails at **collection** —
`Failed to resolve import "../src/extensions/mention.js"` — and that is the only fail-first observation there
is. It is **not** a `waitFor` timing out, and with `mentionLabelOf` imported at the top of the file it could
not be; that sentence was a counterfactual and has been struck from the shipped comment too. No mutation
reddens the dismissal half, because no line in this package delivers it. What the case pins is the half spec
§2 actually cares about, and that half is ours to break: the typed `@an` survives as literal text and no node
was created.

---

## 6. Adaptations forced by shipped code (the standing law)

1. **`MentionCandidate` already had an origin.** Task 1 declared and exported it from
   `schema/extensions.ts`, and `index.ts` re-exported it. The brief's verbatim export line produces
   `TS2300: Duplicate identifier 'MentionCandidate'` — observed, twice, on `tsc -p tsconfig.typecheck.json`.
   Resolved by moving the origin to `mention.ts` (which imports nothing back, so no cycle); `extensions.ts`
   takes it as `import type` and does **not** re-export; the barrel exports it exactly once.
2. **`Suggestion<MentionCandidate>` leaves `TSelected = any`.** The declaration is
   `Suggestion<I = any, TSelected = any>` and `command`'s `props` is `TSelected`, so the brief's single type
   argument leaves the insert path untyped. Both are given: `Suggestion<MentionCandidate, MentionCandidate>`.
3. **`import Suggestion from '@tiptap/suggestion'` is valid** — `export { Suggestion, …, src_default as default, … }`
   at dist:655. No change needed; confirmed rather than assumed.
4. **`render: () => createMentionPopup()`** needs no explicit return-type annotation in the installed minor;
   the brief's four-method annotation was dropped as noise.
5. **`Mention.configure({ queryUsers: … ?? … })` is spelled differently from `TicketImage.configure(…)`** and
   the difference is deliberate, with a comment saying so: TicketImage's default lives in its own `addOptions`
   and `mergeDeep` would let an explicit `undefined` **replace** it, so that option must travel conditionally.
   Mention's fallback is a value at the call site, not a default being protected.
6. **`renderText`/`renderHTML`/`parseHTML` share one `mentionText` helper** so the `@` prefix has one origin
   in this package. The walker in `@gisik-nokma/domain` spells it a fourth time and deliberately cannot import
   this — it is dependency-free on purpose — which is what the two new conformance cases are for.

---

## 7. Mutants — twelve, each observed to fail (or observed *not* to, and reported)

Every source file was restored from a pristine copy and re-verified by **md5**, never by a `diff`-family
command. Pristine hashes: `mention.ts b03f4174…`, `mention-popup.ts e09c1477…`, `extensions.ts 0e7ffa04…`,
`editor.css 8e09f8d7…`, `schema.test.ts c031fe69…`.

| # | mutation | result |
|---|---|---|
| M1 | `markdownLinks: true` | census red 2/3 (input → 19 across 11) |
| M2 | attrs back to the brief's node-level `getAttrs` | red: hostile-HTML, single-spelling |
| M3 | `items` filter deleted only | red 3, incl. the document case with received `[]` |
| M4 | `command` guard deleted only | **GREEN 64/64 — reported, not hidden** |
| M5 | both deleted | red 3, incl. the document case with received `{label:"   "}` |
| M6 | popup's empty-list guard removed | red: navigation keys |
| M7 | `.trim()` removed from `mentionLabelOf` | red 4 |
| M8 | `'mention'` dropped from `SCHEMA_V1_NODES` | red: "the vocabulary is closed" — set-equality still live |
| M9 | popup Escape branch re-added | **GREEN 64/64 — the branch cannot fail; that is why it is not shipped** |
| M10 | `--selected` renamed in the stylesheet | red: BEM stylesheet case |
| M11 | `renderText` deleted | red 2 |
| M12 | `@` prefix dropped from `mentionText` | red 3 |

**A test I caught being vacuous, and how.** The first version of "nothing this editor cannot label ever reaches
the document" waited on `.mention-popup` and clicked everything it found. The popup is created *synchronously*
with zero rows and only fills in when `items` settles — so with the fix in place there was nothing to click
and the case passed **without exercising anything**. M4 and M5 exposed it (it stayed green with the guard
removed). Rewritten to put the nameless row **first** in what the directory returns and click slot 0, which is
what a click and Enter both land on. Both mutants now redden it, with the differing received values in §3.

---

## 8. What the tests cover

`mention.test.ts` (20): the six brief cases; empty-list key handling; the walker's ULID fallback;
`mentionLabelOf` unit cases; nameless candidate never offered; nothing unlabelable reaches the document; padded
name trimmed; JSON and parse doors pinned **open**; hostile bare attributes; single spelling in each direction;
full HTML round trip; a plain `<span>` not claimed as a mention; the four BEM classes in both the stylesheet
and the emitted markup (equality in both directions, the `ticket-image.ts` argument).

`doc-text-conformance.test.ts` (+2): an editor-produced mention renders `@Anselma` inline with no id, and the
empty-label fallback prints the ULID. This is the controller's #1 constraint turned into a check — the walker's
header claims Plan 7's editor conforms to it, and until now that claim ran only in the block-node direction.

`schema.test.ts`: `'mention'` added; the closed-vocabulary case is **still `toEqual` on sorted keys**, proven
live by M8.

---

## 9. Concerns

1. **A candidate with a blank `userId` is refused by nothing.** `mentionLabelOf` guards the label only. A
   candidate `{ userId: '', name: 'Anselma' }` stores a mention that renders perfectly as `@Anselma` and
   resolves to no one — silently wrong in the same way the empty label is, and reachable through the same
   door. It is one condition away and I did not add it, because it changes the helper's shape from
   "label rule" to "attrs rule" and I wanted the diff to stay inside what was dispatched and proven. **Flagging
   it for the controller as a one-line follow-up**, and noting that I do not know whether a layer-3 check on
   mention userIds exists — I have not verified that and am not claiming it.
2. **`.mention-popup` has no background.** The stylesheet is structural by amendment 11 and `packages/editor`
   must not depend on `packages/ui`, so the popup currently renders as a bordered, transparent box over the
   document text. That is unreadable in a real client until the host supplies a surface. It is a real gap in
   the deliverable, not a test failure — the BEM contract is complete and only the colour origin is missing.
   Task 12's React surface is where it lands.
3. **The trailing space is asserted as `editor.getText() === '@Anselma '`.** The brief's
   `not.toContain('@ans')` does catch non-consumption — leftover trigger text would contain the literal
   `@ans` — so it is not the hole an earlier draft of this line claimed. The exact-string form is still the
   better check (it pins the trailing space and the label), and I am flagging only that it is now coupled to
   `renderText`, so a change there fails this case as well as the `getText` one.
4. **`mentionSuggestionKey` is exported and nothing reads it.** It is in the brief's Produces contract, so it
   ships, but no test can fail on it beyond compilation. Task 5 (`exitSuggestion(view, mentionSuggestionKey)`
   is the obvious consumer) is presumably why it exists.
5. **The suggestion plugin's `mount` API is not used.** The popup positions itself from `props.clientRect`,
   as the brief specifies. `@tiptap/suggestion@3.30.5` now offers managed mounting with Floating UI
   (`autoUpdate`, flip, outside-click dismissal via `dismissOnOutsideClick`, which **only applies when `mount`
   is used** — dist:408-415). So today the popup does not reposition on scroll and does not dismiss on an
   outside click. Deliberate for the brief's plain-DOM/headless requirement, but worth a decision before Task 12.

---

# Fix round 1

**Commit:** `08557976aadc7c1aedc3e2e179de9a7f845847af` (one commit, on top of `8d883e0`).
**Gate:** `21/21 successful`. `packages/editor` **70** counted from the run (64 → 70: +6 cases).
`packages/ui` **31/31** — the stylesheet gained a visually-hidden rule and the colour scanner is still green.
Census re-run in the same suite: **unchanged**, 7 paste / 5 extensions, 18 input / 10 extensions.
`packages/domain/src/doc-text.ts` still untouched — blob `deae8b56…` against HEAD, by hash, not by a diff.

Five files changed, all under `packages/editor`: `src/extensions/mention.ts`,
`src/extensions/mention-popup.ts`, `src/index.ts`, `src/styles/editor.css`, `test/mention.test.ts`.

## R1.1 — the blank `userId`, closed

I had the ranking backwards when I deferred this, and the reviewer's sharpening is what shows it: **the empty
label is *visibly* wrong** — a reader sees `@01J9GUSA…` where a name belongs and reports it — **and the blank
`userId` is *invisibly* wrong.** `{userId: '', name: 'Anselma'}` stores `{"userId":"","label":"Anselma"}`,
renders `@Anselma`, reads correctly to every human who sees it, and addresses nobody. With no downstream gate
on mention userIds, nothing catches it later either. A silent failure with no net under it deserves *more*
guard than a loud one, not less.

`mentionLabelOf` → **`mentionAttrsOf`**, returning `MentionAttrs | null`. The rename was ruled in and it is
not cosmetic: the contract widened from a label rule to an attrs rule. One rule now covers both fields — trim,
refuse what trims away — and `command` consumes the result *as* the node's attrs, so the narrowing that made
`label` a `string` now makes the whole object one. `MentionAttrs` and `mentionAttrsOf` are exported from the
barrel; `mentionLabelOf` no longer exists.

**Four further barrel exports, announced here because a reviewer diffing `index.ts` will find them:**
`mentionResultAnnouncement` (the screen-reader copy has one origin, and a host rendering its own picker needs
the same string rather than a fourth spelling of it), `MentionPopupRenderer` and `MentionPopupProps` (the
contract a custom picker implements — the type was previously internal, and a host cannot conform to a shape
it cannot name), and `createMentionPopup` itself (so a host can compose the default picker rather than fork it).

**One stale comment survived the rename into the first commit of this round and was caught in review:** the
`items` docblock still read "THE DOOR THE LABEL RULE ACTUALLY CLOSES … a candidate this editor could not
label", describing only the label failure under a rule that now also refuses a blank `userId`. That is exactly
the drift the rename was ruled in to prevent, committed. Corrected, and swept for siblings across the five
changed files with enumerated paths — one hit, now zero, with `mentionAttrsOf` as a positive control firing 10
times in the same run. Typecheck could not have caught it; it sees no comments.

**Owed cases delivered:** the helper unit case now drives both halves (`{userId:' x ', name:'  Anselma  '}` →
`{userId:'x', label:'Anselma'}`, and null for `''`/`'   '`/`'\t\n'` in *either* field), plus a picker case
observing the row is never offered, plus one observing it cannot reach the document by sitting in slot 0.

## R1.2 — the parse door's stated reason was the wrong reason

The reviewer is right and the correction matters more than the sentence it replaced. I cited
`ticket-image.ts` for **both** open doors:

- **The JSON door** — the citation carries over unchanged. `validate` throws at load, `enableContentCheck`
  defaults false, the catch empties the whole document.
- **The parse door** — ticket-image reaches the **opposite** conclusion: it *guards* its parse door, coercing
  every unknown `wrap` to `block`, and says so in the same docblock I was citing. And no `validate` is needed
  to close this one at all, since a node-level `getAttrs` returning `false` cancels the rule outright. So
  validate-throws-at-load is not what keeps mention's parse door open, and my sentence cited a precedent that
  supports a neighbouring claim rather than the one I made. Same failure class this branch spent five rounds
  on in another file, with my name on it this time.

**The real reason, now written into `mention.ts`:** neither move available is an improvement. *Coercion has no
legal target* — `wrap` has `block` to fall back to; a missing name has nothing, and inventing one is exactly
what the insert path refuses. *Refusal discards evidence* — cancelling the rule on
`<span data-mention-user-id="01J9…"></span>` demotes it to the literal text `@` and throws away the one fact
the markup carried, turning a mention that renders badly (visibly, repairably) into text that cannot be
repaired. The matching paragraph in the test file's block comment was corrected too.

## R1.3 — accessibility

`ui-ux-pro-max` invoked (`--domain web`, `--domain ux`). Its load-bearing rules for this component: *aria-live
for async updates* (Medium), *semantic HTML before ARIA* (High), *keyboard nav / tab order* (High), *colour is
never the only indicator*, and a *z-index scale of 10/20/30/50* — the popup's existing `z-index: 30` is already
on that scale, so it was left alone.

Shipped: `role="listbox"` with its own `aria-label` (the list is detached from the text it belongs to, so
without one a screen reader announces an unlabelled list); `role="option"` rows carrying `aria-selected`;
`aria-activedescendant` on the editor naming the active row; `role="combobox"` + `aria-expanded` /
`aria-controls` / `aria-autocomplete` / `aria-haspopup`; and a `role="status"` `aria-live="polite"` region
carrying the result count, placed **outside** the listbox because a listbox's children must all be options.
Plain DOM throughout; the stylesheet gained only structure.

**Two things that came out of building it rather than reading about it:**

1. **The rows are no longer `<button>`.** A button is in the tab order, so Tab from the editor moved focus
   *into* the popup — working directly against the `mousedown`-not-`click` handler whose entire purpose is
   keeping focus out of it. "Semantic HTML before ARIA" is the right default and this is its exception: the
   semantic element carries behaviour (focusability) the combobox pattern must not have. Pinned by a case
   asserting the popup contains nothing matching a tabbable selector.
2. **ProseMirror already sets `role="textbox"` on the editor element** — observed on the live DOM with a
   throwaway probe, not assumed. So the combobox attributes are **saved and restored**, not set and removed;
   blindly removing `role` on exit would strip ProseMirror's own and leave the editor unannounced. N5 does
   exactly that and goes red, which is the only reason the distinction is testable.

Two BEM classes were added (`mention-popup__list`, `mention-popup__status`), so the frozen contract is now six
names rather than four. The set-equality test was widened to match and still fails in both directions.

## R1.4 — the BEM matcher's blind spots, stated

A comment now says in the test what the regex cannot see: a class containing a digit or an uppercase letter,
or one declared only inside a compound or nested selector. Adequate for these six names; a later reader should
not trust it wider.

## R1.5 — mutants: thirteen, each observed

Restored from a pristine snapshot and verified by **md5** after every run (never a `diff`); all five files
matched at the end.

| # | mutation | result |
|---|---|---|
| N1 | drop the `userId` half of the guard | red 3 — unit case + both new picker cases |
| N2 | drop the `label` half | red 4 — the round-0 guard still proven |
| N3 | rows back to `<button>` | red — the tabbable case |
| N4 | never set `aria-activedescendant` | red |
| N5 | remove `role` instead of restoring ProseMirror's | red |
| N6 | drop `aria-live` | red |
| N7 | nest the status region inside the listbox | red |
| N8 | announcement copy drifts (`1 people match`) | red |
| N9 | never set `aria-selected` | red 2 |
| N10 | rename the stylesheet's status class | red — BEM set-equality |
| M3 | `items` filter deleted | red 5 (was 3; the two new cases join its kill set) |
| M4 | `command` guard deleted alone | **green 70/70 — unchanged, kept, and documented as such** |
| M8 | `'mention'` dropped from the vocabulary | red — set-equality still live |

M4 is retained on the coordinator's ruling, and the distinction is now written into the code in its own words:
*"a test that cannot fail is not evidence; a runtime guard is not evidence, it is a second door."*

**Colour sweep with a firing positive control:** `grep -E '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|color-mix\('`
over `editor.css` → 0 hits; the identical pattern over `packages/ui/src/tokens.ts` → 32 hits. The null is
evidence because the control fired in the same run.

## R1.6 — still open

1. **`.mention-popup` has no background** — unchanged, and confirmed out of scope. A real T12 gap; flagging it
   still beats smuggling a hex into a stylesheet that may not name one.
2. **The `aria-label` "People you can mention" is user-facing copy with no i18n origin.** It sits beside
   `mentionResultAnnouncement`, which has one origin and a test. Neither is translatable yet, and this package
   has no i18n mechanism to hang them on. Naming it so it is a decision rather than an oversight.
