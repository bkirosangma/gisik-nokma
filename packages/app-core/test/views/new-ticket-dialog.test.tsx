import { act, fireEvent, render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default export that
// survives `verbatimModuleSyntax`, settled at packages/ui/test/components.test.tsx and repeated
// by board.test.tsx, ticket-list.test.tsx and reopen-flow.test.tsx.
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_TICKET_START_KEY } from '../../src/preferences/new-ticket-start.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import { NewTicketDialog, defaultRootTypeFor } from '../../src/views/new-ticket-dialog.js';

/**
 * The remembered backlog answer is a `localStorage` record, and `localStorage`
 * is shared by every case in a file. Cleared BETWEEN cases rather than inside
 * the ones that write it: a leak turns a LATER case green for the wrong reason,
 * so the guard belongs where it cannot be forgotten by whoever adds the next
 * case. The choice cases clear it again themselves before asserting, because
 * "no record" is the state their own controls depend on.
 */
beforeEach(() => {
  window.localStorage.clear();
});

// The cross-package stylesheet read `sync-ux-css-binding.test.tsx:47` and
// `inbox-css-binding.test.tsx` already establish for "is this class a rule?".
// FOUR levels up, not three: that file sits directly in `test/`, this one in
// `test/views/`. Measured the hard way — `../../..` resolved to `packages/` and
// the read threw ENOENT, which a `Tests no tests` summary reports as a red
// suite that ran nothing.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

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
  const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];
  const CANDIDATES = [
    { id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign', inFocus: false },
  ];

  it('the reason is beside the picker, and the picker still works', async () => {
    const user = userEvent.setup();
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={TYPES}
        parentCandidates={CANDIDATES}
        parentCandidatesNarrowing="tickets in progress"
        onCreate={vi.fn()}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId('parent-narrowing')).toHaveTextContent(
      'showing only tickets in progress, so a ticket outside that is not offered here',
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
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
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
    { id: 'epic', name: 'Epic', rank: 1, workflowId: 'wf-errand' },
    { id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' },
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
      userId: 'usr_ada',
      workspaceId: 'ws_1',
      assigneeCandidates: [],
      open: true,
      typeOptions: TYPES,
      parentCandidates: CANDIDATES,
      workflowStates: () => null,
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
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
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
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
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
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
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
  const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];
  const CANDIDATES = [
    { id: '01J9TICKET00000000000000EP', title: 'Rewire the shop sign', inFocus: false },
  ];

  const renderDialog = () => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
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
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));

    // `''` becomes `null` at the submit boundary — `ticketCreatedPayload` types `parentId` as a
    // nullable ULID and `''` is neither, which is why the translation lives there and not in
    // the control's own value.
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
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

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });
});

/**
 * 13.591 / 13.1351–13.1357 — NEW TICKETS ARE BORN IN THE BACKLOG, and the
 * question is now a SWITCH rather than a sentence plus a sometimes-checkbox.
 *
 * ## What changed, and why the old cases could not simply be re-lettered
 *
 * Until 2026-09-23 this block pinned spec §5.4: an unconditional SENTENCE
 * ("Starts in the backlog"), plus a "Start in focus" CHECKBOX that existed only
 * when the chosen parent was itself in focus — a condition (`startCheckboxVisible`)
 * that was really a rule about the ticket's birth state. **The owner lifted that
 * condition** (ruling 2026-09-23): a ticket may be born in focus whatever its
 * parent, the control is always present and always answerable, and the choice is
 * remembered across sessions.
 *
 * Two consequences shape every case below rather than being footnotes to them:
 *
 * - **The polarity INVERTED.** The old control meant "start in FOCUS" and was
 *   checked by default; the new one means "starts in BACKLOG" and is ON by
 *   default. They are opposites, so `startInFocus` could not be wired straight
 *   to `checked` — the draft's `start` is now derived from the switch's own
 *   sense, and 13.1353 pins the direction that would otherwise be silently
 *   backwards.
 * - **Ruling 40 is SUPERSEDED, not deleted.** "Checked by default, PER CHOSEN
 *   PARENT" was a promise about a control that tracked the parent. The switch
 *   does not track the parent at all, so the parent picker no longer resets it —
 *   and 13.591g survives as the case that pins exactly that removal, because a
 *   stale reset would silently overwrite the person's remembered answer.
 */
