import { act, fireEvent, render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default export that
// survives `verbatimModuleSyntax`, settled at packages/ui/test/components.test.tsx and repeated
// by board.test.tsx, ticket-list.test.tsx and reopen-flow.test.tsx.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewTicketDialog, defaultRootTypeFor } from '../../src/views/new-ticket-dialog.js';

/**
 * Both pickers in this dialog are the shared searchable `Select`, whose trigger is a real
 * `<input role="combobox">` and whose options exist ONLY while the panel is open, portal-rendered
 * to `document.body` (`packages/ui/src/select/select.tsx`). So an option read must open the panel
 * first and scope itself to the `listbox`, never to the trigger — `within(trigger)` holds no
 * options at all now, and a searchable `Select` has no `HiddenSelect` mirror to fall back on the
 * way this rollout's non-searchable sites do.
 *
 * Mirrors `pickFromSearchableSelect` in `../ticket-types/ticket-types.test.tsx`, the pattern this
 * repo already settled for the shared Select's searchable mode.
 */
async function openPicker(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<HTMLElement> {
  await user.click(screen.getByLabelText(name));
  return screen.findByRole('listbox');
}

/**
 * ## 3.157 — THE DIALOG MUST NEVER SUBMIT A PARENT IT HAS STOPPED SHOWING
 *
 * `parentCandidatesUnavailable` arrived with a docblock promising that when it is set
 * *"the picker is replaced by this reason and the draft leaves with `parentId: null`"*,
 * and **nothing anywhere asserted it** — the prop appeared in zero tests, which is
 * exactly why the defect below shipped green.
 *
 * Hiding a control does not clear the state behind it. `parentId` is a `useState` that
 * survives every render, and the prop can arrive AFTER a selection: on the project page
 * the list answers, the user picks a parent, and a later read fails. The picker is then
 * replaced by *"This ticket will be created at project root"* — while `onCreate` still
 * carried the id chosen before.
 *
 * **The draft is asserted, not the sentence.** The sentence was already correct; it was
 * the payload that contradicted it, so a case reading the screen would have passed
 * against the defect.
 *
 * Tested here rather than through the page because this is the component's own
 * invariant — it must hold for every caller, not only for the one that exists today.
 */
/**
 * 12.388 — A NARROWED PARENT PICKER SAYS SO, INSIDE THE MODAL.
 *
 * `parentCandidates` is built from `list.rows`, which became filter-dependent when the
 * list gained a narrowing control. So ticking *Only tickets in progress* silently
 * removes every done ticket from the parent picker — and a user who wants to file a
 * sub-task under a finished ticket finds it absent with nothing saying why.
 *
 * **The claim is the same one this component already refuses, one notch quieter.** An
 * EMPTY picker asserts *this project has no possible parent*; a NARROWED picker asserts
 * *these are the tickets that could be a parent*. Both are claims about the world made
 * from what the caller happened to see, and both are made inside a modal — where, as
 * this file's sibling case puts it, a sentence rendered on the page behind cannot be
 * read. The page's own `list-filter-note` is exactly such a sentence.
 *
 * Kept separate from `parentCandidatesUnavailable` because the facts differ: there the
 * list could not be shown at all and creation falls back to project root; here it was
 * shown, narrowly, and every offered option is real.
 */
describe('12.388 a narrowed parent picker names its narrowing', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3 }];
  const CANDIDATES = [
    { id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign', inFocus: false },
  ];

  it('the reason is beside the picker, and the picker still works', async () => {
    const user = userEvent.setup();
    render(
      <NewTicketDialog
        open
        typeOptions={TYPES}
        parentCandidates={CANDIDATES}
        parentCandidatesNarrowing="tickets in progress"
        onCreate={vi.fn()}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId('parent-narrowing')).toHaveTextContent(
      'showing only tickets in progress — a ticket outside that is not offered here',
    );
    // The note's placement, pinned STRUCTURALLY rather than through a side effect.
    //
    // It used to be enforced for free: the picker was a bare `<select>` whose accessible name came
    // from its wrapping `<label>`'s TEXT, so a sentence moved inside that label was absorbed into
    // the name and `getByLabelText('Parent')` stopped resolving — this case went red with "Unable
    // to find a label with the text of: Parent". The shared-Select migration ended that. `Select`
    // carries an explicit `aria-label="Parent"`, which WINS over the wrapping label's text, so the
    // accessible name is now correct no matter where this span sits. That is the outcome the
    // migration wanted, but it silently retired the only thing that PROVED the placement — move
    // the span back inside the label today and every other assertion here stays green.
    //
    // So the placement is asserted directly. `.closest('label')` walks up from the span and must
    // find nothing, which is exactly the claim the component's own comment makes.
    expect(screen.getByTestId('parent-narrowing').closest('label')).toBeNull();
    // The picker is still a picker: this is a DISCLOSURE, not the withholding that
    // `parentCandidatesUnavailable` does. Without this the case would pass against a
    // dialog that replaced the control, which is a different and wrong behaviour.
    //
    // Still 2, NOT 3, after the shared-Select migration: the count was always
    // "None (project root)" + the one narrowed candidate, and the synthetic
    // `{ value: '', label: 'None (project root)' }` option replaces the hand-written
    // `<option value="">` one-for-one rather than adding to it.
    expect(within(await openPicker(user, 'Parent')).getAllByRole('option')).toHaveLength(2);
  });

  it('CONTROL: unnarrowed, no such claim is made', async () => {
    const user = userEvent.setup();
    render(
      <NewTicketDialog
        open
        typeOptions={TYPES}
        parentCandidates={CANDIDATES}
        onCreate={vi.fn()}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByTestId('parent-narrowing')).not.toBeInTheDocument();
    expect(within(await openPicker(user, 'Parent')).getAllByRole('option')).toHaveLength(2);
  });
});

