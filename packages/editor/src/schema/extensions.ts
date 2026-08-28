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
 * RECONFIGURED (autolink off), so leaving either on would register the
 * same node or mark twice. `underline` is neither — it is simply not part
 * of this product's vocabulary, and StarterKit v3.30.5 bundles it. A
 * document is stored and re-rendered on three clients; a mark that only
 * one of them knows how to produce is drift waiting to happen.
 */
export function buildEditorExtensions(options: EditorSchemaOptions = {}): Extensions {
  return [
    StarterKit.configure({
      // Replaced by VersionedDocument so the doc node carries schemaVersion.
      document: false,
      // Configured separately below: no autolink (typed URLs stay literal
      // text — nothing silently becomes markup), no open-on-click while editing.
      link: false,
      // Outside document schema v1's closed mark vocabulary.
      underline: false,
    }),
    VersionedDocument,
    Link.configure({ openOnClick: false, autolink: false }),
    Placeholder.configure({ placeholder: options.placeholder ?? 'Write…' }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