describe('13.591 the backlog question is a Switch, and it is always answerable', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];
  const CANDIDATES = [
    { id: 'parent_focus', title: 'In-focus parent', inFocus: true },
    { id: 'parent_backlog', title: 'Backlog parent', inFocus: false },
    // A SECOND in-focus candidate, for 13.591g's switch-between-two-in-focus-
    // parents case — every other case in this block ignores it.
    { id: 'parent_focus_2', title: 'Another in-focus parent', inFocus: true },
  ];
  const QUESTION = 'Starts in the backlog?';

  const renderDialog = (userId = 'usr_ada') => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId={userId}
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={TYPES}
        parentCandidates={CANDIDATES}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    return onCreate;
  };

  const switchControl = (): HTMLElement => screen.getByRole('checkbox', { name: QUESTION });

  it('13.591a asks "Starts in the backlog?" with the SHARED Switch, and it opens ON', () => {
    renderDialog();
    const control = switchControl();
    // The shared component, not a lookalike: `Switch` renders the product's one
    // switch — a restyled `gn-switch` checkbox inside a `gn-switch-row` label
    // (`packages/ui/src/components/switch.tsx`). A hand-rolled toggle would
    // satisfy an accessible-name assertion and still be a second on/off control
    // for the product to keep in step.
    expect(control).toHaveClass('gn-switch');
    expect(control.closest('label')).toHaveClass('gn-switch-row');
    // ON is the default, and ON means BACKLOG — asserted on the control AND on
    // the draft below, because the two can disagree only if the polarity is
    // wired backwards, which a name assertion alone cannot see.
    expect(control).toBeChecked();
    // The question is the control's own accessible name, so the words on screen
    // and the words a screen reader announces are the same node's — the
    // `Switch` contract, whose children ARE the name with no `aria-label` to
    // drift from them.
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
  });

  it('13.1354 the thing it replaced is GONE — the old sentence and the "Start in focus" checkbox', () => {
    renderDialog();
    // The `?` is the whole difference in text, and `getByText` matches
    // normalised text EXACTLY, so asserting the old string absent and the new
    // one present cannot both be satisfied by one node. A dialog that kept the
    // old `<p>` and added a switch beside it would read as one claim plus one
    // control — the pair the owner asked to have replaced.
    expect(screen.queryByText('Starts in the backlog')).toBeNull();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    // …and the checkbox went with the condition it existed to serve. A leftover
    // one would be a SECOND control for the same fact, and the two could
    // disagree: the draft's `start` reads the switch alone.
    expect(screen.queryByRole('checkbox', { name: 'Start in focus' })).toBeNull();
    // Exactly ONE on/off control remains, so "the checkbox is gone" cannot be
    // satisfied by a dialog that lost the switch too.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('13.1352 the switch stays PRESENT and ENABLED for every parent — §5.4\'s condition is lifted', async () => {
    const user = userEvent.setup();
    renderDialog();

    // ARM ONE — no parent chosen. This is the case the owner was looking at:
    // under §5.4 the checkbox was absent here and the sentence dangled.
    expect(switchControl()).toBeEnabled();
    // ARM TWO — an IN-FOCUS parent, the only parent that ever revealed the old
    // control. Without this arm the case passes against a switch that is
    // enabled only where the checkbox used to appear.
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'In-focus parent' }),
    );
    expect(switchControl()).toBeEnabled();
    // ARM THREE — a BACKLOG parent, which HID the old control outright.
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'Backlog parent' }),
    );
    expect(switchControl()).toBeEnabled();
  });

  it('13.1353 turning it OFF with NO parent chosen sends start: "focus" — a ticket may be born in focus without a parent', () => {
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.click(switchControl());
    expect(switchControl()).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: null,
      start: 'focus',
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  it('13.1353 CONTROL: left untouched with no parent chosen, the SAME draft sends start: "backlog"', () => {
    // The direction pin. ON means BACKLOG, and a switch wired straight to the
    // old `startInFocus` sense would pass the case above while sending the
    // opposite of what this one asserts — the two are red together or the
    // polarity is not being tested at all.
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  it('13.591b with no parent chosen the switch is ON and the draft leaves with start: "backlog"', () => {
    const onCreate = renderDialog();
    expect(switchControl()).toBeChecked();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  it('13.591c an in-focus parent is no longer a precondition: OFF sends start: "focus" under it too', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'In-focus parent' }),
    );
    expect(switchControl()).toBeChecked();
    await user.click(switchControl());

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_focus',
      start: 'focus',
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  it('13.591d turning the switch OFF under a parent sends start: "backlog" when turned back ON', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'In-focus parent' }),
    );
    await user.click(switchControl());
    expect(switchControl()).not.toBeChecked();
    // …and back ON: the control is answerable in BOTH directions, which a
    // one-way toggle would fail here rather than in the draft assertions.
    await user.click(switchControl());
    expect(switchControl()).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_focus',
      start: 'backlog',
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  it('13.591e a BACKLOG parent no longer hides the control, and the draft leaves with start: "backlog"', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'Backlog parent' }),
    );
    // The control the old rule removed for exactly this parent. Asserting it is
    // PRESENT and ON is the whole case: §5.4 hid it here because a backlog
    // parent could not father a focus child, and that rule is lifted.
    expect(switchControl()).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_backlog',
      start: 'backlog',
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  /**
   * 13.591g — RULING 40 SUPERSEDED (owner ruling 2026-09-23).
   *
   * Ruling 40 made "checked by default" a promise PER CHOSEN PARENT: the Parent
   * picker's own `onChange` reset the box on every selection, so switching from
   * in-focus parent A to in-focus parent B rendered B's box at its own starting
   * state rather than inheriting A's untick.
   *
   * That reset existed because the control TRACKED the parent. The switch does
   * not: it answers a question about the ticket, not about its parent, and it is
   * remembered for the person. Keeping the reset would therefore be an active
   * defect rather than a harmless vestige — it would silently overwrite an
   * answer the person gave and that this dialog has just been asked to remember.
   *
   * So the case survives, inverted: it now pins that CHOOSING A PARENT CHANGES
   * NOTHING. The id is kept deliberately — the catalogue rule is that ids are
   * never renumbered, and this is the same question (what does a parent change
   * about the birth state?) answered by the rule that replaced §5.4.
   */
  it('13.591g choosing a different parent leaves the switch exactly as the person left it', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    await user.click(switchControl());
    expect(switchControl()).not.toBeChecked();

    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'In-focus parent' }),
    );
    expect(switchControl()).not.toBeChecked();

    await user.click(
      within(await openPicker(user, 'Parent')).getByRole('option', { name: 'Another in-focus parent' }),
    );
    expect(switchControl()).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Renew the trade licence',
      typeId: 'task',
      parentId: 'parent_focus_2',
      start: 'focus',
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });
});

/**
 * 13.1355–13.1357 — THE CHOICE IS REMEMBERED, KEYED BY USER.
 *
 * `localStorage` outlives a session, so the record carries the user it was
 * written for and a record belonging to anyone else is not honoured — the
 * load-bearing half of the pattern `apps/web/src/use-last-workspace.ts` and
 * `use-last-project.ts` establish, and the reason the key is not a flat
 * boolean: sign out, hand the laptop over, and a bare key would start the next
 * person's tickets in the previous person's state.
 *
 * Every case here clears storage first. `localStorage` is shared by every case
 * in a file, so a leaked record turns a later case green for the wrong reason —
 * the same "a state you did not set" defect this file's `E2-37` block is about.
 */
