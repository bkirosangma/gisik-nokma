import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource } from '../data-source.js';
import type { AttentionShow } from '../my-work-global-contract.js';
import type { AttentionItem, MyWorkView, WorkspaceRef } from '../view-types.js';
import { showForWorkspace } from './my-work-global.js';
import { scheduleReload, subscribeReloads } from './reload-scheduler.js';

/** One section of the global page: the merged answer, and which workspaces failed to give theirs. */
export type GlobalSection<T> = {
  /**
   * The merged answer once every asked workspace has answered — `null` until then, and
   * `null` when EVERY asked workspace failed (then `error` says why).
   */
  data: T | null;
  /** Set only when every asked workspace failed: the first failure's message, in list order. */
  error: string | null;
  /** The failures among workspaces that did not blank the rest, by workspace id. */
  byWorkspace: Record<string, string>;
  /** Has the CURRENT question been answered (by data or by error)? */
  settled: boolean;
};

export type GlobalMyWork = {
  attention: GlobalSection<AttentionItem[]>;
  myWork: GlobalSection<MyWorkView>;
  /**
   * Which workspace answered for each ticket merged above, by ticket id. The ticket sheet
   * needs a workspace, and a merged `ContestedClaim` carries none of its own — only the
   * read it came back from knows. Every row of both sections is in it.
   */
  workspaceOf: Record<string, string>;
  /** Asks every workspace again, as a stream frame on each would. */
  reload: () => void;
};

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** What one workspace is asked: its `show` for attention, or `null` when it may be asked none. */
type WorkspacePlan = { workspaceId: string; show: AttentionShow[] | null };

type Answers = {
  key: string;
  attention: Record<string, Outcome<AttentionItem[]>>;
  myWork: Record<string, Outcome<MyWorkView>>;
};

const EMPTY_MY_WORK: MyWorkView = { assigned: [], inTransit: [], contested: [], shared: [] };

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

function planFor(workspaces: readonly WorkspaceRef[], show: readonly AttentionShow[]): WorkspacePlan[] {
  return workspaces
    .filter((workspace) => !workspace.archived)
    .map((workspace) => {
      const allowed = showForWorkspace(workspace, show);
      return { workspaceId: workspace.id, show: allowed.length === 0 ? null : allowed };
    });
}

function section<T>(
  workspaceIds: readonly string[],
  outcomes: Record<string, Outcome<T>> | null,
  merge: (values: T[]) => T,
): GlobalSection<T> {
  const pending: GlobalSection<T> = { data: null, error: null, byWorkspace: {}, settled: false };
  if (outcomes === null) return pending;
  const answered = workspaceIds.map((id) => outcomes[id]);
  if (answered.some((outcome) => outcome === undefined)) return pending;
  const values: T[] = [];
  const byWorkspace: Record<string, string> = {};
  for (const [index, outcome] of answered.entries()) {
    if (outcome === undefined) continue;
    if (outcome.ok) values.push(outcome.value);
    else byWorkspace[workspaceIds[index] ?? ''] = outcome.error;
  }
  if (workspaceIds.length > 0 && values.length === 0) {
    const first = answered.find((outcome): outcome is { ok: false; error: string } => outcome?.ok === false);
    return { data: null, error: first?.error ?? null, byWorkspace: {}, settled: true };
  }
  return { data: merge(values), error: null, byWorkspace, settled: true };
}

const mergeAttention = (values: AttentionItem[][]): AttentionItem[] => values.flat();

const mergeMyWork = (values: MyWorkView[]): MyWorkView =>
  values.reduce<MyWorkView>(
    (merged, view) => ({
      assigned: [...merged.assigned, ...view.assigned],
      inTransit: [...merged.inTransit, ...view.inTransit],
      contested: [...merged.contested, ...view.contested],
      shared: [...merged.shared, ...view.shared],
    }),
    EMPTY_MY_WORK,
  );

/**
 * The global My work page's reads (my-work-global T3): the attention strip and My work,
 * FANNED OUT over every workspace the viewer belongs to and merged on the client — the
 * planner's deviation 1 from the spec's D3, which reuses the per-workspace routes, mappers
 * and contests rather than adding global ones.
 *
 * - **Archived workspaces are not asked** (a planner decision: archived means read-only, and
 *   the page is about work in flight). Nor are they subscribed to.
 * - **Each workspace is asked only the part of `show` it allows** (`showForWorkspace`):
 *   `ws-admin` where the viewer owns or runs THAT workspace, `project-admin` where they run a
 *   project in it. The route refuses either elsewhere, so passing the whole selection would
 *   blank a workspace whose created/assigned tickets were asked for. A workspace allowed
 *   nothing is skipped for attention; it is still asked for My work, which `show` does not
 *   filter ("assigned to me" by definition).
 * - **A failing workspace does not blank the others.** Each read settles on its own, and a
 *   failure lands in `byWorkspace` while the rest merge. Only when EVERY asked workspace
 *   fails is it an `error` with `data: null` — an empty strip reads as an all-clear, and a
 *   session that ended must reach the page as a failure it can act on, not as nothing.
 * - **Live, per workspace.** Each workspace's stream frames (and `scheduleReload` from a
 *   write elsewhere on the page) re-ask THAT workspace only, keeping the others' answers.
 * - **No stale flash.** The answers are stored with the question they answer; a render
 *   whose question (the workspaces, or `show`) has changed returns `null` until the new one
 *   answers — including the very first render after the change, which `useLiveQuery`'s
 *   effect-driven clear would still paint with the old data (case 30.033).
 *
 * The question is keyed by CONTENT, so a parent handing a fresh but equal array each render
 * asks nothing again.
 */
