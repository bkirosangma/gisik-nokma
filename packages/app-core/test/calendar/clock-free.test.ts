// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCalendarModel } from '../../src/calendar/calendar-model.js';
import { buildTimelineModel } from '../../src/timeline/timeline-model.js';
import { monthGridWeeks } from '../../src/claims/dates.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import type { TicketState } from '@gisik-nokma/domain';
import {
  CLOCK_FREE_DOMAIN_FILES,
  CLOCK_FREE_ROOTS,
  findClockReads,
  scanCalendarSurface,
} from '../helpers/clock-scan.js';

/**
 * 11.48 (NEW — Task 15 must carry this id into
 * test-cases/11-calendar-notifications.md).
 *
 * The measured gap this closes: across the 48 test files on `main` when this
 * task ran, ZERO varied `TZ`, and both machines the product is developed on
 * are `Asia/Kolkata`. A calendar that read the device would therefore have
 * been green on every machine that has ever run this suite — and wrong for the
 * first collaborator west of it.
 */

const names: Record<string, string> = { user_kiro: 'Kiro' };
const userName = (id: string): string => names[id] ?? id;

function claimField(value: unknown) {
  return {
    value,
    actorId: 'user_kiro',
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  };
}

function ticket(fields: TicketState['fields'], customDateFields: { id: string; name: string }[] = []): TicketDatesInput {
  return {
    state: {
      kind: 'ticket',
      id: 't1',
      workspaceId: 'ws_1',
      projectId: 'p1',
      typeId: 'task',
      parentId: null,
      workflowId: 'wf_basic',
      workflowVersion: 1,
      stateId: 'doing',
      stateCategory: 'active',
      assigneeId: null,
      collaboratorIds: [],
      fields,
      transitions: [],
    },
    pendingFieldIds: [],
    customDateFields,
  };
}

/** Zones on either side of the date line, plus the two the product is built in. */
const ZONES = ['Pacific/Kiritimati', 'Pacific/Niue', 'Asia/Kolkata', 'UTC'];

function underZone<T>(zone: string, read: () => T): T {
  const previous = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    return read();
  } finally {
    if (previous === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previous;
  }
}

/**
 * The POSITIVE CONTROL, and the whole test rests on it: a deliberately
 * device-reading day formatter, run through the same harness. If this does NOT
 * vary across the zones, then `process.env.TZ` is not live in this process and
 * the invariance assertions below are vacuous — they would pass against a
 * calendar-model that read the clock on every line.
 */
