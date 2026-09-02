import { useState } from 'react';
import { Button, Dialog } from '@gisik-nokma/ui';

export type NewTicketDraft = { title: string; typeId: string; parentId: string | null };

export type NewTicketDialogProps = {
  open: boolean;
  typeOptions: Array<{ id: string; name: string }>;
  parentCandidates: Array<{ id: string; title: string }>;
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
        <select value={typeId} onChange={(event) => setTypeId(event.target.value)}>
          {typeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label className="gn-new-ticket__field">
        Parent
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">None (project root)</option>
          {parentCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </label>
      <div className="gn-new-ticket__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={title.trim() === '' || typeId === ''}
          onClick={() => onCreate({ title, typeId, parentId: parentId === '' ? null : parentId })}
        >
          Create
        </Button>
      </div>
    </Dialog>
  );
}
