import type { Extensions } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { VersionedDocument } from './versioned-document.js';

export type MentionCandidate = { userId: string; name: string };

export type EditorSchemaOptions = {
  /** Mention picker data source (Task 4). Absent → mentions render but the picker offers nobody. */
  queryUsers?: (query: string) => Promise<MentionCandidate[]>;
  /** Maps an image node's attachmentId to a URL (Task 3). Defaults to the server route. */
  resolveAttachmentUrl?: (attachmentId: string) => string;
  placeholder?: string;
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
    }),
    VersionedDocument,
    // SPEC §2 SAYS "NOTHING SILENTLY BECOMES MARKUP". THESE OPTIONS DO NOT
    // ACHIEVE THAT, AND THIS COMMENT USED TO CLAIM THEY DID. There are FOUR
    // paths from text to link markup. Three are closed here by option:
    //   - `autolink` — a URL typed and then left. Off.
    //   - `linkOnPaste` — a URL pasted over a selection. Off. The library
    //     defaults it TRUE and the plan's config omits it, so a URL pasted
    //     over selected text became link markup. Deviation from the plan's
    //     verbatim config, ruled by the controller in review round 1.
    //   - `markdownLinks` — pasted `[text](url)` syntax. Already false by
    //     default; stated so the path is visibly checked, not accidentally
    //     correct.
    //
    // THE FOURTH IS NOT AN OPTION AND IS STILL LIVE. `Link.addPasteRules()`
    // returns a plain-URL `markPasteRule` UNCONDITIONALLY whenever
    // `markdownLinks` is false (extension-link@3.30.5 dist:445-482), core
    // registers it, and it fires from `pasteRulesPlugin`'s `appendTransaction`
    // gated only on `transaction.getMeta('uiEvent') === 'paste'` — which
    // prosemirror-view's `doPaste` sets AFTER `handlePaste` declines. None of
    // the three options above gates it. Setting `markdownLinks: false` in fact
    // routes INTO this branch rather than away from it.
    //
    // So today a pasted URL becomes a link at a bare cursor as well as over a
    // selection — broader than the round-1 defect, which at least returned
    // early on an empty selection — and a bare `gst.gov.in` becomes
    // `http://gst.gov.in`. It is not link-only: five configured extensions
    // register seven paste rules between them (`bold` 2, `italic` 2, `code` 1,
    // `strike` 1, `link` 1), so `**due soon**` pastes as bold, `*soon*` as
    // italic, `` `npm run gst` `` as code and `~~gone~~` as strike.
    //
    // NOT DECIDED HERE, DELIBERATELY. Switching paste rules off is
    // `enablePasteRules`, an `Editor` option this function structurally cannot
    // reach, it spans five extensions, and it is a product judgement about how
    // §2 should be honoured. TASK 5 — the escape-suggestion mechanic — owns
    // that decision; the plan created it for this requirement. A test in
    // test/schema.test.ts records the current behaviour truthfully so that
    // Task 5's change is what makes it fail.
    //
    // `openOnClick: false` keeps a click editing the link, not following it.
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      markdownLinks: false,
    }),
    Placeholder.configure({ placeholder: options.placeholder ?? 'Write…' }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    // HEADING LEVELS ARE NOT VALIDATED, AND CANNOT BE HERE. Heading resolves
    // to `levels: [1,2,3,4,5,6]`, which governs which levels the toolbar and
    // input rules OFFER — it is not a constraint on stored documents.
    // ProseMirror validates attribute NAMES, not their values, so a doc
    // claiming `{ type: 'heading', attrs: { level: 99 } }` round-trips with
    // the 99 intact even under `errorOnInvalidContent: true`. If levels ever
    // need enforcing, the door is the place (a server-side payload check),
    // not the schema. A test pins the positive half: 1–6 survive a round
    // trip, so a change that clamps or drops them fails.
  ];
}