describe('13.1355–13.1357 the backlog answer is remembered, per user', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];
  const QUESTION = 'Starts in the backlog?';

  const props = (userId: string) => ({
    userId,
    workspaceId: 'ws_1',
    typeOptions: TYPES,
    parentCandidates: [],
    assigneeCandidates: [],
    workflowStates: () => null,
    onCreate: vi.fn(),
    onClose: () => undefined,
  });
  const switchControl = (): HTMLElement => screen.getByRole('checkbox', { name: QUESTION });

  it('13.1355 an answer survives a close and reopen, and is stored against the user', () => {
    const { rerender } = render(<NewTicketDialog open {...props('usr_ada')} />);
    fireEvent.click(switchControl());
    expect(switchControl()).not.toBeChecked();

    // The record, read back and compared WHOLE: the user id is what the key's
    // shape is for, and a record that stored the answer without it would still
    // satisfy the reopen assertion below while being the leak this key exists
    // to prevent.
    expect(JSON.parse(window.localStorage.getItem(NEW_TICKET_START_KEY) ?? 'null')).toEqual({
      userId: 'usr_ada',
      start: 'focus',
    });

    // The REAL reopen path rather than a fresh mount: the flow mounts this
    // component for its whole life and only toggles `open`, so the seed has to
    // survive `open: false → true` on a SURVIVING instance — which a component
    // that seeded only in `useState`'s initialiser would fail.
    rerender(<NewTicketDialog open={false} {...props('usr_ada')} />);
    rerender(<NewTicketDialog open {...props('usr_ada')} />);
    expect(switchControl()).not.toBeChecked();
  });

  it('13.1356 a record written for ANOTHER user is not honoured — and the same bytes DO answer for the user they name', () => {
    window.localStorage.setItem(
      NEW_TICKET_START_KEY,
      JSON.stringify({ userId: 'usr_grace', start: 'focus' }),
    );

    // CONTROL FIRST, and it is the whole reason this case can be trusted: the
    // SAME bytes, read for the user the record names, do turn the switch OFF.
    // Without it, "the other user's record was refused" is indistinguishable
    // from a reader that failed for some unrelated reason — a typo in the key,
    // an unparsed shape — which is the failure mode `use-last-project.ts`'s own
    // 13.853 control names.
    const control = render(<NewTicketDialog open {...props('usr_grace')} />);
    expect(switchControl()).not.toBeChecked();
    control.unmount();

    render(<NewTicketDialog open {...props('usr_ada')} />);
    expect(switchControl()).toBeChecked();
  });

  it('13.1357 blocked site data still renders the dialog at the default, and the switch still toggles', () => {
    const real = window.localStorage;
    // A browser with site data blocked throws on the ACCESSOR, not on the value
    // — so this stubs the object itself, which is the shape the guard in the
    // module has to survive. `configurable: true` is required to put the real
    // one back in the `finally`: leaving a throwing stub in place would poison
    // every case after this one in the file.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem(): string | null {
          throw new Error('site data blocked');
        },
        setItem(): void {
          throw new Error('site data blocked');
        },
      },
    });
    try {
      render(<NewTicketDialog open {...props('usr_ada')} />);
      // The default, which the ruling names: backlog ON. A dialog that refused
      // to render because it could not read a convenience would be worse than
      // one that forgot the convenience.
      expect(switchControl()).toBeChecked();
      // …and the control still WORKS. The write is what throws here, so this is
      // the arm that proves the write is guarded too rather than only the read.
      fireEvent.click(switchControl());
      expect(switchControl()).not.toBeChecked();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: real });
    }
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
  const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];

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
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
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
    const create = screen.getByRole<HTMLButtonElement>('button', { name: 'Create ticket' });
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
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled();
    release();
  });

  it('the guard LIFTS when the create settles, so a refusal does not strand the dialog', async () => {
    const { onCreate, release } = slowDialog();
    await act(async () => {
      screen.getByRole('button', { name: 'Create ticket' }).click();
    });
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled();

    // The flow leaves the dialog OPEN on a refusal — nothing landed, nothing is
    // in flight, and the person must be able to press again.
    await act(async () => {
      release();
    });
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeEnabled();
    await act(async () => {
      screen.getByRole('button', { name: 'Create ticket' }).click();
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
/**
 * 3.193 (E2-37) — THE DRAFT SURVIVED ITS OWN CLOSE.
 *
 * This file contains zero `useEffect` for most of its life, so none of the four
 * `useState` values was ever reset. The dialog is MOUNTED for the flow's whole
 * life (`create-ticket-flow.tsx` renders it always, with `open` toggling), and
 * a successful create and a Cancel both only set `open` to false — so reopening
 * offered the LAST ticket's title, with `Create` enabled and a type already
 * chosen. One press files a duplicate of a ticket the person already filed.
 *
 * ⚠ The mitigation is real and is priced in: the stale title is VISIBLE in a
 * text input, so a person who looks before typing notices. That is why the
 * finding is Minor and why the rule chosen here is "a CLOSED dialog holds
 * nothing" rather than a subtler memory of what was once typed — the visible
 * draft is the whole reason the last one is safe to discard.
 */
describe('E2-37 a reopened New-ticket dialog is EMPTY', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];
  const props = {
    userId: 'usr_ada',
    workspaceId: 'ws_1',
    typeOptions: TYPES,
    parentCandidates: [],
    assigneeCandidates: [],
    workflowStates: () => null,
    onClose: () => undefined,
  };

  it('PLANTED DEFECT: reopening offers no title, and Create is disabled again', () => {
    const onCreate = vi.fn();
    const { rerender } = render(<NewTicketDialog open {...props} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    expect(screen.getByLabelText('Title')).toHaveValue('Order the tent');

    rerender(<NewTicketDialog open={false} {...props} onCreate={onCreate} />);
    rerender(<NewTicketDialog open {...props} onCreate={onCreate} />);

    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled();
  });

  it('a SUCCESSFUL create leaves no draft behind either — the same close, whichever way it ended', () => {
    const onCreate = vi.fn();
    const { rerender } = render(<NewTicketDialog open {...props} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    // The flow closes the dialog on `committed` — the very next thing it does.
    rerender(<NewTicketDialog open={false} {...props} onCreate={onCreate} />);
    rerender(<NewTicketDialog open {...props} onCreate={onCreate} />);
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });
});

describe('3.188 (E5-16) the Type picker does not start at the top of the hierarchy', () => {
  // The BUILT-IN ladder, in its own order and with its own ranks — Epic is
  // FIRST and rank 1, which is the whole defect. Nothing here is sorted or
  // reversed to manufacture it, and `sub-task` is present at rank 4 because it
  // is the entry the root-rank rule must EXCLUDE (a type at `DEEPEST_RANK` or
  // below cannot sit at project root).
  const LADDER = [
    { id: 'epic', name: 'Epic', rank: 1, workflowId: 'wf-errand' },
    { id: 'story', name: 'Story', rank: 2, workflowId: 'wf-errand' },
    { id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' },
    { id: 'sub-task', name: 'Sub-task', rank: 4, workflowId: 'wf-errand' },
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
      { id: 'epic', name: 'Epic', rank: 1, workflowId: 'wf-errand' },
      { id: 'sub-task', name: 'Sub-task', rank: 4, workflowId: 'wf-errand' },
    ])?.id).toBe('epic');
    // A workspace whose every type needs a parent has NO root-legal type, and
    // the honest answer is none — the caller then starts empty.
    expect(defaultRootTypeFor([{ id: 'sub-task', name: 'Sub-task', rank: 4, workflowId: 'wf-errand' }])).toBeNull();
    // Ties are broken by id, so the answer does not depend on the order the
    // server happened to return the ladder in.
    expect(
      defaultRootTypeFor([
        { id: 'errand', name: 'Errand', rank: 3, workflowId: 'wf-errand' },
        { id: 'chore', name: 'Chore', rank: 3, workflowId: 'wf-errand' },
      ])?.id,
    ).toBe('chore');
  });

  it('29.144 the Decision seed ties task on rank 3 and sorts before it by id: never the default, still chosen when it is all there is', () => {
    const decision = { id: 'decision', name: 'Decision', rank: 3, workflowId: 'wf-errand' };
    expect(defaultRootTypeFor([...LADDER, decision])?.id).toBe('task');
    expect(defaultRootTypeFor([decision, ...LADDER])?.id).toBe('task'); // order independence
    expect(defaultRootTypeFor([decision])?.id).toBe('decision'); // control: legal, so the last resort
    expect(defaultRootTypeFor([decision, { id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }])?.id).toBe('task'); // one other legal type is enough
    expect(defaultRootTypeFor([decision, { id: 'errand', name: 'Errand', rank: 3, workflowId: 'wf-errand' }, { id: 'chore', name: 'Chore', rank: 3, workflowId: 'wf-errand' }])?.id).toBe('chore'); // the id tie-break among the rest is unchanged
  });

  it('PLANTED DEFECT: the control paints the everyday type, not rank 1, and the draft carries it', () => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
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
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'task',
      parentId: null,
      start: 'backlog',
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  /**
   * 3.191 (E2-33a) — THE GATE IS MEMBERSHIP, NOT EMPTINESS.
   *
   * The seed runs once and the caller legitimately SWAPS the ladder's identity:
   * the dialog mounts under `BUILTIN_TYPE_LADDER` while the type read is in
   * flight and gets the workspace's own list afterwards. `disabled` tested
   * `typeId === ''` — a string test — so an id that is no longer IN the list
   * still passed it. The `Select` resolves its label with
   * `options.find(option => option.value === props.value) ?? null`
   * (`packages/ui/src/select/select.tsx`), so the control draws the PLACEHOLDER
   * — "no type chosen" — while `typeId` is non-empty and Create is enabled: the
   * screen and the payload disagree, which is the one thing this component's
   * docblock exists to refuse.
   *
   * Whether a product-founded workspace can reach it today is a separate
   * question (its real list still holds the built-in ids, which the ladder
   * seeds from) and V10's journey does not depend on the answer: a screen whose
   * claim and whose payload are kept in agreement by a MEMBERSHIP test cannot
   * drift when either side moves, and the emptiness test was the drift.
   */
  it('PLANTED DEFECT: a ladder swap cannot leave the screen saying "none chosen" while a type travels', () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={LADDER}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    expect(screen.getByLabelText('Type')).toHaveValue('Task');
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeEnabled();

    // The workspace's own ladder arrives and does not carry the type the seed
    // chose. Nothing re-seeds (`useState` runs once), so `typeId` is now an id
    // this list cannot resolve.
    rerender(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={[{ id: 'errand', name: 'Errand', rank: 3, workflowId: 'wf-errand' }]}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    // The picker now OFFERS `Errand` and nothing else, and the standing id was
    // not in it — so the re-seed asks the same question the initial seed did and
    // the control paints the type the list actually carries.
    expect(screen.getByLabelText('Type')).toHaveValue('Errand');
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Order the tent',
      typeId: 'errand',
      parentId: null,
      start: 'backlog',
      // Spec 2026-09-22: the dialog always SENDS a priority, and it starts at
      // the middle — the wire's absence-means-P2 rule is for events older than
      // the field, not for this client.
      priority: 'P2',
      // The two members this task added to the draft (owner request
      // 2026-09-23). `ticketId` is minted per OPEN, so it cannot be an
      // exact literal — `expect.any(String)` is the one hole this file's
      // whole-draft style takes, and 13.1359 pins the SHAPE at its own
      // case. `assigneeId` is exact: nobody is assigned unless the picker
      // says otherwise. `description` is deliberately NOT here — it is
      // absent, and an absent key is what 13.1366 asserts.
      ticketId: expect.any(String),
      assigneeId: null,
    });
  });

  it('a re-seed never overwrites a type the picker still offers — only one that has LEFT the list', () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={LADDER}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Type')).toHaveValue('Task');
    // A list that still holds `task`, plus a new type. The standing choice is
    // untouched — re-seeding on every list change would silently replace a type
    // the person can still pick.
    rerender(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={[...LADDER, { id: 'errand', name: 'Errand', rank: 3, workflowId: 'wf-errand' }]}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Type')).toHaveValue('Task');
  });

  it('a ladder with no root-legal type starts empty rather than picking one that needs a parent', () => {
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={[{ id: 'sub-task', name: 'Sub-task', rank: 4, workflowId: 'wf-errand' }]}
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
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

/**
 * Case `13.1139` — E4-13 — the Title field wears the product's own field
 * treatment instead of painting as raw user-agent chrome.
 *
 * Opened *New ticket* (now *Create ticket*) on the board and measured the first control a person
 * types into: `getComputedStyle(input)` gave `border: 2px inset rgb(118,118,118)`,
 * `background-color: rgb(255,255,255)`, `border-radius: 0px`,
 * `padding: 1px 2px`, `font-size: 13.33px`, and `getBoundingClientRect` gave
 * **425×22** — inside a neumorphic sheet, on a dialog whose `Type` and `Parent`
 * siblings paint at the product's 17 px on a 44 px control. `ui.css` holds
 * exactly two `.gn-new-ticket` rules (the actions row, the field wrapper), so
 * the bare `<input>` had nothing to inherit.
 *
 * **The two halves are asserted together because either alone is passable while
 * the defect survives.** Round 1's `P1` was precisely *"a control styled by no
 * rule of its own"*: a class that matches no selector block satisfies a
 * class-name assertion and changes nothing about the paint. So the class is
 * checked on the CONTROL and the rule it names is checked in the STYLESHEET,
 * by the cross-package read `sync-ux-css-binding.test.tsx:105` and
 * `inbox-css-binding.test.tsx` already establish for this exact question.
 * `packages/ui/test/components.test.tsx` pins what that rule *says* (`13.339`);
 * this case pins that this control is one of its wearers.
 */
describe('13.1139 the Title field is a .gn-field__input, not raw UA chrome', () => {
  const UI_CSS = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  const renderDialog = () =>
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
        parentCandidates={[]}
        onCreate={vi.fn()}
        onClose={() => undefined}
      />,
    );

  it('13.1139 the Title control carries the class', () => {
    renderDialog();
    const title = screen.getByLabelText('Title');
    // The control, not a wrapper — the fix is on the `<input>` itself.
    expect(title.tagName).toBe('INPUT');
    expect(title).toHaveClass('gn-field__input');
  });

  it('13.1139 and the class it carries is a RULE, not a dead name', () => {
    // CONTROL, first, for the same reason `sync-ux-css-binding.test.tsx` runs
    // one: without it a needle that matches nothing would make the assertion
    // below read as a pass on a stylesheet that had lost the block entirely.
    expect(UI_CSS.includes('.gn-field__input')).toBe(true);
    renderDialog();
    const carried = screen.getByLabelText('Title');
    const names = [...carried.classList];
    expect(
      names.some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(UI_CSS)),
      `none of ${JSON.stringify(names)} matches a selector block in ui.css`,
    ).toBe(true);
  });
});

/**
 * 13.1234-13.1235 — the birth priority (spec 2026-09-22).
 *
 * The dialog offers the three levels as ONE segmented control, preselected at
 * the middle, after the Type picker — the prototype's own placement
 * (`desktop.dc.html:1592-1599`) and the owner's own words (*"everything starts
 * at p2 the middle"*). Its own describe because the two cases below share a
 * fixture and neither is about anything the describes above measure.
 */
describe('13.1234 the new-ticket dialog offers P1/P2/P3, preselected at P2', () => {
  const CHOICES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];

  const renderDialog = (onCreate: (draft: unknown) => void | Promise<void> = vi.fn()) => {
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={CHOICES}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    return onCreate;
  };

  it('13.1234 the control is a `tablist` named Priority offering exactly P1, P2, P3 with P2 selected', () => {
    renderDialog();
    const control = screen.getByRole('tablist', { name: 'Priority' });
    // The LABELS, in order — not just "three tabs". A control that offered the
    // levels out of order, or spelled one of them differently, would pass a
    // count and fail here.
    expect(within(control).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'P1',
      'P2',
      'P3',
    ]);
    // P2 is the MIDDLE and the selected one, asserted as one fact: the owner's
    // ruling was about where a ticket starts, not merely that a control exists.
    expect(within(control).getByRole('tab', { name: 'P2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(control).getByRole('tab', { name: 'P1' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('13.1235 a chosen level leaves in the draft, and the default is P2 when nothing is touched', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    await user.click(
      within(screen.getByRole('tablist', { name: 'Priority' })).getByRole('tab', { name: 'P1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    // `objectContaining` rather than the whole draft: this case is about the
    // priority travelling, and the other three members are asserted by the
    // describes above — a full `toEqual` here would be a second copy of them
    // that could drift.
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ priority: 'P1' }));
  });
});

/**
 * 13.1365–13.1368 — THE DIALOG SETS A DESCRIPTION AND AN ASSIGNEE AT BIRTH
 * (owner request 2026-09-23).
 *
 * ## The description goes through the SEAM, and the fake here is the point
 *
 * `NewTicketDialog` must not learn what a ProseMirror document is (amendment
 * 12), so the composer arrives as the `editorSlot` prop — the same seam
 * `TicketSheet` takes — and `apps/web` supplies the real `TicketEditorSlot`.
 * These cases therefore drive a FAKE slot: what belongs to app-core is the
 * CONTRACT (which mode, what it does with a reported document, what it sends),
 * and what belongs to `packages/editor` is covered by that package's own suite.
 * Using the real editor here would test the editor twice and the seam not at all.
 *
 * ## The two options the brief called the task's main decision
 *
 * The events say how the values reach the ledger: a description is a
 * `ticket.field_set` claim on `fieldId: 'description'` whose value is a
 * DOCUMENT, and an assignee is `ticket.assigned`. `ticket.created` carries
 * neither, so the choice was (a) additive optional members — the `priority`
 * precedent, creation stays atomic — or (b) follow-up events, which reuse the
 * canonical write paths but leave a ticket that exists without the description
 * someone typed if the second event is refused. **(a) was taken**, and these
 * cases pin the client's half of it.
 */
const DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the laminate is peeling' }] }],
};

/** A slot that RECORDS the props app-core handed it and can report a document on demand. */
function fakeSlot(reported: unknown) {
  const seen: Array<Record<string, unknown>> = [];
  const slot: EditorSlotComponent = (props) => {
    seen.push(props as unknown as Record<string, unknown>);
    return (
      <button type="button" onClick={() => props.onChange?.(reported)}>
        type the description
      </button>
    );
  };
  return { slot, seen };
}

describe('13.1365 the dialog composes a description through the editorSlot seam', () => {
  const renderDialog = (onCreate: ReturnType<typeof vi.fn>, reported: unknown = DOC) => {
    const { slot, seen } = fakeSlot(reported);
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
        parentCandidates={[]}
        editorSlot={slot}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    return seen;
  };

  it('13.1365 mounts the slot as a DESCRIPTION composer, empty, editable, scoped — and never read-only', () => {
    const seen = renderDialog(vi.fn());
    // The slot renders on EVERY render of the dialog, and the "empty on OPEN"
    // effect guarantees at least two — the mount, then the commit that seeds the
    // draft. So this reads the SETTLED render (`at(-1)`) rather than asserting a
    // render count, which would be a claim about React rather than about this
    // component. What must hold across all of them is the SCOPE: a slot whose
    // mode or workspace changed between renders would be a composer
    // re-mounting under the person mid-typing.
    expect(seen.length).toBeGreaterThan(0);
    const props = seen.at(-1)!;
    for (const earlier of seen) {
      expect(earlier['mode']).toBe('description');
      expect(earlier['workspaceId']).toBe('ws_1');
      expect(earlier['readOnly']).toBe(false);
    }
    // The mode discriminator, asserted because it is what makes the composer's
    // accessible name and its row count right: mounting `'comment'` here would
    // put a three-row comment box in the create form.
    expect(props['mode']).toBe('description');
    // `doc: null`, not the current draft: the ticket does not exist, so there is
    // nothing to open on. It is also what makes the composer start empty rather
    // than inheriting whatever a previous draft put in a surviving instance.
    expect(props['doc']).toBeNull();
    expect(props['readOnly']).toBe(false);
    expect(props['workspaceId']).toBe('ws_1');
    // A REAL id, and asserted as a ULID rather than as "some string": this is
    // the id `ticket.created` will carry, so the composer's own ledger-scoped
    // capabilities (uploads, if a later task wires one) name the ticket they
    // were always going to name.
    expect(String(props['ticketId'])).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // No `submit`, deliberately: this mount has nowhere to submit to. The slot
    // reports through `onChange` and the DIALOG's Create is the one act.
    expect(props['submit']).toBeUndefined();
  });

  it('13.1365 a document the slot reports travels in the draft as `description`, under the id the slot was scoped to', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const seen = renderDialog(onCreate);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    await user.click(screen.getByRole('button', { name: 'type the description' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ description: DOC }));

    // ⚠ THE SCOPING INVARIANT, and it is the stronger half of this case: the id
    // the composer was shown is the id the create WRITES. Measured across the
    // two renders (`at(-1)`, the settled one) because the open effect re-mints
    // as part of the "empty on OPEN" reset, so an earlier render legitimately
    // carries the previous draft's id.
    //
    // Without this, a dialog that showed the composer one id and created the
    // ticket under another would satisfy every other assertion here — and on a
    // mount that DOES wire uploads (a later task, or the RN bridge the contract
    // names) that difference is an attachment filed against a ticket nobody
    // created.
    const draft = onCreate.mock.calls[0]?.[0] as { ticketId: string };
    expect(seen.at(-1)?.['ticketId']).toBe(draft.ticketId);
  });

  it('13.1366 an EMPTY document is OMITTED from the draft — the key is absent, not an empty doc', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    // A composer the person typed nothing into reports nothing at all
    // (`TicketEditor` wires `onChange` to ProseMirror's `onUpdate`), so this
    // walks BOTH ways to an empty description: never reported, and reported as
    // an empty document. They must land identically, because the wire's
    // `description` is optional with absent meaning none, and a claim nobody
    // made is what invariant 4 forbids.
    renderDialog(onCreate, { type: 'doc', content: [] });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    await user.click(screen.getByRole('button', { name: 'type the description' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));

    const draft = onCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    // The KEY SET, not a value: `description: undefined` would satisfy a
    // `toEqual` against an absent key, and the payload builder tests for the
    // key's presence to decide whether to send the member.
    expect(Object.keys(draft)).not.toContain('description');
  });

  it('13.1366 CONTROL: with NO editorSlot at all the dialog still works, and sends no description', async () => {
    // The prop is OPTIONAL — a caller without an editor gets the form it had
    // before this task, not a broken one. Without this arm, "an empty document
    // is omitted" passes against a dialog that omitted descriptions entirely.
    const onCreate = vi.fn();
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        assigneeCandidates={[]}
        typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
        parentCandidates={[]}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    const draft = onCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(draft)).not.toContain('description');
    expect(draft['title']).toBe('Order the tent');
  });
});

