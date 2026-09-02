import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import {
  TransitionDialog,
  transitionOptions,
  type TransitionDialogProps,
} from '../../src/views/transition-dialog.js';
import { WF_ERRAND } from '../helpers/seed.js';

describe('transitionOptions — only transitions the definition declares', () => {
  it('offers declared targets from the current state (from-state or *), excluding self', () => {
    expect(transitionOptions(WF_ERRAND, 'doing').map((option) => option.toStateId)).toEqual([
      'todo',
      'waiting',
      'done',
    ]);
    expect(transitionOptions(WF_ERRAND, 'todo').map((option) => option.toStateId)).toEqual(['doing']);
  });

  it("carries each transition's declared rules", () => {
    const done = transitionOptions(WF_ERRAND, 'doing').find((option) => option.toStateId === 'done');
    expect(done?.rules).toEqual([{ kind: 'require-comment' }]);
  });

  it('PLANTED DEFECT: the wildcard edge is offered from everywhere EXCEPT the state it points at', () => {
    // `* → todo` is reachable from doing, waiting and done. Offering it from
    // `todo` itself would put a move on screen that changes nothing and that
    // the engine has no edge for.
    expect(transitionOptions(WF_ERRAND, 'waiting').map((o) => o.toStateId)).toEqual(['todo', 'doing']);
    expect(transitionOptions(WF_ERRAND, 'done').map((o) => o.toStateId)).toEqual(['todo', 'doing']);
    expect(transitionOptions(WF_ERRAND, 'todo').map((o) => o.toStateId)).not.toContain('todo');
  });

  it('PLANTED DEFECT: a target the states list does not declare is dropped, not rendered as a bare id', () => {
    const dangling: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [...WF_ERRAND.transitions, { from: 'doing', to: 'archived', rules: [] }],
    };
    expect(transitionOptions(dangling, 'doing').map((o) => o.toStateId)).toEqual([
      'todo',
      'waiting',
      'done',
    ]);
    expect(transitionOptions(dangling, 'doing').map((o) => o.name)).toEqual([
      'To do',
      'Waiting on counterparty',
      'Done',
    ]);
  });

  it('PLANTED DEFECT: a target reachable twice keeps the FIRST edge’s rules, never a merged set', () => {
    // Merging two edges' rules would prompt for something no single declared
    // transition asks for.
    const twice: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [
        { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
        { from: '*', to: 'done', rules: [{ kind: 'require-evidence' }] },
      ],
    };
    const options = transitionOptions(twice, 'doing');
    expect(options).toHaveLength(1);
    expect(options[0]?.rules).toEqual([{ kind: 'require-comment' }]);
  });
});

function renderDialog(overrides: Partial<TransitionDialogProps> = {}) {
  const onSubmit = vi.fn();
  render(
    <TransitionDialog
      open
      workflow={WF_ERRAND}
      fromStateId="doing"
      ticketFields={{}}
      onClose={vi.fn()}
      onSubmit={onSubmit}
      precheck={async () => ({ kind: 'passed' })}
      serverRefusal={null}
      {...overrides}
    />,
  );
  return onSubmit;
}

