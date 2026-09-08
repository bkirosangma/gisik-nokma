// packages/ui/src/components/segmented-control.tsx
export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Names the choice for assistive tech. Required, so it cannot be forgotten. */
  'aria-label': string;
};

/**
 * HIG's method / view picker. Replaces the bordered `.gn-view-tabs` buttons
 * with a fill track and a raised selected segment, keeping the exact roles the
 * old markup carried — `tablist`, `tab`, `aria-selected` — so the accessible-name
 * ratchet (13.285/13.287) sees no loss.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="gn-segmented">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={on}
            className={on ? 'gn-segmented__item gn-segmented__item--on' : 'gn-segmented__item'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