describe('13.1367 the dialog names an assignee, and the roster it offers is the caller’s', () => {
  const PEOPLE = [
    { id: 'user_anselma', name: 'Anselma Marak' },
    { id: 'user_balti', name: 'Balti Sangma' },
  ];

  const renderDialog = (onCreate = vi.fn(), unavailable?: string) => {
    render(
      <NewTicketDialog
        workflowStates={() => null}
        open
        userId="usr_ada"
        workspaceId="ws_1"
        typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
        parentCandidates={[]}
        assigneeCandidates={PEOPLE}
        {...(unavailable === undefined ? {} : { assigneeCandidatesUnavailable: unavailable })}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    );
    return onCreate;
  };

  it('13.1367 offers "Unassigned" plus the roster, and omitting it is the DEFAULT', () => {
    const onCreate = renderDialog();
    const picker = screen.getByRole('combobox', { name: 'Assignee' });
    // The unassigned arm is the picker's OPENING VALUE, because a ticket is born
    // with nobody on it unless someone says otherwise — and it is an OPTION
    // rather than the absence of one, so a person can choose it back.
    expect(picker).toHaveValue('Unassigned');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    // `null`, not absent and not `''`: `ticket.created`'s `assigneeId` is
    // nullable and `TicketState.assigneeId` is `string | null`, so null is the
    // one spelling of "nobody" the whole chain agrees on.
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: null }));
  });

  it('13.1367 a chosen person travels in the draft as `assigneeId`', async () => {
    const user = userEvent.setup();
    const onCreate = renderDialog();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });

    const picker = screen.getByRole('combobox', { name: 'Assignee' });
    await user.click(picker);
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Balti Sangma' }),
    );
    expect(picker).toHaveValue('Balti Sangma');

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 'user_balti' }));
  });

  it('13.1368 an UNREAD roster is stated, and the draft carries no assignee rather than a wrong one', () => {
    // The same discipline `parentCandidatesUnavailable` established one field
    // over: an empty picker would assert "this workspace has nobody to assign",
    // which is a claim from a read that never answered. The sentence replaces
    // the control and the draft says nobody, which is what the ticket would
    // have been anyway.
    const onCreate = renderDialog(vi.fn(), 'HTTP 500 for /v1/workspaces/ws_1/members');
    expect(screen.queryByRole('combobox', { name: 'Assignee' })).toBeNull();
    expect(screen.getByText(/nobody assigned/)).toBeInTheDocument();
    // The caller's OWN reason travels verbatim, unparaphrased — the same
    // discipline the parent picker's unavailable arm follows. A dialog that
    // swallowed it would leave the person with a sentence about a roster and no
    // way to tell a refusal from a read still in flight.
    expect(screen.getByText(/HTTP 500 for \/v1\/workspaces\/ws_1\/members/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: null }));
  });

  /**
   * 13.1370 — **A PERSON CHOSEN BEFORE THE ROSTER WENT AWAY MUST NOT REACH THE DRAFT.**
   *
   * This is 3.157's own defect, one field over, and it needed its OWN case for a
   * reason that is measured rather than tidy: `13.1368` sets
   * `assigneeCandidatesUnavailable` from the FIRST render, so the picker is never
   * usable and `assigneeId` is still `UNASSIGNED` when Create is pressed — it
   * exercises `assigneeId === UNASSIGNED` and nothing else. **Dropping the
   * `assigneeCandidatesUnavailable !== undefined` term from the submit boundary
   * left all 39 cases in this file GREEN** (mutation measured 2026-09-23), i.e.
   * the submit-site check was covered by no test at all while looking covered.
   *
   * The transition is the thing: the picker works, a person is chosen, and THEN
   * the read fails. React state does not clear because the control that set it
   * stopped rendering, so a dialog that read only the control would submit an
   * assignee it had just told the person it would not use.
   */
  it('13.1370 a person chosen BEFORE the roster was withheld does not reach the draft', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const props = {
      open: true,
      userId: 'usr_ada',
      workspaceId: 'ws_1',
      typeOptions: [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }],
      parentCandidates: [],
      assigneeCandidates: PEOPLE,
      workflowStates: () => null,
      onCreate,
      onClose: () => undefined,
    };
    const { rerender } = render(<NewTicketDialog {...props} />);

    // The picker must really be usable to be used — a case that started in the
    // withheld state could never build the state this defect needs, which is
    // exactly why 13.1368 cannot see it.
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Balti Sangma' }),
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });

    // The roster goes away underneath the OPEN dialog, with the choice standing.
    rerender(
      <NewTicketDialog
        {...props}
        assigneeCandidatesUnavailable="HTTP 500 for /v1/workspaces/ws_1/members"
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Assignee' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    // `null`, and asserted on the DRAFT — the sentence on screen was already
    // correct, so a case reading the screen would have passed against the defect
    // (3.157's own lesson, which is why it is repeated here rather than cited).
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: null }));
  });
});