describe('3.157 the dialog never submits a parent it has stopped showing', () => {
  // Ranks as the workspace's own ladder carries them (E5-16): `NewTicketDialog`
  // no longer takes `typeOptions[0]` as its default, and this block's
  // assertions all expect `typeId: 'task'` — so the fixture has to say which of
  // these two is the everyday type rather than leaving it to list order.
  const TYPES = [
    { id: 'epic', name: 'Epic', rank: 1 },
    { id: 'task', name: 'Task', rank: 3 },
  ];
  // `inFocus: false`: this describe block is about the WITHHELD-parent
  // invariant, not the checkbox, so the candidate stays one that never shows
  // it — every `onCreate` assertion below can then keep asserting a plain
  // `start: 'backlog'` without a checkbox interaction in the way.
  const CANDIDATES = [
    { id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign', inFocus: false },
  ];

  const draftFrom = async (
    user: ReturnType<typeof userEvent.setup>,
    unavailableAfterPick: string | undefined,
  ) => {
    const onCreate = vi.fn();
    const props = {
      open: true,
      typeOptions: TYPES,
      parentCandidates: CANDIDATES,
      onCreate,
      onClose: () => undefined,
    };
    const { rerender } = render(<NewTicketDialog {...props} />);

    // The picker must really be there to be picked from. A case that started in the
    // withheld state could never build the state this defect needs.
    //
    // Title stays on `fireEvent.change` — it is still a plain `<input>`, and this case is
    // about the PARENT's surviving state, so its churn is kept to the control that moved.
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    // The parent pick is now a REAL interaction, and it has to be. `fireEvent.change` against
    // the searchable Select's combobox `<input>` sets the FILTER TEXT and selects nothing —
    // MEASURED during this migration: the input's value became the raw ULID
    // "01J9TICKET00000000000000EP" while `parentId` stayed `''`. That left the first case
    // below passing for the wrong reason (it expects `parentId: null`, which an unpicked
    // parent also produces), i.e. a case that could no longer fail. Clicking the option is
    // what makes the state this defect needs actually exist.
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', {
        name: 'Rewire the shop sign',
      }),
    );

    // The parent list goes away underneath the OPEN dialog, which is the transition.
    rerender(
      <NewTicketDialog
        {...props}
        {...(unavailableAfterPick === undefined
          ? {}
          : { parentCandidatesUnavailable: unavailableAfterPick })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    return onCreate;
  };

  it('a parent chosen BEFORE the picker was withheld does not reach the draft', async () => {
    const user = userEvent.setup();
    const onCreate = await draftFrom(user, 'HTTP 500 for /v1/projects/p1/tickets');

    // The picker is gone and the reason stands in its place...
    //
    // Was `queryByLabelText('Parent')?.tagName).not.toBe('SELECT')`. That spelling could not
    // survive this migration honestly: post-migration NOTHING in this dialog is ever a
    // `<select>` tag, so it would read green in BOTH states — present and withheld — which is
    // the same shape as the "null for opposite reasons" assertion this file's sibling case in
    // `apps/web/test/project-create-gate.test.tsx` documents at length. Named on the control
    // itself instead: the withheld arm renders no combobox called "Parent" at all, and the
    // CONTROL below is the paired positive proving this query DOES find one when it is there.
    expect(screen.queryByRole('combobox', { name: 'Parent' })).toBeNull();
    expect(
      screen.getByText(/the list of tickets that could be a parent cannot be shown/),
    ).toBeInTheDocument();

    // ...and the draft agrees with it. Printed whole rather than asserted field by
    // field, so a failure shows which parent went out instead of only that one did.
    //
    // `typeId` is the dialog's own default and NOT this case's subject — it read
    // `'epic'` while the default was `typeOptions[0]`, which is the E5-16 defect
    // itself, and the fixture's ranks now make it the everyday type. The case
    // below is about the PARENT; that value is carried so the printout stays
    // whole.
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
    });
  });

  it('CONTROL: with the picker still shown, the SAME interaction keeps the chosen parent', async () => {
    // Without this the case above passes against a dialog that drops every parent it
    // is ever given — which would satisfy "never submits a withheld parent" by never
    // submitting a parent at all. It is also what proves the `queryByRole('combobox',
    // { name: 'Parent' })` check above can FIND a picker, so its `toBeNull()` sibling is a
    // real absence rather than a query that never matches anything.
    const user = userEvent.setup();
    const onCreate = await draftFrom(user, undefined);
    expect(screen.getByRole('combobox', { name: 'Parent' })).toBeInTheDocument();
    expect(within(await openPicker(user, 'Parent')).getAllByRole('option')).toHaveLength(2);
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: '01J9TICKET00000000000000EP',
      start: 'backlog',
    });
  });
});

