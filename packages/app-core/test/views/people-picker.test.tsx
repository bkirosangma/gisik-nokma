import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeoplePicker } from '../../src/views/people-picker.js';
import type { RosterMember } from '../../src/view-types.js';

/**
 * Case 18.191 — the extracted picker (notes series Plan 5, Task 3).
 *
 * **This is an extraction, and the extraction is the risk.** The forty lines
 * that became `PeoplePicker` were the `explicit` arm of `visibility-editor.tsx`,
 * covered only by that screen's tests — which assert the SCREEN's behaviour
 * through a popover, a claim read and a submit. A moved block that renders the
 * wrong label, or none, can keep those green if the screen's own cases happen to
 * look elsewhere. So this file asserts the component directly, and
 * `visibility-editor.test.tsx` is the CONTROL: it must stay green, unchanged,
 * which is what proves the extracted markup still draws the screen it drew.
 *
 * `labelOf` is deliberately a LOCAL re-spelling of `name || email || id`
 * rather than a call to `memberLabel`: an expectation computed by the
 * implementation under test cannot fail, and the whole subject here is which
 * rule the label follows.
 */
const KIRO = '01J0000000000000000000000K';
const ANSELMA = '01J0000000000000000000000A';
const DIPU = '01J0000000000000000000000D';
/** The dev seed's accountant: display name `''`, an email to fall back on. */
const NAMELESS = '01M1V035TASFV2G9WPWFV9QDVW';

const MEMBERS: RosterMember[] = [
  { id: KIRO, name: 'Kiro', role: 'owner' },
  { id: ANSELMA, name: 'Anselma Marak', role: 'member' },
  { id: DIPU, name: 'Dipu', role: 'member' },
  { id: NAMELESS, name: '', email: 'accountant@e2e.gisik-nokma.local', role: 'guest' },
];

const labelOf = (member: RosterMember): string =>
  member.name.trim() || member.email?.trim() || member.id;

describe('18.191 the people picker', () => {
  it('renders one checkbox per member, labelled by memberLabel, checked for selected, and toggles by id', async () => {
    const onToggle = vi.fn();
    render(
      <PeoplePicker members={MEMBERS} selected={[ANSELMA]} onToggle={onToggle} />,
    );

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(MEMBERS.length);

    // EVERY member's label — including the nameless one, whose label is the
    // EMAIL. MUTATION TARGET: labelling by id makes this line fail with the
    // 26-character ULID where the address should be.
    for (const member of MEMBERS) {
      expect(screen.getByRole('checkbox', { name: labelOf(member) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('checkbox', { name: NAMELESS })).toBeNull();

    // `checked` follows `selected` and only `selected`.
    expect(screen.getByRole('checkbox', { name: 'Anselma Marak' })).toBeChecked();
    for (const member of MEMBERS.filter((m) => m.id !== ANSELMA)) {
      expect(screen.getByRole('checkbox', { name: labelOf(member) })).not.toBeChecked();
    }

    // The callback carries the ID and not the label — a picker that handed back
    // a display name would build an audience of strings nothing can resolve.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dipu' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(DIPU);
  });

  it('says the roster was not read rather than drawing an empty list', () => {
    render(<PeoplePicker members={[]} selected={[]} onToggle={vi.fn()} />);
    // An empty list and an unread roster are different facts, and the copy names
    // the second. A control that rendered nothing at all would be silent about
    // which one happened.
    expect(screen.getByText(/has not been read/)).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
