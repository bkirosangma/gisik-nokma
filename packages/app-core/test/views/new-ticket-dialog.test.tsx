import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewTicketDialog } from '../../src/views/new-ticket-dialog.js';

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

  it('the reason is beside the picker, and the picker still works', () => {
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
    expect(within(screen.getByLabelText('Parent')).getAllByRole('option')).toHaveLength(2);
  });

  it('CONTROL: unnarrowed, no such claim is made', () => {
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
    expect(within(screen.getByLabelText('Parent')).getAllByRole('option')).toHaveLength(2);
  });
});

describe('3.157 the dialog never submits a parent it has stopped showing', () => {
  const TYPES = [
    { id: 'epic', name: 'Epic' },
    { id: 'task', name: 'Task' },
  ];
  const CANDIDATES = [{ id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign' }];

  const draftFrom = (unavailableAfterPick: string | undefined) => {
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
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.change(screen.getByLabelText('Parent'), {
      target: { value: '01J9TICKET00000000000000EP' },
    });

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

  it('a parent chosen BEFORE the picker was withheld does not reach the draft', () => {
    const onCreate = draftFrom('HTTP 500 for /v1/projects/p1/tickets');

    // The picker is gone and the reason stands in its place...
    expect(screen.queryByLabelText('Parent')?.tagName).not.toBe('SELECT');
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

  it('CONTROL: with the picker still shown, the SAME interaction keeps the chosen parent', () => {
    // Without this the case above passes against a dialog that drops every parent it
    // is ever given — which would satisfy "never submits a withheld parent" by never
    // submitting a parent at all.
    const onCreate = draftFrom(undefined);
    expect(within(screen.getByLabelText('Parent')).getAllByRole('option')).toHaveLength(2);
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'epic',
      parentId: '01J9TICKET00000000000000EP',
    });
  });
});
