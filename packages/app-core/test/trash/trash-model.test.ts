import { describe, expect, it } from 'vitest';
import { PURGE_DELAY_DAYS, type DeletedItem, type IngestResult } from '@gisik-nokma/domain';
import {
  DELETED_ITEMS_EMPTY,
  DELETED_ITEMS_OFFLINE,
  DELETE_NOTE,
  DELETE_PERMANENTLY_LABEL,
  deleteDialogTitle,
  permanentlyDeletedOn,
  ticketDeletedToast,
} from '../../src/trash/copy.js';
import {
  archiveWorkspaceSeeds,
  deleteSeeds,
  markSeeds,
  restoreSeeds,
  targetOf,
  unmarkSeeds,
} from '../../src/trash/seeds.js';
import { classifyBatch } from '../../src/trash/batch.js';
import { isPurgeOverdue, istDayLabel } from '../../src/trash/dates.js';

/** Trash series Plan 4, Task 3. Cases 19.209, 19.211–19.216 (`test-cases/19-trash.md` §19.21). 19.210 is its own file (it mocks the domain). */

const committed = (eventId: string): IngestResult => ({
  status: 'committed',
  eventId,
  seq: 1,
  serverTime: '2026-09-29T10:00:00.000Z',
});
const refused = (eventId: string, reason: string): IngestResult => ({
  status: 'refused',
  eventId,
  rule: 'lifecycle.state',
  reason,
});

function deletedItem(over: Partial<DeletedItem> = {}): DeletedItem {
  return {
    kind: 'ticket',
    id: 'tkt1',
    workspaceId: 'ws1',
    workspaceName: 'Convenience Corner',
    projectId: 'prj1',
    projectName: 'Shop operations',
    label: 'CCSO-3 Renew the lease',
    deletedBy: 'usr1',
    deletedByName: 'Kiro',
    deletedAt: '2026-09-28T10:00:00.000Z',
    purgeMarkedAt: null,
    purgeDueAt: null,
    containedCount: 0,
    ...over,
  };
}

describe('19.209 the spec’s fixed strings are the exported constants', () => {
  it('19.209 the note, the switch, the title, the empty and offline states, the date line', () => {
    expect(DELETE_NOTE).toBe(
      'Deleted items sit in Deleted items on your Account page, where you can restore them. Deleting permanently marks the item to be purged for good after 15 days. You can unmark it there any time before then.',
    );
    expect(DELETE_PERMANENTLY_LABEL).toBe('Delete permanently');
    expect(deleteDialogTitle('project', 'Shop operations')).toBe('Delete project “Shop operations”?');
    expect(DELETED_ITEMS_EMPTY).toBe('Nothing deleted.');
    expect(DELETED_ITEMS_OFFLINE).toBe('Deleted items needs a connection.');
    expect(permanentlyDeletedOn('8 Oct')).toBe('Permanently deleted on 8 Oct');
    // CONTROL — the day count is the constant, and the 2026-09-20 soft sentence is untouched.
    expect(DELETE_NOTE).toContain(`after ${String(PURGE_DELAY_DAYS)} days`);
    expect(ticketDeletedToast('CCSO-3', false)).toBe('CCSO-3 deleted. You can also undo this on the page');
  });
});

describe('19.211 deleteSeeds', () => {
  it('19.211 soft is one event; permanent is deleted THEN purge.marked; every kind maps to its own type', () => {
    const project = { kind: 'project' as const, workspaceId: 'ws1', entityId: 'prj1' };
    expect(deleteSeeds(project, false)).toEqual([
      { workspaceId: 'ws1', entity: { kind: 'project', id: 'prj1' }, type: 'project.deleted', payload: {} },
    ]);
    expect(deleteSeeds(project, true)).toEqual([
      { workspaceId: 'ws1', entity: { kind: 'project', id: 'prj1' }, type: 'project.deleted', payload: {} },
      { workspaceId: 'ws1', entity: { kind: 'project', id: 'prj1' }, type: 'purge.marked', payload: {} },
    ]);
    // CONTROL — the other three kinds.
    expect(deleteSeeds({ kind: 'workspace', workspaceId: 'ws9', entityId: 'ws9' }, false)[0]!.type).toBe('workspace.deleted');
    expect(deleteSeeds({ kind: 'ticket', workspaceId: 'ws1', entityId: 't1' }, false)[0]!.type).toBe('ticket.deleted');
    expect(deleteSeeds({ kind: 'note', workspaceId: 'ws1', entityId: 'n1' }, false)[0]!.type).toBe('note.deleted');
  });
});

