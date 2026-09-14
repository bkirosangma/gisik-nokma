import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
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
import { CheckIcon, RemoveIcon, SearchIcon } from './select-icons.js';

export type SelectOption = { value: string; label: string; icon?: ReactNode; description?: string };

export type SelectProps =
  | {
      multiple?: false;
      options: SelectOption[];
      value: string | null;
      onChange: (value: string) => void;
      searchable?: boolean;
      placeholder?: string;
      disabled?: boolean;
      'aria-label'?: string;
    }
  | {
      multiple: true;
      options: SelectOption[];
      value: string[];
      onChange: (value: string[]) => void;
      searchable?: boolean;
      maxSelected?: number;
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
    // Real, reproduced bug fix: `@react-aria/combobox`'s `useComboBox.mjs` reads
    // `state.collection.getItem(focusedKey)?.props.href` (and `?.props.onAction`) in both its
    // `Enter` and `Tab` keyboard-shortcut handlers, once a real item is keyboard-focused. The
    // `?.` there only guards `collectionItem` itself being `null` — it does NOT guard `.props`
    // being `undefined`. Every node built here previously had no `props` field at all, so
    // `collectionItem.props` was `undefined` for any focused item, and `.href` on `undefined`
    // threw `TypeError: Cannot read properties of undefined (reading 'href')` — unconditionally,
    // every time an item was focused via keyboard and Enter or Tab was pressed (confirmed via a
    // reproduced stack trace pointing at the exact `useComboBox.ts` line, before this fix
    // existed). An empty `props: {}` object makes `collectionItem.props.href` and
    // `collectionItem.props.onAction` both read safely as `undefined` instead of throwing, and
    // the handler falls through to `state.commit()` as intended — these `Select` options are
    // plain data (`SelectOption`), never links or actions, so `href`/`onAction` should always be
    // absent for them.
    props: {},
  }));
  return new ListCollection<SelectOption>(nodes);
}

/**
 * The structural subset of `useSelectState`'s and `useComboBoxState`'s return values that the
 * shared panel/row rendering below actually touches. Both concrete state types extend
 * `ListState<T>` — the `collection`/`disabledKeys`/`selectionManager` shape `useOption` and
 * `useListBox` require — and separately expose `selectedKey`. Intersecting the two, rather than
 * unioning the concrete hook return types, lets `SelectPanel`/`SelectOptionRow` stay agnostic to
 * which mode produced the state. `selectedKey` is unconditionally present on both concrete state
 * types regardless of `selectionMode` (it's simply the *first* selected key in multi-select
 * mode), so this type needs no widening for Task 8's multi-select mode — `SelectOptionRow`
 * doesn't read it at all any more (see its own comment), and nothing else here needs it either.
 */
type SharedSelectState = ListState<SelectOption> & { selectedKey: string | number | null };

// Multi-select's chips are a removable tag, not a tone indicator — a different job from the
// existing `Chip` in `packages/ui/src/components/chip.tsx`, which always renders a status dot
// and has no remove affordance. Deliberately not reusing it.
function SelectChip({
  label,
  onRemove,
  disabled,
}: {
  label: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <span className="gn-select__chip">
      {label}
      <button
        type="button"
        className="gn-select__chip-remove"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        disabled={disabled}
      >
        <RemoveIcon />
      </button>
    </span>
  );
}

export function Select(props: SelectProps) {
  const { options, searchable = false } = props;
  const collection = useMemo(() => buildCollection(options), [options]);

  return searchable ? (
    <SearchableSelect {...props} collection={collection} />
  ) : (
    <NonSearchableSelect {...props} collection={collection} />
  );
}

