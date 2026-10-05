import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import {
  TransitionDialog,
  transitionOptions,
  type TransitionDialogProps,
} from '../../src/views/transition-dialog.js';
import { WF_ERRAND } from '../helpers/seed.js';

describe('3.71 transitionOptions — what the definition declares plus the universal Backlog edges, never an invented move', () => {
  /**
   * Since 2026-09-17 (backlog/closed spec §4) every non-terminal state also
   * offers the universal Send-to-backlog edge, LAST — see 13.582 below for
   * the dedicated coverage. This test's own targets grew a trailing
   * `'backlog'` for that reason: `doing` and `todo` are both non-terminal.
   */
  it('offers declared targets from the current state (from-state or *), excluding self', () => {
    expect(transitionOptions(WF_ERRAND, 'doing').map((option) => option.toStateId)).toEqual([
      'todo',
      'waiting',
      'done',
      'backlog',
    ]);
    expect(transitionOptions(WF_ERRAND, 'todo').map((option) => option.toStateId)).toEqual([
      'doing',
      'backlog',
    ]);
  });

  it("carries each transition's declared rules", () => {
    const done = transitionOptions(WF_ERRAND, 'doing').find((option) => option.toStateId === 'done');
    expect(done?.rules).toEqual([{ kind: 'require-comment' }]);
  });

  it('PLANTED DEFECT: the wildcard edge is offered from everywhere EXCEPT the state it points at', () => {
    // `* → todo` is reachable from doing, waiting and done. Offering it from
    // `todo` itself would put a move on screen that changes nothing and that
    // the engine has no edge for. `waiting` is non-terminal (gains Backlog);
    // `done` is terminal (does not — a finished ticket cannot be parked).
    expect(transitionOptions(WF_ERRAND, 'waiting').map((o) => o.toStateId)).toEqual([
      'todo',
      'doing',
      'backlog',
    ]);
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
      'backlog',
    ]);
    expect(transitionOptions(dangling, 'doing').map((o) => o.name)).toEqual([
      'To do',
      'Waiting on counterparty',
      'Done',
      'Backlog',
    ]);
  });

  it('PLANTED DEFECT: a target reachable twice is never a MERGED rule set', () => {
    // Merging two edges' rules would prompt for something no single declared
    // transition asks for.
    //
    // NOTE ON WHAT THIS CASE DOES *NOT* PROVE. It declares the EXACT edge
    // first, so it answers `require-comment` under first-declaration-wins AND
    // under exact-wins alike — it cannot tell those two implementations apart,
    // and it used to be titled as though it could ("keeps the FIRST edge's
    // rules"). The divergence between them is pinned by 3.149 below, which
    // declares the wildcard first. This case is kept because "never merged" is
    // a real property and still true; it is simply a weaker one than its old
    // name claimed.
    //
    // `twice` REPLACES `WF_ERRAND.transitions` wholesale — 'doing' stays
    // non-terminal on `WF_ERRAND.states`, so the universal Send-to-backlog
    // edge still applies and 'done' is not the only target (since 2026-09-17).
    const twice: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [
        { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
        { from: '*', to: 'done', rules: [{ kind: 'require-evidence' }] },
      ],
    };
    const options = transitionOptions(twice, 'doing');
    expect(options).toHaveLength(2);
    expect(options.find((o) => o.toStateId === 'done')?.rules).toEqual([{ kind: 'require-comment' }]);
    expect(options.find((o) => o.toStateId === 'backlog')?.rules).toEqual([]);
  });
});

/**
 * Ruling P27. `transitionOptions` exists to predict the engine, so where a
 * wildcard and an exact edge both reach one target it must resolve them the way
 * the engine does: `find(exact) ?? find('*')`
 * (`packages/rule-engine/src/transition.ts:127-128`), which `precheck.ts`'s
 * `needsMembership` already mirrors at :849-850.
 *
 * It did not. It kept the first matching edge in DECLARATION ORDER, so a
 * definition that happened to declare its wildcard first made the dialog
 * disagree with the engine — and `adviseWorkflowDef` only WARNS about that
 * shape ("real, but not fatal"), so such a definition publishes clean. The
 * user-visible result was a transition offered with no evidence prompt on a
 * move the server then refuses.
 *
 * THE REDDENING MUTATION, and it is site-identifying: restore
 * `if (!targets.has(to)) targets.set(to, transition.rules)` in place of the
 * edge resolution. Case 3.149 answers `[]` and fails; 3.150 and 3.151 stay
 * green. Only the wildcard-first ordering can see the defect, which is exactly
 * why 3.150 has to be here — a single-ordering test would prove the answer is
 * right once, not that it is independent of ordering.
 */
