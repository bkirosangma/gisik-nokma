import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CheckIcon, RemoveIcon, SearchIcon } from '../src/select/select-icons.js';
import { Select, type SelectOption } from '../src/select/select.js';

describe('select icon glyphs', () => {
  it('render as aria-hidden inline SVGs with at least one path or circle', () => {
    for (const Icon of [CheckIcon, RemoveIcon, SearchIcon]) {
      const { container } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg?.querySelectorAll('path, circle, line').length ?? 0).toBeGreaterThan(0);
    }
  });
});

const FRUIT: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('Select — non-searchable single-select', () => {
  /**
   * 10.81 — the Field-type select renders as the shared neumorphic Select
   * (button trigger, portal panel, checkmark on the current selection)
   * instead of a native `<select>`.
   */
  it('shows the placeholder when value is null, opens on click, and selects on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select options={FRUIT} value={null} onChange={onChange} placeholder="Pick a fruit" aria-label="Fruit" />,
    );
    const trigger = screen.getByRole('button', { name: /Fruit/ });
    expect(trigger).toHaveTextContent('Pick a fruit');
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Banana' });
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('shows the placeholder rather than throwing when value matches no option', () => {
    render(<Select options={FRUIT} value="durian" onChange={vi.fn()} placeholder="Pick a fruit" aria-label="Fruit" />);
    expect(screen.getByRole('button', { name: /Fruit/ })).toHaveTextContent('Pick a fruit');
  });

  it('shows a checkmark on the currently selected option when open', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value="banana" onChange={vi.fn()} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    const selected = await screen.findByRole('option', { name: 'Banana' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.querySelector('svg')).not.toBeNull();
  });

  it('opens with the keyboard (Enter), navigates with ArrowDown, and selects with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} aria-label="Fruit" />);
    const trigger = screen.getByRole('button', { name: /Fruit/ });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is disabled when disabled is true', () => {
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} disabled aria-label="Fruit" />);
    expect(screen.getByRole('button', { name: /Fruit/ })).toBeDisabled();
  });
});

