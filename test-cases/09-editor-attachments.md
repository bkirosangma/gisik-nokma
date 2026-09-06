# 9. Editor, documents & attachments — test cases

Mirrors `Features.md` §9. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file does not start at 9.1 — RESOLVED (Task 16).** `Features.md` §9 and this
bucket belong to Plan 7 by the coordination doc's reservation table (§3→Plan 1 … §6→Plan 4, then §7+
one per plan in order). Plan 7's own Task 16 text pinned cases 9.1–9.34 at one-id-per-feature-area
coarseness and claimed "no other numbers" — but every task landing on this branch since (9.35 through
9.87, following `bd9e022`'s `5.37` precedent) instead used one id per TEST, finer than the plan's own
scheme, and Task 15's own fix round (9.77–9.87) is on record diagnosing that granularity mismatch and
resolving it by extending the fine convention rather than forcing new cases into the coarse one.
**9.1–9.34 therefore stay permanently UNUSED, not filled**: filling them now with the plan's coarse
descriptions would put two ids on several of the same test files at two different granularities, which
is the exact defect Task 15's fix round closed. New cases from Task 16 on continue past the highest live
id (9.87 at the time Task 16 ran), currently ending at **9.241**. **Never renumber; 9.1–9.34 will never
be filled.**

**Scope of this file, as of Task 16 (the closing task of Plan 7).** Every task in the plan has landed on
this branch: schema v1 and the one extension set (Task 1), the embeddable-image walker (Task 2), the
ticket image node (Task 3), the mention node and picker (Task 4), escape suggestions (Task 5), `docToPlainText`
conformance (Task 6), the attachments table and `ObjectStore`'s local-disk implementation (Task 7), the
S3-compatible store and factory (Task 8), magic-byte sniffing and `POST /v1/attachments` (Task 9), the
upload content hash (Task 9a), `GET /v1/attachments/:id` (Task 10), the server gate seam plus the
image-embed and evidence gates (Task 11), attachment kinds and the evidence-drive-reference refusal in
the domain (Task 11a), `TicketEditor` and attachment paste/drop layer 2 (Task 12), the Google Drive
picker (Task 12a), honest `AttachmentListItem` rendering — Drive rule 2 (Task 12b), Drive rule 3 —
never inline (Task 12c), the evidence picker and `transitionRequiresEvidence` (Task 13), Drive rule 1 at
the evidence-picker surface (Task 13a), `TicketEditorSlot`/`composeEditorSubmission` (Task 14), and the
RN webview bridge (Task 15). ONE real gap survives past all of that landing, and it is named where its
case would otherwise claim more than the evidence supports: the actual end-to-end mount of
`TicketEditorSlot` into `apps/web`'s `TicketSheet` (case 9.61). A SECOND gap this header used to name
— `registerAttachmentRoutes` never being called from `apps/server/src/app.ts`'s composition root, so
the fully implemented upload/download routes were unreachable on the server this repo boots — has
since been CLOSED by Plan 11: `app.ts` registers both, and
`apps/server/test/routes/attachments-wired.test.ts` is the test that can fail on it (neither older
attachment suite can — each registers the routes by hand). `Features.md`'s attachment upload/download
bullet is corrected to match.

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

- 9.57 ✅ An `attachment.added` claim states which of the two kinds it is or is refused at the door; a Drive reference and an upload are two shapes, not one shape with optional fields. **Correction (Task 16):** the shipping commit cited this file, but the test does not live here — it is `packages/domain/test/ticket-events.test.ts`, already catalogued as **case 5.26**, whose text covers the identical behaviour. (`packages/domain/test/ticket-events.test.ts`; see also 5.26)
- 9.58 ✅ `isDriveReference` and the evidence rule's reason string are pinned to each other, so the second cannot quietly stop meaning the first. (`packages/domain/test/attachment-kinds.test.ts`)

## Evidence picker

- 9.63 ✅ A Drive reference passed on `driveReferences` never appears among the offerable `.evidence-picker__option` buttons, even when its name matches an offerable upload's name exactly — and clicking anything in its `.evidence-picker__unavailable` section picks nothing, because that section carries no `onClick` at all. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.64 ✅ The Drive reference's unavailable section shows the server's own `EVIDENCE_DRIVE_REFERENCE_REASON`, asserted against the exported constant rather than a retyped copy. (`packages/editor/test/evidence-picker.test.tsx`)

## Composer wiring — the `<EditorSlot>` contract

- 9.65 ✅ `composeEditorSubmission` maps the two composer modes onto Plan 3's ledger events and nothing else: comment → `comment.added {body}`, description → `ticket.field_set {fieldId:'description', value}`, with the `value` KEY asserted present because the domain door refuses a field claim whose value is merely absent. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.66 ✅ A successful comment submit clears the composer; a successful description submit keeps the content, because the content is now the saved value. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.67 ✅ A REFUSED submit reports through `onError`, never fires `onDone`, and never clears the words — the clear lives inside the `try` after the `await`, so a rejection skips it. Proven by moving the clear into `finally` and watching this case redden. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.68 ✅ The slot takes `doc` as `unknown` — the only thing app-core can hand it — and narrows with `isDocJson` at the mount, so `null`, `undefined`, a string, a number, `{}` and `[{type:'doc'}]` all open an EMPTY composer while a real document still renders. Proven against a cast in place of the narrowing. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.69 ✅ A slot mounted without `submit`, or read-only, disables the submit button and says WHICH of the two reasons applies in its title, rather than offering a control that discards what is typed. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.70 ✅ A pasted file routes through `emitAttachmentAdded` — the host owns the ledger — and a slot mounted with no uploader REFUSES the paste through `onError` with no claim emitted and no node inserted, rather than swallowing the file. Proven against a fabricated upload result. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.71 ✅ The `<EditorSlot>` contract written twice does not drift unnoticed: a transcription of app-core's declaration is assigned to `TicketEditorSlot` at the type level (typecheck fails on divergence), and a runtime case reads `packages/app-core/src/views/editor-slot.tsx` and fails if its `doc` stops saying `unknown`. Neither is the end-to-end mount, which is still 9.61. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.72 ✅ A parent re-render does not re-initialise the editor. NOTE: mutation testing showed the mechanism is `useEditor`'s empty deps inside `TicketEditor`, NOT the extensions `useMemo` — recreating the extensions array leaves this case green. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.73 ✅ `autoFocus` actually focuses the composer, and its absence leaves the composer unfocused — the contract prop is implemented rather than accepted and ignored. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.74 ✅ Two clicks in one React batch append ONE `comment.added`, not two. The `disabled` attribute is not committed yet at the second click and a `submitting` flag read from the render closure is still false, so the guard is a ref set synchronously before the first await — MEASURED as two events before the fix, in an append-only ledger that can unsay neither. The discrimination is PINNED: jsdom's `click()` returns early on a disabled control, so an assertion between the two clicks that the button is still enabled keeps a React scheduling change from silently turning this into a test of the `disabled` attribute instead of the ref. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.75 ✅ Neither half of the twice-written contract carries a field the other lacks: the field-name sets of app-core's declaration and this package's transcription are compared for equality, which catches an ADDED prop that the type-level assignment cannot (an optional addition still assigns; a required one the transcription never saw is invisible to it). THREE sets, not two: the transcription is compared to app-core AND to this package's own `EditorSlotProps`, because assignability never rejects extra properties on a type, so updating only the transcription would go green while this package's declaration silently never gained the field. Proven against a field added to this package's half alone. (`packages/editor/test/ticket-editor-slot.test.tsx`)
- 9.76 ✅ The slot mounted the way app-core mounts it — NO `editorRef`, the imperative seam that is deliberately absent from the shared `EditorSlotProps` — populates its own `ownRef`, submits `comment.added`, fires `onDone` and clears. Every other runtime case in this file injects `editorRef`, so `props.editorRef ?? ownRef` took its LEFT branch throughout and the production branch had zero executions; `handleSubmit` returns early on `!editor`, so all of them rested on a ref app-core will never supply. Proven against a mutation passing `props.editorRef` straight through to `TicketEditor`: this case reddens, the other seventeen stay green. NOT the end-to-end mount, which is still 9.61. (`packages/editor/test/ticket-editor-slot.test.tsx`)

## RN webview bridge

- 9.77 ✅ `parseHostMessage` accepts each of the five well-formed host-to-editor messages (`loadDoc`, `insertImage`, `requestSubmit`, `mentionResults`, `uploadFailed`), keyed off `kind`. (`packages/editor/test/webview-bridge.test.ts`)
- 9.78 ✅ Planted defect: a missing `bridge` version, a wrong version, an alien `kind`, a `kind` missing its required fields, and a `loadDoc.doc` that is not doc-shaped all answer `null` rather than throwing — proven against `null`, `undefined`, a number, a bare string and an array too. This constrains only the TOP-LEVEL shape of `loadDoc.doc` (`isDocJson`'s own check); a `doc` that passes that check but is hostile in its nested `content` is a separately tracked gap, documented in `bridge.ts`'s own docblock rather than closed by this case. (`packages/editor/test/webview-bridge.test.ts`)
- 9.79 ✅ `createEditorBridge` posts `{kind:'ready'}` as the first message on construction, before any host message has arrived. (`packages/editor/test/webview-bridge.test.ts`)
- 9.80 ✅ `loadDoc` replaces the editor's content and posts no `change` message for the replacement it just caused — `setContent` runs with `emitUpdate:false`, so a host pushing a doc never sees its own push echoed back as if it were something the user had typed. (`packages/editor/test/webview-bridge.test.ts`)
- 9.81 ✅ Typing in the bridged editor posts a `change` message per update carrying the serialized current doc — the onChange verb. (`packages/editor/test/webview-bridge.test.ts`)
- 9.82 ✅ `requestSubmit` answers with a `submit` message carrying the current doc — the onSubmit verb. (`packages/editor/test/webview-bridge.test.ts`)
- 9.83 ✅ `insertImage` inserts an image node carrying the given `attachmentId` — the insertImage(attachmentId) verb. (`packages/editor/test/webview-bridge.test.ts`)
- 9.84 ✅ Planted defect: `insertImage` with a non-image `mime` inserts nothing — layer 1's mime refusal (`insertTicketImage`, Task 3) holds unchanged when reached through the webview bridge rather than through the editor's own commands directly. (`packages/editor/test/webview-bridge.test.ts`)
- 9.85 ✅ `requestUpload` posts the verb, and a `resolveMentions` query round-trips: the posted `mentionQuery`'s own `requestId` is the one a `mentionResults` reply must carry to resolve that specific pending promise. NOTE: only one mention query is ever pending in this case, so it proves the round trip shape but not that two concurrent queries answered out of order resolve to the right caller. (`packages/editor/test/webview-bridge.test.ts`)
- 9.86 ✅ Hostile input fed to `handleHostMessage` (a garbled string, then an alien `kind`) never throws, and `dispose()` stops the change stream — typing after `dispose()` posts nothing further. NOTE: `dispose()` both sets an internal `disposed` flag and detaches the editor's update listener; this case is satisfied by the flag alone and does not by itself prove the listener detaches. (`packages/editor/test/webview-bridge.test.ts`)
- 9.87 ✅ `serializeEditorMessage` round-trips through `JSON.parse` stably — what goes in comes back out unchanged. (`packages/editor/test/webview-bridge.test.ts`)

## Escape suggestions (Task 5's coverage, deferred to this task)

- 9.88 ✅ Every reserved autoformat sequence — recounted, not inherited: 13 block triggers (headings 1–6, `-`/`*`/`+`, `1.`, `>`, ``` fence, `---`) and 6 mark triggers (`**`/`__`, `*`/`_`, `~~`, backtick), 19 total, table-driven with `it.each` (one shared body run 19 times, not 19 separate assertions) — each trigger applies its formatting AND surfaces the escape suggestion (a `[data-escape-chip]` in the DOM), and accepting via `undoInputRule` reverses the formatting and leaves the literal typed characters, with the chip and the suggestion both gone. (`packages/editor/test/escape-suggestion.test.ts`)
- 9.89 ✅ Backspace accepts through a real `keydown` (core's Backspace keymap routes it through `undoInputRule`) — proven with a genuine event rather than the `keyboardShortcut` test helper, whose own replay of a captured transaction is independently shown to mishandle a position-shifting multi-step transaction, isolated from this extension's own code. (`packages/editor/test/escape-suggestion.test.ts`)
- 9.90 ✅ Clicking the chip accepts: the formatting is gone from the rendered HTML and the typed markup stands as literal text in the document. (`packages/editor/test/escape-suggestion.test.ts`)
- 9.91 ✅ Escape dismisses: the suggestion and the chip both disappear and the formatting (a heading, here) stays applied — the opposite outcome from accepting. (`packages/editor/test/escape-suggestion.test.ts`)
- 9.92 ✅ Continuing to type dismisses the suggestion the same way Escape does, and the formatting stays. (`packages/editor/test/escape-suggestion.test.ts`)
- 9.93 ✅ Escape with no active suggestion is not consumed — `handleKeyDown` returns `false`, leaving the key free for whatever else wants it. (`packages/editor/test/escape-suggestion.test.ts`)
- 9.94 ✅ Three non-triggers stay literal with no suggestion offered at all: a markdown link `[text](url)`, a line containing pipe characters (`a | b | c` — proving pipes trigger nothing, not that this schema has a table input rule), and a bare URL (autolink off) — `it.each`, no `<a>` in the rendered HTML for any of them. (`packages/editor/test/escape-suggestion.test.ts`)

## Test infrastructure

- 9.95 ✅ The `typeText` test helper gets its own coverage because every editor test in this suite depends on it: it drives Tiptap's input rules the way a real keystroke does (unlike `insertContent`, which would leave typed markdown as literal text with no autoformat ever firing), and falls back to a plain character insertion when no input rule claims the character. A helper that silently stopped driving input rules would let every test that uses it assert against a document no real user could type while staying green. (`packages/editor/test/type-text.test.ts`)

## Attachment paste/drop (layer 2)

- 9.96 ✅ An image file dropped or pasted uploads, then emits `attachment.added`, THEN inserts the image node with wrap `block` — that exact order, so a claim never outruns its own event. (`packages/editor/test/attachment-paste.test.ts`)
- 9.97 ✅ An `attachment.added` handler that throws is a failure too: no node is inserted, the in-flight upload chip ends, and the failure is reported through `onError` rather than silently swallowed. (`packages/editor/test/attachment-paste.test.ts`)
- 9.98 ✅ Planted defect: a non-image file dropped or pasted NEVER becomes a node — it uploads and routes to the attachment list only, proving layer 2 of image-only embedding independent of layer 1's insert-command refusal. (`packages/editor/test/attachment-paste.test.ts`)
- 9.99 ✅ Failure cleanup: a refused upload reports through `onError`, ends its chip, and leaves the document untouched — no partial node, no orphaned chip. (`packages/editor/test/attachment-paste.test.ts`)
- 9.100 ✅ `captureFiles` short-circuits to the host's own file-capture path when one is supplied — nothing uploads inside the extension itself on that branch. (`packages/editor/test/attachment-paste.test.ts`)
- 9.101 ✅ A paste event carrying no files is left alone for other paste handlers (mentions, links, formatting) to process. (`packages/editor/test/attachment-paste.test.ts`)

## TicketEditor

- 9.102 ✅ `TicketEditor` mounts SSR-safe (`immediatelyRender: false`, so `ready` fires only post-hydration) and renders the `initialDoc` it was given. (`packages/editor/test/ticket-editor.test.tsx`)
- 9.103 ✅ `onDocChange` fires with the serialized current doc on every edit. (`packages/editor/test/ticket-editor.test.tsx`)
- 9.104 ✅ Mod-Enter submits the current doc. (`packages/editor/test/ticket-editor.test.tsx`)
- 9.105 ✅ Selecting an image surfaces the wrap menu, and choosing an option rewrites the selected image's `wrap` attribute. (`packages/editor/test/ticket-editor.test.tsx`)
- 9.106 ✅ Upload chips appear while an upload is in flight and clear once it resolves. (`packages/editor/test/ticket-editor.test.tsx`)

## Evidence picker — resolving the right transition, and picking

- 9.107 ✅ `transitionRequiresEvidence` reads the exact `(from, to)` transition's `require-evidence` rule when the workflow definition states one. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.108 ✅ A from-any (`*`) rule matches every origin state, and an unrecognised `(from, to)` pair answers `false` rather than throwing. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.109 ✅ A from-any transition DOES carry a `require-evidence` rule when the definition states one there — the wildcard path is live and exercised, not merely declined by every fixture that reaches it. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.110 ✅ An exact `(from, to)` rule wins over a from-any rule aimed at the same destination state — specificity order matches the rule engine's own resolution. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.111 ✅ `EvidencePicker` lists a ticket's existing (uploaded) attachments as offerable options, and picking one hands its id to the caller. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.112 ✅ Uploading fresh evidence emits `attachment.added` FIRST, then picks the freshly-uploaded id — a claim is never picked before it exists. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.113 ✅ A failed upload cancels nothing already picked and picks nothing new — the picker's prior state survives an upload failure untouched. (`packages/editor/test/evidence-picker.test.tsx`)
- 9.114 ✅ Cancel is an explicit act with its own handler, not a fallthrough of some other control. (`packages/editor/test/evidence-picker.test.tsx`)

## Attachment kinds (domain) — the rest of the file

Case 9.57 above cites this file for the `attachment.added` kind-discriminated-union refusal; that behaviour is actually proven in `packages/domain/test/ticket-events.test.ts` (already catalogued as case **5.26**), not here — corrected in place above rather than left standing. The cases below are what `attachment-kinds.test.ts` itself proves, distinct from 5.26 and from 9.58.

- 9.115 ✅ `DRIVE_FILE_SCOPE` is exactly `https://www.googleapis.com/auth/drive.file` — the one non-sensitive per-file scope, pinned by value. (`packages/domain/test/attachment-kinds.test.ts`)
- 9.116 ✅ `isDriveReference` accepts a complete reference, with `iconLink` optional (present or absent both pass). (`packages/domain/test/attachment-kinds.test.ts`)
- 9.117 ✅ Planted defect, eight sub-cases: `null`, a bare string, and six single-field corruptions (`driveFileId`, `capturedAt`, `webViewLink`, `iconLink`, `name`, `mimeType` each broken in turn — the last two added because deleting either conjunct from the guard had survived every earlier case) all fail `isDriveReference`. (`packages/domain/test/attachment-kinds.test.ts`)
- 9.118 ✅ The structural guard and the wire schema (`attachmentDriveReferencePayload`) describe one concept, checked field-for-field: the wire schema's key set equals the guard's fields plus `kind` and `attachmentId`, and a complete reference parses through the wire schema without throwing — a rename or a field removed from either side is caught (removal specifically requires the fixture be typed `Required<DriveReference>`, or a dropped field would silently vanish from `Object.keys` on both sides at once). (`packages/domain/test/attachment-kinds.test.ts`)

## Google Drive picker

- 9.119 ✅ `openDrivePicker` requests exactly the `drive.file` scope and nothing else, with incremental consent (`prompt: ''`) rather than a fresh full consent screen. (`packages/editor/test/google-picker.test.ts`)
- 9.120 ✅ Planted defect: the requested scope really is exactly one, non-sensitive, scope — proven against the configured value, not the library's documentation. (`packages/editor/test/google-picker.test.ts`)
- 9.121 ✅ The picker loads both Google scripts (GSI + Picker API), configures the `PickerBuilder` with the developer key and app id, and maps a picked file to a `DriveReference`. (`packages/editor/test/google-picker.test.ts`)
- 9.122 ✅ Cancelling the picker attaches nothing — no claim, no reference. (`packages/editor/test/google-picker.test.ts`)
- 9.123 ✅ Planted defect: a picked doc with no usable view link is dropped rather than have a URL invented for it. (`packages/editor/test/google-picker.test.ts`)
- 9.124 ✅ A failed load of the GSI script rejects and never opens the picker. (`packages/editor/test/google-picker.test.ts`)
- 9.125 ✅ A failed load of the Picker API script rejects — even after the OAuth token was already granted — and never opens the picker. (`packages/editor/test/google-picker.test.ts`)
- 9.126 ✅ `capturedAt` is the UTC serialization of the injected instant, per ECMA-262's guarantee that `toISOString` reads no local zone — checked fixed across `TZ=UTC` and `TZ=Pacific/Kiritimati` as a REGRESSION guard, explicitly not TZ-dependent evidence (the file's own comment corrects three earlier overclaims of this shape on this branch and states why a fixed-across-zones result cannot itself prove zone-independence). (`packages/editor/test/google-picker.test.ts`)
- 9.127 ✅ `composeUploadAttachmentAdded` composes an `attachment.added` upload claim from the server's own answer, hash included. (`packages/editor/test/google-picker.test.ts`)
- 9.128 ✅ `composeDriveReferenceAdded` composes an `attachment.added` drive-reference claim with a freshly-minted ULID for the attachment id. (`packages/editor/test/google-picker.test.ts`)
- 9.129 ✅ The composed upload claim parses against the door-facing wire schema (`attachmentUploadedPayload`), not merely the structural guard — proving the composer produces something the ingest door actually accepts. (`packages/editor/test/google-picker.test.ts`)
- 9.130 ✅ The composed drive-reference claim parses against the door-facing wire schema (`attachmentDriveReferencePayload`), not merely `isDriveReference`. (`packages/editor/test/google-picker.test.ts`)

## Attachment list item — Drive rule 2, external and last-seen

- 9.131 ✅ An upload renders as a file this board holds: `data-attachment-kind="upload"`, class `attachment-item--upload`, an `<a>` pointed at `/v1/attachments/:id`, filename on the surface. (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.132 ✅ Planted defect: a Drive reference renders as external and last-seen, never as a held file — distinct kind attribute and class, the link is the Drive `webViewLink` and never contains `/v1/attachments/`, and the surface carries the last-seen name, the words "last seen", the capture date, and "Google Drive". (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.133 ✅ Planted defect: an unreachable link reads as unknown, never absent and never fine — checked both unchecked and after a failed reachability check, and none of `deleted`/`missing`/`no longer`/`available`/`verified`/`up to date` appears in either state, which nonetheless read as two different sentences. (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.134 ✅ An upload carries no reachability language at all — the `.attachment-item__reachability` element does not exist for an upload, because the board holds the file. (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.135 ✅ The reachability sentence rendered is exactly what the exported `describeDriveReachability` returns, for both `not-checked` and `unreachable` — asserted against the function rather than a retyped copy, so the two cannot drift; the two states read as different sentences. (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.136 ✅ The capture day renders as the UTC day across four zones (`UTC`, `Asia/Kolkata`, `Pacific/Kiritimati`, `Pacific/Midway`), checked with two fixtures straddling a day boundary in OPPOSITE directions (already-tomorrow east of UTC; still-yesterday west of UTC) so a local-getter regression would redden in the zone that actually catches it, with an in-file positive control proving the `TZ` reassignment reached this worker's `Date` getters at all — the file's own comment records this as a REGRESSION guard (the shipped `toISOString().slice(0,10)` is guaranteed zone-invariant by ECMA-262, so no kill here is attributable to TZ variance in the current implementation), not live zone discrimination. (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.137 ✅ An unparseable `capturedAt` renders verbatim (`captured not-an-instant`) rather than inventing a day. (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.138 ✅ The stylesheet declares exactly the `attachment-item*` classes the component actually styles — set equality against an explicit list, distinct from the full BEM contract because two names (`attachment-item--upload`, `attachment-item__name`) are emitted but deliberately carry no rule. (`packages/editor/test/attachment-list-item.test.tsx`)
- 9.139 ✅ Planted defect: the two fixtures (upload, reference) between them emit exactly the seven contract classes, no more and no fewer — set equality in the emitting direction. (`packages/editor/test/attachment-list-item.test.tsx`)

## Drive rule 3 — never inline

- 9.140 ✅ Planted defect: picking a Drive PNG through the picker flow produces an `attachment.added` claim and inserts NO image node — a Drive pick is never a paste-and-embed. (`packages/editor/test/drive-never-inline.test.ts`)
- 9.141 ✅ Planted defect: a `DriveReference` is not assignable to `insertTicketImage` — refused by TYPE at compile time, and refused at RUNTIME too if the type is forced past. (`packages/editor/test/drive-never-inline.test.ts`)
- 9.142 ✅ Planted defect: pasting a Drive share link (no file on the clipboard, just its URL as text) uploads nothing and embeds nothing. (`packages/editor/test/drive-never-inline.test.ts`)
- 9.143 ✅ Planted defect: the drive module cannot embed because it never imports the command that embeds — a static-import scan of `packages/editor/src/drive/`, proven against a planted import of the insert command. (`packages/editor/test/drive-never-inline.test.ts`)

## Server — ObjectStore

- 9.144 ✅ `LocalDiskStore.put` → `getStream` round-trips the exact bytes. (`apps/server/test/attachments/local-disk-store.test.ts`)
- 9.145 ✅ `getStream` on a missing key throws `ObjectNotFoundError`. (`apps/server/test/attachments/local-disk-store.test.ts`)
- 9.146 ✅ `delete` removes the object; deleting an already-deleted key is a quiet no-op. (`apps/server/test/attachments/local-disk-store.test.ts`)
- 9.147 ✅ Planted defect: traversal (`..`) and malformed keys (absolute paths, empty segments) are refused before the disk is ever touched. (`apps/server/test/attachments/local-disk-store.test.ts`)
- 9.148 ✅ A failed write leaves no partial object behind — the torn-write-proof property. (`apps/server/test/attachments/local-disk-store.test.ts`)
- 9.149 ✅ `S3ObjectStore.put` uploads with bucket, key, content-type and length set. (`apps/server/test/attachments/s3-store.test.ts`)
- 9.150 ✅ `getStream` returns the body stream. (`apps/server/test/attachments/s3-store.test.ts`)
- 9.151 ✅ A `NoSuchKey` S3 answer becomes `ObjectNotFoundError`. (`apps/server/test/attachments/s3-store.test.ts`)
- 9.152 ✅ Other S3 failures propagate untranslated rather than being folded into `ObjectNotFoundError`. (`apps/server/test/attachments/s3-store.test.ts`)
- 9.153 ✅ `delete` sends `DeleteObject`. (`apps/server/test/attachments/s3-store.test.ts`)
- 9.154 ✅ Path-style addressing defaults to `true` when the config omits it (MinIO/R2-ready by default). (`apps/server/test/attachments/s3-store.test.ts`)
- 9.155 ✅ Planted defect: malformed keys are refused before any network call is made. (`apps/server/test/attachments/s3-store.test.ts`)
- 9.156 ✅ `createObjectStoreFromEnv` defaults to the local disk store when no `OBJECT_STORE` is configured. (`apps/server/test/attachments/store-config.test.ts`)
- 9.157 ✅ It builds the S3 store when fully configured. (`apps/server/test/attachments/store-config.test.ts`)
- 9.158 ✅ Path-style addressing defaults to `true` when `OBJECT_STORE_S3_FORCE_PATH_STYLE` is unset. (`apps/server/test/attachments/store-config.test.ts`)
- 9.159 ✅ An explicit `OBJECT_STORE_S3_FORCE_PATH_STYLE=false` is honoured. (`apps/server/test/attachments/store-config.test.ts`)
- 9.160 ✅ Planted defect: missing S3 environment variables are named, ALL of them, in one refusal — not one at a time across repeated restarts. (`apps/server/test/attachments/store-config.test.ts`)
- 9.161 ✅ Planted defect: an invented `OBJECT_STORE` value is refused by name. (`apps/server/test/attachments/store-config.test.ts`)
- 9.162 ✅ `readAtMost` returns the whole body when it fits under the limit. (`apps/server/test/attachments/read-limited.test.ts`)
- 9.163 ✅ A body of exactly `maxBytes` is accepted — the limit is inclusive. (`apps/server/test/attachments/read-limited.test.ts`)
- 9.164 ✅ One byte over the limit is refused. (`apps/server/test/attachments/read-limited.test.ts`)
- 9.165 ✅ Planted defect: the refusal happens DURING the stream, not after the whole body is buffered — an oversize upload cannot exhaust memory on the way to being refused. (`apps/server/test/attachments/read-limited.test.ts`)
- 9.166 ✅ The refusal states the limit in the units a person uses (MB), not raw bytes. (`apps/server/test/attachments/read-limited.test.ts`)
- 9.167 ✅ A sub-mebibyte ceiling changes units in its message rather than reporting a misleading "0 MB". (`apps/server/test/attachments/read-limited.test.ts`)

## Server — attachment metadata: repo, hash, filename, sniffing

- 9.168 ✅ The attachment repo's `insert` → `get` round-trips every column, with `size` read back as a number. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.169 ✅ `get` on an unknown id answers `null`. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.170 ✅ `listTicketAttachments` returns only that ticket's rows, in creation order. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.171 ✅ Planted defect: a duplicate `object_key` violates the table's unique constraint. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.172 ✅ Planted defect: a negative `size` violates the `CHECK (size >= 0)` constraint. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.173 ✅ A row inserted with no `sha256` reads back as `null` — unknown, never a substituted default. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.174 ✅ A real lowercase-hex `sha256` round-trips verbatim. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.175 ✅ Planted defect: a non-hex `sha256` violates the `attachments_sha256_hex` CHECK constraint. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.176 ✅ Planted defect: UPPERCASE hex violates the same CHECK — the regex is case-sensitive on purpose, so two spellings of the same hash can never both be stored as if they were different bytes. (`apps/server/test/attachments/attachment-repo.test.ts`)
- 9.177 ✅ `sha256Hex` matches the published SHA-256 test vectors. (`apps/server/test/attachments/content-hash.test.ts`)
- 9.178 ✅ Its output is lowercase hex, 64 characters. (`apps/server/test/attachments/content-hash.test.ts`)
- 9.179 ✅ Planted defect: one flipped byte produces a different hash — the hash is of content, not merely of length. (`apps/server/test/attachments/content-hash.test.ts`)
- 9.180 ✅ `sanitizeFilename` passes ordinary names through unchanged. (`apps/server/test/attachments/filename.test.ts`)
- 9.181 ✅ Planted defect: header-injection characters (CR/LF and similar) are stripped. (`apps/server/test/attachments/filename.test.ts`)
- 9.182 ✅ Planted defect: path separators are stripped. (`apps/server/test/attachments/filename.test.ts`)
- 9.183 ✅ Control characters, including NUL and DEL, are stripped. (`apps/server/test/attachments/filename.test.ts`)
- 9.184 ✅ Dots that are not separators are kept — a bare `..` alone traverses nothing. (`apps/server/test/attachments/filename.test.ts`)
- 9.185 ✅ An empty or undefined filename falls back to `"file"`; length is capped. (`apps/server/test/attachments/filename.test.ts`)
- 9.186 ✅ `sniffAllowedMime` identifies a PNG by its bytes alone. (`apps/server/test/attachments/sniff.test.ts`)
- 9.187 ✅ It identifies a PDF by its bytes alone. (`apps/server/test/attachments/sniff.test.ts`)
- 9.188 ✅ Planted defect: an executable is refused no matter what it claims to be named or typed as. (`apps/server/test/attachments/sniff.test.ts`)
- 9.189 ✅ Planted defect: unidentifiable bytes are refused, with the filename extension never consulted as a fallback. (`apps/server/test/attachments/sniff.test.ts`)
- 9.190 ✅ Every embeddable-image MIME (the domain's `EMBEDDABLE_IMAGE_MIME`) is a subset of the uploadable allow-list — the subset invariant between what can be embedded and what can be uploaded. (`apps/server/test/attachments/sniff.test.ts`)
- 9.191 ✅ The allow-list is closed: a real file of a type outside it is still refused, sniffing notwithstanding. (`apps/server/test/attachments/sniff.test.ts`)

## Server — upload and download routes

- 9.192 ✅ A member uploading a PNG gets `201` with the server-sniffed truth (mime, size, filename), and the bytes land in the store. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.193 ✅ Planted defect: a renamed `.exe` (image name, image content-type, MZ bytes) is refused `415` by its bytes, and nothing is stored. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.194 ✅ Planted defect: a lying client-supplied content-type cannot make a real PNG answer as anything but a PNG. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.195 ✅ Planted defect: unidentifiable bytes are refused `415`, and nothing is stored. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.196 ✅ Planted defect: an oversize upload is refused `413`, and nothing is stored. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.197 ✅ The shipped ceiling is exactly `26_214_400` bytes (25 × 1024 × 1024 = 25 MiB, recounted here rather than assumed), and a route built with no explicit `maxBytes` uses exactly that number — proven as a BOUNDARY PAIR (exactly at the ceiling accepted with the correct reported `size`; one byte over refused `413` naming "the 25 MB limit" in the shipped units), which is what pins the fallback to a single value from both sides rather than merely somewhere-above a smaller probe. The test's own comment records that an earlier version of this case used a probe size that left the fallback's true value unconstrained. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.198 ✅ Planted defect: a `ticketId` truncated by multipart's field-size cap is refused rather than acted on against the shortened value. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.199 ✅ Planted defect: too many multipart parts is refused `413` inside this route's own body handling, not merely relying on the parser's default. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.200 ✅ Planted defect: a guest without ticket visibility gets a `404` indistinguishable from a ticket that never existed. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.201 ✅ A member cannot upload to a ticket in a project they are not on. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.202 ✅ The visibility refusal happens BEFORE the uploaded file is even looked at. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.203 ✅ No session → `401`, with the route's one unauthenticated body. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.204 ✅ A missing `ticketId` field → `400`. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.205 ✅ A filename that could break a `Content-Disposition` header is stored sanitized. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.206 ✅ The `201` response body and the stored row carry the SAME SHA-256 of the stored bytes. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.207 ✅ Planted defect: two uploads differing by one byte get different hashes, and a lying content-type changes neither. (`apps/server/test/routes/attachments-upload.test.ts`)
- 9.208 ✅ A member streams the exact bytes with honest headers — the positive control the four refusal cases below are checked against. (`apps/server/test/routes/attachments-download.test.ts`)
- 9.209 ✅ Non-image attachments download as an attachment with the sanitized filename; images render inline. (`apps/server/test/routes/attachments-download.test.ts`)
- 9.210 ✅ A filename a stored row already holds unsanitized is still sanitized on the way out — proven as composition through the route, not merely the `sanitizeFilename` unit alone. (`apps/server/test/routes/attachments-download.test.ts`)
- 9.211 ✅ Case (a) vs (b): an unshared guest and a nonexistent id answer BYTE-IDENTICAL `404`s. (`apps/server/test/routes/attachments-download.test.ts`)
- 9.212 ✅ Case (c): metadata-without-bytes answers the SAME `404` as (a) and (b) — revealing nothing about which of the three actually happened. (`apps/server/test/routes/attachments-download.test.ts`)
- 9.213 ✅ No session → `401`. (`apps/server/test/routes/attachments-download.test.ts`)
- 9.240 ✅ The COMPOSITION ROOT registers the upload route: an upload through the app `buildApp` assembles — nothing registered by the test itself — answers `201` AND leaves a row in `attachments` for the named ticket. The row, not the status: a status-only assertion would also pass against a route wired over a store or a pool that wrote nowhere the test can read. (`apps/server/test/routes/attachments-wired.test.ts`)
- 9.241 ✅ Registering `@fastify/multipart` for the upload route does not change what any OTHER door says: on the SAME assembled app, a `multipart/form-data` POST to `/v1/events` from a signed-in caller still answers `415`. Measured, this is what root-registration breaks — it turns that `415` into a `400 FST_ERR_VALIDATION` with `request.body` undefined — and before this case no test in the repo sent a multipart body anywhere but the upload suite. (`apps/server/test/routes/attachments-wired.test.ts`)

## Server gates — image-embed and evidence, and the seam itself

- 9.214 ✅ Layer 3: a comment embedding the ticket's own PNG commits. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.215 ✅ A comment embedding a PDF is refused `attachment.embed-not-image` and leaves no ledger trace. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.216 ✅ A fabricated embed id is refused `attachment.embed-unknown` and leaves no trace. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.217 ✅ Another ticket's real image is refused with the SAME rule and reason shape as a fabricated id — no existence leak across tickets. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.218 ✅ A foreign image is refused even though it genuinely IS an image — the TICKET predicate refuses it, not the mime check, proving the two refusals are independently reachable. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.219 ✅ Every embedded image in a document is judged, not just the first one found. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.220 ✅ A `ticket.field_set` on the description field embedding a PDF is refused; other fields are not inspected by this gate at all. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.221 ✅ A document with no images passes through untouched. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.222 ✅ Planted defect: a document embedding a Drive image reference is refused — a reference has no bytes to embed, whatever mime it claims. (`apps/server/test/gates/image-embed-gate.test.ts`)
- 9.223 ✅ Evidence gate: a transition carrying real evidence from this ticket commits. (`apps/server/test/gates/evidence-gate.test.ts`)
- 9.224 ✅ A transition without evidence at all is not this gate's business — `require-evidence` itself is Plan 2's rule-engine rule, and this gate only judges evidence that IS named. (`apps/server/test/gates/evidence-gate.test.ts`)
- 9.225 ✅ Fabricated evidence is refused `attachment.evidence-unknown` and leaves no trace. (`apps/server/test/gates/evidence-gate.test.ts`)
- 9.226 ✅ Another ticket's real attachment as evidence is refused IDENTICALLY to fabricated evidence — no existence leak. (`apps/server/test/gates/evidence-gate.test.ts`)
- 9.227 ✅ Planted defect: a Drive reference on THIS ticket named as evidence is refused `attachment.evidence-drive-reference`, with the reason BYTE-IDENTICAL to `EVIDENCE_DRIVE_REFERENCE_REASON` and no id leaked into it. (`apps/server/test/gates/evidence-gate.test.ts`)
- 9.228 ✅ Planted defect: a Drive reference on ANOTHER ticket refuses as `attachment.evidence-unknown`, identically to a fabricated id — the Drive-specific refusal never leaks that a reference exists elsewhere. (`apps/server/test/gates/evidence-gate.test.ts`)
- 9.229 ✅ `buildServerGates()` covers exactly `comment.added`, `ticket.field_set` and `ticket.transitioned` — and nothing else. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.230 ✅ A gate reads and writes through the SAME transaction client as the rest of ingest: a refusal takes the gate's own writes back with it. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.231 ✅ POSITIVE CONTROL: the same gate write SURVIVES when the gate accepts — proving the rollback above is a rollback and not merely a no-op write. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.232 ✅ A gate refusal rolls back ONLY its own event and leaves its batch neighbours committed. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.233 ✅ No commit listener fires for a gate-refused event, and one fires for its committing neighbour in the same batch. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.234 ✅ The seam is inert when omitted: the same document commits through an ingest service built with no `gates` at all. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.235 ✅ The gate loop runs AFTER the rule engine: an engine refusal wins over a gate refusal on the same event. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.236 ✅ An event whose entity is not a ticket never reaches a gate at all — `parseEvent` refuses the entity kind first. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.237 ✅ CONTROL at the CLIENT door: a permitted member embedding the ticket's own PNG commits through `ingestClientBatch` — proving the refusal below is about embedding, not permission. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.238 ✅ The same permitted member embedding a PDF is refused `attachment.embed-not-image` at the CLIENT door too — gates apply unconditionally across both ingest doors, not only the internal one. (`apps/server/test/gates/gate-seam.test.ts`)
- 9.239 ✅ The gate loop runs AFTER the permission gate: a stranger (non-member) embedding a PDF is told a permission refusal, never which attachment this ticket actually holds — proven as the half "with teeth," since a gate hoisted above the permission check would leak that fact to someone who cannot see the ticket at all. (`apps/server/test/gates/gate-seam.test.ts`)

## Known gaps, re-measured at Task 16 rather than inherited

Every placeholder below was written before its owning task ran. All four owning tasks have since
landed; each entry is re-verdicted here against what actually shipped, not against what the placeholder
assumed it would find.

- 9.59 🟡 **The attachment upload pipeline end to end (client submit → server sniff → stored `mime`/`size` as the server's truth, per coordination amendment 15).** The SERVER half is thoroughly covered (cases 9.192–9.207: sniffing, hashing, the 25 MiB ceiling, sanitized filenames, visibility). The CLIENT half is not: `uploadAttachmentHttp` (`packages/editor/src/upload.ts`) — the one function that actually POSTs to `/v1/attachments` and is the thing `TicketEditorSlot` wires in by default — is exported and used but has **zero test coverage anywhere in this repo**, swept file-by-file across `packages/editor/test/` for both the function name and the module path (positive control: the sweep's own tooling found the ONE hit that does exist — `attachment-paste.test.ts` imports `UploadResult`, the TYPE, from `../src/upload.js`, but calls no function from that module; the five other files that cover neighbouring upload concerns — `evidence-picker.test.tsx`, `google-picker.test.ts`, `ticket-editor.test.tsx`, `ticket-editor-slot.test.tsx`, `webview-bridge.test.ts` — reference `upload.ts` not at all, each instead injecting a fake `uploadAttachment`/`emitAttachmentAdded` callback of its own). The SERVER-WIRING half of this case's earlier caveat is CLOSED: `registerAttachmentRoutes` is now registered at `apps/server/src/app.ts`'s composition root (Plan 11), pinned by `apps/server/test/routes/attachments-wired.test.ts`, so the route the client would call IS reachable on the server this repo boots. This case stays 🟡 for the CLIENT reason alone — `uploadAttachmentHttp`'s zero coverage — which that wiring does not touch. Owner: unassigned; recorded here rather than at any task, since no task in this plan claimed `upload.ts`'s own test file.
- 9.60 ✅ **The attachment list surface, including a Drive reference rendering as a link rather than an embed.** Landed by **Task 12b** (not Task 13, which this placeholder originally named — Task 13 is the evidence picker; the corrected attribution matches `Features.md:44`, corrected by this same task). See cases 9.131–9.139 (`AttachmentListItem`, Drive rule 2) and 3.76 (the app-core `AttachmentList` consuming the same union). Fully covered — no partiality left to record.
- 9.61 ❌ **The editor's React surface mounting the extension set inside the ticket sheet — still does not exist.** Verified fresh at Task 16, not inherited: `apps/web/package.json` names no dependency on `@gisik-nokma/editor`, and nothing under `apps/web/app` or `apps/web/src` references `TicketEditorSlot` or an `editorSlot` prop (`grep -rn "editorSlot\|TicketEditorSlot" apps/web/app apps/web/src` returns nothing). `Features.md`'s own `<EditorSlot>` bullet (§9) already states this. **Owner, corrected:** the placeholder named "Plan 6a Task 12," but ledger entry `06/12` (`ticket-sheet.tsx`, `editor-slot.tsx` — the slot BOUNDARY, not a mount of Plan 7's editor behind it) is already `done` and did not do this — it built the seam this gap still needs filled. No task in either plan's text claims the actual wiring (passing `TicketEditorSlot` as `apps/web`'s `editorSlot`); recorded here as unowned rather than left pointing at a task that already closed without doing it.
- 9.62 🟡 **Spec §2's escape-suggestion mechanic for text that should not become markup — split, and each half re-verdicted.** The TYPED-input half shipped in Task 5 and is now fully catalogued (9.88–9.94: all 19 reserved sequences, Backspace/click acceptance, Escape/continue-typing dismissal, non-triggers). The PASTE/DROP half is genuinely absent — `Features.md`'s own "Typed and pasted text still becomes markup" bullet (§9) documents it as **left as it is, deliberately and unruled**, a recorded product decision (seven paste rules across five extensions and eighteen input rules across ten sit behind `Editor` options `buildEditorExtensions` structurally cannot reach), not a task that failed to run. The placeholder's "Task 12 is the implementation site" is therefore stale: Task 12 landed and did not touch this, because there was never a decision directing it to. Owner: none — §2's own ruling on paste/drop autoformat, if one is ever made, is what would reopen this.
