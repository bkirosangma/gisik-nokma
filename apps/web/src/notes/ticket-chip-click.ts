import type { MouseEvent as ReactMouseEvent } from 'react';

/**
 * The Notes page's ONE interception of a ticket chip's click (owner,
 * 2026-09-29: "opening a ticket from note should only open the sheet there in
 * the note section itself. not navigate to the project screen").
 *
 * The byline badge already opens the sheet in place (18.321, `NoteBadge`'s own
 * `onOpen`); a ticket chip in the note's BODY (the editor's `a.editor-ticketref`
 * node view), in a note COMMENT (`a.gn-comment__ticketref`, drawn by the shared
 * `renderCommentBody`) and in the mounted sheet's own description/comments still
 * followed their project-page `href`. All three carry `data-ticket-id`, so ONE
 * delegated handler on the document root — React bubbles a portal's events to its
 * React ancestors, so the sheet's chips reach it too — routes them through the
 * SAME `openTicket` the badge uses (and so through the same `TicketLocator`
 * fallback for a ticket the note never attached).
 *
 * Only a PLAIN left click is taken. Ctrl/Cmd/Shift/Alt and the middle button are
 * left alone, so open-in-new-tab still follows the chip's canonical `href` — the
 * same rule `NoteBadge`'s intercept applies. Nothing here touches `mousedown`, so
 * the editor's own caret/selection handling is unaffected; only the LINK's
 * default action (a page navigation) is cancelled.
 */
export function ticketChipClickHandler(
  onOpenTicket: (ticketId: string) => void,
): (event: ReactMouseEvent<HTMLElement>) => void {
  return (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest('a[data-ticket-id]');
    if (chip === null || !event.currentTarget.contains(chip)) return;
    const ticketId = chip.getAttribute('data-ticket-id');
    if (ticketId === null || ticketId === '') return;
    event.preventDefault();
    onOpenTicket(ticketId);
  };
}
