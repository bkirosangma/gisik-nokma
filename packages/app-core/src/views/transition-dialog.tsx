import { useEffect, useRef, useState } from 'react';
import type { FieldClaim, WorkflowDef } from '@gisik-nokma/domain';
import { Button, Dialog, Select } from '@gisik-nokma/ui';
import type { PrecheckResult } from '../precheck.js';
import { fieldAlreadyClaimed } from './field-claims.js';

type TransitionRules = WorkflowDef['transitions'][number]['rules'];

export type TransitionOption = { toStateId: string; name: string; rules: TransitionRules };

/**
 * Only what the definition declares — never an invented move (spec §7).
 *
 * `from: '*'` means "from any state", so a wildcard edge is offered from
 * everywhere except the state it points at: offering `doing → doing` would put
 * a move on screen that changes nothing and that the engine has no edge for.
 *
 * ## A target reachable by BOTH a wildcard and an exact edge (ruling P27)
 *
 * **The exact edge supplies the rules, and declaration order does not matter.**
 * That is not a preference — it is what the engine does, and this function's
 * whole purpose is to predict the engine. `packages/rule-engine/src/transition.ts:91-93`
 * resolves `find(exact) ?? find('*')`, and `precheck.ts`'s `needsMembership`
 * already mirrors it at :375-378. This is the third copy of one rule.
 *
 * This paragraph used to say the target *"keeps the FIRST edge's rules, in
 * declaration order, rather than merging two rule sets into one that no
 * transition declares"*. **The reasoning was sound and aimed at the wrong
 * alternative.** Merging was never what the engine does either, so rejecting it
 * settled nothing; the live question was exact-versus-wildcard, and answering
 * it by declaration order made this function disagree with the engine whenever
 * a definition happened to declare its wildcard first — a shape
 * `adviseWorkflowDef` only WARNS about, so it publishes clean. The visible
 * result was a transition offered with no evidence prompt on a move the server
 * then refuses, which reads to a user as a bug in the product rather than a
 * rule. A decision argued against a straw alternative reads as considered,
 * which is why this survived review.
 *
 * A target the definition names but has no state for is dropped rather than
 * rendered as a bare id: a select option a user cannot read is not an option.
 */
export function transitionOptions(def: WorkflowDef, fromStateId: string): TransitionOption[] {
  // Which targets are reachable at all, in declaration order of first mention.
  const targets: string[] = [];
  for (const transition of def.transitions) {
    if (transition.from !== fromStateId && transition.from !== '*') continue;
    if (transition.to === fromStateId) continue;
    if (!targets.includes(transition.to)) targets.push(transition.to);
  }
  return targets
    .map((toStateId) => {
      // The engine's resolution, in the engine's order.
      const edge =
        def.transitions.find((t) => t.from === fromStateId && t.to === toStateId) ??
        def.transitions.find((t) => t.from === '*' && t.to === toStateId);
      const state = def.states.find((candidate) => candidate.id === toStateId);
      if (edge === undefined || state === undefined) return null;
      return { toStateId, name: state.name, rules: edge.rules };
    })
    .filter((option): option is TransitionOption => option !== null);
}

/**
 * What the dialog hands back. This is the VIEW's vocabulary, not the ledger's:
 * `ticket.transitioned`'s shipped payload names the destination `to` and wraps
 * the comment as `{ text }` (`ticketTransitionedPayloadSchema`,
 * packages/domain/src/workflow.ts). The translation happens in exactly one
 * place — `TicketSheet.submitTransition` — so the dialog stays a dialog and
 * the wire shape has one author.
 */
export type TransitionSubmission = {
  toStateId: string;
  comment?: string;
  evidenceAttachmentId?: string;
  fieldValues: Record<string, unknown>;
};

