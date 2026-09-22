import { act, render, screen, waitFor, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// `"type": "module"`, so NodeNext resolves its types as CJS and a default
// import lands on the module namespace (no `.setup`) under this repo's
// verbatimModuleSyntax / no-esModuleInterop base config.
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, initialsOf } from '../src/components/avatar.js';
import { Button } from '../src/components/button.js';
import { Chip } from '../src/components/chip.js';
import { Dialog } from '../src/components/dialog.js';
import { InfoTip } from '../src/components/info-tip.js';
import { SegmentedControl } from '../src/components/segmented-control.js';
import { Select, type SelectOption } from '../src/select/select.js';
import { Sheet } from '../src/components/sheet.js';
import { Switch } from '../src/components/switch.js';
import { Table, type TableColumn } from '../src/components/table.js';

describe('Button', () => {
  it('defaults to the ghost variant and carries explicit variants as BEM modifiers', () => {
    render(
      <>
        <Button>Plain</Button>
        <Button variant="primary">Go</Button>
        <Button variant="danger">Discard</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveClass('gn-button--ghost');
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('gn-button--primary');
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveClass('gn-button--danger');
  });

  it('is type=button by default so forms are never submitted by accident', () => {
    render(<Button>Plain</Button>);
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveAttribute('type', 'button');
  });
});

describe('Chip', () => {
  it('renders a decorative tone dot and the label', () => {
    render(<Chip tone="blocked">Waiting on bank</Chip>);
    const chip = screen.getByText('Waiting on bank');
    expect(chip).toHaveClass('gn-chip--blocked');
    expect(chip.querySelector('.gn-chip__dot')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Avatar', () => {
  it('derives initials from first and last word', () => {
    expect(initialsOf('Anselma Marak')).toBe('AM');
    expect(initialsOf('Kiro')).toBe('KI');
  });

  it('never renders blank — an unnameable actor still shows something', () => {
    expect(initialsOf('   ')).toBe('?');
    render(<Avatar name="Anselma Marak" />);
    expect(screen.getByLabelText('Anselma Marak')).toHaveTextContent('AM');
  });
});

describe('Dialog', () => {
  it('renders with role=dialog and closes on Escape and on scrim click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open title="Reopen parent?" onClose={onClose}>
        body
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Reopen parent?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('dialog-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} title="Hidden" onClose={() => {}}>
        body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * 13.643 — the dismiss control is named `Close dialog`, so a body button that
   * says "Close" stays the only thing that name finds.
   *
   * The control's VISIBLE text is `×`, so its accessible name is whatever the
   * `aria-label` says and nothing in a screenshot or a `getByText` can tell the
   * two spellings apart — which is exactly how the collision survived until a
   * feature put a plain "Close" button (spec §5.3, the ticket sheet's Close) in
   * a dialog's body. Both the exact-name assertion and the unscoped
   * `getByRole('button', { name: 'Close' })` are load-bearing: the first pins
   * the new spelling, and the second is the one that threw "found multiple
   * elements" under the old one, so it is the assertion that FAILS for the
   * defect rather than merely describing the fix.
   */
  it('13.643 the dismiss control is named "Close dialog", leaving a body "Close" unambiguous', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onBodyClose = vi.fn();
    render(
      <Dialog open title="Close 2 tickets" onClose={onClose}>
        <button type="button" onClick={onBodyClose}>
          Close
        </button>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    // Exactly one — the body's own.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveTextContent('Close');

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBodyClose).not.toHaveBeenCalled();
  });
});

describe('Sheet', () => {
  it('is a labelled dialog panel with a close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Sheet open title="GST registration" onClose={onClose}>
        body
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'GST registration' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * 16.86 — `titleSlot` replaces the HEADING, and `title` keeps NAMING the
   * dialog.
   *
   * Both halves are asserted in one case because the tempting simplification is
   * to wire `aria-label` to the slot as well, and that version passes any case
   * that only checks the caller's node rendered. The negative — the `<h2>` is
   * GONE, not merely accompanied — is the other half: a slot that rendered
   * beside the heading would leave two titles on screen, and the sheet's own
   * header has exactly one place to put one.
   */
  it('16.86 titleSlot replaces the heading while the string still names the dialog', () => {
    render(
      <Sheet
        open
        title="File the GST return"
        onClose={vi.fn()}
        titleSlot={<input aria-label="Ticket title" defaultValue="Uncommitted" />}
      >
        body
      </Sheet>,
    );
    // The name is the STRING, not the control's value.
    expect(screen.getByRole('dialog', { name: 'File the GST return' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ticket title' })).toHaveValue('Uncommitted');
    expect(document.querySelector('.gn-sheet__title')).toBeNull();
  });
});

/**
 * P8 (case 13.1052) — `Dialog` and `Sheet` both declare `aria-modal="true"`, which tells
 * assistive tech that everything outside them is inert. Neither moved focus into
 * itself, trapped it, or restored it on close, so the claim was asserted and not
 * kept. The gap is not inert in the product either: `board.tsx:385-393` refuses a
 * column action *because* it judges the interaction to have arrived "behind a
 * modal — a keyboard-focus escape", so a workaround exists specifically for the
 * leak.
 *
 * The standard already exists in this repo, tested, on a less-used surface: the
 * project page's filters sheet moves focus in on open and returns it to the exact
 * opening control on close, asserted by 13.445/13.446. These cases bring the two
 * shared primitives up to it — focus in on open, Tab contained, focus returned to
 * the opener on a keyboard close.
 *
 * Every case opens through a real button and asserts the control that focus
 * demonstrably LEFT before asserting where it arrived, because "focus is inside
 * the dialog" is vacuously true when the opener was never focused in the first
 * place.
 */
describe('P8 — Dialog and Sheet contain focus while they claim aria-modal', () => {
  function Opener({ kind }: { kind: 'dialog' | 'sheet' }) {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Open panel
        </button>
        {kind === 'dialog' ? (
          <Dialog open={open} title="Reopen parent?" onClose={() => setOpen(false)}>
            <button type="button">Inner action</button>
          </Dialog>
        ) : (
          <Sheet open={open} title="GST registration" onClose={() => setOpen(false)}>
            <button type="button">Inner action</button>
          </Sheet>
        )}
      </div>
    );
  }

  for (const kind of ['dialog', 'sheet'] as const) {
    it(`P8: ${kind} moves focus in on open and returns it to the opener on Escape`, async () => {
      const user = userEvent.setup();
      render(<Opener kind={kind} />);
      const trigger = screen.getByRole('button', { name: 'Open panel' });
      trigger.focus();
      expect(trigger).toHaveFocus();

      await user.click(trigger);
      const panel = screen.getByRole('dialog', { name: kind === 'dialog' ? 'Reopen parent?' : 'GST registration' });
      // Control: focus really LEFT the opener — without this, "focus is inside
      // the panel" would be satisfied by a component that moved nothing.
      expect(document.activeElement).not.toBe(trigger);
      expect(panel.contains(document.activeElement)).toBe(true);

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Restored to the exact control that opened it, not to the body.
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it(`P8: ${kind} contains Tab WITHOUT swallowing a portalled popover's own focus`, async () => {
      /**
       * The interaction this batch introduced and nothing else covered.
       *
       * `contain` holds focus inside the panel, and a `Select` panel is
       * portalled to `document.body` — outside the panel in the DOM. Left alone,
       * containment reads that as an escape and drags focus back off the option
       * row.
       *
       * **Measured, not reasoned.** Removing E4-17's `FocusScope` from
       * `SelectPanel` and re-running this shape leaves focus on
       * `button.gn-select__trigger` with the option row never focused at all —
       * the picker degrades silently inside every dialog in the product. With it,
       * focus lands on `li.gn-select__option`. The mechanism is React Aria's
       * scope TREE rather than the DOM: the panel's `FocusScope` is a child of
       * the dialog's through React context, which crosses the portal, so
       * `isElementInChildScope` answers true and `contain` leaves it be.
       *
       * So the two rulings in this batch hold each other up, and that is exactly
       * the kind of coupling that breaks quietly when one half is later tidied
       * away as a redundant wrapper. This case is the wire between them.
       */
      const user = userEvent.setup();
      const onChange = vi.fn();
      const options = [
        { value: 'apple', label: 'Apple' },
        { value: 'banana', label: 'Banana' },
      ];
      const inner = (
        <>
          <button type="button">First action</button>
          <Select options={options} value={null} onChange={onChange} aria-label="Type" />
        </>
      );
      function WithPicker() {
        return kind === 'dialog' ? (
          <Dialog open title="New ticket" onClose={vi.fn()}>
            {inner}
          </Dialog>
        ) : (
          <Sheet open title="New ticket" onClose={vi.fn()}>
            {inner}
          </Sheet>
        );
      }
      render(<WithPicker />);
      const trigger = screen.getByRole('button', { name: /Type/ });
      trigger.focus();
      await user.keyboard('{Enter}');
      const listbox = await screen.findByRole('listbox');
      // Give any containment pull-back a chance to happen before reading.
      await waitFor(() => expect(listbox.contains(document.activeElement)).toBe(true));

      await user.keyboard('{ArrowDown}{Enter}');
      expect(onChange).toHaveBeenCalledWith('banana');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it(`P8: ${kind} keeps Tab inside itself`, async () => {
      const user = userEvent.setup();
      render(<Opener kind={kind} />);
      const trigger = screen.getByRole('button', { name: 'Open panel' });
      await user.click(trigger);
      const panel = screen.getByRole('dialog', { name: kind === 'dialog' ? 'Reopen parent?' : 'GST registration' });

      // The opener is the only tabbable thing outside the panel, so without
      // containment enough Tabs reach it — which is exactly the escape the
      // board refuses the interaction for.
      for (let i = 0; i < 8; i += 1) {
        await user.tab();
        expect(
          panel.contains(document.activeElement),
          `after ${i + 1} Tab(s) focus left the ${kind} for ${document.activeElement?.tagName ?? 'nothing'}`,
        ).toBe(true);
      }
    });
  }
});

describe('Table', () => {
  type Row = { id: string; title: string };
  const columns: TableColumn<Row>[] = [
    { id: 'title', header: 'Title', cell: (row) => row.title },
  ];

  it('renders headers and cells, and row clicks fire', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <Table
        columns={columns}
        rows={[{ id: 't1', title: 'File the GST return' }]}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
    await user.click(screen.getByText('File the GST return'));
    expect(onRowClick).toHaveBeenCalledWith({ id: 't1', title: 'File the GST return' });
  });
});

/**
 * 13.706 — `Table`'s per-row hook (second wave Task 4, spec §8.1).
 *
 * `rowClassName` (Ruling 21) can only say ONE class for EVERY row, and the
 * List's drag plumbing needs a fact about a row — `draggable`, the four drag
 * handlers, and a class that names which row is being dragged or hovered.
 * `rowProps` is that hook.
 *
 * **The composition rule is the whole of this case, and the negative is why.**
 * A hook that REPLACED `className` would take `gn-table__row` off a row the
 * moment a caller passed anything, and the shared stylesheet keys on that
 * class — a silently unstyled row, not an override. So the extra class is
 * APPENDED, in the same `[own, extra].filter(Boolean).join(' ')` shape
 * `Card` has used since `card.tsx:7` and Ruling 21 applied to the rest of
 * this component's hooks. The order assertion (the caller's class last) is
 * what makes "appended" a claim this case can fail on rather than a synonym
 * for "present".
 */
describe('13.706 the Table row hook appends a className and spreads per-row attributes', () => {
  type Row = { id: string; title: string };
  const columns: TableColumn<Row>[] = [{ id: 'title', header: 'Title', cell: (row) => row.title }];
  const oneRow: Row[] = [{ id: 't1', title: 'File the GST return' }];

  function bodyRow(): HTMLTableRowElement {
    const tr = screen.getByText('File the GST return').closest('tr');
    if (tr === null) throw new Error('no <tr> for the row');
    return tr;
  }

  it('a data-* attribute lands on the <tr>, and a caller className is APPENDED to the built-ins rather than replacing them', () => {
    render(
      <Table
        columns={columns}
        rows={oneRow}
        rowKey={(row) => row.id}
        rowClassName="gn-list__table-row"
        rowProps={(row) => ({ 'data-row': row.id, className: 'gn-list__row--dragging' })}
      />,
    );
    const tr = bodyRow();
    expect(tr).toHaveAttribute('data-row', 't1');
    // Presence of all three is what kills "the caller's className replaced the
    // built-ins" — the mutant would leave `gn-list__row--dragging` alone on the
    // element and both of these would fail.
    expect(tr).toHaveClass('gn-table__row', 'gn-list__table-row', 'gn-list__row--dragging');
    // Order, not just presence: APPENDED means the caller's class comes last.
    expect(tr.getAttribute('class')?.split(' ').at(-1)).toBe('gn-list__row--dragging');
  });

  it('CONTROL: with no rowProps the <tr> carries no caller attribute at all, and rowClassName still applies', () => {
    render(
      <Table
        columns={columns}
        rows={oneRow}
        rowKey={(row) => row.id}
        rowClassName="gn-list__table-row"
      />,
    );
    const tr = bodyRow();
    expect(tr).not.toHaveAttribute('data-row');
    expect(tr).toHaveClass('gn-table__row', 'gn-list__table-row');
  });
});

describe('SegmentedControl (13.288)', () => {
  it('13.288 renders role=tablist with one role=tab per option and aria-selected on exactly the chosen one', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Sign-in method"
        value="email"
        onChange={onChange}
        options={[
          { value: 'phone', label: 'Phone' },
          { value: 'email', label: 'Email link' },
        ]}
      />,
    );
    const list = screen.getByRole('tablist', { name: 'Sign-in method' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    // `!` because this repo runs `noUncheckedIndexedAccess`, so an index into
    // `getAllByRole`'s array is `HTMLElement | undefined`. The plan's literal
    // spelling typechecks nowhere in this tree, and `pnpm vitest run` cannot
    // see it — only the gate's `typecheck` task does. The length assertion two
    // lines up is what makes the `!` honest.
    const [phoneTab, emailTab] = [tabs[0]!, tabs[1]!];
    expect(phoneTab).toHaveAttribute('aria-selected', 'false');
    expect(emailTab).toHaveAttribute('aria-selected', 'true');
    expect(emailTab).toHaveClass('gn-segmented__item--on');
    expect(phoneTab).not.toHaveClass('gn-segmented__item--on');
    await userEvent.click(phoneTab);
    expect(onChange).toHaveBeenCalledWith('phone');
  });
});

/**
 * P9 (case 13.1051) — `SegmentedControl` declared full ARIA tab semantics (`role="tablist"`,
 * `role="tab"`, `aria-selected`) and implemented none of the tab keyboard model:
 * `grep -n "onKeyDown\|Arrow\|tabIndex\|aria-controls\|tabpanel"` on
 * `segmented-control.tsx` returned nothing, so a screen reader announced "tab, 1
 * of 3" and then no arrow key did anything. The reviewer's painted measurement
 * confirmed it with real key events: ArrowRight left `activeElement` on the same
 * tab, and every tab was its own Tab stop, which is the opposite of the pattern.
 *
 * The remedy here is the keyboard half: a roving `tabindex` (one stop for the
 * whole tablist, arrows within it) and Left/Right/Home/End. The `aria-controls` /
 * `tabpanel` half is NOT added, and that is a deliberate limit rather than an
 * oversight — `SegmentedControl` is a generic component with no idea what, if
 * anything, it is switching between, and the two alternatives the finding offers
 * are both wrong for part of its seven render sites: `aria-pressed` on a group of
 * buttons would misdescribe the sheet's *Details* / *History* and the help
 * browser's sections, which really do switch a panel in place. What CAN be fixed
 * without a caller's cooperation is the contract that makes the announced roles
 * usable, and that is what these cases assert.
 */
describe('P9 — SegmentedControl implements the tab keyboard model it declares', () => {
  const OPTIONS = [
    { value: 'phone', label: 'Phone' },
    { value: 'email', label: 'Email link' },
    { value: 'passkey', label: 'Passkey' },
  ];

  /** A genuinely controlled harness: the roving tabindex follows the selection, so
   *  a `vi.fn()` that never rounds the value back would freeze the whole model. */
  function Harness({ initial }: { initial: string }) {
    const [value, setValue] = useState(initial);
    return (
      <SegmentedControl
        aria-label="Sign-in method"
        value={value}
        onChange={setValue}
        options={OPTIONS}
      />
    );
  }

  const tabsOf = () => within(screen.getByRole('tablist', { name: 'Sign-in method' })).getAllByRole('tab');

  it('P9: the tablist is ONE tab stop, on the selected tab', async () => {
    const user = userEvent.setup();
    render(<Harness initial="email" />);
    const tabs = tabsOf();
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);

    // And that is what Tab actually lands on — the roving index is a claim about
    // the keyboard, so it is read off the keyboard.
    await user.tab();
    expect(tabs[1]).toHaveFocus();
  });

  it('P9: ArrowRight moves focus to the next tab and selects it', async () => {
    const user = userEvent.setup();
    render(<Harness initial="phone" />);
    const tabs = tabsOf();
    await user.tab();
    // Control, first: focus is demonstrably on the first tab, so the assertion
    // below reads a move rather than a component that never had focus.
    expect(tabs[0]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('P9: ArrowLeft from the first tab wraps to the last', async () => {
    const user = userEvent.setup();
    render(<Harness initial="phone" />);
    const tabs = tabsOf();
    await user.tab();
    expect(tabs[0]).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('P9: Home and End jump to the first and last tab', async () => {
    const user = userEvent.setup();
    render(<Harness initial="email" />);
    const tabs = tabsOf();
    await user.tab();
    expect(tabs[1]).toHaveFocus();

    await user.keyboard('{End}');
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });
});

// Not `new URL('../src/ui.css', import.meta.url)` (the plan's literal spelling):
// Vite statically rewrites that exact pattern into a dev-server asset URL, so
// under Vitest the base arrives as `http://localhost:3000/@fs/...` and
// `fileURLToPath` throws "The URL must be of scheme file" (see
// `test/helpers/colour-scan.ts`'s identical note). Resolving the path after
// converting `import.meta.url` on its own avoids the rewrite.
const UI_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui.css'), 'utf8');
/**
 * The OTHER stylesheet a rule for any of these classes could hide in.
 * `apps/web/app/layout.tsx` imports `ui.css` and then `globals.css`, so a rule
 * appended there WINS at equal specificity — which is why a "no style forks
 * this" scan over `ui.css` alone is a check that cannot fail. Case 13.893
 * (`attention-styling.test.ts:44-49`) reached the same conclusion for its own
 * class and scans both; 16.83 does the same.
 */
const GLOBALS_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/app/globals.css'),
  'utf8',
);
const rule = (selector: string): string => {
  const m = UI_CSS.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`no rule for ${selector}`);
  const body = m[1];
  // `RegExpMatchArray` is typed as `Array<string>`, not a tuple, so
  // `noUncheckedIndexedAccess` (this repo's own tsconfig) types `m[1]` as
  // `string | undefined` regardless of the regex's own single capture group
  // — TS has no way to know the group index exists from the pattern alone.
  // At RUNTIME `body` is always defined once `m` itself is non-null (the
  // pattern's one group, `([^}]*)`, matches at minimum the empty string), so
  // this can never actually throw against real CSS — but it is what turns
  // the return type into a real `string` rather than `string | undefined`,
  // so every call site (this one included) gets a genuine "selector vanished"
  // failure instead of an undefined-dereference two lines away. A `!`/`as
  // string` here would silence the compiler without that guarantee.
  if (body === undefined) throw new Error(`no rule body captured for ${selector}`);
  return body;
};

describe('R1(c) at the component layer', () => {
  /**
   * Any border declaration that actually PAINTS. `-color` and `-radius` are
   * excluded deliberately: a colour with no style and no width paints nothing,
   * and a radius is not a boundary.
   *
   * The plan shipped this as `/border:\s*1px/` for 13.289 and `/\bborder:/` for
   * 13.290, and **both were demonstrated green against a real visible border** —
   * `border: 2px solid …` beside a `border-color: transparent`, and
   * `border-left: 4px solid …` beside the inset shadow. A negative pinned to
   * one spelling of a property is not a negative about the property.
   *
   * The value is checked too, and the first draft of this regex proved why: it
   * matched `border: none` on the base `.gn-button` and went red against a rule
   * that paints nothing. **`none` and `0` are how a rule SAYS there is no
   * border**, so a guard that forbids them forbids the correct answer.
   */
  const PAINTING_BORDER =
    /border(-(top|right|bottom|left))?(-(width|style))?\s*:\s*(?!(none|0)\b)/;

  it('13.289 a ghost button renders as fill and label, with no painting border on either rule', () => {
    // BOTH rules, because what renders is the cascade: `button.tsx` always
    // emits `gn-button gn-button--ghost` together, so a boundary reintroduced
    // on the base would reach the screen while a modifier-only assertion stayed
    // green.
    expect(rule('.gn-button--ghost')).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(rule('.gn-button--ghost')).not.toMatch(PAINTING_BORDER);
    expect(rule('.gn-button')).not.toMatch(PAINTING_BORDER);
  });
  it('13.290 refusal panels carry tone as an inset fill, never a border', () => {
    // ⚠ `.gn-refusal--transport` and `.gn-refusal--editor` were BOTH MISSING
    // from this roster, and a roster that omits members is the shape this repo
    // keeps getting caught by: the property is unenforced for exactly the
    // variants nobody listed, so a future edit that gave one of them a real
    // border would go unnoticed. `--transport` has been absent since Ruling 27
    // added it (2026-09-16); `--editor` was added on 2026-09-19 and its own
    // change set is what put `--transport` back in view. Both pass — this
    // widens the roster to the whole family, it does not relax it.
    for (const s of [
      '.gn-refusal--preview',
      '.gn-refusal--server',
      '.gn-refusal--transport',
      '.gn-refusal--editor',
    ]) {
      const body = rule(s);
      expect(body, s).toMatch(/box-shadow:\s*inset 4px 0 0 var\(--gn-(warning|danger)\)/);
      expect(body, s).not.toMatch(PAINTING_BORDER);
    }
  });
  it('13.291 the field input KEEPS its border — an empty field has no label to identify it', () => {
    expect(rule('.gn-field__input')).toMatch(/border:\s*1px solid var\(--gn-border\)/);
  });

  /**
   * 13.339 — under `data-style="neo"` the empty input renders the sunken,
   * no-border treatment (Task 14 AMENDMENT rule (a), owner ruling 2026-09-09:
   * "pure neo look"). `hig`/`minimal` are UNCHANGED by this rule and keep
   * 13.291's bordered look — the override is scoped to `[data-style="neo"]`.
   *
   * **OWNER-ACCEPTED WAIVER, recorded verbatim (Task 13's measurement, the
   * neo-round ruling item 5): the sunken field's shadow edge measures 1.24
   * (light) / 1.16 (dark) — both below the 3:1 WCAG 1.4.11 floor a non-text
   * boundary owes. The owner reaffirmed "pure neo look" knowing this, so the
   * border is dropped rather than kept as a compromise.** This is the one
   * exemption from the non-text-contrast sweep the ruling authorises — no
   * other selector may drop below 3:1 on this ground.
   *
   * Two positive controls guard against `rule()`'s substring matching: the
   * neo selector and the base selector must read back DIFFERENT bodies (the
   * override selector text contains ".gn-field__input" as a substring, so a
   * regex bug could silently re-match the base rule and pass either way), and
   * `border: none` — not merely "no border declaration" — is the asserted
   * value, because the base rule's `border: 1px solid var(--gn-border)` would
   * otherwise cascade in and still paint.
   */
  it('13.339 under neo the field input is sunken and borderless — hig/minimal keep their border', () => {
    const base = rule('.gn-field__input');
    const neo = rule('[data-style="neo"] .gn-field__input');
    expect(neo, 'the neo override must be a distinct rule, not a re-match of the base').not.toBe(base);
    expect(base).toMatch(/border:\s*1px solid var\(--gn-border\)/);
    expect(neo).toMatch(/border:\s*none/);
    expect(neo).toMatch(/background:\s*var\(--gn-surface-sunken\)/);
    expect(neo).toMatch(/box-shadow:\s*var\(--gn-shadow-sunken\)/);
  });

  /**
   * 10.80 — `neo` gives `surface`/`surfaceRaised`/`surfaceSunken` the SAME
   * flat hex (`tokens.ts`'s `neoPaper`), so a "sunken" element with no shadow
   * of its own is indistinguishable from the raised surface around it —
   * exactly the gap found in `.ticket-type-list__row` and `.fields-editor__
   * row` (owner, 2026-09-10: "the text boxes... colours seem to be too
   * bright... the feel of the neumorphic elements is greatly diminished").
   * Pinned the same shape 13.339 already pins for `.gn-field__input`, so a
   * future edit that drops either override reddens here rather than only
   * being visible by eye against the running app.
   */
  it('10.80 the ticket-type row and field row are pressed-in under neo, not merely coloured', () => {
    for (const selector of ['.ticket-type-list__row', '.fields-editor__row']) {
      const base = rule(selector);
      const neo = rule(`[data-style="neo"] ${selector}`);
      expect(neo, `${selector}: the neo override must be a distinct rule, not a re-match of the base`).not.toBe(
        base,
      );
      expect(base, selector).toMatch(/background:\s*var\(--gn-surface-sunken\)/);
      expect(neo, selector).toMatch(/box-shadow:\s*var\(--gn-shadow-sunken\)/);
    }
  });

  /**
   * 16.83 — the ticket-type list's ↑/↓ reorder control.
   *
   * ## The defect this exists to keep closed
   *
   * `button.ticket-type-list__move` had NO RULE OF ITS OWN. Not "styled badly" —
   * the class appeared in `ui.css` and in `globals.css` zero times each, against a
   * positive control of `.ticket-type-list__row` in the same sweep. Two rules of no
   * class did reach it (`* { box-sizing }`, `button { font: inherit }`); the rest was
   * Chromium on the live stack measuring raw user-agent chrome: `border: 2px outset`,
   * `background: rgba(239,239,239,0.3)`, `border-radius: 0px`,
   * `font-weight: 400`, `28.2 × 29.2`. **A case asserting "it looks right" could
   * not have been written against that**, which is why the first assertion below
   * is the plain one: the rule must EXIST. That is the assertion that was
   * missing, and a class with no rule is invisible to every instrument that
   * measures a property rather than a presence.
   *
   * ## Why the rest is shape-pinned rather than colour-pinned
   *
   * The fill, the label and the radius are all ROLES, and the prototype's own
   * three styles resolve those roles differently at the token layer
   * (`fillWarmHig3`/`fillWarmNeo3`, `radii.hig.control`/`radii.neo.control`).
   * Measured in Chromium, this one unconditional rule therefore renders
   * `hig`/`minimal` at `rgba(39,58,99,0.11)` + 8px and `neo` at
   * `rgba(176,152,132,0.16)` + 14px — **the three styles for free, with no
   * `[data-style]` block.** The scan at the end asserts no such block exists, so
   * a future edit cannot quietly fork the control per style; that is 13.340's
   * argument applied to this control, and it is the POSITIVE half here for the
   * same reason it is there.
   *
   * ## The size is a RECORDED divergence, and it is pinned so it stays recorded
   *
   * The prototype draws `min-height:32px; min-width:36px` (`desktop.dc.html:3152`,
   * the shared control constant, byte-equal to the one `.gn-board-card__move`
   * was ported from at `:2501`). This rule takes **2.75rem — 44px** — because
   * the sweep in `apps/web/e2e-viewport/tap-targets.ts` holds every `button` to a
   * floor this control cannot meet: it is `inline-flex`, so the inline-in-prose
   * exemption misses it, and `DENSE_IN_LIST` does not name it. ⚠ This read
   * "sweeps every `button` against a hard 44px floor with no per-component
   * exemption" until 2026-09-20, which the declared table falsified — that table
   * IS such an exemption, which is why the clause is replaced rather than
   * re-pointed at line numbers that moved under it. That is the same
   * divergence, for the same reason, that control already made. Asserted rather
   * than merely commented: a re-transcription of the prototype's 32px is the
   * most likely future edit here, and it is the one that reddens the viewport
   * suite rather than this one.
   *
   * **It does NOT settle the owner's 2026-09-20 24px-dense-in-list ruling**, and
   * deliberately so — that ruling's second half is a WIDER checker that does not
   * exist yet, so a case pinning 24 here would be pinning a floor nothing
   * enforces. The open question is named in `ui.css`'s own block.
   */
  it('16.83 the reorder control has a rule at all, carries the shared control roles, and forks for no style', () => {
    const body = rule('.ticket-type-list__move');

    // The rule EXISTS — the whole defect. Every assertion below is about a class
    // that rendered as UA chrome precisely because this one was false.
    expect(body).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(body).toMatch(/color:\s*var\(--gn-text-accent\)/);
    expect(body).toMatch(/border-radius:\s*var\(--gn-radius-control\)/);
    expect(body).toMatch(/border:\s*none/);

    // The recorded 44px divergence, on BOTH axes, so the prototype's 36px
    // width is pinned too and not only its 32px height.
    expect(body).toMatch(/min-height:\s*2\.75rem/);
    expect(body).toMatch(/min-width:\s*2\.75rem/);
    expect(body).not.toMatch(/min-(height|width):\s*(32|36)px/);

    // The prototype's OWN disabled number for this control (`:3161-3162`),
    // not `.gn-button`'s generic 0.55 — the distinction it shares with
    // `.gn-board-card__move:disabled`.
    expect(rule('.ticket-type-list__move:disabled')).toMatch(/opacity:\s*0\.4/);

    // The pair sits BESIDE the row door, which is what the component's own
    // comment claims and what nothing honoured while `<li>` was
    // `display: list-item`: the row is `width: 100%`, so the pair rendered on
    // its own line ABOVE the row (measured: pair top 205.7, row top 234.8).
    expect(rule('.ticket-type-list__rows li')).toMatch(/display:\s*flex/);

    // 13.340's positive scan, for this control: one unconditional rule IS the
    // whole story, in every style.
    //
    // ⚠ OVER BOTH STYLESHEETS, and the second one is the one that WINS.
    // `apps/web/app/layout.tsx` imports `@gisik-nokma/ui/ui.css` and then
    // `./globals.css`, so a `[data-style]` override appended to `globals.css`
    // beats anything here at equal specificity. A scan of `ui.css` alone
    // therefore passes while the rendered control is forked — **measured, not
    // reasoned: a reviewer planted exactly that rule in `globals.css` against the
    // first version of this case and it stayed GREEN.** Case 13.893
    // (`attention-styling.test.ts:44-49`) records the identical gap and closed it
    // the same way; this case re-introduced it and now closes it too.
    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      const styleBlocks = [...css.matchAll(/\[data-style="[a-z]+"\][^{]*\{([^}]*)\}/g)];
      if (name === 'ui.css') {
        expect(
          styleBlocks.length,
          'the scan found no [data-style] block in ui.css at all — it is reading nothing',
        ).toBeGreaterThan(0);
      }
      for (const [fullMatch] of styleBlocks) {
        expect(fullMatch, `${name}: ${fullMatch}`).not.toMatch(/\.ticket-type-list__move\b/);
      }
    }

    // …AND THE BODY MUST BE DECLARED EXACTLY ONCE ACROSS BOTH, because every
    // assertion above goes through `rule()`, which answers the FIRST match only.
    // This block is appended at EOF precisely so that future edits land AFTER it,
    // so the most likely edit is one that beats `rule()`'s answer while leaving
    // every colour assertion green — **also measured: a reviewer appended a second
    // `.ticket-type-list__move { background: … }` at EOF and this case stayed
    // GREEN.** 13.893 generalises the same property for the same reason ("`ruleFor`
    // answers the FIRST rule for a name, so a later duplicate would beat the colour
    // this file pins while every assertion above stayed green").
    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      const decls = [...css.matchAll(/^\.ticket-type-list__move\s*\{/gm)];
      expect(
        decls.length,
        `${name} declares .ticket-type-list__move as a rule of its own ${decls.length} time(s)`,
      ).toBe(name === 'ui.css' ? 1 : 0);
    }
  });

  /**
   * 16.84 — the sheet footer's `Delete`, and the `‹ Previous / Next ›` pair the
   * owner ruled out.
   *
   * ## Why a CSS case exists for a control the component suite already covers
   *
   * `ticket-sheet.test.tsx`'s `16.84` proves the button is DRAWN, emits
   * `ticket.deleted`, closes and narrates. **None of that can see whether the
   * class it wears has a rule** — and 16.83 two cases up exists precisely
   * because a class with no rule renders as raw user-agent chrome while every
   * component-level assertion stays green. This control is transcribed from the
   * prototype's own (`desktop.dc.html:1372`), so it takes 16.83's shape.
   *
   * ## The ABSENCE is half the case
   *
   * The owner ruled the navigation out on 2026-09-20 and the rules went with it.
   * **A deleted rule is invisible to every instrument that measures a property
   * rather than a presence**, so the removal is asserted the same way the
   * original defect was — by requiring the rule to be GONE, which `rule()`
   * reports by throwing.
   *
   * ## Why `background: transparent` is asserted rather than described
   *
   * The prototype's control is a TRANSPARENT ground with danger INK, which is
   * NOT `.gn-button--danger` — that variant FILLS with `--gn-danger`. The two
   * are one keyword apart in the markup and visually opposite, so the pair
   * (`background: transparent` AND `color: var(--gn-danger)`) is pinned
   * together: either half alone would pass for the wrong control.
   */
  it('16.84 the Delete control has a rule of its own, and the ruled-out nav has none', () => {
    const body = rule('.gn-ticket-sheet__delete');

    // Danger INK on a transparent ground — the prototype's own pairing, and the
    // pair is asserted together (see the docblock).
    expect(body).toMatch(/color:\s*var\(--gn-danger\)/);
    expect(body).toMatch(/background:\s*transparent/);
    expect(body).not.toMatch(/background:\s*var\(--gn-danger\)/);

    expect(body).toMatch(/border:\s*none/);
    expect(body).toMatch(/border-radius:\s*var\(--gn-radius-control\)/);

    // The prototype's `min-height:44px` (`:1372`), kept in rem so it scales with
    // the reader's text size, and pinned so a re-transcription is a red rather
    // than a surprise in the viewport sweep — the same recorded divergence
    // `.gn-board-card__move` and `.ticket-type-list__move` both made.
    expect(body).toMatch(/min-height:\s*2\.75rem/);
    expect(body).not.toMatch(/min-height:\s*(32|36)px/);

    // The prototype's `justify-content:space-between`, which currently has one
    // child and is kept on purpose: it is the structure a second control lands in.
    expect(rule('.gn-ticket-sheet__footer')).toMatch(/justify-content:\s*space-between/);

    // ⛔ THE REMOVAL. `rule()` throws on a selector it cannot find, so this is the
    // assertion that the navigation is GONE rather than merely unused — and it is
    // the one that reddens if a future edit re-adds the rules without a caller.
    expect(() => rule('.gn-ticket-sheet__nav'), 'the nav rules must be gone').toThrow(
      /no rule for/,
    );

    // 13.340's positive scan over BOTH stylesheets, and the second one WINS
    // (`layout.tsx` imports `ui.css` then `globals.css`) — the gap 16.83's own
    // reviewer found by planting the fork in `globals.css` and watching it stay
    // green. Same two-sheet scan, for this control.
    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      const styleBlocks = [...css.matchAll(/\[data-style="[a-z]+"\][^{]*\{([^}]*)\}/g)];
      if (name === 'ui.css') {
        expect(
          styleBlocks.length,
          'the scan found no [data-style] block in ui.css at all — it is reading nothing',
        ).toBeGreaterThan(0);
      }
      for (const [fullMatch] of styleBlocks) {
        expect(fullMatch, `${name}: ${fullMatch}`).not.toMatch(/\.gn-ticket-sheet__delete\b/);
      }
    }

    // …AND DECLARED EXACTLY ONCE ACROSS BOTH, because `rule()` answers the FIRST
    // match only: a duplicate appended at EOF would beat the body asserted above
    // while every assertion here stayed green.
    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      const decls = [...css.matchAll(/^\.gn-ticket-sheet__delete\s*\{/gm)];
      expect(
        decls.length,
        `${name} declares .gn-ticket-sheet__delete as a rule of its own ${decls.length} time(s)`,
      ).toBe(name === 'ui.css' ? 1 : 0);
    }
  });

  /**
   * 13.340 — ghost/secondary controls keep fill + accent label as their
   * identifying signal in EVERY style, never a style-specific override that
   * strips it back to a boundary (or to nothing). 13.289 already pins this for
   * the unconditional base/ghost rules; this case is the POSITIVE scan that no
   * `[data-style="…"]` block anywhere in `ui.css` touches `.gn-button` at all
   * — so there is no style-specific path for a fill/label removal to hide in,
   * and 13.289's unconditional assertion is the whole story for every style.
   *
   * Mutation: add a `[data-style="neo"] .gn-button { background: none; }` (or
   * similar) block → this reddens, naming the style, without touching 13.289.
   */
  it('13.340 no [data-style] block overrides .gn-button in any style — 13.289 covers every style alone', () => {
    const styleBlocks = [...UI_CSS.matchAll(/\[data-style="[a-z]+"\][^{]*\{([^}]*)\}/g)];
    expect(styleBlocks.length, 'the scan found no [data-style] block at all — it is reading nothing').toBeGreaterThan(0);
    for (const [fullMatch] of styleBlocks) {
      expect(fullMatch, fullMatch).not.toMatch(/\.gn-button\b/);
    }
  });
});

describe('Select panel/option styling', () => {
  // NOTE: selectors below are passed RAW (unescaped), matching every other
  // call site of `rule()` in this file (e.g. 13.339's
  // `rule('[data-style="neo"] .gn-field__input')`) — `rule()` already
  // regex-escapes its argument internally
  // (`selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`), and that escape
  // class includes the backslash character itself. Pre-escaping the
  // selector here (`\\[`, `\\]`, `\\.`) double-escapes it into a pattern
  // that requires a literal backslash in the stylesheet text and can never
  // match real CSS — verified empirically (a raw string matches, a
  // pre-escaped one does not) before writing these.
  it('the neo panel gets shadow-only elevation, matching the row-shadow precedent', () => {
    expect(rule('[data-style="neo"] .gn-select__panel')).toMatch(/box-shadow:\s*var\(--gn-shadow-raised\)/);
  });

  it('the active/focused option row uses a focus-ring outline, not a background-fill misuse of focusRing', () => {
    expect(rule('.gn-select__option[data-focused]')).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\)/);
  });

  it('the option row background is the shared surface token, not a bespoke color', () => {
    expect(rule('.gn-select__panel')).toMatch(/background:\s*var\(--gn-surface(-raised)?\)/);
  });
});

/**
 * E4-21 (case 10.91) — independently the same defect as P23 (rules §3: the two found it
 * separately and both score in full), so the two cases are written against the
 * same corrected behaviour from different angles rather than duplicated: this
 * one owns the STYLESHEET half — that a ring exists at all, and that it carries
 * `.gn-field__input`'s own offset so the searchable and non-searchable branches
 * look identical — and P23's owns the keyboard half in `select.test.tsx`.
 *
 * The defect: `.gn-select__trigger--searchable input:focus { outline: none; }`
 * (`ui.css:2474`) is the product REMOVING the focus indicator from the one
 * control whose whole job is to be typed into. WCAG 2.2 §2.4.7 *Focus Visible*
 * is Level AA, and because the removal is the product's own declaration no
 * user-agent default can survive it. The searchable trigger is a WRAPPER `<div>`
 * around that input — the div has no `tabIndex` of its own, so the input is what
 * receives focus, which is exactly why the replacement has to be keyed on the
 * wrapper's `:focus-within` rather than on the input.
 */
describe('E4-21 — the searchable Select paints a focus ring', () => {
  const FRUIT: SelectOption[] = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
  ];

  it('E4-21: the trigger declares a :focus-within ring with .gn-field__input\'s own offset', () => {
    // `rule()` throws "no rule for …" when the selector is absent, so this is the
    // assertion that reddens while the removal has no replacement — the state the
    // finding measured. The offset is asserted, not just the outline: `.gn-field__input`'s
    // own rule carries `outline-offset: 1px` and the point of putting the ring here
    // is that the two branches of this control look the same when focused.
    const body = rule('.gn-select__trigger--searchable:focus-within');
    expect(body, `.gn-select__trigger--searchable:focus-within body: ${body}`).toMatch(
      /outline:\s*2px solid var\(--gn-focus-ring\)/,
    );
    expect(body, `.gn-select__trigger--searchable:focus-within body: ${body}`).toMatch(/outline-offset:\s*1px/);
  });

  it('E4-21: the suppression is still there and still scoped to the input alone', () => {
    // The replacement must not be bought by deleting the suppression: `:focus` on
    // the input would paint a ring on a click into a typeable field, and the
    // wrapper's ring is what should carry focus indication here.
    expect(rule('.gn-select__trigger--searchable input:focus')).toMatch(/outline:\s*none/);
  });

  it('E4-21: the class the ring is keyed on is an ancestor of the input that takes focus', () => {
    // The stylesheet half above proves the rule EXISTS; this proves it can MATCH
    // something, which a text scan cannot see — a ring keyed on a class nothing
    // wraps the focused input in is a rule that paints nowhere. `:focus-within`
    // matches only a descendant relationship, so `contains` is the precondition.
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    input.focus();
    expect(input).toHaveFocus();
    const trigger = input.closest('.gn-select__trigger--searchable');
    expect(
      trigger,
      'the focused combobox input is not inside a `.gn-select__trigger--searchable` wrapper, so the :focus-within ring can never match',
    ).not.toBeNull();
    expect(trigger?.contains(document.activeElement)).toBe(true);
  });

  it('E4-21: no later stylesheet re-declares the trigger and forks the ring away', () => {
    // `apps/web/app/layout.tsx` imports `ui.css` and then `globals.css`, so a rule
    // appended there WINS at equal specificity — the same gap this file already
    // closes for `.ticket-type-list__move`, and the reason a scan of `ui.css` alone
    // is a check that cannot fail. Both files, same invocation.
    //
    // The positive control is on the file that MUST match, and it runs first: if the
    // scan were silently reading an empty string, `globals.css`'s absence would be
    // indistinguishable from a working check that found nothing.
    expect(
      UI_CSS.includes('.gn-select__trigger--searchable'),
      'the scan cannot see .gn-select__trigger--searchable in ui.css, where it is declared — it is reading nothing',
    ).toBe(true);
    expect(
      GLOBALS_CSS.includes('.gn-select__trigger--searchable'),
      'globals.css re-declares .gn-select__trigger--searchable, which wins over ui.css by source order',
    ).toBe(false);
  });
});

/**
 * Case 13.464 — board-prototype-port Task 6, Ruling 17 (coordinator, 2026-09-16).
 *
 * `.gn-board-card`'s own literal `border-radius: 0.75rem` (12px) had the SAME
 * specificity as `.gn-card`'s (`(0,1,0)` both) and sat later in this file, so
 * it won on source order for EVERY style — pinning every board card at 12px
 * where `neo` should draw `.gn-card`'s own `--gn-radius-card` token at 20px
 * (`tokens.ts:798-801`). This is the exact shape case 13.355 already fixed
 * one surface over (`apps/web/test/neo-card-radius.test.ts`, `.gn-card.gn-invite`'s
 * literal radius tying `.gn-card`'s token) — same SHAPE of guard, mirrored
 * here rather than reinvented, but a different FILE under test: 13.355 scans
 * `apps/web/app/globals.css` because that is where `.gn-card.gn-invite` lives;
 * `.gn-board-card` is a `ui.css` selector, so this case scans `ui.css` via
 * this file's own `rule()` helper, not `globals.css`. Assert the rule STILL
 * EXISTS (it carries real padding, unlike the deleted
 * `.gn-card.gn-invite` rule 13.355 covers), and assert its body carries no
 * `border-radius` of its own, so the board card falls through to `.gn-card`'s
 * token and moves with the style axis like every other card.
 */
describe('13.464 — the board card declares no border-radius of its own (Ruling 17)', () => {
  it('.gn-board-card keeps its own padding rule but sets no border-radius', () => {
    const body = rule('.gn-board-card');
    expect(body, `.gn-board-card rule: ${body}`).toMatch(/padding:\s*0\.875rem/);
    expect(
      body.includes('border-radius'),
      `.gn-board-card reintroduced a literal radius that would out-specify nothing and tie .gn-card's by source order — ${body}`,
    ).toBe(false);
  });

  /*
   * MUTATION WITNESS. Planting exactly the regression this case exists to
   * catch — reintroducing a literal `border-radius` on `.gn-board-card` —
   * must redden the assertion above.
   */
  it('a planted literal border-radius on .gn-board-card is caught', () => {
    const mutated = UI_CSS.replace(
      '.gn-board-card { padding: 0.875rem; }',
      '.gn-board-card { padding: 0.875rem; border-radius: 0.75rem; }',
    );
    expect(
      mutated,
      'the clean baseline line was not found in ui.css — has .gn-board-card changed?',
    ).not.toBe(UI_CSS);
    const m = mutated.match(/\.gn-board-card\s*\{([^}]*)\}/);
    // Real narrowing, not a vitest assertion followed by an unguarded access:
    // `expect(m).not.toBeNull()` does not narrow `m`'s TYPE for TypeScript
    // (control-flow narrowing only follows `if`/`throw`, not a matcher call),
    // so the line below it would still see `m: RegExpMatchArray | null` and
    // `m[1]: string | undefined` under this repo's `noUncheckedIndexedAccess`
    // — exactly the shape that produced TS2532 here originally. Throwing (not
    // `!`/`as string`) makes both the type AND the failure mode honest: a
    // mutation that stops matching fails loudly at this line, naming what
    // broke, rather than satisfying the compiler while leaving a later
    // undefined-dereference for the wrong line to report.
    if (!m) throw new Error('planted literal mutation did not produce a matchable .gn-board-card rule');
    const body = m[1];
    if (body === undefined) throw new Error('matched .gn-board-card rule captured no body');
    expect(body.includes('border-radius')).toBe(true);
  });
});

/**
 * Case 13.513 — board-prototype-port Task 14, 2026-09-16. The spec's Board
 * metrics table "Card" row names `cursor:grab`; this task adds it beside the
 * drag-and-drop behaviour that makes it true (Ruling 15, cited at length in
 * `ui.css`'s own comment immediately above this selector). A CSS-binding
 * gate, the same shape `inbox-css-binding.test.tsx` already uses for
 * `gn-timeline__bar`: this only proves the RULE exists with the right body,
 * never that the class is wired onto anything real — `board-drag-drop.test.tsx`'s
 * own `13.512` is what proves `draggable="true"` (and therefore this
 * selector's match) tracks the `moves` capability rather than being always
 * on or always off.
 */
describe('13.513 — the drag cursor is keyed off the real draggable attribute, not a second class', () => {
  it('.gn-board__card-slot[draggable="true"] sets cursor: grab', () => {
    expect(rule('.gn-board__card-slot[draggable="true"]')).toMatch(/cursor:\s*grab/);
  });
});

/**
 * Case 13.523 — the whole card opens the ticket (owner request, 2026-09-17;
 * `board-card-click.test.tsx` proves the behaviour). The read-only board —
 * no `moves`, so no `draggable="true"` and no grab cursor — still needs the
 * card body to LOOK clickable now that it is. The bare `.gn-board__card-slot`
 * rule carries `cursor: pointer`; the `[draggable="true"]` rule above beats
 * it on specificity ((0,2,0) over (0,1,0)) so a draggable card keeps `grab`.
 * Same CSS-binding shape as `13.513`; `rule()`'s regex requires `\s*{`
 * straight after the selector text, so the two rules cannot be confused for
 * one another.
 */
describe('13.523 — a card that can be opened but not dragged still shows a pointer', () => {
  it('.gn-board__card-slot sets cursor: pointer, and the draggable rule keeps grab', () => {
    expect(rule('.gn-board__card-slot')).toMatch(/cursor:\s*pointer/);
    expect(rule('.gn-board__card-slot[draggable="true"]')).toMatch(/cursor:\s*grab/);
  });
});

/**
 * Case 13.551 — exclude-mode spec §4 (2026-09-17; fix round 1, same date,
 * dropped the `.gn-visually-hidden` case: the utility it gated was written
 * for a naming mechanism — a visible label span plus a sibling
 * visually-hidden suffix span — that measured RED and was replaced by
 * `aria-label` before Task 8 shipped; the CSS rule was cut alongside it as
 * YAGNI, so there is nothing left here to bind). CSS binding for the
 * tri-state choice and the strip's exclude chip: the three states are told
 * apart by ground + glyph + strike, never by colour alone. Same shape as
 * `13.513`/`13.523`: proves the rules exist with the right bodies, not that
 * they are wired — `apps/web/test/tri-state-choice.test.tsx` proves the
 * `data-mode` attribute these selectors key off.
 */
describe('13.551 — tri-state choice rules', () => {
  it("include is the accent ground with accent text", () => {
    const body = rule(".gn-filters__choice[data-mode='include']");
    expect(body).toMatch(/background:\s*var\(--gn-accent\)/);
    expect(body).toMatch(/color:\s*var\(--gn-accent-text\)/);
  });
  it('exclude strikes the LABEL through and does not reach for the danger tone', () => {
    const body = rule(".gn-filters__choice[data-mode='exclude'] .gn-filters__choice-label");
    expect(body).toMatch(/text-decoration:\s*line-through/);
    expect(rule(".gn-filters__choice[data-mode='exclude']")).not.toMatch(/--gn-danger/);
  });
  it('the row variant keeps the 44px floor', () => {
    expect(rule('.gn-filters__choice--row')).toMatch(/min-height:\s*2\.75rem/);
  });
  it('an excluded person row keeps the ROW ground, not the chip-level exclude ground (spec §4)', () => {
    expect(rule(".gn-filters__choice[data-mode='exclude']")).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(rule(".gn-filters__choice--row[data-mode='exclude']")).toMatch(/background:\s*var\(--gn-fill-quaternary\)/);
  });
});

/**
 * 13.900 — `Switch` and `InfoTip`, the two primitives the 2026-09-18 restyle
 * added to this package.
 *
 * These are the COMPONENT halves. `tokens.test.ts`'s 13.899 proves the CSS is
 * one rule set and that the two states differ; `apps/web/test/settings-page
 * .test.tsx`'s 13.895–13.897 prove the two screens wire them the way their
 * docblocks claim. Neither half is sufficient alone — the same split
 * `settings-page.test.tsx`'s own docblock records for `AppNav`/`LastProjectNav`.
 */
describe('13.900 — Switch', () => {
  it('is a real checkbox named by the label it wraps, so getByLabelText resolves to it', () => {
    render(
      <Switch checked onChange={() => {}}>
        Close tickets automatically
      </Switch>,
    );
    const control = screen.getByLabelText('Close tickets automatically');
    expect(control).toBeInstanceOf(HTMLInputElement);
    expect(control).toHaveAttribute('type', 'checkbox');
    expect(control).toHaveClass('gn-switch');
    expect(control).toBeChecked();
  });

  it('hands the caller the NEXT state, not the event', async () => {
    const onChange = vi.fn();
    render(
      <Switch checked={false} onChange={onChange}>
        Auto-close
      </Switch>,
    );
    await userEvent.click(screen.getByLabelText('Auto-close'));
    // The boolean, not a `ChangeEvent` — a caller that has to reach through
    // `event.target` is the shape `SegmentedControl` already avoids.
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps the caller\'s className alongside its own row class, and passes disabled through', () => {
    render(
      <Switch checked={false} onChange={() => {}} disabled className="gn-account__notification-row">
        A row label
      </Switch>,
    );
    // Both classes, which is what lets `/account` keep its own row layout
    // (full-width, edge-aligned) without a second switch implementation.
    expect(screen.getByLabelText('A row label').closest('label')).toHaveClass(
      'gn-switch-row',
      'gn-account__notification-row',
    );
    // The label still names the disabled control, which is the whole reason
    // the DOM keeps a real input rather than a `role="switch"` div.
    expect(screen.getByLabelText('A row label')).toBeDisabled();
  });
});

describe('13.900 — InfoTip', () => {
  it('is closed to begin with, naming its button for what it explains', () => {
    render(
      <InfoTip label="About Stale after">Tickets sat too long are called out as Stale.</InfoTip>,
    );
    const trigger = screen.getByRole('button', { name: 'About Stale after' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('opens on hover, on focus and on click, and Escape closes it', async () => {
    render(<InfoTip label="About Stale after">Tickets sat too long are called out as Stale.</InfoTip>);
    const trigger = screen.getByRole('button', { name: 'About Stale after' });
    const panelText = 'Tickets sat too long are called out as Stale.';

    await userEvent.hover(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent(panelText);
    await userEvent.unhover(trigger);
    expect(screen.queryByRole('note')).toBeNull();

    // FOCUS — the keyboard path, and the one hover cannot cover.
    act(() => trigger.focus());
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('note')).toBeNull();

    // CLICK — and this one is not redundant. `onClick` deliberately OPENS
    // rather than toggling, because a click focuses the button first, so a
    // toggling handler would read the state `onFocus` had just set and close
    // the panel again: a click that appears to do nothing. That defect is
    // exactly what this line catches.
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent(panelText);
  });
});

/**
 * §17 — the ticket sheet's `Visibility` section, styled to the prototype's row.
 *
 * ## The defect these cases exist for, MEASURED before anything was built
 *
 * Every queue row naming this item said only *"the visibility section styling"*,
 * and nobody had measured what the section already matched. Measured at
 * `534c450b`: `git grep -nE '^\s*\.gn-visibility' -- '*.css'` answered **0**,
 * against a **positive control in the same sweep path** (`.gn-filters__body` →
 * 3, same file). The single occurrence of the string anywhere in a stylesheet
 * was a COMMENT (`ui.css:4810`) naming `.gn-visibility__modes` /
 * `.gn-visibility__people` **hypothetically** — assuming they inherit a house
 * rule this file does not have. **So the section rendered as raw user-agent
 * chrome**, the identical defect class case 16.83 records for
 * `.ticket-type-list__move`. `17.001` is that case.
 *
 * ## Why `groupedRule` exists rather than `rule()`
 *
 * `rule()` (above) matches `selector\s*\{`, which a GROUPED selector cannot
 * satisfy — its first selector is followed by a comma, not a brace. Passing
 * `.gn-visibility__modes` to `rule()` does not return the wrong answer, it
 * THROWS, and a case rewritten to route around the throw would silently stop
 * asserting the thing it names. This helper takes the literal selector LIST, so
 * a grouped rule is asserted as the group it is.
 */
const groupedRule = (selectorList: string): string => {
  const m = UI_CSS.match(
    new RegExp(
      selectorList.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*') + '\\s*\\{([^}]*)\\}',
    ),
  );
  if (m?.[1] === undefined) throw new Error(`no grouped rule for ${selectorList}`);
  return m[1];
};

describe('the Visibility section is styled to the prototype row (17.001–17.005)', () => {
  /**
   * The authority is `design-system/interactive/desktop.dc.html`'s own row,
   * resolved BY CONTENT (the line numbers move): the `>Visibility</dt>` at
   * `:1207`, its `<dd>` at `:1208`, the control at `:1209`, the note at `:1210`,
   * the eyebrow at `:1213`, and `visBtnStyle`/`visDotStyle`/`visNote` defined at
   * `:3781`–`:3786`. The three parts of the row that draw the audience ROSTER —
   * the chips (`:1214`–`:1224`), the picker (`:1225`–`:1229`) and the closing
   * guest note (`:1230`) — are NOT transcribed: the owner's standing ruling on
   * `visibility` is **(a) BUILD, (b) KEEP THE RULING**, and (b) keeps the
   * explicit audience roster cut at the wire
   * (`apps/server/src/routes/tickets.ts`, *"an explicit audience ROSTER, a
   * disclosure no plan authorized"*).
   */
  it('17.001 the section has a rule AT ALL, and takes the prototype row’s own column geometry', () => {
    // This is the whole defect. Every other assertion in this describe is about
    // a class that had no rule, which is why this one is first.
    const body = rule('.gn-visibility');
    // The prototype's `rowValueB` (`:3756`), taken whole including its `gap`:
    // `display:flex; flex-direction:column; gap:4px; align-items:flex-end`.
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-direction:\s*column/);
    expect(body).toMatch(/align-items:\s*flex-end/);
  });

  it('17.002 the eyebrow and the notes carry the row’s OWN 12px scale', () => {
    // ⚠ THE 12px IS THE PROTOTYPE'S OUTLIER, MEASURED RATHER THAN ASSUMED.
    // `desktop.dc.html` carries the identical uppercase eyebrow declaration at
    // 13px/18px TWELVE times; this row's `:1213` at 12px/16px is the ONLY 12px
    // instance in the file, and the row is internally consistent about it (its
    // `visNote` at `:1210` and its closing note at `:1230` are both 12px/16px).
    // So the row has its own dense scale. The gap against
    // `.gn-comments__heading` — which transcribed the 13px/18px constant — is
    // the PROTOTYPE's divergence, and this assertion exists so that a later
    // "harmonise the two" edit reddens HERE rather than landing quietly.
    const heading = rule('.gn-visibility__heading');
    expect(heading).toMatch(/font-size:\s*0\.75rem/); // 12px
    expect(heading).toMatch(/line-height:\s*1rem/); // 16px
    expect(heading).toMatch(/text-transform:\s*uppercase/);
    expect(heading).toMatch(/letter-spacing:\s*0\.6px/);
    expect(heading).toMatch(/color:\s*var\(--gn-text-muted\)/);
    // …and the sentences are the same scale, `text-wrap:pretty` included
    // because the prototype declares it on the same line it declares the note.
    // ⚠ THE CHOICE `rule()` COULD NOT SILENTLY MAKE FOR US: the owner note is
    // grouped with the two absence sentences, so `rule('.gn-visibility__owner-note')`
    // THROWS rather than answering — a grouped selector's first member is
    // followed by a comma, not a brace. Asserting the group instead of the name
    // would let the owner note be DROPPED from the group while this case stayed
    // green, so both are asserted: the group carries the declarations, and the
    // selector list is held to naming the note.
    const sentences = groupedRule(
      '.gn-visibility__owner-note, .gn-visibility__unserved, .gn-visibility__read-only',
    );
    expect(sentences).toMatch(/font-size:\s*0\.75rem/);
    expect(sentences).toMatch(/line-height:\s*1rem/);
    expect(sentences).toMatch(/text-wrap:\s*pretty/);
    expect(sentences).toMatch(/color:\s*var\(--gn-text-muted\)/);
  });

  it('17.003 the CONTROL block opts out to the left, and the UA fieldset box is reset', () => {
    // The prototype's row is right-aligned EXCEPT its control, which carries
    // `align-self:flex-start` (`visBtnStyle`, `:3786`). That mixed geometry is
    // the authority's own, and the wrapper is what carries it — otherwise every
    // control in the block would need it separately and the next one added
    // would miss it.
    expect(rule('.gn-visibility__controls')).toMatch(/align-self:\s*flex-start/);
    // The reset `ui.css:4804` PREDICTED this selector would inherit and which
    // no rule in this file ever provided — the comment names
    // `.gn-visibility__modes`/`.gn-visibility__people` by name while the file
    // has no such rule, which is the same defect one level up.
    const fieldsets = groupedRule('.gn-visibility__modes, .gn-visibility__people');
    expect(fieldsets).toMatch(/border:\s*none/);
    expect(fieldsets).toMatch(/margin:\s*0/);
    expect(fieldsets).toMatch(/padding:\s*0/);
  });

  it('17.004 the standing line is the prototype’s control — a pill, and the dot is MODIFIER-toned', () => {
    const pill = rule('.gn-visibility__standing-mode');
    expect(pill).toMatch(/display:\s*inline-flex/);
    expect(pill).toMatch(/border-radius:\s*999px/);
    expect(pill).toMatch(/min-height:\s*2\.25rem/); // 36px — `visBtnStyle`'s own
    expect(pill).toMatch(/background:\s*var\(--gn-fill-quaternary\)/);
    // The dot defaults to the NOT-restricted tone and is flipped by a modifier,
    // so BOTH failure directions are visible in the CSS: a component that never
    // sets the modifier paints every ticket green, and one that never clears it
    // paints every ticket restricted. The component half of this case is in
    // `packages/app-core/test/views/visibility-editor.test.tsx`.
    expect(rule('.gn-visibility__dot')).toMatch(/background:\s*var\(--gn-success\)/);
    expect(
      rule('.gn-visibility__standing-mode--restricted .gn-visibility__dot'),
    ).toMatch(/background:\s*var\(--gn-restricted\)/);
  });

  it('17.005 no [data-style] block forks the section, and each rule is declared exactly ONCE', () => {
    // 13.340's positive scan, repeated for this family (the shape 16.83 uses).
    // `apps/web/app/layout.tsx` imports `ui.css` and THEN `globals.css`, so a
    // `[data-style]` override appended there WINS at equal specificity — a scan
    // of `ui.css` alone is a check that cannot fail.
    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      const styleBlocks = [...css.matchAll(/\[data-style="[a-z]+"\][^{]*\{([^}]*)\}/g)];
      if (name === 'ui.css') {
        expect(
          styleBlocks.length,
          'the scan found no [data-style] block in ui.css at all — it is reading nothing',
        ).toBeGreaterThan(0);
      }
      for (const [fullMatch] of styleBlocks) {
        expect(fullMatch, `${name}: ${fullMatch}`).not.toMatch(/\.gn-visibility\b/);
      }
    }

    // …AND EVERY SELECTOR THIS CASE ASSERTS ON IS DECLARED EXACTLY ONCE,
    // because `rule()` answers the FIRST match: an appended duplicate would
    // beat the assertions above while they all stayed green.
    //
    // ⚠ THE FIRST VERSION OF THIS HALF WAS A CHECK THAT COULD NOT FAIL FOR THE
    // FAILURE ITS OWN COMMENT NAMED, AND IT WAS MEASURED FAILING THAT WAY BY A
    // REVIEWER BEFORE THIS LINE WAS WRITTEN. It counted
    // `/^\.gn-visibility\s*\{/gm` — the BASE selector only — while the comment
    // sitting over it named `.gn-visibility__standing-mode` as the example.
    // Reviewer's mutation: append
    // `.gn-visibility__standing-mode { background: var(--gn-danger); }` at EOF
    // → **43 passed / 43, this case GREEN**, the pill repainting danger-red in
    // a browser. The negative control in the same run (appending a duplicate
    // `.gn-visibility` instead) reddened correctly, so the case COULD fail —
    // it simply did not fail for the selector its text names. **A count over
    // one member of a family is not a count over the family**, which is why the
    // list below is enumerated rather than inferred from the base selector.
    // EXACTLY the selectors `rule()` is asked for above — and nothing else.
    // The list is the assertion's own reach, not the class family: a selector
    // this case never resolves through `rule()` cannot be beaten by a duplicate
    // of itself here, so counting it would be asserting something unrelated.
    // ⚠ TWO FAMILY MEMBERS ARE DELIBERATELY ABSENT BECAUSE THEY ARE DECLARED
    // TWICE ON PURPOSE — `.gn-visibility__lockout` and `.gn-visibility__refusal`
    // each take a shared rule for the fill and a per-variant one for the inset
    // tone rule. The first draft of this list included them and the check
    // caught it on its first run (`declares .gn-visibility__lockout in 2
    // rule(s)`), which is the correct answer to the wrong question.
    const FAMILY = [
      '.gn-visibility',
      '.gn-visibility__heading',
      '.gn-visibility__standing',
      '.gn-visibility__standing-mode',
      '.gn-visibility__dot',
      '.gn-visibility__controls',
    ];
    /**
     * How many rule DECLARATIONS name this selector, counted as a member of a
     * selector LIST.
     *
     * ⚠ THE OBVIOUS SPELLING OF THIS — `^selector\s*\{` per line — IS WRONG,
     * AND IT FAILED LOUD ON ITS FIRST RUN, ON THIS FILE'S OWN CSS. A grouped
     * rule puts every member but the last on a line of its own, so
     * `.gn-visibility__refusal,` is followed on the NEXT line by
     * `.gn-visibility__people {` — and the anchored pattern counts THAT as a
     * declaration of the previous member. Measured: it reported
     * *"ui.css declares .gn-visibility__refusal as a rule of its own 2 time(s)"*
     * against CSS that declares it once. The comment is stripped first so a
     * brace inside prose cannot open a phantom prelude.
     */
    const rulePreludes = (css: string): string[] =>
      [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map((m) => m[1] ?? '');
    const declarationsOf = (css: string, selector: string): number =>
      rulePreludes(css)
        .flatMap((prelude) => prelude.split(','))
        .filter((member) => member.trim() === selector).length;

    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      for (const selector of FAMILY) {
        const decls = declarationsOf(css, selector);
        expect(
          decls,
          `${name} declares ${selector} in ${decls} rule(s)`,
        ).toBe(name === 'ui.css' ? 1 : 0);
      }
    }
    // POSITIVE CONTROL for the enumerator itself: it must SEE a selector that
    // genuinely is declared twice, or every `1` above is a scan reading nothing.
    expect(declarationsOf(`${UI_CSS}\n.gn-visibility { margin-top: 9rem; }`, '.gn-visibility')).toBe(2);
    expect(declarationsOf(UI_CSS, '.gn-visibility__no-such-class-exists')).toBe(0);
  });
});

/**
 * Case `13.1140` — E4-14 — the filter chip's remove control is a 24-px target,
 * not an 8×13 glyph wearing the control's own `cursor: pointer`.
 *
 * On Calendar and Timeline, `button.gn-project__filter-chip-remove`
 * (`aria-label="Remove filter — Closed: hidden"`) measured **8.1×13** with
 * `padding: 0`, `line-height: 13px`, `font-size: 13px` and both min sizes
 * `auto`. The chip around it is a **`<span>` with no handler**, so the whole
 * 147×26 pill reads as the target and only the × in its corner responds.
 *
 * **The one larger equivalent was checked, and it is why this is Minor rather
 * than a hard failure:** the Filters panel's own toggle behind the *Filters*
 * button is `90×35`, which arguably meets WCAG 2.5.8's *Equivalent* exception.
 * The finding is scored on the control a person reaches for, so the floor is
 * applied to it. `1.5rem` is this file's in-list floor — the same number
 * `.gn-attention__title` carries for the same reason.
 *
 * **A source scan, not a paint.** `apps/web/e2e-*` is Playwright and is not in
 * `pnpm test`; the property at issue is what the rule declares, and the
 * stylesheet is the authority on that. What the scan therefore does NOT prove
 * is the chip's own new height — see the rule's own note; that arithmetic
 * (24 + the chip's two 0.25rem paddings = 32) is stated in the rule and was
 * not measured on a running server.
 */
describe('13.1140 the filter chip remove control meets the 24-px in-list floor', () => {
  const REMOVE = '.gn-project__filter-chip-remove';

  it('13.1140 the rule declares the floor, in this file\'s own unit', () => {
    const body = rule(REMOVE);
    expect(body).toMatch(/min-width:\s*1\.5rem/);
    expect(body).toMatch(/min-height:\s*1\.5rem/);
  });

  it('13.1140 and it declares a box that HONOURS a min size', () => {
    // The load-bearing half, and the one a `min-height`-only edit would miss:
    // with `padding: 0` the element's height IS its line box, so the floor
    // needs a box that honours it. `.gn-attention__title`'s own note holds
    // this; the assertion is that min size and such a box arrive TOGETHER.
    expect(rule(REMOVE)).toMatch(/display:\s*inline-grid/);
    expect(rule(REMOVE)).toMatch(/place-items:\s*center/);
  });

  it('13.1140 the two declarations that made the GLYPH the control are still in force', () => {
    // Not a control — the pair is the negative half of the fix, asserted so a
    // later edit cannot silently undo it. `padding: 0` and `line-height: 1`
    // are what made the glyph the control in the first place; either coming
    // back is how the defect returns.
    const body = rule(REMOVE);
    expect(body).toMatch(/padding:\s*0;/);
    expect(body).toMatch(/line-height:\s*1;/);
  });
});

/**
 * Case `13.1142` — E4-7 — at phone width the ticket sheet's label column
 * collapses, so the description stops running off the sheet.
 *
 * The row is a two-column grid with a fixed `8rem` label column. At 390 px the
 * sheet body is 366.6 wide, so the value column got 224 — and the description
 * editor measured **224×3195** inside a `dd` spanning `x 178.6 → 402.7` while
 * the sheet ends at `x 390`. Words were cut mid-glyph at the right edge.
 *
 * **`1fr` is asserted TOGETHER WITH `min-width: 0`, and that pair is the whole
 * point.** A grid item's `min-width` is `auto`, so the column is floored at its
 * content's min-content width; `grid-template-columns: 1fr` alone would leave
 * the editor pushing the column back out and the fix would look applied while
 * changing nothing. **Not painted**: the rules were not measured on a running
 * server, and `apps/web/e2e-*` is Playwright, which is not in `pnpm test` —
 * what this scan proves is that the breakpoint declares them.
 */
describe('13.1142 the ticket sheet collapses its label column at phone width', () => {
  /**
   * The `@media` blocks whose header contains `query`, braces matched. Local to
   * this case because `components.test.tsx`'s `rule()` reads top-level
   * declarations only — and `ui.css` carries the phone rules in more than one
   * 40rem block, so "the 40rem block" is not a thing that exists.
   */
  const mediaBlocksContaining = (query: string, needle: string): string[] => {
    const noComments = UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks: string[] = [];
    let i = 0;
    for (;;) {
      const start = noComments.indexOf(`@media ${query} {`, i);
      if (start === -1) return blocks.filter((b) => b.includes(needle));
      let depth = 0;
      let end = noComments.length - 1;
      for (let j = noComments.indexOf('{', start); j < noComments.length; j += 1) {
        if (noComments[j] === '{') depth += 1;
        else if (noComments[j] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      blocks.push(noComments.slice(start, end + 1));
      i = end + 1;
    }
  };

  it('13.1142 the 40rem block that carries the collapse exists', () => {
    // POSITIVE CONTROL for both assertions below: without it they would fail
    // against `undefined` rather than redden on the declaration.
    expect(
      mediaBlocksContaining('(max-width: 40rem)', '.gn-ticket-sheet__field').length,
      'no 40rem block names .gn-ticket-sheet__field',
    ).toBeGreaterThan(0);
  });

  it('13.1142 the label column becomes one column AND the value can shrink', () => {
    const phone = mediaBlocksContaining('(max-width: 40rem)', '.gn-ticket-sheet__field')[0] as string;
    expect(phone).toMatch(/\.gn-ticket-sheet__field\s*\{\s*grid-template-columns:\s*1fr;/);
    expect(phone).toMatch(/\.gn-ticket-sheet__field dd\s*\{\s*min-width:\s*0;/);
  });

  it('13.1142 Full screen is withdrawn below the same width', () => {
    const phone = mediaBlocksContaining('(max-width: 40rem)', '.gn-ticket-sheet__field')[0] as string;
    // Same block as the collapse, deliberately: two breakpoints for one
    // screen's phone treatment is how they drift apart.
    expect(phone).toMatch(/\.gn-sheet__full\s*\{\s*display:\s*none;/);
  });
});

/**
 * Case `13.1144` — P2 — the board's whole-board empty state is styled, and the
 * three classes it renders stop matching nothing.
 *
 * `board.tsx` renders `gn-board gn-board--empty` (`:528`), `gn-board__empty-copy`
 * (`:490`) and `gn-board__empty-create` (`:494`). **All three had ZERO selector
 * blocks** — the only two hits for the family in this file were COMMENTS — so the
 * product's first-run call to action on an empty board was a grey outset
 * `<button>` on a neumorphic page. It is the one board empty state with no
 * styling while its per-column sibling has three rules.
 *
 * **The container borrows the COLUMN empty state's shape, and that is the design
 * decision rather than a shortcut:** the prototype draws no whole-board empty
 * state at all, so there is no drawing to fit — and two empty states on one
 * board should read as one family. That absence is recorded in `Features.md` as
 * a deliberate addition, which is what stops a later reader "correcting" it back
 * toward a prototype that has no such screen. The ACTION takes the shared
 * control constant `981aa92b` established for `.ticket-type-list__move`:
 * fill-tertiary, text-accent, control radius, no border.
 *
 * **Not painted** — what is asserted is what the rules declare.
 */
describe('13.1144 the board\'s whole-board empty state is styled', () => {
  it('13.1144 the container carries the column sibling\'s shape', () => {
    const body = rule('.gn-board--empty');
    expect(body).toMatch(/background:\s*var\(--gn-fill-quaternary\)/);
    expect(body).toMatch(/border-radius:\s*var\(--gn-radius-card\)/);
    // The sibling's own three, asserted as a family rather than one property:
    // a container that centred differently would read as a different state.
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/align-items:\s*center/);
    expect(body).toMatch(/text-align:\s*center/);
  });

  it('13.1144 the copy takes the sibling copy\'s type', () => {
    // Same numbers as `.gn-board__column-empty-copy` deliberately: the two
    // sentences are the same kind of sentence and one scale apart would show.
    expect(rule('.gn-board__empty-copy')).toMatch(/font-size:\s*0\.9375rem/);
    expect(rule('.gn-board__empty-copy')).toMatch(/color:\s*var\(--gn-text-muted\)/);
  });

  it('13.1144 the action takes the shared control constant', () => {
    const body = rule('.gn-board__empty-create');
    expect(body).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(body).toMatch(/color:\s*var\(--gn-text-accent\)/);
    expect(body).toMatch(/border-radius:\s*var\(--gn-radius-control\)/);
    expect(body).toMatch(/border:\s*none/);
    // The 44px standalone floor, the same one `.ticket-type-list__move` carries.
    expect(body).toMatch(/min-height:\s*2\.75rem/);
    // And the NEGATIVE half: a control still carrying the UA's edge is exactly
    // what this rule exists to remove, so its return is asserted against.
    expect(body).not.toMatch(/outset|inset/);
  });

  it('13.1144 the P1 bare-control reset and this rule both match, and this one is later', () => {
    // The overlap is deliberate and is pinned rather than left to be
    // rediscovered: P1 removes the UA chrome, this gives the product's own.
    // If the two rules ever swap order the action silently loses its fill.
    const resetAt = UI_CSS.indexOf('.gn-board__empty-create,\n.add-rule-menu__trigger {');
    const styledAt = UI_CSS.indexOf('.gn-board__empty-create {');
    expect(resetAt, 'the P1 grouped reset vanished').toBeGreaterThan(-1);
    expect(styledAt, 'this rule vanished').toBeGreaterThan(-1);
    expect(styledAt).toBeGreaterThan(resetAt);
  });
});

/**
 * Case `13.1147` — E4-15 (and P35, filed from the other side) — the timeline's
 * Earlier / Today / Later buttons stop wearing the browser's default bevel.
 *
 * `.gn-timeline__nav` declared a radius, a background, a colour, a font, padding
 * and a cursor — **and no `border`** — so the UA's `2px outset rgb(0,0,0)`
 * survived the rule: measured with the product's own `background:
 * rgb(241,234,227)`, `border-radius: 6px`, `padding: 3.2px 9.6px`. This is
 * outside round 1's P1 population by construction — P1 selected classes with
 * ZERO matching selector blocks and this one matched — which is the finding's
 * real lesson: *"matched a selector block"* and *"is fully styled"* are
 * different questions.
 *
 * **The assertion is the PRESENCE OF `border`, not the absence of `outset`**,
 * and the difference matters: `outset` is what the UA applies *because* the
 * declaration is missing, so a test looking for the string `outset` in a
 * stylesheet would pass on every tree, broken or fixed. What can fail is the
 * declaration.
 */
describe('13.1147 the timeline nav declares a border, so no UA bevel survives', () => {
  it('13.1147 the rule declares border: none', () => {
    expect(rule('.gn-timeline__nav')).toMatch(/border:\s*none/);
  });

  it('13.1147 and it takes the calendar nav\'s own values', () => {
    // Asserted as a PAIR with the sibling rule rather than as literals: the
    // finding's remedy is that the two views' navs agree, so a later edit that
    // re-diverges one of them is the regression to catch.
    const timeline = rule('.gn-timeline__nav');
    const calendar = rule('.gn-calendar__nav');
    for (const property of [
      /min-height:\s*2\.25rem/,
      /border:\s*none/,
      /border-radius:\s*var\(--gn-radius-control\)/,
      /background:\s*var\(--gn-fill-tertiary\)/,
      /color:\s*var\(--gn-text-accent\)/,
    ]) {
      expect(timeline, `timeline nav: ${String(property)}`).toMatch(property);
      expect(calendar, `calendar nav: ${String(property)}`).toMatch(property);
    }
  });

  it('13.1147 the family\'s other two members were already carrying it', () => {
    // P35's own observation, kept as the calibration control for the pair
    // above: `.gn-timeline__bar` and `.gn-timeline__open` declare `border:
    // none` while the nav did not, which is what made the omission an omission
    // rather than a convention.
    expect(rule('.gn-timeline__bar')).toMatch(/border:\s*none/);
    expect(rule('.gn-timeline__open')).toMatch(/border:\s*none/);
  });
});

/**
 * Case `13.1148` — E4-2 — the sheet's and the dialog's Close glyph is a
 * 44-px target, not a 21-px glyph in a transparent box.
 *
 * `button.gn-sheet__close` measured **23.59×21.20** with `padding: 1px 6px`
 * (the UA's), `min-width`/`min-height: auto`, `font-size: 19.2px` and
 * `background: rgba(0,0,0,0)` — the visible pointer control for leaving the
 * product's most-used overlay. The prototype draws a 32-px filled circle; this
 * rule takes **44**, the same divergence `.gn-sheet__full` immediately above
 * already records and for the same reason (WCAG 2.5.5 and `tap-targets.ts`
 * measure every `button`), because two controls in one header cannot answer
 * that question differently.
 *
 * **This is NOT a WCAG 2.5.8 failure in the strict sense, and the case says so
 * rather than letting the assertion imply otherwise:** the scrim
 * (`sheet.tsx:97-99`, `onClick={onClose}`) is a pointer *equivalent*, so the
 * finding's first draft — *"no other pointer control closes the sheet"* — was
 * withdrawn before the freeze. What remains is a 21-px control whose equivalent
 * is an unmarked area a person has to know about.
 *
 * **The size is asserted as a PAIR with `.gn-sheet__full`** rather than as a
 * literal, because the two sit in one header and the shared number is the
 * decision; a later edit that gave the close the prototype's 32 would redden
 * here instead of shipping two answers.
 */
describe('13.1148 the overlay dismiss control meets the 44px standalone floor', () => {
  const CLOSE = '.gn-sheet__close';

  it('13.1148 the rule declares the floor in both dimensions', () => {
    const body = rule(CLOSE);
    expect(body).toMatch(/min-width:\s*2\.75rem/);
    expect(body).toMatch(/min-height:\s*2\.75rem/);
    // And a box that honours them — the same half `.gn-attention__title`'s own
    // note makes: a UA inline-block would take a min size, but this control is
    // centred glyph in a circle, which is what `inline-flex` is for here.
    expect(body).toMatch(/display:\s*inline-flex/);
    expect(body).toMatch(/align-items:\s*center/);
    expect(body).toMatch(/justify-content:\s*center/);
  });

  it('13.1148 it takes the prototype\'s circle and fill', () => {
    const body = rule(CLOSE);
    expect(body).toMatch(/border-radius:\s*999px/);
    expect(body).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
  });

  it('13.1148 the header\'s two controls answer the size question the same way', () => {
    // The decision, asserted as a pair: both are standalone controls in the
    // sheet header, so both take 44 and neither takes the prototype's 32.
    for (const selector of [CLOSE, '.gn-sheet__full']) {
      expect(rule(selector), `${selector} min-height`).toMatch(/min-height:\s*2\.75rem/);
      expect(rule(selector), `${selector} must not take the prototype's 32px`).not.toMatch(
        /min-height:\s*2rem\b/,
      );
    }
  });

  it('13.1148 the dialog\'s close shares the rule, so both overlays get it', () => {
    // `.gn-dialog__close, .gn-sheet__close { … }` is ONE rule with two heads.
    // Asserted rather than assumed, because the fix would silently cover only
    // half the overlays if a later edit split them.
    // `rule()` cannot be used on `.gn-dialog__close` — it looks for that
    // selector immediately followed by `{`, and this head does not end a
    // selector list. The combined head's own BODY is read instead, which is
    // the same evidence: there is one body and it serves both heads.
    const noComments = UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const combined = noComments.match(/\.gn-dialog__close,\s*\.gn-sheet__close\s*\{([^}]*)\}/);
    expect(combined, 'the two overlay dismiss controls no longer share a rule').not.toBeNull();
    expect(combined?.[1]).toMatch(/min-height:\s*2\.75rem/);
    // And the sheet head resolves through `rule()`, which is what every other
    // case in this file uses — so the shared body is the one they all see.
    expect(rule(CLOSE)).toBe(combined?.[1]);
  });
});

/**
 * Case `13.1153` — E4-35 — the segmented control's items carry horizontal
 * padding, so a content-sized track does not shrink a tab to its word.
 *
 * `[role=tablist][aria-label="Filter notifications"]` on `/inbox`, 1512, owner:
 * **`All` 31×44**, `Unread` 64×44, `Mentions` 78×44, each item
 * `padding: 1px 6px` (the UA's) with `min-width: auto`. On the board the same
 * class paints 92×44 because that track FILLS its row and `flex: 1` shares the
 * free space; `div.gn-inbox__header` is `display:flex; justify-content:
 * space-between`, so the track is content-sized and `flex: 1` has nothing to
 * share. The width of a tab was the width of its word.
 *
 * **`padding: 0 1rem` and not a `min-width`, and the choice is the finding's
 * own:** the prototype's segment carries `padding:0 16px`, so the padding is
 * what the drawing asks for; a `min-width` would be a second number invented
 * beside it, and it would not scale with the label the way padding does.
 */
describe('13.1153 the segmented item carries the prototype\'s horizontal padding', () => {
  it('13.1153 the rule declares it', () => {
    const body = rule('.gn-segmented__item');
    expect(body).toMatch(/padding:\s*0 1rem/);
  });

  it('13.1153 it does not instead invent a min-width', () => {
    // The negative half, and the reason it is worth asserting: a `min-width`
    // would fix the 31px *All* tab and be wrong for every longer label — it is
    // a fixed floor where the prototype has a padding.
    expect(rule('.gn-segmented__item')).not.toMatch(/min-width/);
  });

  it('13.1153 the SHARED rule still shares free space — the board opts out elsewhere', () => {
    // The other half of the finding: `flex: 1` must survive on the SHARED rule,
    // because every container-filling site (`/sign-in`, `/inbox`) still relies
    // on it to distribute its row.
    //
    // ⚠ This comment used to read *"on the board this class paints 92×44 and
    // must keep doing so"*. That is FALSE since 2026-09-22, on the owner's
    // instruction: the board's rail is content-sized at the left of its row, as
    // the prototype draws it (`desktop.dc.html:339`, an `inline-flex` track).
    // The ASSERTION is unchanged and still correct — the shared rule keeps
    // `flex: 1`; what changed is that the board now opts out of it through
    // `.gn-project__rail` in `apps/web/app/globals.css`, beside the legal
    // pages' own opt-out. Deliberately NOT here: `rule()` above is a first-match
    // substring regex over `ui.css`, so a descendant selector ending in
    // `.gn-segmented__item {` in this file could become the very body this case
    // reads.
    expect(rule('.gn-segmented__item')).toMatch(/flex:\s*1/);
  });
});

/**
 * 3.974 — NOTHING SHADOWS THE SEGMENTED TRACK'S OWN RULE, and the guard exists
 * because the hazard is invisible to every other case in this file.
 *
 * `rule(selector)` (above) resolves a rule with `UI_CSS.match(new RegExp(...))`,
 * and **`.match()` takes the FIRST occurrence in FILE ORDER.** So any rule whose
 * selector TEXT contains this class and which sits ABOVE the real `.gn-segmented`
 * rule becomes the body `rule('.gn-segmented')` returns — a caller's override
 * answering for the component's own track.
 *
 * **MEASURED 2026-09-22, and it was not hypothetical.** The ticket sheet shipped
 * `.gn-ticket-sheet__field .gn-segmented { display: inline-flex; }` at `:2163`
 * with the real rule at `:5125`. `rule('.gn-segmented')` answered
 * `" display: inline-flex; "` — the OVERRIDE — while all 426 cases in this
 * package stayed GREEN, because every one of them queries `.gn-segmented__item`
 * and that `__item` suffix blocks the prefix match. The landmine would have
 * fired only for whoever next wrote the BARE class, which is the most natural
 * thing to write when testing this component. It was fixed by giving the caller
 * its own class (`SegmentedControlProps.className`), and this case is what keeps
 * it fixed — a comment alone is a claim with no instrument.
 *
 * Comments are stripped first, for this file's own measured reason: `ui.css` is
 * largely prose and quotes its selectors constantly, so a class merely DISCUSSED
 * in a docblock would otherwise answer here — **which is exactly what the first
 * draft of the fix's own comment did**, reintroducing the match it warned about
 * until the re-measurement caught it.
 */
describe('3.974 the segmented track is not shadowed by another selector', () => {
  /** The same strip `bare-control-coverage.test.ts` and `colour-scan.ts` apply. */
  const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

  /**
   * The rule's own SELECTOR TEXT: everything between the previous rule's closing
   * brace and this rule's opening one. For a bare rule that is WHITESPACE ONLY,
   * measured (`"\n\n\n"`, trim length 0); for a descendant form it leaves the
   * ancestor class standing there.
   */
  const selectorTextOfFirst = (css: string, className: string): string => {
    const match = stripComments(css).match(new RegExp(`\\.${className}\\s*\\{`));
    if (match === null) throw new Error(`no rule for .${className}`);
    const [before] = [stripComments(css).slice(0, match.index)];
    return (before.split('}').pop() ?? '').trim();
  };

  it('3.974 the first `.gn-segmented` rule is the bare selector, with no ancestor ahead of it', () => {
    expect(selectorTextOfFirst(UI_CSS, 'gn-segmented')).toBe('');
    // CONTROL — a PLANTED INPUT, not a second real class, because the property
    // under test is that this probe DISCRIMINATES. A reader that returned `''`
    // for everything would satisfy the line above while catching nothing, so it
    // is handed the exact shape it exists to reject and must name the ancestor
    // standing there. Two arms, so a reader that returned a NON-empty string for
    // everything fails too.
    // It reports the text BEFORE the class — the ANCESTOR — and that is the
    // useful thing to name: a failure says which selector is standing in front
    // of the track. (This expectation was `.gn-somewhere .gn-segmented` on the
    // first writing, and the probe was right: it matches AT the class, so the
    // class itself is not in the window.)
    expect(
      selectorTextOfFirst('.a { x: 1; }\n.gn-somewhere .gn-segmented { y: 2; }', 'gn-segmented'),
    ).toBe('.gn-somewhere');
    // And the same planted input with the ancestor AFTER the rule: the probe
    // reads the FIRST match in file order, so a shadow placed below the real
    // rule is harmless and must NOT be reported. This is the half that stops the
    // case demanding a stronger property than the hazard actually has.
    expect(
      selectorTextOfFirst('.gn-segmented { x: 1; }\n.gn-somewhere .gn-segmented { y: 2; }', 'gn-segmented'),
    ).toBe('');
  });
});
