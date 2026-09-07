import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttentionItem, AttentionKind } from '../../src/view-types.js';
import { AttentionStrip } from '../../src/views/attention-strip.js';

/**
 * `KIND_TONE` and `KIND_LABEL` are module-private, so this file cannot iterate the real
 * maps. It iterates a local list instead — and a local list is exactly the fixture that
 * goes quietly stale when the union grows, which is the failure this row is about. The
 * guard below is what makes the loop trustworthy: if `AttentionKind` ever gains a member
 * `KINDS` does not name, `Exclude` is non-never and `_Exhaustive` stops being `true`, so
 * `typecheck` fails naming this file. The tuple wrapping matters — a bare
 * `Exclude<AttentionKind, (typeof KINDS)[number]>` would DISTRIBUTE over the union and
 * could be satisfied for the wrong reason.
 */
const KINDS = ['blocked', 'stale', 'due-soon', 'contested'] as const;
type _Exhaustive = [Exclude<AttentionKind, (typeof KINDS)[number]>] extends [never] ? true : false;
const _check: _Exhaustive = true;
void _check;

const itemOf = (kind: AttentionKind): AttentionItem => ({
  kind,
  ticketId: `ticket-${kind}`,
  projectId: 'project-1',
  title: `A ticket that is ${kind}`,
  reason: 'because the fixture says so',
  claim: null,
});

describe('AttentionStrip — every kind renders a real chip', () => {
  /**
   * 3.62 — the runtime half of the row, which it says it did not have: the row's own
   * measurement is that deleting an arm from `KIND_TONE` is a `typecheck` kill and kills
   * ZERO runtime tests, because the tone is merely `undefined` and the class degrades to
   * `gn-chip--undefined` without throwing. That silent degradation is now asserted here,
   * and the `KIND_LABEL` half reddens `test` rather than only `typecheck`.
   */
  it.each(KINDS)('renders %s with a label and a resolved tone, never gn-chip--undefined', (kind) => {
    const { container } = render(<AttentionStrip items={[itemOf(kind)]} onOpenTicket={() => {}} />);

    const chip = container.querySelector('.gn-chip');
    expect(chip).not.toBeNull();
    // The tone half: a missing KIND_TONE arm renders the class with `undefined` in it.
    expect(chip?.className).not.toContain('undefined');
    // The label half: a missing KIND_LABEL arm renders an empty chip.
    expect(chip?.textContent?.trim()).not.toBe('');
    // A positive control from the same render, so an assertion that matched an
    // absent chip could not pass: the strip really did draw this item.
    expect(screen.getByText(`A ticket that is ${kind}`)).toBeTruthy();
  });
});
