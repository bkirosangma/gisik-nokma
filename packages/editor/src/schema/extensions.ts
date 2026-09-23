import type { Extensions } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from '@tiptap/extension-details';
import { VersionedDocument } from './versioned-document.js';
import { CodeBlockWithCopy } from '../extensions/code-block-copy.js';
import { Collapsible } from '../extensions/collapsible.js';
import { TicketImage } from '../extensions/ticket-image.js';
import { Mention, type MentionCandidate } from '../extensions/mention.js';
import { WikiLink, type NoteLinkCandidate } from '../extensions/wiki-link.js';
import { EscapeSuggestion } from '../extensions/escape-suggestion.js';

export type EditorSchemaOptions = {
  /**
   * Mention picker data source (Task 4). Absent → mentions render but the
   * picker offers nobody. `MentionCandidate` has ONE origin and it is
   * `../extensions/mention.js`, which is also where the rule that turns a
   * candidate into a stored label lives; this file names the type and does not
   * re-export it, so the barrel exports it exactly once.
   */
  queryUsers?: (query: string) => Promise<MentionCandidate[]>;
  /** Maps an image node's attachmentId to a URL (Task 3). Defaults to the server route. */
  resolveAttachmentUrl?: (attachmentId: string) => string;
  placeholder?: string;
  /**
   * When true, toggling a collapsible changes the view only — a reader must
   * not write the document (spec §8.4). The Details extension saves the `open`
   * state in the document only when `persist` is on, so this option is what
   * makes the reader's toggle a view-local affordance rather than an edit.
   */
  readOnly?: boolean;
  /**
   * Wiki-link data source (Plan 4 Task 5). All four are optional and the
   * defaults are deliberate: no picker, no rename-following, no hover card, and
   * a link that does not navigate — a document with wiki-links still RENDERS
   * and still round-trips on a host that supplies none of them, which is what
   * keeps this widening additive for every existing mount.
   */
  queryNotes?: (query: string) => Promise<NoteLinkCandidate[]>;
  resolveNoteTitle?: (noteId: string) => string | null;
  previewNote?: (noteId: string) => Promise<string | null>;
  onNavigateNote?: (noteId: string) => void;
};

/**
 * The ONE origin of document schema v1. Every editor surface — web,
 * desktop, the RN webview bundle, and every test — builds its extension
 * list here, so there is exactly one schema and it cannot drift between
 * clients (spec §2: one document schema across all three clients).
 *
 * Everything StarterKit contributes to the schema that schema v1 does not
 * name is switched off by an explicit `false`, not left to StarterKit's
 * defaults. The disables are load-bearing in two different ways and both
 * matter: `document` is REPLACED (VersionedDocument below), and `link` is
 * RECONFIGURED (see the Link call), so leaving either on would register the
 * same node or mark twice. `underline` is neither — it is simply not part
 * of this product's vocabulary, and StarterKit v3.30.5 bundles it. A
 * document is stored and re-rendered on three clients; a mark that only
 * one of them knows how to produce is drift waiting to happen.
 *
 * TWO KINDS OF DEFAULT CAN GET IN HERE, and the second kind is quieter.
 * The set of node and mark TYPES is pinned by a set-equality test, so an
 * extra vocabulary item cannot arrive unnoticed. The BEHAVIOURAL options of
 * the extensions that survive are pinned by nothing structural — they alter
 * what the editor does to a document without altering what a document may
 * contain. Every option below was chosen against the resolved option set of
 * the built extension list, not against the library's documentation.
 */