function deviceDay(instantMs: number): string {
  const at = new Date(instantMs);
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

const AT_UTC_MIDNIGHT = Date.parse('2026-08-20T00:00:00.000Z');

describe('11.48 the calendar view-model reads no clock — proved by varying the zone', () => {
  it('the harness itself bites: a device-reading formatter DOES change zone to zone', () => {
    const answers = ZONES.map((zone) => underZone(zone, () => deviceDay(AT_UTC_MIDNIGHT)));
    expect(new Set(answers).size).toBeGreaterThan(1);
    // Named, so a future zone-database change cannot quietly make this vacuous.
    expect(answers).toEqual(['2026-8-20', '2026-8-19', '2026-8-20', '2026-8-20']);
  });

  it('the month grid is the same grid in every zone', () => {
    const grids = ZONES.map((zone) => underZone(zone, () => JSON.stringify(monthGridWeeks(2026, 8))));
    expect(new Set(grids).size).toBe(1);
  });

  it('the whole model — bars, markers, custom claims, legend — is byte-identical in every zone', () => {
    const inputs = [
      ticket(
        {
          title: claimField('Zone-proof'),
          startDate: claimField({ date: '2026-08-01' }),
          dueDate: claimField({ date: '2026-08-31' }),
          'filed-on': claimField('2026-08-31'),
        },
        [{ id: 'filed-on', name: 'Filed on' }],
      ),
    ];
    const models = ZONES.map((zone) =>
      underZone(zone, () => JSON.stringify(buildCalendarModel(inputs, { year: 2026, month: 8, userName }))),
    );
    expect(new Set(models).size).toBe(1);
    // The month's edge days are where a zone shift lands first — assert they
    // actually rendered, so an empty model cannot pass this by being empty.
    expect(models[0]).toContain('2026-08-31');
    expect(models[0]).toContain('2026-08-01');
  });
});

/**
 * 11.60 — the timeline view-model, held to the same standard, and the reason
 * it needs its own case rather than riding the calendar's: the calendar only
 * ever COMPARES day strings, while the timeline divides a millisecond
 * difference to get a week index. That arithmetic is where a device getter
 * would place the same claim in a different column depending on who is
 * looking, and it is the only place in this surface that does any.
 */
describe('11.60 the timeline view-model reads no clock either', () => {
  it('the whole model — weeks, bars, side list — is byte-identical in every zone', () => {
    const inputs = [
      ticket(
        {
          title: claimField('Zone-proof span'),
          startDate: claimField({ date: '2026-08-17' }),
          dueDate: claimField({ date: '2026-10-11' }),
          'filed-on': claimField('2026-08-31'),
        },
        [{ id: 'filed-on', name: 'Filed on' }],
      ),
    ];
    const models = ZONES.map((zone) =>
      underZone(zone, () =>
        JSON.stringify(buildTimelineModel(inputs, { anchor: '2026-08-23', userName })),
      ),
    );
    expect(new Set(models).size).toBe(1);
    // The window's two edge days really rendered — an empty model must not
    // pass this by being empty, and both ends are where a zone shift lands.
    expect(models[0]).toContain('2026-08-17');
    expect(models[0]).toContain('2026-10-11');
    // And the arithmetic actually ran: an unclipped span across all 8 columns.
    expect(models[0]).toContain('"fromWeek":0');
    expect(models[0]).toContain('"toWeek":7');
  });

  it('the week a claim falls in is the same week in every zone, on the Sunday|Monday seam', () => {
    const seam = ZONES.map((zone) =>
      underZone(zone, () => {
        const model = buildTimelineModel(
          [
            ticket({
              title: claimField('Sunday'),
              startDate: claimField({ date: '2026-08-23' }),
              dueDate: claimField({ date: '2026-08-23' }),
            }),
          ],
          { anchor: '2026-08-23', userName },
        );
        return model.groups[0]?.rows[0]?.bar.fromWeek;
      }),
    );
    expect(seam).toEqual([0, 0, 0, 0]);
  });
});

describe('11.48 the scanner is proven against planted defects before it is trusted', () => {
  it('catches the four spellings that reach the device', () => {
    expect(findClockReads('const now = new Date();')).toEqual(['clock read']);
    expect(findClockReads('const ms = Date.now();')).toEqual(['clock read']);
    expect(findClockReads('return at.getDay();')).toEqual(['device timezone getter']);
    expect(findClockReads('return at.getFullYear();')).toEqual(['device timezone getter']);
    expect(findClockReads("return day.toLocaleDateString('en-IN');")).toEqual([
      'device locale formatter',
    ]);
    expect(findClockReads("new Intl.DateTimeFormat('en-IN').format(at)")).toEqual([
      'device locale formatter',
    ]);
  });

  it('lets the UTC arithmetic and the prose that names the ban through', () => {
    expect(findClockReads('const at = new Date(ms);')).toEqual([]);
    expect(findClockReads('return at.getUTCDay();')).toEqual([]);
    expect(findClockReads('at.setUTCFullYear(year, month - 1, day);')).toEqual([]);
    // Controls: this package's docblocks name every one of these to forbid it.
    expect(findClockReads(' * `toLocaleString`, `toLocaleDateString` and the local')).toEqual([]);
    expect(findClockReads(' * A `new Date()` anywhere here reintroduces the conflation.')).toEqual([
      'clock read',
    ]);
  });

  it('finds no clock read anywhere on the calendar view-model surface', () => {
    const { hits, scanned } = scanCalendarSurface();
    const report = hits.map((hit) => `${hit.file}:${hit.line} ${hit.match}`).join('\n');
    expect(hits, `the calendar surface reached for a clock:\n${report}`).toEqual([]);
    // The walk really happened, over the roots it claims.
    expect(scanned).toContain('calendar/calendar-model.ts');
    // Named literally for the reason the comment below gives about
    // CLOCK_FREE_DOMAIN_FILES: a loop over the roots would assert the list
    // against itself, so deleting 'timeline' would delete its own guard.
    expect(scanned).toContain('timeline/timeline-model.ts');
    expect(scanned).toContain('claims/dates.ts');
    expect(scanned).toContain('claims/claim-labels.ts');
    expect(scanned).toContain('claims/ticket-dates.ts');
    expect(scanned).toContain('hierarchy/epic-ancestor.ts');
    expect(scanned).toContain('filter/matches-filter.ts');
    expect(scanned).toContain('provenance.ts');
    expect(scanned.length).toBeGreaterThanOrEqual(CLOCK_FREE_ROOTS.length);
  });

  /**
   * The hop OUT of app-core, which this harness used to leave unguarded: every
   * rendered calendar date travels `claim-labels.ts` → `provenance.ts` →
   * `@gisik-nokma/domain`, and an `Intl` read planted at the far end would have
   * been invisible to both halves — the scan never opened the file, and
   * `process.env.TZ` is not reliably live for `Intl` inside one process, so the
   * zone-varying half cannot see it either. The scan is the guard here BECAUSE
   * the runtime harness cannot be; nothing below proves the runtime half shut.
   */
  it('the scan crosses into the domain files the calendar actually imports', () => {
    const { scanned } = scanCalendarSurface();
    // NAMED LITERALLY, never looped over `CLOCK_FREE_DOMAIN_FILES`: a `for`
    // over the constant asserts the list against itself, so deleting an entry
    // deletes the assertion that would have caught the deletion. (Measured —
    // that is exactly what the first draft of this test did, and dropping
    // `clock-skew.ts` from the list left all fifty tests green.)
    expect(scanned).toContain('domain/ist-day.ts');
    expect(scanned).toContain('domain/clock-skew.ts');
    expect([...CLOCK_FREE_DOMAIN_FILES].sort()).toEqual(['clock-skew.ts', 'ist-day.ts']);
    // The chain is real and still points at these two — an import moved out of
    // provenance.ts must move this list with it, not silently narrow the guard.
    const provenance = readFileSync(
      fileURLToPath(new URL('../../src/provenance.ts', import.meta.url)),
      'utf8',
    );
    expect(provenance).toContain("from '@gisik-nokma/domain'");
    expect(provenance).toContain('formatIstInstant');
  });
});