describe('19.212 restoreSeeds', () => {
  it('19.212 each kind restores with its UNDELETE type; unmarkFirst puts purge.unmarked first', () => {
    const types = (kind: 'workspace' | 'project' | 'ticket' | 'note', unmarkFirst: boolean) =>
      restoreSeeds({ kind, workspaceId: 'ws1', entityId: 'x1' }, unmarkFirst).map((seed) => seed.type);
    expect(types('workspace', false)).toEqual(['workspace.undeleted']);
    expect(types('project', false)).toEqual(['project.undeleted']);
    expect(types('ticket', false)).toEqual(['ticket.restored']);
    expect(types('note', false)).toEqual(['note.restored']);
    expect(types('ticket', true)).toEqual(['purge.unmarked', 'ticket.restored']);
    expect(types('project', true)).toEqual(['purge.unmarked', 'project.undeleted']);
    // CONTROL — `project.restored`/`workspace.restored` are UN-ARCHIVE (spec §4).
    for (const kind of ['workspace', 'project', 'ticket', 'note'] as const) {
      expect(types(kind, true)).not.toContain('project.restored');
      expect(types(kind, true)).not.toContain('workspace.restored');
    }
  });
});

describe('19.213 markSeeds, unmarkSeeds, targetOf', () => {
  it('19.213 marks file against the item’s own kind; a deleted workspace is targeted in its own stream', () => {
    const workspaceRow = deletedItem({ kind: 'workspace', id: 'ws9', workspaceId: 'ws9', projectId: null, projectName: null });
    expect(targetOf(workspaceRow)).toEqual({ kind: 'workspace', workspaceId: 'ws9', entityId: 'ws9' });
    expect(markSeeds(targetOf(workspaceRow))).toEqual([
      { workspaceId: 'ws9', entity: { kind: 'workspace', id: 'ws9' }, type: 'purge.marked', payload: {} },
    ]);
    // CONTROL — a note row.
    const noteRow = deletedItem({ kind: 'note', id: 'n1' });
    expect(unmarkSeeds(targetOf(noteRow))).toEqual([
      { workspaceId: 'ws1', entity: { kind: 'note', id: 'n1' }, type: 'purge.unmarked', payload: {} },
    ]);
  });
});

describe('19.214 classifyBatch', () => {
  it('19.214 committed, refused, partly, unanswered', () => {
    expect(classifyBatch([committed('a'), committed('b')], 2)).toEqual({ status: 'committed' });
    expect(classifyBatch([refused('a', 'This ticket is already deleted.'), refused('b', 'x')], 2)).toEqual({
      status: 'refused',
      reason: 'This ticket is already deleted.',
    });
    expect(
      classifyBatch(
        [{ status: 'invalid', eventId: null, code: 'invalid-payload', message: 'payload refused' }],
        1,
      ),
    ).toEqual({ status: 'refused', reason: 'payload refused' });
    expect(classifyBatch([committed('a'), refused('b', 'This ticket is already marked for permanent deletion.')], 2)).toEqual({
      status: 'partly',
      reason: 'This ticket is already marked for permanent deletion.',
      committed: [true, false],
    });
    // The flags are per event, not "the first one decides": a refusal FIRST and a commit after it is still partly.
    expect(classifyBatch([refused('a', 'This ticket is already deleted.'), committed('b')], 2)).toEqual({
      status: 'partly',
      reason: 'This ticket is already deleted.',
      committed: [false, true],
    });
    expect(classifyBatch([committed('a')], 2)).toEqual({ status: 'unanswered', answered: 1 });
    // CONTROL — nothing sent, nothing wrong.
    expect(classifyBatch([], 0)).toEqual({ status: 'committed' });
  });
});

describe('19.215 istDayLabel and isPurgeOverdue', () => {
  it('19.215 the IST day, its midnight, a verbatim malformed instant, and the <= boundary', () => {
    expect(istDayLabel('2026-10-08T10:00:00.000Z')).toBe('8 Oct');
    expect(istDayLabel('2026-10-07T18:30:00.000Z')).toBe('8 Oct');
    expect(istDayLabel('2026-10-07T18:29:59.999Z')).toBe('7 Oct');
    expect(istDayLabel('not an instant')).toBe('not an instant');
    const due = '2026-10-08T10:00:00.000Z';
    expect(isPurgeOverdue(due, new Date(due))).toBe(true);
    // CONTROL — one millisecond before, and an unmarked row.
    expect(isPurgeOverdue(due, new Date(Date.parse(due) - 1))).toBe(false);
    expect(isPurgeOverdue(null, new Date(due))).toBe(false);
  });
});

describe('19.216 archiveWorkspaceSeeds', () => {
  it('19.216 archive a live workspace, restore an archived one', () => {
    expect(archiveWorkspaceSeeds('ws1', false)).toEqual([
      { workspaceId: 'ws1', entity: { kind: 'workspace', id: 'ws1' }, type: 'workspace.archived', payload: {} },
    ]);
    expect(archiveWorkspaceSeeds('ws1', true)).toEqual([
      { workspaceId: 'ws1', entity: { kind: 'workspace', id: 'ws1' }, type: 'workspace.restored', payload: {} },
    ]);
    // CONTROL — never a project type.
    expect([...archiveWorkspaceSeeds('ws1', false), ...archiveWorkspaceSeeds('ws1', true)].some((seed) => seed.type.startsWith('project.'))).toBe(false);
  });
});
