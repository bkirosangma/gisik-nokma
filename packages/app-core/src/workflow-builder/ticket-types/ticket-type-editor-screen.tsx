import { useEffect, useState } from 'react';
import {
  BUILTIN_TICKET_TYPE_SEEDS,
  newUlid,
  ticketTypeDefSchema,
  type PublishedWorkflowDef,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
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

export function TicketTypeEditorScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  initialDef: TicketTypeDef | null;
  onSaved?: (def: TicketTypeDef) => void;
}) {
  const canAuthor = canAuthorRole(props.session.role);
  const [def, setDef] = useState<TicketTypeDef>(() => props.initialDef ?? freshDef());
  const [context, setContext] = useState<{ workflows: PublishedWorkflowDef[]; types: TicketTypeDef[] } | null>(null);
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
    void Promise.all([gateway.listWorkflows(workspaceId), gateway.listTicketTypes(workspaceId)]).then(
      ([workflows, types]) => {
        if (!cancelled) setContext({ workflows, types });
      },
    );
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

  if (context === null) return <p className="ticket-type-editor__loading">Loading ticket types…</p>;

  const isBuiltin = BUILTIN_TICKET_TYPE_SEEDS.some((seed) => seed.id === def.id);
  const parsed = ticketTypeDefSchema.safeParse(def);
  const schemaMessages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
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
      {canAuthor ? null : <ReadOnlyBanner />}
      <label className="ticket-type-editor__name">
        <span>Type name</span>
        <input
          type="text"
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
        <span>Hierarchy rank</span>
        <input
          type="number"
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
      <p className="ticket-type-editor__implications" data-testid="rank-implications">
        {rankImplicationsCopy(implications)}
      </p>
      <label className="ticket-type-editor__workflow">
        <span>Workflow</span>
        <select
          aria-label="Workflow"
          disabled={!canAuthor}
          value={def.workflowId}
          onChange={(changeEvent) => setDef((current) => ({ ...current, workflowId: changeEvent.target.value }))}
        >
          <option value="" disabled hidden></option>
          {context.workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
      </label>
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
      {canAuthor ? (
        <button
          type="button"
          className="ticket-type-editor__save"
          disabled={!parsed.success || save.phase === 'saving'}
          onClick={() => void onSave()}
        >
          Save ticket type
        </button>
      ) : null}
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
    </section>
  );
}
