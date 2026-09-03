import { useEffect, useState } from 'react';
import type { PublishedWorkflowDef, TicketTypeDef } from '@gisik-nokma/domain';
import { createDraftStore, type WorkflowDraft } from '../draft-store.js';
import type { WorkflowAuthoringGateway, WorkspaceMember } from '../gateway.js';
import {
  BuilderProvider,
  canAuthorRole,
  useBuilderEnv,
  useBuilderStore,
  useDraft,
  type BuilderEnvironment,
  type BuilderSession,
} from './builder-context.js';
import { InspectorPanel } from './inspector-panel.js';
import { IssuesPanel } from './issues-panel.js';
import { PublishControls } from './publish-controls.js';
import { SystemRulesPanel } from './system-rules-panel.js';
import { WorkflowCanvas } from './workflow-canvas.js';

function WorkflowNameField() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  return (
    <input
      type="text"
      className="workflow-builder-screen__name"
      aria-label="Workflow name"
      disabled={!canAuthor}
      value={draft.def.name}
      onChange={(changeEvent) => store.actions.setWorkflowName(changeEvent.target.value)}
    />
  );
}

function AddStateButton() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  if (!canAuthor) return null;
  return (
    <button
      type="button"
      className="workflow-builder-screen__add-state"
      onClick={() => store.actions.addState()}
    >
      Add state
    </button>
  );
}

export function WorkflowBuilderScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  initialDraft: WorkflowDraft;
  onPublished?: (payload: PublishedWorkflowDef) => void;
}) {
  const [store] = useState(() => createDraftStore(props.initialDraft));
  const [data, setData] = useState<{ members: WorkspaceMember[]; ticketTypes: TicketTypeDef[] } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      props.gateway.listMembers(props.workspaceId),
      props.gateway.listTicketTypes(props.workspaceId),
    ])
      .then(([members, ticketTypes]) => {
        if (!cancelled) setData({ members, ticketTypes });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.gateway, props.workspaceId]);

  if (loadFailed) {
    return (
      <p className="workflow-builder-screen__load-error">
        Could not load workspace people and types — reload to try again.
      </p>
    );
  }
  if (data === null) {
    return <p className="workflow-builder-screen__loading">Loading workspace people and types…</p>;
  }

  const env: BuilderEnvironment = {
    workspaceId: props.workspaceId,
    session: props.session,
    gateway: props.gateway,
    members: data.members,
    ticketTypes: data.ticketTypes,
    canAuthor: canAuthorRole(props.session.role),
  };

  return (
    <BuilderProvider store={store} env={env}>
      <div className="workflow-builder-screen">
        <header className="workflow-builder-screen__header">
          <WorkflowNameField />
          <AddStateButton />
          <PublishControls onPublished={props.onPublished} />
        </header>
        <div className="workflow-builder-screen__layout">
          <aside className="workflow-builder-screen__left">
            <SystemRulesPanel />
            <IssuesPanel />
          </aside>
          <main className="workflow-builder-screen__canvas">
            <WorkflowCanvas />
          </main>
          <aside className="workflow-builder-screen__right">
            <InspectorPanel />
          </aside>
        </div>
      </div>
    </BuilderProvider>
  );
}
