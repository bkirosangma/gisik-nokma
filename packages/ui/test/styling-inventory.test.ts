import { describe, expect, it } from 'vitest';
import {
  SCREEN_OWNERS,
  expectRow,
  flatBoundaryOffenders,
  listPageRoutes,
  unownedRoutes,
} from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B1 — cases 20.201–20.204 (§20.21). */
describe('20.201 every route has a styling owner', () => {
  it('20.201 the live tree has 26 routes, all owned, none stale', () => {
    const routes = listPageRoutes();
    expect(routes).toHaveLength(26);
    expect(unownedRoutes(routes, SCREEN_OWNERS)).toEqual({ unowned: [], stale: [] });
    // CONTROL — a planted route and a planted owner are both reported.
    const planted = unownedRoutes([...routes, 'apps/web/app/zz/page.tsx'], { ...SCREEN_OWNERS, 'apps/web/app/gone/page.tsx': 'B0' });
    expect(planted).toEqual({ unowned: ['apps/web/app/zz/page.tsx'], stale: ['apps/web/app/gone/page.tsx'] });
  });
});

describe('20.202 the roster helper reads a pattern exactly', () => {
  const full =
    '.gn-zz { background: var(--gn-surface-track); box-shadow: var(--gn-shadow-track); border-radius: var(--gn-radius-track); padding: 0.5rem; }';
  it('20.202 a full P-TRACK passes; one missing declaration fails naming it', () => {
    expect(() => expectRow({ sheet: 'ui', selectors: '.gn-zz', pattern: 'P-TRACK' }, full)).not.toThrow();
    expect(() =>
      expectRow({ sheet: 'ui', selectors: '.gn-zz', pattern: 'P-TRACK' }, full.replace('box-shadow: var(--gn-shadow-track); ', '')),
    ).toThrow(/box-shadow/);
    // CONTROL — a selector list that matches nothing throws.
    expect(() => expectRow({ sheet: 'ui', selectors: '.gn-nope', pattern: 'P-TRACK' }, full)).toThrow(/found 0/);
  });
});

describe('20.203 the flat-boundary scanner', () => {
  it('20.203 finds sunken fills and the retired constant, ignores comments, honours kept', () => {
    const css = [
      '/* .gn-aa__x { background: var(--gn-surface-sunken); } */',
      '.gn-aa__row { background: var(--gn-surface-sunken); }',
      '.gn-aa__btn { background: var(--gn-fill-tertiary); color: var(--gn-text-accent); }',
      '.gn-aa__chip { background: var(--gn-fill-tertiary); color: var(--gn-text); }',
      '.gn-aa__row:disabled { background: var(--gn-surface-sunken); }',
      '.gn-bb { background: var(--gn-surface-sunken); }',
    ].join('\n');
    expect(flatBoundaryOffenders(css, ['.gn-aa'], ['.gn-aa__row:disabled'])).toEqual(['.gn-aa__row', '.gn-aa__btn']);
    // CONTROL — another prefix is not this screen's business.
    expect(flatBoundaryOffenders(css, ['.gn-aa'], [])).not.toContain('.gn-bb');
  });
});

describe('20.204 the roster helper reads the hover companion of a quiet or ghost row', () => {
  const quiet =
    '.gn-zz { min-height: 2.75rem; border: 1px solid var(--gn-border); border-radius: 999px; background: transparent; color: var(--gn-text-muted); }';
  const quietHover = '.gn-zz:hover:not(:disabled) { background: var(--gn-fill-quaternary); }';
  const ghost =
    '.gn-gg { min-height: 2.75rem; border: none; border-radius: 999px; background: transparent; color: var(--gn-text-subtle); }';
  const ghostHover =
    '.gn-gg:hover:not(:disabled), .gn-gg:focus-visible { background: var(--gn-fill-tertiary); color: var(--gn-text-muted); }\n' +
    '.gn-gg:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 0; }';
  const quietRow = { sheet: 'ui', selectors: '.gn-zz', pattern: 'P-QUIET' } as const;
  const ghostRow = { sheet: 'ui', selectors: '.gn-gg', pattern: 'P-GHOST' } as const;

  it('20.204 a quiet row without its hover rule throws; with it, and a ghost row likewise', () => {
    expect(() => expectRow(quietRow, `${quiet}\n${quietHover}`)).not.toThrow();
    expect(() => expectRow(quietRow, quiet)).toThrow(/found 0/);
    // a hover rule that paints the wrong fill is read, not merely found
    expect(() => expectRow(quietRow, `${quiet}\n${quietHover.replace('fill-quaternary', 'fill-tertiary')}`)).toThrow(/background/);
    expect(() => expectRow(ghostRow, `${ghost}\n${ghostHover}`)).not.toThrow();
    expect(() => expectRow(ghostRow, ghost)).toThrow(/found 0/);
    expect(() => expectRow(ghostRow, `${ghost}\n${ghostHover.split('\n')[0]}`)).toThrow(/found 0/);
    // CONTROL — an opt-out with a reason skips the companion; one without a reason is refused.
    expect(() => expectRow({ ...quietRow, hover: 'none: a disabled-only control' }, quiet)).not.toThrow();
    expect(() => expectRow({ ...quietRow, hover: 'none:' }, quiet)).toThrow(/reason/);
    expect(() => expectRow({ ...quietRow, hover: 'skip' }, quiet)).toThrow(/reason/);
    // CONTROL — a non-quiet, non-ghost pattern needs no companion.
    expect(() =>
      expectRow({ sheet: 'ui', selectors: '.gn-zz', pattern: 'P-HOVER' }, '.gn-zz { background: var(--gn-fill-quaternary); }'),
    ).not.toThrow();
  });
});
