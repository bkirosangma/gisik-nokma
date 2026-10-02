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