describe('Select — non-searchable focus restoration', () => {
  /**
   * E4-17 — both keyboard close paths of the non-searchable `Select` used to end
   * with `document.activeElement === body`: Enter opens the listbox and DOM-focuses
   * an option row inside a `document.body` portal, so when the panel unmounts the
   * focused node is removed with it and the browser drops focus to the document
   * root. `SelectPanel` now wraps its content in `<FocusScope restoreFocus>` — the
   * React Aria primitive the finding names — which restores the element that had
   * focus when the scope mounted, i.e. the trigger.
   *
   * The control comes FIRST in each test, on purpose: it asserts the open path
   * really did move focus into the option row, so the closing assertion that
   * follows is a reading of a component that demonstrably *can* move focus here —
   * not a passing assertion about a control that never focuses anything.
   */
  it('E4-17: Escape returns focus to the trigger, not <body>', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} aria-label="Fruit" />);
    const trigger = screen.getByRole('button', { name: /Fruit/ });

    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    const listbox = await screen.findByRole('listbox');
    // Control: the open path moved DOM focus off the trigger and into the row.
    expect(listbox.contains(document.activeElement)).toBe(true);
    expect(trigger).not.toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // `FocusScope` restores inside a `requestAnimationFrame`, so the settle is async.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('E4-17: picking with Enter returns focus to the trigger, not <body>', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} aria-label="Fruit" />);
    const trigger = screen.getByRole('button', { name: /Fruit/ });

    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    const listbox = await screen.findByRole('listbox');
    // Control: same open path as above, this time followed by a commit.
    expect(listbox.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('apple');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

/**
 * P23 — the same defect E4-21 fixes, found independently by a second reviewer
 * and scored in full on its own (rules §3). The two cases read it from opposite
 * ends so neither is a restatement of the other: E4-21 owns the stylesheet half
 * in `components.test.tsx` (that the ring exists, its offset, and that the class
 * it is keyed on is an ancestor of the focused input). This one owns the half a
 * person actually operates — that real keyboard focus reaches that input and
 * stays there for the whole interaction, so the `:focus-within` the ring depends
 * on is matched for the duration and not just at the instant of focus — and it
 * asserts the finding's own claim as a PAIR: an outline removed by the product's
 * own CSS, beside the replacement that exists for it.
 */
describe('Select — searchable trigger focus visibility (P23)', () => {
  const UI_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui.css'), 'utf8');

  it('P23: the stylesheet that removes the input outline declares a replacement for it', () => {
    // The finding's whole argument is this pair, so assert it as one: a removal
    // with no replacement is the defect, and a replacement added by DELETING the
    // removal is a different control (an outline on a click into a typeable
    // field). Both halves, read from the same stylesheet in the same assertion.
    const removal = UI_CSS.match(/\.gn-select__trigger--searchable input:focus\s*\{([^}]*)\}/);
    const replacement = UI_CSS.match(/\.gn-select__trigger--searchable:focus-within\s*\{([^}]*)\}/);
    expect(
      removal,
      'the input-outline removal this finding rests on is gone from ui.css — the pair can no longer be read',
    ).not.toBeNull();
    expect(removal?.[1]).toMatch(/outline:\s*none/);
    expect(
      replacement,
      'the removal is still there and the searchable trigger declares no focus ring in its place — exactly the state the finding measured',
    ).not.toBeNull();
    expect(replacement?.[1]).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\)/);
  });

  it('P23: real keyboard focus lands on the input inside the ring-carrying wrapper and stays there', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });

    // Reached by keyboard, not by a `.focus()` call: this is the path a person
    // uses, and it is the path the finding's CDP `press_key` measurement used.
    await user.tab();
    expect(input).toHaveFocus();

    const trigger = input.closest('.gn-select__trigger--searchable');
    expect(
      trigger,
      'the focused combobox input is not inside a `.gn-select__trigger--searchable` wrapper, so a ring keyed on its :focus-within can never match',
    ).not.toBeNull();
    expect(trigger?.contains(document.activeElement)).toBe(true);

    // And it keeps matching while the control is USED, which is the half a
    // static shape check cannot see: typing filters the list without focus
    // leaving the input for the portalled panel.
    await user.type(input, 'cher');
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Cherry' })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(trigger?.contains(document.activeElement)).toBe(true);
  });
});

