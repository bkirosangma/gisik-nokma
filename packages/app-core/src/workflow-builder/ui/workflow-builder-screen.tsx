import { useEffect, useState } from 'react';
import { Button } from '@gisik-nokma/ui';
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
import { ReadOnlyBanner } from './read-only-banner.js';
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
  // The shared `Button`, not a bare `<button>`: the prototype's "Add state" is
  // `ctlBg` + accent + weight 600 with no border (`:1016`), which is exactly the
  // idiom `.gn-button` already carries (fill-tertiary + text-accent + 600, no
  // border), and `.ticket-type-list__new` is the sibling precedent for a
  // builder action reaching for the component rather than a bespoke rule.
  return (
    <Button className="workflow-builder-screen__add-state" onClick={() => store.actions.addState()}>
      Add state
    </Button>
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
    // A guest may not call GET /v1/workspaces/:id/members (executor ruling
    // 2026-09-02, coordination doc ~5442-5465; see gateway.ts's listMembers
    // docstring) — that refusal is not a load failure, it is an empty roster.
    // Only listTicketTypes rejecting is treated as fatal to this screen.
    Promise.all([
      props.gateway.listMembers(props.workspaceId).catch(() => [] as WorkspaceMember[]),
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
          {env.canAuthor ? null : <ReadOnlyBanner />}
          {/* The prototype's header is one row carrying the title on the left
              and the actions on the right (`:1015-1022`); the banner sits above
              it rather than inside it, which is why this is a wrapper and not
              four more children of `__header`. The prototype's third piece —
              a `wfStatus` line ("Draft · last saved 11:58") — is NOT here:
              `last saved`/`lastSaved`/`wfStatus` are 0 hits repo-wide, so there
              is no state to render. Named as an absence, not built. */}
          <div className="workflow-builder-screen__title-row">
            <WorkflowNameField />
            <div className="workflow-builder-screen__actions">
              <AddStateButton />
              <PublishControls onPublished={props.onPublished} />
            </div>
          </div>
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
