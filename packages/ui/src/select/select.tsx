import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useButton } from '@react-aria/button';
import { useComboBox } from '@react-aria/combobox';
import { useListBox, useOption } from '@react-aria/listbox';
import { DismissButton, useOverlay, useOverlayPosition } from '@react-aria/overlays';
import { HiddenSelect, useSelect } from '@react-aria/select';
import { useComboBoxState } from '@react-stately/combobox';
import { ListCollection } from '@react-stately/list';
import type { ListState } from '@react-stately/list';
import { useSelectState } from '@react-stately/select';
import { CheckIcon, SearchIcon } from './select-icons.js';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  searchable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

// `@react-stately/collections`'s `Item` marker component isn't part of this
// package's declared dependency set (only the `@react-aria/*`/`@react-stately/*`
// scoped packages from Task 1 are installed, and pnpm's strict linking means the
// unscoped `react-stately` package — which now owns `Item` — isn't resolvable
// from here). `useSelectState`/`useComboBoxState`/`useListState` all accept a
// pre-built `collection` instead of `items` + `children`, which sidesteps the
// dynamic-collection builder (and `Item`) entirely: `ListCollection` (a public
// `@react-stately/list` export, already a declared dependency) takes an iterable
// of plain Node-shaped objects and does its own key linking. Feeding `collection`
// rather than `items` into `useComboBoxState` also means its built-in filtering
// (`defaultFilter`) runs directly against these nodes — see `SearchableSelect`.
function buildCollection(options: SelectOption[]) {
  const nodes = options.map((option, index) => ({
    type: 'item',
    key: option.value,
    value: option,
    level: 0,
    hasChildNodes: false,
    childNodes: [],
    rendered: option.label,
    textValue: option.label,
    index,
  }));
  return new ListCollection<SelectOption>(nodes);
}

/**
 * The structural subset of `useSelectState`'s and `useComboBoxState`'s return values that the
 * shared panel/row rendering below actually touches. Both concrete state types extend
 * `ListState<T>` — the `collection`/`disabledKeys`/`selectionManager` shape `useOption` and
 * `useListBox` require — and separately expose `selectedKey`. Intersecting the two, rather than
 * unioning the concrete hook return types, lets `SelectPanel`/`SelectOptionRow` stay agnostic to
 * which mode produced the state.
 */
type SharedSelectState = ListState<SelectOption> & { selectedKey: string | number | null };

export function Select(props: SelectProps) {
  const { options, searchable = false } = props;
  const collection = useMemo(() => buildCollection(options), [options]);

  return searchable ? (
    <SearchableSelect {...props} collection={collection} />
  ) : (
    <NonSearchableSelect {...props} collection={collection} />
  );
}