describe('3.149-3.151 wildcard and exact edges resolve the way the ENGINE resolves them (P27)', () => {
  const REQUIRE_EVIDENCE = [{ kind: 'require-evidence' }] as WorkflowDef['transitions'][number]['rules'];

  const defWith = (transitions: WorkflowDef['transitions']): WorkflowDef => ({
    ...WF_ERRAND,
    transitions,
  });

  // Every `defWith(...)` here declares transitions to 'done' ONLY, from
  // 'doing' — but 'doing' stays non-terminal on `WF_ERRAND.states`, so each
  // also carries the universal Send-to-backlog edge (since 2026-09-17) beside
  // the one edge to 'done' these cases are actually about. Asserted by
  // finding 'done' explicitly rather than by `options[0]`, so the extra
  // option cannot silently shift what index is being read.

  it('3.149 wildcard declared FIRST: the EXACT edge still supplies the rules', () => {
    const options = transitionOptions(
      defWith([
        { from: '*', to: 'done', rules: [] },
        { from: 'doing', to: 'done', rules: REQUIRE_EVIDENCE },
      ]),
      'doing',
    );
    expect(options).toHaveLength(2);
    expect(options.find((o) => o.toStateId === 'done')?.rules).toEqual(REQUIRE_EVIDENCE);
  });

  it('3.150 exact declared FIRST: the same answer — the control that makes 3.149 a divergence test', () => {
    // Without this case, 3.149 shows only that one ordering yields the right
    // answer. The pair is what shows the answer does not depend on ordering,
    // which is the actual property the engine has.
    const options = transitionOptions(
      defWith([
        { from: 'doing', to: 'done', rules: REQUIRE_EVIDENCE },
        { from: '*', to: 'done', rules: [] },
      ]),
      'doing',
    );
    expect(options).toHaveLength(2);
    expect(options.find((o) => o.toStateId === 'done')?.rules).toEqual(REQUIRE_EVIDENCE);
  });

  it('3.151 a target reachable ONLY by a wildcard still resolves to the wildcard edge', () => {
    // The regression the fix itself could introduce: preferring the exact edge
    // must not drop targets that have no exact edge to prefer.
    const options = transitionOptions(
      defWith([{ from: '*', to: 'done', rules: REQUIRE_EVIDENCE }]),
      'doing',
    );
    expect(options).toHaveLength(2);
    const done = options.find((o) => o.toStateId === 'done');
    expect(done?.rules).toEqual(REQUIRE_EVIDENCE);
  });
});

/**
 * 13.582 — the universal Backlog edges are offered like declared ones (spec
 * §4, 2026-09-17): Start is the ONLY option from backlog — a controller
 * ruling extending Task 6's brief, because a declared wildcard edge means
 * "from any AUTHORED state" and backlog is universal rather than authored —
 * and Send-to-backlog is appended after every non-terminal state's declared
 * targets, never offered from a terminal one.
 */
