# 9. Editor, documents & attachments — test cases

Mirrors `Features.md` §9. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file does not start at 9.1.** `Features.md` §9 and this bucket belong to
Plan 7 by the coordination doc's reservation table (§3→Plan 1 … §6→Plan 4, then §7+ one per plan in
order). **Plan 7's own Task 16 pins cases 9.1–9.34 and states "no other numbers".** That task has not
run, so those ids are reserved and are NOT claimed here. `9.35` was already assigned on this branch to
the embeddable-image walker, past the end of T16's list, following `bd9e022`'s `5.37` precedent. This
file continues from there. **Never renumber; when T16 lands, its 9.1–9.34 fill in above these.**

**Scope of this file today.** Plan 7's client half as it stands on `exec/07-editor-client`: Task 1
(document schema v1 and the one extension set), Task 2 (the embeddable-image walker), Task 3 (the
ticket image node), Task 4 (the mention node and picker) and Task 11a's domain half (attachment
kinds). The server half, the upload pipeline, the attachment list UI and the editor's React surface
are not on this branch and appear here only where a case already constrains them.

**A `✅` here names the file that covers it, following `03`/`04`/`05`.** No test in this repo cites a
case id in either direction — a known repo-wide gap, owner workspace/Plan 11 — so a `✅` is checkable
by reading the named file and not by grep alone.

## Document schema v1

- 9.35 ✅ The embeddable-image walker has one definition of what may be embedded (`isEmbeddableImageMime`) and survives whatever a hostile document hands it: cycles, absurd depth, non-object nodes, a `content` that is not an array, and attribute bags that are strings or null. `type === 'image'` is a load-bearing discriminator, not decoration — a walker that also harvested a file chip or a mention id would silently change what the server gate checks. (`packages/domain/test/doc-embeds.test.ts`)
- 9.36 ✅ `isDocJson` accepts a `{type:'doc'}` object and refuses everything else; `emptyDoc()` round-trips through it and carries `DOC_SCHEMA_VERSION`. (`packages/editor/test/schema.test.ts`)
- 9.37 ✅ The node and mark vocabulary of the built extension list is pinned by SET equality, so an extension adding a node or mark that schema v1 does not name fails here rather than reaching a stored document. (`packages/editor/test/schema.test.ts`)
- 9.38 ✅ `VersionedDocument` stamps `schemaVersion 1` into the serialized doc, accepts a version-less doc by letting the attrs default fill in, and round-trips its own JSON byte-stably. (`packages/editor/test/schema.test.ts`)
- 9.39 ✅ Every document this editor produces round-trips through the domain's `docToPlainText` with the same text the editor renders — the conformance direction, so the search projection and the editor cannot disagree about what a document says. (`packages/editor/test/doc-text-conformance.test.ts`)

## What silently becomes markup

- 9.40 ✅ The paste-rule and input-rule census is exact and per-extension, not a total: seven paste rules across five extensions and eighteen input rules across ten, the two sets disjoint. A library upgrade that adds or moves one fails here naming the extension. (`packages/editor/test/rule-census.test.ts`)
- 9.41 ✅ The link lever really is shut where it can be: no paste-to-link plugin is registered at all, and `handlePaste` declines the paste. Verified against the resolved option set of the built list, not against the library's documentation. (`packages/editor/test/schema.test.ts`)
- 9.42 ✅ CURRENT BEHAVIOUR, pinned as current and not as desired: a pasted URL becomes a link anyway, and pasted markdown syntax becomes marks — no value of `markdownLinks` stops either, because both branches of the link extension's paste rules link plain URLs. The tests say **flip, don't delete** when §2 is ruled on. (`packages/editor/test/schema.test.ts`)

## Ticket image node

- 9.43 ✅ `IMAGE_WRAP_MODES` is the one vocabulary of wrap values, and an unrecognised stored `wrap` is COERCED to `block` at the parse door rather than refused — a refusal at load throws and, with `enableContentCheck` at its default, empties the entire document, destroying text that has nothing to do with the bad attribute. (`packages/editor/test/ticket-image.test.ts`)
- 9.44 ✅ Each image attribute serializes under exactly one name and survives a full HTML round trip with every attr intact; a junk stored wrap renders coerced in both spellings. This is what pins the validation to the per-attribute `parseHTML` rather than the node-level `getAttrs`, whose returned attrs the per-attribute handlers merge over. (`packages/editor/test/ticket-image.test.ts`)
- 9.45 ✅ An image node resolves its URL through `resolveAttachmentUrl` and stores only the `attachmentId`, so a document never hard-codes a server route. (`packages/editor/test/ticket-image.test.ts`)

