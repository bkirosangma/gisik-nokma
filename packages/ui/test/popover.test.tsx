import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Popover } from '../src/components/popover.js';

function Host() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button ref={ref} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Trigger
      </button>
      <p>outside</p>
      <Popover triggerRef={ref} open={open} onClose={() => setOpen(false)} aria-label="Choices">
        <label><input type="radio" name="x" /> One</label>
        <button type="button">Apply</button>
      </Popover>
    </div>
  );
}
afterEach(cleanup);

describe('Popover', () => {
  it('13.1267 opens as a named dialog portalled to body, moves focus inside, and Escape closes it and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    const dialog = screen.getByRole('dialog', { name: 'Choices' });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    // `FocusScope` restores inside a `requestAnimationFrame` (see `select.tsx`'s
    // `SelectPanel` docblock and `select.test.tsx`'s E4-17 cases), so the settle is async.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trigger' })).toHaveFocus());
  });

  it('13.1268 an outside click closes it; a click INSIDE does not (the control)', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    fireEvent.mouseUp(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
