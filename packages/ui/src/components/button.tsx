import type { ComponentPropsWithRef } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'danger-quiet';
/**
 * `ComponentPropsWithRef<'button'>` so a caller can hold the element — the delete
 * dialog hands its Cancel to `Dialog`'s `initialFocusRef` (trash Plan 4, case
 * 19.204). React 19 passes `ref` to a function component as an ordinary prop, so
 * the `{...rest}` below already forwards it; only the type had to admit it.
 */
export type ButtonProps = ComponentPropsWithRef<'button'> & { variant?: ButtonVariant; busy?: boolean; busyLabel?: string };

/**
 * `busy` (smoothness T2; spec S6): a write in flight. The button is disabled, `aria-busy`, and reads `busyLabel` (or its children) so
 * a second click cannot start a second write and the page says what is happening.
 */
export function Button({ variant = 'ghost', className, type, busy = false, busyLabel, disabled, children, ...rest }: ButtonProps) {
  const classes = ['gn-button', `gn-button--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type ?? 'button'} className={classes} disabled={disabled || busy} aria-busy={busy ? 'true' : undefined}>
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  );
}