/**
 * "NONE (PROJECT ROOT)" IS A CHOICE, NOT AN EMPTY BOX.
 *
 * `parentId` is `useState('')`, and `''` here is NOT this rollout's usual "nothing chosen yet"
 * sentinel — it is a real, permanently offered option meaning *create this at project root*.
 * The distinction had no test of its own: the native `<select>` rendered
 * `<option value="">None (project root)</option>` and showed it for free, so the behaviour was
 * real but unpinned, and nothing would have caught its loss.
 *
 * It can be lost in one keystroke. Handing the shared `Select` the `value={x === '' ? null : x}`
 * translation every OTHER site in this rollout uses would make `''` mean "no selection", and the
 * trigger would render the generic "Select…" placeholder — the sentence "None (project root)"
 * silently deleted from the screen, and the un-nest path below made unreachable, while every
 * existing case above stayed green (they either pick a real parent or withhold the picker
 * entirely; none of them look at what the picker says when untouched).
 *
 * Both halves are asserted because they fail independently: the LABEL is what the user reads,
 * and the `''` → `null` translation at the submit boundary is what the payload carries.
 */
describe('3.164–3.165 the parent picker offers project root as a real, selectable option', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3 }];
  const CANDIDATES = [
    { id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign', inFocus: false },
  ];

  const renderDialog = () => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        open
        typeOptions={TYPES}
        parentCandidates={CANDIDATES}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    return onCreate;
  };

  it('3.164 reads "None (project root)" before anything is picked, and submits it as null', async () => {
    const onCreate = renderDialog();
    // The untouched picker NAMES project root rather than sitting empty or reading "Select…".
    expect(screen.getByRole('combobox', { name: 'Parent' })).toHaveValue('None (project root)');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // `''` becomes `null` at the submit boundary — `ticketCreatedPayload` types `parentId` as a
    // nullable ULID and `''` is neither, which is why the translation lives there and not in
    // the control's own value.
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
    });
  });

  it('3.165 can be chosen BACK after a parent was picked, which is how a ticket un-nests', async () => {
    // The half a placeholder cannot do. A placeholder is not selectable, so if `''` were
    // handed over as `null` there would be no row to click here and a user who picked a parent
    // by mistake could never return the ticket to project root without reopening the dialog.
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', {
        name: 'Rewire the shop sign',
      }),
    );
    expect(screen.getByRole('combobox', { name: 'Parent' })).toHaveValue('Rewire the shop sign');

    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', {
        name: 'None (project root)',
      }),
    );
    expect(screen.getByRole('combobox', { name: 'Parent' })).toHaveValue('None (project root)');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
    });
  });
});

