import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  alreadyInWorkspaceLine,
  OUTSIDER_ASSIGN,
  OUTSIDER_EMAIL_LABEL,
  OUTSIDER_FIND,
  OUTSIDER_JOINS_AS_GUEST,
  OUTSIDER_NOT_FOUND,
  foundLine,
  lookupFailedLine,
} from '../../src/people/copy.js';
import { OutsiderFinder } from '../../src/views/outsider-finder.js';

/** Access plan Task 7, cases 3.984–3.986. The copy's literal pins live here (the "pinned once" rule). */

const OUT = { userId: 'u_out', name: 'Anselma Marak', email: 'anselma@example.test', inWorkspace: false, role: null } as const;
const IN = { userId: 'u_in', name: 'Balti Sangma', email: 'balti@example.test', inWorkspace: true, role: 'member' } as const;

describe('3.984–3.986 OutsiderFinder', () => {
  it('pins its copy literally, once', () => {
    expect(OUTSIDER_EMAIL_LABEL).toBe('Their email');
    expect(OUTSIDER_FIND).toBe('Find');
    expect(OUTSIDER_ASSIGN).toBe('Assign');
    expect(OUTSIDER_NOT_FOUND).toBe('No user with that email.');
    expect(OUTSIDER_JOINS_AS_GUEST).toBe('They will join this workspace as a guest and see only this ticket.');
    expect(foundLine(OUT)).toBe('Anselma Marak (anselma@example.test)');
    expect(alreadyInWorkspaceLine('Balti Sangma')).toBe('Balti Sangma is already in this workspace.');
    expect(lookupFailedLine('HTTP 500')).toBe('The lookup failed: HTTP 500');
  });

  it('3.984 Find shows the person, focuses Assign, and Assign hands them over; CONTROL: the lookup got the trimmed address', async () => {
    const user = userEvent.setup();
    const lookup = vi.fn(async () => OUT);
    const onPick = vi.fn();
    render(<OutsiderFinder lookup={lookup} onPick={onPick} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), '  anselma@example.test  ');
    await user.click(screen.getByRole('button', { name: OUTSIDER_FIND }));
    expect(await screen.findByText(foundLine(OUT))).toBeInTheDocument();
    expect(screen.getByText(OUTSIDER_JOINS_AS_GUEST)).toBeInTheDocument();
    const assign = screen.getByRole('button', { name: OUTSIDER_ASSIGN });
    await waitFor(() => expect(assign).toHaveFocus());
    expect(lookup).toHaveBeenCalledWith('anselma@example.test');
    await user.click(assign);
    expect(onPick).toHaveBeenCalledWith(OUT);
  });

  it('3.984 Enter in the field runs Find', async () => {
    const user = userEvent.setup();
    const lookup = vi.fn(async () => OUT);
    render(<OutsiderFinder lookup={lookup} onPick={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'anselma@example.test{Enter}');
    expect(await screen.findByText(foundLine(OUT))).toBeInTheDocument();
  });

  it('3.985 no match is a status and offers no Assign; CONTROL: a failed lookup is an alert with the reason', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OutsiderFinder lookup={async () => null} onPick={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'nobody@example.test{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent(OUTSIDER_NOT_FOUND);
    expect(screen.queryByRole('button', { name: OUTSIDER_ASSIGN })).toBeNull();
    unmount();

    render(
      <OutsiderFinder lookup={async () => Promise.reject(new Error('HTTP 500'))} onPick={() => undefined} onCancel={() => undefined} />,
    );
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'x@example.test{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(lookupFailedLine('HTTP 500'));
  });

  it('3.986 an existing member is labelled as one and still pickable; CONTROL: an outsider joins as a guest', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<OutsiderFinder lookup={async () => IN} onPick={onPick} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'balti@example.test{Enter}');
    expect(await screen.findByText(alreadyInWorkspaceLine('Balti Sangma'))).toBeInTheDocument();
    expect(screen.queryByText(OUTSIDER_JOINS_AS_GUEST)).toBeNull();
    await user.click(screen.getByRole('button', { name: OUTSIDER_ASSIGN }));
    expect(onPick).toHaveBeenCalledWith(IN);
  });
});
