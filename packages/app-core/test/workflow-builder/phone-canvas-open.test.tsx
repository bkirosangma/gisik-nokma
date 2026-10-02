import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import * as xyflow from '@xyflow/react';
import { createDraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider } from '../../src/workflow-builder/ui/builder-context.js';
import { COLUMN_WIDTH } from '../../src/workflow-builder/layout.js';
import { PHONE_OPEN_ZOOM, phoneOpeningView } from '../../src/workflow-builder/ui/flow-graph.js';
import { WorkflowCanvas } from '../../src/workflow-builder/ui/workflow-canvas.js';
import { ruleExactly, valueOf, readUiCss } from '../../../ui/test/helpers/css-rules.js';

// What <ReactFlow> was last given: jsdom has no layout, so a real viewport never settles. The props ARE the contract.
const seen: { props: Record<string, unknown> | null } = { props: null };
vi.mock('@xyflow/react', async (importOriginal) => {
  const real = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...real,
    ReactFlow: (props: Record<string, unknown>) => {
      seen.props = props;
      return <real.ReactFlow {...(props as unknown as xyflow.ReactFlowProps)} />;
    },
  };
});

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;
const HERE = dirname(fileURLToPath(import.meta.url));

/** Read through a call so TypeScript does not keep the narrowing of the `null` just assigned. */
const current = () => seen.props;

function stubViewport(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query === '(max-width: 40rem)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function mount(store = createDraftStore(draftFromTemplate(errand))) {
  render(
    <BuilderProvider
      store={store}
      env={{ workspaceId: newUlid(), session: { userId: newUlid(), role: 'admin' }, gateway: createFakeGateway(), members: [], ticketTypes: [], canAuthor: true }}
    >
      <WorkflowCanvas />
    </BuilderProvider>,
  );
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  seen.props = null;
});

