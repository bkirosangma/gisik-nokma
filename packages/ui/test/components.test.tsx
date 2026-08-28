import { render, screen } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// `"type": "module"`, so NodeNext resolves its types as CJS and a default
// import lands on the module namespace (no `.setup`) under this repo's
// verbatimModuleSyntax / no-esModuleInterop base config.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, initialsOf } from '../src/components/avatar.js';
import { Button } from '../src/components/button.js';
import { Chip } from '../src/components/chip.js';
import { Dialog } from '../src/components/dialog.js';
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
