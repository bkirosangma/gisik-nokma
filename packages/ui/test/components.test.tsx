import { render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// `"type": "module"`, so NodeNext resolves its types as CJS and a default
// import lands on the module namespace (no `.setup`) under this repo's
// verbatimModuleSyntax / no-esModuleInterop base config.
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, initialsOf } from '../src/components/avatar.js';
import { Button } from '../src/components/button.js';
import { Chip } from '../src/components/chip.js';
import { Dialog } from '../src/components/dialog.js';
import { SegmentedControl } from '../src/components/segmented-control.js';
import { Sheet } from '../src/components/sheet.js';
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
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
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
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveClass('gn-segmented__item--on');
    expect(tabs[0]).not.toHaveClass('gn-segmented__item--on');
    await userEvent.click(tabs[0]);
    expect(onChange).toHaveBeenCalledWith('phone');
  });
});

// Not `new URL('../src/ui.css', import.meta.url)` (the plan's literal spelling):
// Vite statically rewrites that exact pattern into a dev-server asset URL, so
// under Vitest the base arrives as `http://localhost:3000/@fs/...` and
// `fileURLToPath` throws "The URL must be of scheme file" (see
// `test/helpers/colour-scan.ts`'s identical note). Resolving the path after
// converting `import.meta.url` on its own avoids the rewrite.
const UI_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui.css'), 'utf8');
const rule = (selector: string) => {
  const m = UI_CSS.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
};

describe('R1(c) at the component layer', () => {
  it('13.289 the ghost button has a fill and no boundary', () => {
    const body = rule('.gn-button--ghost');
    expect(body).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(body).toMatch(/border-color:\s*transparent/);
    expect(body).not.toMatch(/border:\s*1px/);
  });
  it('13.290 refusal panels carry tone as an inset fill, never a border', () => {
    for (const s of ['.gn-refusal--preview', '.gn-refusal--server']) {
      const body = rule(s);
      expect(body, s).toMatch(/box-shadow:\s*inset 4px 0 0 var\(--gn-(warning|danger)\)/);
      expect(body, s).not.toMatch(/\bborder:/);
    }
  });
  it('13.291 the field input KEEPS its border — an empty field has no label to identify it', () => {
    expect(rule('.gn-field__input')).toMatch(/border:\s*1px solid var\(--gn-border\)/);
  });
});
