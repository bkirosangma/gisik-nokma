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
    // CONTROL — the floor is untouched, and 13rem (208px) is wider than it, so no node is squeezed below its content.
    expect(valueOf(rule, 'min-width')).toBe('170px');
    expect(13 * 16).toBeGreaterThan(170);
    // The cap is below COLUMN_WIDTH (260) minus the gap an edge needs, so a node can no longer reach the next column.
    expect(13 * 16).toBeLessThan(260 - 40);
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
