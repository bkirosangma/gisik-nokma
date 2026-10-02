import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EDITOR_FRAME_STYLE, EDITOR_MIN_HEIGHT } from './editor-band.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const editorCss = readFileSync(join(HERE, '../../../../packages/editor/src/styles/editor.css'), 'utf8');
const webView = readFileSync(join(HERE, 'editor-web-view.tsx'), 'utf8');
const rem = (value: string): number => Number.parseFloat(value) * 16;

describe('the webview reserves the editor band before the page paints (spec §3.3; audit SM-13)', () => {
  it("25.217 EDITOR_MIN_HEIGHT is the editor's own phone bar plus its content floor (read from editor.css), the frame carries it, and the WebView draws a skeleton of that height while it loads", () => {
    const bar = editorCss.match(/--ticket-editor-bar-h:\s*([\d.]+rem)/)?.[1];
    const content = editorCss.match(/\.ticket-editor__content\s*\{\s*min-height:\s*([\d.]+rem)/)?.[1];
    expect(bar, 'the phone bar height token exists').toBeDefined();
    expect(content, 'the content floor exists').toBeDefined();
    expect(EDITOR_MIN_HEIGHT).toBe(rem(bar ?? '0') + rem(content ?? '0'));
    expect(EDITOR_FRAME_STYLE).toEqual({ minHeight: EDITOR_MIN_HEIGHT });
    expect(webView).toMatch(/startInLoadingState/);
    expect(webView).toMatch(/renderLoading=\{\(\) => <SkeletonBlock height=\{EDITOR_MIN_HEIGHT\} \/>\}/);
    expect(webView).toMatch(/style=\{EDITOR_FRAME_STYLE\}/);
    // CONTROL (same it): the number is not zero and not a magic round figure unrelated to the CSS.
    expect(EDITOR_MIN_HEIGHT).toBeGreaterThan(0);
  });
});