export type TransitionDialogProps = {
  open: boolean;
  workflow: WorkflowDef;
  fromStateId: string;
  ticketFields: Record<string, FieldClaim>;
  onClose: () => void;
  onSubmit: (submission: TransitionSubmission) => void;
  /** Instant named-reason preview, advisory only (Task 6's `precheckEvent`, wired by the sheet). */
  precheck: (toStateId: string) => Promise<PrecheckResult>;
  /** The authority's answer, shown VERBATIM whenever present. */
  serverRefusal: { rule: string; reason: string } | null;
  /**
   * The opposite of an answer — Ruling 27 (board-prototype-port, 2026-09-16).
   * `serverRefusal` above is documented, in this exact file, as "the
   * authority's answer, shown VERBATIM". A dropped connection or an empty
   * `ingest` response is not an answer at all: nobody adjudicated, so there is
   * no verdict to carry verbatim. Before this ruling, `MoveArrows` (`board.tsx`)
   * built `{ rule: 'transport', … }`/`{ rule: 'no-response', … }` objects by
   * hand and fed them into `serverRefusal` — never through this package's own
   * `refuse()` (deliberately unexported, `rule-engine/src/index.ts:32-41`, for
   * exactly this reason: "a consumer outside this package has no business
   * minting a `Refusal`"), but arriving at the identical forbidden result
   * through a different door: a plain client-built object, shaped like a
   * refusal, rendered through the identical "Refused by the server — …"
   * sentence a REAL refusal uses. A reader could not tell "the server said no"
   * from "we never heard back", and the two call for opposite next actions —
   * fix the thing the server objected to, versus retry.
   *
   * This prop carries a PLAIN SENTENCE, never a `{ rule, reason }` pair, so it
   * cannot accidentally be mistaken for a `Refusal`-shaped value at the type
   * level either. Rendered in its own alert, its own CSS class
   * (`gn-refusal--transport`, reusing the `warning` tone `.gn-refusal--preview`
   * already uses — amber, not the danger-red `--server` wears), and never
   * alongside the words "Refused by the server".
   */
  transportError: string | null;
  uploadEvidence?: (file: File) => Promise<{ attachmentId: string }>;
  /**
   * The dialog only ever OFFERS what the gesture meant (owner request,
   * 2026-09-17, the board's `‹ ›` arrows): when present, the "Move to" select
   * is narrowed to these states — in `transitionOptions`'s own order, never
   * re-sorted — so a `›` that found two forward targets shows those two and
   * not the backward one the wildcard also declares. Absent (as `TicketSheet`'s
   * own "Move…" button leaves it) the full declared list is offered, exactly as
   * before. An id here that `transitionOptions` does not declare is simply not
   * offered: this prop can narrow the declared list, never widen it — the
   * spec's "never an invented move" holds through it.
   */
  offerStateIds?: string[];
  /**
   * Open already aimed at this state rather than on "Choose a state" — the
   * arrow (or the drop) resolved to exactly one target, so asking the person
   * to pick it again from a select is a step with nothing to decide. Read
   * once, on mount: a caller that wants a fresh aim per open mounts a fresh
   * dialog per open (`MoveArrows` does), which is also what stops a
   * cancelled pick surviving into the next open.
   */
  initialToStateId?: string | null;
};

/**
 * The prompts are the workflow's own declared rules, read off the chosen edge:
 * a comment box appears because `require-comment` is on THAT transition, not
 * because a dialog always has one. What cannot be satisfied here is refused
 * here — the Move button stays disabled and the reason is on screen.
 *
 * Two refusals can be visible at once and they are NOT the same kind of thing.
 * The pre-check is this client guessing with the shared engine over cached
 * state; the server's answer is the fact. When both are present the server's
 * renders in its own words, in an `alert`, and the preview is not rewritten to
 * agree with it — a client that paraphrased the authority would be telling the
 * user a second story about why their claim did not land.
 */
