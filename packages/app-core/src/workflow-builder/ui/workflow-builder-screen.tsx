import { useEffect, useRef, useState, type RefObject } from 'react';
import { PHONE_BOARD_QUERY } from '../../views/use-phone-board.js';
import { Button, Skeleton, SkeletonRegion, useScrollEdges } from '@gisik-nokma/ui';
import type { PublishedWorkflowDef, TicketTypeDef } from '@gisik-nokma/domain';
import { createDraftStore, type WorkflowDraft } from '../draft-store.js';
import { AuthoringReadRefused, type WorkflowAuthoringGateway, type WorkspaceMember } from '../gateway.js';
import {
  BuilderProvider,
  canAuthorRole,
  useBuilderEnv,
  useBuilderStore,
  useDraft,
  type BuilderEnvironment,
  type BuilderSession,
} from './builder-context.js';
import { BuilderPanels } from './builder-panels.js';
import { IssuesPanel } from './issues-panel.js';
import { PublishControls } from './publish-controls.js';
import { ReadOnlyBanner } from './read-only-banner.js';
import { SystemRulesPanel } from './system-rules-panel.js';
import type { CanvasApi } from './use-canvas-api.js';
import { WorkflowCanvas } from './workflow-canvas.js';

/**
 * RULING E5-41 (CRITICAL). Keyed on the WORKSPACE and the draft's own def id
 * (stable across a re-mount of the edit route, `[workflowId]/page.tsx`,
 * which re-fetches the same published id every time) rather than on nothing
 * — two workflows in the same workspace, or the same workflow across two
 * workspaces (a session token this product does not have), must not share a
 * slot.
 */
export function draftStorageKey(workspaceId: string, workflowId: string): string {
  return `gn-workflow-draft:${workspaceId}:${workflowId}`;
}

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

