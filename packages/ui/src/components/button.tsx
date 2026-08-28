import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({ variant = 'ghost', className, type, ...rest }: ButtonProps) {
  const classes = ['gn-button', `gn-button--${variant}`, className].filter(Boolean).join(' ');
  return <button {...rest} type={type ?? 'button'} className={classes} />;
}
