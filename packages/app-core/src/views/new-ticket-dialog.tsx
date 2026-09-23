import { createElement, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PRIORITY,
  DEEPEST_RANK,
  PRIORITIES,
  docToPlainText,
  dueDateValueSchema,
  newUlid,
  type Priority,
} from '@gisik-nokma/domain';
import { Button, Dialog, SegmentedControl, Select, Switch } from '@gisik-nokma/ui';
import { readNewTicketStart, rememberNewTicketStart } from '../preferences/new-ticket-start.js';
import type { EditorSlotComponent } from './editor-slot.js';

/**
 * The Assignee picker's row for nobody, spelled as an OPTION VALUE rather than
 * as the absence of one — `ticket-sheet.tsx`'s own constant for its own picker,
 * restated rather than imported because it is declared inside that component's
 * body. `null` cannot be a `Select` value (`select.tsx` treats a nullish value
 * as "nothing chosen" and would render the placeholder), and "Unassigned" has to
 * be selectable BACK, not merely the state a fresh picker happens to be in.
 */
const UNASSIGNED = '__unassigned__';

/**
 * A ticket type as this dialog is handed it: the label to paint, the RANK
 * the root-creation rule turns on, and the WORKFLOW it is bound to.
 *
 * `rank` is required, and that is the point rather than tidiness. The default
 * below cannot be derived from an id and a name — the previous default was
 * `typeOptions[0]`, which named the TOP of the hierarchy because the ladder
 * arrives rank-ascending — so a caller that does not say what rank each type
 * sits at leaves this dialog with no honest way to choose one. An optional
 * `rank` would compile at every call site and silently restore that defect
 * wherever it was omitted.
 *
 * `workflowId` is REQUIRED for the identical reason (starting-status design,
 * 2026-09-23): the Starting-status select needs to know which workflow's
 * states to offer for whatever type is currently chosen, and `TicketTypeDef`
 * — what `page.tsx` builds this from — always carries one. The page's
 * LOADING fallback (`BUILTIN_TYPE_LADDER`) has no real workspace to bind to
 * yet, so it carries `''` — "no workflow known" — which `workflowStates('')`
 * answers `null` for, the same "not loaded" state the select already shows
 * while `typeOptions` itself is the fallback.
 */
export type TypeOption = { id: string; name: string; rank: number; workflowId: string };

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
  /**
   * The id the created ticket will carry — minted by THIS dialog when it opens,
   * and not by the flow (owner request 2026-09-23).
   *
   * ## Why the draft owns the entity's id
   *
   * The description composer is mounted from `editorSlot`, whose contract takes
   * a `ticketId`, and the create dialog is the one mount in the product where the
   * ticket does not exist yet. The alternatives were both worse: a fabricated id
   * would be a value the editor is handed and that is simply false, and omitting
   * the composer would drop the owner's ask. Minting it here makes every value
   * the composer receives TRUE — this IS the id `ticket.created` will carry,
   * because the flow writes the payload with what the draft says.
   *
   * ## The safety property that comes with it, measured rather than assumed
   *
   * The flow used to mint `newUlid()` PER CALL, and V10's docblock leans on that:
   * two presses that somehow escaped the dialog's `submittingRef` were two
   * distinct ids, i.e. two tickets in an append-only ledger. **With the id minted
   * per OPEN, the same escape is refused instead of filed.**
   * `packages/rule-engine/src/checks/hierarchy.ts:95` is
   * `if ((await getTicketState(ctx, env.entity.id)) !== null) return
   * refuse('ticket.already-exists')`, and its own docblock says why the door
   * exists at all: the reducer folds `ticket.created` unconditionally, so an
   * ACCEPTED second create does not error and does not merge — **it resets the
   * fold**, erasing the ticket's status, collaborators, field claims and
   * transition log. A duplicate whose id was already taken therefore lands on a
   * refusal, not on a wrecked ticket. The ref guard is still the first line; this
   * makes the second line an error instead of silent duplication.
   *
   * A fresh ULID per OPEN, never once per dialog instance: the same id reused
   * for a second ticket would be refused by exactly the rule above, so a
   * long-lived dialog would become unable to create anything after its first
   * success.
   */
  ticketId: string;
  title: string;
  typeId: string;
  parentId: string | null;
  /**
   * The description, as the composer reported it — a rich-text DOCUMENT, the same
   * value `ticket.field_set` carries under `fieldId: 'description'`.
   *
   * OPTIONAL, and ABSENT MEANS THE TICKET HAS NO DESCRIPTION. This is the one
   * member here that may legitimately be absent, and the asymmetry with `start`
   * and `priority` is the honest one rather than a lapse: those two always HAVE a
   * value (a ticket is always born somewhere and always at some priority, so the
   * control is preselected and the absence rules on the wire exist only for
   * events older than the fields), while a ticket genuinely may have nothing
   * written in it. `ticketCreatedPayload.description` is optional for the same
   * reason, and the flow tests the KEY's presence rather than a value.
   *
   * A DOCUMENT or absent, never an empty document and never a string: the caller
   * decides presence, and `docToPlainText` is what it decides with.
   */
  description?: unknown;
  /**
   * Who the ticket is assigned to at birth, or `null` for nobody.
   *
   * REQUIRED, and that mirrors `parentId` rather than `description`: "nobody" is
   * a real, chosen state with a control position of its own ("Unassigned" is the
   * picker's opening value), so there is always an answer and the draft always
   * carries one. `ticketCreatedPayload.assigneeId` is nullable for that reason,
   * and `TicketState.assigneeId` is `string | null` — `null` is the one spelling
   * of nobody the whole chain agrees on.
   */
  assigneeId: string | null;
  /**
   * Where the ticket is born (backlog/closed spec §5.4, 2026-09-17; condition
   * LIFTED by the owner 2026-09-23): whatever the "Starts in the backlog?"
   * switch below says — `'backlog'` when it is ON, which is its default, and
   * `'focus'` when the person has turned it off, WHATEVER parent is chosen.
   *
   * No longer conditional on the parent. Until 2026-09-23 §5.4 let a ticket be
   * born in focus only under a parent that was itself in focus, and the draft's
   * `start` was `startCheckboxVisible && startInFocus`. The owner lifted that:
   * the control is always present and always answerable, so the parent has no
   * bearing on this value at all and the `inFocus` claim the caller used to
   * carry is gone from `parentCandidates` with it.
   *
   * ALWAYS present — never optional here, even though `ticketCreatedPayload` on
   * the wire treats an absent `start` as `'focus'` for events older than this
   * field. That absence-means-focus rule exists so a v1 event keeps its v1
   * meaning; it says nothing about what THIS client, built after the field
   * exists, is allowed to leave out. `create-ticket-flow.tsx`'s `create()`
   * sends this value on every `ticket.created` it builds (see the comment on
   * that payload), and this type keeping the field required is what makes an
   * accidental omission upstream (in the state built below) a compile error
   * rather than a silently-focused ticket nobody asked for.
   */
  start: 'backlog' | 'focus';
  /**
   * The ticket's birth priority (spec 2026-09-22) — the fifth built-in, starting
   * at the MIDDLE. ALWAYS present here, exactly as `start` is and for the
   * identical reason: `ticketCreatedPayload` treats an absent `priority` as
   * `DEFAULT_PRIORITY` so that events written before the field keep their
   * meaning, and that rule says nothing about what a client built AFTER the
   * field exists is allowed to leave out. This dialog's control is preselected,
   * so there is no "unset" state for it to send.
   */
  priority: Priority;
  /**
   * The STARTING STATUS (starting-status design, 2026-09-23) — OPTIONAL, and
   * OMITTED in the two cases where it would say nothing new: when "Starts in
   * the backlog?" is ON (a backlog ticket has no starting status — the
   * domain's own `.refine` refuses the pair, spec's own ruling) and when the
   * chosen value equals the workflow's `initialStateId` (the wire's own
   * absence-means-initial rule, kept minimal rather than restating the
   * default on every payload). Carried otherwise, whatever the select shows.
   */
  stateId?: string;
  /**
   * The birth START and DUE date (addendum, 2026-09-23), each `YYYY-MM-DD` or
   * OMITTED when its input is empty — the SAME "absent means no claim" rule
   * `description` follows, one field over, and for the identical reason: a
   * ticket may genuinely have no start or due date, and an empty string is
   * not a day. `create-ticket-flow.tsx` wraps a present value as `{date:
   * ...}` for the wire; this type keeps the bare string, the shape the two
   * `<input type="date">` controls themselves hold.
   */
  startDate?: string;
  dueDate?: string;
};

