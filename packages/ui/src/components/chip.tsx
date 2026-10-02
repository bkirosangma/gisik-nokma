import type { ReactNode } from 'react';

export type ChipTone =
  | 'neutral'
  | 'open'
  | 'active'
  | 'terminal'
  | 'blocked'
  | 'waiting'
  | 'pending'
  | 'restricted'
  | 'contested';

export type ChipProps = { tone?: ChipTone; children: ReactNode; title?: string };

export function Chip({ tone = 'neutral', children, title }: ChipProps) {
  return (
    <span className={`gn-chip gn-chip--${tone}`} title={title}>
      <span className="gn-chip__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
