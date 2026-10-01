'use client';

import type { ReactElement } from 'react';
import {
  ARCHIVE_LABEL,
  DELETE_TRIGGER_LABEL,
  RESTORE_LABEL,
  WORKSPACE_MENU_LABEL,
  moreActionsFor,
} from '@gisik-nokma/app-core';
import { OverflowMenu } from './overflow-menu.js';

/**
 * The workspace card's overflow menu (trash Plan 4, spec §6.2): **Archive** /
 * **Restore** and **Delete…**, for the workspace OWNER only — the caller does
 * not render it for anyone else (D4; spec §4: workspace acts are owner-only).
 *
 * ## The menu machinery is `OverflowMenu`
 *
 * The trigger, the NAMED `role="menu"` (case 13.1059), focus, arrow keys, Escape and
 * outside-click live in `overflow-menu.tsx` — AccountMenu's recipe — so the note byline's phone
 * menu (case 21.131) shares them. This file only names the card's two items.
 *
 * ## It is a SIBLING of the card's door, never inside it (D5)
 *
 * The card body is one `<Link>` (Round 19c); a button nested in a link is
 * invalid interactive content and would be announced as part of the door. The
 * caller renders this beside the link, inside the same `Card`.
 *
 * ## The menu closes, returning focus to the trigger, BEFORE either act (in `OverflowMenu`)
 *
 * Delete… opens `DeleteDialog`, whose `FocusScope restoreFocus` returns focus
 * to whatever held it when the dialog mounted. That must be this trigger — an
 * unmounted menu item would leave focus on `<body>`.
 */
export function WorkspaceCardMenu({
  name,
  archived,
  disabled,
  onArchiveToggle,
  onDelete,
}: {
  name: string;
  archived: boolean;
  disabled: boolean;
  onArchiveToggle: () => void;
  onDelete: () => void;
}): ReactElement {
  return (
    <OverflowMenu
      triggerLabel={moreActionsFor(name)}
      menuLabel={WORKSPACE_MENU_LABEL}
      disabled={disabled}
      items={[
        { label: archived ? RESTORE_LABEL : ARCHIVE_LABEL, onSelect: onArchiveToggle },
        { label: DELETE_TRIGGER_LABEL, onSelect: onDelete },
      ]}
    />
  );
}