function NonSearchableSelect(props: SelectProps & { collection: ListCollection<SelectOption> }) {
  const { options, value, onChange, placeholder = 'Select…', disabled = false, collection } = props;

  const state = useSelectState<SelectOption>({
    collection,
    value,
    onChange: (key) => {
      if (key != null) onChange(String(key));
    },
    isDisabled: disabled,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const { triggerProps, valueProps, menuProps } = useSelect(
    { 'aria-label': props['aria-label'], isDisabled: disabled },
    state,
    triggerRef,
  );
  const { buttonProps } = useButton(triggerProps, triggerRef);

  const overlayRef = useRef<HTMLDivElement>(null);
  const listBoxRef = useRef<HTMLUListElement>(null);
  const { overlayProps, placement } = useOverlayPosition({
    targetRef: triggerRef,
    overlayRef,
    placement: 'bottom start',
    isOpen: state.isOpen,
    onClose: state.close,
  });
  const { overlayProps: dismissOverlayProps } = useOverlay(
    { isOpen: state.isOpen, onClose: state.close, shouldCloseOnBlur: true, isDismissable: true },
    overlayRef,
  );

  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <>
      <HiddenSelect state={state} triggerRef={triggerRef} label={props['aria-label']} name={props['aria-label']} />
      <button {...buttonProps} ref={triggerRef} className="gn-select__trigger gn-field__input">
        <span {...valueProps}>{selected ? selected.label : placeholder}</span>
      </button>
      {state.isOpen
        ? createPortal(
            <SelectPanel
              state={state}
              overlayRef={overlayRef}
              listBoxRef={listBoxRef}
              overlayProps={{ ...overlayProps, ...dismissOverlayProps } as Record<string, unknown>}
              listBoxProps={menuProps as Record<string, unknown>}
              placement={placement}
              autoFocus={state.focusStrategy ?? true}
              onDismiss={state.close}
            />,
            document.body,
          )
        : null}
    </>
  );
}

// Deliberately does NOT add `useOverlay`'s dismiss-on-blur/Escape wiring on top of
// `useOverlayPosition`'s positioning — `useComboBox`'s `inputProps` already closes the panel on
// blur and Escape via the combobox's own state machine (`setFocused`/`commit` in
// `useComboBoxState`), and layering a second independent "click outside" listener onto the same
// interaction risked an untested double-close/race with no test in this task's brief covering
// it. The non-searchable trigger is a plain button with no such built-in handling, which is why
// it still needs `useOverlay` itself.
function SearchableSelect(props: SelectProps & { collection: ListCollection<SelectOption> }) {
  const { value, onChange, placeholder = 'Select…', disabled = false, collection } = props;

  // `useComboBoxState`'s own post-selection auto-close (its `useEffect` watching `displayValue`
  // against its previous render's value) only fires once the *next* render sees a genuinely
  // different `value` — i.e. only once the parent has round-tripped `onChange` back into a new
  // `value` prop. A caller that treats `onChange` as fire-and-forget (never feeding a new
  // `value` back in) would otherwise leave the panel stuck open after a selection, unlike the
  // non-searchable branch, where `useSelect`/`useListBox`'s close-on-select is an immediate,
  // imperative part of handling the selection itself rather than something that waits for a
  // prop round-trip. `closeOnSelectRef` closes the panel synchronously in that same handler
  // regardless of whether `value` round-trips, matching the non-searchable branch's contract.
  // (Populated with the real `comboState.close` right after construction below — the ref exists
  // only to break the circularity of referencing `comboState` from inside its own constructor.)
  const closeOnSelectRef = useRef<() => void>(() => {});
  const comboState = useComboBoxState<SelectOption>({
    collection,
    value,
    onChange: (key) => {
      if (key != null) {
        onChange(String(key));
        closeOnSelectRef.current();
      }
    },
    isDisabled: disabled,
    defaultFilter: (textValue, inputValue) => textValue.toLowerCase().includes(inputValue.toLowerCase()),
    // Default `menuTrigger` ('input') only opens the panel once the input's text actually
    // changes, so a bare click/focus on the trigger — with nothing typed yet — leaves it
    // closed. `'focus'` opens on focus (which a click also produces) showing the full
    // unfiltered list, matching the plain <select>-like "click to see everything, type to
    // narrow" behavior the spec's "trigger itself becomes the typeable field" describes.
    menuTrigger: 'focus',
  });
  closeOnSelectRef.current = comboState.close;

  const inputRef = useRef<HTMLInputElement>(null);
  const listBoxRef = useRef<HTMLUListElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { inputProps, listBoxProps } = useComboBox(
    { 'aria-label': props['aria-label'], isDisabled: disabled, inputRef, listBoxRef, popoverRef: overlayRef },
    comboState,
  );
  const { overlayProps, placement } = useOverlayPosition({
    targetRef: inputRef,
    overlayRef,
    placement: 'bottom start',
    isOpen: comboState.isOpen,
    onClose: comboState.close,
  });

  return (
    <>
      <div className="gn-select__trigger gn-select__trigger--searchable gn-field__input">
        <SearchIcon />
        <input {...inputProps} ref={inputRef} placeholder={placeholder} />
      </div>
      {comboState.isOpen
        ? createPortal(
            <SelectPanel
              state={comboState}
              overlayRef={overlayRef}
              listBoxRef={listBoxRef}
              overlayProps={overlayProps as Record<string, unknown>}
              listBoxProps={listBoxProps as Record<string, unknown>}
              placement={placement}
              autoFocus={comboState.focusStrategy ?? true}
              onDismiss={comboState.close}
            />,
            document.body,
          )
        : null}
    </>
  );
}

// The shared panel: listbox chrome + option rows, used by both the non-searchable (button
// trigger) and searchable (combobox input trigger) branches so the two modes never duplicate
// this rendering. Positioning/dismiss props arrive pre-computed from the caller's own
// `useOverlayPosition`/`useOverlay` (and, for the combobox branch, `useComboBox`) calls — hooks
// can't be shared across the two branches since they depend on branch-specific refs (a button
// vs. an input as the position target), only the JSX they feed can be.
function SelectPanel(props: {
  state: SharedSelectState;
  overlayRef: RefObject<HTMLDivElement | null>;
  listBoxRef: RefObject<HTMLUListElement | null>;
  overlayProps: Record<string, unknown>;
  listBoxProps: Record<string, unknown>;
  placement?: string | null;
  autoFocus: boolean | 'first' | 'last';
  onDismiss: () => void;
}) {
  const { state, overlayRef, listBoxRef, overlayProps, listBoxProps, placement, autoFocus, onDismiss } = props;
  const { listBoxProps: resolvedListBoxProps } = useListBox({ ...listBoxProps, autoFocus }, state, listBoxRef);
  return (
    <div {...overlayProps} ref={overlayRef} className="gn-select__panel" data-placement={placement}>
      <DismissButton onDismiss={onDismiss} />
      <ul {...resolvedListBoxProps} ref={listBoxRef} className="gn-select__list">
        {[...state.collection].map((item) => (
          <SelectOptionRow key={item.key} item={item} state={state} />
        ))}
      </ul>
      <DismissButton onDismiss={onDismiss} />
    </div>
  );
}

function SelectOptionRow({
  item,
  state,
}: {
  item: { key: string | number; rendered: React.ReactNode };
  state: SharedSelectState;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const isSelected = state.selectedKey === item.key;
  const { optionProps, isFocused } = useOption({ key: item.key }, state, ref);
  return (
    <li {...optionProps} ref={ref} className="gn-select__option" data-focused={isFocused || undefined}>
      <span className="gn-select__option-label">{item.rendered}</span>
      {isSelected ? <CheckIcon /> : null}
    </li>
  );
}