export function useGlobalMyWork(
  source: DataSource,
  workspaces: readonly WorkspaceRef[],
  show: readonly AttentionShow[],
): GlobalMyWork {
  const plans = planFor(workspaces, show);
  const key = JSON.stringify(plans.map((plan) => [plan.workspaceId, plan.show]));
  const streamKey = JSON.stringify(plans.map((plan) => plan.workspaceId));
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [answers, setAnswers] = useState<Answers>({ key: '', attention: {}, myWork: {} });
  // Per workspace, the most recently ISSUED ask. An answer applies only if it is still the
  // latest for its workspace AND the question has not moved — the issue-order rule
  // `useLiveQuery` keeps, so a slow older read never overwrites a newer one.
  const issuedRef = useRef(new Map<string, number>());

  const ask = useCallback(
    (plan: WorkspacePlan) => {
      const askedKey = keyRef.current;
      const issued = (issuedRef.current.get(plan.workspaceId) ?? 0) + 1;
      issuedRef.current.set(plan.workspaceId, issued);
      const isCurrent = (): boolean =>
        keyRef.current === askedKey && issuedRef.current.get(plan.workspaceId) === issued;
      const settle = <T>(read: Promise<T>, store: (answers: Answers, outcome: Outcome<T>) => Answers): void => {
        void read
          .then(
            (value): Outcome<T> => ({ ok: true, value }),
            (cause: unknown): Outcome<T> => ({ ok: false, error: messageOf(cause) }),
          )
          .then((outcome) => {
            if (!isCurrent()) return;
            setAnswers((held) => (held.key === askedKey ? store(held, outcome) : held));
          });
      };
      if (plan.show !== null) {
        settle(source.query.getAttention(plan.workspaceId, plan.show), (held, outcome) => ({
          ...held,
          attention: { ...held.attention, [plan.workspaceId]: outcome },
        }));
      }
      settle(source.query.getMyWork(plan.workspaceId), (held, outcome) => ({
        ...held,
        myWork: { ...held.myWork, [plan.workspaceId]: outcome },
      }));
    },
    [source],
  );

  const reload = useCallback(() => {
    for (const plan of plansRef.current) ask(plan);
  }, [ask]);

  useEffect(() => {
    // A new question clears the old answers before it asks (the render already hides them).
    setAnswers({ key, attention: {}, myWork: {} });
    reload();
  }, [key, reload]);

  useEffect(() => {
    // Keyed on the workspace ids alone, so a `show` change re-asks without re-subscribing.
    // The reload reads the CURRENT plan when it fires, never the one captured here.
    const workspaceIds = JSON.parse(streamKey) as string[];
    const stops = workspaceIds.map((workspaceId) => {
      const reloadOne = (): void => {
        const plan = plansRef.current.find((candidate) => candidate.workspaceId === workspaceId);
        if (plan !== undefined) ask(plan);
      };
      const unregister = subscribeReloads(workspaceId, reloadOne);
      const unsubscribe = source.subscribe(workspaceId, 0, (item) => {
        // The frames `useLiveQuery` refetches on, for the reasons it gives.
        if (item.type !== 'event' && item.type !== 'purge' && item.type !== 'refresh') return;
        scheduleReload(workspaceId, 200);
      });
      return () => {
        unsubscribe();
        unregister();
      };
    });
    return () => {
      for (const stop of stops) stop();
    };
  }, [source, streamKey, ask]);

  const current = answers.key === key ? answers : null;
  const workspaceOf: Record<string, string> = {};
  if (current !== null) {
    for (const [workspaceId, outcome] of Object.entries(current.attention)) {
      if (outcome.ok) for (const item of outcome.value) workspaceOf[item.ticketId] = workspaceId;
    }
    for (const [workspaceId, outcome] of Object.entries(current.myWork)) {
      if (!outcome.ok) continue;
      const { assigned, inTransit, contested, shared } = outcome.value;
      for (const row of [...assigned, ...inTransit, ...contested, ...shared]) workspaceOf[row.ticketId] = workspaceId;
    }
  }
  return {
    attention: section(
      plans.filter((plan) => plan.show !== null).map((plan) => plan.workspaceId),
      current === null ? null : current.attention,
      mergeAttention,
    ),
    myWork: section(
      plans.map((plan) => plan.workspaceId),
      current === null ? null : current.myWork,
      mergeMyWork,
    ),
    workspaceOf,
    reload,
  };
}
