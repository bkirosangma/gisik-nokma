import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InboxView } from '../../src/inbox/inbox-view.js';
import { UnreadBadge } from '../../src/inbox/unread-badge.js';
import { notificationOf, oneOfEveryKind, userName } from './fixtures.js';

/**
 * 11.95 — THE INBOX'S BEM CLASSES AND THE RULES THAT STYLE THEM ARE ONE FACT,
 * SPELLED IN TWO PACKAGES, AND UNTIL THIS FILE NOTHING TIED THE SPELLINGS.
 *
 * MEASURED BEFORE THIS FILE EXISTED: renaming `gn-inbox__glyph` to
 * `gn-inbox__glyphx` in `inbox-view.tsx` left app-core 955/955 AND ui 37/37
 * green. That class carries
 * `.gn-inbox__row[data-unread] .gn-inbox__glyph { color: var(--gn-accent) }` —
 * one of the two colour signals `inbox-view.tsx`'s own docblock names for an
 * unread row — and it vanished silently. Six more renames survived the same
 * way: `__more`, `__list`, `__item`, `__text`, `__icon`, and the `gn-inbox`
 * root. Task 12 ran fifty-eight mutations and every one was on a VALUE; the
 * selector dimension was unexamined.
 *
 * The GUARD ALREADY EXISTED on this branch, two files away, in two forms:
 * `test/timeline/timeline-view.test.tsx` ties a custom property published by a
 * component to the `ui.css` that consumes it, and `packages/ui/test/
 * in-transit.test.ts` reads declarations out of named rules. This file is that
 * technique applied to the inbox, and it is deliberately STRONGER than either:
 * both of those enumerate by hand and so cannot see a surface added later,
 * while the class check below is a SET EQUALITY between what the components
 * render and what the stylesheet styles, harvested from both sides.
 *
 * ## Why set equality and not a subset
 *
 * A subset check in one direction ("every rendered class has a rule") catches
 * a TSX-side rename and misses a CSS-side one; the other direction misses the
 * reverse. Equality catches both, and it also catches the third case nobody
 * thinks of — a rule written for a class no component renders, which is a
 * style that has quietly stopped applying.
 *
 * The cost of equality is that the FIXTURE MUST RENDER EVERY CONDITIONAL
 * CLASS. `__more` needs `onLoadMore`, `__dot` needs an unread row, and
 * `__badge` is not in `InboxView` at all — it is `UnreadBadge`, rendered
 * alongside below. A fixture that missed one would fail here, and the
 * tempting repair is to weaken this to a subset, which silently throws away
 * half the finding. Add the missing render instead.
 *
 * ## CROSS-PACKAGE COUPLING, on purpose
 *
 * This app-core test reads `packages/ui/src/ui.css`. A ui-side edit to the
 * `.gn-inbox*` block therefore reddens an app-core suite, which is the whole
 * point: the two halves of one fact are in different packages and neither
 * package's own gate can see the other. `timeline-view.test.tsx` took the same
 * cost for the same reason.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Comments stripped FIRST. A class named only inside a CSS comment is styled by
 * nothing, and leaving comments in would let a DELETED rule keep this green out
 * of its own explanatory prose — `ui.css`'s inbox block opens with a paragraph
 * of it. That is the exact failure this file exists to stop.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `gn-inbox…` class NAMED IN A SELECTOR, in sorted order, deduplicated. */
function styledClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/\.(gn-inbox[A-Za-z0-9_-]*)/g)].flatMap(
    (hit) => hit[1] ?? [],
  );
  return [...new Set(hits)].sort();
}

/** Every `gn-inbox…` class actually on an element in the rendered tree. */
function renderedClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
    [...element.classList].filter((name) => name.startsWith('gn-inbox')),
  );
  return [...new Set(hits)].sort();
}

