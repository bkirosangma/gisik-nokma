import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS } from '@gisik-nokma/domain';
import { NotificationIcon } from '../../src/inbox/icons.js';

/**
 * 11.87 — the per-kind glyphs.
 *
 * The recorded failure on this branch is a switch the compiler proved
 * EXHAUSTIVE while nothing proved what its arms RETURN. Icons are the worst
 * version of that: an arm holding an empty fragment still renders
 * `<svg data-kind="mention">`, so every presence check stays green while the
 * row draws a hole. And a copy-paste — one kind's paths under another's key —
 * renders a perfectly good icon of the wrong thing.
 *
 * One assertion catches both: collect the five rendered interiors and require
 * five DISTINCT ones. An empty arm collapses the set to four (the empty string
 * is one value); a duplicated arm collapses it to four as well.
 */
function interiorOf(kind: (typeof NOTIFICATION_KINDS)[number]): string {
  const { container, unmount } = render(<NotificationIcon kind={kind} />);
  const svg = container.querySelector(`svg[data-kind="${kind}"]`);
  const html = svg === null ? '<<no svg with that data-kind>>' : svg.innerHTML;
  unmount();
  return html;
}

describe('11.87 all five kinds reach an icon, and no two reach the same one', () => {
  it('every kind renders an svg tagged with its own kind', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const { container, unmount } = render(<NotificationIcon kind={kind} />);
      const svg = container.querySelector('svg');
      expect(svg, `no <svg> for ${kind}`).not.toBeNull();
      expect(svg?.getAttribute('data-kind'), `data-kind for ${kind}`).toBe(kind);
      unmount();
    }
  });

  it('the five interiors are five DIFFERENT drawings, none of them empty', () => {
    const interiors = NOTIFICATION_KINDS.map(interiorOf);
    // Non-empty: an arm that is an empty fragment draws nothing at all.
    for (const [index, html] of interiors.entries()) {
      expect(html.length, `${NOTIFICATION_KINDS[index]} drew nothing`).toBeGreaterThan(0);
    }
    // Distinct: a copy-paste between arms is an icon of the wrong thing, and
    // it is invisible to every check that only asks whether an icon appeared.
    expect(new Set(interiors).size, `interiors:\n${interiors.join('\n---\n')}`).toBe(
      NOTIFICATION_KINDS.length,
    );
    // The walk really covered the vocabulary — five, not zero, not four.
    expect(interiors).toHaveLength(5);
  });

  it('names no colour: the stroke is currentColor and there is no fill', () => {
    // Token discipline holds by CONSTRUCTION here rather than by scanning: an
    // icon that inherits its colour cannot be a hue the palette does not own.
    const { container } = render(<NotificationIcon kind="assignment" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('fill')).toBe('none');
  });

  it('is hidden from the accessibility tree — the headline already says the kind', () => {
    const { container } = render(<NotificationIcon kind="mention" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