export function buildEditorExtensions(options: EditorSchemaOptions = {}): Extensions {
  return [
    StarterKit.configure({
      // Replaced by VersionedDocument so the doc node carries schemaVersion.
      document: false,
      // Configured separately below.
      link: false,
      // Outside document schema v1's closed mark vocabulary.
      underline: false,
      // REPLACED, not removed: `CodeBlockWithCopy` below extends the same node
      // and keeps its name, so leaving StarterKit's on would register two
      // `codeBlock` extensions and the schema would take one of them by
      // accident. The rule census is the check — `codeBlock: 2` is unchanged,
      // which is what says the replacement kept both input rules.
      codeBlock: false,
    }),
    VersionedDocument,
    // SPEC §2 SAYS "NOTHING SILENTLY BECOMES MARKUP". THE OPTIONS BELOW DO
    // NOT ACHIEVE THAT. Earlier versions of this comment tried to prove how
    // far short they fall by enumerating every live path to markup, and each
    // carried a completeness claim — first as a count, then as prose — and
    // each was false. This version enumerates only what was counted and
    // verified, with the dist lines to check it by; the full analysis lives
    // in .superpowers/sdd/2026-08-20-07-editor-attachments/task-1-report.md.
    //
    // What the options do, in the installed extension-link@3.30.5:
    //   - `autolink: false` — the autolink plugin is not registered
    //     (dist:486).
    //   - `linkOnPaste: false` — the pasteHandler plugin is not registered
    //     (dist:502).
    //   - `markdownLinks: TRUE SINCE 2026-09-21` — the typed `[text](url)`
    //     input rule IS registered (dist:434-435). It sat at `false` until the
    //     owner's ruling ("both") reversed it, and the §2 citation that held it
    //     there was doing less work than it looked: **NO value of this option
    //     stops a pasted plain URL from becoming a link** — both branches of
    //     `addPasteRules` link plain URLs (dist:474 directly; dist:465 via
    //     `markdownLinkPasteRule`, which merges `findPlainUrls` matches in,
    //     dist:225-234), and even inside pasted `[text](url)` the URL half gets
    //     linked. **So the property §2 names did not hold here BEFORE the
    //     reversal, and the reversal does not break it** — which is why this is
    //     recorded as a widening rather than a waiver. `test/schema.test.ts`
    //     measures the paste half at either value rather than trusting this
    //     paragraph, and pins the typed half (9.95) on the typing path, since a
    //     paste-path case stays green with the option OFF and would prove
    //     nothing about it.
    //     ⚠ IT WIDENS THE RULE CENSUS BY EXACTLY ONE, AND IT WIDENS THE ESCAPE
    //     MECHANIC BY EXACTLY ONE TOO. An earlier version of this comment said
    //     the opposite — that a typed link "offers no escape suggestion where
    //     `**due soon**` does", an asymmetry whose cause it left unestablished
    //     and whose owner it named. **That sentence is FALSE, and E2-46 is the
    //     correction.** `test/escape-suggestion.test.ts` (9.96) measures both
    //     triggers under both conditions: typing `see [the doc](https://gst.gov.in)`
    //     offers `Keep "see [the doc](https://gst.gov.in)" as text` exactly as
    //     typing `x **b**` offers its own. What the recorded probes were
    //     actually comparing was TEXT AFTER THE TRIGGER — the link probe typed
    //     `… now` and the bold probe typed nothing — and continuing to type
    //     dismisses the suggestion by design (`escape-suggestion.ts`'s `apply`,
    //     "dismiss by continuing to type or clicking elsewhere"; case 9.92).
    //     So the link chip was dismissed, not absent, and the bold chip was
    //     live. The typed link is now a row in that file's trigger table, so
    //     the coverage is WITNESSED rather than declared, and the 2x2 in 9.96
    //     is the control that distinguishes the trigger from the probe's
    //     conditions.
    //
    // Still live, counted on the extension list this function builds, at
    // tiptap 3.30.5: SEVEN PASTE RULES across five extensions (`bold` 2,
    // `italic` 2, `code` 1, `strike` 1, `link` 1), firing on external paste,
    // external drop, or an `applyPasteRules` meta (the guard at core
    // dist:5121-5125); and TWENTY-ONE INPUT RULES across thirteen extensions
    // (`heading` 6, `bold` 2, `italic` 2, `codeBlock` 2, `blockquote` 1,
    // `bulletList` 1, `code` 1, `orderedList` 1, `strike` 1,
    // `horizontalRule` 1, `link` 1, `taskItem` 1, `collapsible` 1), firing
    // from `handleTextInput` as text is typed (core dist:4834). **The counts were 18
    // and ten until 2026-09-21, and `link` is the one that moved** — with the
    // option reversed it contributes to BOTH censuses, so
    // `test/rule-census.test.ts`'s `pasted \ typed` set is now empty where it
    // had always been `['link']`. **`taskItem` is the second move and it is
    // ADDITIVE, 2026-09-23 (Plan 4 Task 1): the notes editor port gave the
    // document a task list, and its `[ ] ` / `[x] ` rule lands on `taskItem`,
    // not on `taskList` — so the input total went 19 → 20 and the paste total
    // did not move at all.** That asymmetry is the reason this paragraph names
    // the extension each rule belongs to rather than only the totals.
    // **`collapsible` is the third move, 2026-09-23 (Plan 4 Task 3), and it is
    // additive in the same way: 20 → 21 input rules, paste unchanged. It is the
    // only rule the collapsible block contributes — the Enter and Backspace
    // shortcuts that ship beside it live in `addKeyboardShortcuts`, which
    // neither census reads, so a reader expecting the block to cost two lines
    // here finds one.**
    // Every number and every membership here is asserted per-extension by that
    // file, so a future upgrade that moves one fails there naming the extension
    // rather than reconciling two totals. So `**due soon**` arrives bold whether pasted,
    // dropped, or typed — through two different plugins, all three verified
    // on this list. The two censused sets are disjoint and sit behind two
    // separate `Editor` options, both defaulting true: `enablePasteRules`
    // (gate at core dist:5233) and `enableInputRules` (gate at dist:5221;
    // defaults at dist:6147-6148). Disabling either was verified to leave
    // the other set firing. This function returns `Extensions` and never
    // constructs an `Editor`, so it can reach neither option.
    //
    // NOT DECIDED HERE, DELIBERATELY — AND HALF OF IT NO LONGER NEEDS DECIDING.
    // How §2 should be honoured across these extensions and both levers is a
    // product judgement. TASK 5 — the escape-suggestion mechanic — owns the
    // general question and closes it for the TYPED path by offering an escape;
    // the LINK half was put to the owner on 2026-09-20 and answered ("both"),
    // which is the reversal above. **The reversal left NOTHING open here**, and
    // an earlier version of this paragraph said it left an asymmetry open — a
    // typed link firing an input rule but offering no escape where a typed bold
    // mark does. E2-46 measured that claim and it is false; see the paragraph
    // above, and `test/escape-suggestion.test.ts` (9.96) for the 2x2. Tests in
    // `test/schema.test.ts` record the reversal's behaviour truthfully, which is
    // why it failed them and why they were FLIPPED rather than deleted.
    //
    // `openOnClick: false` keeps a click editing the link, not following it.
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      markdownLinks: true,
    }),
    Placeholder.configure({ placeholder: options.placeholder ?? 'Write…' }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    // Schema v2's blocks, added by the notes editor port (Plan 4 Task 1).
    // `nested: true` is TaskItem's only option and it is ON deliberately: a
    // sub-task is a task item inside a task item, which is what a person
    // writing a checklist expects from Tab.
    TaskList,
    TaskItem.configure({ nested: true }),
    // `persist: !readOnly` is the whole of spec §8.4's reader rule, expressed
    // as configuration rather than as a branch in a click handler: an editor
    // saves the folded state with the document because toggling IS an edit
    // (D10), and a reader's toggle never reaches the document at all.
    Details.configure({
      persist: options.readOnly !== true,
      HTMLAttributes: { class: 'editor-details' },
    }),
    DetailsSummary,
    DetailsContent,
    // The code block, with its Copy button. Placed where StarterKit's own
    // `codeBlock` would have been (the disable above), so the extension LIST
    // order — and therefore the census and the schema — is unchanged.
    CodeBlockWithCopy,
    // The `< ` rule and the Enter/Backspace keymap the Details extension does
    // not ship. It registers NO node of its own — it is an `Extension`, not a
    // `Node` — so it adds one line to the input-rule census and nothing to the
    // schema vocabulary.
    Collapsible,
    // The image node of schema v1 (spec §2: only images embed inline). The
    // default attachment route is stated ONCE, in TicketImage's `addOptions`,
    // and is not restated here: `configure` merges with `mergeDeep` (core
    // dist:4654-4661), which copies every key of its source with
    // `Object.keys(...).forEach` — so an explicitly-passed `undefined` REPLACES
    // the default rather than falling back to it, and `exactOptionalPropertyTypes`
    // is off, so `{ resolveAttachmentUrl: props.maybeUndefined }` type-checks
    // its way into that. Hence the conditional: the option travels only when
    // the caller actually has one. A test drives both shapes.
    TicketImage.configure(
      options.resolveAttachmentUrl ? { resolveAttachmentUrl: options.resolveAttachmentUrl } : {},
    ),
    // The mention node of schema v1. `queryUsers` is spelled with `??` rather
    // than passed conditionally the way TicketImage's option is, and the
    // difference is not an inconsistency: TicketImage's default lives in its
    // own `addOptions` and `mergeDeep` would let an explicit `undefined`
    // REPLACE it (core dist:4654-4661), so that option must travel only when
    // the caller has one. Here the fallback is a value, not a default being
    // protected, so stating it at the call site is the shorter honest form —
    // and `Mention.addOptions` still carries its own, for a host that
    // configures the extension directly.
    Mention.configure({ queryUsers: options.queryUsers ?? (async () => []) }),
    // The wiki-link node of schema v2 (Plan 4 Task 5). `queryNotes` is spelled
    // with `??` like the mention's, for the same reason: the fallback is a
    // VALUE, not a default being protected from an explicit `undefined` (which
    // is TicketImage's case above). The other three travel CONDITIONALLY — an
    // explicitly-passed `undefined` would REPLACE the extension's own fallback
    // under `mergeDeep`, and `resolveNoteTitle: undefined` is precisely the
    // "no resolver" answer the node view reads as "show the stored title".
    WikiLink.configure({
      queryNotes: options.queryNotes ?? (async () => []),
      ...(options.resolveNoteTitle === undefined
        ? {}
        : { resolveNoteTitle: options.resolveNoteTitle }),
      ...(options.previewNote === undefined ? {} : { previewNote: options.previewNote }),
      ...(options.onNavigateNote === undefined
        ? {}
        : { onNavigateNote: options.onNavigateNote }),
    }),
    // HEADING LEVELS ARE NOT VALIDATED HERE. Heading resolves to
    // `levels: [1,2,3,4,5,6]`, which governs which levels the toolbar and
    // input rules OFFER — it is not a constraint on stored documents, and it
    // is not a `validate`. An earlier version of this comment said ProseMirror
    // "validates attribute NAMES, not their values"; that is FALSE in the
    // installed stack and was disproven by construction. An attribute spec may
    // carry a `validate`, `checkAttrs` runs it (prosemirror-model@1.25.11
    // dist:2058-2066) on every `Node.fromJSON` (dist:1542), and Tiptap
    // forwards it from an extension attribute into the spec (@tiptap/core
    // @3.30.5 dist:1491). Heading declares none, which is the actual reason a
    // doc claiming `{ type: 'heading', attrs: { level: 99 } }` round-trips
    // with the 99 intact even under `errorOnInvalidContent: true`.
    // Adding one is not free, and the cost is not the obvious one. `validate`
    // throws at load — but `enableContentCheck` defaults FALSE (core
    // dist:6150) and is set nowhere in this repo, so the throw is CAUGHT
    // (dist:592-602): the editor warns once and swaps in an empty document.
    // A single stored level-99 heading would silently take every surrounding
    // paragraph with it. That consequence was BUILT, not inferred from the
    // throw — for the image node's `wrap`, same mechanism, and the
    // observation is written out in extensions/ticket-image.ts. The server
    // door stays the cheaper place to enforce a range.
    // A test pins the positive half: 1–6 survive a round trip, so a change
    // that clamps or drops them fails.
    // Task 5: the escape-suggestion mechanic (spec §2's named requirement).
    // Every surface gets it; see extensions/escape-suggestion.ts for the
    // mechanism and for why "Task 5's change is what makes them fail" above
    // does not extend to the two paste-rule tests in test/schema.test.ts —
    // this extension owns the typed (input-rule) trigger table only.
    EscapeSuggestion,
  ];
}
