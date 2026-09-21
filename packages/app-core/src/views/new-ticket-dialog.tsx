import { useEffect, useRef, useState } from 'react';
import { DEEPEST_RANK } from '@gisik-nokma/domain';
import { Button, Dialog, Select } from '@gisik-nokma/ui';

/**
 * A ticket type as this dialog is handed it: the label to paint, and the RANK
 * the root-creation rule turns on.
 *
 * `rank` is required, and that is the point rather than tidiness. The default
 * below cannot be derived from an id and a name — the previous default was
 * `typeOptions[0]`, which named the TOP of the hierarchy because the ladder
 * arrives rank-ascending — so a caller that does not say what rank each type
 * sits at leaves this dialog with no honest way to choose one. An optional
 * `rank` would compile at every call site and silently restore that defect
 * wherever it was omitted.
 */
export type TypeOption = { id: string; name: string; rank: number };

/**
 * The type a ROOT-LEVEL new ticket starts on: the deepest one that may sit at
 * project root at all.
 *
 * `DEEPEST_RANK` is the hierarchy rule's own floor (`packages/domain/src/ticket-types.ts`):
 * a type at that rank or below needs a parent, so offering one as the default
 * for a ticket with no parent would pre-select an answer the engine refuses.
 * Among the legal ones the DEEPEST is chosen, because rank is depth in the
 * hierarchy and a root ticket is the broadest kind of work the workspace files
 * — the same "nearest kind of work" reasoning `subtaskTypeFor` uses from the
 * other direction (there the ladder is consulted downward from a parent; here
 * upward from the root).
 *
 * Ties are broken by `id`, so the answer does not depend on the order the
 * server happened to return the ladder in. `null` when NOTHING is legal: a
 * workspace whose every type needs a parent has no root-legal default, and the
 * honest answer is then an empty picker rather than a type the door will
 * refuse.
 */
export function defaultRootTypeFor(ladder: readonly TypeOption[]): TypeOption | null {
  const legal = ladder.filter((type) => type.rank < DEEPEST_RANK);
  if (legal.length === 0) return null;
  return legal.reduce((best, type) =>
    type.rank > best.rank || (type.rank === best.rank && type.id < best.id) ? type : best,
  );
}

export type NewTicketDraft = {
  title: string;
  typeId: string;
  parentId: string | null;
  /**
   * Where the ticket is born (backlog/closed spec §5.4, 2026-09-17):
   * `'backlog'` unless the checkbox below is shown AND left checked. ALWAYS
   * present — never optional here, even though `ticketCreatedPayload` on the
   * wire treats an absent `start` as `'focus'` for events older than this
   * field. That absence-means-focus rule exists so a v1 event keeps its v1
   * meaning; it says nothing about what THIS client, built after the field
   * exists, is allowed to leave out. `create-ticket-flow.tsx`'s `create()`
   * sends this value on every `ticket.created` it builds (see the comment on
   * that payload), and this type keeping the field required is what makes an
   * accidental omission upstream (in the state built below) a compile error
   * rather than a silently-focused ticket nobody asked for.
   */
  start: 'backlog' | 'focus';
};

