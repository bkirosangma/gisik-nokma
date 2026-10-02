import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpBrowser } from '@gisik-nokma/app-core/help';
import { HelpLoading, WorkflowBuilderLoading } from '../src/skeletons/route-loading.js';

/**
 * 25.179 — each route skeleton's frame is the real component's own root class (smoothness T10 FIX 1; amendment S-R1 rule 1), and no
 * fill names the well. `HelpLoading` is `.gn-help` (`help-browser.tsx`, the manual's root); `WorkflowBuilderLoading` is
 * `.workflow-builder-screen` (`workflow-builder-screen.tsx`). The manual is rendered for real; the builder screen needs a gateway, a
 * session and a roster, so its root class is read from its source, and the control is that the read finds exactly one such root.
 */

const SCREEN = resolve(__dirname, '../../../packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx');
const frame = (region: Element) => [...region.classList].filter((name) => name !== 'gn-skeleton-region').join(' ');

describe('25.179 the route skeletons wear the real component frames', () => {
  it('HelpLoading is .gn-help, as the real manual root is', () => {
    const real = render(<HelpBrowser />);
    const realRoot = real.container.firstElementChild!;
    expect(realRoot.className).toBe('gn-help'); // control: the real root, rendered
    real.unmount();
    const loading = render(<HelpLoading />);
    const region = loading.container.firstElementChild!;
    expect(frame(region)).toBe(realRoot.className);
    expect(loading.container.innerHTML).not.toMatch(/well/i);
  });

  it('WorkflowBuilderLoading is .workflow-builder-screen, as the real screen root is', () => {
    const source = readFileSync(SCREEN, 'utf8');
    const roots = [...source.matchAll(/<div className="(workflow-builder-screen)">/g)];
    expect(roots).toHaveLength(1); // control: the source names one root, so the read is not a miss
    const loading = render(<WorkflowBuilderLoading />);
    expect(frame(loading.container.firstElementChild!)).toBe(roots[0]![1]);
    expect(loading.container.innerHTML).not.toMatch(/well/i);
  });
});