/**
 * 13.591 — NEW TICKETS ARE BORN IN THE BACKLOG (backlog/closed spec §5.4,
 * 2026-09-17), with one exception: a child of a parent that is itself in
 * focus may start there too, by explicit, undoable choice.
 *
 * Two candidates, told apart only by `inFocus` — the caller's own claim about
 * each candidate's live state (this component derives nothing; see
 * `NewTicketDialogProps.parentCandidates`'s own docblock). The checkbox's
 * EXISTENCE is the thing every case but the first two is really about: it
 * must track the CHOSEN candidate's `inFocus`, not some fixed truth about the
 * dialog, and it must never leave the draft's `start` disagreeing with
 * whether it was ever shown at all.
 */
describe('13.591 new tickets are born in the backlog; a child of an in-focus parent may start there', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3 }];
  const CANDIDATES = [
    { id: 'parent_focus', title: 'In-focus parent', inFocus: true },
    { id: 'parent_backlog', title: 'Backlog parent', inFocus: false },
    // A SECOND in-focus candidate, for 13.591g's switch-between-two-in-focus-
    // parents case (Ruling 40) — every other case in this block ignores it.
    { id: 'parent_focus_2', title: 'Another in-focus parent', inFocus: true },
  ];

  const renderDialog = () => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        open
        typeOptions={TYPES}
        parentCandidates={CANDIDATES}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    return onCreate;
  };

  it('13.591a states "Starts in the backlog" under the title field, unconditionally', () => {
    renderDialog();
    expect(screen.getByText('Starts in the backlog')).toBeInTheDocument();
  });

  it('13.591b with no parent chosen, no checkbox renders and the draft leaves with start: "backlog"', () => {
    const onCreate = renderDialog();
    expect(screen.queryByRole('checkbox', { name: 'Start in focus' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
    });
  });

  it('13.591c choosing an in-focus parent renders "Start in focus" checked, and submits start: "focus"', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'In-focus parent' }),
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Start in focus' });
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_focus',
      start: 'focus',
    });
  });

  it('13.591d unticking "Start in focus" submits start: "backlog" instead', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'In-focus parent' }),
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Start in focus' });
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_focus',
      start: 'backlog',
    });
  });

  it('13.591e choosing a backlog parent renders no checkbox, and the draft leaves with start: "backlog"', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'Backlog parent' }),
    );
    expect(screen.queryByRole('checkbox', { name: 'Start in focus' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_backlog',
      start: 'backlog',
    });
  });

  /**
   * 13.591g (Ruling 40, coordinator, fix round 1, 2026-09-17) — "checked by
   * default" (spec §5.4) is a promise PER CHOSEN PARENT. Untick the box for
   * in-focus parent A, then pick a DIFFERENT in-focus parent B: B's own box
   * must render checked on ITS first appearance, not inherit A's untick.
   * Named `g` rather than reusing `a` — the coordinator's fix-round message
   * named this case 13.591a, but that id already covers this file's own
   * "states the note unconditionally" case (a distinct, already-cited
   * behaviour); reusing one id for two unrelated assertions in the same file
   * would violate the "never let one checkmark cover two different things"
   * convention this catalogue otherwise holds to, so this continues the
   * block's own lettering instead — `f` is `apps/web/test/project-create-
   * gate.test.tsx`'s case, a different file's next free letter, not this
   * one's.
   */
  it('13.591g unticking the checkbox for one in-focus parent, then switching to a DIFFERENT in-focus parent, renders the new parent\'s box CHECKED', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'In-focus parent' }),
    );
    const checkboxA = screen.getByRole('checkbox', { name: 'Start in focus' });
    expect(checkboxA).toBeChecked();
    await user.click(checkboxA);
    expect(checkboxA).not.toBeChecked();

    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'Another in-focus parent' }),
    );
    const checkboxB = screen.getByRole('checkbox', { name: 'Start in focus' });
    expect(checkboxB).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_focus_2',
      start: 'focus',
    });
  });
});

