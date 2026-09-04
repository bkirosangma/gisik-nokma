import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SavedFilter } from '@gisik-nokma/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SAVED_FILTERS_EMPTY_COPY,
  SavedFiltersMenu,
} from '../../src/preferences/saved-filters-menu.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SOURCE = join(REPO_ROOT, 'packages/app-core/src/preferences/saved-filters-menu.tsx');

/** Block and line comments out; string literals are not touched. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const FILTERS: SavedFilter[] = [
  { id: 'f1', name: 'My open work', filterSpec: { assigneeId: 'user_kiro' } },
  { id: 'f2', name: 'Blocked anywhere', filterSpec: { blocked: true } },
];

function renderMenu(overrides: Partial<Parameters<typeof SavedFiltersMenu>[0]> = {}) {
  const props = {
    filters: FILTERS,
    onApply: vi.fn(),
    onSaveCurrent: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<SavedFiltersMenu {...props} />);
  return props;
}

/* ------------------------------------------------------------------ *
 * Amendment 14: applying is a VIEW act.
 * ------------------------------------------------------------------ */

describe('11.112 applying a saved filter is a view act, never a data act', () => {
  /**
   * THE PLAN'S VERSION OF THIS TEST CANNOT FAIL, and it is worth saying why
   * rather than quietly writing a different one. Its draft creates
   * `const ingest = vi.fn()` and `const prefsSet = vi.fn()`, hands NEITHER to
   * the component, and then asserts both were not called. A spy nobody was
   * given is not called by construction: those two lines pass against a
   * component that ingests on every click, and against no component at all.
   *
   * What replaces them is the two halves below — the callbacks the component
   * DOES hold, asserted in both directions on the same click, and the module's
   * import list, which is what makes "no data surface" true of every render
   * rather than of this one.
   */
  it('the click calls onApply with that filter\'s spec and calls NOTHING else', () => {
    const props = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'My open work' }));
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply).toHaveBeenCalledWith(FILTERS[0]?.filterSpec);
    expect(props.onSaveCurrent).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('and the SECOND row applies the second spec — the list is indexed, not fixed at zero', () => {
    // Task 12's fix round found two mutants alive because every click in that
    // suite landed on row zero. `filter.filterSpec` and `props.filters[0]
    // .filterSpec` are indistinguishable from one row.
    const props = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Blocked anywhere' }));
    expect(props.onApply).toHaveBeenCalledWith({ blocked: true });
  });

  it('11.113 the module has NO data surface to touch — its whole world is four props', () => {
    // The structural half. `test/no-http-in-views.test.ts` already fences off
    // `fetch` and `src/online/` for every module in `src/`; what is checked
    // here is narrower and is the amendment's actual claim: this component
    // imports nothing that could reach a DataSource or a PreferencesGateway.
    // COMMENTS STRIPPED FIRST, and this is load-bearing rather than tidy: the
    // component's own docblock argues its case by NAMING `DataSource` and
    // `PreferencesGateway`, and a scan that read prose would report the
    // explanation as the defect it explains.
    const source = stripComments(readFileSync(SOURCE, 'utf8'));
    const imports = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].flatMap(
      (hit) => hit[1] ?? [],
    );
    expect(imports).toEqual(['react', '@gisik-nokma/domain']);
    // Belt and braces on the two names an import list would not catch if the
    // module ever reached them through a prop or a global.
    expect(source).not.toMatch(/DataSource/);
    expect(source).not.toMatch(/PreferencesGateway/);
    // No "the scanner found something" control is added here, and the reason
    // is worth stating rather than leaving as an omission: the equality above
    // already IS that control. An `imports` of `[]` — a regex that stopped
    // matching after a reformat — cannot satisfy `toEqual(['react',
    // '@gisik-nokma/domain'])`, so a `length > 0` line beside it would be an
    // assertion the one above subsumes, dressed as a safeguard.
  });
});

/* ------------------------------------------------------------------ *
 * Saving.
 * ------------------------------------------------------------------ */

describe('11.114 saving needs a name and hands it up', () => {
  it('the button is disabled until a name is typed, and enabled after', () => {
    renderMenu({ filters: [] });
    const button = screen.getByRole('button', { name: 'Save current filter' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter name' }), {
      target: { value: 'GST things' },
    });
    expect(button).toBeEnabled();
  });

  it('whitespace alone is not a name — the guard is trim, not length', () => {
    renderMenu({ filters: [] });
    const button = screen.getByRole('button', { name: 'Save current filter' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter name' }), {
      target: { value: '   ' },
    });
    expect(button).toBeDisabled();
  });

  it('hands up the TRIMMED name, once, and clears the input', () => {
    const props = renderMenu({ filters: [] });
    const input = screen.getByRole('textbox', { name: 'Filter name' });
    fireEvent.change(input, { target: { value: '  GST things  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save current filter' }));
    expect(props.onSaveCurrent).toHaveBeenCalledTimes(1);
    expect(props.onSaveCurrent).toHaveBeenCalledWith('GST things');
    expect(input).toHaveValue('');
    // The clear really disarms the button again, rather than leaving a stale
    // enabled control over an empty field.
    expect(screen.getByRole('button', { name: 'Save current filter' })).toBeDisabled();
  });

  it('saving is not applying and not deleting', () => {
    const props = renderMenu();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter name' }), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save current filter' }));
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('11.115 the input carries no maxLength — the name bound is stated once, in the schema', () => {
    // Deliberate: `savedFilterSchema` caps a name at 120 and `saveFilter`
    // refuses with a reason. A `maxLength` here would be a second spelling of
    // that bound whose failure mode is silent truncation.
    renderMenu({ filters: [] });
    expect(screen.getByRole('textbox', { name: 'Filter name' })).not.toHaveAttribute('maxlength');
  });
});

/* ------------------------------------------------------------------ *
 * Deleting.
 * ------------------------------------------------------------------ */

describe('11.116 deleting hands up the id', () => {
  it('the second row\'s delete names the second row', () => {
    const props = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Blocked anywhere' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith('f2');
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("and the first row's delete names the first", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Delete My open work' }));
    expect(props.onDelete).toHaveBeenCalledWith('f1');
  });

  it('every row has both affordances, named after the filter it acts on', () => {
    renderMenu();
    for (const filter of FILTERS) {
      expect(screen.getByRole('button', { name: filter.name })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Delete ${filter.name}` })).toBeInTheDocument();
    }
  });
});

/* ------------------------------------------------------------------ *
 * The empty arm.
 * ------------------------------------------------------------------ */

describe('11.117 the empty arm', () => {
  it('with no filters: the copy is shown, the list is not, and saving still works', () => {
    renderMenu({ filters: [] });
    expect(screen.getByText(SAVED_FILTERS_EMPTY_COPY)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save current filter' })).toBeInTheDocument();
  });

  it('with filters: the list is shown and the copy is NOT', () => {
    renderMenu();
    expect(screen.queryByText(SAVED_FILTERS_EMPTY_COPY)).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(FILTERS.length);
  });
});
