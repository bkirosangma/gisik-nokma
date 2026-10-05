import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from 'react';
import { PHONE_BOARD_QUERY } from '../../views/use-phone-board.js';
import { Button, Popover, Skeleton, SkeletonRegion, useScrollEdges } from '@gisik-nokma/ui';
import { validateWorkflowDef, type PublishedWorkflowDef, type TicketTypeDef } from '@gisik-nokma/domain';
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
import { AddTransitionForm } from './add-transition-form.js';
import { BuilderPanels, STACKED_QUERY } from './builder-panels.js';
import { FloatingPanel, type PanelTab } from './floating-panel.js';
import { IssuesPanel } from './issues-panel.js';
import { PublishControls, usePublishFlow, type PublishFlow } from './publish-controls.js';
import { ReadOnlyBanner } from './read-only-banner.js';
import { SystemRulesPanel } from './system-rules-panel.js';
import type { CanvasApi } from './use-canvas-api.js';
import { TidyControl } from './tidy-control.js';
import { useEscapeLadder } from './use-escape-ladder.js';
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

/** Does `query` match the window now? `false` where `matchMedia` is missing (the server, jsdom unstubbed), like `usePhoneBoard`. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** The gap between the floating toolbar's bottom and the floating panel's top, in px (the toolbar's own 0.75rem inset). */
const PANEL_CLEARANCE = 12;

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // storage unavailable: the choice still holds until the screen unmounts
  }
}

/** The error count `validateWorkflowDef` gives (what blocks Publish), never the advisories. */
function useIssueCount(): number {
  return validateWorkflowDef(useDraft().def).length;
}

function IssuesBadge(props: { onOpen: () => void }) {
  const count = useIssueCount();
  return (
    <Button className="gn-wf-toolbar__issues" data-count={count > 0 ? 'some' : 'none'} onClick={props.onOpen}>
      Issues <span className="gn-wf-toolbar__count">{count}</span>
    </Button>
  );
}

/**
 * The toolbar's overflow at narrow widths (spec §4.2, planner ruling 2026-10-04 Q6): there is no shared `Menu`, so this is the shared
 * `Popover` holding a `role="menu"` of `role="menuitem"` buttons, keyed like `AddRuleMenu` (ArrowDown / ArrowUp wrap, Home / End). The
 * Popover consumes its own Escape, so the ladder never closes a layer under it. Zoom and Tidy leave it open (zoom is pressed again,
 * and "Undo tidy" appears beside Tidy, inside the menu: closing it would take the offer with it); Issues closes it, opening the panel.
 */