describe('13.582 transitionOptions offers the universal Backlog edges like declared ones', () => {
  it('from backlog: exactly the Start edge, with no rules', () => {
    expect(transitionOptions(WF_ERRAND, 'backlog')).toEqual([
      { toStateId: 'todo', name: 'To do', rules: [] },
    ]);
  });

  /**
   * The site-identifying case: a declared `* → done` would, without the
   * backlog-only special case, resolve FROM backlog too (backlog matches a
   * wildcard `from` exactly like any other state). It must not: Start is
   * backlog's only exit.
   */
  it('a declared wildcard-to-done edge never resolves FROM backlog, even though backlog would otherwise match "*"', () => {
    const withWildcardDone: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [...WF_ERRAND.transitions, { from: '*', to: 'done', rules: [] }],
    };
    expect(transitionOptions(withWildcardDone, 'backlog')).toEqual([
      { toStateId: 'todo', name: 'To do', rules: [] },
    ]);
  });

  it('from a non-terminal state: Backlog is appended last, with no rules', () => {
    expect(transitionOptions(WF_ERRAND, 'doing').map((option) => option.toStateId)).toEqual([
      'todo',
      'waiting',
      'done',
      'backlog',
    ]);
    expect(transitionOptions(WF_ERRAND, 'doing').find((option) => option.toStateId === 'backlog')).toEqual({
      toStateId: 'backlog',
      name: 'Backlog',
      rules: [],
    });
  });

  it('from a terminal state: no Backlog option — a finished ticket cannot be parked', () => {
    expect(transitionOptions(WF_ERRAND, 'done').map((option) => option.toStateId)).not.toContain('backlog');
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
      transportError={null}
      {...overrides}
    />,
  );
  return onSubmit;
}

describe('3.72 TransitionDialog — prompts driven by the workflow definition', () => {
  it('requires a comment when the chosen transition declares require-comment', async () => {
    const user = userEvent.setup();
    const onSubmit = renderDialog();
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }),
    );
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }),
    );
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    const serverBox = screen.getByRole('alert');
    expect(serverBox).toHaveTextContent('Refused by the server: restrict-to');
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
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

  /**
   * The two ways an upload FAILS, and why they get different sentences.
   *
   * Neither was reachable before the web gained an uploader — the dialog
   * rendered the dead-end sentence instead and never called one. The moment a
   * real uploader arrives, so does every way it can fail, and the original
   * `void uploadEvidence(file).then(…)` had **no `.catch`**: a refused file
   * left a rejected promise nobody handled and a Move button disabled with no
   * sentence beside it. These two cases pin the split Ruling 27 established
   * for this dialog's other slots.
   */
  it('16.31 evidence attached for ONE move does NOT satisfy a different guarded move', async () => {
    const user = userEvent.setup();
    // TWO guarded moves out of the same state, so switching between them is a
    // real choice a person can make — and the one that would otherwise come up
    // already-satisfied by a file attached for the other.
    renderDialog({
      uploadEvidence: async () => ({ attachmentId: '01J9GATA000000000000000000' }),
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.from === 'doing'
            ? { ...transition, rules: [{ kind: 'require-evidence' }] }
            : transition,
        ),
      },
    });
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled());

    // Now choose the OTHER guarded move. The evidence belonged to the first.
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }),
    );
    // The rule is real and this move has no evidence of its own — so the button
    // must be blocked again. Reachable only once a caller supplied an uploader.
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('16.31 an upload still IN FLIGHT when the destination changes does not re-arm the new move', async () => {
    const user = userEvent.setup();
    let release!: (value: { attachmentId: string }) => void;
    const pending = new Promise<{ attachmentId: string }>((resolve) => {
      release = resolve;
    });
    renderDialog({
      uploadEvidence: () => pending,
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.from === 'doing' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
        ),
      },
    });
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    );

    // Change the destination WHILE the upload is still running. The reset
    // clears the id; the danger is what happens when the upload lands.
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }),
    );

    release({ attachmentId: '01J9GATA000000000000000000' });
    await act(async () => {
      await pending;
    });

    // The move the person is now LOOKING AT has no evidence of its own, so it
    // must still be blocked. Without the attempt token this resolves into the
    // new destination and enables it — with a file attached for the old one.
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('16.31 the instant check re-asks once evidence lands, and stops contradicting the button', async () => {
    const user = userEvent.setup();
    renderDialog({
      uploadEvidence: async () => ({ attachmentId: '01J9GATA000000000000000000' }),
      // The real engine refuses `require-evidence` when the candidate carries
      // no id — so this mirrors it, and the point is that the id now REACHES it.
      precheck: async (_toStateId, evidenceAttachmentId) =>
        evidenceAttachmentId === undefined || evidenceAttachmentId === null
          ? { kind: 'refused', rule: 'require-evidence', reason: 'none was provided' }
          : { kind: 'passed' },
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
        ),
      },
    });
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    expect(await screen.findByText(/instant check: require-evidence/)).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    );

    // A refusal printed beside the control it contradicts is a false statement:
    // the button is enabled and the line still said no file was provided.
    await waitFor(() => expect(screen.queryByText(/instant check/)).toBeNull());
    expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();
  });

  it('16.31 closing and reopening drops the evidence, rather than re-arming it invisibly', async () => {
    const user = userEvent.setup();
    const props = {
      workflow: WF_ERRAND,
      fromStateId: 'doing',
      ticketFields: {},
      onClose: vi.fn(),
      onSubmit: vi.fn(),
      precheck: async () => ({ kind: 'passed' as const }),
      serverRefusal: null,
      transportError: null,
      uploadEvidence: async () => ({ attachmentId: '01J9GATA000000000000000000' }),
    };
    const { rerender } = render(
      <TransitionDialog
        {...props}
        open
        workflow={{
          ...WF_ERRAND,
          transitions: WF_ERRAND.transitions.map((transition) =>
            transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
          ),
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled());

    // Cancel and reopen. The destination survives (pre-existing, deliberate);
    // the EVIDENCE must not — the file input remounts EMPTY, so an armed
    // button would point at a file no longer visible anywhere in the dialog.
    rerender(
      <TransitionDialog
        {...props}
        open={false}
        workflow={{
          ...WF_ERRAND,
          transitions: WF_ERRAND.transitions.map((transition) =>
            transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
          ),
        }}
      />,
    );
    rerender(
      <TransitionDialog
        {...props}
        open
        workflow={{
          ...WF_ERRAND,
          transitions: WF_ERRAND.transitions.map((transition) =>
            transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
          ),
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('16.31 a REFUSED upload says so in the server’s own words, and keeps the move blocked', async () => {
    const user = userEvent.setup();
    renderDialog({
      uploadEvidence: async () => {
        const err = new Error('That file is larger than the 25 MiB ceiling.');
        err.name = 'UploadRefusedError';
        throw err;
      },
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
        ),
      },
    });
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'huge.pdf', { type: 'application/pdf' }),
    );

    // The authority spoke: `--server`'s tone, and its reason carried without
    // paraphrase — never the "could not be uploaded" wording, which would put
    // a dropped connection and a refusal in one sentence.
    expect(
      await screen.findByText(
        'The server would not store that file: That file is larger than the 25 MiB ceiling.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('16.31 an upload that never reached a server says THAT instead, and never claims a verdict', async () => {
    const user = userEvent.setup();
    renderDialog({
      uploadEvidence: async () => {
        throw new TypeError('Failed to fetch');
      },
      workflow: {
        ...WF_ERRAND,
        transitions: WF_ERRAND.transitions.map((transition) =>
          transition.to === 'done' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
        ),
      },
    });
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    await user.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByText('That file could not be uploaded: Failed to fetch')).toBeInTheDocument();
    // Nobody adjudicated, so the sentence must not be the one a verdict wears.
    expect(screen.queryByText(/The server would not store/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
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
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    expect(
      screen.getByText(/This transition carries restrict-to rules. The server decides/),
    ).toBeInTheDocument();
  });

  it('renders nothing at all when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByLabelText('Move to')).toBeNull();
  });

  /**
   * 3.166 — the Move-to control's own migration to the shared `Select`: before any state is picked the trigger shows the custom placeholder "Choose a state" rather than a blank or a stale prior value, preserved explicitly rather than falling back to the component's generic default.
   */
  it('shows "Choose a state" as the trigger placeholder before any state is picked', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /Move to/ })).toHaveTextContent('Choose a state');
  });
});

