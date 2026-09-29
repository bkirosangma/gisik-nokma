import type { ComponentPropsWithRef } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
/**
 * `ComponentPropsWithRef<'button'>` so a caller can hold the element — the delete
 * dialog hands its Cancel to `Dialog`'s `initialFocusRef` (trash Plan 4, case
 * 19.204). React 19 passes `ref` to a function component as an ordinary prop, so
 * the `{...rest}` below already forwards it; only the type had to admit it.
 */
export type ButtonProps = ComponentPropsWithRef<'button'> & { variant?: ButtonVariant };

export function Button({ variant = 'ghost', className, type, ...rest }: ButtonProps) {
  const classes = ['gn-button', `gn-button--${variant}`, className].filter(Boolean).join(' ');
  return <button {...rest} type={type ?? 'button'} className={classes} />;
}