export type NewTicketDialogProps = {
  open: boolean;
  typeOptions: readonly TypeOption[];
  /**
   * `inFocus` (backlog/closed spec §5.4, 2026-09-17): whether THIS candidate,
   * if chosen as parent, would show the "Start in focus" checkbox below — a
   * candidate sitting outside the universal Backlog state and never closed.
   * Computed by the caller from data this component does not have (a
   * candidate's own `stateId`/`closed`, ruling: this dialog only ever sees
   * `{id, title}` shapes otherwise) — the same division of labour
   * `parentCandidatesUnavailable`/`parentCandidatesNarrowing` already draw:
   * this component renders a caller's claim, it does not derive one.
   */
  parentCandidates: Array<{ id: string; title: string; inFocus: boolean }>;
  /**
   * Why the parent list could not be loaded, when it could not be.
   *
   * Distinguishes "this project has no possible parent" from "we could not find
   * out" — an EMPTY picker asserts the first, and asserting it falsely inside a
   * modal is worse than saying nothing, because the sentence that would correct it
   * is on the page behind. When set, the picker is replaced by this reason and the
   * draft leaves with `parentId: null`, which is project root: the one creation
   * that never needed a parent and so should never have been blocked by a list.
   *
   * **That second half is enforced at the SUBMIT site, not by hiding the picker.**
   * This prop can arrive after a selection has already been made — the list answers,
   * the user chooses a parent, a later read fails — and React state does not clear
   * because the control that set it stopped rendering. Withheld here means withheld
   * from the DRAFT; anything less makes this sentence a claim the payload contradicts.
   */
  parentCandidatesUnavailable?: string;
  /**
   * What narrowing the candidate list was built under, when it was built under
   * one — NOT the same fact as `parentCandidatesUnavailable`, and kept separate
   * for the reason that prop exists at all.
   *
   * `parentCandidates` is whatever the caller could see. Once the caller can be
   * asked a narrower question, "everything I can see" stops meaning "everything
   * there is", and a picker offering the narrowed set asserts *these are the
   * tickets that could be a parent* — the same silent claim an EMPTY picker
   * makes, one notch quieter. The user cannot read the page behind a modal to
   * find the control that caused it.
   */
  parentCandidatesNarrowing?: string;
  /**
   * The claim, handed up. May be ASYNCHRONOUS, and the dialog waits on it: that
   * returning promise is the only thing that can tell the Create control when
   * the attempt has settled, and without that this dialog cannot state the
   * in-flight state it must not double-file through (see the guard below).
   * A caller that returns nothing is still fine — `Promise.resolve` covers it.
   */
  onCreate: (draft: NewTicketDraft) => void | Promise<void>;
  onClose: () => void;
};

/**
 * The draft, and nothing else. It states a claim and hands it up; it does not
 * submit, does not pre-check and does not know what a refusal is — the flow
 * around it owns all three, so the reopen offer has one author.
 *
 * `parentId` leaves as `null` for "project root" rather than the empty string
 * the `<select>` carries: `ticketCreatedPayload` types `parentId` as a nullable
 * ULID, and `''` is neither. The translation happens here, once, at the edge
 * where the option value stops being a DOM detail.
 *
 * The title is trimmed for the emptiness CHECK and sent as typed otherwise —
 * `ticketCreatedPayload` refuses an all-whitespace title (ruling P15) and
 * stores padding verbatim, so trimming the stored value would be this client
 * putting words in the actor's mouth.
 */