## Mention node

- 9.46 ✅ Both mention attributes carry their own `parseHTML` and `renderHTML`. A crafted `<span data-mention-user-id="…A" userId="…B" label="Mallory">@Anselma</span>` cannot store a different person than the one displayed — the person-substitution forgery, in the field notifications read. Reverting either attribute's handlers reddens exactly the two-spellings cases. (`packages/editor/test/mention.test.ts`)
- 9.47 ✅ The outward direction carries no second spelling: parse → render → parse is stable, and `label`'s `renderHTML` returns `{}` so `getRenderedAttributes` cannot write an unguarded duplicate. (`packages/editor/test/mention.test.ts`)
- 9.48 ✅ One trim-and-refuse rule covers both fields on insert: a blank, whitespace-only or missing `userId` or label is refused rather than substituted, because a mention with a blank label prints the raw ULID in every search projection and notification, and one with a blank id renders perfectly and addresses nobody. (`packages/editor/test/mention.test.ts`)
- 9.49 ✅ A blank or whitespace-only id is refused at the PARSE door too, where a node-level `getAttrs` returning `false` short-circuits before the per-attribute merge — and the name survives as literal text, so the refusal discards nothing. (`packages/editor/test/mention.test.ts`)
- 9.50 ✅ A present id with a missing NAME is still admitted through both the JSON and parse doors, deliberately: refusing it would discard the one fact the markup carried and demote a repairable mention to unrepairable text. Layer 3 rejects it. Pinned so this stays a decision rather than an oversight. (`packages/editor/test/mention.test.ts`)
- 9.51 ✅ `<span>` without `data-mention-user-id` is not claimed as a mention — the attribute is the discriminator, not the tag, so arbitrary pasted markup cannot become a claim about a person. (`packages/editor/test/mention.test.ts`)

## Mention picker

- 9.52 ✅ Typing `@an` opens the picker on matching candidates; Enter inserts the selected one; a candidate with a blank userId or blank name is never offered. (`packages/editor/test/mention.test.ts`)
- 9.53 ✅ Escape dismisses the picker, the typed text stays literal, and the popup's DOM container is removed. The dismissal-reaches-`dispatchExit` half cannot be reddened by any mutation of this package (`@tiptap/suggestion` calls it unconditionally); the teardown half can, and does. (`packages/editor/test/mention.test.ts`)
- 9.54 ✅ Navigation keys are declined when there is nothing to navigate, so the picker does not swallow arrows on an empty result. (`packages/editor/test/mention.test.ts`)
- 9.55 ✅ The picker announces its result count politely, points the editor at the active option, hands the ARIA role back on exit, and puts nothing tabbable in the popup. (`packages/editor/test/mention.test.ts`)
- 9.56 ✅ The stylesheet declares exactly the BEM classes the code emits and the code emits exactly those — set equality in BOTH directions against one shared contract list, so a rule for a class nobody emits and a class nobody styles both fail. (`packages/editor/test/mention.test.ts`)

## Attachment kinds

- 9.57 ✅ An `attachment.added` claim states which of the two kinds it is or is refused at the door; a Drive reference and an upload are two shapes, not one shape with optional fields. (`packages/domain/test/attachment-kinds.test.ts`)
- 9.58 ✅ `isDriveReference` and the evidence rule's reason string are pinned to each other, so the second cannot quietly stop meaning the first. (`packages/domain/test/attachment-kinds.test.ts`)

## Not on this branch

- 9.59 ❌ The attachment upload pipeline end to end (client submit → server sniff → stored `mime`/`size` as the server's truth, per coordination amendment 15). Owner: Plan 7 Task 12.
- 9.60 ❌ The attachment list surface, including a Drive reference rendering as a link rather than an embed. Owner: Plan 7 Task 13.
- 9.61 ❌ The editor's React surface (`EditorSlot`) mounting the extension set inside the ticket sheet. Owner: Plan 6a Task 12 with Plan 7's editor.
- 9.62 ❌ Spec §2's escape-suggestion mechanic for text that should not become markup. Owner: Plan 7 Task 5, which decides whether §2 reaches paste and drop at all; Task 12 is the implementation site, since `enablePasteRules`/`enableInputRules` are `Editor` options `buildEditorExtensions` structurally cannot reach.
