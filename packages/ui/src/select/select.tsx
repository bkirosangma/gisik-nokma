import { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useButton } from '@react-aria/button';
import { useListBox, useOption } from '@react-aria/listbox';
import { DismissButton, useOverlay, useOverlayPosition } from '@react-aria/overlays';
import { HiddenSelect, useSelect } from '@react-aria/select';
import { ListCollection } from '@react-stately/list';
import { useSelectState } from '@react-stately/select';
import { CheckIcon } from './select-icons.js';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

// `@react-stately/collections`'s `Item` marker component isn't part of this
// package's declared dependency set (only the `@react-aria/*`/`@react-stately/*`
// scoped packages from Task 1 are installed, and pnpm's strict linking means the
// unscoped `react-stately` package — which now owns `Item` — isn't resolvable
// from here). `useSelectState`/`useListState` accept a pre-built `collection`
// instead of `items` + `children`, which sidesteps the dynamic-collection
// builder (and `Item`) entirely: `ListCollection` (a public `@react-stately/list`
// export, already a declared dependency) takes an iterable of plain Node-shaped
// objects and does its own key linking.
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

export function Select(props: SelectProps) {
  const { options, value, onChange, placeholder = 'Select…', disabled = false } = props;

  const collection = useMemo(() => buildCollection(options), [options]);

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
            <div
              {...overlayProps}
              {...dismissOverlayProps}
              ref={overlayRef}
              className="gn-select__panel"
              data-placement={placement}
            >
              <DismissButton onDismiss={state.close} />
              <SelectListBox {...menuProps} state={state} />
              <DismissButton onDismiss={state.close} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SelectListBox(props: { state: ReturnType<typeof useSelectState<SelectOption>> } & Record<string, unknown>) {
  const { state, ...rest } = props;
  const ref = useRef<HTMLUListElement>(null);
  const { listBoxProps } = useListBox({ ...rest, autoFocus: state.focusStrategy ?? true }, state, ref);
  return (
    <ul {...listBoxProps} ref={ref} className="gn-select__list">
      {[...state.collection].map((item) => (
        <SelectOptionRow key={item.key} item={item} state={state} />
      ))}
    </ul>
  );
}

function SelectOptionRow({
  item,
  state,
}: {
  item: { key: string | number; rendered: React.ReactNode };
  state: ReturnType<typeof useSelectState<SelectOption>>;
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