export function NewTicketDialog({
  open,
  typeOptions,
  parentCandidates,
  parentCandidatesUnavailable,
  parentCandidatesNarrowing,
  onCreate,
  onClose,
}: NewTicketDialogProps) {
  const [title, setTitle] = useState('');
  /**
   * NOT `typeOptions[0]`, which is what this was until 2026-09-21 (E5-16).
   * The ladder arrives RANK-ASCENDING, so `[0]` was the top of the hierarchy —
   * `epic`, rank 1 — and a person who typed a title and pressed Create filed an
   * Epic. In the dev project's own distribution (Epic 3 · Errand 24 ·
   * Story/Task/Sub-task 0) that was the least likely choice eight times in
   * nine, and on the web the mistake is ONE-WAY: the sheet's `Type` row is
   * read-only, so an accidental Epic has to be deleted and re-filed. An Epic is
   * structurally different besides — it heads a hierarchy and appears in the
   * Backlog as a group band rather than as a ticket.
   *
   * The empty string is now reachable only when the caller hands over a ladder
   * with NO root-legal type at all; see `defaultRootTypeFor`.
   */
  const [typeId, setTypeId] = useState(defaultRootTypeFor(typeOptions)?.id ?? '');
  /**
   * ⚠ THE SEED RUNS ONCE, AND THE LADDER'S IDENTITY LEGITIMATELY CHANGES UNDER
   * IT (E2-33a, 2026-09-21).
   *
   * The caller mounts this dialog under `BUILTIN_TYPE_LADDER` while the type read
   * is in flight and hands the workspace's own list over afterwards
   * (`page.tsx`'s `typeOptions`) — and a `useState` initialiser runs once, so
   * nothing re-read the new list. With the old id still in state the control
   * keeps PAINTING it (react-aria's combo keeps its input text) while the
   * offered options no longer contain it, and Create submitted an id off the
   * list.
   *
   * The re-seed below is deliberately narrow: it fires ONLY when the standing id
   * has LEFT the list, and it re-asks the same question the initial seed asked
   * (`defaultRootTypeFor`). It never overwrites a choice the person can still
   * make — re-seeding on every list change would silently replace a type someone
   * had picked, which is the opposite defect (E5-16's own).
   */
  useEffect(() => {
    if (typeId === '') return;
    if (typeOptions.some((option) => option.id === typeId)) return;
    setTypeId(defaultRootTypeFor(typeOptions)?.id ?? '');
  }, [typeOptions, typeId]);
  const [parentId, setParentId] = useState('');
  // Checked by default (spec §5.4), PER CHOSEN PARENT — Ruling 40 (coordinator,
  // fix round 1, 2026-09-17): the Parent picker's own `onChange` below resets
  // this to `true` on every selection, so switching to a DIFFERENT in-focus
  // parent always renders THAT parent's checkbox at its spec-mandated
  // starting state, rather than inheriting whatever a previously-chosen
  // parent's box was left at. See that `onChange` for the full reasoning;
  // this state's own job is only to hold whatever the box currently shows.
  const [startInFocus, setStartInFocus] = useState(true);

  // The SAME "no usable parent" test the submit boundary below already makes
  // for `parentId` — reused, not re-derived, so the two can never disagree
  // about what counts as a real parent. `undefined` here (the picker itself
  // withheld) counts as "no usable parent" for the identical reason `parentId`
  // leaves as `null` in that case: a withheld picker's `parentId` state may
  // still hold a stale selection (3.157's own invariant), and this dialog must
  // not read a chosen candidate's `inFocus` off state the payload itself
  // refuses to send.
  const noUsableParent = parentCandidatesUnavailable !== undefined || parentId === '';
  const chosenParent = noUsableParent
    ? undefined
    : parentCandidates.find((candidate) => candidate.id === parentId);
  // Spec §5.4: the checkbox exists ONLY when the parent actually chosen in
  // THIS dialog is in focus — never for no parent, a withheld picker, or a
  // backlog/closed one, which is exactly `chosenParent?.inFocus === true`.
  const startCheckboxVisible = chosenParent?.inFocus === true;

  /**
   * TWO flags, on purpose, because they answer different questions at different
   * instants — the split `TicketEditorSlot` adopted after measuring this exact
   * failure, and the reason its docblock is worth reading before touching this.
   *
   * `submitting` is render state and drives `disabled`. It is USELESS as a
   * re-entrancy guard: the attribute is not re-read from the DOM between two
   * clicks in one React batch, so both handlers run and both see the pre-commit
   * `false`. (`disabled` carried only the title/type gates before this, so a
   * second press was not even a race — the Create control had no guard of any
   * kind.) `submittingRef` is set SYNCHRONOUSLY inside the handler, before the
   * first await, which is the only place a second click in the same tick can be
   * seen.
   *
   * THE COST IS NOT COSMETIC. `onCreate` reaches `create-ticket-flow.tsx`, which
   * mints `entity: { kind: 'ticket', id: newUlid() }` PER CALL: two presses are
   * two distinct `ticket.created` events with two distinct ids — two tickets, in
   * an append-only ledger that cannot take either back.
   */
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const create = (): void => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    // The guard LIFTS on settle either way: a refusal leaves the dialog open
    // with nothing in flight, and the person must be able to press again. The
    // rejection is NOT swallowed — `.finally` passes it through exactly as the
    // previous fire-and-forget call did, so a transport failure still surfaces
    // where it surfaced before rather than becoming a silent no-op here.
    void Promise.resolve(
      onCreate({
        title,
        typeId,
        // `parentCandidatesUnavailable` is checked HERE and not only where the
        // picker is drawn, because hiding a control does not clear the state
        // behind it. `parentId` survives from any earlier selection, and this
        // prop can arrive AFTER one: the list answers, the user picks a parent,
        // a later read fails, and the picker is replaced by a sentence saying
        // the ticket will be created at project root. Emitting `parentId` then
        // would submit the ticket under a parent the dialog had just told the
        // user it would not have — the screen saying one thing and the payload
        // doing another, which is the exact defect this component's docblock
        // exists to refuse. Witnessed at 3.157, with a control proving the
        // parent still travels when the picker IS shown.
        parentId: noUsableParent ? null : parentId,
        // Spec §5.4: 'backlog' unless the checkbox above is BOTH visible
        // and checked. `startCheckboxVisible` already carries "a usable,
        // in-focus parent is chosen" — re-testing `noUsableParent` here
        // would be a second, driftable spelling of the same fact this
        // component already computed once above.
        start: startCheckboxVisible && startInFocus ? 'focus' : 'backlog',
      }),
    ).finally(() => {
      submittingRef.current = false;
      setSubmitting(false);
    });
  };

  return (
    <Dialog open={open} title="New ticket" onClose={onClose}>
      <label className="gn-new-ticket__field">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      {/*
        Spec §5.4: this note is unconditional — every ticket this dialog can
        create starts in the backlog UNLESS the checkbox below both exists and
        stays checked. Placed under Title (spec's own words), ahead of the
        Parent picker whose choice is what can turn the sentence into a
        checkbox instead of leaving it standing alone.
      */}
      <p className="gn-new-ticket__note">Starts in the backlog</p>
      <label className="gn-new-ticket__field">
        Type
        <Select
          options={typeOptions.map((option) => ({ value: option.id, label: option.name }))}
          value={typeId === '' ? null : typeId}
          onChange={setTypeId}
          searchable
          // The empty start has to SAY it is empty. The shared Select's own
          // default is the bare `Select…`; this names the thing being chosen,
          // the way the Move dialog's destination names its own (`Choose a
          // state`), so a disabled Create beside it has a readable reason.
          placeholder="Choose a type"
          aria-label="Type"
        />
      </label>
      <label className="gn-new-ticket__field">
        Parent
        {parentCandidatesUnavailable === undefined ? (
          /*
            `''` is passed through as a REAL option, never as `Select`'s
            "nothing chosen" sentinel — the one place in this rollout where the
            usual `value={x === '' ? null : x}` translation would be wrong.
            "None (project root)" is a permanently offered CHOICE, not the
            absence of one: it is what this picker shows before anything is
            touched, and picking it back is how a user un-nests a ticket. Handing
            `null` here instead would render the generic "Select…" placeholder
            and silently delete that sentence from the screen.

            `Select` carries `''` as an ordinary key end to end — MEASURED against
            the real component, not inferred: the trigger displays
            "None (project root)" with `value=""`, and choosing that row fires
            `onChange('')` (its `if (key != null)` guard admits `''`). The `''` →
            `null` translation stays exactly where this component's docblock
            already puts it, at the SUBMIT boundary below, where the option value
            stops being a DOM detail and becomes a nullable ULID.
          */
          <Select
            options={[
              { value: '', label: 'None (project root)' },
              ...parentCandidates.map((candidate) => ({
                value: candidate.id,
                label: candidate.title,
              })),
            ]}
            value={parentId}
            onChange={(value) => {
              setParentId(value);
              // Ruling 40 (coordinator, fix round 1, 2026-09-17): "checked by
              // default" (spec §5.4) is a promise PER CHOSEN PARENT, not a
              // one-time initial value for the whole dialog session. Before
              // this reset, unticking the box for in-focus parent A and then
              // picking a DIFFERENT in-focus parent B rendered B's checkbox
              // UNTICKED on its very first appearance — a starting state B's
              // own "checked by default" spec line never asked for; nothing
              // about parent B's checkbox should remember what a person did
              // to parent A's.
              //
              // Fires on EVERY selection from this picker — including
              // switching AWAY from an in-focus parent (to "None", or to a
              // backlog/closed one, which hides the box) and including
              // re-selecting the SAME parent the box is already showing —
              // not only when the newly chosen candidate differs from the
              // last. That is the simpler, uniform rule: "reset whenever this
              // control fires" needs no second test for "did the value
              // actually change", and it costs nothing while the box is
              // hidden, since `start` is only ever read as
              // `startCheckboxVisible && startInFocus` — a reset nobody can
              // see never reaches the payload.
              setStartInFocus(true);
            }}
            searchable
            aria-label="Parent"
          />
        ) : (
          <p role="status" className="gn-new-ticket__parent-unavailable">
            This ticket will be created at project root: the list of tickets that could be a
            parent cannot be shown. {parentCandidatesUnavailable}
          </p>
        )}
      </label>
      {/*
        OUTSIDE the `<label>`, and that is not cosmetic — though WHY it holds has
        changed, and the old reason is no longer the live one.

        It used to be self-enforcing. The picker was a bare `<select>` taking its
        accessible name from this `<label>`'s TEXT, so a sentence moved inside was
        absorbed into that name: `getByLabelText('Parent')` stopped resolving and a
        screen reader announced the whole disclosure as the field's label. Measured
        at the time: putting it inside turned 12.388 red with "Unable to find a
        label with the text of: Parent" while the field rendered fine.

        The shared-`Select` migration ended that mechanism. `Select` carries an
        explicit `aria-label="Parent"`, which WINS over a wrapping label's text, so
        the accessible name is now correct wherever this span sits — the corruption
        is structurally impossible rather than merely avoided. Good, but it retired
        the only thing that PROVED the placement: moved inside today, nothing about
        the name would complain.

        So 12.388 now pins this span's position directly —
        `getByTestId('parent-narrowing').closest('label')` must be null — and THAT
        assertion, not the accessible name, is what keeps the arrangement below
        honest. The placement itself still costs nothing and stays.

        Beside the picker rather than on the page behind it, because
        `parentCandidates` is whatever the caller could see — and once the caller
        can be asked a narrower question, "everything I can see" stops meaning
        "everything there is". A narrowed picker asserts THESE are the tickets that
        could be a parent, which is the same silent claim an empty picker makes,
        one notch quieter, and a person inside a modal cannot read the control that
        caused it.
      */}
      {parentCandidatesUnavailable === undefined && parentCandidatesNarrowing !== undefined ? (
        <span className="gn-new-ticket__parent-narrowing" data-testid="parent-narrowing">
          showing only {parentCandidatesNarrowing} — a ticket outside that is not offered here
        </span>
      ) : null}
      {/*
        Spec §5.4: exists ONLY while the parent actually chosen above is in
        focus — `startCheckboxVisible` reads the SAME `chosenParent` the
        submit boundary below reads, so this box can never be on screen while
        the payload it claims to set is about to leave as `'backlog'` anyway,
        or absent while a `'focus'` claim is about to leave with nothing on
        screen to explain it.

        Checked by default (spec: "checked by default, and sets
        `start: 'focus'`") — the labelled `<input type="checkbox">` idiom this
        codebase already uses (`account/notifications-section.tsx`), not the
        text-first `<label>{text}<input/></label>` shape Title/Type/Parent use
        above: those wrap a text CONTROL, this wraps a boolean one, and a
        checkbox reading its own name from LEADING text is the established
        pattern for that shape here.
      */}
      {startCheckboxVisible ? (
        <label className="gn-new-ticket__field gn-new-ticket__start-focus">
          <input
            type="checkbox"
            checked={startInFocus}
            onChange={(event) => setStartInFocus(event.target.checked)}
          />
          Start in focus
        </label>
      ) : null}
      <div className="gn-new-ticket__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          // `submitting` is the third term and it is the RENDER half of the guard
          // above: the ref is what actually stops a duplicate, and this is what
          // tells the person a request is already on the wire. A control that
          // looks pressable while it is not is the same lie in the other
          // direction.
          //
          // The last term is MEMBERSHIP, not emptiness (E2-33a): `typeId === ''`
          // is a string test, and it passes for an id the list no longer offers.
          // The effect above re-seeds that case already, so this term is the
          // belt to its braces — a payload may only ever carry a type the picker
          // is offering, whatever a future seed does.
          disabled={
            title.trim() === '' ||
            typeId === '' ||
            !typeOptions.some((option) => option.id === typeId) ||
            submitting
          }
          onClick={create}
        >
          Create
        </Button>
      </div>
    </Dialog>
  );
}
