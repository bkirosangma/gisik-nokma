import { fireEvent, render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default export that
// survives `verbatimModuleSyntax`, settled at packages/ui/test/components.test.tsx and repeated
// by board.test.tsx, ticket-list.test.tsx and reopen-flow.test.tsx.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewTicketDialog } from '../../src/views/new-ticket-dialog.js';

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
  const TYPES = [{ id: 'task', name: 'Task' }];
  const CANDIDATES = [{ id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign' }];

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
  const TYPES = [
    { id: 'epic', name: 'Epic' },
    { id: 'task', name: 'Task' },
  ];
  const CANDIDATES = [{ id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign' }];

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
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'epic',
      parentId: null,
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
      typeId: 'epic',
      parentId: '01J9TICKET00000000000000EP',
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
describe('the parent picker offers project root as a real, selectable option', () => {
  const TYPES = [{ id: 'task', name: 'Task' }];
  const CANDIDATES = [{ id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign' }];

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

  it('reads "None (project root)" before anything is picked, and submits it as null', async () => {
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
    });
  });

  it('can be chosen BACK after a parent was picked, which is how a ticket un-nests', async () => {
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
    });
  });
});