/**
 * 3.187 (V10) — THE CREATE CONTROL HAD NO RE-ENTRANCY GUARD OF ANY KIND.
 *
 * `disabled` carried the title/type gates and nothing else, and the dialog held
 * no in-flight latch, so a second press was not even a race. The call reaches
 * `create-ticket-flow.tsx`, which mints `entity: { kind: 'ticket', id: newUlid() }`
 * PER CALL: two presses are two distinct `ticket.created` events with two
 * distinct ids — two tickets, in an append-only ledger.
 *
 * The repository had already measured this exact failure one package away. The
 * composer's own docblock
 * (`packages/editor/src/components/TicketEditorSlot.tsx:128-136`) records that
 * render state is USELESS as a guard, because two clicks in one React batch both
 * read the same pre-commit `false`; `submittingRef` is set SYNCHRONOUSLY inside
 * the handler, before the first await, which is the only place a second click in
 * the same tick can be seen. This is that shape, on the product's primary
 * creation control.
 */
describe('V10 the Create control cannot file two tickets from two presses', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3 }];

  function slowDialog(): { onCreate: ReturnType<typeof vi.fn>; release: () => void } {
    let release: () => void = () => undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(
      <NewTicketDialog
        open
        typeOptions={TYPES}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'File the GST return' } });
    return { onCreate, release: () => release() };
  }

  it('PLANTED DEFECT: two presses in one commit call onCreate ONCE, and the control states the state', async () => {
    const { onCreate, release } = slowDialog();
    // `HTMLButtonElement` explicitly: the discrimination pin below reads
    // `.disabled` off the live DOM node, which `HTMLElement` does not carry —
    // and vitest is green either way, so the typecheck is the check.
    const create = screen.getByRole<HTMLButtonElement>('button', { name: 'Create' });
    expect(create).toBeEnabled();

    // Two clicks in ONE React batch — the case a committed `disabled` cannot
    // guard, because the attribute is not re-read from the DOM between them.
    let enabledAtSecondClick = false;
    await act(async () => {
      create.click();
      enabledAtSecondClick = !create.disabled;
      create.click();
    });
    // PINS THE DISCRIMINATION. If React ever committed `disabled` between these
    // two statements, the second click would be swallowed by the ATTRIBUTE and
    // this case would keep passing while no longer testing the ref at all.
    expect(enabledAtSecondClick).toBe(true);
    expect(onCreate).toHaveBeenCalledTimes(1);

    // …and while the first one is still in flight the control says so, rather
    // than looking pressable beside a request already on the wire.
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    release();
  });

  it('the guard LIFTS when the create settles, so a refusal does not strand the dialog', async () => {
    const { onCreate, release } = slowDialog();
    await act(async () => {
      screen.getByRole('button', { name: 'Create' }).click();
    });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    // The flow leaves the dialog OPEN on a refusal — nothing landed, nothing is
    // in flight, and the person must be able to press again.
    await act(async () => {
      release();
    });
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    await act(async () => {
      screen.getByRole('button', { name: 'Create' }).click();
    });
    expect(onCreate).toHaveBeenCalledTimes(2);
  });
});

