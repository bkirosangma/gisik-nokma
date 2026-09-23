'use client';

import { Select, type SelectOption } from '@gisik-nokma/ui';
import type { RosterMember } from '@gisik-nokma/app-core';
import type { NoteScopeMode } from '@gisik-nokma/domain';
import { SCOPE_LABELS } from './note-scope-options.js';

/** `''` in a filter's `value` means "no filter" — see the docblock below. */
export const ANY_FILTER_VALUE = '';

/**
 * The search box and its two filters (Plan 3's read, this task's screen —
 * spec §7.8, D21–D24).
 *
 * ## `''` is a real option, not `null`
 *
 * `Select`'s single mode calls `onChange` only when a key is PICKED
 * (`packages/ui/src/select/select.tsx`'s `NonSearchableSelect`: `if (key !=
 * null) props.onChange(...)`) — there is no built-in way for a person to pick
 * "nothing" once they have picked something. So "no filter" is modelled as an
 * explicit FIRST option (`value: ''`, "Any author"/"Any scope") rather than as
 * a `null` the component could never let the person navigate back to.
 * `authorId`/`scopeMode` above this component are `string`, and `''` is the
 * one value that means "send neither filter" — `NotesPage` reads it that way
 * before handing anything to `useNotesSearch`.
 *
 * ## Author options are the union across every workspace, deduplicated
 *
 * A person can search from one box while belonging to several workspaces —
 * `WorkspaceNotesSection` runs one `useNotesSearch` per workspace against the
 * SAME `authorId` — so the author list has to be everyone reachable from any
 * of them, not one workspace's roster. `NotesPage` builds that union (see its
 * own docblock); this component only renders whatever it is handed.
 */
export function NotesSearchHeader({
  value,
  onChange,
  authorId,
  onAuthor,
  scopeMode,
  onScope,
  members,
}: {
  value: string;
  onChange: (next: string) => void;
  authorId: string;
  onAuthor: (next: string) => void;
  scopeMode: string;
  onScope: (next: string) => void;
  members: RosterMember[];
}) {
  const authorOptions: SelectOption[] = [
    { value: ANY_FILTER_VALUE, label: 'Any author' },
    ...members.map((member) => ({
      value: member.id,
      label: member.name?.trim() || member.email?.trim() || member.id,
    })),
  ];

  const scopeOptions: SelectOption[] = [
    { value: ANY_FILTER_VALUE, label: 'Any scope' },
    ...(Object.keys(SCOPE_LABELS) as NoteScopeMode[]).map((mode) => ({
      value: mode,
      label: SCOPE_LABELS[mode],
    })),
  ];

  return (
    <div className="gn-notes__search">
      <input
        type="search"
        aria-label="Search notes"
        data-testid="notes-search"
        className="gn-notes__search-input gn-field__input"
        value={value}
        onChange={(changeEvent) => onChange(changeEvent.target.value)}
      />
      <div className="gn-notes__filters">
        <Select aria-label="Author" options={authorOptions} value={authorId} onChange={onAuthor} />
        <Select aria-label="Scope" options={scopeOptions} value={scopeMode} onChange={onScope} />
      </div>
    </div>
  );
}