function AddStateButton(props: { canvas: RefObject<CanvasApi | null> }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  if (!canAuthor) return null;
  // The shared `Button`, not a bare `<button>`: the prototype's "Add state" is
  // `ctlBg` + accent + weight 600 with no border (`:1016`), which is exactly the
  // idiom `.gn-button` already carries (fill-tertiary + text-accent + 600, no
  // border), and `.ticket-type-list__new` is the sibling precedent for a
  // builder action reaching for the component rather than a bespoke rule.
  return (
    <Button
      className="workflow-builder-screen__add-state"
      // G-9 T3: the new state lands on the free grid point nearest the middle of what the author is looking at.
      onClick={() => store.actions.addState({ near: props.canvas.current?.centre(), sizes: props.canvas.current?.sizes() })}
    >
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
  const storageKey = draftStorageKey(props.workspaceId, props.initialDraft.def.id);
  const [store] = useState(() => {
    // RULING E5-41 (CRITICAL): recover an in-progress draft this SAME tab
    // left in `sessionStorage` rather than always starting from the
    // server's last-published version — the manual already promises "for
    // this session only" persistence for box positions, so this is the
    // same promise kept for the rest of the draft too. Every unsaved
    // state/arrow/rule used to die on any navigation (the nav bar, the
    // breadcrumb, the browser's back button) with no marker and no
    // recovery; this closes that for every case that keeps the TAB alive,
    // which is everything the finding measured. A corrupt or inaccessible
    // entry (private browsing, quota, a shape from an older build) falls
    // back to the server's draft rather than crashing the screen.
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved !== null) return createDraftStore(JSON.parse(saved) as WorkflowDraft);
    } catch {
      // fall through to the server's draft
    }
    return createDraftStore(props.initialDraft);
  });
  const [data, setData] = useState<{ members: WorkspaceMember[]; ticketTypes: TicketTypeDef[] } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Phone only (Plan Task 11, 21.170): the States / Transitions / System rules / Issues column is a bottom sheet
  // opened from the "Panels" button. Above 40rem the button, the scrim and the Done button are `display: none` and
  // this state paints nothing, so the side-by-side layout is untouched.
  const [panelsOpen, setPanelsOpen] = useState(false);
  // The left panel scrolls down on the desktop split: `.gn-scroll-fade--y` shows a state list that runs past the fold.
  const leftEdgesRef = useScrollEdges<HTMLElement>('y');
  const canvasApi = useRef<CanvasApi | null>(null);
  const [onCanvasReady] = useState(() => (api: CanvasApi | null) => {
    canvasApi.current = api;
  });
  const panelsButtonRef = useRef<HTMLButtonElement>(null);
  const panelsDoneRef = useRef<HTMLButtonElement>(null);
  const closePanels = () => {
    setPanelsOpen(false);
    panelsButtonRef.current?.focus();
  };

  useEffect(() => {
    // A tap on a canvas node or arrow writes the draft's one `selection`, and the row it opens lives in the panels
    // column — on a phone that column is hidden until asked for, so a NEW selection opens the sheet (once per change,
    // never for the draft's own starting selection). Phone only (T13, 21.176): above 40rem the column is always
    // on screen, and flipping `panelsOpen` there would leave a stale open sheet for the next resize to the phone.
    let last = store.getState().selection;
    return store.subscribe(() => {
      const next = store.getState().selection;
      if (next !== last && next.kind !== 'none' && window.matchMedia?.(PHONE_BOARD_QUERY).matches) setPanelsOpen(true);
      last = next;
    });
  }, [store]);

  useEffect(() => {
    if (panelsOpen) panelsDoneRef.current?.focus();
  }, [panelsOpen]);

  useEffect(() => {
    // Written on every change, not only on unmount — a tab CLOSE fires no
    // React cleanup at all, so an unmount-only write would still lose the
    // draft to the one case the manual does not promise to survive anyway,
    // while ALSO losing it to a crash or a forced reload, which it does.
    return store.subscribe(() => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(store.getState()));
      } catch {
        // sessionStorage unavailable (private mode, quota) — the draft
        // still lives in `store`; only the recovery-on-remount promise
        // above is what silently goes back to being unmet.
      }
    });
  }, [store, storageKey]);

  useEffect(() => {
    let cancelled = false;
    // A guest may not call GET /v1/workspaces/:id/members (executor ruling
    // 2026-09-02, coordination doc ~5442-5465; see gateway.ts's listMembers
    // docstring) — that refusal is not a load failure, it is an empty roster.
    //
    // **Narrowed to the refusal (E2-39, 2026-09-21).** The catch used to be
    // blanket — `catch(() => [])` — so a 500, a dropped connection or an
    // unparseable roster body became the same empty array a refusal produces,
    // and flowed into `BuilderEnvironment.members`, which the rule editors and
    // rule summaries read. An admin then authored rules against a workspace that
    // appeared to hold nobody, with nothing on screen saying the read had failed.
    // The refusal class is declared in `gateway.ts` now, so the narrowing is
    // possible here at all — the adapter's docblocks record that it previously
    // was not, `app-core` depending on nothing under `apps/`.
    Promise.all([
      props.gateway.listMembers(props.workspaceId).catch((cause: unknown) => {
        if (cause instanceof AuthoringReadRefused) return [] as WorkspaceMember[];
        throw cause;
      }),
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
        Could not load workspace people and types. Reload to try again.
      </p>
    );
  }
  if (data === null) {
    return (
      <SkeletonRegion label="Loading workspace people and types" className="workflow-builder-screen">
        <Skeleton shape="block" height="3rem" rows={4} />
      </SkeletonRegion>
    );
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
              <AddStateButton canvas={canvasApi} />
              <Button
                ref={panelsButtonRef}
                className="workflow-builder-screen__panels"
                aria-expanded={panelsOpen}
                aria-controls="workflow-builder-panels"
                onClick={() => setPanelsOpen(true)}
              >
                Panels
              </Button>
              <PublishControls
                onPublished={(payload) => {
                  // The recovered draft is now the server's own truth — clearing
                  // it here (rather than leaving it to expire on its own) is what
                  // stops a stale pre-publish version from resurfacing if this
                  // same id is ever opened again in this tab.
                  try {
                    window.sessionStorage.removeItem(storageKey);
                  } catch {
                    // already inaccessible; nothing more to clear
                  }
                  props.onPublished?.(payload);
                }}
              />
            </div>
          </div>
        </header>
        <div className="workflow-builder-screen__layout">
          {panelsOpen ? <div className="workflow-builder-screen__scrim" aria-hidden="true" onClick={closePanels} /> : null}
          <aside
            id="workflow-builder-panels"
            className="workflow-builder-screen__left gn-scroll-fade gn-scroll-fade--y"
            ref={leftEdgesRef}
            data-open={panelsOpen ? 'true' : 'false'}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Escape' && panelsOpen) closePanels();
            }}
          >
            <Button ref={panelsDoneRef} className="workflow-builder-screen__panels-done" onClick={closePanels}>
              Done
            </Button>
            <BuilderPanels />
            <SystemRulesPanel />
            <IssuesPanel />
          </aside>
          {/* E4-9 — a `<section>`, NOT a `<main>`. The route page already
              renders `<main className="gn-shell">`
              (`settings/workflows/[workflowId]/page.tsx:57`), so this was the
              product's only page with TWO nested `<main>` landmarks — measured
              `document.querySelectorAll('main')` → 2, the inner one's parent
              being `div.workflow-builder-screen__layout`. A page has one main;
              the canvas is a named region inside it, and `aria-label` is what
              keeps it addressable now that it is not a landmark of its own. */}
          <section className="workflow-builder-screen__canvas" aria-label="Canvas">
            <WorkflowCanvas onReady={onCanvasReady} />
          </section>
        </div>
      </div>
    </BuilderProvider>
  );
}
