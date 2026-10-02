/** The product-specific Markdown forms (spec §3). One place, so parse, scan and the help text cannot disagree. */
export type RefResolver = {
  user(userId: string): { userId: string; label: string } | null;
  ticket(key: string): { ticketId: string; projectId: string; key: string; title: string } | null;
  note(ref: string): { noteId: string; title: string } | null;
};
export type MarkdownRefs = { userIds: string[]; ticketKeys: string[]; noteRefs: string[] };

/** `<workspace prefix 1-3><project prefix 1-3>-<n>` (`packages/domain/src/prefix.ts:293-295`). Uppercase only. */
export const TICKET_KEY_PATTERN = /^[A-Z]{2,6}-[1-9][0-9]*$/;
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** `@[Name](user:<id>)` and `[[…]]`, matched inside ONE unescaped text token (see parse.ts for why). */
export const INLINE_REF = /@\[([^\]\n]+)\]\(user:([^)\s]*)\)|\[\[([^\[\]\n]+)\]\]/g;

export const MARKDOWN_SYNTAX_HELP =
  'Write Markdown: # headings, - and 1. lists, - [ ] / - [x] task lists, **bold**, *italic*, ~~strike~~, `code`, ' +
  '``` fenced code ```, > quotes, | tables |, and [links](https://…). Mention a person as @[Their Name](user:<userId>) ' +
  '(find userIds with list_members; a plain @Name is only text and notifies nobody). Link a ticket as [[KEY-12]] and a ' +
  'note as [[note:<note title or id>]]; anything else inside [[ ]] stays plain text. An image is ' +
  '![alt](attachment:<attachmentId>) alone on its own line (upload it with add_attachment first). A collapsible ' +
  'section is <details> on its own line, then <summary>Title</summary>, the content, and </details>. A person, ' +
  'ticket or note that cannot be found is refused, naming it; nothing is silently turned into plain text.';