/**
 * The two props the board's arrows need (owner request, 2026-09-17): the
 * dialog only ever OFFERS what the gesture meant (`›` the forward list, `‹`
 * the backward list, a drop the dropped column), and when that list has
 * exactly one entry the arrow already chose it, so the dialog opens aimed
 * at it rather than on "Choose a state". Both optional — `TicketSheet`'s
 * "Move…" button passes neither and keeps the full list and the placeholder.
 */
describe('TransitionDialog — offerStateIds and initialToStateId', () => {
  /**
   * 13.527 — `offerStateIds` narrows the `<Select>` to that subset, in
   * `transitionOptions`'s own order. From `doing` the full list is
   * `todo, waiting, done`; offering `['waiting', 'done']` must drop `To do`
   * — the negative is the point, a backward state must not appear in a
   * dialog the `›` arrow opened.
   */
  it('offers ONLY the listed states, in declaration order, and drops the rest', async () => {
    const user = userEvent.setup();
    renderDialog({ offerStateIds: ['waiting', 'done'] });
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Waiting on counterparty',
      'Done',
    ]);
    expect(within(listbox).queryByRole('option', { name: 'To do' })).toBeNull();
  });

  /**
   * 13.528 — `initialToStateId` opens the dialog already aimed: the trigger
   * shows the state's NAME rather than the placeholder, and — the part that
   * matters to a person — the rules of that edge are prompted for at once.
   * `doing → done` requires a comment, so the comment box is on screen with
   * no click into the select, and Move is disabled until it is filled.
   */
  it('opens already aimed at initialToStateId, with that edge\'s prompts visible at once', async () => {
    const user = userEvent.setup();
    const onSubmit = renderDialog({ initialToStateId: 'done' });
    expect(screen.getByRole('button', { name: /Move to/ })).toHaveTextContent('Done');
    expect(screen.getByRole('button', { name: /Move to/ })).not.toHaveTextContent('Choose a state');
    expect(screen.getByLabelText('Comment (required by this transition)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    await user.type(screen.getByLabelText('Comment (required by this transition)'), 'shipped');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(onSubmit).toHaveBeenCalledWith({ toStateId: 'done', comment: 'shipped', fieldValues: {} });
  });

  /**
   * 13.528b — the control: neither prop passed keeps today's narrowing
   * behaviour unchanged (the full declared list, not `offerStateIds`'s
   * subset) and the placeholder. The COUNT itself is not "unchanged": it grew
   * from 3 to 4 when 13.582 added the universal Backlog option to every
   * non-terminal state's list, `doing` (this dialog's default `fromStateId`)
   * included.
   */
  it('without either prop, the placeholder is unchanged and the full (now Backlog-inclusive) list is offered', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole('button', { name: /Move to/ })).toHaveTextContent('Choose a state');
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    expect(within(await screen.findByRole('listbox')).getAllByRole('option')).toHaveLength(4);
  });
});
