import type { ReactNode } from 'react';
import { useWait } from '../use-wait.js';

export type PendingProps = { pending: boolean; label?: string; children: ReactNode; className?: string };

/** Content that is being written: busy at once, dimmed only after the wait (spec S6). Children stay in the tab order. */
export function Pending({ pending, label, children, className }: PendingProps) {
  const dim = useWait(pending);
  return (
    <div className={[className, dim ? 'gn-pending' : null].filter(Boolean).join(' ')} aria-busy={pending ? 'true' : undefined}>
      {children}
      {pending && label !== undefined ? <span className="gn-visually-hidden">{label}</span> : null}
    </div>
  );
}
