import { render, screen, within } from '@testing-library/react';
// Named import, not the default: see components.test.tsx's note on `@testing-library/user-event` under this repo's ESM.
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../src/components/segmented-control.js';

/**
 * Workflow and Timeline graphs Part 1, T9 — case 29.087 (spec VP-10; planner ruling P5: T9, the first user, owns the variant
 * and Part 4 consumes it). The Timeline's zoom switch is a CHOICE of one value, not a set of tabs over panels, so it is a
 * radio group: `radiogroup` / `radio` / `aria-checked`. The keyboard model is the tab variant's unchanged (one roving tab
 * stop, the arrows move AND select), and the default variant is byte-identical for every existing render site.
 */
const OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** A controlled harness: the mark follows the value it hands back, so a move that never calls `onChange` cannot look selected. */
function Harness({ variant, onPick }: { variant?: 'tabs' | 'radio'; onPick: (value: string) => void }) {
  const [value, setValue] = useState('week');
  return (
    <SegmentedControl
      aria-label="Zoom"
      {...(variant === undefined ? {} : { variant })}
      value={value}
      onChange={(next) => {
        onPick(next);
        setValue(next);
      }}
      options={OPTIONS}
    />
  );
}

describe('29.087 VP-10: the zoom switch is a radio group', () => {
  it('29.087 variant="radio" renders radiogroup / radio / aria-checked with the roving tabindex, and ArrowRight / ArrowLeft move AND select; control: the default variant still renders tablist / tab / aria-selected', async () => {
    const user = userEvent.setup();
    const picked = vi.fn();
    const { unmount } = render(<Harness variant="radio" onPick={picked} />);
    const group = screen.getByRole('radiogroup', { name: 'Zoom' });
    expect(group).toHaveClass('gn-segmented');
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Day', 'Week', 'Month']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    // A radio is checked, never selected: the tab attribute would tell assistive tech it is a tab.
    for (const radio of radios) expect(radio).not.toHaveAttribute('aria-selected');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(radios[1]).toHaveClass('gn-segmented__item--on');
    // One tab stop, on the checked radio, and the keyboard lands there.
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    await user.tab();
    expect(radios[1]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(radios[2]).toHaveFocus();
    expect(picked).toHaveBeenLastCalledWith('month');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    await user.keyboard('{ArrowLeft}');
    expect(radios[1]).toHaveFocus();
    expect(picked).toHaveBeenLastCalledWith('week');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    unmount();

    // CONTROL (same it): no variant is the tab variant, unchanged, so every existing render site keeps its roles.
    render(<Harness onPick={vi.fn()} />);
    const list = screen.getByRole('tablist', { name: 'Zoom' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    for (const tab of tabs) expect(tab).not.toHaveAttribute('aria-checked');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
