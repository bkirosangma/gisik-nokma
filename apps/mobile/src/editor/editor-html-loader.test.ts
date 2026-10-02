import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EDITOR_HTML } from './editor-html.generated.js';
import { loadEditorHtml } from './editor-html-loader.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

describe('the ticket screen opens before the editor page is in memory (spec §3.3; audit SM-13)', () => {
  it('25.216 the editor HTML is loaded by a dynamic import on the first ticket open (a promise of the real page), never by a static import; the skeleton fills the slot and the opening arms, the editor takes the page once it is here', async () => {
    const html = await loadEditorHtml();
    expect(typeof html).toBe('string');
    expect(html).toBe(EDITOR_HTML);
    expect(html.length).toBeGreaterThan(1000);
    const screen = source('screens/ticket-screen.tsx');
    expect(screen, 'no static import of the ~MB bundle').not.toMatch(/from '\.\.\/editor\/editor-html\.generated\.js'/);
    expect(screen).toMatch(/loadEditorHtml\(\)/);
    expect(screen).toMatch(/useState<string \| null>\(null\)/);
    expect(screen, 'the editor mounts only with the page').toMatch(/html === null \? \(?\s*<SkeletonBlock height=\{EDITOR_MIN_HEIGHT\}/);
    expect(screen, 'both "Opening…" sentences are gone').not.toMatch(/Opening…/);
    expect(screen.match(/<TicketSkeleton\b/g)?.length, 'the ds-null and ticket-null arms').toBe(2);
    // The loader itself is the ONE dynamic import of the generated module.
    const loader = source('editor/editor-html-loader.ts');
    expect(loader).toMatch(/import\('\.\/editor-html\.generated\.js'\)/);
    // CONTROL (same it): the loader is the only non-test file that names the generated module statically or dynamically.
    expect(source('editor/editor-web-view.tsx')).not.toMatch(/editor-html\.generated/);
  });
});
