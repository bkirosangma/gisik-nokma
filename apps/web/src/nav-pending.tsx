'use client';
import { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';

/**
 * The clicked link says it is working (smoothness T5, spec P10; audit SM-02). It must sit INSIDE a `<Link>`: `useLinkStatus`
 * reads the nearest one. The wrapper is `inline-block` and the hint is opacity only (globals.css), so the label never moves.
 */
export function NavPending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className="gn-nav__pending" data-pending={pending ? 'true' : 'false'}>{children}</span>;
}