export type NewTicketDialogProps = {
  open: boolean;
  typeOptions: readonly TypeOption[];
  /**
   * Whose remembered answer this dialog reads and writes (owner ruling
   * 2026-09-23): the "Starts in the backlog?" switch's position is remembered
   * in `localStorage` across sessions, and that record is KEYED BY USER.
   *
   * **REQUIRED, and that is the point rather than tidiness.** An optional
   * `userId` would compile at every call site and silently stop remembering the
   * answer wherever it was omitted — a feature that is absent and looks
   * present, which is the failure mode `TypeOption.rank`'s own required field
   * exists to make impossible. The report REQUIRES it for the identical reason:
   * `'backlog'` on the wire is a real state, so a defaulted-to-unset value here
   * would not fail loudly, it would just forget.
   *
   * `''` is "no session" — the sentinel `CreateTicketFlowProps.currentUserId`
   * already carries, `page.tsx:241`'s own spelling of it. Nothing is read back
   * and nothing is written for it; the switch still renders, at its default.
   */
  userId: string;
  /**
   * What may be chosen as this ticket's parent.
   *
   * **`inFocus` used to be here and is deliberately GONE** (owner ruling
   * 2026-09-23). It existed for exactly one reader — the `startCheckboxVisible`
   * condition that hid the birth-state control unless the chosen parent was
   * itself in focus — and when that condition was lifted the field lost its
   * only purpose. `page.tsx` computed it from a real row's `stateId`/`closed`
   * (`row.stateId !== BACKLOG_STATE_ID && row.closed === null`) and no longer
   * does: a claim nothing reads is a claim the next reader will assume is load
   * bearing, and this dialog now asserts nothing whatever about a parent's own
   * state.
   */
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
  /**
   * The workspace this ticket is being filed in. Used by ONE thing: the
   * description composer's own scope, since `EditorSlotProps.workspaceId` is
   * contract-required and a mentions query is workspace-scoped by the time the
   * slot's closure is built. Required even when no `editorSlot` is supplied —
   * the fact is true of every mount, and an optional prop that only some callers
   * need is the shape that compiles while silently unset.
   */
  workspaceId: string;
  /**
   * The description composer, or absent for a dialog without one.
   *
   * **The seam `TicketSheet` already takes, for the same reason:** app-core must
   * never learn what a ProseMirror document is (amendment 12), so the real
   * editor lives in `packages/editor` and `apps/web` — the one app that depends
   * on both — passes it in. This component renders whatever it is handed and
   * only ever holds the document as `unknown`.
   *
   * ⚠ **The slot's own submit control must be suppressed by the CALLER**, and
   * that is not this component's business to enforce: `TicketEditorSlot`'s
   * `submitSlot: 'none'` lives on that package's seam-only props, and app-core
   * cannot name it. A slot mounted here without it would draw a second "Submit"
   * inside the create form — one that would send a `field_set` for a ticket that
   * does not exist yet. `apps/web` supplies the wrapper that asks for it.
   *
   * No `submit` is passed, deliberately: this mount has nowhere to submit to, so
   * the composer reports through `onChange` and Create is the one act.
   */
  editorSlot?: EditorSlotComponent;
  /**
   * Who may be assigned at birth. The CALLER's roster, exactly as
   * `parentCandidates` is the caller's list — this component derives nothing and
   * reads no roster of its own.
   *
   * `{id, name}` rather than the sheet's `Actor`, because a picker option needs
   * a label and nothing else: the caller has already resolved the display name
   * through `memberLabel` (name → email → id) at the one place that knows the
   * whole `Actor` shape, so a nameless member is offered by their address and
   * never as a blank row.
   */
  assigneeCandidates: ReadonlyArray<{ id: string; name: string }>;
  /**
   * Why the roster could not be read, when it could not be — the same
   * distinction, and for the same reason, as `parentCandidatesUnavailable` one
   * field over.
   *
   * An EMPTY picker asserts *nobody in this workspace can be assigned to this
   * ticket*, which is a claim about the workspace made from a read that never
   * answered; inside a modal, the sentence that would correct it is on the page
   * behind. When set, the picker is replaced by this reason and the draft leaves
   * with `assigneeId: null` — which is what the ticket would have been anyway —
   * **enforced at the SUBMIT site, not by hiding the picker**, because this prop
   * can arrive after a selection has been made and hiding a control does not
   * clear the state behind it (3.157's own invariant).
   */
  assigneeCandidatesUnavailable?: string;
  /**
   * The workflow states a Starting-status control may offer, keyed by
   * workflow id (starting-status design, 2026-09-23) — the CALLER's read, the
   * same "this component derives nothing" precedent `parentCandidates` and
   * `assigneeCandidates` already set.
   *
   * `null` for a workflow this caller has not resolved yet — the LOADING
   * state, distinct from a workflow with no legal starting state at all
   * (which answers a real object whose `states` is empty). The select reads
   * this by the CURRENT type's own `workflowId` and shows "Loading states…",
   * disabled, while it is `null`.
   *
   * `states` carries EVERY state of the workflow, each with its OWN
   * `creatable` — `isCreatableState`'s own answer, computed by the caller —
   * rather than a pre-filtered list: THIS component is the one that filters
   * to `creatable` when it builds the Select's options and when it
   * validates the standing `stateId` (below), so the invariant holds for
   * every caller rather than depending on each one filtering correctly.
   */
  workflowStates: (workflowId: string) => { initialStateId: string; states: Array<{ id: string; name: string; category: string; creatable: boolean }> } | null;
  /**
   * A board column's own identity, when the dialog was opened FROM one
   * (starting-status design, 2026-09-23) — `Board`'s `onCreateTicket`
   * selection, threaded down through `CreateTicketFlow`. Pre-fills the type
   * (the first `typeOption` whose `workflowId` matches — planner default,
   * unobjected: "when several types share the column's workflow the first is
   * pre-selected and the form lets you change it") and the starting status
   * (that column's `stateId`), and turns "Starts in the backlog?" OFF — a
   * board-column click asks for a ticket IN that column, not in the backlog.
   *
   * An unmatched `workflowId` (no `typeOption` on this project uses it) is
   * IGNORED — the dialog opens exactly as it would with no selection at all,
   * rather than a picker naming a type that is not on offer. This can only
   * happen from a stale caller; the board can never pass a workflow this
   * project's own types do not share.
   */
  initialSelection?: { workflowId: string; stateId: string };
  /**
   * Why the currently-implied starting status is refused, when it is
   * (starting-status design, 2026-09-23) — the SAME distinction
   * `parentCandidatesUnavailable`/`assigneeCandidatesUnavailable` draw, one
   * door over: the reason is computed by the FLOW (`CreateTicketFlow`, which
   * holds the `ClientStateCache` and the project id this dialog does not),
   * from the SAME `precheckEvent`/`isCreatableState` path the engine itself
   * runs, and handed down to render under the select. `undefined` — no
   * refusal to show — is the ordinary case; the select's own options are
   * already filtered to `creatable`, so this renders only when the flow's
   * cached definition disagrees with what `workflowStates` offered.
   */
  stateRefusal?: string;
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
  userId,
  workspaceId,
  typeOptions,
  parentCandidates,
  parentCandidatesUnavailable,
  parentCandidatesNarrowing,
  editorSlot,
  assigneeCandidates,
  assigneeCandidatesUnavailable,
  workflowStates,
  initialSelection,
  stateRefusal,
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
   * The birth priority (spec 2026-09-22), preselected at the MIDDLE — the
   * owner's own words: *"everything starts at p2 the middle"*. The default is a
   * CHOICE this control shows and this client therefore SENDS; it is never left
   * to the wire's absence rule, which exists for events older than the field.
   * `DEFAULT_PRIORITY` is imported rather than spelled `'P2'` so the ladder and
   * its middle have one origin — the sheet, the list and the board all read the
   * same constant.
   */
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  /**
   * The STARTING STATUS control's own value (starting-status design,
   * 2026-09-23) — `''` until the reseed effect below has something to seed it
   * WITH, exactly as `typeId`'s own `''` means "nothing chosen yet". Never
   * cleared when "Starts in the backlog?" is ON: the Select is merely
   * `disabled` then, so switching it back OFF restores whatever value was
   * here, which is the "re-enabled with the previous value" case.
   */
  const [stateId, setStateId] = useState('');
  /**
   * The birth START and DUE date inputs (addendum, 2026-09-23) — bare
   * `YYYY-MM-DD` strings, empty by default, the same shape the two `<input
   * type="date">` controls themselves hold. Reset to `''` with the rest of
   * the draft on every OPEN (E2-37's rule, two fields over).
   */
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
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
  /**
   * The workflow the CURRENT type is bound to, and that workflow's own
   * creatable-filtered states — `null` while `workflowStates` has not
   * resolved it yet, or while no type is chosen at all. Read at render time
   * rather than cached in state: `workflowStates` is the caller's own read
   * (`page.tsx`'s memoised map, in production), so this is always the
   * CURRENT answer, never a stale one a missed effect dependency could leave
   * behind.
   */
  const currentWorkflowId = typeOptions.find((option) => option.id === typeId)?.workflowId;
  const currentStates = currentWorkflowId === undefined ? null : workflowStates(currentWorkflowId);
  /**
   * THE FILTER (starting-status design, 2026-09-23) — `workflowStates`
   * hands over EVERY state with its own `creatable`, and THIS is the one
   * place that narrows it to the states a new ticket may actually start in.
   * Both the Select's own options and the reseed effect below read this,
   * never the unfiltered `currentStates.states`, so the two can never
   * disagree about which states are on offer.
   */
  const creatableStates = currentStates === null ? null : currentStates.states.filter((state) => state.creatable);
  /**
   * ONE RULE, and it covers three triggers at once (starting-status design,
   * 2026-09-23): if `stateId` is not among the CURRENT type's loaded
   * creatable states, seed it to that workflow's `initialStateId`. That
   * single rule is what happens on a TYPE CHANGE (the design's own "resets
   * to the new workflow's initial state unless the current value exists
   * there"), on a LATE `workflowStates` load (nothing was creatable to check
   * against a moment ago), and on an `initialSelection` naming a state that
   * turns out not to be creatable (the design's own "cannot happen from the
   * board but the form must not trust it") — all three are "the standing
   * value is not one of the states this workflow currently offers", the
   * SAME question `typeId`'s own reseed effect above asks of the ladder.
   *
   * Deliberately does NOT run while `currentStates` is `null`: there is
   * nothing yet to validate `stateId` against, and seeding an empty string
   * here would overwrite whatever the open effect (or `initialSelection`)
   * just set, one render before this effect gets a real answer to check it
   * against.
   */
  useEffect(() => {
    if (currentStates === null || creatableStates === null) return;
    if (creatableStates.some((state) => state.id === stateId)) return;
    setStateId(currentStates.initialStateId);
  }, [currentStates, stateId]);
  /**
   * The open effect's own helper (starting-status design, 2026-09-23): a
   * workflow id and an optional preferred state in, the state to actually
   * seed out — `preferred` when it names a real, CREATABLE state of that
   * workflow, that workflow's own `initialStateId` otherwise, and `''` when
   * `workflowStates` has not resolved the workflow at all yet (the reseed
   * effect above corrects that the moment it does). Not a `useCallback`: it
   * closes over nothing but props and is called at most twice per open.
   */
  const seedStateIdFor = (workflowId: string | undefined, preferred: string | undefined): string => {
    if (workflowId === undefined) return '';
    const states = workflowStates(workflowId);
    if (states === null) return '';
    if (preferred !== undefined && states.states.some((state) => state.creatable && state.id === preferred)) {
      return preferred;
    }
    return states.initialStateId;
  };
  /**
   * ⚠ A CLOSED DIALOG HOLDS NOTHING (E2-37, 2026-09-21).
   *
   * The flow mounts this component for its whole life and toggles `open`, so a
   * Cancel and a successful create both only flipped the prop — none of the four
   * `useState` values was ever reset, and reopening offered the LAST ticket's
   * title with `Create` already enabled and a type already chosen. One press
   * files a duplicate of a ticket the person has already filed.
   *
   * The rule is "empty on OPEN" rather than "clear on close", and the difference
   * is the flow's reopen offer (E2-34): the offer REPLACES this dialog with
   * `open={false}` and hands it back when it closes, so a clear-on-close would
   * discard a draft the person was mid-way through for a detour that never
   * touched it — while an empty-on-open leaves that draft alone, because `open`
   * never went true in between.
   *
   * ⚠ The cost, stated rather than left to be discovered: a Cancel followed by a
   * reopen abandons the typed title. That is the point of the rule — the draft
   * that survives a close is the stale draft, and its visibility in a text input
   * is the only reason the previous behaviour was merely Minor. `typeOptions` is
   * deliberately NOT a dependency: the ladder's own identity change is E2-33a's
   * re-seed above, which keeps a type the list still offers.
   */
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setParentId('');
    /**
     * `initialSelection` (starting-status design, 2026-09-23) — a board
     * column's own identity, present only when THIS open came from a
     * column's "Add a ticket" rather than the header's unscoped one.
     * `matchedType` is the design's own planner default: "when several
     * types share the column's workflow the first is pre-selected" — the
     * FIRST `typeOption` whose `workflowId` matches, not `defaultRootTypeFor`
     * over that subset, because a board column already names a fixed
     * starting status and the root-legality question `defaultRootTypeFor`
     * exists to answer (E5-16) does not apply to a type the person can still
     * change by hand.
     *
     * An unmatched `workflowId` — no type on this project shares that
     * workflow — falls through to the ordinary, no-selection path below
     * rather than pre-filling half of one: "if none matches, ignore the
     * selection" is a statement about the WHOLE selection, not the type
     * alone.
     */
    const matchedType =
      initialSelection === undefined
        ? undefined
        : typeOptions.find((option) => option.workflowId === initialSelection.workflowId);
    if (initialSelection !== undefined && matchedType !== undefined) {
      setTypeId(matchedType.id);
      // Computed DIRECTLY here rather than left as a bare `''` for the
      // reseed effect to fill in a render later — this effect and that one
      // fire in the SAME commit on every open, and React batches same-tick
      // `setStateId` calls: the reseed effect's own `useState` closure still
      // reads the PRE-open `stateId`, so a bare `setStateId('')` here would
      // OVERWRITE its correction with the two calls coalescing to no net
      // change (`'' → '' `), which React then bails out of re-rendering for
      // — the reseed effect would never get a second pass to run. Computing
      // the right value here, once, sidesteps the race entirely; the reseed
      // effect stays for what only IT can still catch — a `workflowStates`
      // answer that has not loaded yet at this exact instant, corrected the
      // moment it does (the design's own "cannot happen from the board but
      // the form must not trust it").
      setStateId(seedStateIdFor(matchedType.workflowId, initialSelection.stateId));
      // A board-column click asks for a ticket IN that column, never in the
      // backlog — and this does NOT call `rememberNewTicketStart`: the
      // remembered preference belongs to the PERSON, and a board-initiated
      // open answering a different question (which column) must not
      // overwrite it (design's own ruling, and case 13.1441).
      setStartInBacklog(false);
    } else {
      const seededTypeId = defaultRootTypeFor(typeOptions)?.id ?? '';
      setTypeId(seededTypeId);
      // Same reasoning as the `initialSelection` branch above — computed
      // directly to avoid the same same-commit batching race.
      setStateId(seedStateIdFor(typeOptions.find((option) => option.id === seededTypeId)?.workflowId, undefined));
      // ⚠ NOT `true`, and not a resettable default either: the switch opens
      // at whatever this PERSON last chose (owner ruling 2026-09-23 —
      // *"same as how workspace and project is remembered"*). Resetting it
      // to ON here would be the stale-draft rule applied to a value that is
      // not part of the draft: the answer belongs to the person, not to the
      // ticket being composed, and a Cancel is not a reason to forget it.
      //
      // Read HERE rather than in `useState`'s initialiser, and that
      // placement is load-bearing twice over. This effect runs only on the
      // client, after a user action — so there is no server render in which
      // `window` is missing and no hydration mismatch between a server that
      // answered ON and a client that answered OFF. And it re-reads on
      // every OPEN, which is what makes the read honest for a person who
      // signed in as somebody else since the last time: `readNewTicketStart`
      // refuses a record belonging to another user, and the refusal can
      // only happen if it is asked again.
      setStartInBacklog(readNewTicketStart(userId) === 'backlog');
    }
    // The birth dates (addendum, 2026-09-23) — empty on OPEN, the same rule
    // every other field on this list follows.
    setStartDate('');
    setDueDate('');
    // The rest of the draft (owner request 2026-09-23). A NEW id with them: the
    // previous ticket's id already resolves, and reusing it would be refused.
    setDraftTicketId(newUlid());
    setDescription(undefined);
    setAssigneeId(UNASSIGNED);
    // Priority is reset with the rest (spec 2026-09-22): "empty on OPEN" is the
    // rule, and a priority left at the previous draft's level is the same
    // stale-draft defect E2-37 names, one field over.
    setPriority(DEFAULT_PRIORITY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const [parentId, setParentId] = useState('');
  /**
   * The "Starts in the backlog?" switch's position — ON means the ticket is born
   * in the universal Backlog state, OFF means the workflow's initial (focus)
   * state.
   *
   * ## The polarity is INVERTED from the control it replaced, and that is a trap
   *
   * The old "Start in focus" checkbox meant `start: 'focus'` when CHECKED. This
   * switch means `start: 'backlog'` when checked. They are opposites, so the
   * shipped `startInFocus` could not be renamed and kept: wiring it straight to
   * `checked` would have shipped a control whose ON position silently meant the
   * reverse of what it said. The state is named for what the switch SHOWS rather
   * than for what the payload carries, so the derivation at the submit boundary
   * below reads as the plain translation it is — and 13.1353 pins both
   * directions, because an inverted control passes any single-direction case.
   *
   * ## It is never disabled, and the parent has no say in it
   *
   * Spec §5.4's condition — a ticket may be born in focus only when the chosen
   * parent is itself in focus — was LIFTED by the owner (2026-09-23). What is
   * left is a question about the ticket, answerable at any moment, so there is
   * no `disabled` and nothing here reads the chosen parent. Ruling 40's
   * per-parent reset went with the condition it served: a switch that does not
   * track the parent cannot be reset by it, and a stale reset would overwrite
   * the very answer this dialog is asked to remember (13.591g).
   *
   * The initial value is ON and is never observed: the open effect above seeds
   * it before the dialog can be seen. It exists so the first render has a
   * position, not to be an answer.
   */
  const [startInBacklog, setStartInBacklog] = useState(true);
  /**
   * The id the ticket will carry. Re-minted on every OPEN, with the rest of the
   * draft (E2-37's rule, one field over) — and re-minted rather than kept, or the
   * second ticket created from one dialog session would name an id that already
   * resolves and be refused `ticket.already-exists`.
   *
   * Minted HERE rather than in the flow because the description composer needs it
   * before anything is created. See `NewTicketDraft.ticketId` for the full
   * argument and for the safety property the move buys.
   */
  const [draftTicketId, setDraftTicketId] = useState(() => newUlid());
  /**
   * The description as the composer last reported it, or `undefined` for one
   * nobody has typed into.
   *
   * `undefined` is not "an empty document" and the difference is load-bearing:
   * `TicketEditor` wires `onChange` to ProseMirror's `onUpdate` and to nothing
   * else, so an untouched composer reports NOTHING — and a composer emptied back
   * to nothing reports an empty document. Both must leave the draft without a
   * `description` key, so the distinction is collapsed at the SUBMIT boundary by
   * `docToPlainText`'s length rather than here, where only one of the two arms
   * would be visible.
   */
  const [description, setDescription] = useState<unknown>(undefined);
  /**
   * The chosen assignee, with `UNASSIGNED` as the control's row for nobody —
   * the same idiom `ticket-sheet.tsx` uses for its own picker, and for the same
   * reason: the `Select` speaks option values, and "nobody" has to be one of them
   * rather than the absence of a selection, so a person can choose it BACK after
   * naming someone.
   */
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);

  // The SAME "no usable parent" test the submit boundary below already makes
  // for `parentId` — reused, not re-derived, so the two can never disagree
  // about what counts as a real parent. `undefined` here (the picker itself
  // withheld) counts as "no usable parent" for the identical reason `parentId`
  // leaves as `null` in that case: a withheld picker's `parentId` state may
  // still hold a stale selection (3.157's own invariant), and `null` is the
  // only value the payload is allowed to carry for a parent this dialog has
  // told the person it will not use.
  const noUsableParent = parentCandidatesUnavailable !== undefined || parentId === '';

  /**
   * The birth start/due date inputs' own validity (addendum, 2026-09-23) —
   * an EMPTY input is not invalid, it is simply omitted at submit, so both
   * checks are gated on the input being non-empty first. `dueDateValueSchema`
   * is the SAME import `ticketCreatedPayload` and `ticket.field_set` are
   * checked with (no copy of the regex, per the plan author's ruling); this
   * is the client-side half of the parity the RULING asks for, and there is
   * no precheck branch for either field.
   */
  const startDateInvalid = startDate !== '' && !dueDateValueSchema.safeParse({ date: startDate }).success;
  const dueDateInvalid = dueDate !== '' && !dueDateValueSchema.safeParse({ date: dueDate }).success;

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
   * writes a `ticket.created` into an append-only ledger that cannot take
   * anything back.
   *
   * ⚠ **This paragraph said the id was minted PER CALL and is corrected as of
   * 2026-09-23**, when the draft began carrying the id (owner request: the
   * description composer needs one before the ticket exists). The old text —
   * *"which mints `entity: { kind: 'ticket', id: newUlid() }` PER CALL: two
   * presses are two distinct `ticket.created` events with two distinct ids"* —
   * is no longer what happens, and leaving it would have been a docblock
   * describing a previous build. **What replaces it is a WEAKER cost, and the
   * guard is still the thing that prevents it:** a second escape now names an id
   * that already resolves, so `checks/hierarchy.ts:95` refuses it
   * `ticket.already-exists` rather than filing a second ticket. The ref remains
   * the first line of defence — the door is the second, and it is an error
   * rather than silent duplication.
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
        ticketId: draftTicketId,
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
        // The switch's own sense, translated once (owner ruling 2026-09-23).
        // ON is BACKLOG — the INVERSE of the control this replaced, whose ON
        // meant focus. `noUsableParent` deliberately does NOT appear here, and
        // its absence is the ruling rather than an oversight: the parent list
        // has no bearing on where a ticket is born any more, so a withheld
        // picker withholds the PARENT and nothing else.
        start: startInBacklog ? 'backlog' : 'focus',
        // Spec 2026-09-22. ALWAYS sent, like `start` and for the same reason:
        // the wire's absence-means-P2 rule is for events older than the field,
        // not for this client. The control is preselected, so this is always a
        // level the person could see.
        priority,
        // The description, OMITTED when it renders to nothing (owner request
        // 2026-09-23). `docToPlainText` is the decision, and it is the domain's
        // one projection — total, so `undefined`, a clearing `null` and an empty
        // document all answer `''` and all take the same arm. This is the
        // "a comment that renders to nothing adds NOTHING" rule
        // (`projections/search.ts`) applied one layer up: an empty description is
        // a claim nobody made, and `ticket.created`'s member is optional with
        // absent meaning exactly that.
        ...(docToPlainText(description).length === 0 ? {} : { description }),
        // REQUIRED, and `null` for the Unassigned row. The availability check is
        // made HERE as well as where the picker is drawn, for the reason the
        // parent one is: this prop can arrive AFTER a selection, and hiding a
        // control does not clear the state behind it (3.157).
        assigneeId:
          assigneeCandidatesUnavailable !== undefined || assigneeId === UNASSIGNED
            ? null
            : assigneeId,
        // The STARTING STATUS (starting-status design, 2026-09-23) — OMITTED
        // in the two cases that would say nothing new: backlog ON (a backlog
        // ticket has no starting status) and a value equal to this workflow's
        // own `initialStateId` (the wire's own absence-means-initial rule).
        // `currentStates` can be `null` here only if `workflowStates` never
        // resolved this workflow at all, in which case there is nothing to
        // compare against and the value is left out rather than guessed.
        ...(startInBacklog ||
        currentStates === null ||
        stateId === '' ||
        stateId === currentStates.initialStateId
          ? {}
          : { stateId }),
        // The birth START and DUE date (addendum, 2026-09-23) — OMITTED when
        // their input is empty, the SAME rule `description` follows above.
        // Client-side validity is enforced by the Create button's own
        // `disabled` condition, not here: a submit this handler reaches
        // always carries a real day or nothing.
        ...(startDate === '' ? {} : { startDate }),
        ...(dueDate === '' ? {} : { dueDate }),
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
        {/* `gn-field__input` — the product's own field treatment, and the one
            every neighbouring field on this screen already wears
            (`ticket-sheet.tsx:2298`, `passkeys-section.tsx:120`,
            `ticket-type-editor-screen.tsx:322`). Without it a bare `<input>`
            paints as raw user-agent chrome in a neumorphic sheet: measured at
            `border: 2px inset rgb(118,118,118)`, `background: #fff`,
            `border-radius: 0`, `padding: 1px 2px`, `font-size: 13.33px`, and
            **425×22** where its two siblings (Type, Parent) paint at the
            product's 17px on a 44px control. One class, not a new rule: the
            fill, radius, 2.75rem floor and the `neo` sunken override all
            already live on it (`ui.css:4774`, `:4811`). */}
        <input
          className="gn-field__input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {/*
        The birth-state question, and it is a QUESTION now rather than a
        statement plus a sometimes-control (owner ruling 2026-09-23).

        It replaces TWO things at once, which is why it sits where the old note
        sat rather than where the old checkbox sat. Under spec §5.4 this spot
        held the unconditional sentence *"Starts in the backlog"* — and the
        checkbox that could contradict it lived below the Parent picker, so the
        dialog said one thing near the title and offered another near the
        parent. The sentence was true in most of the states the dialog can be
        in, which is exactly why the pair read as noise: the ONLY action
        available was to make the sentence false, and where it was false by
        default the control was absent and the sentence simply dangled.

        One control, in the note's place, above the Parent picker, asking the
        question the note used to answer. The `?` is load-bearing rather than
        decorative — 13.591a asserts the old sentence is gone AND the new
        question is present, and `getByText` matches normalised text exactly, so
        the two strings cannot both be on screen.

        **`gn-new-ticket__note` is not reused, and it had no rule to reuse.**
        `ui.css` holds exactly two `.gn-new-ticket` rules — `__actions` and
        `__field` (`:2794`, `:2795`) — so the old note was a `<p>` wearing a
        name nothing styled, and the old checkbox took its spacing from
        `gn-new-ticket__field` rather than from `__start-focus`. The wrapper is
        therefore the shared `Switch`'s own `.gn-switch-row` label and
        `.gn-switch` input — the product's ONE on/off control
        (`packages/ui/src/components/switch.tsx`) — and neither dead class name
        is carried over to imply a rule that was never there.
      */}
      <Switch
        checked={startInBacklog}
        onChange={(next) => {
          setStartInBacklog(next);
          // Written at the moment of the CHOICE, not at creation (owner ruling
          // 2026-09-23: *"same as how workspace and project is remembered"*).
          // The workspace and project records are written when the person opens
          // one — the act of choosing is what is remembered there — and the
          // analogue here is the act of setting the switch, so a Cancel after a
          // deliberate answer keeps it. A create-time write would also be a
          // write this component cannot make: it does not submit, and it does
          // not know whether the attempt succeeded.
          rememberNewTicketStart(userId, next ? 'backlog' : 'focus');
        }}
      >
        Starts in the backlog?
      </Switch>
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
      {/*
        THE STARTING STATUS (starting-status design, 2026-09-23) — below Type,
        the design's own placement, since a status is a state of the workflow
        the chosen type is bound to. `currentStates === null` is the LOADING
        arm: `workflowStates` has not answered for this workflow yet, so the
        control is disabled with placeholder copy rather than offering a list
        it does not actually have. Options are `creatableStates` — THIS
        component's own filter over the workflow's full state list (see its
        own docblock above) — so a terminal or `creatable: false` state can
        never be offered, whatever the caller handed over.

        DISABLED while "Starts in the backlog?" is ON (owner ruling — "the
        state selection is disabled if starting from backlog"), with the
        helper sentence naming the state a backlog ticket actually starts in.
        Turning the switch back OFF re-enables it with whatever value was
        already here (`stateId` is never cleared by the switch, see its own
        docblock).
      */}
      <label className="gn-new-ticket__field">
        Starting status
        <Select
          options={
            creatableStates === null
              ? []
              : creatableStates.map((state) => ({ value: state.id, label: state.name }))
          }
          value={currentStates === null || stateId === '' ? null : stateId}
          onChange={setStateId}
          disabled={startInBacklog || currentStates === null}
          placeholder={currentStates === null ? 'Loading states…' : 'Choose a status'}
          aria-label="Starting status"
        />
        {startInBacklog ? (
          <p role="status" className="gn-new-ticket__status-hint">
            A backlog ticket starts in{' '}
            {currentStates === null
              ? 'the workflow’s initial state'
              : (currentStates.states.find((state) => state.id === currentStates.initialStateId)
                  ?.name ?? currentStates.initialStateId)}{' '}
            when it enters focus
          </p>
        ) : null}
        {/*
          THE INLINE REFUSAL (starting-status design, 2026-09-23) — computed
          by `CreateTicketFlow`, which holds the `ClientStateCache` and the
          project id this dialog does not, from the same `precheckEvent`/
          `isCreatableState` path the engine itself runs. `undefined` is the
          ordinary case: `creatableStates` above already filters to
          `creatable`, so this renders only when the flow's cached
          definition disagrees with what `workflowStates` offered.
        */}
        {stateRefusal !== undefined ? (
          <p role="alert" className="gn-refusal gn-refusal--preview">
            {stateRefusal}
          </p>
        ) : null}
      </label>
      {/*
        THE BIRTH START AND DUE DATE (addendum, 2026-09-23: "put due date as
        well on the ticket creation form" … "both start and due date") —
        below the Starting status select, the addendum's own placement. The
        SAME native `<input type="date">` the sheet's own due-date row uses
        (`ticket-sheet.tsx:3261-3287`), empty by default. Validated
        client-side with the SAME `dueDateValueSchema` import (no copy of the
        regex, per the plan author's ruling) — there is NO precheck branch
        for dates, so an invalid day is caught here or not at all before
        submit.
      */}
      <label className="gn-new-ticket__field">
        Start date
        <input
          className="gn-field__input"
          type="date"
          aria-label="Start date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        {startDateInvalid ? (
          <p role="alert" className="gn-refusal gn-refusal--preview">
            Start date must be a real day in YYYY-MM-DD form.
          </p>
        ) : null}
      </label>
      <label className="gn-new-ticket__field">
        Due date
        <input
          className="gn-field__input"
          type="date"
          aria-label="Due date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        {dueDateInvalid ? (
          <p role="alert" className="gn-refusal gn-refusal--preview">
            Due date must be a real day in YYYY-MM-DD form.
          </p>
        ) : null}
      </label>
      <div className="gn-new-ticket__field">
        <span>Priority</span>
        {/* The prototype's control (`desktop.dc.html:1592-1599`), preselected at
            the middle — the owner's *"everything starts at p2 the middle"*. The
            default is a CHOICE this client sends explicitly; it is never left to
            the wire's absence-means-P2 rule, which exists for events older than
            the field.

            A `<div>` and not a `<label>`, unlike the three fields around it: a
            `<label>` wrapping a `tablist` would absorb the three tabs into the
            LABEL's own text and give the group a computed name made of its
            options. `SegmentedControl` takes its accessible name as a required
            prop for exactly this reason, and the name is `Priority`. */}
        <SegmentedControl
          options={PRIORITIES.map((level) => ({ value: level, label: level }))}
          value={priority}
          onChange={setPriority}
          aria-label="Priority"
        />
      </div>
      {/*
        THE DESCRIPTION (owner request 2026-09-23) — the prototype's own place
        for it (`desktop.dc.html:1617`, between Priority and the Column/Assignee
        row), and the prototype's own caption.

        A `<div>` and not a `<label>`, for the reason the Priority field above
        records: a `<label>` wrapping the composer would absorb the whole editing
        surface into the LABEL's text and give the field a computed name made of
        its content. The composer takes its own accessible name from the slot
        (`TicketEditorSlot` derives it from `mode`), so nothing here needs to say
        it — and this `<span>` is a CAPTION for a sighted reader, deliberately not
        wired as a label, because the slot's own name is `Description` already and
        two names for one control is one too many.

        Absent slot, absent field: a caller with no editor gets the form it had
        before this task rather than a caption over nothing.
      */}
      {editorSlot === undefined ? null : (
        <div className="gn-new-ticket__field">
          <span>Description</span>
          {/*
            `createElement` rather than JSX: `editorSlot` is a VALUE of a
            component type, not a component name, and JSX requires a
            capitalized identifier or a member expression for that. This is
            the same call `TicketSheet` makes for its own `editorSlot`.

            No `submit`, deliberately. `onChange` is the only channel this mount
            uses — the ticket does not exist until Create is pressed, so there is
            nothing to submit to — and `TicketEditorSlot`'s own button is
            suppressed by the caller's wrapper (`submitSlot: 'none'`), which
            this component cannot ask for and must not be handed a control it
            cannot describe.
          */}
          {createElement(editorSlot, {
            mode: 'description',
            doc: null,
            readOnly: false,
            workspaceId,
            ticketId: draftTicketId,
            onChange: setDescription,
          })}
        </div>
      )}
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
            /*
              ONE line, and the line it USED to carry is the interesting part.

              Ruling 40 (coordinator, fix round 1, 2026-09-17) made this
              `onChange` reset `startInFocus` to `true` on EVERY selection, so
              that "checked by default" was a promise PER CHOSEN PARENT rather
              than a one-time initial value — switching from in-focus parent A
              to in-focus parent B rendered B's box at its own starting state
              instead of inheriting A's untick.

              That reset existed to serve a control that TRACKED the parent.
              The switch does not: it answers a question about the ticket, and
              the person's answer to it is REMEMBERED across sessions (owner
              ruling 2026-09-23). Keeping the reset would therefore be an active
              defect rather than a harmless vestige — picking a parent would
              silently overwrite an answer the person gave and this dialog has
              just been asked not to forget. So it is deleted, and choosing a
              parent now changes exactly one thing: the parent.
            */
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
      {/*
        ⚠ A CONTROL THAT WAS HERE IS GONE (owner ruling 2026-09-23), and the
        reason it is not merely moved is worth one paragraph for whoever greps
        for `Start in focus`.

        This slot held the "Start in focus" checkbox, rendered only while the
        parent chosen ABOVE was itself in focus — spec §5.4's condition, and the
        reason the control sat below the Parent picker rather than beside the
        note it could contradict. The owner lifted that condition, so the
        control is no longer conditional: it is the `Switch` above, and it asks
        the inverse question. Both of the things this slot did — the existence
        test and the reset-on-every-parent-selection that Ruling 40 added — went
        with the condition, and neither is left computed and unused here.
      */}
      {/*
        THE ASSIGNEE (owner request 2026-09-23), after Parent — the slot the
        prototype gives it (`desktop.dc.html:1633`, the Column/Assignee row,
        whose "Column" half this dialog does not have; a ticket's state is the
        workflow's business at birth, and `start` above is the one question about
        it that belongs here).

        A `<label>` like Title/Type/Parent, and unlike the two fields above it: it
        wraps a text CONTROL whose accessible name comes from the shared
        `Select`'s own `aria-label`, so wrapping it costs nothing — the same
        arrangement Parent already uses.
      */}
      <label className="gn-new-ticket__field">
        Assignee
        {assigneeCandidatesUnavailable === undefined ? (
          <Select
            options={[
              // "Unassigned" is an OPTION and not the absence of one, exactly as
              // "None (project root)" is above: a ticket is born with nobody on
              // it, that is a real state the control must be able to SHOW, and a
              // picker with no way back to it cannot un-assign.
              { value: UNASSIGNED, label: 'Unassigned' },
              // `memberLabel` has already been applied by the caller — a
              // nameless member arrives as their address, then their id, never
              // as a blank option (ruling E4-18 / E5-4, and the 2026-09-22
              // owner request for the address step).
              ...assigneeCandidates.map((person) => ({
                value: person.id,
                label: person.name,
              })),
            ]}
            value={assigneeId}
            onChange={setAssigneeId}
            searchable
            aria-label="Assignee"
          />
        ) : (
          // The sentence replaces the control, and the DRAFT is what makes this
          // honest: `create()` reads the same prop before emitting `assigneeId`,
          // so a selection made before the roster's read failed never travels.
          // Stated here rather than relied on, because it is the half that a
          // screen-only assertion cannot see (3.157's own lesson).
          <p role="status" className="gn-new-ticket__assignee-unavailable">
            This ticket will be created with nobody assigned: the roster of people who could be
            assigned cannot be shown. {assigneeCandidatesUnavailable}
          </p>
        )}
      </label>
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
            submitting ||
            // The two date inputs (addendum, 2026-09-23): a submit this
            // handler reaches must carry a real day or nothing, since there
            // is no precheck branch to catch a malformed one server-side
            // before it reaches the payload door.
            startDateInvalid ||
            dueDateInvalid
          }
          onClick={create}
        >
          Create
        </Button>
      </div>
    </Dialog>
  );
}
