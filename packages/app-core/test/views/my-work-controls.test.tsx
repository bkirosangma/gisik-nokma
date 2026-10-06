import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttentionShow } from '@gisik-nokma/domain';
import { GroupToggle, SHOW_LABELS, ShowFilter } from '../../src/views/my-work-controls.js';

/**
 * The two controls above the global My work page (my-work-global T3, cases 30.034–30.035):
 * the multiselect "Show" chips and the "Group" radio pair.
 */

const ALL: AttentionShow[] = ['created', 'assigned', 'ws-admin', 'project-admin'];

describe('ShowFilter', () => {
  it('30.034 renders the offered options with their verbatim labels, aria-pressed per selection', () => {
    render(<ShowFilter options={ALL} value={['created', 'ws-admin']} onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Show' });
    const chips = Array.from(group.querySelectorAll('button'));
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Created by me',
      'Assigned to me',
      'Workspaces I own or run',
      'Projects I run',
    ]);
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true', 'false']);
    expect(SHOW_LABELS).toEqual({
      created: 'Created by me',
      assigned: 'Assigned to me',
      'ws-admin': 'Workspaces I own or run',
      'project-admin': 'Projects I run',
    });
  });

  it('30.034 only the OFFERED options render — a member is shown two chips', () => {
    render(<ShowFilter options={['created', 'assigned']} value={['created', 'assigned']} onChange={() => {}} />);
    expect(screen.getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Created by me', 'Assigned to me']);
  });

  it('30.034 pressing toggles a chip in or out, in canonical order; pressing the LAST selected chip does nothing', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ShowFilter options={ALL} value={['assigned']} onChange={onChange} />);
    // Adding keeps the one order every show list is written in, whatever was pressed first.
    fireEvent.click(screen.getByRole('button', { name: 'Created by me' }));
    expect(onChange).toHaveBeenLastCalledWith(['created', 'assigned']);

    // The last selected chip cannot be cleared: no call, and it stays pressed.
    onChange.mockClear();
    const last = screen.getByRole('button', { name: 'Assigned to me' });
    fireEvent.click(last);
    expect(onChange).not.toHaveBeenCalled();
    expect(last).toHaveAttribute('aria-pressed', 'true');

    // CONTROL: with two selected, the same press DOES clear it.
    rerender(<ShowFilter options={ALL} value={['created', 'assigned']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assigned to me' }));
    expect(onChange).toHaveBeenLastCalledWith(['created']);
  });

  it('30.034 a held value the viewer is no longer offered is not counted, and not passed on', () => {
    const onChange = vi.fn();
    // Saved while an admin; not one now. "Assigned to me" is the only OFFERED selection,
    // so it is the last chip and cannot be cleared — the hidden ws-admin does not count.
    render(<ShowFilter options={['created', 'assigned']} value={['assigned', 'ws-admin']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assigned to me' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Created by me' }));
    expect(onChange).toHaveBeenLastCalledWith(['created', 'assigned']);
  });
});

describe('GroupToggle', () => {
  it('30.035 is a two-option radio group, "By workspace and project" / "Flat", aria-checked on the value', () => {
    render(<GroupToggle value="workspace-project" onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'Group' });
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(radios.map((radio) => radio.textContent)).toEqual(['By workspace and project', 'Flat']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    // One tab stop for the group: the checked radio.
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('30.035 arrow keys move the selection (and focus), wrapping; a click selects', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GroupToggle value="workspace-project" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'By workspace and project' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('flat');
    expect(screen.getByRole('radio', { name: 'Flat' })).toHaveFocus();

    rerender(<GroupToggle value="flat" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Flat' }), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('workspace-project');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Flat' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('workspace-project');

    onChange.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'By workspace and project' }));
    expect(onChange).toHaveBeenCalledWith('workspace-project');
    // A key that is not an arrow moves nothing.
    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Flat' }), { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
