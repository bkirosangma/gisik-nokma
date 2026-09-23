import { describe, expect, it } from 'vitest';
import { computeSuggestionPopupPlacement } from '../src/extensions/suggestion-popup-position.js';

/**
 * 9.314–9.316 — the placement maths behind every suggestion popup's
 * positioning (bug fix, owner report 2026-09-23: the inline `:note`/`:ticket`
 * popups "float way above" and stay "fixed at that absolute position" while
 * the sheet scrolls). Pure function, no DOM: jsdom lays nothing out, so this
 * is the only place these three shapes are provable at all — the 🧪 browser
 * case (test-cases/09-editor-attachments.md, 9.317) is what proves the DOM
 * binder wires this correctly against a real, scrolled caret.
 */
describe('9.314-9.316 computeSuggestionPopupPlacement', () => {
  const viewport = { width: 1000, height: 600 };

  it('9.314 below the caret when there is room; control: the left edge is untouched when it already fits', () => {
    const caret = { top: 100, bottom: 120, left: 50 };
    const popup = { width: 200, height: 150 };
    expect(computeSuggestionPopupPlacement(caret, popup, viewport)).toEqual({
      top: 124, // caret.bottom (120) + the 4px gap
      left: 50,
      placement: 'below',
    });
  });

  it('9.315 flips above when there is not enough room below; mutation: a placement fixed at "below" answers { top: 574 (clamped to 450), placement: "below" } for this fixture, distinguishable on both fields', () => {
    const caret = { top: 550, bottom: 570, left: 50 };
    const popup = { width: 200, height: 150 };
    // roomBelow = 600 - 570 = 30, short of 150 + 4 — must flip.
    expect(computeSuggestionPopupPlacement(caret, popup, viewport)).toEqual({
      top: 396, // caret.top (550) - popup.height (150) - the 4px gap
      left: 50,
      placement: 'above',
    });
  });

  it('9.316 clamps the left edge inside the viewport when the caret sits near the right edge; control: top is unaffected', () => {
    const caret = { top: 100, bottom: 120, left: 950 };
    const popup = { width: 200, height: 150 };
    // Unclamped left (950) plus the popup's width (200) would run to 1150,
    // 150px past the 1000px viewport.
    expect(computeSuggestionPopupPlacement(caret, popup, viewport)).toEqual({
      top: 124,
      left: 800, // viewport.width (1000) - popup.width (200)
      placement: 'below',
    });
  });
});
