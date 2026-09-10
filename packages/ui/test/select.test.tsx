import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
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

describe('Select — searchable', () => {
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
});