/** Every `[data-…]` attribute NAME a `gn-inbox` selector keys on. */
function styledAttributes(css: string): string[] {
  const inboxRules = [...stripComments(css).matchAll(/^[^{}\n]*\.gn-inbox[^{}\n]*\{/gm)].flatMap(
    (hit) => hit[0] ?? [],
  );
  const hits = inboxRules.flatMap((selector) =>
    [...selector.matchAll(/\[(data-[a-z-]+)/g)].flatMap((attribute) => attribute[1] ?? []),
  );
  return [...new Set(hits)].sort();
}

/**
 * The declarations of the rule whose selector list is EXACTLY `selector`.
 * Borrowed from `packages/ui/test/in-transit.test.ts`, which anchored it at a
 * line start so `.gn-inbox__glyph` cannot match inside
 * `.gn-inbox__row[data-unread] .gn-inbox__glyph`.
 */
function declarationsFor(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(stripComments(css));
  return rule?.[1] ?? null;
}

describe('11.95 the three scanners are proven against planted input before they are trusted', () => {
  it('reads classes out of selectors, ignores commented-out ones, and is not fooled by a prefix', () => {
    const planted = [
      '/* .gn-inbox__ghost { color: red; } — a rule that was DELETED */',
      '.gn-inbox { background: var(--gn-surface); }',
      '.gn-inbox__row[data-unread] .gn-inbox__glyph { color: var(--gn-accent); }',
      '.gn-timeline__bar { color: blue; }',
    ].join('\n');
    // `__ghost` absent (comment), `gn-timeline__bar` absent (wrong prefix),
    // and the compound selector contributes BOTH of its classes.
    expect(styledClasses(planted)).toEqual(['gn-inbox', 'gn-inbox__glyph', 'gn-inbox__row']);
  });

  it('reads classes off a rendered tree and ignores classes from other blocks', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div class="gn-inbox"><span class="gn-inbox__glyph gn-timeline__bar"></span></div>';
    // The host itself is not scanned — only descendants — which is why the
    // real fixture below wraps its components in a container it does not own.
    expect(renderedClasses(host)).toEqual(['gn-inbox', 'gn-inbox__glyph']);
  });

  it('reads the attribute names a gn-inbox selector keys on, and only those', () => {
    const planted = [
      '.gn-inbox__row[data-unread] .gn-inbox__glyph { color: var(--gn-accent); }',
      '.gn-inbox__badge[data-capped] { min-width: 2rem; }',
      '.gn-timeline__bar[data-pending] { outline: 1px dashed red; }',
    ].join('\n');
    expect(styledAttributes(planted)).toEqual(['data-capped', 'data-unread']);
  });

  it('declarationsFor finds a rule, refuses a selector that merely ENDS the same, and reports a miss', () => {
    const planted = [
      '.gn-inbox__glyph { color: var(--gn-text-muted); }',
      '.gn-inbox__row[data-unread] .gn-inbox__glyph { color: var(--gn-accent); }',
    ].join('\n');
    expect(declarationsFor(planted, '.gn-inbox__glyph')).toBe(' color: var(--gn-text-muted); ');
    expect(declarationsFor(planted, '.gn-inbox__row[data-unread] .gn-inbox__glyph')).toBe(
      ' color: var(--gn-accent); ',
    );
    expect(declarationsFor(planted, '.gn-inbox__nothing')).toBeNull();
  });
});

/**
 * THE MAXIMAL FIXTURE — every conditional class the two components can draw,
 * in one tree. One row per kind so `__icon`'s absence or presence is decided
 * by the component and not by which kind happened to be chosen; a READ row
 * beside the unread ones so the tree is the shape a real inbox has; and
 * `onLoadMore` supplied so `__more` exists at all.
 */
function renderEverything() {
  const notifications = [...oneOfEveryKind(), notificationOf('assignment', { read: true })];
  return render(
    <div>
      <InboxView
        notifications={notifications}
        userName={userName}
        onOpen={() => {}}
        onMarkRead={() => {}}
        onLoadMore={() => {}}
      />
      <UnreadBadge count={137} />
    </div>,
  );
}

describe('11.95 every class the inbox renders is a class ui.css styles, and the reverse', () => {
  const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  it('the two sets are EQUAL — a rename on either side of the package boundary reddens here', () => {
    const { container } = renderEverything();
    const rendered = renderedClasses(container);
    const styled = styledClasses(css);

    // The walks really walked. An empty list on either side would satisfy the
    // equality below by finding nothing at all, which is the shape of a scanner
    // whose regex stopped matching after somebody reformatted the stylesheet.
    expect(rendered.length).toBeGreaterThan(5);
    expect(styled.length).toBeGreaterThan(5);

    // NEITHER LIST IS TYPED HERE. Typing the expected names would make this
    // file a THIRD spelling of every class — the duplication the case exists to
    // catch — and a typo in it would read as a component defect. The two sides
    // are compared to each other and to nothing else.
    expect(rendered).toEqual(styled);
  });

  it('and every data-attribute ui.css keys an inbox rule on is really rendered', () => {
    // The other half of the binding: `.gn-inbox__row[data-unread] …` is dead
    // weight if the component spells the attribute differently, and NOTHING
    // saw that before — `inbox-view.test.tsx` asserts the attribute exists,
    // `ui.css` names it, and the two were never compared. A class-name check
    // cannot see this: rename the attribute in the stylesheet and every class
    // in it still matches.
    const { container } = renderEverything();
    const rendered = [...container.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
      element.getAttributeNames().filter((name) => name.startsWith('data-')),
    );
    const styled = styledAttributes(css);
    expect(styled.length).toBeGreaterThan(0);
    for (const attribute of styled) {
      expect(rendered, attribute).toContain(attribute);
    }
  });
});

describe('11.95 the unread signals reach a rule, not just an attribute', () => {
  const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  it('all three carry their declaration, compared as one shape', () => {
    // Set equality above CANNOT see this. Delete
    // `.gn-inbox__row[data-unread] .gn-inbox__glyph` outright and
    // `gn-inbox__glyph` is still in the styled set — the muted default rule
    // keeps it there — so the class check stays green while the accent signal
    // is gone. These are the three channels `inbox-view.tsx` names for "unread",
    // and they are read as ONE SHAPE so a missing rule reads as `null` beside
    // the two that are present rather than as an absent test.
    const signals = [
      ['.gn-inbox__row[data-unread] .gn-inbox__glyph', /color:\s*var\(--gn-accent\)/],
      ['.gn-inbox__row[data-unread] .gn-inbox__headline', /font-weight:\s*600/],
      ['.gn-inbox__dot', /background:\s*var\(--gn-accent\)/],
    ] as const;
    expect(
      signals.map(([selector, expected]) => {
        const declarations = declarationsFor(css, selector);
        return { selector, carries: declarations === null ? null : expected.test(declarations) };
      }),
    ).toEqual([
      { selector: '.gn-inbox__row[data-unread] .gn-inbox__glyph', carries: true },
      { selector: '.gn-inbox__row[data-unread] .gn-inbox__headline', carries: true },
      { selector: '.gn-inbox__dot', carries: true },
    ]);
  });

  it('a READ row’s glyph is the muted role, so the accent rule is a CONTRAST and not the only rule', () => {
    // Without this, deleting `.gn-inbox__glyph { color: var(--gn-text-muted) }`
    // would leave every glyph inheriting the row's text colour and the accent
    // rule saying nothing different from the default. The signal is the
    // DIFFERENCE between the two rules, so both are pinned.
    const muted = declarationsFor(css, '.gn-inbox__glyph');
    expect(muted).not.toBeNull();
    expect(muted ?? '').toMatch(/color:\s*var\(--gn-text-muted\)/);
  });
});