export function TransitionDialog({
  open,
  workflow,
  fromStateId,
  ticketFields,
  onClose,
  onSubmit,
  precheck,
  serverRefusal,
  transportError,
  uploadEvidence,
  offerStateIds,
  initialToStateId,
}: TransitionDialogProps) {
  const options = transitionOptions(workflow, fromStateId).filter(
    (option) => offerStateIds === undefined || offerStateIds.includes(option.toStateId),
  );
  const [toStateId, setToStateId] = useState(initialToStateId ?? '');
  const [comment, setComment] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [evidenceAttachmentId, setEvidenceAttachmentId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrecheckResult | null>(null);

  const selected = options.find((option) => option.toStateId === toStateId) ?? null;
  const rules: TransitionRules = selected?.rules ?? [];
  const needsComment = rules.some((rule) => rule.kind === 'require-comment');
  const needsEvidence = rules.some((rule) => rule.kind === 'require-evidence');
  const requiredFields = rules.flatMap((rule) => (rule.kind === 'require-field' ? [rule.field] : []));
  // `fieldAlreadyClaimed` (`field-claims.ts`) is the SAME predicate
  // `moveOutcome`'s gate reads (Task 12, Ruling 25) — extracted so the two
  // never derive "is this field already satisfied" two different ways.
  const missingFields = requiredFields.filter(
    (field) => !fieldAlreadyClaimed(ticketFields, field) && (fieldValues[field] ?? '') === '',
  );

  // The same ref idiom `useLiveQuery` uses, and for the same reason: `precheck`
  // is a fresh closure on every render of the sheet above, and `selected` is a
  // fresh object on every render of this component. Either one in the dependency
  // list makes the effect fire on every render, and the effect calls `setPreview`.
  //
  // MEASURED, because "it would loop" is the kind of claim that is usually
  // wrong in an interesting way: the plan's own `[selected, precheck]` shape
  // does NOT hang — React bails out once `setPreview` settles on an equal
  // value — it RUNS AWAY, asking the pre-check 22 times for two chosen states
  // instead of twice (`expected [ 'waiting', 'waiting', …(20) ] to deeply
  // equal [ 'waiting', 'done' ]`). Against the real engine that is 22 rule
  // evaluations per choice; against a network-backed pre-check it would be 22
  // requests. The STATE ID is what actually changes when the user chooses a
  // different move, so that is the dependency.
  const precheckRef = useRef(precheck);
  precheckRef.current = precheck;

  useEffect(() => {
    setPreview(null);
    if (toStateId === '') return;
    let cancelled = false;
    void precheckRef.current(toStateId).then((result) => {
      if (!cancelled) setPreview(result);
    });
    return () => {
      cancelled = true;
    };
  }, [toStateId]);

  const blocked =
    selected === null ||
    (needsComment && comment.trim() === '') ||
    (needsEvidence && evidenceAttachmentId === null) ||
    missingFields.length > 0;

  const submit = () => {
    if (selected === null) return;
    const submission: TransitionSubmission = {
      toStateId: selected.toStateId,
      fieldValues: Object.fromEntries(
        requiredFields
          .filter((field) => (fieldValues[field] ?? '') !== '')
          .map((field) => [field, fieldValues[field]]),
      ),
    };
    if (needsComment) submission.comment = comment.trim();
    if (evidenceAttachmentId !== null) submission.evidenceAttachmentId = evidenceAttachmentId;
    onSubmit(submission);
  };

  return (
    <Dialog open={open} title="Move ticket" onClose={onClose}>
      <div className="gn-transition__field">
        <span>Move to</span>
        <Select
          options={options.map((option) => ({ value: option.toStateId, label: option.name }))}
          value={toStateId === '' ? null : toStateId}
          onChange={setToStateId}
          placeholder="Choose a state"
          aria-label="Move to"
        />
      </div>

      {needsComment ? (
        <label className="gn-transition__field">
          Comment (required by this transition)
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>
      ) : null}

      {requiredFields.map((field) =>
        fieldAlreadyClaimed(ticketFields, field) ? null : (
          <label key={field} className="gn-transition__field">
            {`${field} (required before this transition)`}
            <input
              value={fieldValues[field] ?? ''}
              onChange={(event) =>
                setFieldValues((current) => ({ ...current, [field]: event.target.value }))
              }
            />
          </label>
        ),
      )}

      {needsEvidence ? (
        uploadEvidence !== undefined ? (
          <label className="gn-transition__field">
            Evidence (required by this transition)
            <input
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file === undefined) return;
                void uploadEvidence(file).then(({ attachmentId }) =>
                  setEvidenceAttachmentId(attachmentId),
                );
              }}
            />
          </label>
        ) : (
          // Not a disabled button with no explanation, and not a silent pass:
          // the rule is real, this build cannot satisfy it, and both halves are
          // said out loud.
          <p className="gn-transition__notice">
            This transition requires an attachment as evidence. Evidence upload is not available in
            this build yet.
          </p>
        )
      ) : null}

      {rules.some((rule) => rule.kind === 'restrict-to' || rule.kind === 'require-different-user') ? (
        <p className="gn-transition__notice">
          {`This transition carries ${rules
            .filter((rule) => rule.kind === 'restrict-to' || rule.kind === 'require-different-user')
            .map((rule) => rule.kind)
            .join(' and ')} rules — the server decides, and its answer appears here.`}
        </p>
      ) : null}

      {preview !== null && preview.kind === 'refused' ? (
        <p className="gn-refusal gn-refusal--preview">
          {`instant check — ${preview.rule}: ${preview.reason}`}
        </p>
      ) : null}

      {serverRefusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {`Refused by the server — ${serverRefusal.rule}: ${serverRefusal.reason}`}
        </p>
      ) : null}

      {/* Ruling 27 — never the same sentence, never the same class, never a
          `{rule, reason}` pair: see this prop's own docblock above. */}
      {transportError !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--transport">
          {transportError}
        </p>
      ) : null}

      <div className="gn-transition__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={blocked} onClick={submit}>
          Move
        </Button>
      </div>
    </Dialog>
  );
}
