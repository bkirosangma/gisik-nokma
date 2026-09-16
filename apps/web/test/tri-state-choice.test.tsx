import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TriStateChoice } from '../src/tri-state-choice.js';

/**
 * 13.550 — the one control shape every value in the Filters sheet becomes
 * (exclude-mode spec §4). Three states, three signals, none carried by
 * colour alone; the state lives in the accessible NAME because `aria-pressed`
 * is binary and would lie for three.
 */
describe('13.550 TriStateChoice — state in the name, glyph on screen, no aria-pressed', () => {
  it('off: the name is the label alone', () => {
    render(<TriStateChoice mode="off" onCycle={() => {}}>Uma One</TriStateChoice>);
    const button = screen.getByRole('button', { name: 'Uma One' });
    expect(button).toHaveAttribute('data-mode', 'off');
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('include: the name says so', () => {
    render(<TriStateChoice mode="include" onCycle={() => {}}>Uma One</TriStateChoice>);
    expect(screen.getByRole('button', { name: 'Uma One, included' })).toHaveAttribute('data-mode', 'include');
  });

  it('exclude: the name says so, and the visible label is struck through by class, not by text', () => {
    render(<TriStateChoice mode="exclude" onCycle={() => {}}>Uma One</TriStateChoice>);
    const button = screen.getByRole('button', { name: 'Uma One, excluded' });
    expect(button).toHaveAttribute('data-mode', 'exclude');
    expect(button.querySelector('.gn-filters__choice-label')).toHaveTextContent('Uma One');
  });

  it('every glyph is decorative and drawn as SVG — no emoji, hidden from the accessible name', () => {
    for (const mode of ['off', 'include', 'exclude'] as const) {
      const { unmount } = render(<TriStateChoice mode={mode} onCycle={() => {}}>X</TriStateChoice>);
      const svg = screen.getByRole('button').querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });

  it('a click calls onCycle once; the button decides nothing itself', async () => {
    const onCycle = vi.fn();
    render(<TriStateChoice mode="off" onCycle={onCycle}>Bug</TriStateChoice>);
    await userEvent.click(screen.getByRole('button', { name: 'Bug' }));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it('accepts a variant class beside its own', () => {
    render(<TriStateChoice mode="off" onCycle={() => {}} className="gn-filters__choice--row">Bug</TriStateChoice>);
    expect(screen.getByRole('button')).toHaveClass('gn-filters__choice', 'gn-filters__choice--row');
  });
});
