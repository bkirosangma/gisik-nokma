/**
 * Drafts plan, Task 8. Every string the app shows for a draft, in one place. The first block is the plan header's
 * (spec §12), verbatim; the second is the four sentences the plan added (decision 7) and the AMEND's note (case
 * 28.197). No string has a spaced em dash.
 */
export const DRAFT_SAVE_LABEL = 'Save as draft';
export const DRAFT_SAVED_TOAST = 'Draft saved';
export const DRAFT_SAVED_OPEN = 'Open';
export const DRAFTS_NAV_LABEL = 'Drafts';
export const DRAFTS_EMPTY = 'No drafts. A draft is a ticket only you can see, until you publish it.';
export const DRAFT_PUBLISH_LABEL = 'Publish';
export const DRAFT_DISCARD_LABEL = 'Discard';
export const DRAFT_PILL_LABEL = 'Draft';
export const DRAFT_BANNER = 'Only you can see this draft.';
export const DRAFT_DISABLED_REASON = 'Available after you publish';
// R17's disclosure (spec `2026-10-03-drafts-design.md:182` asks for it but gives no words; these are the planner's,
// planner ruling 2026-10-04, follow-up). The sheet shows it on a draft in place of the visibility editor, which is not
// rendered there (R7 refuses `visibility.set` on a draft). It is ONE string in one `<p>`, so `getByText(DRAFT_BANNER)`
// (exact match) still finds only the banner.
export const DRAFT_VISIBILITY_DISCLOSURE = 'Only you can see this draft until you publish it.';
export const DISCARD_QUESTION = "Discard this draft? It is erased and can't be recovered.";
export const DISCARD_CONFIRM_LABEL = 'Discard draft';
export const DISCARD_NOTES_LINE = 'Linked notes are kept and unlinked.';
export const DRAFT_NO_OUTSIDERS = 'Publish the ticket before inviting someone from outside';

export const DRAFT_PENDING_LABEL = 'Waiting to sync';
export const DRAFT_UNREACHED = 'Could not publish this draft. Check your connection and try again.';
export const DISCARD_ATTACHMENTS_UNKNOWN = 'Attachments uploaded to this draft, if any, will be permanently deleted';
export const DRAFT_COUNTS_UNREADABLE = "Could not read this draft's sub-drafts. Try again.";
// AMEND-drafts-t8-pending-children (case 28.197): a published ticket the draft holds as a pending child is listed
// among the draft's sub-items with this note; it becomes an ordinary child when the draft is published.
export const DRAFT_PENDING_CHILD_NOTE = 'Joins when published';

export const subDraftsLine = (n: number): string => `${n} sub-draft${n === 1 ? '' : 's'} will be erased too`;
export const attachmentsLine = (n: number): string =>
  `${n} attachment${n === 1 ? '' : 's'} uploaded to this draft will be permanently deleted`;
export const draftParentLabel = (parentTitle: string): string => `under ${parentTitle}`;
export const draftsNavName = (count: number): string =>
  count === 0 ? DRAFTS_NAV_LABEL : `${DRAFTS_NAV_LABEL}, ${count} draft${count === 1 ? '' : 's'}`;
