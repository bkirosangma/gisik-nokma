import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { newSubmittedEvent } from '@gisik-nokma/domain';
import { ContestBanner } from '../src/contests/contest-banner.js';
import { ClockSkewBadge } from '../src/history/clock-skew-badge.js';
import { SyncStatusBar } from '../src/sync/sync-status-bar.js';
import type { ContestLike } from '../src/contests/contest-view-model.js';

/**
 * 12.199 — THE THREE PLAN 10 TASK 13 SURFACES' BEM CLASSES AND THE RULES THAT
 * STYLE THEM ARE ONE FACT, SPELLED IN TWO PACKAGES.
 *
 * This is `inbox-css-binding.test.tsx`'s technique applied to the contested
 * banner, the skew badge and the sync strip, and it exists because these three
 * components were written with class names and NO rules at all: `ui.css` had
 * zero `gn-contest-banner`, `gn-clock-skew-badge` or `gn-sync-status-bar`
 * selectors when they landed (measured, with `gn-inbox` as the positive
 * control on the same file). A component whose classes bind to nothing is not
 * "unstyled pending design" — it is a surface that silently does not consume
 * the token system its own interface contract names (amendment 11).
 *
 * ## Set equality, not a subset, and the cost that comes with it
 *
 * A subset in one direction ("every rendered class has a rule") catches a TSX
 * rename and misses a CSS one; the other direction misses the reverse.
 * Equality catches both, plus the third case — a rule for a class no component
 * renders, i.e. a style that has quietly stopped applying.
 *
 * The cost is that the fixture must render EVERY conditional class:
 * `__action--discard` needs an unresolved contest, `__failed` needs a non-zero
 * failure count, `__error` needs a non-null stream error (Ruling P34), and the
 * badge needs a GROSS skew or it renders null. A
 * fixture that missed one would fail here and the tempting repair is to weaken
 * this to a subset, which throws away half the finding. Add the render.
 *
 * ## Cross-package coupling, on purpose
 *
 * This app-core test reads `packages/ui/src/ui.css`, so a ui-side edit to
 * these blocks reddens an app-core suite. That is the point: the two halves of
 * one fact live in different packages and neither package's own gate can see
 * the other. `inbox-css-binding.test.tsx` and `timeline-view.test.tsx` take
 * the same cost for the same reason.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const PREFIXES = ['gn-contest-banner', 'gn-clock-skew-badge', 'gn-sync-status-bar'] as const;

/**
 * Comments stripped FIRST. A class named only inside a CSS comment is styled
 * by nothing, and leaving comments in would let a DELETED rule stay green out
 * of its own explanatory prose — the block this file guards opens with a
 * paragraph of exactly that.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every class in one of the three families NAMED IN A SELECTOR, sorted, deduplicated. */
function styledClasses(css: string): string[] {
  const bare = stripComments(css);
  const hits = PREFIXES.flatMap((prefix) => [
    ...bare.matchAll(new RegExp(`\\.(${prefix}[A-Za-z0-9_-]*)`, 'g')),
  ]).map((m) => m[1] as string);
  return [...new Set(hits)].sort();
}

/** Every such class the rendered DOM actually carries. */
function renderedClasses(root: HTMLElement): string[] {
  const found = new Set<string>();
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const name of Array.from(el.classList)) {
      if (PREFIXES.some((p) => name.startsWith(p))) found.add(name);
    }
  }
  return [...found].sort();
}

const TICKET = '01J9GTKA000000000000000000';

function contest(): ContestLike {
  return {
    contestedEventId: '01J9GCON000000000000000000',
    ticketId: TICKET,
    claimantId: 'user_b',
    rule: 'restrict-to',
    reason: 'Only the assignee may do this.',
    originalEvent: newSubmittedEvent({
      workspaceId: 'ws_1',
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: 'user_b',
      origin: 'mobile',
    }),
    contestedAt: '2026-08-20T10:00:00.000Z',
    resolved: false,
    resolution: null,
  };
}

describe('12.199 — Plan 10 Task 13 classes and ui.css are one fact', () => {
  const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  it('the stylesheet actually names these families — the harvest is not silently empty', () => {
    // Positive control for the harvester itself: without this, a regex that
    // matched nothing would make the equality below trivially true on two
    // empty sets the day someone deleted the whole block.
    expect(styledClasses(css).length).toBeGreaterThan(0);
    for (const prefix of PREFIXES) {
      expect(styledClasses(css).some((c) => c.startsWith(prefix)), prefix).toBe(true);
    }
  });

  it('every class the three components render is styled, and every rule styles a class they render', () => {
    const { container } = render(
      <div>
        <ContestBanner contests={[contest()]} onResolve={() => undefined} onRedo={() => undefined} />
        <ClockSkewBadge
          env={{ clientTime: '2026-08-20T12:11:00.000Z', serverTime: '2026-08-20T12:00:00.000Z' }}
        />
        <SyncStatusBar status="offline" queued={2} failed={1} error={{ code: 'not-a-member', message: 'x' }} />
      </div>,
    );
    expect(renderedClasses(container)).toEqual(styledClasses(css));
  });

  it('no colour literal reaches these components — every colour is a token variable', () => {
    const block = stripComments(css).slice(stripComments(css).indexOf('.gn-contest-banner'));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(block).not.toMatch(/\brgba?\(/);
    // Control: the block DOES set colours, so the two assertions above are not
    // passing over a block that simply has no colour in it at all.
    expect(block).toMatch(/var\(--gn-/);
  });
});
