import { TYPE_ICON_NAMES, TypeIcon } from './icons.js';

export function IconPicker(props: { value: string; onChange(name: string): void; disabled?: boolean }) {
  return (
    <div className="icon-picker" role="group" aria-label="Icon">
      {TYPE_ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          className={`icon-picker__choice${props.value === name ? ' icon-picker__choice--selected' : ''}`}
          aria-label={`Icon: ${name}`}
          aria-pressed={props.value === name}
          disabled={props.disabled === true}
          onClick={() => props.onChange(name)}
        >
          <TypeIcon name={name} />
        </button>
      ))}
    </div>
  );
}
