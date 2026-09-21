import { useEffect, useState, type ReactNode } from 'react';
import {
  BUILTIN_TICKET_TYPE_SEEDS,
  newUlid,
  ticketTypeDefSchema,
  type PublishedWorkflowDef,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import { Card, Select } from '@gisik-nokma/ui';
import { buildTicketTypeDefinedEvent } from '../events.js';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from '../ui/builder-context.js';
import { ReadOnlyBanner } from '../ui/read-only-banner.js';
import { FieldsEditor } from './fields-editor.js';
import { IconPicker } from './icon-picker.js';
import { rankImplications, rankImplicationsCopy } from './rank.js';
import { WorkflowRebindDialog } from './workflow-rebind-dialog.js';

type SavePhase =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved' }
  | { phase: 'refused'; rule: string; reason: string }
  | { phase: 'invalid'; message: string };

/**
 * What the admin decided about the tickets the re-binding leaves behind.
 *
 * Every phase that concerns a MOVE carries the workflow that move targets.
 * That target is pinned when `Move them to …` is clicked and never re-derived
 * from the combobox again, because the combobox keeps moving: the admin can
 * re-point it while the mapping dialog is open, or after the migration has
 * already run. Deriving the target at render made the dialog retarget itself
 * mid-mapping (it submitted the OLD workflow's state ids against the NEW
 * workflow) and rewrote the completed-move sentence into a statement about a
 * migration that never happened. A recorded action names the thing it acted on.
 */
type RebindPhase =
  | { phase: 'undecided' }
  | { phase: 'left' }
  | { phase: 'mapping'; toWorkflowId: string }
  | { phase: 'migrating'; toWorkflowId: string }
  | { phase: 'migrated'; count: number; toWorkflowName: string }
  | { phase: 'refused'; rule: string; reason: string };

/** `null` = still counting; `'failed'` = the read failed and we say so. */
type Population = { count: number } | 'failed' | null;

function freshDef(): TicketTypeDef {
  return { id: newUlid(), name: '', icon: 'flag', rank: 3, workflowId: '', fields: [] };
}

function divergenceCountLine(population: Population): string | null {
  if (population === 'failed') return 'ticket count unavailable';
  if (population === null) return 'counting tickets…';
  return null; // the body sentence carries the number
}

/**
 * The divergence, said plainly. Never substitutes a zero for a count it does
 * not have — an admin told "0 tickets stay behind" when the read failed would
 * make a decision on a number nobody checked. This is the same asymmetry the
 * mapping dialog's countLine keeps, for the same reason: a number that was
 * never measured is worse than an admitted gap.
 */
function divergenceBody(population: Population, outgoing: string, incoming: string): string | null {
  if (population === null) return null;
  if (population === 'failed') {
    return `Existing tickets of this type stay on "${outgoing}" — we could not count how many. New ones will use "${incoming}".`;
  }
  if (population.count === 0) return `No tickets of this type are on "${outgoing}" — nothing stays behind.`;
  if (population.count === 1) {
    return `1 existing ticket of this type stays on "${outgoing}". New ones will use "${incoming}".`;
  }
  return `${population.count} existing tickets of this type stay on "${outgoing}". New ones will use "${incoming}".`;
}

/**
 * The screen's header row — the type's name, the control that leaves, and the
 * control that saves, all in ONE row (`desktop.dc.html@6d7b67c0a52c:874-880`).
 *
 * ## Why the screen owns it and the pane does not
 *
 * The prototype puts `Cancel` and `Save type` on the same line as the name. The
 * pane (`apps/web/src/ticket-type-editor-pane.tsx`) had the name and Cancel; the
 * SCREEN had the Save, at the form's foot, because the screen is what owns
 * `parsed`, `save` and the `canAuthor` gate. Two components' subtrees cannot be
 * one flex row, so the row has to live where the Save's state lives. The pane now
 * passes its `Cancel` IN as a node rather than rendering a competing header —
 * which is also why `cancel` is a `ReactNode` and not a URL: the two callers
 * hand it a real `<Link>` (keyboard- and screen-reader navigable), and the
 * standalone route and the `/settings` pane keep passing different ones.
 *
 * ## The title tracks the LIVE name, not the stored one
 *
 * The prototype binds this heading to `editTypeName` (`:876`) — the same state
 * the Name input writes. The pane used to render the name it had FETCHED, so
 * typing a new name left the heading showing the old one until a save. That was
 * a real divergence, and folding the header in here fixes it as a consequence of
 * the move rather than as a separate change.
 *
 * ## Element level is the CALLER's, the size is the prototype's
 *
 * The prototype's row is an `<h2>` at 22px/28px inside its own shell. The
 * product's standalone route has no other heading, so it passes `'h1'`; the
 * `/settings` pane, whose own `<h1>Settings</h1>` owns level 1, passes `'h2'` —
 * the same split `TicketTypeListScreen` already keeps. Demoting the standalone
 * route to `h2` to match the prototype's TAG would leave that page with no level
 * 1 at all, which is an accessibility loss and not a port; adopting the SIZE and
 * the ROW is the port. Recorded divergence: tag kept, scale adopted.
 */
function EditorHeader(props: {
  name: string;
  untitledLabel: string;
  heading: 'h1' | 'h2';
  canAuthor: boolean;
  cancel?: ReactNode;
  saveDisabled: boolean;
  onSave(): void;
}) {
  const Heading = props.heading;
  return (
    <div className="gn-type-editor-header" data-testid="type-editor-header">
      <Heading className="gn-type-editor-header__title">
        {props.name === '' ? props.untitledLabel : props.name}
      </Heading>
      <div className="gn-type-editor-header__actions">
        {props.cancel}
        {/* The Save is the FORM'S control and keeps every one of its gates: it
            is `disabled` on a def the schema refuses and while a submit is in
            flight, and it does not exist at all for a non-author. Moving it must
            not turn it into a button that reports success about a def the server
            will reject. */}
        {props.canAuthor ? (
          <button
            type="button"
            className="ticket-type-editor__save"
            disabled={props.saveDisabled}
            onClick={props.onSave}
          >
            Save ticket type
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TicketTypeEditorScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  initialDef: TicketTypeDef | null;
  onSaved?: (def: TicketTypeDef) => void;
  /** The control that leaves the editor. A real `<Link>` in both callers. */
  cancel?: ReactNode;
  /** Element level for the name; the caller's call, for the reason above. */
  heading?: 'h1' | 'h2';
  /** Shown when the type has no name yet — `New ticket type` on the new pane. */
  untitledLabel?: string;
}) {
  const canAuthor = canAuthorRole(props.session.role);
  const [def, setDef] = useState<TicketTypeDef>(() => props.initialDef ?? freshDef());
  const [context, setContext] = useState<{ workflows: PublishedWorkflowDef[]; types: TicketTypeDef[] } | null>(null);
  // A read that REJECTED, told apart from one still in flight (E2-20). The
  // `context === null` gate below cannot make that distinction on its own, so a
  // rejected `Promise.all` was drawn as "Loading ticket types…" for ever.
  const [loadFailed, setLoadFailed] = useState(false);
  const [save, setSave] = useState<SavePhase>({ phase: 'idle' });
  const [population, setPopulation] = useState<Population>(null);
  const [rebind, setRebind] = useState<RebindPhase>({ phase: 'undecided' });
  // The binding the SERVER has. `save.phase === 'saved'` answers "has this form
  // ever been saved?", which is not the question the move gate asks — after
  // saving one re-bind the admin can re-point the combobox again, and a gate on
  // the phase alone would happily fire an irreversible bulk migration at a
  // workflow the type is not bound to, producing the exact inversion this gate
  // exists to prevent: new tickets to the saved workflow, old tickets to the
  // one merely selected.
  const [savedWorkflowId, setSavedWorkflowId] = useState<string | null>(props.initialDef?.workflowId ?? null);

  // The workflow this type was bound to when the screen opened. A ticket pins
  // the workflow it was created under (owner decision 2026-08-26), so THIS is
  // the workflow the existing population stays on — not whatever the combobox
  // currently reads.
  const outgoingWorkflowId = props.initialDef?.workflowId ?? null;
  const diverged = outgoingWorkflowId !== null && outgoingWorkflowId !== '' && def.workflowId !== outgoingWorkflowId;

  const { gateway, workspaceId } = props;
  const defId = def.id;

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    void Promise.all([gateway.listWorkflows(workspaceId), gateway.listTicketTypes(workspaceId)])
      .then(([workflows, types]) => {
        if (!cancelled) setContext({ workflows, types });
      })
      // Without this arm a rejected read left `context` null, which the gate below
      // draws as "Loading ticket types…" — an error reported as a load that never
      // ends. The sentence is the one the sibling screens use
      // (`workflow-list-screen.tsx:198`, `workflow-builder-screen.tsx:88`).
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId]);

  useEffect(() => {
    if (!diverged || outgoingWorkflowId === null) {
      setPopulation(null);
      setRebind({ phase: 'undecided' });
      return;
    }
    let cancelled = false;
    setPopulation(null);
    gateway
      .getTypeWorkflowPopulation(workspaceId, defId, outgoingWorkflowId)
      .then((count) => {
        if (!cancelled) setPopulation({ count });
      })
      .catch(() => {
        // Honest degradation, the same shape the mapping dialog uses: the read
        // failing is not the same as there being nothing there.
        if (!cancelled) setPopulation('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [diverged, outgoingWorkflowId, defId, gateway, workspaceId]);

  const isBuiltin = BUILTIN_TICKET_TYPE_SEEDS.some((seed) => seed.id === def.id);
  const parsed = ticketTypeDefSchema.safeParse(def);
  const schemaMessages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  const heading = props.heading ?? 'h2';
  const untitledLabel = props.untitledLabel ?? 'Untitled type';
  const saveDisabled = !parsed.success || save.phase === 'saving';
  const header = (
    <EditorHeader
      name={def.name}
      untitledLabel={untitledLabel}
      heading={heading}
      canAuthor={canAuthor}
      cancel={props.cancel}
      saveDisabled={saveDisabled}
      onSave={() => void onSave()}
    />
  );

  // The error arm comes BEFORE the loading gate — the order `settings/page.tsx:277-284`
  // records. The header renders here too, for the reason the loading arm's own note
  // gives: it is the row that says WHICH type the person was editing, and dropping it
  // at the moment the read fails is the one moment that question matters.
  if (loadFailed) {
    return (
      <section className="ticket-type-editor">
        {header}
        <p className="ticket-type-editor__load-error">Could not load ticket types — reload to try again.</p>
      </section>
    );
  }

  // The header renders in the LOADING arm too, and that is not cosmetic: the pane
  // used to draw the name and Cancel from its own fetch while this screen showed
  // "Loading ticket types…" underneath. Folding the header in here would have
  // blanked it during every load if the early return above it had stayed bare.
  if (context === null) {
    return (
      <section className="ticket-type-editor">
        {header}
        <p className="ticket-type-editor__loading">Loading ticket types…</p>
      </section>
    );
  }

  const implications = rankImplications(def.id, def.rank, context.types);
  const outgoingWorkflow = context.workflows.find((workflow) => workflow.id === outgoingWorkflowId) ?? null;
  const incomingWorkflow = context.workflows.find((workflow) => workflow.id === def.workflowId) ?? null;
  const showDivergence = diverged && outgoingWorkflow !== null && incomingWorkflow !== null;
  // Nothing to move and nothing to leave — the notice states the fact and stops.
  const nothingStaysBehind = population !== null && population !== 'failed' && population.count === 0;
  // The workflow a move in flight is aimed at, resolved from the pinned id.
  const pendingTarget =
    rebind.phase === 'mapping' || rebind.phase === 'migrating'
      ? (context.workflows.find((workflow) => workflow.id === rebind.toWorkflowId) ?? null)
      : null;
  // The selected binding is the one the server has. This — not "was anything
  // ever saved?" — is what makes a move safe: it is the whole guarantee that the
  // tickets being moved land where NEW tickets of this type will also land.
  const bindingCommitted = def.workflowId === savedWorkflowId;

  async function onMigrate(target: PublishedWorkflowDef, stateMap: Record<string, string>): Promise<void> {
    if (outgoingWorkflow === null) return;
    setRebind({ phase: 'migrating', toWorkflowId: target.id });
    const outcome = await gateway.migrateTypeToWorkflow({
      workspaceId,
      typeId: def.id,
      fromWorkflowId: outgoingWorkflow.id,
      toWorkflowId: target.id,
      stateMap,
    });
    setRebind(
      outcome.status === 'migrated'
        ? { phase: 'migrated', count: outcome.count, toWorkflowName: target.name }
        : { phase: 'refused', rule: outcome.rule, reason: outcome.reason },
    );
  }

  async function onSave(): Promise<void> {
    setSave({ phase: 'saving' });
    const event = buildTicketTypeDefinedEvent({
      workspaceId,
      actorId: props.session.userId,
      origin: 'web',
      def,
    });
    const [result] = await gateway.submit([event]);
    if (result === undefined) throw new Error('gateway.submit returned no result for the event');
    switch (result.status) {
      case 'committed':
        setSave({ phase: 'saved' });
        setSavedWorkflowId(def.workflowId);
        props.onSaved?.(def);
        return;
      case 'refused':
        setSave({ phase: 'refused', rule: result.rule, reason: result.reason });
        return;
      case 'invalid':
        setSave({ phase: 'invalid', message: result.message });
        return;
    }
  }

  return (
    <section className="ticket-type-editor">
      {header}
      {canAuthor ? null : <ReadOnlyBanner />}
      <div className="ticket-type-editor__layout">
        <div className="ticket-type-editor__main">
          <Card className="ticket-type-editor__card">
            <label className="ticket-type-editor__name">
              <span className="gn-field__label">Type name</span>
              <input
                type="text"
                className="gn-field__input"
                aria-label="Type name"
                disabled={!canAuthor}
                value={def.name}
                onChange={(changeEvent) => setDef((current) => ({ ...current, name: changeEvent.target.value }))}
              />
            </label>
            <IconPicker
              value={def.icon}
              disabled={!canAuthor}
              onChange={(icon) => setDef((current) => ({ ...current, icon }))}
            />
            <label className="ticket-type-editor__rank">
              <span className="gn-field__label">Hierarchy rank</span>
              <input
                type="number"
                className="gn-field__input"
                aria-label="Hierarchy rank"
                min={1}
                disabled={!canAuthor || isBuiltin}
                value={def.rank}
                onChange={(changeEvent) =>
                  setDef((current) => ({ ...current, rank: Number.parseInt(changeEvent.target.value, 10) || 1 }))
                }
              />
            </label>
            {isBuiltin ? (
              <p className="ticket-type-editor__builtin-note">Built-in type — its place in the hierarchy is fixed.</p>
            ) : null}
          </Card>
          <Card className="ticket-type-editor__card">
            <label className="ticket-type-editor__workflow">
              <span className="gn-field__label">Workflow</span>
              <Select
                options={context.workflows.map((workflow) => ({ value: workflow.id, label: workflow.name }))}
                value={def.workflowId || null}
                onChange={(workflowId) => setDef((current) => ({ ...current, workflowId }))}
                disabled={!canAuthor}
                searchable
                aria-label="Workflow"
              />
            </label>
          </Card>
          <Card className="ticket-type-editor__card">
            <h3 className="ticket-type-editor__fields-title">{`Fields · ${def.fields.length}`}</h3>
            <FieldsEditor
              fields={def.fields}
              disabled={!canAuthor}
              onChange={(fields) => setDef((current) => ({ ...current, fields }))}
            />
            {schemaMessages.length > 0 ? (
              <ul className="ticket-type-editor__issues">
                {schemaMessages.map((message, at) => (
                  <li key={at}>{message}</li>
                ))}
              </ul>
            ) : null}
          </Card>
          {/* The Save is NOT here any more — it moved into the header row with
              Cancel and the name, which is where the prototype puts it
              (`desktop.dc.html@6d7b67c0a52c:879`). What stays at the form's foot
              is the OUTCOME (`saved`/`refused`/`invalid`), which is a report
              about the submit rather than the control that starts one.

              The keyboard consequence is real and is recorded rather than
              smoothed over: the Save is now the FIRST control in the screen's
              tab order that submits, so a user who fills the form from the top
              reaches it with Shift+Tab, not by tabbing past the fields. The
              prototype draws it this way; the alternative — two Save controls
              with one state — is the defect class this repo keeps re-finding. */}
          {/* The other half of the same guarantee: a screen that still reads
              "Ticket type saved." beside a binding the server has never seen is
              reporting success about an uncommitted state. */}
          {save.phase === 'saved' && bindingCommitted ? (
            <p className="ticket-type-editor__saved">Ticket type saved.</p>
          ) : null}
          {save.phase === 'refused' ? (
            <div className="ticket-type-editor__refused">
              <p>The server refused this ticket type.</p>
              <p>{save.reason}</p>
              <p>{`rule: ${save.rule}`}</p>
            </div>
          ) : null}
          {save.phase === 'invalid' ? (
            <div className="ticket-type-editor__invalid">
              <p>The server could not read this claim.</p>
              <p>{save.message}</p>
            </div>
          ) : null}
        </div>
        <aside className="ticket-type-editor__aside">
            {/* THE NOTICE LIVES HERE NOW, AND ITS PLACEMENT IS THE PORT.
              The prototype draws it as its own `--tintWarning` card in the
              right-hand column, above Implications (`desktop.dc.html@6d7b67c0a52c:924-943`);
              the product kept it INSIDE the Workflow card. That was recorded as
              the delta, and this is the move.

              `--gn-tint-warning` is an ALPHA role whose documented correctness is
              a condition on its GROUND (`packages/ui/src/tokens.ts`), so the
              condition is re-established here rather than inherited: the aside
              sets no background and neither does anything above it, so this card
              composites over `--gn-surface` — the SAME ground the banner and the
              attention strip already measure. Measured across all six
              style×theme combinations before the move: `text` 10.51–11.94 and
              `textMuted` 8.23–12.08, against a 4.5 floor. The raised hand was
              measured too, because the card it left sat on one: `text` 9.79–11.91,
              `textMuted` 9.33–9.91. **Both grounds clear the floor, so the move
              is not contingent on the measurement** — that is the finding, not a
              reassurance.

              ## THE 3px `--gn-warning` MARKER IS GONE, AND IT IS NOT A CONTRAST CHANGE
              The prototype's own annotation for this block reads *"the bordered +
              left-ruled box becomes a warning-tinted fill"* (`:923`), and the
              refreshed prototype carries no border. The wash says what the marker
              said. This is NOT a reversal of a measurement: no ledger row covers
              this element — `hig-per-screen/7a`/`8a` rule on `.gn-attention` and
              `.gn-state-node`, and both were re-measured for this change — and
              the treatment matches `.gn-invitations` and `.gn-attention`, which
              each took the wash and dropped their inline-start rule.

              ## "Choose again" IS DELIBERATELY NOT BUILT (rule, not an omission)
              The prototype's `strandedDone` card offers a `Choose again` control
              that re-opens a completed move (`:930`). **No reopen door exists on
              the gateway, and a button with no door is the defect this repo keeps
              re-finding**, so the migrated branch below stays TERMINAL: it states
              what moved and offers no way back it cannot honour. Recorded as an
              absence with an owner (whoever first adds a reopen route to
              `WorkflowAuthoringGateway`), not as an empty slot.

              ## THE MOVE NAMES THE WORKFLOW, NEVER A STATE (rule, not an oversight)
              The prototype's button reads `Move them to Scheduled` — a STATE. The
              product's names the WORKFLOW (`:Move them to "${incomingWorkflow.name}"…`
              below), because a re-binding moves tickets between workflows and the
              state mapping is the dialog's own, per ticket. A reader comparing the
              two screens will find the prototype's word and not this one; the
              difference is deliberate, and it is recorded HERE, at the button, so
              it does not read as a transcription slip. Case 13.310 already pins
              the real workflow name against the rejected literal. */}
            {showDivergence ? (
              <section className="ticket-type-editor__divergence" data-testid="workflow-divergence">
                {rebind.phase === 'migrated' ? (
                  // The divergence is OVER for these tickets, so the notice stops
                  // asserting it. Left standing, the heading and body went on saying
                  // "14 existing tickets of this type stay on X" in the same paragraph
                  // as "14 tickets moved to Y" — a contradiction the screen printed to
                  // itself. The count behind that body was read before the move and is
                  // not re-read, so the honest thing is to retire it, not restate it.
                  <p className="ticket-type-editor__divergence-migrated">
                    {rebind.count === 1
                      ? `1 ticket moved to "${rebind.toWorkflowName}".`
                      : `${rebind.count} tickets moved to "${rebind.toWorkflowName}".`}
                  </p>
                ) : (
                  <>
                    <h3 className="ticket-type-editor__divergence-title">Existing tickets stay where they are</h3>
                    {divergenceCountLine(population) !== null ? (
                      <p className="ticket-type-editor__divergence-count">{divergenceCountLine(population)}</p>
                    ) : null}
                    {divergenceBody(population, outgoingWorkflow.name, incomingWorkflow.name) !== null ? (
                      <p className="ticket-type-editor__divergence-body">
                        {divergenceBody(population, outgoingWorkflow.name, incomingWorkflow.name)}
                      </p>
                    ) : null}
                    {nothingStaysBehind ? null : rebind.phase === 'left' ? (
                      <p className="ticket-type-editor__divergence-left">
                        {`Left on "${outgoingWorkflow.name}". They keep their own board columns.`}
                      </p>
                    ) : (
                      // The `!canAuthor` term on both buttons below is defence in
                      // depth, and it is NOT pinned by a test — deliberately, because
                      // no test can reach it. `diverged` is false at mount for every
                      // role (it compares def.workflowId against the initialDef's
                      // own), and the only gesture that can make it true is the
                      // Workflow combobox, which is itself `disabled={!canAuthor}`.
                      // Measured at this sha: dropping `!canAuthor` from either
                      // button reddens 0 of the 213 tests in test/workflow-builder +
                      // test/ticket-types. The lock that actually holds is the outer
                      // one, and THAT is tested — access.test.tsx's "locks the binding
                      // itself, so the divergence section a migration lives in never
                      // opens". A test aimed at these two terms would have to defeat
                      // the combobox gate in its own setup, and would then be
                      // asserting that setup rather than the gate.
                      <>
                      <div className="ticket-type-editor__divergence-actions">
                        <button
                          type="button"
                          className="ticket-type-editor__divergence-move"
                          disabled={!canAuthor || !bindingCommitted || rebind.phase === 'migrating'}
                          onClick={() => setRebind({ phase: 'mapping', toWorkflowId: def.workflowId })}
                        >
                          {`Move them to "${incomingWorkflow.name}"…`}
                        </button>
                        {/* Staying put is a decision, not the absence of one. */}
                        <button
                          type="button"
                          className="ticket-type-editor__divergence-leave"
                          disabled={!canAuthor}
                          onClick={() => setRebind({ phase: 'left' })}
                        >
                          {`Leave them on "${outgoingWorkflow.name}"`}
                        </button>
                        {bindingCommitted ? null : (
                          <p className="ticket-type-editor__divergence-hint">
                            {`Save the ticket type first — until it is saved, new tickets would still go to "${outgoingWorkflow.name}".`}
                          </p>
                        )}
                      </div>
                      {/* The prototype states the position the product already
                          held in a source comment beside the Leave button —
                          "Staying put is a decision, not the absence of one."
                          A comment is not something an admin deciding this can
                          read, which is exactly what the delta audit's 0-hit
                          measurement across `apps/` and `packages/` showed: a
                          position the product takes only in its own source.

                          It renders with the two buttons and not outside them,
                          because it is a sentence about THAT choice — the
                          `left` branch above it has already made the decision
                          and the migrated branch has finished making it. */}
                      <p className="ticket-type-editor__divergence-note">
                        Neither choice is recommended over the other — leaving them is a decision, not a deferral.
                      </p>
                      </>
                    )}
                    {rebind.phase === 'mapping' && pendingTarget !== null ? (
                      <WorkflowRebindDialog
                        fromWorkflow={outgoingWorkflow}
                        toWorkflow={pendingTarget}
                        onCancel={() => setRebind({ phase: 'left' })}
                        onConfirm={(stateMap) => void onMigrate(pendingTarget, stateMap)}
                      />
                    ) : null}
                    {rebind.phase === 'refused' ? (
                      <div className="ticket-type-editor__divergence-refused">
                        <p>The server refused this move.</p>
                        <p>{rebind.reason}</p>
                        <p>{`rule: ${rebind.rule}`}</p>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}

          <Card className="ticket-type-editor__card">
            <h3 className="ticket-type-editor__aside-title">Implications</h3>
            {/* The prototype's three-item list (`desktop.dc.html:949-953`), and
                the derived sentence is its MIDDLE item rather than something
                this port replaced. Two of the three lines are constant; the
                second is the only line on this screen computed from the
                workspace's own types (`rankImplications`), and a port that
                swapped it out would still render an "Implications" card and
                still show both prototype strings while silently deleting it.
                Case 13.922 is the assertion that says which one is not
                constant.

                The prototype sets these at 15px/20px under a 17px title. This
                screen runs a compressed scale throughout — its own aside title
                is 0.9rem — so the items keep the size they already had
                (0.75rem, shared with `__builtin-note`) rather than arriving
                larger than the heading they sit under. The prototype's rhythm
                (a 1.25rem indent, 0.375rem between rows, a real bullet) is
                adopted; its type size is not, and that is a deliberate
                divergence rather than an oversight. */}
            <ul
              className="ticket-type-editor__implications ticket-type-editor__implications-list"
              data-testid="rank-implications-list"
            >
              <li>
                {'Two pickers will re-order: the board’s New ticket menu and MCP’s '}
                <code className="ticket-type-editor__code">create_ticket</code>.
              </li>
              <li data-testid="rank-implications">{rankImplicationsCopy(implications)}</li>
              <li>Published workflows are versioned — nothing already recorded is rewritten.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </section>
  );
}
