import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketEditorSlot } from '../src/editor-slot.js';

/**
 * 25.180 — the slot wrapper draws the skeleton of ITS OWN mode until the editor chunk arrives, then the editor, and a slot mounted after
 * the chunk is in memory draws the editor on its first render (smoothness T10 FIX 1). The wrapper stores a COMPONENT in state, and React
 * calls a bare function given as an initial value or an updater, so the thunks matter: without them a late mount calls the editor as an
 * initializer with no props.
 */

vi.mock('@gisik-nokma/editor', () => ({
  TicketEditorSlot: (props: { mode: string }) => <div data-testid="loaded-editor" data-mode={props.mode} />,
}));

const base = { doc: null, readOnly: false, workspaceId: 'w', ticketId: 't' } as const;

describe('25.180 the editor slot wrapper', () => {
  it('shows the mode-shaped skeleton, then the editor; a later mount shows the editor at once', async () => {
    const first = render(<TicketEditorSlot {...base} mode="comment" />);
    // Before the chunk: the comment skeleton (control: no editor yet), in the comment frame.
    expect(screen.queryByTestId('loaded-editor')).toBeNull();
    expect(first.container.querySelector('.editor-slot.editor-slot--comment')).not.toBeNull();
    expect(await screen.findByTestId('loaded-editor')).toHaveAttribute('data-mode', 'comment');
    first.unmount();

    // The chunk is in memory now: a new slot's FIRST render is the editor, with its own props.
    const late = render(<TicketEditorSlot {...base} mode="description" />);
    expect(screen.getByTestId('loaded-editor')).toHaveAttribute('data-mode', 'description');
    expect(late.container.querySelector('.gn-skeleton-region')).toBeNull();
  });
});