// Both `useSelectState` and `useComboBoxState` (below) natively accept `selectionMode:
// 'multiple'` — verified by reading the installed react-stately source, not assumed. Constructed
// here with an explicit `'single' | 'multiple'` second type argument (rather than letting it be
// inferred from a conditional options object) so `value`/`onChange` can be typed against the
// *union* of both modes' shapes at the call site, then narrowed per-branch inside the callback
// body via `props.multiple` — this keeps the hook call itself unconditional (called exactly once
// every render, satisfying the rules of hooks) while still getting real per-mode type safety
// where it's read.
function NonSearchableSelect(props: SelectProps & { collection: ListCollection<SelectOption> }) {
  const { options, placeholder = 'Select…', disabled = false, collection } = props;
  const [maxMessage, setMaxMessage] = useState<string | null>(null);

  const state = useSelectState<SelectOption, 'single' | 'multiple'>({
    collection,
    selectionMode: props.multiple ? 'multiple' : 'single',
    value: props.value,
    onChange: (keys) => {
      if (props.multiple) {
        const newValue = (Array.isArray(keys) ? keys : keys != null ? [keys] : []).map(String);
        // Only additions can exceed the cap — a removal always shrinks the set, so it's never
        // blocked here. Rejecting the forward is sufficient: `props.value` stays unchanged, so
        // `useSelectState`'s own `selectedKeys` (itself derived from `props.value`, always
        // controlled) reverts on the next render — verified by reading
        // `useMultipleSelectionState`'s source, no manual revert needed.
        if (props.maxSelected !== undefined && newValue.length > props.value.length && newValue.length > props.maxSelected) {
          setMaxMessage(`Max ${props.maxSelected} selected`);
          return;
        }
        props.onChange(newValue);
      } else {
        const key = Array.isArray(keys) ? (keys[0] ?? null) : keys;
        if (key != null) props.onChange(String(key));
      }
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

  // Simplest correct clear per the spec: the message doesn't need to survive a fresh open of the
  // panel, and no test here asserts anything about clearing on blur/next-pick specifically.
  useEffect(() => {
    if (state.isOpen) setMaxMessage(null);
  }, [state.isOpen]);

  const panel = state.isOpen
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
    : null;

  if (props.multiple) {
    const selectedOptions = options.filter((option) => props.value.includes(option.value));
    return (
      <>
        {/*
          No `HiddenSelect` here, unlike the single-select return below. It unconditionally
          renders a visually-hidden (not `display:none`) native `<select>` with one `<option>`
          per item, for browser autofill / native form submission. `getByText`, unlike
          `getByRole`, does not respect `aria-hidden` — so with `HiddenSelect` present, the
          brief's own `screen.getByText('Apple')` chip assertions matched BOTH the chip and this
          hidden `<option>Apple</option>`, throwing "Found multiple elements" (confirmed
          empirically, not assumed). The brief's tests are given verbatim and unscoped
          (`getByText`, not `within(chipContainer).getByText`), so the fix has to live here:
          multi-select drops native-`<select>` autofill/form-submission support rather than
          collide with chip text. Single-select is unaffected — it never renders text overlapping
          the hidden select's option labels in the same way, since chip rendering is multi-only.
        */}
        <div className="gn-select__trigger gn-select__trigger--multiple gn-field__input">
          {selectedOptions.map((option) => (
            <SelectChip
              key={option.value}
              label={option.label}
              onRemove={() => props.onChange(props.value.filter((v) => v !== option.value))}
              disabled={disabled}
            />
          ))}
          <button {...buttonProps} ref={triggerRef} className="gn-select__trigger-open">
            <span {...valueProps}>{selectedOptions.length === 0 ? placeholder : null}</span>
          </button>
        </div>
        <span aria-live="polite">{maxMessage}</span>
        {panel}
      </>
    );
  }

  const selected = options.find((option) => option.value === props.value) ?? null;
  return (
    <>
      <HiddenSelect state={state} triggerRef={triggerRef} label={props['aria-label']} name={props['aria-label']} />
      <button {...buttonProps} ref={triggerRef} className="gn-select__trigger gn-field__input">
        <span {...valueProps}>{selected ? selected.label : placeholder}</span>
      </button>
      {panel}
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
  const { placeholder = 'Select…', disabled = false, collection } = props;
  const [maxMessage, setMaxMessage] = useState<string | null>(null);

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
  // Task 8: this must NEVER fire for multi-select — `useComboBoxState`'s own internal handling
  // never closes/resets on selection when `selectionMode === 'multiple'` either (verified by
  // reading its source), because the whole point of multi-select is picking several options in
  // one open/close cycle. Forcing a close here would defeat that on every single pick.
  const closeOnSelectRef = useRef<() => void>(() => {});
  const comboState = useComboBoxState<SelectOption, 'single' | 'multiple'>({
    collection,
    selectionMode: props.multiple ? 'multiple' : 'single',
    value: props.value,
    onChange: (keys) => {
      if (props.multiple) {
        const newValue = (Array.isArray(keys) ? keys : keys != null ? [keys] : []).map(String);
        if (props.maxSelected !== undefined && newValue.length > props.value.length && newValue.length > props.maxSelected) {
          setMaxMessage(`Max ${props.maxSelected} selected`);
          return;
        }
        props.onChange(newValue);
        // No closeOnSelectRef.current() here — see the comment on the ref above.
      } else {
        const key = Array.isArray(keys) ? (keys[0] ?? null) : keys;
        if (key != null) {
          props.onChange(String(key));
          closeOnSelectRef.current();
        }
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
  // Assigning during render (rather than reading `comboState.close` fresh inside the `onChange`
  // handler, which can't see it — that handler is one of `comboState`'s own construction
  // arguments) would run on every render, including a discarded one under concurrent rendering.
  // The ref is only ever read from event handlers, always post-mount, so committing it in an
  // effect is both sufficient and the safer/more idiomatic timing.
  useEffect(() => {
    closeOnSelectRef.current = comboState.close;
  });
  useEffect(() => {
    if (comboState.isOpen) setMaxMessage(null);
  }, [comboState.isOpen]);
  // I2 (final whole-branch review, deliberately parked at the time — the owner has since ruled
  // "fix both now"): per the approved design spec, the searchable trigger should clear to an
  // empty filter box whenever its panel opens, rather than keep showing the previously-selected
  // label. Keyed on `comboState.isOpen` transitioning to `true` (not wired into the `onClick`
  // handler below) specifically because there are TWO independent paths that can open this panel
  // with a stale label still in the input — the reopen click below, and focusing the trigger via
  // Tab, which goes entirely through `useComboBox`'s own `inputProps.onFocus` →
  // `comboState.setFocused(true)` → the library's internal `menuTrigger === 'focus'` open call
  // and never runs any of this component's own code. A `useEffect` on `isOpen` is the one place
  // that sees both. Guarded to `!props.multiple`: multi-select's input is already empty except
  // while typing (`useComboBoxState`'s `selectedKey` is always `null` in `selectionMode:
  // 'multiple'`, confirmed by reading its source), so there is nothing to clear there, and the
  // spec's "searchable trigger" wording is single-select only.
  //
  // Checked against a THIRD isOpen transition beyond the two paths above (flagged in review of
  // this exact fix): the library's own type-to-reopen path (`open(null, 'input')`, its main
  // effect, fires when the box is closed-but-focused and the user starts typing — e.g. right
  // after Escape without blurring, or right after a selection without blurring). Instrumented
  // directly (a throwaway `console.log` inside this effect, not just reasoning from source):
  // MEASURED, NOT EXPLAINED — the effect does fire on that transition, and at the moment it fires
  // `comboState.inputValue` reads `''`, which does not reconcile with `useComboBoxState.mjs`'s own
  // `open(null, 'input')` guard (~line 185) requiring `inputValue !== lastValue` — i.e. the typed
  // character would need to already be IN `inputValue` for that branch to fire at all. The exact
  // render ordering that produces this is unresolved; do not trust an explanation for it that
  // isn't here, because none has been verified. What IS measured is the outcome: in both shapes
  // tested (typing after Escape with nothing selected, typing after a selection with no blur —
  // both multi-character), the final settled value after a complete `user.type()` call is exactly
  // the typed text, with no character lost or reordered. (Per-keystroke checks were used during
  // development via a throwaway `console.log`, not preserved as intermediate test assertions —
  // the two committed tests below assert only the final value.) See select.test.tsx's two `does
  // not lose`/`keeps the typed filter text` tests — they ARE the guard here, standing in for an
  // understood mechanism rather than restating one.
  //
  // Separately verified (this part IS traced through source, not just measured): this fix does
  // not defeat two further guarantees. `useComboBoxState`'s own main effect reacts to `inputValue
  // !== lastValue` by flipping `showAllItems` back to `false` and running a `setValue(null)`
  // branch on the very next render — but `filteredCollection` with an empty `inputValue` already
  // equals the full collection (`''.includes()` is always true), so Task 12.6's I1 fix (which
  // shows the full list on reopen) is unaffected either way; and `setValue(null)`'s resulting
  // `onChange(null)` call is
  // swallowed by this component's own `if (key != null)` guard below, so the real consumer
  // `onChange` prop is never invoked from the reopen itself. See select.test.tsx for the permanent
  // regression tests covering both reopen paths, the onChange-silence guarantee, the two
  // typing-is-preserved probes, and Task 12.6's own full-list-on-reopen test (re-run and confirmed
  // still passing after this change).
  useEffect(() => {
    if (comboState.isOpen && !props.multiple) comboState.setInputValue('');
  }, [comboState.isOpen, comboState.setInputValue, props.multiple]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listBoxRef = useRef<HTMLUListElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { inputProps, listBoxProps } = useComboBox(
    {
      'aria-label': props['aria-label'],
      isDisabled: disabled,
      inputRef,
      listBoxRef,
      popoverRef: overlayRef,
      // Backspace-to-remove-last-chip, multi-select only, only when the filter text is empty —
      // otherwise Backspace should behave as ordinary text editing. Passed here (not as a plain
      // `<input onKeyDown>` prop) so it composes with `useComboBox`'s own internally-chained
      // Escape/Enter/Arrow handling (`chain(...)`) rather than silently replacing it.
      onKeyDown: (e) => {
        if (props.multiple && e.key === 'Backspace' && comboState.inputValue === '' && props.value.length > 0) {
          props.onChange(props.value.slice(0, -1));
        }
      },
    },
    comboState,
  );
  const { overlayProps, placement } = useOverlayPosition({
    targetRef: inputRef,
    overlayRef,
    placement: 'bottom start',
    isOpen: comboState.isOpen,
    onClose: comboState.close,
  });

  const selectedOptions = props.multiple ? props.options.filter((option) => props.value.includes(option.value)) : [];

  const panel = comboState.isOpen
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
    : null;

  return (
    <>
      <div
        className={
          props.multiple
            ? 'gn-select__trigger gn-select__trigger--searchable gn-select__trigger--multiple gn-field__input'
            : 'gn-select__trigger gn-select__trigger--searchable gn-field__input'
        }
      >
        <SearchIcon />
        {props.multiple
          ? selectedOptions.map((option) => (
              <SelectChip
                key={option.value}
                label={option.label}
                onRemove={() => props.onChange(props.value.filter((v) => v !== option.value))}
                disabled={disabled}
              />
            ))
          : null}
        {/*
          `inputProps` carries no `onClick` of its own (confirmed by reading `useComboBox`'s
          source rather than assuming — it merges only `onTouchEnd`, `autoCorrect`, `spellCheck`
          etc. onto `useTextField`'s base props, never a click handler), so there's nothing to
          chain here. The click handler below is what fixes Task 7.5's reopen bug: clicking this
          trigger again after a selection (or Escape) closed the panel used to do nothing — only
          ArrowDown/ArrowUp reopened it.

          MEASURED (a debug console.log in this test environment, not inferred): on the reopen
          click, `comboState.isOpen` already reads `false` by the time this `onClick` handler
          runs — i.e. whatever normally opens the panel on focus hasn't fired for this click. On
          the *first* click (nothing focused yet), by contrast, `isOpen` already reads `true` by
          click time — focus's own open-on-focus effect fired and React re-rendered before the
          click handler ran. Two independent close paths (select-then-reclick, and
          Escape-then-reclick, both covered in select.test.tsx) show the same `isOpen === false`
          pattern on the reopen click.

          INFERRED (plausible from reading `useComboBox`'s source, not directly measured):
          `inputProps.onFocus` is `if (state.isFocused) return; ...; state.setFocused(true)` — so
          the open-on-focus path is skipped whenever `state.isFocused` is already `true`. For the
          Escape-close case this is straightforward: Escape never blurs the input at all, so
          `state.isFocused` stays `true` and the next focus event is trivially a no-op. For the
          select-an-option case, a native `focus` event was observed firing again on the reopen
          click (a real DOM focus transition), so this explanation requires `state.isFocused` to
          have stayed `true` even though focus visibly left and returned — plausibly because
          `onBlur` deliberately ignores a blur into the popover (`blurIntoPopover`, so clicking an
          option doesn't itself close the panel), but this was not independently confirmed by
          reading `state.isFocused` at each step.

          Whichever of these the real mechanism is, the fix doesn't depend on it: `open()`
          (never `toggle()` — must never flip an already-open panel closed) fires whenever
          `isOpen` is still `false` at click time, and is idempotent when already open, so it's
          safe regardless of exactly why the open-on-focus path didn't already fire.
        */}
        <input
          {...inputProps}
          ref={inputRef}
          placeholder={placeholder}
          onClick={() => {
            // `open(focusStrategy, trigger)`'s own `displayAllItems` is computed purely from
            // `trigger` (`trigger === 'manual' || (trigger === 'focus' && menuTrigger ===
            // 'focus')`, confirmed by reading `useComboBoxState.mjs`) — not from anything about
            // *why* the panel was closed. Calling `open()` with no `trigger` argument leaves
            // `displayAllItems` `false`, so a reopen after a filtered selection kept rendering
            // the stale filtered collection instead of the full one, even though the input still
            // displays the selected option's full label (from `resetInputValue()`) rather than an
            // empty filter box — that stale label text is what was still filtering the list.
            // Passing `'focus'` here matches `menuTrigger: 'focus'` (already hardcoded below) and
            // is exactly the call shape `useComboBoxState`'s own internal focus-open path already
            // uses (`open(null, 'focus')`, confirmed in the same source), so this reopen now goes
            // through the same `displayAllItems: true` branch a normal focus-open would.
            if (!comboState.isOpen) comboState.open(null, 'focus');
          }}
        />
      </div>
      {props.multiple ? <span aria-live="polite">{maxMessage}</span> : null}
      {panel}
    </>
  );
}

// The shared panel: listbox chrome + option rows, used by both the non-searchable (button
// trigger) and searchable (combobox input trigger) branches so the two modes never duplicate
// this rendering. Positioning/dismiss props arrive pre-computed from the caller's own
// `useOverlayPosition`/`useOverlay` (and, for the combobox branch, `useComboBox`) calls — hooks
// can't be shared across the two branches since they depend on branch-specific refs (a button
// vs. an input as the position target), only the JSX they feed can be. Works unmodified for
// multi-select: `useListBox`/`useOption` are already selection-mode-agnostic.
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
  // `value: SelectOption | null`, not `SelectOption` — matches `@react-stately/list`'s own
  // `Node<T>.value: T | null` exactly (confirmed by `tsc`, not assumed: typing this as
  // non-nullable `SelectOption` fails typecheck against the real `Node<SelectOption>` objects
  // `[...state.collection]` yields). `buildCollection` (above) always sets a real `value: option`
  // for every node it builds, so the `null` case is never actually reached at runtime for this
  // component's own collections — but the type is honest about what react-aria's `Node<T>`
  // itself promises, so `item.value?.icon`/`?.description` below, not a non-null assertion.
  item: { key: string | number; rendered: React.ReactNode; value: SelectOption | null };
  state: SharedSelectState;
}) {
  const ref = useRef<HTMLLIElement>(null);
  // `useOption`'s own `isSelected` (`state.selectionManager.isSelected(key)`, verified by
  // reading its source) is already mode-agnostic — true membership-based for both single and
  // multi selection — so it replaces the old manual `state.selectedKey === item.key` equality
  // check, which only ever reflected the *first* selected key and would have under-reported
  // every selected item but the first once multi-select was added.
  //
  // `labelProps`/`descriptionProps` MUST be spread onto real elements, not discarded: `useOption`
  // pre-wires `optionProps['aria-labelledby']`/`['aria-describedby']` to ids generated by
  // `useSlotId()` (confirmed by reading `useOption.mjs`/`useId.mjs` in the installed
  // react-aria@3.52.1 source) — but `useSlotId` resolves those ids to `undefined` unless an
  // element carrying that exact id actually exists in the DOM (`document.getElementById(id) ? id
  // : undefined`). Before this fix, no element carried either id, so both attributes evaporated
  // and the option's accessible name fell back to its full text content — label AND description
  // concatenated. Empirically confirmed: `getByRole('option', { name: 'Apple' })` (exact) failed
  // against the `A crisp fruit` fixture until this fix landed, because the computed name was
  // "Apple A crisp fruit", not "Apple". Spreading `labelProps` onto the label span and
  // `descriptionProps` onto the description span makes the name resolve through
  // `aria-labelledby` to just the label, and exposes the description as an ARIA description
  // rather than folding it into the name — the semantics a description owes, and the same
  // contract `apps/web/e2e-stack/accessible-names-baseline.json` (Task 0's accessible-names gate)
  // exists to protect.
  const { optionProps, labelProps, descriptionProps, isFocused, isSelected } = useOption(
    { key: item.key },
    state,
    ref
  );
  return (
    <li {...optionProps} ref={ref} className="gn-select__option" data-focused={isFocused || undefined}>
      {item.value?.icon ? <span className="gn-select__option-icon">{item.value.icon}</span> : null}
      <span className="gn-select__option-text">
        <span {...labelProps} className="gn-select__option-label">
          {item.rendered}
        </span>
        {item.value?.description ? (
          <span {...descriptionProps} className="gn-select__option-description">
            {item.value.description}
          </span>
        ) : null}
      </span>
      {isSelected ? <CheckIcon /> : null}
    </li>
  );
}
