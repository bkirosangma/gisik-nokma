import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog } from '../src/components/dialog.js';

/** UX fixes Task 7, case 23.124 (audit BRD-09, FD7): `Dialog` takes a `footer` that renders OUTSIDE the scrolling body. */
afterEach(cleanup);

describe('23.124 Dialog footer', () => {
  it('23.124 a footer renders after the body, as a child of the panel and outside `.gn-dialog__body`', () => {
    render(
      <Dialog open title="Add" onClose={() => {}} footer={<button type="button">Create it</button>}>
        <p>the fields</p>
      </Dialog>,
    );
    const footer = screen.getByRole('button', { name: 'Create it' }).closest('.gn-dialog__footer');
    expect(footer).not.toBeNull();
    expect(footer?.closest('.gn-dialog__body')).toBeNull();
    const panel = screen.getByRole('dialog', { name: 'Add' });
    expect(footer?.parentElement).toBe(panel);
    const body = panel.querySelector('.gn-dialog__body');
    expect(body?.contains(screen.getByText('the fields'))).toBe(true);
    expect(body?.nextElementSibling).toBe(footer);
  });

  it('23.124 CONTROL — a dialog without `footer` renders exactly as before: no footer element at all', () => {
    render(
      <Dialog open title="Add" onClose={() => {}}>
        <p>the fields</p>
      </Dialog>,
    );
    expect(document.querySelector('.gn-dialog__footer')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Add' }).querySelectorAll(':scope > *')).toHaveLength(2);
  });
});
