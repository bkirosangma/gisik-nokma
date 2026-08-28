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
    // ACHIEVE THAT. Two earlier versions of this comment claimed otherwise —
    // the first by naming three paths, the second by naming four — so this one
    // describes the mechanism and deliberately does NOT count. Counting is what
    // kept recreating the defect: a total is a claim of completeness, and it was
    // false both times.
    //
    // Line references are to the installed 3.30.5 dists, verified there.
    //
    // WHAT IS CLOSED HERE, BY OPTION:
    //   - `autolink` (off) — a URL typed and then left.
    //   - `linkOnPaste` (off) — extension-link dist:502 registers the
    //     `handlePasteLink` plugin only when true. Its handler returns early on
    //     an empty selection, so it only ever covered pastes over a selection.
    //   - `markdownLinks` (off) — gates TWO mechanisms, not one:
    //     `addInputRules()` at dist:434-435, a TYPED `[text](url)` rule, and
    //     the shape of the paste rule below. With it false, typing markdown
    //     link syntax stays literal text.
    //
    // WHAT IS NOT CLOSED, AND CANNOT BE FROM THIS FUNCTION: the plain-URL paste
    // rule. `addPasteRules()` (dist:445-482) returns a `markPasteRule` over
    // `findPlainUrls` when `markdownLinks` is false — and when it is TRUE it
    // returns `markdownLinkPasteRule`, which merges `findPlainUrls` matches in
    // alongside the markdown ones (dist:225-237, and the library's own comment
    // there says "and links the plain URLs from findPlainUrls"). Both branches
    // link plain URLs. Verified empirically on this extension list: with
    // `markdownLinks` true and false alike, a pasted URL becomes a link and a
    // bare `gst.gov.in` becomes `http://gst.gov.in`.
    //
    // THAT IS THE LESSON WORTH CARRYING, and it is narrower than "an unaudited
    // default got in": AN OPTION THAT LOOKS LIKE IT SELECTS BETWEEN A SAFE AND
    // AN UNSAFE BRANCH MAY BE SELECTING BETWEEN TWO IMPLEMENTATIONS OF THE SAME
    // BEHAVIOUR. Flipping `markdownLinks` does not avoid this path; it only
    // changes which rule object implements it.
    //
    // TRIGGERS ARE NOT PASTE-ONLY. core dist:5119-5125 runs these rules from
    // `pasteRulesPlugin`'s `appendTransaction` on any of:
    //   - `uiEvent === 'paste'` AND not pasted from ProseMirror (dist:5121);
    //   - `uiEvent === 'drop'` AND not dropped from ProseMirror (dist:5122) —
    //     prosemirror-view dist:3902 dispatches it, so DRAGGING TEXT IN is a
    //     live route, confirmed here to produce the same links as pasting;
    //   - an `applyPasteRules` meta (dist:5123), Tiptap's simulated paste.
    //
    // Nothing live is left unnamed above. Everything not closed by option is
    // the same rule set under a different trigger, so one lever covers all of
    // it — `enablePasteRules`, an `Editor` option this function structurally
    // cannot reach. It is also not link-only: five configured extensions
    // register seven paste rules between them (`bold` 2, `italic` 2, `code` 1,
    // `strike` 1, `link` 1), so `**due soon**` arrives bold, `*soon*` italic,
    // `` `npm run gst` `` code and `~~gone~~` strike.
    //
    // NOT DECIDED HERE, DELIBERATELY. How §2 should be honoured across five
    // extensions is a product judgement, and TASK 5 — the escape-suggestion
    // mechanic — owns it; the plan created that task for this requirement.
    // Tests in test/schema.test.ts record the current behaviour truthfully, so
    // Task 5's change is what makes them fail.
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
