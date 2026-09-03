import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { TicketTypeDef, WorkspaceRole } from '@gisik-nokma/domain';
import type { DraftStore, WorkflowDraft } from '../draft-store.js';
import { fieldChoicesFor } from '../fields.js';
import type { WorkflowAuthoringGateway, WorkspaceMember } from '../gateway.js';
import { summaryContextFor, type SummaryContext } from '../summaries.js';

export type BuilderSession = { userId: string; role: WorkspaceRole };

export type BuilderEnvironment = {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  members: WorkspaceMember[];
  ticketTypes: TicketTypeDef[];
  canAuthor: boolean;
};

export function canAuthorRole(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}

const StoreContext = createContext<DraftStore | null>(null);
const EnvContext = createContext<BuilderEnvironment | null>(null);

export function BuilderProvider(props: {
  store: DraftStore;
  env: BuilderEnvironment;
  children: ReactNode;
}) {
  return (
    <StoreContext.Provider value={props.store}>
      <EnvContext.Provider value={props.env}>{props.children}</EnvContext.Provider>
    </StoreContext.Provider>
  );
}

export function useBuilderStore(): DraftStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useBuilderStore requires a BuilderProvider');
  return store;
}

export function useBuilderEnv(): BuilderEnvironment {
  const env = useContext(EnvContext);
  if (env === null) throw new Error('useBuilderEnv requires a BuilderProvider');
  return env;
}

export function useDraft(): WorkflowDraft {
  const store = useBuilderStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Names for rule summaries: workspace members, plus fields of the types bound to this workflow. */
export function useSummaryCtx(): SummaryContext {
  const env = useBuilderEnv();
  const draft = useDraft();
  return useMemo(() => {
    const boundTypes = env.ticketTypes.filter((type) => type.workflowId === draft.def.id);
    return summaryContextFor(draft.def, {
      memberNames: new Map(env.members.map((member) => [member.userId, member.displayName])),
      fields: fieldChoicesFor(boundTypes),
    });
  }, [env.ticketTypes, env.members, draft.def]);
}
