import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyDue, staleReason } from '../../src/routes/attention.js';

/**
 * UX fixes F-8 (reviewer B, owner follow-up): the stale reason is read aloud by the
 * strip verbatim, so it follows U-T11's day rule. A spaced em dash and an ISO date
 * are both template tells; the sentence names the day the way a due reason does.
 */
const TODAY = '2026-10-02';
const MANUAL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/manual.md'), 'utf8');

/** A manual paragraph wraps; the sentence is the same once a line break is a space. */
const manualText = MANUAL.replace(/\s*\n\s*/g, ' ');

describe('23.300 the stale reason names its day as "10 Jul", with a comma and no em dash', () => {
  it('reads "In an active state since 10 Jul, past the 7-day staleness threshold." (control first: an earlier year keeps its year, the threshold is the workspace\'s)', () => {
    // Control: the label is not a constant. An earlier year keeps its year and a 6-day threshold says 6.
    expect(staleReason('2025-07-10', TODAY, 6)).toBe(
      'In an active state since 10 Jul 2025, past the 6-day staleness threshold.',
    );
    const reason = staleReason('2026-07-10', TODAY, 7);
    expect(reason).toBe('In an active state since 10 Jul, past the 7-day staleness threshold.');
    expect(reason).not.toContain(' — ');
    expect(reason).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('23.302 the manual\'s two example sentences are the ones the server composes', () => {
  it('quotes the stale sentence and a due-soon sentence exactly as the route words them (control first: the old wording is not there)', () => {
    // Control: the old ISO-and-em-dash wording and the pre-NP-06 "Needed by" wording are gone.
    expect(manualText).not.toContain('2026-07-10 — past the 7-day');
    expect(manualText).not.toContain('Needed by 2026-08-30');

    expect(manualText).toContain(`*"${staleReason('2026-07-10', TODAY, 7)}"*`);
    const dueSoon = classifyDue('2026-10-05', '2026-10-01', '2026-10-08');
    expect(dueSoon?.reason).toBe('due 5 Oct (in 4 days)');
    expect(manualText).toContain(`*"${dueSoon?.reason}"*`);
  });
});
