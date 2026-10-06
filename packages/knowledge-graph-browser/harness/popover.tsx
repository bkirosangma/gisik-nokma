import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { Popover, Sheet } from '@gisik-nokma/ui';

/*
 * Add link's picker as the ticket sheet hosts it (release walk row 5, cases 27.705–27.706): the ui `Sheet` (its body is the
 * scroller) with a tall body and, at its end, a trigger that opens the ui `Popover`, as `ticket-links-section.tsx` does
 * on a desktop (`aria-haspopup="dialog"`, `aria-expanded`, a toggle). The harness cannot import app-core; this is the same
 * two ui components and the same wiring. `window.__pop.opens` counts the opens.
 */
const style = document.createElement('style');
style.textContent = themeStylesheet();
document.head.prepend(style);

declare global {
  interface Window {
    __pop: { opens: number; closes: number };
  }
}
window.__pop = { opens: 0, closes: 0 };

function AddLink() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const set = (next: boolean) => {
    if (next) window.__pop.opens += 1;
    else window.__pop.closes += 1;
    setOpen(next);
  };
  return (
    <>
      <button ref={ref} type="button" className="gn-button gn-button--ghost" aria-haspopup="dialog" aria-expanded={open} onClick={() => set(!open)}>
        Add link
      </button>
      <Popover triggerRef={ref} open={open} onClose={() => set(false)} aria-label="Add link">
        <label>
          Link type{' '}
          <select aria-label="Link type">
            <option>Blocks</option>
            <option>Relates to</option>
          </select>
        </label>
      </Popover>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <Sheet open title="A ticket" onClose={() => undefined}>
    {Array.from({ length: 40 }, (_, i) => (
      <p key={i}>Description paragraph {i + 1}: enough text to make the sheet body scroll past its fold.</p>
    ))}
    <AddLink />
  </Sheet>,
);