describe('Select — searchable', () => {
  /**
   * 10.82 — the Workflow select renders as the shared Select in searchable
   * mode: the trigger is a typeable combobox showing the current workflow's
   * name, and typing filters the list.
   */
  it('renders the trigger as a combobox input showing the selected label', () => {
    render(<Select options={FRUIT} value="banana" onChange={vi.fn()} searchable aria-label="Fruit" />);
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveValue('Banana');
  });

  it('typing filters the option list', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.type(input, 'cher');
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Cherry' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument();
  });

  it('selecting an option calls onChange and closes the panel', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Apple' }));
    expect(onChange).toHaveBeenCalledWith('apple');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // The two tests above use a bare `vi.fn()` for `onChange`, which never feeds the selection
  // back in as a new `value` prop — the fire-and-forget path `closeOnSelectRef` (select.tsx)
  // exists for. A real consumer (e.g. Task 5's Field-type editor) is fully controlled: it
  // round-trips `onChange` into a new `value` on the next render. This test covers that path,
  // which exercises `useComboBoxState`'s OWN post-selection effect (closeMenu + resetInputValue
  // once `displayValue` actually changes) running *alongside* `closeOnSelectRef`'s synchronous
  // close, to confirm the two don't fight (double-close, or a spurious reopen from the
  // `inputValue !== lastValue` open-on-change branch racing the value update).
  it('closes and shows the new label when the caller round-trips onChange into a new value', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<string | null>(null);
      return <Select options={FRUIT} value={value} onChange={setValue} searchable aria-label="Fruit" />;
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Apple' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Apple');
  });

  // Task 7.5: clicking the trigger while it's already focused (but its panel is closed — e.g.
  // right after a prior selection) must reopen the panel. Root cause: `useComboBox`'s
  // `inputProps.onFocus` early-returns when `state.isFocused` is already `true`, and a click on
  // an element that never lost focus doesn't fire a new native `focus` event at all — so the
  // `menuTrigger: 'focus'` open path this component otherwise relies on never re-fires on a
  // second click. No `buttonRef` is wired into `useComboBox` either, so its `onPress`/
  // `onPressStart` toggle handlers (meant for a separate trigger button) never reach any
  // rendered element here.
  it('clicking the trigger again reopens the panel after a selection closed it', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Apple' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(input);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  // A second, independent close path: Escape closes via `state.revert()`
  // (commitSelection/commitCustomValue), never moving focus off the input at all — unlike the
  // select-an-option path above, where focus visibly leaves for the clicked option and returns.
  // If `state.isFocused` staying `true` across the close is really what defeats the next
  // `focus` event (this file's other reopen test's inline comment infers that mechanism from
  // the source, without measuring it directly), this is the purest reproduction of it: focus
  // never moves at all, so the next click's `focus` event is unambiguously a no-op on the
  // `state.isFocused` check, with nothing else (like a real blur/refocus) that could coincidentally
  // make the fix look like it's working. A second, independently-shaped test passing here is
  // stronger evidence the `onClick` fix is the right lever than one passing test alone.
  it('clicking the trigger again reopens the panel after Escape closed it', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(input);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  // A third isOpen false->true transition beyond the click/Tab-focus paths the two tests above
  // cover, flagged in review of the I2 fix below and checked here rather than taken on trust:
  // Escape closes without blurring (state.isFocused stays true — see the comment on the
  // non-searchable Escape test), so the input is closed-but-focused afterward, and the very next
  // keystroke reopens the panel via `useComboBoxState`'s OWN `open(null, 'input')` path (its main
  // effect, `isFocused && ... && inputValue !== lastValue`). If the I2 fix below were keyed on
  // isOpen transitioning true with no further guard, this transition would fire it too and
  // `setInputValue('')` could eat the keystroke that caused the open. This test proves the final
  // typed value survives intact; see the "MEASURED, NOT EXPLAINED" comment on the I2 fix itself
  // (`select.tsx`) for why no claim is made here about *why* — an earlier version of this comment
  // asserted a specific render-ordering explanation for that, which did not reconcile with what
  // was actually instrumented and has been retracted, not just from that comment but from here too.
  it('typing after Escape closed the panel keeps the typed filter text', async () => {
    const user = userEvent.setup();
    render(<Select options={FRUIT} value={null} onChange={vi.fn()} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.type(input, 'cher');
    expect(input).toHaveValue('cher');
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Cherry' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument();
  });

  // The more spec-relevant shape of the same concern: typing immediately after a selection, never
  // blurring in between (no reopen click, no Tab). After a selection, `resetInputValue()` puts the
  // picked label back in the input and closes the panel, but focus never leaves — so this is the
  // "closed but focused, box already has a real label" starting state, closer to what I2's fix is
  // actually for than the Escape-with-nothing-selected shape above. Multi-character (not a single
  // keystroke) and asserts the resulting filter actually narrows the list — a second-character
  // loss, or a filter still matched against the stale "Banana" text underneath, would both be
  // invisible to a single-character check.
  it('typing immediately after a selection (no blur) does not lose characters, and the fresh filter narrows the list', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<string | null>(null);
      return <Select options={FRUIT} value={value} onChange={setValue} searchable aria-label="Fruit" />;
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Banana' }));
    expect(input).toHaveValue('Banana');
    await user.type(input, 'app');
    expect(input).toHaveValue('app');
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Apple');
  });

  // Real, reproduced bug (found by an external peer session, independently confirmed here):
  // pressing Enter to commit a keyboard-driven selection throws
  // `TypeError: Cannot read properties of undefined (reading 'href')` and never commits. Root
  // cause, confirmed by reading the installed react-aria source
  // (`@react-aria/combobox`'s `useComboBox.mjs`, its `Enter` shortcut handler): once a real key is
  // focused, it reads `state.collection.getItem(focusedKey)?.props.href` — the `?.` only guards
  // `collectionItem` itself being `null`, not `.props` being `undefined`. `buildCollection()`
  // (this file's own workaround for the missing `Item`/`@react-stately/collections` dependency,
  // from Task 3) builds plain nodes with no `.props` field at all, so `collectionItem.props` is
  // `undefined` for every focused item and `.href` on `undefined` throws.
  //
  // `{ArrowDown}` before `{Enter}` is load-bearing: with nothing focused yet,
  // `state.selectionManager.focusedKey != null` short-circuits before the buggy branch is ever
  // reached, so a bare `{Enter}` alone doesn't reproduce the crash. Measured directly against
  // unfixed code (a throwaway repro, not just the coordinator's report): a bare `{Enter}` neither
  // throws nor logs a `console.error` — `onChange` simply stays at 0 calls, which looks like a
  // *different*, milder bug. Only `{ArrowDown}` first sets a real focused key and reaches the
  // `.props.href` read.
  it('selecting an option with ArrowDown then Enter calls onChange (does not throw)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('apple');
  });

  // Companion coverage for the sibling `Tab` shortcut handler in the same file, which reads the
  // identical `collectionItem?.props.href` pattern (confirmed in source) and would throw for the
  // same reason on the same missing `.props` field. The fix is the same one-line change
  // (`buildCollection` gaining `props: {}`), so this asserts Tab's own commit-and-close behavior
  // rather than merely "doesn't throw" — a non-throwing Tab that still failed to commit would be
  // a different bug wearing the same clothes.
  it('selecting an option with ArrowDown then Tab calls onChange and closes the panel (does not throw)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={FRUIT} value={null} onChange={onChange} searchable aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Tab}');
    expect(onChange).toHaveBeenCalledWith('apple');
  });

  // Real, reproduced bug (found by the final whole-branch review, independently confirmed here):
  // after typing a filter, selecting an option, and reopening the panel, the listbox showed only
  // the filtered subset from the earlier search, not the full option list — until the user
  // manually cleared the input text. Root cause, confirmed by reading the installed
  // `useComboBoxState.mjs`: `open(focusStrategy, trigger)` computes `displayAllItems = trigger
  // === 'manual' || (trigger === 'focus' && menuTrigger === 'focus')`. The reopen-click handler
  // below (Task 7.5's fix) called `comboState.open()` with no `trigger` argument, so
  // `displayAllItems` stayed `false` and the reopened panel kept rendering the stale filtered
  // collection — even though the input still displays the selected option's full label (from
  // `resetInputValue()`), which is exactly the text that was still filtering the list.
  //
  // Reuses the `Controlled` wrapper pattern from the round-trip test above, since the stale
  // label only persists once `onChange` is actually round-tripped back in as a new `value` — a
  // bare `vi.fn()` never updates the input's displayed text, so it wouldn't reproduce this at
  // all.
  it('reopening after a filtered selection shows the full option list, not the stale filtered one', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<string | null>(null);
      return <Select options={FRUIT} value={value} onChange={setValue} searchable aria-label="Fruit" />;
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.type(input, 'cher');
    await user.click(await screen.findByRole('option', { name: 'Cherry' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(input);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Apple' })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Banana' })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Cherry' })).toBeInTheDocument();

    // The fix's mechanism (`open(null, 'focus')`) sets `useComboBoxState`'s internal
    // `showAllItems` flag to `true`, which is a different thing from the assertion above — this
    // checks that flag doesn't get stuck on and defeat a *fresh* filter typed into the reopened
    // panel. Confirmed by reading the same source: its main effect resets `setShowAllItems(false)`
    // whenever `inputValue !== lastValue`, i.e. on the very next keystroke — independently
    // verified here with a throwaway repro before adding this as a permanent assertion, not just
    // inferred from the source.
    await user.clear(input);
    await user.type(input, 'ban');
    const refiltered = await screen.findByRole('listbox');
    const refilteredOptions = within(refiltered).getAllByRole('option');
    expect(refilteredOptions).toHaveLength(1);
    expect(refilteredOptions[0]).toHaveTextContent('Banana');
  });

  // I2 (final whole-branch review, deliberately parked at the time — the owner has since ruled
  // "fix both now"): per the approved design spec, the searchable trigger's input should clear to
  // an empty filter box when its panel opens, not keep showing the previously-selected label —
  // e.g. select "Banana", close, reopen: the input should read empty and ready for a fresh
  // filter, not still show "Banana". Single-select only — `useComboBoxState`'s `selectedKey` is
  // always `null` in `selectionMode: 'multiple'` (confirmed by reading its source), so
  // `resetInputValue()`'s `itemText` is already `''` there; multi-select's input is already empty
  // except while actively typing.
  //
  // This test covers the reopen-VIA-CLICK path: Task 7.5/12.6's own `onClick` handler
  // (`comboState.open(null, 'focus')`) already reopens the panel; before this fix it left the old
  // selected label sitting in the input, which is exactly the stale text I1's own fix (Task 12.6)
  // relied on `showAllItems` (not the input text) to work around.
  it('reopening via click after a selection clears the input to an empty filter box', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<string | null>(null);
      return <Select options={FRUIT} value={value} onChange={setValue} searchable aria-label="Fruit" />;
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Banana' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Banana');
    await user.click(input);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  // The OTHER path that can reopen the panel with a stale selected label still showing: focusing
  // the trigger via Tab after it was previously blurred (panel closed, nothing clicked). Unlike
  // the click path above, this goes entirely through `useComboBox`'s own `inputProps.onFocus` →
  // `comboState.setFocused(true)` → the library's OWN internal `menuTrigger === 'focus'` open call
  // (`useComboBoxState.mjs`, `setFocused`, confirmed by reading the installed source: `if
  // (menuTrigger === 'focus' && !props.isReadOnly) open(null, 'focus')`) — none of this
  // component's own code runs on this path at all, so a fix wired only into the `onClick` handler
  // above would miss it entirely. A preceding button gives `user.tab()` a real place to move focus
  // from.
  it('reopening via Tab focus after a selection clears the input to an empty filter box', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <>
          <button type="button">before</button>
          <Select options={FRUIT} value={value} onChange={setValue} searchable aria-label="Fruit" />
        </>
      );
    }
    render(<Controlled />);
    const before = screen.getByRole('button', { name: 'before' });
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Banana' }));
    expect(input).toHaveValue('Banana');
    await user.click(before);
    expect(input).not.toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  // Traced by reading `useComboBoxState.mjs` and `useControlledState.mjs` directly (installed
  // react-stately@3.50.0 source, not assumed): clearing `inputValue` to `''` on open runs straight
  // into the library's own main effect branch `if (selectionMode === 'single' && inputValue ===
  // '' && (props.inputValue === undefined || value === undefined)) setValue(null)` (~line 198) —
  // `props.inputValue` is always `undefined` here (this component never passes it), so the guard
  // holds regardless of `value`. `setValue(null)` → `setControlledValue(null)` →
  // `useControlledState`'s setter, confirmed by reading ITS source: since the combobox's `value`
  // is controlled (this component always passes `value: props.value`), `Object.is(valueRef
  // .current, null)` is false whenever something is actually selected, so it DOES call this
  // component's own `onChange` wrapper with `keys: null`. But that wrapper's own `if (key !=
  // null)` guard (select.tsx, both single-select `onChange` handlers) swallows it before it ever
  // reaches the real consumer `onChange` prop — confirmed here empirically against a real
  // controlled consumer, not just the source trace.
  it('reopening a single-select panel does not call the consumer onChange during the reopen itself', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState<string | null>('banana');
      return (
        <Select
          options={FRUIT}
          value={value}
          onChange={(v) => {
            onChange(v);
            setValue(v);
          }}
          searchable
          aria-label="Fruit"
        />
      );
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    expect(input).toHaveValue('Banana');
    await user.click(input);
    await screen.findByRole('listbox');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Select — multiple', () => {
  /**
   * 10.83 — Select's multi-select mode: selected options render as
   * removable chips, hitting `maxSelected` shows an aria-live message
   * rather than disabling remaining options. No live call site yet; proven
   * at the component level, per the Phase 1 spec's decomposition.
   */
  it('renders selected values as chips with a remove button each', () => {
    render(<Select multiple options={FRUIT} value={['apple', 'banana']} onChange={vi.fn()} aria-label="Fruit" />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Remove /ig })).toHaveLength(2);
  });

  it('clicking a chip’s × removes it from value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select multiple options={FRUIT} value={['apple', 'banana']} onChange={onChange} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: 'Remove Apple' }));
    expect(onChange).toHaveBeenCalledWith(['banana']);
  });

  it('Backspace removes the last chip when the filter text is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select multiple searchable options={FRUIT} value={['apple', 'banana']} onChange={onChange} aria-label="Fruit" />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['apple']);
  });

  it('selecting an option adds it to value without removing existing selections', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select multiple options={FRUIT} value={['apple']} onChange={onChange} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    await user.click(await screen.findByRole('option', { name: 'Cherry' }));
    expect(onChange).toHaveBeenCalledWith(['apple', 'cherry']);
  });

  // The test above uses a bare `vi.fn()`, so `value` never round-trips — it doesn't actually
  // exercise a real controlled consumer picking a SECOND option in the same open/close cycle,
  // which is the defining multi-select behavior (`shouldCloseOnSelect` defaults to `false` for
  // `selectionMode: 'multiple'`, verified by reading `useSelectState`'s source, not assumed).
  // A genuinely controlled wrapper proves the panel really stays open across two picks and that
  // both land in the final value, rather than merely that one `onChange` call had the right shape.
  it('the panel stays open across multiple picks with a genuinely controlled value (non-searchable)', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<string[]>(['apple']);
      return <Select multiple options={FRUIT} value={value} onChange={setValue} aria-label="Fruit" />;
    }
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    await user.click(await screen.findByRole('option', { name: 'Cherry' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Banana' }));
    // Not `getByText('Apple')` etc.: the panel legitimately stays open (that's what this test is
    // proving) with all three options now shown as selected — each option row's own label text
    // duplicates the chip's, so an unscoped text query is ambiguous by design once the panel
    // stays open. Chip remove buttons ("Remove X") are unique to chips, so they're what actually
    // proves three chips rendered rather than merely that the panel shows three selections.
    expect(screen.getByRole('button', { name: 'Remove Apple' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Cherry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Banana' })).toBeInTheDocument();
  });

  // Same proof for the searchable branch, where staying open across picks depends on an extra
  // piece of logic beyond the hook's own default: `closeOnSelectRef` (select.tsx) is gated on
  // `!props.multiple` specifically so it never force-closes the panel after a pick. This is the
  // more delicate of the two branches to get right — a wrong gate would force-close after every
  // single pick, defeating multi-select entirely, and only a controlled round-trip would show it.
  //
  // `{ hidden: true }` on the final `getByRole` calls, not the plain form the non-searchable
  // version above uses — a real, verified finding, not a test-scoping convenience:
  // `useComboBox`'s own `inputProps`/popover wiring runs react-aria's `ariaHideOutside` while
  // the panel is open, which sets `aria-hidden="true"` on anything outside the specific
  // `[inputRef, popoverRef]` pair it was told to keep visible — including these chips, which are
  // plain siblings of the `<input>` inside the same trigger, not wrapped by anything on that
  // list. Confirmed by inspecting the rendered DOM directly: the chip `<span>`s carry
  // `aria-hidden="true"` while `comboState.isOpen` is true (the `<input>` itself does not).
  // `{ hidden: true }` tells `getByRole` to include aria-hidden elements, so this still proves
  // the three chips rendered with the right structure/labels — but a *default* (accessibility-
  // respecting) query would not find them right now, which is the real, current behavior for a
  // screen-reader user while the panel is open, not an artifact of the test. See the report for
  // why this is flagged as a finding rather than fixed in this task.
  it('the panel stays open across multiple picks with a genuinely controlled value (searchable)', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState<string[]>(['apple']);
      return <Select multiple searchable options={FRUIT} value={value} onChange={setValue} aria-label="Fruit" />;
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Cherry' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Banana' }));
    expect(screen.getByRole('button', { name: 'Remove Apple', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Cherry', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Banana', hidden: true })).toBeInTheDocument();
  });

  it('stale values not present in options are silently dropped from the chip list', () => {
    render(<Select multiple options={FRUIT} value={['apple', 'durian']} onChange={vi.fn()} aria-label="Fruit" />);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('durian')).not.toBeInTheDocument();
  });

  it('hitting maxSelected shows an aria-live message and further picks are no-ops, not disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select multiple options={FRUIT} value={['apple', 'banana']} onChange={onChange} maxSelected={2} aria-label="Fruit" />,
    );
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    const cherry = await screen.findByRole('option', { name: 'Cherry' });
    expect(cherry).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(cherry);
    expect(onChange).not.toHaveBeenCalled();
    const message = await screen.findByText('Max 2 selected');
    expect(message.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  // I3 (final whole-branch review, T1 finding): `SelectChip`'s remove button never received
  // `props.disabled` from either enclosing scope, so a disabled multi-select's chips stayed
  // clickable. No `disabled` test existed for `multiple` mode in any branch before this — one
  // case per branch (non-searchable/searchable), since the chip markup and the disabled-threading
  // call site are separate code in each.
  it('disables chip remove buttons when the select itself is disabled (non-searchable)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select multiple options={FRUIT} value={['apple']} onChange={onChange} disabled aria-label="Fruit" />);
    const remove = screen.getByRole('button', { name: 'Remove Apple' });
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables chip remove buttons when the select itself is disabled (searchable)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select multiple searchable options={FRUIT} value={['apple']} onChange={onChange} disabled aria-label="Fruit" />,
    );
    const remove = screen.getByRole('button', { name: 'Remove Apple' });
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(onChange).not.toHaveBeenCalled();
  });
});

