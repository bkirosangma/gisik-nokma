import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlainTextEditorSlot } from '../../src/views/editor-slot.js';

const TICKET_ID = '01J9GTKA000000000000000000';

describe('PlainTextEditorSlot — the honest read-only default until Plan 7', () => {
  it('renders the plain-text projection of a document', () => {
    render(
      <PlainTextEditorSlot
        mode="description"
        doc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carry the DLT letter' }] }],
        }}
        readOnly
        workspaceId="ws_1"
        ticketId={TICKET_ID}
      />,
    );
    expect(screen.getByText('Carry the DLT letter')).toBeInTheDocument();
  });

  it('renders the placeholder for an empty document — absence, not invention', () => {
    render(
      <PlainTextEditorSlot
        mode="description"
        doc={null}
        readOnly
        workspaceId="ws_1"
        ticketId={TICKET_ID}
        placeholder="No description yet"
      />,
    );
    expect(screen.getByText('No description yet')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: the projection is the DOMAIN renderer, not a local one — a mention renders as @label', () => {
    // `docToPlainText` is amendment 12's ONE renderer, shared with the search
    // projection and notifications. A local `String(doc)` or a naive
    // content-walk passes the paragraph case above and fails here, which is
    // what makes that case a test of the projection rather than of JSX.
    render(
      <PlainTextEditorSlot
        mode="description"
        doc={{
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'ask ' },
                { type: 'mention', attrs: { userId: 'user_anselma', label: 'Anselma Marak' } },
              ],
            },
          ],
        }}
        readOnly
        workspaceId="ws_1"
        ticketId={TICKET_ID}
      />,
    );
    expect(screen.getByText('ask @Anselma Marak')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: a document with text never shows the placeholder — the placeholder is for absence only', () => {
    const { container } = render(
      <PlainTextEditorSlot
        mode="description"
        doc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carry the DLT letter' }] }],
        }}
        readOnly
        workspaceId="ws_1"
        ticketId={TICKET_ID}
        placeholder="No description yet"
      />,
    );
    expect(container.textContent).toBe('Carry the DLT letter');
    expect(container.querySelector('.gn-editor-slot__placeholder')).toBeNull();
  });

  it('needs none of the editor capabilities: a read-only mount supplies no submit, upload or mention resolver', () => {
    // The optional props exist for Plan 7's Tiptap slot. This default must never
    // require them — the sheet renders descriptions long before the editor lands.
    // The mount below is also the TYPE-level half of the claim: making any
    // capability required makes this file fail `typecheck`, which is where a
    // type change dies.
    const { container } = render(
      <PlainTextEditorSlot mode="description" doc={null} readOnly workspaceId="ws_1" ticketId="t_1" />,
    );
    expect(container.querySelector('.gn-editor-slot--plain')).not.toBeNull();
  });

  it('composes nothing: the read-only default renders no control a person could type into', () => {
    // The honest half of "read-only default". A build without Plan 7's editor
    // cannot write a comment, and this says so by having no field rather than
    // by offering one that silently discards what is typed.
    const { container } = render(
      <PlainTextEditorSlot mode="comment" doc={null} readOnly workspaceId="ws_1" ticketId="t_1" />,
    );
    expect(container.querySelector('textarea, input, [contenteditable]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});