function MoreMenu(props: { canvas: RefObject<CanvasApi | null>; withIssues: boolean; onIssues: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const issues = useIssueCount();
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      event.key === 'ArrowDown' ? items[(at + 1) % items.length]
      : event.key === 'ArrowUp' ? items[(at - 1 + items.length) % items.length]
      : event.key === 'Home' ? items[0]
      : event.key === 'End' ? items[items.length - 1]
      : undefined;
    if (target === undefined) return;
    event.preventDefault();
    target.focus();
  };
  return (
    <>
      <Button
        ref={triggerRef}
        className="gn-wf-toolbar__more"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        More
      </Button>
      <Popover triggerRef={triggerRef} open={open} onClose={() => setOpen(false)} aria-label="More">
        <ul ref={listRef} className="gn-wf-more" role="menu" aria-label="More" onKeyDown={onKeyDown}>
          <li role="none">
            <button type="button" role="menuitem" className="gn-wf-more__item" onClick={() => props.canvas.current?.zoomOut()}>
              Zoom out
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="gn-wf-more__item" onClick={() => props.canvas.current?.zoomIn()}>
              Zoom in
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="gn-wf-more__item" onClick={() => props.canvas.current?.fit()}>
              Fit to screen
            </button>
          </li>
          <li role="none">
            <TidyControl role="menuitem" sizes={() => props.canvas.current?.sizes() ?? {}} />
          </li>
          {props.withIssues ? (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="gn-wf-more__item"
                onClick={() => {
                  setOpen(false);
                  props.onIssues();
                }}
              >
                Issues <span className="gn-wf-toolbar__count">{issues}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </Popover>
    </>
  );
}

/**
 * Full screen's one row of controls (spec §4.2), top centre over the canvas, in place of the header's title row. The existing controls,
 * each with its own `canAuthor` guard, so a viewer gets the name (read-only), zoom, Issues and Exit. Narrower than `STACKED_QUERY` the
 * zoom group and Tidy fold into More; the Issues badge folds too only on a phone (spec §4.5, planner ruling 2026-10-04 Q2).
 */
function FullScreenToolbar(props: {
  toolbarRef: RefObject<HTMLDivElement | null>;
  canvas: RefObject<CanvasApi | null>;
  narrow: boolean;
  phone: boolean;
  onIssues: () => void;
  onExit: () => void;
  onPublished: (payload: PublishedWorkflowDef) => void;
  publishFlow: PublishFlow;
}) {
  const sizes = () => props.canvas.current?.sizes() ?? {};
  return (
    <div className="gn-wf-toolbar" ref={props.toolbarRef}>
      <WorkflowNameField />
      <AddStateButton canvas={props.canvas} />
      <AddTransitionForm />
      {props.narrow ? null : (
        <>
          <div role="group" aria-label="Zoom" className="gn-wf-toolbar__zoom">
            <Button className="gn-wf-toolbar__zoom-step" aria-label="Zoom out" onClick={() => props.canvas.current?.zoomOut()}>
              −
            </Button>
            <Button className="gn-wf-toolbar__zoom-step" aria-label="Zoom in" onClick={() => props.canvas.current?.zoomIn()}>
              +
            </Button>
            <Button className="gn-wf-toolbar__zoom-step" aria-label="Fit to screen" onClick={() => props.canvas.current?.fit()}>
              Fit
            </Button>
          </div>
          <TidyControl sizes={sizes} />
        </>
      )}
      {props.phone ? null : <IssuesBadge onOpen={props.onIssues} />}
      <PublishControls onPublished={props.onPublished} flow={props.publishFlow} />
      {props.narrow ? <MoreMenu canvas={props.canvas} withIssues={props.phone} onIssues={props.onIssues} /> : null}
      <Button className="gn-wf-toolbar__exit" onClick={props.onExit}>
        Exit full screen
      </Button>
    </div>
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
  // this state paints nothing, so the side-by-side layout is untouched. In full screen (G-9 T5) the column is not
  // shown at any width: the floating panel below replaces it, and this state stays false.
  const [panelsOpen, setPanelsOpen] = useState(false);
  // G-9 T5 (spec §4.1): full screen is this same screen, fixed over the window, remembered for the session per draft.
  const fullScreenKey = `${storageKey}:fullscreen`;
  const [fullscreen, setFullscreen] = useState(() => readSession(fullScreenKey) === 'true');
  const fullscreenNow = useRef(fullscreen);
  fullscreenNow.current = fullscreen;
  const [panel, setPanel] = useState<{ open: boolean; tab: PanelTab }>({ open: false, tab: 'selection' });
  // G-9 T5 FIX 1 (planner ruling 2026-10-05 09:42): the toggle remounts PublishControls (toolbar or title row), so the publish
  // attempt (its phase, the mapping's picks, the refusal or outcome on it) is held here, above the toggle, and handed to both.
  const publishFlow = usePublishFlow();
  const narrow = useMediaQuery(STACKED_QUERY);
  const phone = useMediaQuery(PHONE_BOARD_QUERY);
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const headerFullScreenRef = useRef<HTMLButtonElement>(null);
  const cornerFullScreenRef = useRef<HTMLButtonElement>(null);
  // Which button entered (focus goes back to it on exit), and where focus goes after the next full-screen change: only a
  // press moves focus, so a mount that restores full screen from the session leaves it where it is.
  const enteredFrom = useRef<'header' | 'corner'>('header');
  const focusAfterToggle = useRef<'toolbar' | 'header' | 'corner' | null>(null);
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

  const enterFullScreen = (from: 'header' | 'corner') => {
    enteredFrom.current = from;
    focusAfterToggle.current = 'toolbar';
    setFullscreen(true);
    writeSession(fullScreenKey, 'true');
  };
  const exitFullScreen = () => {
    focusAfterToggle.current = enteredFrom.current;
    setPanel((was) => ({ ...was, open: false }));
    setFullscreen(false);
    writeSession(fullScreenKey, 'false');
  };
  const openPanel = (tab: PanelTab) => setPanel({ open: true, tab });
  const closePanel = () => {
    // Focus inside the panel would fall to the body with it: keep it in the full-screen region instead.
    if (rootRef.current?.querySelector('.gn-wf-panel')?.contains(document.activeElement)) rootRef.current.focus();
    setPanel((was) => ({ ...was, open: false }));
  };
  // One Escape owner for full screen, innermost first (planner ruling 2026-10-04 Q1).
  useEscapeLadder([
    { open: fullscreen && panel.open, close: closePanel },
    { open: fullscreen, close: exitFullScreen },
  ]);

  // The floating panel starts below the floating toolbar, which wraps at narrower widths: its bottom, measured, is the panel's top.
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    const layout = layoutRef.current;
    if (!fullscreen || toolbar === null || layout === null || typeof ResizeObserver === 'undefined') return;
    const place = () => {
      const below = toolbar.getBoundingClientRect().bottom - layout.getBoundingClientRect().top;
      layout.style.setProperty('--gn-wf-panel-top', `${Math.max(0, Math.round(below)) + PANEL_CLEARANCE}px`);
    };
    const observer = new ResizeObserver(place);
    observer.observe(toolbar);
    observer.observe(layout);
    place();
    return () => {
      observer.disconnect();
      layout.style.removeProperty('--gn-wf-panel-top');
    };
  }, [fullscreen, data]);

  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === 'toolbar') toolbarRef.current?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus();
    else if (target === 'header') headerFullScreenRef.current?.focus();
    else if (target === 'corner') cornerFullScreenRef.current?.focus();
  }, [fullscreen]);

  useEffect(() => {
    // A tap on a canvas node or arrow writes the draft's one `selection`, and what it opens is out of sight until asked
    // for, so a NEW selection opens it (once per change, never for the draft's own starting selection). In full screen
    // (G-9 T5, spec §4.3, planner ruling 2026-10-04 Q5) that is the floating panel, at EVERY width: on the Selection
    // tab, unless the change came from the panel's own lists, which expand the row in place. Outside full screen it is
    // the phone's sheet, and phone only (T13, 21.176): above 40rem the column is always on screen, and flipping
    // `panelsOpen` there would leave a stale open sheet for the next resize to the phone.
    let last = store.getState().selection;
    return store.subscribe(() => {
      const next = store.getState().selection;
      if (next !== last && next.kind !== 'none') {
        if (fullscreenNow.current) setPanel((was) => ({ open: true, tab: was.open && was.tab === 'lists' ? 'lists' : 'selection' }));
        else if (window.matchMedia?.(PHONE_BOARD_QUERY).matches) setPanelsOpen(true);
      }
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

  const onPublished = (payload: PublishedWorkflowDef) => {
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
  };

  return (
    <BuilderProvider store={store} env={env}>
      {/* G-9 T5: one tree in both layouts, so the canvas (and React Flow's zoom and pan) stays mounted across the switch. */}
      <div
        ref={rootRef}
        className="workflow-builder-screen"
        data-fullscreen={fullscreen ? 'true' : 'false'}
        role={fullscreen ? 'region' : undefined}
        aria-label={fullscreen ? 'Workflow editor, full screen' : undefined}
        tabIndex={fullscreen ? -1 : undefined}
      >
        <header className="workflow-builder-screen__header">
          {env.canAuthor ? null : <ReadOnlyBanner />}
          {/* The prototype's header is one row carrying the title on the left
              and the actions on the right (`:1015-1022`); the banner sits above
              it rather than inside it, which is why this is a wrapper and not
              four more children of `__header`. In full screen (G-9 T5) the
              floating toolbar takes the title row's place. The prototype's third piece —
              a `wfStatus` line ("Draft · last saved 11:58") — is NOT here:
              `last saved`/`lastSaved`/`wfStatus` are 0 hits repo-wide, so there
              is no state to render. Named as an absence, not built. */}
          {fullscreen ? (
            <FullScreenToolbar
              toolbarRef={toolbarRef}
              canvas={canvasApi}
              narrow={narrow}
              phone={phone}
              onIssues={() => openPanel('issues')}
              onExit={exitFullScreen}
              onPublished={onPublished}
              publishFlow={publishFlow}
            />
          ) : (
            <div className="workflow-builder-screen__title-row">
              <WorkflowNameField />
              <div className="workflow-builder-screen__actions">
                <AddStateButton canvas={canvasApi} />
                <AddTransitionForm />
                <TidyControl sizes={() => canvasApi.current?.sizes() ?? {}} />
                <Button
                  ref={panelsButtonRef}
                  className="workflow-builder-screen__panels"
                  aria-expanded={panelsOpen}
                  aria-controls="workflow-builder-panels"
                  onClick={() => setPanelsOpen(true)}
                >
                  Panels
                </Button>
                <PublishControls onPublished={onPublished} flow={publishFlow} />
                <Button ref={headerFullScreenRef} className="workflow-builder-screen__fullscreen" onClick={() => enterFullScreen('header')}>
                  Full screen
                </Button>
              </div>
            </div>
          )}
        </header>
        <div className="workflow-builder-screen__layout" ref={layoutRef}>
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
            <WorkflowCanvas
              onReady={onCanvasReady}
              fullScreen={fullscreen ? null : { buttonRef: cornerFullScreenRef, onEnter: () => enterFullScreen('corner') }}
            />
          </section>
          {/* Opened only in full screen (the subscription's full-screen arm, the toolbar's badge), and closed by Exit. */}
          <FloatingPanel
            open={panel.open}
            tab={panel.tab}
            onTab={(tab) => setPanel({ open: true, tab })}
            onClose={closePanel}
            phone={phone}
            widthKey={`${storageKey}:panelWidth`}
          />
        </div>
      </div>
    </BuilderProvider>
  );
}
