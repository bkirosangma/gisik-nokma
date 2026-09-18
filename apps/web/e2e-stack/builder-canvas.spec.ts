import { expect, test } from '@playwright/test';
import { measureCanvas } from './helpers/canvas-box.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * 13.911 — THE BUILDER'S CANVAS IS A BOX THE PERSON CAN SEE, measured.
 *
 * ## Why this is not a unit test
 *
 * The defect it witnesses was a **computed** height of `0px` on `.react-flow`
 * while four `.react-flow__node` elements sat in the DOM. Every jsdom
 * instrument in this repo is blind to it by construction: jsdom has no layout
 * engine, so `getBoundingClientRect()` returns zeros for everything and an
 * assertion on the computed `display` would have passed on the broken tree.
 * **The only instrument that can fail here is a real layout engine.**
 *
 * ## The trap, because it is general and not a typo
 *
 * `packages/ui/src/ui.css`'s `.gn-workflow-canvas` is `height: 100%` +
 * `min-height: 480px`, and React Flow's own stylesheet gives `.react-flow`
 * `height: 100%`. **A percentage height cannot resolve against a parent whose
 * height comes only from `min-height`** — `min-height` does not make a height
 * definite, so the child's `100%` computes to `auto` → 0. The rule was present,
 * the class was present, and the canvas drew into nothing.
 *
 * ## What DISCRIMINATES, measured on the running app in both states
 *
 * | property | broken | fixed |
 * |---|---|---|
 * | `.react-flow` rect height | **0** | **480** |
 * | `.gn-workflow-canvas` rect height | 480 | 480 |
 * | FIRST node's height / width, and the node count | 75.27 / 91.98 / 4 | 75.27 / 91.98 / 4 |
 * | first node ∩ `.react-flow` box (area) | **0** | **6922.8** |
 *
 * The third row is the **first** node's box, not a property of every node —
 * they are not all the same height — and what it carries is that every one of
 * them is non-zero on the broken tree, which the independent review's probe
 * confirmed node by node.
 *
 * The middle two rows are why this case does not assert on the container's own
 * height, on a node's height, or on the node COUNT. All three are already
 * satisfied on the broken tree — each node is laid out at its intrinsic size
 * inside a container that draws none of it — so an assertion on any of them is
 * a check that cannot fail. The two rows in bold are the ones that separate the
 * states, and the second of them is the property the person actually needs:
 * *a node is drawn inside the canvas the viewer is looking at*.
 *
 * ## The control, and why it is planted rather than referenced
 *
 * A height assertion that can only ever report a positive number is not a
 * measurement. So the same `measureCanvas` runs a second time over an element
 * that reproduces the PRE-FIX cascade in-page — the same two classes, with the
 * grid track overridden back to `block` and no definite height on its wrapper —
 * and **must report 0**. It is planted rather than found because the product no
 * longer contains a broken canvas to point at, and a control that depends on
 * the defect staying present is a control that dies with the fix.
 */
test('the builder canvas is a measured box with a node drawn inside it', async ({ page }) => {
  /* Generous on purpose: this walks four routes through a dev server that
     compiles on first request, and a compile is not a failure. */
  test.setTimeout(240_000);

  await signIn(page, OWNER_EMAIL);

  await page.goto('/workspaces', { waitUntil: 'networkidle' });
  const workspaceHref = await page.locator('a[href^="/w/"]').first().getAttribute('href');
  const workspaceId = /^\/w\/([^/]+)/.exec(workspaceHref ?? '')?.[1];
  expect(workspaceId, `could not read a workspace id out of ${workspaceHref}`).toBeDefined();

  await page.goto(`/w/${workspaceId}/settings/workflows`, { waitUntil: 'networkidle' });
  const open = page.locator('.workflow-list__open').first();
  await open.waitFor({ timeout: 60_000 });
  await open.click();
  await page.waitForURL(/settings\/workflows\/[^/]+$/, { timeout: 90_000 });

  /* ATTACHED, not visible: "present in the DOM and drawn nowhere" is the exact
     state this case exists to catch, so waiting for visibility would deadlock
     on the broken tree instead of measuring it. */
  await page.locator('.react-flow').first().waitFor({ state: 'attached', timeout: 90_000 });
  /* Let React Flow's `fitView` settle before measuring a box it is animating. */
  await page.waitForTimeout(2_000);

  const reading = await measureCanvas(page, '.workflow-builder-screen__canvas');
  expect(reading, 'no .workflow-builder-screen__canvas on the builder route').not.toBeNull();

  console.log(
    `[builder-canvas] .react-flow ${reading!.flowHeight}px · .gn-workflow-canvas ` +
      `${reading!.containerHeight}px · ${reading!.nodeCount} node(s) · first node inside the ` +
      `React Flow box: ${reading!.nodeAreaInsideFlow}px²`,
  );

  // 13.911 (a) — the canvas the viewer looks at has a real height.
  expect(
    reading!.flowHeight,
    'the builder canvas collapsed to zero height: `.react-flow` is present in the DOM and ' +
      'draws into nothing, so the workflow graph is invisible while every DOM-presence ' +
      'assertion in the suite still passes. `.gn-workflow-canvas` must keep a definite ' +
      'height for React Flow\'s `height: 100%` to resolve against — see that rule in ' +
      '`packages/ui/src/ui.css`.',
  ).toBeGreaterThan(0);

  // 13.911 (b) — and the nodes are inside it, which is what the person needs.
  expect(reading!.nodeCount, 'no nodes rendered, so the canvas has nothing to draw').toBeGreaterThan(0);
  expect(
    reading!.nodeAreaInsideFlow,
    'the canvas has a height but no node lies inside it — the graph is laid out beyond the ' +
      'box the viewer can see, which is the same defect wearing a non-zero height.',
  ).toBeGreaterThan(0);

  /* 13.911 (c) — THE CONTROL. The pre-fix cascade, planted and measured through
     the same `measureCanvas`. A measurement that cannot report zero is not a
     measurement, and this one reports 480 above; this proves it can report the
     collapsed state too, so the assertion above is known to discriminate. */
  await page.evaluate(() => {
    const ground = document.createElement('div');
    ground.setAttribute('data-planted-prefix', '');
    // No definite height, off-screen: the wrapper the broken canvas sat in.
    ground.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px';
    const canvas = document.createElement('div');
    canvas.className = 'gn-workflow-canvas';
    // `block` overrides the fix's grid track — this is the 0px cascade.
    canvas.style.cssText = 'display:block';
    const flow = document.createElement('div');
    flow.className = 'react-flow';
    flow.style.cssText = 'height:100%';
    canvas.appendChild(flow);
    ground.appendChild(canvas);
    document.body.appendChild(ground);
  });

  const control = await measureCanvas(page, '[data-planted-prefix]');
  await page.evaluate(() => {
    document.querySelector('[data-planted-prefix]')?.remove();
  });

  console.log(
    `[builder-canvas] CONTROL: the planted pre-fix canvas reads .react-flow ` +
      `${control?.flowHeight}px (container ${control?.containerHeight}px)`,
  );
  expect(
    control?.flowHeight,
    'the control did not read zero: this measurement cannot tell a collapsed canvas from a ' +
      'drawn one, so its reading of the product above means nothing.',
  ).toBe(0);
});
