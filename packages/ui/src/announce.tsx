'use client';
import { useCallback, useEffect, useState } from 'react';

const listeners = new Set<(message: string) => void>();
let claimed = false;

/**
 * The shell's ONE polite live region (spec §5, S6). The first region to mount claims it; a second renders nothing. The claim is made in
 * an effect, not in render, so a render React throws away (a suspended or aborted one) never leaves the slot taken.
 */
export function AnnounceRegion() {
  const [message, setMessage] = useState('');
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (claimed) return undefined;
    claimed = true;
    setOwner(true);
    let frame = 0;
    const listener = (next: string) => {
      // Clear, then set on the next frame: the same text twice is a change a screen reader announces again.
      setMessage('');
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMessage(next));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      cancelAnimationFrame(frame);
      claimed = false;
    };
  }, []);
  if (!owner) return null;
  return <div role="status" aria-live="polite" aria-atomic="true" className="gn-visually-hidden">{message}</div>;
}

export function useAnnounce(): (message: string) => void {
  return useCallback((message: string) => { for (const listener of listeners) listener(message); }, []);
}
