import type { Page } from '@playwright/test';

/**
 * Does the box the viewer is looking at actually have a size, and is anything
 * drawn inside it?
 *
 * ## Why it takes a root element rather than a page
 *
 * Because the caller needs to run it TWICE: once over the product's canvas, and
 * once over a planted element that reproduces the collapsed cascade. **A control
 * that re-implements the measurement is not a control** — it traverses a
 * different path and can disagree with the thing it is supposed to prove. The
 * root is a parameter so both callers run the same code.
 *
 * ## Why the obvious assertions are the wrong ones
 *
 * Measured on the running app, broken tree (before `display: grid` on
 * `.gn-workflow-canvas`) versus fixed, same page, same session:
 *
 * | property | broken | fixed |
 * |---|---|---|
 * | `.react-flow` rect height | **0** | **480** |
 * | `.gn-workflow-canvas` rect height | 480 | 480 |
 * | node height / width / count | 75.27 / 91.98 / 4 | 75.27 / 91.98 / 4 |
 * | first node ∩ `.react-flow` box (area) | **0** | **6922.8** |
 *
 * The container's own height, the node's height, and the node COUNT are all
 * already satisfied on the broken tree: React Flow lays each node out at its
 * intrinsic size inside a container that draws none of it, so the DOM looks
 * perfect and the canvas is empty. Asserting on any of them is a check that
 * cannot fail. `flowHeight` and `nodeAreaInsideFlow` are the two readings that
 * separate the states, and the second is the property the person needs.
 */
export type CanvasReading = {
  /** `getBoundingClientRect().height` of `.react-flow`; 0 when the canvas collapsed. */
  flowHeight: number;
  /** The container's own box — 480 in BOTH states, kept so the log cannot mislead. */
  containerHeight: number;
  nodeCount: number;
  /** Area of the first node's box lying INSIDE the React Flow box; 0 when collapsed. */
  nodeAreaInsideFlow: number;
};

export async function measureCanvas(page: Page, rootSelector: string): Promise<CanvasReading | null> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (root === null) return null;
    const flow = root.querySelector('.react-flow');
    const container = root.querySelector('.gn-workflow-canvas');
    const node = root.querySelector('.react-flow__node');
    const flowRect = flow === null ? null : flow.getBoundingClientRect();
    const nodeRect = node === null ? null : node.getBoundingClientRect();
    let inside = 0;
    if (flowRect !== null && nodeRect !== null) {
      const width = Math.min(flowRect.right, nodeRect.right) - Math.max(flowRect.left, nodeRect.left);
      const height = Math.min(flowRect.bottom, nodeRect.bottom) - Math.max(flowRect.top, nodeRect.top);
      inside = width > 0 && height > 0 ? Math.round(width * height) : 0;
    }
    return {
      flowHeight: flowRect === null ? -1 : Math.round(flowRect.height),
      containerHeight:
        container === null ? -1 : Math.round(container.getBoundingClientRect().height),
      nodeCount: root.querySelectorAll('.react-flow__node').length,
      nodeAreaInsideFlow: inside,
    };
  }, rootSelector);
}
