import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SavedFilter } from '@gisik-nokma/domain';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SavedFiltersMenu } from '../../src/preferences/saved-filters-menu.js';

/**
 * 11.118 — THE MENU'S BEM CLASSES AND THE RULES THAT STYLE THEM ARE ONE FACT
 * SPELLED IN TWO PACKAGES, AND NOTHING ELSE TIES THE SPELLINGS.
 *
 * This is the third time the same defect has been available on this branch:
 * `test/timeline/timeline-view.test.tsx` built the first guard after Task 11's
 * fix round, `test/inbox/inbox-css-binding.test.tsx` generalised it to a SET
 * EQUALITY after Task 12's, and each time the component that came next in the
 * same package had no reason to go looking. It is written here in the same
 * commit as the component instead of one review later.
 *
 * The technique is the inbox file's, deliberately unchanged so the two read as
 * one instrument: harvest the classes the stylesheet names and the classes the
 * component renders, and compare the SETS. A subset in either direction sees
 * only one of the two renames; equality also catches a rule written for a
 * class nothing draws. Its cost is that the fixture must render every
 * conditional class, which here means BOTH arms — `__empty` and
 * `__list`/`__item` are mutually exclusive, so there are two renders.
 *
 * CROSS-PACKAGE ON PURPOSE: this app-core test reads `packages/ui/src/ui.css`,
 * so a ui-side edit to the `.gn-saved-filters` block reddens an app-core suite.
 * That is the point — neither package's own gate can see the other half.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CSS_PATH = join(REPO_ROOT, 'packages/ui/src/ui.css');
const PREFIX = 'gn-saved-filters';

/**
 * Comments stripped FIRST. The block opens with a paragraph naming other
 * blocks' selectors, and a deleted rule must not stay "styled" out of the prose
 * that explains it.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function styledClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/\.(gn-saved-filters[A-Za-z0-9_-]*)/g)].flatMap(
    (hit) => hit[1] ?? [],
  );
  return [...new Set(hits)].sort();
}

function renderedClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
    [...element.classList].filter((name) => name.startsWith(PREFIX)),
  );
  return [...new Set(hits)].sort();
}

/** The declarations of the rule whose selector list is EXACTLY `selector`. */
function declarationsFor(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(stripComments(css));
  return rule?.[1] ?? null;
}

describe('11.118 the scanners are proven against planted input before they are trusted', () => {
  it('reads classes out of selectors, ignores commented-out ones, and is not fooled by a prefix', () => {
    const planted = [
      '/* .gn-saved-filters__ghost { color: red; } — a rule that was DELETED */',
      '.gn-saved-filters { background: var(--gn-surface); }',
      '.gn-saved-filters__item .gn-saved-filters__apply { color: var(--gn-accent); }',
      '.gn-saved-filters__submit:disabled { cursor: not-allowed; }',
      '.gn-inbox__row { color: inherit; }',
    ].join('\n');
    expect(styledClasses(planted)).toEqual([
      'gn-saved-filters',
      'gn-saved-filters__apply',
      'gn-saved-filters__item',
      'gn-saved-filters__submit',
    ]);
  });

  it('reads classes off a rendered tree and ignores classes from other blocks', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div class="gn-saved-filters"><span class="gn-saved-filters__item gn-inbox__row"></span></div>';
    expect(renderedClasses(host)).toEqual(['gn-saved-filters', 'gn-saved-filters__item']);
  });

  it('declarationsFor finds a rule, refuses a selector that merely ENDS the same, and reports a miss', () => {
    const planted = [
      '.gn-saved-filters__submit { color: var(--gn-text); }',
      '.gn-saved-filters__item .gn-saved-filters__submit { color: var(--gn-accent); }',
    ].join('\n');
    expect(declarationsFor(planted, '.gn-saved-filters__submit')).toBe(' color: var(--gn-text); ');
    expect(declarationsFor(planted, '.gn-saved-filters__nothing')).toBeNull();
  });
});

/**
 * THE MAXIMAL FIXTURE — both arms of the one conditional, in one tree. A
 * fixture that rendered only the populated arm would leave `__empty` styled and
 * unrendered, and the tempting repair is to weaken the equality to a subset,
 * which throws away half the finding. Render the missing arm instead.
 */
const FILTERS: SavedFilter[] = [
  { id: 'f1', name: 'My open work', filterSpec: { assigneeId: 'user_kiro' } },
];

function renderBothArms() {
  return render(
    <div>
      <SavedFiltersMenu
        filters={FILTERS}
        onApply={() => {}}
        onSaveCurrent={() => {}}
        onDelete={() => {}}
      />
      <SavedFiltersMenu
        filters={[]}
        onApply={() => {}}
        onSaveCurrent={() => {}}
        onDelete={() => {}}
      />
    </div>,
  );
}

describe('11.118 every class the menu renders is a class ui.css styles, and the reverse', () => {
  const css = readFileSync(CSS_PATH, 'utf8');

  it('the two sets are EQUAL — a rename on either side of the package boundary reddens here', () => {
    const { container } = renderBothArms();
    const rendered = renderedClasses(container);
    const styled = styledClasses(css);

    // FLOORS, not counts. The component draws nine classes today; these say
    // both walks really reached something, so an equality of two empty lists
    // cannot pass for agreement. Raise them when the block grows; never type
    // the names, because a typed list would be a THIRD spelling of every class
    // and a typo in it would read as a component defect.
    expect(rendered.length).toBeGreaterThanOrEqual(9);
    expect(styled.length).toBeGreaterThanOrEqual(9);

    expect(rendered).toEqual(styled);
  });

  it('11.119 the disabled state reaches a RULE, which the class equality cannot see', () => {
    // `.gn-saved-filters__submit:disabled` contributes the same class name as
    // the base rule, so deleting it outright leaves the set equality green
    // while the only visual difference between an armed and a disarmed save
    // button disappears. Read as one shape, so a missing rule shows as `null`
    // beside the one that is present rather than as an absent test.
    expect([
      declarationsFor(css, '.gn-saved-filters__submit')?.includes('var(--gn-text)') ?? null,
      declarationsFor(css, '.gn-saved-filters__submit:disabled')?.includes('var(--gn-text-muted)') ??
        null,
    ]).toEqual([true, true]);
  });

  it('11.120 the block names no colour of its own and adds no role', () => {
    // `packages/ui/test/token-discipline.test.ts` already refuses a hex
    // anywhere in client source; what it cannot say is that this block reuses
    // EXISTING roles rather than inventing `--gn-saved-filter-ink`. Every
    // custom property the block references must already be referenced
    // elsewhere in the stylesheet.
    const bare = stripComments(css);
    const blockStart = bare.indexOf('.gn-saved-filters {');
    expect(blockStart).toBeGreaterThan(-1);
    const block = bare.slice(blockStart);
    const outside = bare.slice(0, blockStart);
    const used = [...new Set([...block.matchAll(/var\((--gn-[a-z-]+)\)/g)].flatMap((h) => h[1] ?? []))];
    expect(used.length).toBeGreaterThan(3);
    for (const role of used) {
      expect(outside, `${role} is a NEW role, not one the stylesheet already draws with`).toContain(
        `var(${role})`,
      );
    }
  });
});
