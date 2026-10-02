import { TicketEditorSlot } from '@gisik-nokma/editor';
import type { EditorSlotComponent } from '@gisik-nokma/app-core';

/**
 * The Create ticket dialog's description composer: the SHEET'S OWN slot, with its
 * submit control suppressed (owner request 2026-09-23).
 *
 * ## Why a wrapper rather than the component itself
 *
 * `TicketSheet` takes `editorSlot={TicketEditorSlot}` directly, and that mount
 * is right: the sheet's composer IS the thing that writes a description, so it
 * should be the thing that submits it. The create dialog is the opposite case.
 * Its `Create` control is the one act that files the ticket, and the slot's own
 * "Save description" would sit inside the same form offering a SECOND,
 * differently-shaped act — one that sends a `ticket.field_set` naming a ticket
 * that does not exist yet. Two submit controls for one act is not styling: the
 * inner one would be an attempt to write to nothing.
 *
 * ## Why the suppression cannot be asked for from app-core
 *
 * `submitSlot` is deliberately NOT on the shared `EditorSlotProps` — it is a
 * fact about mounting THIS component, declared on `TicketEditorSlotProps`
 * alongside `editorRef`, the same seam-only precedent and the same reasoning:
 * a host that does not know which component it was passed could not ask for it
 * meaningfully. So the dialog, which may not name `packages/editor` at all
 * (amendment 12), cannot supply it — and this file is the one place that knows
 * both halves. It exists to carry exactly one prop across that boundary.
 *
 * ## It supplies nothing else, on purpose
 *
 * No `uploadAttachment` and no `emitAttachmentAdded`: an image pasted into a
 * description that does not exist yet has no ticket to attach to, and the slot
 * already states that gap honestly rather than swallowing the file — "without
 * `uploadAttachment` a pasted file is refused through `onError` instead of being
 * silently swallowed". Wiring an uploader here would file an `attachment.added`
 * against a ticket id at the moment of a paste, before anyone pressed Create.
 *
 * `queryUsers` IS wired by the caller of this component in the page, because
 * mentions name people rather than tickets and resolving them needs only the
 * workspace.
 */
export const NewTicketDescriptionSlot: EditorSlotComponent = (props) => (
  <TicketEditorSlot {...props} submitSlot="none" />
);
