import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Smoothness T13 (spec §3.3): the WINDOW's opening arm. `App` reads its token and workspace from `localStorage`, which node lacks, so a stub
 * stands in; `react-dom/server` renders the first paint (effects do not run there — which is exactly the state under test: the replica has
 * not opened yet).
 */
describe('the window while the replica opens (spec §3.3; audit SM-12)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => (key === 'gisik.workspaceId' ? 'ws1' : key === 'gisik.token' ? 'tok' : null) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('25.212 the first paint shows the skeleton list (aria-busy, "Opening your local copy" once), not the old sentence and not "No tickets yet"', async () => {
    const { App } = await import('./app.js');
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toMatch(/Opening your local copy/);
    expect(html).toMatch(/<ul class="ticket-list"/);
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).not.toMatch(/Opening local replica/);
    expect(html).not.toMatch(/No tickets yet/);
    // CONTROL (same it): signed out, the window renders the sign-in hint instead and no skeleton, so the arm above is the signed-in one.
    vi.stubGlobal('localStorage', { getItem: () => null });
    const signedOut = renderToStaticMarkup(createElement(App));
    expect(signedOut).not.toMatch(/gn-skeleton|Opening your local copy/);
  });
});
