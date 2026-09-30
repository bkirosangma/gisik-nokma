import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * Case block 14.283–14.286 — `/mcp/connect` sits in the MIDDLE of the page
 * (owner, 2026-09-30: "centre it, as recommended"; the no-nav decision stands).
 *
 * jsdom has no layout, so the centring RULE is asserted in the CSS source, the way
 * `sign-in-neo-restyle.test.ts` does, and the DOM shape the rule depends on is asserted
 * on the rendered page. The PIXEL claim (14.285) is a browser case, not this file's.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams('request=req_x'),
}));
vi.mock('../src/providers.js', () => ({
  useSessionStatus: () => ({ kind: 'signed-in', user: { id: 'u1', name: 'Kiro' } }),
}));

import ConnectPage from '../app/mcp/connect/page.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8');

function stubLiveRequest(): void {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ requestId: 'req_x', clientName: 'Claude', redirectHost: 'claude.ai' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('/mcp/connect — the card is centred (owner 2026-09-30, C1)', () => {
  it('14.283 the page is a full-height column and the stage centres itself with auto margins (safe: overflow falls to the top)', async () => {
    stubLiveRequest();
    const { container } = render(<ConnectPage />);
    await screen.findByRole('button', { name: 'Allow' });

    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main!.className).toContain('gn-mcp-connect');
    // The stage wraps the title AND the card, so they share one left edge and centre as one block.
    const stage = main!.querySelector(':scope > .gn-mcp-connect__stage');
    expect(stage).not.toBeNull();
    expect(stage!.querySelector('h1')).not.toBeNull();
    expect(stage!.querySelector('.gn-card')).not.toBeNull();
    expect(main!.children).toHaveLength(1);

    const page = ruleFor(css, /^\.gn-mcp-connect\s*\{/);
    expect(page, 'a `.gn-mcp-connect { }` rule').toBeDefined();
    expect(page).toMatch(/min-height:\s*100dvh/);
    expect(page).toMatch(/display:\s*flex/);
    expect(page).toMatch(/flex-direction:\s*column/);

    // `margin: auto` in a column flex centres on BOTH axes while there is room and, unlike
    // `justify-content: center`, never pushes the overflow above the top edge when there is not.
    const stageRule = ruleFor(css, /^\.gn-mcp-connect__stage\s*\{/);
    expect(stageRule, 'a `.gn-mcp-connect__stage { }` rule').toBeDefined();
    expect(stageRule).toMatch(/margin:\s*auto\s*;/);
    expect(stageRule).toMatch(/width:\s*100%/);
    expect(stageRule).toMatch(/max-width:\s*34rem/);
    expect(stageRule).toMatch(/min-width:\s*0/);
    expect(stageRule).not.toMatch(/justify-content|align-items:\s*center/);

    // CONTROL (same `it`): centring did not change the consent — Allow is still the ONE primary.
    expect(document.querySelectorAll('.gn-button--primary')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Allow' }).className).toContain('gn-button--primary');
  });

  it('14.284 the vertical padding is symmetric longhands, so the centre is the VIEWPORT centre and the narrow gutter survives', () => {
    const page = ruleFor(css, /^\.gn-mcp-connect\s*\{/);
    expect(page).toBeDefined();
    // `.gn-shell` pads 0 above and 3rem below; centring inside that box would sit 1.5rem high.
    const top = /padding-top:\s*([\d.]+rem)/.exec(page ?? '')?.[1];
    const bottom = /padding-bottom:\s*([\d.]+rem)/.exec(page ?? '')?.[1];
    expect(top).toBeDefined();
    expect(bottom).toBe(top);
    // A `padding:` shorthand here would reinstate 1.25rem sides on a phone.
    expect(page).not.toMatch(/(^|[\s;{])padding:/m);
    // CONTROL: the narrow-screen gutter it relies on is still supplied by `.gn-shell`'s media rule.
    expect(css).toMatch(/\.gn-shell\s*\{\s*padding:\s*0 0\.75rem 2rem;\s*\}/);
    // Tokens only: the layout rules carry no colour.
    const stageRule = ruleFor(css, /^\.gn-mcp-connect__stage\s*\{/) ?? '';
    expect(page + stageRule).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });

  it('14.286 the page stays without the app nav: no navigation landmark, no header — and the card is there', async () => {
    stubLiveRequest();
    const { container } = render(<ConnectPage />);
    await screen.findByRole('button', { name: 'Allow' }); // CONTROL: the page really rendered
    expect(screen.getByRole('heading', { level: 1, name: 'Connect an assistant' })).toBeTruthy();
    expect(container.querySelector('nav, header, [role="navigation"], [role="banner"]')).toBeNull();
  });
});
