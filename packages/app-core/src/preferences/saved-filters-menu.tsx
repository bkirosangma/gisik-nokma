import { useState } from 'react';
import type { FilterSpec, SavedFilter } from '@gisik-nokma/domain';

/** Shown in place of the list when nothing has been saved. */
export const SAVED_FILTERS_EMPTY_COPY = 'No saved filters.';

export type SavedFiltersMenuProps = {
  filters: SavedFilter[];
  /** Applying is a VIEW act: this is the only thing a click on a name does. */
  onApply: (filterSpec: FilterSpec) => void;
  onSaveCurrent: (name: string) => void;
  onDelete: (id: string) => void;
};

/**
 * The saved-filter list, its delete affordances, and the name-and-save row.
 *
 * ## Applying a filter is a VIEW act, and this component's SHAPE is the proof
 *
 * Amendment 14's claim is that applying a saved filter never touches data. A
 * test that clicks a name and asserts no ingest happened proves that of ONE
 * render; what makes it true of every render is that this module has no
 * `DataSource`, no `PreferencesGateway` and no import that could reach either
 * — its whole world is four props. `test/preferences/saved-filters-menu.test.tsx`
 * measures both halves: the click's single call, and (by reading this file)
 * the absence of any data surface to call.
 *
 * The plan's draft of this test passes `ingest` and `prefsSet` spies that are
 * never handed to the component and then asserts they were not called. Those
 * two assertions cannot fail — a `vi.fn()` nobody was given is not called by
 * construction — so they are not reproduced here. What replaced them is in the
 * test file, named as the substitution it is.
 *
 * ## `currentSpec` is not a prop
 *
 * The plan lists one and its own draft never reads it: `onSaveCurrent(name)`
 * hands up the NAME, and the spec being saved is the caller's — it is the one
 * holding the live filter. An unread prop is public surface no test can
 * falsify, so it is omitted rather than accepted and ignored.
 *
 * ## The name bound is stated once, and not here
 *
 * `savedFilterSchema` caps a name at 120 characters and refuses U+0000; this
 * input carries no `maxLength` and no pattern. Restating the bound in the
 * markup would be a second spelling of it, free to drift the day the schema
 * moves, and the refusal a user would meet would be silent truncation rather
 * than a reason. `saveFilter` refuses with `reason: 'invalid-filter'` and the
 * message names the field; rendering that refusal is the caller's, because the
 * caller is what holds the gateway.
 *
 * The one thing this component DOES enforce is that a name is not blank —
 * `name.trim() === ''` disables the button — because a blank name is not a
 * refusal worth a round trip and `min(1)` would refuse it anyway.
 *
 * ## No colour is named here
 *
 * BEM classes, resolved in `packages/ui/src/ui.css` against existing
 * `var(--gn-*)` roles. The plan writes `tokens.color.ink`,
 * `tokens.color.accent`, `tokens.space.sm` — `@gisik-nokma/ui` exports no
 * `tokens` object, and Tasks 9, 11 and 12 all reached this same answer.
 * `test/preferences/saved-filters-css-binding.test.tsx` ties the class names
 * to the stylesheet, because nothing else does.
 */
export function SavedFiltersMenu(props: SavedFiltersMenuProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <div className="gn-saved-filters">
      {props.filters.length === 0 ? (
        <p className="gn-saved-filters__empty">{SAVED_FILTERS_EMPTY_COPY}</p>
      ) : (
        <ul className="gn-saved-filters__list">
          {props.filters.map((filter) => (
            <li className="gn-saved-filters__item" key={filter.id}>
              <button
                type="button"
                className="gn-saved-filters__apply"
                onClick={() => props.onApply(filter.filterSpec)}
              >
                {filter.name}
              </button>
              <button
                type="button"
                className="gn-saved-filters__delete"
                aria-label={`Delete ${filter.name}`}
                onClick={() => props.onDelete(filter.id)}
              >
                {'×'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="gn-saved-filters__save">
        <input
          type="text"
          className="gn-saved-filters__name"
          aria-label="Filter name"
          placeholder="Name this filter"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="button"
          className="gn-saved-filters__submit"
          disabled={trimmed === ''}
          onClick={() => {
            props.onSaveCurrent(trimmed);
            setName('');
          }}
        >
          Save current filter
        </button>
      </div>
    </div>
  );
}
