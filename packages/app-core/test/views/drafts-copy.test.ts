import { describe, expect, it } from 'vitest';
import * as copy from '../../src/views/drafts-copy.js';

/** Case 28.150. */
describe('28.150 the draft copy', () => {
  it('28.150 equals the plan header character for character, and has no spaced em dash', () => {
    expect(copy.DRAFT_SAVE_LABEL).toBe('Save as draft');
    expect(copy.DRAFT_SAVED_TOAST).toBe('Draft saved');
    expect(copy.DRAFT_SAVED_OPEN).toBe('Open');
    expect(copy.DRAFTS_NAV_LABEL).toBe('Drafts');
    expect(copy.DRAFTS_EMPTY).toBe('No drafts. A draft is a ticket only you can see, until you publish it.');
    expect(copy.DRAFT_PUBLISH_LABEL).toBe('Publish');
    expect(copy.DRAFT_DISCARD_LABEL).toBe('Discard');
    expect(copy.DRAFT_PILL_LABEL).toBe('Draft');
    expect(copy.DRAFT_BANNER).toBe('Only you can see this draft.');
    expect(copy.DRAFT_DISABLED_REASON).toBe('Available after you publish');
    // Planner ruling 2026-10-04, follow-up: R17's disclosure; the spec gives no words, these are the planner's.
    expect(copy.DRAFT_VISIBILITY_DISCLOSURE).toBe('Only you can see this draft until you publish it.');
    expect(copy.DISCARD_QUESTION).toBe("Discard this draft? It is erased and can't be recovered.");
    expect(copy.DISCARD_CONFIRM_LABEL).toBe('Discard draft');
    expect(copy.DISCARD_NOTES_LINE).toBe('Linked notes are kept and unlinked.');
    expect(copy.DRAFT_NO_OUTSIDERS).toBe('Publish the ticket before inviting someone from outside');
    expect(copy.DRAFT_PENDING_LABEL).toBe('Waiting to sync');
    expect(copy.DRAFT_UNREACHED).toBe('Could not publish this draft. Check your connection and try again.');
    expect(copy.DISCARD_ATTACHMENTS_UNKNOWN).toBe('Attachments uploaded to this draft, if any, will be permanently deleted');
    expect(copy.DRAFT_COUNTS_UNREADABLE).toBe("Could not read this draft's sub-drafts. Try again.");
    // AMEND-drafts-t8-pending-children (case 28.197): the note on a pending child's row.
    expect(copy.DRAFT_PENDING_CHILD_NOTE).toBe('Joins when published');
    expect(copy.subDraftsLine(1)).toBe('1 sub-draft will be erased too');
    expect(copy.subDraftsLine(2)).toBe('2 sub-drafts will be erased too');
    expect(copy.attachmentsLine(1)).toBe('1 attachment uploaded to this draft will be permanently deleted');
    expect(copy.attachmentsLine(3)).toBe('3 attachments uploaded to this draft will be permanently deleted');
    expect(copy.draftParentLabel('Launch')).toBe('under Launch');
    expect(copy.draftsNavName(0)).toBe('Drafts');
    expect(copy.draftsNavName(1)).toBe('Drafts, 1 draft');
    expect(copy.draftsNavName(3)).toBe('Drafts, 3 drafts');
    const every = [
      ...Object.values(copy).filter((v: unknown): v is string => typeof v === 'string'),
      copy.subDraftsLine(2), copy.attachmentsLine(2), copy.draftParentLabel('x'), copy.draftsNavName(2),
    ];
    // 20 constants + 4 built sentences: the loop below is never empty, and a constant added without a row here
    // changes the count.
    expect(every).toHaveLength(24);
    for (const text of every) expect(text).not.toMatch(/\s—\s/);
  });
});
