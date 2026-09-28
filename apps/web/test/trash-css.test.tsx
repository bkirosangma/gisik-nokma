import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DeletedItem } from '@gisik-nokma/domain';
import {
  DeleteDialog,
  DeletedItemsSection,
  makeSubmittedFactory,
  type DataSourceQuery,
} from '@gisik-nokma/app-core';

/**
 * Case 19.258 (trash Plan 4). Every class the trash UI renders has a rule in
 * the ONE delimited `trash-4-ui` block at the end of `globals.css`, and none is
 * styled outside it — so a merge with another lane's globals.css edit (PR #738
 * touches this file) is an append, and a class that lost its rule is caught
 * here rather than as raw UA chrome in a screenshot.
 *
 * Two witnesses: the classes the two shared components ACTUALLY render (so a
 * new class in either cannot slip past), and the page-side classes, which live
 * in `apps/web` and are listed by hand below.
 */

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app/globals.css'), 'utf8');
const BEGIN = '/* ══ trash-4-ui: begin';
const END = '/* ══ trash-4-ui: end ══ */';
const TRASH_PREFIX = /^gn-(delete-dialog|deleted-items|card-menu|trash-notice)/;
const PAGE_CLASSES = [
  'gn-trash-notice',
  'gn-workspace-card--menu',
  'gn-workspace-card--archived',
  'gn-card-menu',
  'gn-card-menu__trigger',
  'gn-card-menu__list',
  'gn-card-menu__item',
  'gn-workspaces__archived',
  'gn-workspaces__archived-heading',
  'gn-workspace-list--archived',
];

function classesIn(css: string): Set<string> {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...stripped.matchAll(/\.(gn-[A-Za-z0-9_-]+)/g)].map((hit) => hit[1]!));
}

const MARKED: DeletedItem = {
  kind: 'workspace', id: 'ws9', workspaceId: 'ws9', workspaceName: 'Old Shop', projectId: null, projectName: null,
  label: 'Old Shop', deletedBy: 'u1', deletedByName: 'Kiro', deletedAt: '2026-09-30T10:00:00.000Z',
  purgeMarkedAt: '2026-09-30T11:00:00.000Z', purgeDueAt: '2026-10-15T11:00:00.000Z', containedCount: 3,
};

describe('19.258 the trash-4-ui block styles every trash class, and only it does', () => {
  it('19.258 rendered and page classes are all in the block; CONTROL: the block exists once', async () => {
    expect(CSS.split(BEGIN)).toHaveLength(2);
    expect(CSS.split(END)).toHaveLength(2);
    const start = CSS.indexOf(BEGIN);
    const end = CSS.indexOf(END) + END.length;
    expect(start).toBeLessThan(end);
    const inBlock = classesIn(CSS.slice(start, end));
    const outside = classesIn(CSS.slice(0, start) + CSS.slice(end));

    render(
      <DeleteDialog
        open
        kind="workspace"
        name="Old Shop"
        workspaceId="ws9"
        entityId="ws9"
        dataSource={{ ingest: async () => [] }}
        make={makeSubmittedFactory({ actorId: 'u1', origin: 'web' })}
        onCancel={() => undefined}
        onDeleted={() => undefined}
      />,
    );
    render(
      <DeletedItemsSection
        dataSource={{
          ingest: async () => [],
          query: { getDeletedItems: async () => [MARKED] } as unknown as DataSourceQuery,
        }}
        currentUserId="u1"
        now={() => new Date('2026-10-01T00:00:00.000Z')}
      />,
    );
    await screen.findByText('Old Shop', { selector: '.gn-deleted-items__label' });

    const rendered = new Set(
      [...document.body.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
        [...element.classList].filter((name) => TRASH_PREFIX.test(name)),
      ),
    );
    expect(rendered.size).toBeGreaterThan(5);
    expect([...rendered, ...PAGE_CLASSES].filter((name) => !inBlock.has(name))).toEqual([]);
    expect([...outside].filter((name) => TRASH_PREFIX.test(name))).toEqual([]);
  });
});
