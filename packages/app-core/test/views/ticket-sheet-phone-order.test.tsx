import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketRead } from '../../src/view-types.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

/**
 * UX fixes Task 7, case 23.125 (audit BRD-12): on a phone the sheet opens on its FIELDS (State, Assignee, Priority)
 * and the description editor waits behind "Add a description" / "Edit description" until it is tapped. Above the
 * phone width nothing moves. The sheet's phone arm is the same 40rem as the board's, so `PHONE_BOARD_QUERY` is the
 * one query stubbed here.
 */
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

function viewport(phone: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_BOARD_QUERY ? phone : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the laminate is peeling' }] }] };

/** A composer that says whether it is editable, so "collapsed" and "tapped" are observable without Tiptap. */
const slot: EditorSlotComponent = (props) => (
  <div data-testid="description-editor" data-readonly={String(props.readOnly === true)}>
    {props.readOnly === true ? 'read-only description' : 'editable description'}
  </div>
);

function read(withDescription: boolean): TicketRead {
  const base = ticketStateSeed();
  return {
    ticket: withDescription
      ? { ...base, fields: { ...base.fields, description: { value: DOC, claim: claim() } } }
      : base,
    title: 'File the GST return',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: 'CCSO-1183',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  } as TicketRead;
}

async function renderSheet(ticket: TicketRead, withEditor = true): Promise<void> {
  const source = createFakeDataSource({
    getTicket: async () => ticket,
    getWorkflowDef: async () => WF_ERRAND,
    getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
    getTicketHistory: async () => [],
    getTickets: async (projectId) => ({ projectId, rows: [] }),
    getTicketTypes: async () => [{ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] }],
  });
  render(
    <TicketSheet
      dataSource={source}
      workspaceId={WS}
      ticketId={TICKET}
      currentUserId="user_kiro"
      onClose={vi.fn()}
      {...(withEditor ? { editorSlot: slot } : {})}
    />,
  );
  await waitFor(() => expect(screen.getByTestId('field-state')).toBeInTheDocument());
}

const fields = (): HTMLElement => document.querySelector<HTMLElement>('.gn-ticket-sheet__fields') as HTMLElement;
const description = (): HTMLElement => screen.getByTestId('field-description');
const editor = (): HTMLElement => within(description()).getByTestId('description-editor');
const queryEditor = (): HTMLElement | null => within(description()).queryByTestId('description-editor');
const fieldsFirst = (): boolean => (description().compareDocumentPosition(fields()) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;

describe('23.125 the phone ticket sheet opens on its fields', () => {
  it('23.125 on a phone the fields list comes BEFORE the description, and the editor is not mounted until "Add a description" is tapped', async () => {
    viewport(true);
    const user = userEvent.setup();
    await renderSheet(read(false));
    expect(fieldsFirst()).toBe(true);
    expect(queryEditor()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add a description' }));
    expect(editor()).toHaveAttribute('data-readonly', 'false');
    expect(screen.queryByRole('button', { name: 'Add a description' })).toBeNull();
  });

  it('23.125 with a description already there the button reads "Edit description", the text stays visible read-only, and tapping makes it editable', async () => {
    viewport(true);
    const user = userEvent.setup();
    await renderSheet(read(true));
    expect(editor()).toHaveAttribute('data-readonly', 'true');
    await user.click(screen.getByRole('button', { name: 'Edit description' }));
    expect(editor()).toHaveAttribute('data-readonly', 'false');
  });

  it('23.125 a sheet with no editor wired (read-only) offers no button on a phone, and still reads fields first', async () => {
    viewport(true);
    await renderSheet(read(false), false);
    expect(screen.queryByRole('button', { name: /description/i })).toBeNull();
    expect(fieldsFirst()).toBe(true);
  });

  it('23.125 CONTROL — above the phone width the description is first, its editor is mounted, and there is no toggle', async () => {
    viewport(false);
    await renderSheet(read(false));
    expect(fieldsFirst()).toBe(false);
    expect(editor()).toHaveAttribute('data-readonly', 'false');
    expect(screen.queryByRole('button', { name: 'Add a description' })).toBeNull();
  });
});
