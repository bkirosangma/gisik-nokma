import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '../src/theme-toggle.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('ThemeToggle — explicit choice wins, system is the default', () => {
  it('cycles system → light → dark, stamping data-theme and persisting', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button')); // → light
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('gn-theme')).toBe('light');
    await user.click(screen.getByRole('button')); // → dark
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('gn-theme')).toBe('dark');
    await user.click(screen.getByRole('button')); // → system
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem('gn-theme')).toBeNull();
  });

  it('a stored choice is restored on mount, so the toggle does not start a cycle behind the page', async () => {
    // The pre-paint script in `app/layout.tsx` stamps the attribute; this
    // component has to agree with it or the first click undoes the user's
    // choice instead of advancing from it.
    localStorage.setItem('gn-theme', 'dark');
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(await screen.findByRole('button', { name: /^Theme: dark\./ })).toBeInTheDocument();
    await user.click(screen.getByRole('button')); // dark → system, not → light
    expect(localStorage.getItem('gn-theme')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('the label names both where it is and where a click goes', async () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Theme: system. Switch to light.',
    );
  });
});
