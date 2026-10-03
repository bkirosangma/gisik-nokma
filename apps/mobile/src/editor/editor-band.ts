/**
 * The editor's reserved band, in dp, so the ticket screen's `ScrollView` holds the editor's height from the first frame and the page does not
 * jump when the WebView paints (spec §3.3, S1). It is a FLOOR read from `packages/editor/src/styles/editor.css` at 16 px per rem: one phone
 * tool row (`.ticket-editor__tool { min-height: 2.75rem }` in the ≤40rem arm = 44) plus the content floor
 * (`.ticket-editor__content { min-height: 4rem }` = 64). The toolbar is never shorter than one tool row, so the real editor is at least this
 * tall and the band only grows. It deliberately names no token a sibling lane is adding (the docked bar's height), so it holds on either
 * side of that change. `editor-band.test.ts` (25.217) recomputes it from the stylesheet, so a change to either number reddens it.
 */
export const EDITOR_MIN_HEIGHT = 108;

/** The WebView's own style: it reserves the band whether the page is loading or loaded. */
export const EDITOR_FRAME_STYLE = { minHeight: EDITOR_MIN_HEIGHT } as const;

/**
 * The WebView's loading skeleton COVERS the WebView; it does not sit beside it. `react-native-webview` 13.15.0 renders `renderLoading()`'s
 * element as a SIBLING after the WebView in a column container (`WebView.ios.tsx:182-184`, `:286-288`; `WebView.android.tsx:220-222`,
 * `:321-323`), and only its DEFAULT loader is absolute (`WebView.styles.ts` `loadingOrErrorView`). A plain skeleton view would stack under
 * the 108 dp WebView and take the slot to 216 dp and back — two layout jumps. This absolute fill lays it over the WebView instead. The
 * overlay also carries the screen's ground (`skeletonGround`) so the WebView's own white does not show through while it loads.
 */
export const EDITOR_LOADING_OVERLAY_STYLE = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