describe('F-5 the workflow canvas on a phone opens readable, not fitted', () => {
  it('23.275 at ≤40rem the canvas opens at zoom 0.8 centred on the start state, and does not fitView; desktop still fits', async () => {
    stubViewport(true);
    const store = mount();
    const draft = store.getState();
    const start = draft.positions[draft.def.initialStateId]!;
    expect(PHONE_OPEN_ZOOM).toBe(0.8);
    expect(seen.props?.fitView).toBe(false);
    const setCenter = vi.fn();
    (seen.props?.onInit as (instance: unknown) => void)({ setCenter, getNode: () => undefined });
    expect(setCenter).toHaveBeenCalledTimes(1);
    const [cx, cy, options] = setCenter.mock.calls[0] as [number, number, { zoom: number }];
    // The WIRING of the measured size: React Flow's own measurement of the start node (`s:<id>`) reaches the centre,
    // and any other node's measurement is ignored. (Passing `undefined` instead of the measurement leaves the 208×120 centre.)
    const measuredCenter = vi.fn();
    const startNodeId = `s:${draft.def.initialStateId}`;
    (seen.props?.onInit as (instance: unknown) => void)({
      setCenter: measuredCenter,
      getNode: (id: string) => (id === startNodeId ? { measured: { width: 200, height: 100 } } : undefined),
    });
    expect(measuredCenter).toHaveBeenCalledTimes(1);
    expect(measuredCenter.mock.calls[0]!.slice(0, 2)).toEqual([start.x + 100, start.y + 50]);
    expect(options.zoom).toBe(0.8);
    // The centre is the START node's, not the first node's or the graph's: it sits to the right of its top-left corner.
    const view = phoneOpeningView(draft);
    expect(cx).toBe(view.center.x);
    expect(cy).toBe(view.center.y);
    expect(cx).toBeGreaterThan(start.x);
    expect(cy).toBeGreaterThan(start.y);
    // A measured node is centred by its own size.
    expect(phoneOpeningView(draft, { width: 200, height: 100 }).center).toEqual({ x: start.x + 100, y: start.y + 50 });
    // …and moving the start marker moves the centre (a constant would pass the lines above).
    const moved = createDraftStore(draftFromTemplate(errand));
    moved.actions.moveState(draft.def.initialStateId, { x: start.x + 777, y: start.y + 333 });
    expect(phoneOpeningView(moved.getState()).center.x).toBe(view.center.x + 777);
    // CONTROL — on a desktop width the canvas still opens fitted and sets no centre.
    vi.unstubAllGlobals();
    seen.props = null;
    stubViewport(false);
    mount();
    expect(current()?.fitView).toBe(true);
    const desktopInit = current()?.onInit as ((instance: unknown) => void) | undefined;
    const untouched = vi.fn();
    desktopInit?.({ setCenter: untouched, getNode: () => undefined });
    expect(untouched).not.toHaveBeenCalled();
  });

  it('23.275 the phone opening centres on the INITIAL state, not the first position, when the author made another state the start', () => {
    stubViewport(true);
    const store = createDraftStore(draftFromTemplate(errand));
    const states = store.getState().def.states;
    const later = states[states.length - 1]!.id;
    store.actions.setInitialState(later);
    mount(store);
    const draft = store.getState();
    const start = draft.positions[draft.def.initialStateId]!;
    // CONTROL — the initial state's position is NOT the first entry's, so "first position" and "start" cannot be confused.
    expect(draft.def.initialStateId).toBe(later);
    expect(start).not.toEqual(Object.values(draft.positions)[0]);
    const setCenter = vi.fn();
    (seen.props?.onInit as (instance: unknown) => void)({ setCenter, getNode: () => undefined });
    const view = phoneOpeningView(draft);
    expect(setCenter.mock.calls[0]!.slice(0, 2)).toEqual([view.center.x, view.center.y]);
    expect(view.center.x).toBeGreaterThan(start.x);
    expect(view.center.y).toBeGreaterThan(start.y);
  });

  it('23.278 "Fit to screen" still fits the WHOLE graph on a phone: the same floored options as desktop, a 44px target', () => {
    stubViewport(true);
    mount();
    const src = readFileSync(join(HERE, '../../src/workflow-builder/ui/workflow-canvas.tsx'), 'utf8');
    expect(screen.getByRole('button', { name: 'Fit to screen' })).toHaveClass('gn-workflow-canvas__fit');
    expect(src).toMatch(/onClick=\{\(\) => void fitView\(\{ \.\.\.FIT_OPTIONS/);
    expect(seen.props?.minZoom).toBe(0.25);
    // CONTROL — the open zoom is above the fit floor, so Fit to screen can still go further out than the opening.
    expect(PHONE_OPEN_ZOOM).toBeGreaterThan(Number(seen.props?.minZoom));
    expect(valueOf(ruleExactly(readUiCss(), '.gn-workflow-canvas__fit'), 'min-height')).toBe('2.75rem');
  });
});

describe('F-5 a state node stays inside its column (N3)', () => {
  it('23.276 .gn-state-node caps its width at 13rem so the reason line wraps; the 170px floor stays', () => {
    const rule = ruleExactly(readUiCss(), '.gn-state-node');
    expect(valueOf(rule, 'max-width')).toBe('13rem');
    // CONTROL — the floor is untouched, and the cap is above it, so no node is squeezed below its content.
    expect(valueOf(rule, 'min-width')).toBe('170px');
    const toPx = (value: string | null | undefined): number => {
      const m = /^([0-9.]+)(rem|px)$/.exec(value ?? '');
      if (m === null) throw new Error(`not a rem/px length: ${String(value)}`);
      return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
    };
    const minPx = toPx(valueOf(rule, 'min-width'));
    const maxPx = toPx(valueOf(rule, 'max-width'));
    expect(minPx).toBeLessThan(maxPx);
    // The cap is below COLUMN_WIDTH minus the 40px gap an edge needs (arrow head and a readable run), so a node can
    // no longer reach the next column. Both values are read from the rule.
    expect(maxPx).toBeLessThan(COLUMN_WIDTH - 40);
  });
});

describe('F-5 a node checkbox is drawn at a usable size at the phone opening zoom', () => {
  it('23.277 the node checkboxes are 17px, so at zoom 0.8 they are ≥13px on screen (the browser default 13px drew 10px)', () => {
    const rule = ruleExactly(readUiCss(), ".gn-state-node input[type='checkbox']");
    const px = Number(/^([0-9.]+)rem$/.exec(valueOf(rule, 'width') ?? '')?.[1]) * 16;
    expect(valueOf(rule, 'height')).toBe(valueOf(rule, 'width'));
    expect(px * PHONE_OPEN_ZOOM).toBeGreaterThanOrEqual(13);
    // CONTROL — the browser's own 13px box would NOT clear 13px on screen at 0.8, so the rule is what does the work;
    // and 17px is still inside the 44px row (23.176), which it must not grow.
    expect(13 * PHONE_OPEN_ZOOM).toBeLessThan(13);
    expect(px).toBeLessThan(44);
  });
});