const WITH_ICONS: SelectOption[] = [
  { value: 'apple', label: 'Apple', icon: <span data-testid="apple-icon" />, description: 'A crisp fruit' },
  { value: 'banana', label: 'Banana' },
];

describe('Select — option icon and description', () => {
  // The brief's Step 1 sketch queries the trigger with an EXACT name ('Fruit'). That can never
  // match: `useSelect`'s trigger concatenates the placeholder/selected-value text with the given
  // `aria-label` into its accessible name (Task 3's Ruling F2 — confirmed here again directly,
  // not just cited: the rendered button's computed name is "Select… Fruit", not "Fruit" — see
  // this task's report), which is exactly why every OTHER test in this file that queries this
  // same trigger button uses a regex (`/Fruit/`), never an exact string, and why Task 5's
  // `pickFromSelect` test helper does the same for the Field-type consumer. Using `/Fruit/` here
  // matches that established, necessary pattern rather than the brief's one-off exact string —
  // unrelated to and unaffected by Task 9's actual scope (SelectOptionRow's icon/description
  // rendering), which is what these tests are actually verifying.
  it('renders an option’s icon and description when provided', async () => {
    const user = userEvent.setup();
    render(<Select options={WITH_ICONS} value={null} onChange={vi.fn()} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    // Exact name match, not `/Apple/` — deliberately, to prove the description does NOT get
    // folded into the option's accessible name. `useOption` wires `aria-labelledby`/
    // `aria-describedby` via `useSlotId()`, which resolves to a real id only if `labelProps`/
    // `descriptionProps` are actually spread onto an element in the DOM (confirmed by reading
    // react-aria@3.52.1's `useOption.mjs`/`useId.mjs`); without that wiring, the accessible name
    // falls back to full text content and this exact query would see "Apple A crisp fruit"
    // instead of "Apple" (empirically reproduced before `SelectOptionRow` spread `labelProps`/
    // `descriptionProps` onto their spans). A regex here would pass either way and silently miss
    // a regression — the description is supposed to be an ARIA *description*, not part of the
    // name, per the same accessible-name contract `apps/web/e2e-stack/accessible-names-baseline
    // .json` (Task 0's gate) exists to protect.
    const apple = await screen.findByRole('option', { name: 'Apple' });
    expect(within(apple).getByTestId('apple-icon')).toBeInTheDocument();
    expect(within(apple).getByText('A crisp fruit')).toBeInTheDocument();
  });

  it('an option with neither icon nor description renders without error', async () => {
    const user = userEvent.setup();
    render(<Select options={WITH_ICONS} value={null} onChange={vi.fn()} aria-label="Fruit" />);
    await user.click(screen.getByRole('button', { name: /Fruit/ }));
    expect(await screen.findByRole('option', { name: 'Banana' })).toBeInTheDocument();
  });
});
