import type { ReactNode } from 'react';

export type CardProps = { children: ReactNode; className?: string };

/** A plain raised container. Never itself interactive — cards hold buttons. */
export function Card({ children, className }: CardProps) {
  return <div className={['gn-card', className].filter(Boolean).join(' ')}>{children}</div>;
}
