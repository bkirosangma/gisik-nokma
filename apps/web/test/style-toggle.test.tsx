import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleToggle } from '../src/style-toggle.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['style'];
});

/**
 * REWRITTEN for the segmented control the owner's Appearance reference asks
 * for (2026-09-15), which takes this one picker back off the shared `Select`
 * that Phase 2 Wave A had migrated it onto. The cases below assert the same
 * properties the `Select` versions did — all three styles offered, `neo` the
 * default, `data-style` stamped on change, a stored choice restored — plus
 * the description line the reference adds.
 *
 * TWO CASES FROM THE `Select` ERA ARE DELIBERATELY GONE, not lost: the
 * DOM-nesting case (a `<p>` wrapping `Select`'s internal `<div>`) and the
 * no-enclosing-`<label>` case both existed because `Select` renders a hidden
 * native `<select>` inside a `<div>`. `SegmentedControl` renders three plain
 * `<button>`s and no hidden input, so neither defect is expressible any more.
 * The nesting guard is kept anyway, in generalised form, because it costs one
 * spy and this file is where that class of bug was last found.
 */
const tablist = () => screen.getByRole('tablist', { name: 'Style' });
const segment = (name: string) => within(tablist()).getByRole('tab', { name });

describe('StyleToggle — neo is the default, not the absence of a choice', () => {
  /**
   * Kept from the `Select` era in generalised form. `apps/web/test/setup.ts`
   * has no suite-wide console guard, so a `validateDOMNesting` warning would
   * otherwise be silent here and every test would still go green with the
   * defect live. Placed FIRST on purpose: React dedupes this warning per
   * parent/child tag pair at module scope, so it fires only on the first
   * render of an offending shape in the file.
   */
  it('never emits a DOM-nesting warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<StyleToggle />);
      const messages = consoleError.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(messages).not.toMatch(/cannot be a descendant/);
    } finally {
      consoleError.mockRestore();
    }
  });

  /**
   * 13.344, restated for the new shape: all three styles are visible at once
   * under one labelled control, and picking one stamps `data-style` on the
   * theme element. The LABELS are pinned too — the reference names them
   * "Apple HIG", "Minimal" and "Neumorphic", not the old abbreviations
   * ("HIG"/"Neu"). Mutation: drop the control's `aria-label` → RED (the
   * `tablist` lookup is by that name).
   */
  it('shows all three styles at once and sets data-style on change', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);

    const names = within(tablist())
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    expect(names).toEqual(['Apple HIG', 'Minimal', 'Neumorphic']);

    await user.click(segment('Apple HIG'));
    expect(document.documentElement.dataset['style']).toBe('hig');
    expect(segment('Apple HIG')).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * 13.345 — with nothing stored, the selected style is `neo`. Mutation:
   * default the component's initial state to `hig` → RED.
   */
  it('defaults to neo when nothing is stored', () => {
    render(<StyleToggle />);
    expect(segment('Neumorphic')).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * 13.346 — the stored style survives a reload: a stored value restores on
   * mount rather than the component starting from its own default and
   * drifting from what `layout.tsx`'s pre-paint script already applied.
   * Mutation: drop the `useEffect` that reads `localStorage` → RED.
   */
  it('a stored choice is restored on mount', async () => {
    localStorage.setItem('gn-style', 'minimal');
    render(<StyleToggle />);
    expect(await screen.findByRole('tab', { name: 'Minimal', selected: true })).toBeInTheDocument();
  });

  it('persists an explicit choice for the next mount to restore', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    await user.click(segment('Minimal'));
    expect(localStorage.getItem('gn-style')).toBe('minimal');
  });

  /**
   * The description line the reference adds under the control, and it must
   * TRACK the selection rather than being fixed copy — that is the whole
   * point of putting it there. Asserted by switching and reading it again,
   * because a static line would pass any single-state assertion. Mutation:
   * hard-code the note to one style's text → RED on the second read.
   */
  it('describes the selected style, and the description follows the selection', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    expect(screen.getByText(/^Neumorphic:/)).toBeInTheDocument();

    await user.click(segment('Minimal'));
    expect(screen.getByText(/^Minimal:/)).toBeInTheDocument();
    expect(screen.queryByText(/^Neumorphic:/)).toBeNull();
  });
});

/**
 * 23.310 / 23.311 — the third Style option is spelled "Neumorphic" (owner, 2026-10-02: *"the style section in account says
 * Neomorphic. but i think its Neumorphic right?"*). The established term is neumorphism, from "new skeuomorphism". Only the
 * user-visible spelling moves: the code value `'neo'`, `data-style="neo"`, the CSS class and token names, and the file names
 * stay as they are.
 *
 * Control, in the same `it()`: the other two labels are unchanged and the option still maps to `neo`, so the assertion cannot be
 * satisfied by renaming everything. Mutation: restore "Neomorphic" in `style-toggle.tsx` → RED on the label, the description
 * and the scan.
 */
const WEB_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(WEB_DIR, '..', '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist', 'coverage', '.turbo', 'test', 'tests', '__tests__'].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(tsx?|css|md|mdx|json)$/.test(name)) out.push(path);
  }
  return out;
}

describe('23.310 — the Style control spells its third option "Neumorphic"', () => {
  it('labels the option "Neumorphic" and keeps the other two and the `neo` value', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);

    const names = within(tablist())
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    expect(names).toEqual(['Apple HIG', 'Minimal', 'Neumorphic']);
    expect(screen.queryByRole('tab', { name: 'Neomorphic' })).toBeNull();
    expect(screen.getByText(/^Neumorphic: soft raised surfaces/)).toBeInTheDocument();

    await user.click(segment('Minimal'));
    await user.click(segment('Neumorphic'));
    expect(document.documentElement.dataset['style']).toBe('neo');
  });

  it('23.311 — no product source, manual, FAQ or generated help spells "Neomorphic"', () => {
    const roots = [
      join(REPO, 'apps', 'web', 'src'),
      join(REPO, 'apps', 'web', 'app'),
      join(REPO, 'apps', 'server', 'src'),
      join(REPO, 'packages', 'ui', 'src'),
      join(REPO, 'packages', 'app-core', 'src'),
    ];
    const files = [...roots.flatMap((root) => sourceFiles(root)), join(REPO, 'docs', 'manual.md'), join(REPO, 'docs', 'faq.md')];
    // Control: the haystack holds its subject — the very file that renders the label is in it.
    expect(files).toContain(join(REPO, 'apps', 'web', 'src', 'style-toggle.tsx'));
    const offenders = files.filter((file) => /neomorphic/i.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => file.slice(REPO.length + 1))).toEqual([]);
  });
});
