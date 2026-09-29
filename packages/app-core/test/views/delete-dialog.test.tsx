import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '../../src/submit.js';
import { DeleteDialog, type DeleteDialogProps } from '../../src/views/delete-dialog.js';
import {
  DELETE_NOTE,
  deleteUnreachableLine,
  deletedNotMarkedLine,
  typeNameLabel,
  unansweredLine,
} from '../../src/trash/copy.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';

/** Trash series Plan 4, Task 4. Cases 19.218–19.226 (`test-cases/19-trash.md` §19.22). */

const WS = 'ws_convenience';
const TICKET_ID = 'tkt_gst';
const TICKET_TITLE = 'Delete ticket “File the GST return”?';
const WORKSPACE_TITLE = 'Delete workspace “Convenience Corner”?';

const committed = (event: SubmittedEvent): IngestResult => ({
  status: 'committed',
  eventId: event.id,
  seq: 1,
  serverTime: '2026-09-29T10:00:00.000Z',
});
const refused = (event: SubmittedEvent, reason: string): IngestResult => ({
  status: 'refused',
  eventId: event.id,
  rule: 'lifecycle.state',
  reason,
});

function mount(over: Partial<DeleteDialogProps> = {}, script?: IngestScript) {
  const source = createFakeDataSource({}, script);
  const onCancel = vi.fn();
  const onDeleted = vi.fn();
  render(
    <DeleteDialog
      open
      kind="ticket"
      name="File the GST return"
      workspaceId={WS}
      entityId={TICKET_ID}
      dataSource={source}
      make={makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' })}
      onCancel={onCancel}
      onDeleted={onDeleted}
      {...over}
    />,
  );
  return { source, onCancel, onDeleted };
}

const dialog = (title = TICKET_TITLE) => screen.getByRole('alertdialog', { name: title });
const typesOf = (batches: SubmittedEvent[][]) => batches.map((batch) => batch.map((event) => event.type));

describe('19.218 the dialog names the item, starts with the switch off, and always shows the note', () => {
  it('19.218 title, switch off, note; CONTROL: the note survives the switch', () => {
    mount();
    const switchControl = within(dialog()).getByRole('checkbox', { name: 'Delete permanently' });
    expect(switchControl).not.toBeChecked();
    expect(within(dialog()).getByText(DELETE_NOTE)).toBeInTheDocument();
    expect(dialog()).toHaveAccessibleDescription(DELETE_NOTE);

    fireEvent.click(switchControl);
    expect(switchControl).toBeChecked();
    expect(within(dialog()).getByText(DELETE_NOTE)).toBeInTheDocument();
  });
});

describe('19.281 the switch resolves to "Delete permanently" through aria-labelledby, for every kind', () => {
  it('19.281 ticket, project and workspace dialogs; CONTROL: the named element is the visible switch text', () => {
    const kinds: Array<[Partial<DeleteDialogProps>, string]> = [
      [{}, TICKET_TITLE],
      [{ kind: 'project', name: 'Compressor', entityId: 'prj_1' }, 'Delete project “Compressor”?'],
      [{ kind: 'workspace', name: 'Convenience Corner', workspaceId: 'ws_cc', entityId: 'ws_cc' }, WORKSPACE_TITLE],
    ];
    for (const [over, title] of kinds) {
      mount(over);
      const control = within(dialog(title)).getByRole('checkbox', { name: 'Delete permanently' });
      const labelId = control.getAttribute('aria-labelledby');
      expect(labelId, title).toBeTruthy();
      const target = document.getElementById(labelId ?? '');
      expect(target, title).not.toBeNull();
      expect(target, title).toHaveTextContent(/^Delete permanently$/);
      cleanup();
    }
  });
});

describe('19.219 the confirm reads Delete, or Delete permanently with the switch on', () => {
  it('19.219 the label flips; CONTROL: one confirm at a time', () => {
    mount();
    const soft = within(dialog()).getByRole('button', { name: 'Delete ticket' });
    expect(soft).toHaveTextContent(/^Delete$/);
    expect(soft).toHaveClass('gn-button--danger');

    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Delete permanently' }));
    const hard = within(dialog()).getByRole('button', { name: 'Delete permanently' });
    expect(hard).toHaveTextContent(/^Delete permanently$/);
    expect(within(dialog()).queryByRole('button', { name: 'Delete ticket' })).toBeNull();
  });
});

describe('19.220 one press, one batch — deleted first, then the mark', () => {
  it('19.220 soft and permanent; CONTROL: every event names this ticket in this workspace', async () => {
    const soft = mount();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete ticket' }));
    await waitFor(() => expect(soft.onDeleted).toHaveBeenCalledWith({ permanent: false }));
    expect(typesOf(soft.source.ingested)).toEqual([['ticket.deleted']]);
    cleanup();

    const hard = mount();
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Delete permanently' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(hard.onDeleted).toHaveBeenCalledWith({ permanent: true }));
    expect(typesOf(hard.source.ingested)).toEqual([['ticket.deleted', 'purge.marked']]);
    const batch = hard.source.ingested[0]!;
    expect(
      batch.every(
        (event) =>
          event.workspaceId === WS &&
          event.entity.kind === 'ticket' &&
          event.entity.id === TICKET_ID &&
          JSON.stringify(event.payload) === '{}',
      ),
    ).toBe(true);
  });
});

describe('19.221 Cancel holds the first focus, and Escape cancels', () => {
  it('19.221 focus on Cancel; Escape cancels and sends nothing; CONTROL: Cancel does the same', async () => {
    const first = mount();
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(first.onCancel).toHaveBeenCalledTimes(1);
    expect(first.source.ingested).toHaveLength(0);
    cleanup();

    const second = mount();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(second.onCancel).toHaveBeenCalledTimes(1);
    expect(second.source.ingested).toHaveLength(0);
  });
});

describe('19.222 a refusal is shown inline and nothing typed or chosen is lost', () => {
  it('19.222 the reason, the dialog still open with the name and the switch; CONTROL: a retry sends again', async () => {
    const reason = 'Only the workspace owner can archive, delete or restore a workspace.';
    const { source, onDeleted } = mount(
      { kind: 'workspace', name: 'Convenience Corner', workspaceId: 'ws_cc', entityId: 'ws_cc' },
      (events) => events.map((event) => refused(event, reason)),
    );
    const field = within(dialog(WORKSPACE_TITLE)).getByLabelText(typeNameLabel('Convenience Corner'));
    await userEvent.type(field, 'Convenience Corner');
    await userEvent.click(within(dialog(WORKSPACE_TITLE)).getByRole('checkbox', { name: 'Delete permanently' }));
    await userEvent.click(within(dialog(WORKSPACE_TITLE)).getByRole('button', { name: 'Delete permanently' }));

    const alert = await within(dialog(WORKSPACE_TITLE)).findByRole('alert');
    expect(alert).toHaveTextContent(reason);
    expect(alert).toHaveClass('gn-refusal', 'gn-refusal--server');
    expect(within(dialog(WORKSPACE_TITLE)).getByLabelText(typeNameLabel('Convenience Corner'))).toHaveValue(
      'Convenience Corner',
    );
    expect(within(dialog(WORKSPACE_TITLE)).getByRole('checkbox', { name: 'Delete permanently' })).toBeChecked();
    expect(onDeleted).not.toHaveBeenCalled();

    await userEvent.click(within(dialog(WORKSPACE_TITLE)).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
  });
});

describe('19.223 a double press sends one batch', () => {
  it('19.223 two presses while pending → one ingest; CONTROL: one onDeleted after the answer', async () => {
    let answer: () => void = () => undefined;
    const { source, onDeleted } = mount({}, (events) =>
      new Promise<IngestResult[]>((resolve) => {
        answer = () => resolve(events.map(committed));
      }),
    );
    const confirm = within(dialog()).getByRole('button', { name: 'Delete ticket' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(source.ingested).toHaveLength(1);
    expect(confirm).toBeDisabled();

    await act(async () => answer());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});

describe('19.224 a half-committed batch says which half landed and never resends it', () => {
  it('19.224 deleted-not-marked, Close only, Close reports permanent:false; CONTROL: one batch in total', async () => {
    const reason = 'This ticket is already marked for permanent deletion.';
    const { source, onDeleted } = mount({}, (events) => [committed(events[0]!), refused(events[1]!, reason)]);
    await userEvent.click(within(dialog()).getByRole('checkbox', { name: 'Delete permanently' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete permanently' }));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent(deletedNotMarkedLine('ticket', reason));
    expect(within(dialog()).queryByRole('button', { name: 'Delete permanently' })).toBeNull();
    expect(within(dialog()).queryByRole('button', { name: 'Delete ticket' })).toBeNull();
    const close = within(dialog()).getByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(onDeleted).not.toHaveBeenCalled();

    await userEvent.click(close);
    expect(onDeleted).toHaveBeenCalledWith({ permanent: false });
    expect(source.ingested).toHaveLength(1);
  });
});

describe('19.225 a workspace delete asks for the workspace’s name', () => {
  it('19.225 disabled until typed exactly; CONTROL: a ticket asks for nothing', async () => {
    mount({ kind: 'workspace', name: 'Convenience Corner', workspaceId: 'ws_cc', entityId: 'ws_cc' });
    const confirm = within(dialog(WORKSPACE_TITLE)).getByRole('button', { name: 'Delete workspace' });
    const field = within(dialog(WORKSPACE_TITLE)).getByLabelText(typeNameLabel('Convenience Corner'));
    expect(confirm).toBeDisabled();
    await userEvent.type(field, 'Convenience Corne');
    expect(confirm).toBeDisabled();
    await userEvent.type(field, 'r');
    expect(confirm).toBeEnabled();
    cleanup();

    mount();
    expect(within(dialog()).queryByRole('textbox')).toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Delete ticket' })).toBeEnabled();
  });
});

describe('19.226 a transport failure is not a refusal', () => {
  it('19.226 transport class and sentence, dialog open; CONTROL: a short answer is unanswered', async () => {
    const first = mount({}, () => Promise.reject(new Error('socket hang up')));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete ticket' }));
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent(deleteUnreachableLine('socket hang up'));
    expect(alert).toHaveClass('gn-refusal--transport');
    expect(first.onDeleted).not.toHaveBeenCalled();
    cleanup();

    mount({}, () => []);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete ticket' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(unansweredLine(0, 1));
  });
});
