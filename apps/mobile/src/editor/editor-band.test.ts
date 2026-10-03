import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EDITOR_FRAME_STYLE, EDITOR_LOADING_OVERLAY_STYLE, EDITOR_MIN_HEIGHT } from './editor-band.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const editorCss = readFileSync(join(HERE, '../../../../packages/editor/src/styles/editor.css'), 'utf8');
const webView = readFileSync(join(HERE, 'editor-web-view.tsx'), 'utf8');
const rem = (value: string): number => Number.parseFloat(value) * 16;

describe('the webview reserves the editor band before the page paints (spec §3.3; audit SM-13)', () => {
  it("25.217 EDITOR_MIN_HEIGHT is one phone tool row plus the editor's content floor (read from editor.css), the frame carries it, and the WebView draws a skeleton of that height while it loads", () => {
    const phoneArm = editorCss.slice(editorCss.indexOf('@media (max-width: 40rem)'));
    const bar = phoneArm.match(/\.ticket-editor__tool\s*\{\s*min-height:\s*([\d.]+rem)/)?.[1];
    const content = editorCss.match(/\.ticket-editor__content\s*\{\s*min-height:\s*([\d.]+rem)/)?.[1];
    expect(bar, "the phone tool row's min-height exists").toBeDefined();
    expect(content, 'the content floor exists').toBeDefined();
    expect(EDITOR_MIN_HEIGHT).toBe(rem(bar ?? '0') + rem(content ?? '0'));
    expect(EDITOR_FRAME_STYLE).toEqual({ minHeight: EDITOR_MIN_HEIGHT });
    expect(webView).toMatch(/startInLoadingState/);
    expect(webView).toMatch(/renderLoading=/);
    expect(webView).toMatch(/<SkeletonBlock height=\{EDITOR_MIN_HEIGHT\} \/>/);
    expect(webView).toMatch(/style=\{EDITOR_FRAME_STYLE\}/);
    // CONTROL (same it): the number is not zero and not a magic round figure unrelated to the CSS.
    expect(EDITOR_MIN_HEIGHT).toBeGreaterThan(0);
  });

  it('25.217 the loading skeleton COVERS the WebView (an absolute fill on the screen ground) instead of stacking under it, so the slot never grows while the page loads', () => {
    // react-native-webview 13.15.0 renders renderLoading()'s element as a SIBLING after the WebView (WebView.ios.tsx:182-184, :286-288;
    // WebView.android.tsx:220-222, :321-323); only its default loader is absolute (WebView.styles.ts loadingOrErrorView). A plain view
    // would stack: 108 -> 216 -> 108 dp, two jumps.
    expect(EDITOR_LOADING_OVERLAY_STYLE).toEqual({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 });
    const loading = webView.slice(webView.indexOf('renderLoading='));
    expect(loading, 'renderLoading returns the overlay, not a bare skeleton').toMatch(/renderLoading=\{\(\) => \(\s*<View style=\{\[EDITOR_LOADING_OVERLAY_STYLE, \{ backgroundColor: ground \}\]\}>\s*<SkeletonBlock height=\{EDITOR_MIN_HEIGHT\} \/>\s*<\/View>/);
    expect(webView, 'the overlay sits on the ground token, not the WebView white').toMatch(/skeletonGround\(themeFor\(useColorScheme\(\)\)\)/);
    // CONTROL (same it): the frame style is NOT absolute — the WebView itself keeps taking its place in the layout and reserves the band.
    expect(EDITOR_FRAME_STYLE).not.toHaveProperty('position');
  });
});