describe('TransitionDialog — prompts driven by the workflow definition', () => {
  it('requires a comment when the chosen transition declares require-comment', async () => {
    const user = userEvent.setup();
    const onSubmit = renderDialog();
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    expect(screen.getByLabelText('Comment (required by this transition)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('Comment (required by this transition)'),
      'filed at the portal',
    );
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(onSubmit).toHaveBeenCalledWith({
      toStateId: 'done',
      comment: 'filed at the portal',
      fieldValues: {},
    });
  });

  it('PLANTED DEFECT: a transition with NO comment rule is offered no comment box', async () => {
    // The prompts are the workflow's, not the dialog's. A comment box that
    // always appeared would collect text no rule asked for and no payload
    // carries.
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(screen.getByLabelText('Move to'), 'waiting');
    expect(screen.queryByLabelText('Comment (required by this transition)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();
  });

  it('shows the instant pre-check refusal with the rule named', async () => {
    const user = userEvent.setup();
    renderDialog({
      precheck: async () => ({
        kind: 'refused',
        rule: 'require-different-user',
        reason: 'Whoever moved this to Doing cannot also close it.',
      }),
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    const preview = await screen.findByText(/instant check/);
    expect(preview).toHaveTextContent('require-different-user');
    expect(preview).toHaveTextContent('Whoever moved this to Doing cannot also close it.');
  });

  it('PLANTED DEFECT: the pre-check is asked about the state the user CHOSE, and a passed one shows no box', async () => {
    const user = userEvent.setup();
    const asked: string[] = [];
    renderDialog({
      precheck: async (toStateId) => {
        asked.push(toStateId);
        return { kind: 'passed' };
      },
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'waiting');
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    expect(asked).toEqual(['waiting', 'done']);
    // A pre-check that passed says nothing: it is not a promise of acceptance,
    // and printing "looks fine" would make it one.
    expect(document.querySelector('.gn-refusal--preview')).toBeNull();
  });

  it('PLANTED DEFECT: the server refusal renders VERBATIM and outranks a passing pre-check', async () => {
    const user = userEvent.setup();
    renderDialog({
      serverRefusal: {
        rule: 'restrict-to',
        reason: 'Only Anselma Marak may perform "Doing → Done" on this ticket.',
      },
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    const serverBox = screen.getByRole('alert');
    expect(serverBox).toHaveTextContent('Refused by the server — restrict-to');
    expect(serverBox).toHaveTextContent(
      'Only Anselma Marak may perform "Doing → Done" on this ticket.',
    );
  });

  it('PLANTED DEFECT: a disagreeing pre-check is not rewritten to agree with the server', async () => {
    // Two refusals, two authorities, two sets of words. Paraphrasing either
    // into the other tells the user a second story about why their claim did
    // not land.
    const user = userEvent.setup();
    renderDialog({
      precheck: async () => ({
        kind: 'refused',
        rule: 'require-different-user',
        reason: 'Whoever moved this to Doing cannot also close it.',
      }),
      serverRefusal: {
        rule: 'restrict-to',
        reason: 'Only Anselma Marak may perform "Doing → Done" on this ticket.',
      },
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    const preview = await screen.findByText(/instant check/);
    expect(preview).toHaveTextContent('require-different-user');
    expect(screen.getByRole('alert')).toHaveTextContent('restrict-to');
    expect(screen.getByRole('alert')).not.toHaveTextContent('require-different-user');
  });

  it('explains an unavailable evidence upload honestly and keeps the move disabled', async () => {
    const user = userEvent.setup();
    renderDialog({
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
        ),
      },
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    expect(
      screen.getByText(
        'This transition requires an attachment as evidence. Evidence upload is not available in this build yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('PLANTED DEFECT: a build that CAN upload evidence offers the control and unblocks only after one lands', async () => {
    const user = userEvent.setup();
    const onSubmit = renderDialog({
      uploadEvidence: async () => ({ attachmentId: '01J9GATA000000000000000000' }),
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
        ),
      },
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    expect(screen.queryByText(/Evidence upload is not available/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    await user.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(onSubmit).toHaveBeenCalledWith({
      toStateId: 'done',
      evidenceAttachmentId: '01J9GATA000000000000000000',
      fieldValues: {},
    });
  });

  it('prompts for a required field and hands its value back for a field_set claim', async () => {
    const user = userEvent.setup();
    const onSubmit = renderDialog({
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'doing' && transition.from === 'todo'
            ? { ...transition, rules: [{ kind: 'require-field', field: 'dueDate' }] }
            : transition,
        ),
      },
      fromStateId: 'todo',
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'doing');
    expect(screen.getByLabelText('dueDate (required before this transition)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('dueDate (required before this transition)'),
      '2026-08-30',
    );
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(onSubmit).toHaveBeenCalledWith({
      toStateId: 'doing',
      fieldValues: { dueDate: '2026-08-30' },
    });
  });

  it('PLANTED DEFECT: a required field the ticket ALREADY carries is not re-asked', async () => {
    // `require-field` asks whether the field has a value, and the ticket's own
    // claim answers that. Prompting anyway would make the user restate a claim
    // somebody already made, under their own name and clock.
    const user = userEvent.setup();
    const onSubmit = renderDialog({
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'doing' && transition.from === 'todo'
            ? { ...transition, rules: [{ kind: 'require-field', field: 'dueDate' }] }
            : transition,
        ),
      },
      fromStateId: 'todo',
      ticketFields: {
        dueDate: {
          value: { date: '2026-08-30' },
          actorId: 'user_kiro',
          clientTime: '2026-08-18T08:05:00.000Z',
          serverTime: '2026-08-18T08:05:01.000Z',
        },
      },
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'doing');
    expect(screen.queryByLabelText('dueDate (required before this transition)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    // Nothing new was claimed, so no field claim is proposed.
    expect(onSubmit).toHaveBeenCalledWith({ toStateId: 'doing', fieldValues: {} });
  });

  it('PLANTED DEFECT: rules only the server can settle are NAMED, not silently passed', async () => {
    const user = userEvent.setup();
    renderDialog({
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'done'
            ? {
                ...transition,
                rules: [{ kind: 'restrict-to', assignee: true }],
              }
            : transition,
        ),
      },
    });
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
    expect(
      screen.getByText(/This transition carries restrict-to rules — the server decides/),
    ).toBeInTheDocument();
  });

  it('renders nothing at all when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByLabelText('Move to')).toBeNull();
  });
});
