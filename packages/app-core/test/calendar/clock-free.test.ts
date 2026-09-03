// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildCalendarModel } from '../../src/calendar/calendar-model.js';
import { monthGridWeeks } from '../../src/claims/dates.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import type { TicketState } from '@gisik-nokma/domain';
import {
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
    expect(scanned).toContain('claims/dates.ts');
    expect(scanned).toContain('claims/claim-labels.ts');
    expect(scanned).toContain('claims/ticket-dates.ts');
    expect(scanned).toContain('hierarchy/epic-ancestor.ts');
    expect(scanned).toContain('filter/matches-filter.ts');
    expect(scanned).toContain('provenance.ts');
    expect(scanned.length).toBeGreaterThanOrEqual(CLOCK_FREE_ROOTS.length);
  });
});