/**
 * E5-16 — THE TYPE PICKER STARTED AT THE TOP OF THE HIERARCHY.
 *
 * `useState(typeOptions[0]?.id ?? '')` seeded the dialog with the FIRST entry
 * of a rank-ordered ladder — `epic`, rank 1 — so a person who typed a title and
 * pressed Create filed an EPIC. The dev project's own distribution is Epic 3 ·
 * Errand 24 · Story/Task/Sub-task 0, so the default was the least likely choice
 * eight times in nine — and on the web the mistake is one-way: the sheet's
 * `Type` row is read-only (`ticket-sheet.tsx`), so an accidental Epic has to be
 * deleted and re-filed, and an Epic is structurally different besides (it heads
 * a hierarchy and appears in the Backlog as a group band).
 *
 * The picker now starts EMPTY and `Create` stays disabled until a type is
 * chosen — the pattern the Move dialog already uses for its destination
 * (`Choose a state`). Neither of the finding's two remedies is free here and
 * this one is the honest half: "the deepest-legal or most-used type" is not
 * computable from what this component is handed, because `typeOptions` carries
 * `{ id, name }` and no rank at all (`page.tsx`'s `BUILTIN_TYPE_LADDER` and its
 * served-types map both drop it), so any "deepest" rule would have to invent a
 * rank — or a new prop — to decide a product question this task does not own.
 */
describe('3.188 (E5-16) the Type picker does not start at the top of the hierarchy', () => {
  // The BUILT-IN ladder, in its own order and with its own ranks — Epic is
  // FIRST and rank 1, which is the whole defect. Nothing here is sorted or
  // reversed to manufacture it, and `sub-task` is present at rank 4 because it
  // is the entry the root-rank rule must EXCLUDE (a type at `DEEPEST_RANK` or
  // below cannot sit at project root).
  const LADDER = [
    { id: 'epic', name: 'Epic', rank: 1 },
    { id: 'story', name: 'Story', rank: 2 },
    { id: 'task', name: 'Task', rank: 3 },
    { id: 'sub-task', name: 'Sub-task', rank: 4 },
  ];

  /**
   * The rule on its own, where the ladder is the only input — the shape
   * `subtaskTypeFor` already established for the other creation control.
   */
  it('picks the deepest type that may sit at project root, and never ranks 1 or 4', () => {
    expect(defaultRootTypeFor(LADDER)?.id).toBe('task');
    // …not the TOP of the hierarchy, which is what `typeOptions[0]` named.
    expect(defaultRootTypeFor(LADDER)?.id).not.toBe('epic');
    // …and not a rank the root rule refuses outright (rank >= DEEPEST_RANK
    // needs a parent), even when it is the deepest on offer.
    expect(defaultRootTypeFor([
      { id: 'epic', name: 'Epic', rank: 1 },
      { id: 'sub-task', name: 'Sub-task', rank: 4 },
    ])?.id).toBe('epic');
    // A workspace whose every type needs a parent has NO root-legal type, and
    // the honest answer is none — the caller then starts empty.
    expect(defaultRootTypeFor([{ id: 'sub-task', name: 'Sub-task', rank: 4 }])).toBeNull();
    // Ties are broken by id, so the answer does not depend on the order the
    // server happened to return the ladder in.
    expect(
      defaultRootTypeFor([
        { id: 'errand', name: 'Errand', rank: 3 },
        { id: 'chore', name: 'Chore', rank: 3 },
      ])?.id,
    ).toBe('chore');
  });

  it('PLANTED DEFECT: the control paints the everyday type, not rank 1, and the draft carries it', () => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        open
        typeOptions={LADDER}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );

    // Asserted on the value the browser PAINTS — the finding's own measurement,
    // and the thing a person reads before pressing Create. It was `Epic`.
    expect(screen.getByLabelText('Type')).toHaveValue('Task');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
    });
  });

  it('a ladder with no root-legal type starts empty rather than picking one that needs a parent', () => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        open
        typeOptions={[{ id: 'sub-task', name: 'Sub-task', rank: 4 }]}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    // The control says it is empty, and Create refuses — rather than filing a
    // Sub-task at project root, which the hierarchy rule would refuse anyway.
    expect(screen.getByLabelText('Type')).toHaveValue('');
    expect(screen.getByLabelText('Type')).toHaveAttribute('placeholder', 'Choose a type');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
