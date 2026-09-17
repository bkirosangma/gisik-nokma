import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TriStateChoice } from '../src/tri-state-choice.js';

/**
 * 13.550 — the one control shape every value in the Filters sheet becomes
 * (exclude-mode spec §4). Three states, three signals, none carried by
 * colour alone; the state lives in the accessible NAME because `aria-pressed`
 * is binary and would lie for three. The name is built from `label` via
 * `aria-label` (fix round 1, 2026-09-17) — `children` is a separate, optional
 * prop for what actually renders inside the button (defaulting to `label`),
 * so a caller can put an avatar beside the name (Task 9's person rows)
 * without it ever reaching the accessible name.
 */
describe('13.550 TriStateChoice — state in the name, glyph on screen, no aria-pressed', () => {
  it('off: the name is the label alone', () => {
    render(<TriStateChoice mode="off" label="Uma One" onCycle={() => {}} />);
    const button = screen.getByRole('button', { name: 'Uma One' });
    expect(button).toHaveAttribute('data-mode', 'off');
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('include: the name says so', () => {
    render(<TriStateChoice mode="include" label="Uma One" onCycle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Uma One, included' })).toHaveAttribute('data-mode', 'include');
  });

  it('exclude: the name says so, and the visible label is struck through by class, not by text', () => {
    render(<TriStateChoice mode="exclude" label="Uma One" onCycle={() => {}} />);
    const button = screen.getByRole('button', { name: 'Uma One, excluded' });
    expect(button).toHaveAttribute('data-mode', 'exclude');
    expect(button.querySelector('.gn-filters__choice-label')).toHaveTextContent('Uma One');
  });

  it('every glyph is decorative and drawn as SVG — no emoji, hidden from the accessible name', () => {
    for (const mode of ['off', 'include', 'exclude'] as const) {
      const { unmount } = render(<TriStateChoice mode={mode} label="X" onCycle={() => {}} />);
      const svg = screen.getByRole('button').querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });

  it('a click calls onCycle once; the button decides nothing itself', async () => {
    const onCycle = vi.fn();
    render(<TriStateChoice mode="off" label="Bug" onCycle={onCycle} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bug' }));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it('accepts a variant class beside its own', () => {
    render(<TriStateChoice mode="off" label="Bug" onCycle={() => {}} className="gn-filters__choice--row" />);
    expect(screen.getByRole('button')).toHaveClass('gn-filters__choice', 'gn-filters__choice--row');
  });

  it('a person-row child (avatar + name) still yields the exact three names', () => {
    for (const [mode, expectedName] of [
      ['off', 'Uma One'],
      ['include', 'Uma One, included'],
      ['exclude', 'Uma One, excluded'],
    ] as const) {
      const { unmount } = render(
        <TriStateChoice mode={mode} label="Uma One" onCycle={() => {}}>
          <span aria-hidden="true">AV</span>
          <span>Uma One</span>
        </TriStateChoice>,
      );
      expect(screen.getByRole('button', { name: expectedName })).toHaveAttribute('data-mode', mode);
      unmount();
    }
  });
});
