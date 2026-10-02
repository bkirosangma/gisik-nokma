/**
 * The editor's reserved band, in dp, so the ticket screen's `ScrollView` holds the editor's height from the first frame and the page does not
 * jump when the WebView paints (spec §3.3, S1). It is the editor's OWN floor, read from `packages/editor/src/styles/editor.css` at 16 px per
 * rem: the phone toolbar row (`--ticket-editor-bar-h: 3.5rem` = 56) plus the content floor (`.ticket-editor__content { min-height: 4rem }`
 * = 64). `editor-band.test.ts` (25.217) recomputes it from the stylesheet, so a change to either number reddens it.
 */
export const EDITOR_MIN_HEIGHT = 120;

/** The WebView's own style: it reserves the band whether the page is loading or loaded. */
export const EDITOR_FRAME_STYLE = { minHeight: EDITOR_MIN_HEIGHT } as const;
