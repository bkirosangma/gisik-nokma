import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewTicketDialog } from '../../src/views/new-ticket-dialog.js';

/**
 * UX fixes Task 7, case 23.124 (audit BRD-09, Review Focus 4): "Create ticket" lives in the dialog's sticky footer,
 * outside the scrolling body, and while it is disabled a visible line says why. P-T8's name, "Create ticket", stays.
 */
afterEach(cleanup);

const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];

function renderDialog() {
  return render(
    <NewTicketDialog
      workflowStates={() => null}
      open
      userId="usr_ada"
      workspaceId="ws_1"
      assigneeCandidates={[]}
      typeOptions={TYPES}
      parentCandidates={[]}
      onCreate={vi.fn()}
      onClose={() => undefined}
    />,
  );
}

describe('23.124 NewTicketDialog footer', () => {
  it('23.124 "Create ticket" and "Cancel" are in `.gn-dialog__footer`, not in `.gn-dialog__body`', () => {
    renderDialog();
    const create = screen.getByRole('button', { name: 'Create ticket' });
    expect(create.closest('.gn-dialog__footer')).not.toBeNull();
    expect(create.closest('.gn-dialog__body')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' }).closest('.gn-dialog__footer')).not.toBeNull();
  });

  it('23.124 while Create is disabled for want of a title, the footer says "Add a title to create the ticket" and the button points at it; typing a title removes both', async () => {
    const user = userEvent.setup();
    renderDialog();
    const create = screen.getByRole('button', { name: 'Create ticket' });
    expect(create).toBeDisabled();
    const hint = screen.getByText('Add a title to create the ticket');
    expect(hint.closest('.gn-dialog__footer')).not.toBeNull();
    expect(create).toHaveAttribute('aria-describedby', hint.id);
    await user.type(screen.getByLabelText('Title'), 'File the GST return');
    expect(create).toBeEnabled();
    expect(screen.queryByText('Add a title to create the ticket')).toBeNull();
    expect(create).not.toHaveAttribute('aria-describedby');
  });
});
