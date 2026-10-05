import { useEffect, useRef, useState } from 'react';
import {
  BACKLOG_STATE_ID,
  statesWithBacklog,
  transitionsWithBacklog,
  type FieldClaim,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import { Button, Dialog, Select } from '@gisik-nokma/ui';
import type { PrecheckResult } from '../precheck.js';
import { writeFailureRefusalClass } from '../session-expired.js';
import { fieldAlreadyClaimed } from './field-claims.js';

type TransitionRules = WorkflowDef['transitions'][number]['rules'];

export type TransitionOption = { toStateId: string; name: string; rules: TransitionRules };

/**
 * What the definition declares, plus the universal Backlog edges — never an
 * invented move (spec §7; the Backlog half is spec §4, see below).
 *
 * `from: '*'` means "from any state", so a wildcard edge is offered from
 * everywhere except the state it points at: offering `doing → doing` would put
 * a move on screen that changes nothing and that the engine has no edge for.
 *
 * ## A target reachable by BOTH a wildcard and an exact edge (ruling P27)
 *
 * **The exact edge supplies the rules, and declaration order does not matter.**
 * That is not a preference — it is what the engine does, and this function's
 * whole purpose is to predict the engine. `packages/rule-engine/src/transition.ts:127-128`
 * resolves `find(exact) ?? find('*')`, and `precheck.ts`'s `needsMembership`
 * already mirrors it at :849-850. This is the third copy of one rule.
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
 *
 * ## The universal Backlog edges, since 2026-09-17 (backlog/closed spec §4)
 *
 * Start (`backlog → def.initialStateId`) and Send to backlog (every declared
 * non-terminal state → backlog) are offered like declared ones — read off the
 * SAME `statesWithBacklog`/`transitionsWithBacklog` helpers the engine itself
 * resolves edges over (`packages/rule-engine/src/transition.ts:110-125`), so
 * this function still predicts the engine rather than keeping a second,
 * driftable copy of the universal set.
 *
 * Backlog is a special case within that, not an ordinary member of it
 * (controller ruling, Task 6): a declared `from: '*'` edge means "from any
 * AUTHORED state" — the author who wrote it never knew about the universal
 * Backlog — so a wildcard edge never resolves FROM backlog; its only exit is
 * Start. Without this, a template declaring `* → done` would let a backlog
 * ticket jump straight to Done, skipping Start entirely — the exact hazard
 * `transition.ts`'s own docblock names for the engine, mirrored here.
 */
export function transitionOptions(def: WorkflowDef, fromStateId: string): TransitionOption[] {
  if (fromStateId === BACKLOG_STATE_ID) {
    // Read off `transitionsWithBacklog(def)` itself, not re-derived by hand
    // (fix round 1, review Important 1): the paragraph above claims the
    // universal set comes from "the SAME helpers … rather than a second,
    // driftable copy", and a literal `def.initialStateId`/`rules: []` here
    // was exactly that second copy — correct only because
    // `universalTransitions` happens to build Start the same way today.
    const start = transitionsWithBacklog(def).find((t) => t.from === BACKLOG_STATE_ID);
    if (start === undefined) return [];
    const state = statesWithBacklog(def).find((candidate) => candidate.id === start.to);
    return state === undefined ? [] : [{ toStateId: start.to, name: state.name, rules: start.rules }];
  }

  const allTransitions = transitionsWithBacklog(def);
  // Which targets are reachable at all, in declaration order of first mention.
  const targets: string[] = [];
  for (const transition of allTransitions) {
    if (transition.from !== fromStateId && transition.from !== '*') continue;
    if (transition.to === fromStateId) continue;
    if (!targets.includes(transition.to)) targets.push(transition.to);
  }
  return targets
    .map((toStateId) => {
      // The engine's resolution, in the engine's order.
      const edge =
        allTransitions.find((t) => t.from === fromStateId && t.to === toStateId) ??
        allTransitions.find((t) => t.from === '*' && t.to === toStateId);
      const state = statesWithBacklog(def).find((candidate) => candidate.id === toStateId);
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
  /**
   * Instant named-reason preview, advisory only (Task 6's `precheckEvent`,
   * wired by the sheet).
   *
   * ⚠ **IT TAKES THE EVIDENCE ID, AND IT DID NOT UNTIL INDEPENDENT REVIEW
   * FOUND THE CONSEQUENCE.** The pre-check builds a candidate
   * `ticket.transitioned` and runs the real engine over it, so a rule that
   * needs a fact the candidate cannot carry is evaluated as REFUSED. With a
   * `(toStateId) => …` signature the candidate could only ever say `{ to }`,
   * and `evaluateRequireEvidence` reads `payload.evidenceAttachmentId` — so
   * attaching a file to a `require-evidence` move left the preview insisting
   * *"none was provided"* beside a Move button that had just become **enabled**.
   * A refusal printed next to the control it contradicts, telling the person
   * the move was still blocked when it was not.
   *
   * This is the same class of omission as `BoardMoveCapability.uploadEvidence`
   * needing a `ticketId`: **a contract that cannot carry a fact its caller
   * holds.** Advisory still — it decides nothing — but it must be able to see
   * what the submission will actually carry.
   *
   * ⚠ **THE SAME OMISSION, ONE RULE KIND OVER — E2-40.** `fieldValues` was
   * missing here too, and the consequence is the same sentence: the dialog
   * renders an input for every field a `require-field` rule names, its OWN gate
   * clears the moment the person types (`missingFields`), and the submission
   * sends those claims first in the ordered batch — while the preview, asked
   * with two arguments, kept answering *"the field is not set"*. `require-field`
   * differs from `require-evidence` in WHERE its value is read
   * (`rule-engine/src/rules/require-field.ts:9` reads the ticket state, not the
   * payload), so the value travels as a state overlay rather than a payload key;
   * see `precheckEvent`'s `pendingFields` for that reasoning.
   */
  precheck: (
    toStateId: string,
    evidenceAttachmentId?: string | null,
    fieldValues?: Record<string, string>,
    comment?: string,
  ) => Promise<PrecheckResult>;
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
   * `refuse()` (deliberately unexported, `rule-engine/src/index.ts:34-43`, for
   * exactly this reason: "a consumer outside this package has no business
   * minting a `Refusal`"), but arriving at the identical forbidden result
   * through a different door: a plain client-built object, shaped like a
   * refusal, rendered through the identical "Refused by the server: …"
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
  /**
   * E5-27 — is a submission IN FLIGHT? While true the Move button is disabled.
   *
   * `blocked` (`:360-364` below) is the FORM's validity and nothing else: it
   * says whether what is on screen could be submitted, never whether something
   * already was. Without this prop the dialog had no way to express the second
   * fact, so a dropped connection left Move enabled and the person's natural
   * response — press again — was indistinguishable from the first press for a
   * request that had in fact gone through.
   *
   * OPTIONAL, and its absence means "no latch is worn on this mount" rather
   * than "not submitting": `board.tsx`'s card dialog passes nothing, because
   * the board holds its latch on the arrows (`MoveArrows.submitting`) and its
   * dialog path is a different finding. A default of `false` would have made
   * that call site assert something untrue about itself.
   *
   * The caller owns the flag, and it must clear it in a `finally` — this
   * dialog cannot tell a resolved submission from a rejected one, and a latch
   * cleared only on the happy path disables Move for ever the first time the
   * network drops.
   */
  submitting?: boolean;
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
  /**
   * Say, beside each destination whose edge carries rules the dialog will prompt for, what it will ask for —
   * "Done (needs a comment)". The Move button opens the dialog over EVERY destination at once (mobile plan
   * FD6), so the person is choosing between edges and should not have to pick one to learn which is gated.
   * Off by default: the arrows offer one direction at a time and their option names are asserted as bare names.
   */
  markRules?: boolean;
};

/** What picking `rules` will ask for, in words — `''` when the edge asks for nothing this dialog prompts for. */
function ruleMark(rules: TransitionRules): string {
  const asks: string[] = [];
  if (rules.some((rule) => rule.kind === 'require-comment')) asks.push('needs a comment');
  if (rules.some((rule) => rule.kind === 'require-evidence')) asks.push('needs evidence');
  for (const rule of rules) if (rule.kind === 'require-field') asks.push(`needs ${rule.field}`);
  return asks.length === 0 ? '' : ` (${asks.join(', ')})`;
}

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
  submitting,

  uploadEvidence,
  offerStateIds,
  initialToStateId,
  markRules,
}: TransitionDialogProps) {
  const options = transitionOptions(workflow, fromStateId).filter(
    (option) => offerStateIds === undefined || offerStateIds.includes(option.toStateId),
  );
  const [toStateId, setToStateId] = useState(initialToStateId ?? '');
  const [comment, setComment] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [evidenceAttachmentId, setEvidenceAttachmentId] = useState<string | null>(null);
  /**
   * ⚠ **NEWLY REACHABLE AS OF THE DAY THE WEB GAINED AN UPLOADER, and it was
   * a silent hole until then.** The `onChange` below used to be
   * `void uploadEvidence(file).then(…)` with **no `.catch`** — which was
   * unreachable while every caller passed no uploader at all (the branch
   * above simply rendered the dead-end sentence instead). The moment a real
   * uploader arrives, so does every way an upload can FAIL: a file over the
   * ceiling, a type the server refuses, a dropped connection. Each of those
   * left a rejected promise nobody handled and a Move button disabled with no
   * sentence beside it — a control that silently does nothing.
   *
   * TWO FACTS, TWO TONES, the split Ruling 27 established for this dialog's
   * other slots: `server` is the authority refusing to store the bytes (the
   * uploader answers with the server's own reason), `transport` is nobody
   * answering at all. Carried as one state rather than two because a second
   * file REPLACES the first attempt's outcome — there is exactly one last
   * upload, so there is exactly one sentence about it.
   */
  const [uploadError, setUploadError] = useState<{ tone: 'server' | 'transport'; message: string } | null>(
    null,
  );
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
    void precheckRef.current(toStateId, evidenceAttachmentId, fieldValues, comment).then((result) => {
      if (!cancelled) setPreview(result);
    });
    return () => {
      cancelled = true;
    };
    // `evidenceAttachmentId` is a dependency because it CHANGES THE ANSWER:
    // `require-evidence` is evaluated against the candidate, and attaching a
    // file between two runs of the same destination must re-ask.
    //
    // `fieldValues` is here for the same reason one rule kind over:
    // `require-field` is read from the ticket STATE the engine is handed, and
    // this dialog's inputs are where that value lives before the submission
    // carries it — so typing into a field the dialog itself asked for has to
    // re-ask, or the refusal the person just answered stays on screen beside an
    // enabled Move for ever.
    //
    // `comment` joins them for the third rule kind, and for the reason the
    // evidence fix already recorded: the box appears because `require-comment`
    // is on this edge, typing clears `blocked`, and the preview beside it was
    // still answering "none was provided" because the candidate had never been
    // told what the box holds.
  }, [toStateId, evidenceAttachmentId, fieldValues, comment]);

  /**
   * ⚠ **EVIDENCE IS PER-MOVE, AND THE CLAIM IS NOW REACHABLE FOR THE FIRST TIME.**
   *
   * A file attached as evidence for one move must not satisfy a `require-evidence`
   * rule on a DIFFERENT move — and until this change no caller supplied an
   * uploader, so `evidenceAttachmentId` could never be set in the product and
   * the carry-over was unreachable. The moment one did, so did this: choose a
   * move, attach a file, choose ANOTHER guarded move, and the Move button came
   * up enabled carrying evidence the person attached for the first one. The
   * engine would commit it — the id is real, the ticket matches, and the rule
   * only asks that evidence be present.
   *
   * Reset on the SAME dependency the pre-check above uses, and for the same
   * reason: `toStateId` is what actually changes when somebody chooses a
   * different move. The upload error goes with it, because a sentence about an
   * attempt for the previous move is a claim about a move no longer selected.
   */
  /**
   * ⚠ **AN UPLOAD IN FLIGHT MUST NOT OUTLIVE THE MOVE IT WAS FOR.** Clearing
   * the state when the destination changes is not enough on its own: the
   * upload that was already running resolves AFTERWARDS and calls
   * `setEvidenceAttachmentId` unconditionally, re-arming the very carry-over
   * the reset exists to close. Independent review found this, and it is the
   * sibling pre-check effect above that shows the guard — `let cancelled =
   * false` / `if (!cancelled)` — which this handler lacked.
   *
   * A monotonic token rather than a boolean, because there is more than one
   * way for an attempt to be superseded (a different destination, the dialog
   * closing) and a stale attempt must lose to all of them. Every superseding
   * event bumps it; a resolving upload applies only if it is still the latest.
   */
  const uploadAttemptRef = useRef(0);

  useEffect(() => {
    uploadAttemptRef.current += 1;
    setEvidenceAttachmentId(null);
    setUploadError(null);
  }, [toStateId]);

  /**
   * ⚠ AND THE SAME HOLE ONE LAYER OUT — closing and reopening. `Dialog` returns
   * `null` while hidden (`packages/ui/src/components/dialog.tsx:15`) but this
   * component STAYS MOUNTED at the sheet's mount (`ticket-sheet.tsx`, `open={moveOpen}`),
   * so `toStateId` and the evidence both survive. Before this change nothing
   * could set an id, so the carry-over was unreachable; with an uploader it is
   * not: attach a file, press Cancel, reopen — the destination is still chosen
   * and Move is ENABLED with no file visible anywhere in the dialog, because
   * the `<input type="file">` remounts empty. Invisible state the user cannot
   * see, silently satisfying a rule.
   *
   * Cleared on CLOSE rather than on open, so the abandoned attempt is discarded
   * at the moment it is abandoned. **The comment and the field values persist
   * across a reopen, and that is deliberate:** typing into a dialog and losing it
   * to a stray Cancel is a real cost, and unlike an attachment id it is visible in
   * the reopened dialog.
   *
   * ⚠ **AND THAT SENTENCE NAMED ONLY CANCEL, WHILE THIS EFFECT SERVES COMMIT
   * TOO — WHICH WAS THE DEFECT (E2-32, 2026-09-21).** A committed move closes the
   * dialog the same way, so the finished move's comment survived into the NEXT
   * one and `submit` put it on the wire: a comment written about move A recorded
   * as move B's. **The fix is NOT here**, and deliberately so — this effect
   * cannot tell the two closes apart, and giving it a flag would be this
   * component guessing at a fact only the caller has. `TicketSheet` remounts the
   * dialog per committed move instead (its `key`), which discards the whole
   * finished attempt and nothing else. **What this effect still owns is the
   * Cancel half, unchanged.**
   */
  useEffect(() => {
    if (!open) {
      uploadAttemptRef.current += 1;
      setEvidenceAttachmentId(null);
      setUploadError(null);
    }
  }, [open]);

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
          options={options.map((option) => ({
            value: option.toStateId,
            label: markRules === true ? `${option.name}${ruleMark(option.rules)}` : option.name,
          }))}
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
                // A second attempt supersedes the first, in BOTH directions:
                // the old id and the old sentence both go, so the dialog can
                // never point at a file this attempt did not produce.
                setEvidenceAttachmentId(null);
                setUploadError(null);
                const attempt = (uploadAttemptRef.current += 1);
                void uploadEvidence(file)
                  .then(({ attachmentId }) => {
                    // Superseded while this was in flight — by a different
                    // destination, or by the dialog closing. Applying it now
                    // would re-arm evidence for a move nobody chose.
                    if (uploadAttemptRef.current !== attempt) return;
                    setEvidenceAttachmentId(attachmentId);
                    setUploadError(null);
                  })
                  .catch((err: unknown) => {
                    if (uploadAttemptRef.current !== attempt) return;
                    // The refused/hung split, WITHOUT importing the client's
                    // error class: `packages/app-core` must not depend on
                    // `@gisik-nokma/editor` (amendment 12 — app-core never
                    // learns what an editor is). `UploadRefusedError` sets its
                    // own `name`, which is the one thing the two sides agree on
                    // without a dependency, and it is the same signal the
                    // editor's own suite asserts on.
                    const verdict = err instanceof Error && err.name === 'UploadRefusedError';
                    setUploadError({
                      tone: verdict ? 'server' : 'transport',
                      message: err instanceof Error ? err.message : String(err),
                    });
                  });
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
            .join(' and ')} rules. The server decides, and its answer appears here.`}
        </p>
      ) : null}

      {preview !== null && preview.kind === 'refused' ? (
        <p className="gn-refusal gn-refusal--preview">
          {`instant check: ${preview.rule}: ${preview.reason}`}
        </p>
      ) : null}

      {serverRefusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {`Refused by the server: ${serverRefusal.rule}: ${serverRefusal.reason}`}
        </p>
      ) : null}

      {/* Ruling 27 — never the same sentence, never the same class, never a
          `{rule, reason}` pair: see this prop's own docblock above. The class
          comes from the copy itself (E5-25) so a 401 — which this dialog meets
          when a move's write outlives the session — is not painted as a
          transport failure it is not. */}
      {transportError !== null ? (
        <p role="alert" className={writeFailureRefusalClass(transportError)}>
          {transportError}
        </p>
      ) : null}

      {/*
        The EVIDENCE UPLOAD's own outcome — a fourth fact, in the two tones the
        split above establishes. It shares `--server`'s danger rule with the
        refusal slot without sharing its sentence, deliberately: the tone says
        WHO SPOKE (the authority, versus nobody), not which claim was refused.
        `--transport` here means the file never reached a server that could
        judge it, which is the same fact that class carries one block up.
      */}
      {uploadError !== null ? (
        <p role="alert" className={`gn-refusal gn-refusal--${uploadError.tone}`}>
          {uploadError.tone === 'server'
            ? `The server would not store that file: ${uploadError.message}`
            : `That file could not be uploaded: ${uploadError.message}`}
        </p>
      ) : null}

      <div className="gn-transition__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={blocked || submitting === true} onClick={submit}>
          Move
        </Button>
      </div>
    </Dialog>
  );
}
