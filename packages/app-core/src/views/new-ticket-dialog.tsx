import { useState } from 'react';
import { Button, Dialog, Select } from '@gisik-nokma/ui';

export type NewTicketDraft = { title: string; typeId: string; parentId: string | null };

export type NewTicketDialogProps = {
  open: boolean;
  typeOptions: Array<{ id: string; name: string }>;
  parentCandidates: Array<{ id: string; title: string }>;
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
  onCreate: (draft: NewTicketDraft) => void;
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
  const [typeId, setTypeId] = useState(typeOptions[0]?.id ?? '');
  const [parentId, setParentId] = useState('');
  return (
    <Dialog open={open} title="New ticket" onClose={onClose}>
      <label className="gn-new-ticket__field">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="gn-new-ticket__field">
        Type
        <Select
          options={typeOptions.map((option) => ({ value: option.id, label: option.name }))}
          value={typeId === '' ? null : typeId}
          onChange={setTypeId}
          searchable
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
            onChange={setParentId}
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
      <div className="gn-new-ticket__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={title.trim() === '' || typeId === ''}
          onClick={() =>
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
              parentId:
                parentCandidatesUnavailable !== undefined || parentId === '' ? null : parentId,
            })
          }
        >
          Create
        </Button>
      </div>
    </Dialog>
  );
}
