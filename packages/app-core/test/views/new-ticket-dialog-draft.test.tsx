import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewTicketDialog, type NewTicketDraft } from '../../src/views/new-ticket-dialog.js';

afterEach(() => {
  cleanup();
  // 28.153 turns the remembered switch OFF and `rememberNewTicketStart` writes it.
  window.localStorage.clear();
});

const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];

/** Cases 28.153 and 28.154. */
const renderWith = (onCreate: (draft: NewTicketDraft) => void | Promise<void>) =>
  render(
    <NewTicketDialog workflowStates={() => null} open userId="usr_ada" workspaceId="ws_1" assigneeCandidates={[]}
      typeOptions={TYPES} parentCandidates={[]} onCreate={onCreate} onClose={() => undefined} />,
  );

describe('28.153 Save as draft', () => {
  it('28.153 sits in the footer, sends draft: true, and the switch is ON and disabled while it saves', async () => {
    let settle!: () => void;
    const onCreate = vi.fn((_draft: NewTicketDraft) => new Promise<void>((resolve) => { settle = resolve; }));
    renderWith(onCreate);
    const save = screen.getByRole('button', { name: 'Save as draft' });
    expect(save.closest('.gn-dialog__footer')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Create ticket' }).closest('.gn-dialog__footer')).not.toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Pave the lane');
    // The switch opens ON (`DEFAULT_BIRTH_START` is 'backlog', `preferences/new-ticket-start.ts:73`), so a
    // "checked while saving" leg proves nothing unless the person has turned it OFF first.
    const backlog = screen.getByLabelText('Starts in the backlog?');
    await user.click(backlog);
    expect(backlog).not.toBeChecked();
    // The control: the ordinary button sends no draft member (and is tested first, on a fresh dialog, below).
    await user.click(save);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ draft: true, title: 'Pave the lane', start: 'backlog' });
    expect(backlog).toBeChecked();
    expect(backlog).toBeDisabled();
    await act(async () => { settle(); });
    expect(backlog).toBeEnabled();
    expect(backlog).not.toBeChecked(); // "as it was": the person's OFF, not the draft's forced ON
  });
  it('28.153 Create ticket sends no draft member', async () => {
    const onCreate = vi.fn();
    renderWith(onCreate);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Pave the lane');
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect('draft' in onCreate.mock.calls[0]![0]).toBe(false);
  });
});

describe('28.154 one submit', () => {
  it('28.154 both buttons share the guard and the hint', async () => {
    const onCreate = vi.fn((_draft: NewTicketDraft) => new Promise<void>(() => undefined));
    renderWith(onCreate);
    const user = userEvent.setup();
    const save = screen.getByRole('button', { name: 'Save as draft' });
    const create = screen.getByRole('button', { name: 'Create ticket' });
    const hint = screen.getByText('Add a title to create the ticket');
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-describedby', hint.id);
    expect(create).toHaveAttribute('aria-describedby', hint.id);
    await user.type(screen.getByLabelText('Title'), 'Pave the lane');
    expect(save).toBeEnabled();
    fireEvent.click(save);
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ draft: true });
  });
  it('28.154 the other order: Create first, then Save as draft in the same tick, still one call', async () => {
    // Each order has its own mutant: with the ref check gone, Save-first reds only if Create's `disabled` lacks
    // `submitting`, and Create-first reds only if Save's does (see Kills).
    const onCreate = vi.fn((_draft: NewTicketDraft) => new Promise<void>(() => undefined));
    renderWith(onCreate);
    await userEvent.setup().type(screen.getByLabelText('Title'), 'Pave the lane');
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect('draft' in onCreate.mock.calls[0]![0]).toBe(false);
  });
});
