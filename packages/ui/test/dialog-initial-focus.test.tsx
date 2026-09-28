import { createRef, useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/components/button.js';
import { Dialog } from '../src/components/dialog.js';

/**
 * Trash series Plan 4, Task 1. Cases 19.201–19.204 (`test-cases/19-trash.md`
 * §19.19). The delete dialog (spec §6.1) needs Cancel to hold the first focus,
 * which `Dialog`'s own panel focus (ruling P8) would otherwise take back: a
 * child's `autoFocus` runs BEFORE the parent's effect and is overwritten by it.
 */

const TITLE = 'Delete ticket “File the GST return”?';

function Harness({ withInitialFocus }: { withInitialFocus: boolean }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Dialog
      open
      title={TITLE}
      onClose={() => undefined}
      {...(withInitialFocus ? { initialFocusRef: cancelRef } : {})}
    >
      <Button ref={cancelRef}>Cancel</Button>
      <Button variant="danger">Delete</Button>
    </Dialog>
  );
}

describe('19.201 Dialog gives the first focus to initialFocusRef when asked', () => {
  it('19.201 focus lands on Cancel; CONTROL: without the prop it lands on the panel', () => {
    const first = render(<Harness withInitialFocus />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    first.unmount();

    render(<Harness withInitialFocus={false} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: TITLE }));
  });
});

describe('19.202 Dialog renders the role it is given', () => {
  it('19.202 alertdialog when asked; CONTROL: dialog by default', () => {
    const first = render(
      <Dialog open title={TITLE} role="alertdialog" onClose={() => undefined}>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    first.unmount();

    render(
      <Dialog open title={TITLE} onClose={() => undefined}>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });
});

describe('19.203 Dialog describedBy names its description', () => {
  it('19.203 aria-describedby resolves to the note; CONTROL: absent without the prop', () => {
    const first = render(
      <Dialog open title={TITLE} role="alertdialog" describedBy="gn-note-1" onClose={() => undefined}>
        <p id="gn-note-1">Deleted items sit in Deleted items on your Account page.</p>
      </Dialog>,
    );
    expect(screen.getByRole('alertdialog', { name: TITLE })).toHaveAccessibleDescription(
      'Deleted items sit in Deleted items on your Account page.',
    );
    first.unmount();

    render(
      <Dialog open title={TITLE} onClose={() => undefined}>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: TITLE })).not.toHaveAttribute('aria-describedby');
  });
});

describe('19.204 Button forwards ref', () => {
  it('19.204 the ref is the rendered <button>; CONTROL: it carries the variant class', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} variant="danger">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(ref.current).toBe(button);
    expect(button).toHaveClass('gn-button', 'gn-button--danger');
  });
});