/**
 * Cases 13.1435–13.1441 — the STARTING STATUS select (starting-status
 * design, 2026-09-23; `DESIGN-starting-status-2026-09-23.md`'s "FORM"
 * section). `wf-errand` carries FOUR states: `todo` (open, creatable),
 * `doing` (active, creatable), `done` (terminal, NOT creatable) and `locked`
 * (active, NOT creatable) — the last one is what proves the select's filter
 * keys on `creatable` itself rather than on `category === 'terminal'`, which
 * `done` alone could not distinguish. `wf-chore` carries one state, `queued`,
 * so a type change that crosses workflows has an unambiguous single answer
 * to land on. Ranks are DISTINCT (`task` 3, `errand` 2, `chore` 1) so
 * `defaultRootTypeFor`'s tie-break never has to fire — the default type is
 * always `task` when nothing else says otherwise.
 */
describe('13.1435–13.1441 the Starting status select', () => {
  /**
   * `epic` is listed FIRST and shares `wf-errand` with `task` — deliberately,
   * so 13.1440 can tell "the first typeOption sharing the workflow" (the
   * design's literal text, and E5-16's own defect: the ladder arrives
   * rank-ascending, so an epic is always first) apart from `defaultRootTypeFor`
   * over that subset (this component's actual, measured behaviour — an epic
   * created into a column vanishes from every column, `isEpic`'s board
   * filter, owner ruling 2026-09-20). `task`'s rank (3) beats `epic`'s (1),
   * so `defaultRootTypeFor` picks `task` even though `epic` sits first in
   * this array.
   */
  const TYPES = [
    { id: 'epic', name: 'Epic', rank: 1, workflowId: 'wf-errand' },
    { id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' },
    { id: 'errand', name: 'Errand', rank: 2, workflowId: 'wf-errand' },
    { id: 'chore', name: 'Chore', rank: 1, workflowId: 'wf-chore' },
  ];
  const ERRAND_STATES = {
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open', creatable: true },
      { id: 'doing', name: 'Doing', category: 'active', creatable: true },
      { id: 'done', name: 'Done', category: 'terminal', creatable: false },
      // `creatable: false` on a NON-terminal state — a workflow setting can
      // forbid creation in a state that is not otherwise finished — so the
      // filter this select applies is proven to key on `creatable` itself,
      // not on `category === 'terminal'` (which `done` alone could not
      // distinguish).
      { id: 'locked', name: 'Locked', category: 'active', creatable: false },
    ],
  };
  const CHORE_STATES = {
    initialStateId: 'queued',
    states: [{ id: 'queued', name: 'Queued', category: 'open', creatable: true }],
  };
  function workflowStates(workflowId: string) {
    if (workflowId === 'wf-errand') return ERRAND_STATES;
    if (workflowId === 'wf-chore') return CHORE_STATES;
    return null;
  }
  function baseProps(extra: Record<string, unknown> = {}) {
    return {
      open: true,
      userId: 'usr_ada',
      workspaceId: 'ws_1',
      assigneeCandidates: [],
      typeOptions: TYPES,
      parentCandidates: [],
      workflowStates,
      onCreate: vi.fn(),
      onClose: () => undefined,
      ...extra,
    };
  }
  const statusTrigger = (): HTMLElement => screen.getByRole('button', { name: /Starting status/ });
  const backlogSwitch = (): HTMLElement => screen.getByRole('checkbox', { name: 'Starts in the backlog?' });

  it('13.1435 lists only creatable states and defaults to the workflow’s initial state', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog {...baseProps()} />);
    // `task` is the default type (highest rank), bound to `wf-errand`, whose
    // `initialStateId` is `todo` — the select must show it without any pick.
    expect(statusTrigger()).toHaveTextContent('To do');
    // Backlog defaults to ON, which disables the select (13.1436) — OFF it
    // to open the list this case is actually about.
    await user.click(backlogSwitch());
    await user.click(statusTrigger());
    const listbox = await screen.findByRole('listbox');
    // Neither the terminal `done` nor the merely-uncreatable `locked` reach
    // the list — this is the case the design's own "list terminal states"
    // mutation (dropping `creatableStates`'s filter) reddens: with the
    // filter gone this assertion sees FOUR options instead of two.
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'To do',
      'Doing',
    ]);
    expect(within(listbox).queryByRole('option', { name: 'Done' })).toBeNull();
    expect(within(listbox).queryByRole('option', { name: 'Locked' })).toBeNull();
  });

  it('29.165 the Estimate input is empty by default, omitted when empty, and an invalid number disables Create', () => {
    const onCreate = vi.fn();
    render(<NewTicketDialog {...baseProps({ onCreate })} />);
    const input = screen.getByLabelText('Estimate (days)');
    expect(input).toHaveValue(null);
    // The same pinned bounds as the sheet's input: jsdom enforces none of them, the browser's spinner and `:invalid` do.
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '365');
    expect(input).toHaveAttribute('step', '1');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input.closest('label')?.firstChild?.textContent?.trim()).toBe('Estimate (days)'); // the visible label, not only aria-label
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledTimes(1); // the next leg reads calls[0]; without this, no call at all would pass it
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty('estimate');
  });
  it('29.165 an estimate of 2.5 disables Create with its reason; 5 is carried as the number 5', () => {
    const onCreate = vi.fn();
    render(<NewTicketDialog {...baseProps({ onCreate })} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.change(screen.getByLabelText('Estimate (days)'), { target: { value: '2.5' } });
    expect(screen.getByRole('alert').textContent).toBe('Estimate must be a whole number of days from 1 to 365.');
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled();
    expect(screen.getByText('Fix the estimate to create the ticket')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Estimate (days)'), { target: { value: '5' } });
    expect(screen.queryByText('Fix the estimate to create the ticket')).toBeNull(); // control: a valid estimate leaves no hint
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ estimate: 5 });
  });
  it('29.165 the estimate is emptied on every open, like the dates', () => {
    const { rerender } = render(<NewTicketDialog {...baseProps()} />);
    fireEvent.change(screen.getByLabelText('Estimate (days)'), { target: { value: '5' } });
    expect(screen.getByLabelText('Estimate (days)')).toHaveValue(5); // control: the value took
    rerender(<NewTicketDialog {...baseProps({ open: false })} />);
    rerender(<NewTicketDialog {...baseProps()} />);
    expect(screen.getByLabelText('Estimate (days)')).toHaveValue(null);
  });
  it('29.165 a taken-back create reopens with its estimate (restoreDraft)', () => {
    const restoreDraft = { ticketId: '01J9GTKA000000000000000000', title: 'Order the tent', typeId: 'task', parentId: null, assigneeId: null, start: 'backlog' as const, priority: 'P2' as const };
    const { unmount } = render(<NewTicketDialog {...baseProps({ restoreDraft: { ...restoreDraft, estimate: 7 } })} />);
    expect(screen.getByLabelText('Estimate (days)')).toHaveValue(7);
    unmount();
    render(<NewTicketDialog {...baseProps({ restoreDraft })} />);
    expect(screen.getByLabelText('Estimate (days)')).toHaveValue(null); // control: a draft without one restores none
  });

  it('13.1436 is disabled with a helper sentence while "Starts in the backlog?" is ON', async () => {
    const user = userEvent.setup();
    // No record in storage: the switch's own default is ON (backlog), so
    // this is the ordinary open with nothing touched.
    render(<NewTicketDialog {...baseProps()} />);
    expect(backlogSwitch()).toBeChecked();
    expect(statusTrigger()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'A backlog ticket starts in To do when it enters focus',
    );

    // CONTROL, same dialog, same `it`: switched OFF, the select is live
    // again and the helper sentence is gone — the disabled state above is
    // this switch's doing, not a permanently disabled control.
    await user.click(backlogSwitch());
    expect(statusTrigger()).not.toBeDisabled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('13.1437 re-enables with the PREVIOUS value when the switch is switched back OFF', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog {...baseProps()} />);
    await user.click(backlogSwitch()); // OFF — the select is now live.
    await user.click(statusTrigger());
    await user.click(await screen.findByRole('option', { name: 'Doing' }));
    expect(statusTrigger()).toHaveTextContent('Doing');
    await user.click(backlogSwitch()); // ON — disabled, but the value is not cleared.
    expect(statusTrigger()).toBeDisabled();
    await user.click(backlogSwitch()); // OFF again.
    expect(statusTrigger()).not.toBeDisabled();
    expect(statusTrigger()).toHaveTextContent('Doing');
  });

  it('13.1438 a type change resets to the new workflow’s initial state UNLESS the value already exists there', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog {...baseProps()} />);
    await user.click(backlogSwitch()); // OFF, so the select is live for this case.
    await user.click(statusTrigger());
    await user.click(await screen.findByRole('option', { name: 'Doing' }));
    expect(statusTrigger()).toHaveTextContent('Doing');

    // `errand` shares `wf-errand` with `task` — `doing` still exists there,
    // so the value is KEPT. Picked through a REAL click, not
    // `fireEvent.change`: this file's own 3.157 docblock records that
    // `fireEvent.change` against a searchable Select's combobox input sets
    // the FILTER TEXT and selects nothing, which would leave `typeId`
    // unmoved and pass this case for the wrong reason (nothing would ever
    // reset, on EITHER assertion).
    await user.click(within(await openPicker(user, 'Type')).getByRole('option', { name: 'Errand' }));
    expect(statusTrigger()).toHaveTextContent('Doing');

    // `chore` is on `wf-chore`, which has no `doing` at all — the value
    // RESETS to that workflow's own initial state, `queued`.
    await user.click(within(await openPicker(user, 'Type')).getByRole('option', { name: 'Chore' }));
    expect(statusTrigger()).toHaveTextContent('Queued');
  });

  it('13.1439 the draft omits stateId in the two cases that say nothing new, and carries it otherwise', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTicketDialog {...baseProps({ onCreate })} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });

    // Backlog ON (the default): omitted, whatever the select underneath says.
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty('stateId');

    // Backlog OFF, value left at the workflow's own initial state: omitted —
    // the wire's own absence-means-initial rule, kept minimal.
    onCreate.mockClear();
    await user.click(backlogSwitch());
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty('stateId');

    // Backlog OFF, a DIFFERENT value chosen: carried.
    onCreate.mockClear();
    await user.click(statusTrigger());
    await user.click(await screen.findByRole('option', { name: 'Doing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ stateId: 'doing' }));
  });

  it('28.153 Save as draft sends no stateId even with Backlog OFF and a status chosen (a draft is born in the backlog)', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTicketDialog {...baseProps({ onCreate })} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    await user.click(backlogSwitch());
    await user.click(statusTrigger());
    await user.click(await screen.findByRole('option', { name: 'Doing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ draft: true, start: 'backlog' });
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty('stateId');
  });

  it('13.1440 initialSelection pre-fills the type and status and switches "Starts in the backlog?" OFF, and an unmatched workflow is ignored entirely (control, same dialog)', () => {
    const { rerender } = render(
      <NewTicketDialog
        {...baseProps({
          open: false,
          initialSelection: { workflowId: 'wf-errand', stateId: 'doing' },
        })}
      />,
    );
    // The OPEN transition, not a fresh mount: the effect this case is about
    // keys on `[open]`, and a dialog rendered already-open never exercises a
    // close→open transition — only `rerender`ing across one does.
    rerender(
      <NewTicketDialog
        {...baseProps({
          open: true,
          initialSelection: { workflowId: 'wf-errand', stateId: 'doing' },
        })}
      />,
    );
    // `epic` and `task` both share `wf-errand`, `epic` is listed FIRST (see
    // this block's own `TYPES` docblock) — and `task` is the one that
    // renders, because this component asks `defaultRootTypeFor` over the
    // types sharing the workflow, not a bare first-match: an epic created
    // into a column would vanish from it (`isEpic`'s board filter), which
    // "the first is pre-selected" read literally would have shipped.
    expect(screen.getByLabelText('Type')).toHaveValue('Task');
    expect(statusTrigger()).toHaveTextContent('Doing');
    expect(backlogSwitch()).not.toBeChecked();

    // CONTROL, same dialog instance, same `it`: closed, then reopened with a
    // `workflowId` NO type on this project shares — ignored ENTIRELY, not
    // merely type-less. The ordinary open: the default type (`task`, highest
    // rank among ALL of `TYPES`), its own initial state (`To do`), and the
    // switch at ITS ordinary default (backlog ON, nothing stored).
    rerender(<NewTicketDialog {...baseProps({ open: false })} />);
    rerender(
      <NewTicketDialog
        {...baseProps({ initialSelection: { workflowId: 'wf-nonexistent', stateId: 'x' } })}
      />,
    );
    expect(screen.getByLabelText('Type')).toHaveValue('Task');
    expect(statusTrigger()).toHaveTextContent('To do');
    expect(backlogSwitch()).toBeChecked();
  });

  it('13.1441 the remembered backlog preference is NOT overwritten by a board-initiated open', () => {
    window.localStorage.setItem(
      NEW_TICKET_START_KEY,
      JSON.stringify({ userId: 'usr_ada', start: 'backlog' }),
    );
    const { rerender } = render(<NewTicketDialog {...baseProps({ open: false })} />);

    // Opened FROM a board column: the switch answers OFF, per the design's
    // own ruling, whatever is remembered.
    rerender(
      <NewTicketDialog
        {...baseProps({ initialSelection: { workflowId: 'wf-errand', stateId: 'doing' } })}
      />,
    );
    expect(backlogSwitch()).not.toBeChecked();

    // Closed, then reopened UNSCOPED (the header's own "Create ticket") — if the
    // board-initiated open above had called `rememberNewTicketStart`, this
    // would read 'focus' and the switch would be OFF here too.
    rerender(<NewTicketDialog {...baseProps({ open: false })} />);
    rerender(<NewTicketDialog {...baseProps()} />);
    expect(backlogSwitch()).toBeChecked();
  });
});

/**
 * Cases 13.1443, 13.1445 — the birth START and DUE date inputs (addendum,
 * 2026-09-23: "put due date as well on the ticket creation form" … "both
 * start and due date"). `13.1444` — the `{date}` object `create-ticket-
 * flow.tsx` wraps a filled input into on the wire, and the same mutation on
 * THAT door — lives in `test/views/create-ticket-flow.test.tsx`, the one
 * place that can see the actual `ticket.created` payload rather than this
 * dialog's own bare-string draft.
 */
describe('13.1443, 13.1445 the birth Start/Due date inputs', () => {
  const TYPES = [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }];
  function baseProps(extra: Record<string, unknown> = {}) {
    return {
      open: true,
      userId: 'usr_ada',
      workspaceId: 'ws_1',
      assigneeCandidates: [],
      typeOptions: TYPES,
      parentCandidates: [],
      workflowStates: () => null,
      onCreate: vi.fn(),
      onClose: () => undefined,
      ...extra,
    };
  }

  it('13.1443 both inputs exist, empty by default, and the draft omits whichever is left empty', () => {
    const onCreate = vi.fn();
    render(<NewTicketDialog {...baseProps({ onCreate })} />);
    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.getByLabelText('Due date')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-30' } });
    // Due date left empty.
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    const draft = onCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(draft['startDate']).toBe('2026-09-30');
    expect(draft).not.toHaveProperty('dueDate');
  });

  it('13.1445 an invalid day disables Create with an inline reason, checked by the SAME dueDateValueSchema import', () => {
    render(<NewTicketDialog {...baseProps()} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    // A 5-digit year — MEASURED as the one malformed shape jsdom's own `<input
    // type="date">` does NOT sanitize to `''` before React ever sees a change
    // event. Every other shape tried (a bad month `2026-13-01`, an
    // out-of-calendar day `2026-02-30`, a wrong field order `30-09-2026`, and
    // a non-date string) is silently reset to `''` by the input itself, so
    // none of them can reach this component's own validation at all — this is
    // the only value that can actually exercise it.
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '99999-01-01' } });
    expect(screen.getByText('Due date must be a real day in YYYY-MM-DD form.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeDisabled();

    // Clearing it back to empty removes the refusal and re-enables Create —
    // an EMPTY input is omitted, not invalid, the same distinction the draft
    // itself draws (13.1443).
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } });
    expect(screen.queryByText('Due date must be a real day in YYYY-MM-DD form.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create ticket' })).not.toBeDisabled();
  });
});
