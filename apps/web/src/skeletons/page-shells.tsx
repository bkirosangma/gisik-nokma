'use client';
import { Card, Skeleton, SkeletonRegion, Table, type TableColumn } from '@gisik-nokma/ui';
import type { ProjectTab } from '../use-last-project.js';
import { AppNavSkeleton } from './app-nav-skeleton.js';
import { AttentionBandSkeleton, MyWorkSkeleton } from './screen-skeletons.js';

/**
 * Route shells (smoothness T5, spec D5/S1; amendment S-R1). Each is the page's OWN outer container (`main.gn-shell` and its
 * modifiers, the real nav bar, the page-title position, `.gn-shell__main`, the board's own column and card classes) with
 * the text, pills and avatars as placeholder parts, so the swap to content moves nothing. The ids: `gn-main` is the skip
 * link's target on every route, so the shell carries it too. `.gn-skeleton-region` is `display: contents` inside a shell
 * (globals.css), so the wrapper that names the loading sentence adds no box. `'use client'`: the `loading.tsx` files are server components, and
 * `@gisik-nokma/ui`'s barrel (hooks, dialogs) may only be imported from a client module.
 */
const TAB_SHAPES = [0, 1, 2, 3, 4];

function BoardCardSkeleton() {
  return (
    <li>
      <Card className="gn-board-card">
        <Skeleton width="40%" height="0.75rem" />
        <Skeleton width="90%" height="1rem" />
        <Skeleton width="65%" height="1rem" />
        <div className="gn-board-card__meta">
          <Skeleton shape="block" width="3.5rem" height="1.25rem" />
          <Skeleton shape="block" width="2.5rem" height="1.25rem" />
          <Skeleton shape="circle" width="1.5rem" height="1.5rem" />
        </div>
      </Card>
    </li>
  );
}

const LIST_COLUMNS: TableColumn<number>[] = [
  { id: 'key', header: <Skeleton width="3rem" height="0.75rem" />, cell: () => <Skeleton width="4rem" height="0.875rem" /> },
  { id: 'title', header: <Skeleton width="4rem" height="0.75rem" />, cell: () => <Skeleton width="85%" height="1rem" /> },
  { id: 'state', header: <Skeleton width="3rem" height="0.75rem" />, cell: () => <Skeleton shape="block" width="4.5rem" height="1.25rem" /> },
  { id: 'assignee', header: <Skeleton width="4rem" height="0.75rem" />, cell: () => <Skeleton shape="circle" width="1.5rem" height="1.5rem" /> },
  { id: 'due', header: <Skeleton width="2.5rem" height="0.75rem" />, cell: () => <Skeleton width="4rem" height="0.875rem" /> },
];
const LIST_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The project page's tab body (smoothness T5 and T6; spec S1, amendment S-R1): ONE shape per tab, shared by the route's
 * Suspense fallback and by the page's five wait arms, so the swap from either to the real view moves nothing. The board is its
 * own rail, column and card; the list is its own `.gn-list` > `.gn-list__table-wrap` > `table.gn-table` with the real row class
 * (the `Table` component itself, so the box model is the table's, not an imitation of it). The calendar, timeline and backlog
 * keep T5's block shapes: their real views are drawn from data the skeleton has no way to size.
 */
export function ProjectTabBodySkeleton({ tab }: { tab: ProjectTab }) {
  if (tab === 'board') {
    return (
      <div className="gn-board__rail">
        {[0, 1, 2].map((column) => (
          <section key={column} className="gn-board__column">
            <header className="gn-board__column-header">
              <Skeleton shape="block" width="6rem" height="1.5rem" />
            </header>
            <ul className="gn-board__cards">
              {[0, 1, 2].map((card) => <BoardCardSkeleton key={card} />)}
            </ul>
          </section>
        ))}
      </div>
    );
  }
  if (tab === 'list') {
    return (
      <div className="gn-list">
        <div className="gn-list__table-wrap">
          <Table
            columns={LIST_COLUMNS}
            rows={LIST_ROWS}
            rowKey={(row) => String(row)}
            className="gn-list__table"
            rowClassName="gn-list__table-row"
          />
        </div>
      </div>
    );
  }
  if (tab === 'calendar') return <Skeleton shape="block" height="32rem" />;
  if (tab === 'timeline') return <Skeleton shape="block" height="2.5rem" rows={6} />;
  return <Skeleton shape="block" height="3rem" rows={8} />;
}

export function ProjectPageSkeleton({ tab = 'board' }: { tab?: ProjectTab }) {
  return (
    <main id="gn-main" className="gn-shell gn-shell--wide gn-shell--skeleton" aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label="Loading the project">
        {/* The page's own head, scope row and tab rail (smoothness-2 G1, 25.240): the real container classes with the text as
            placeholder parts, at the real line heights, so the route's fallback swaps for the page without moving the board. */}
        <div className="gn-project">
          <div className="gn-project__head">
            <div className="gn-project__identity">
              <p className="gn-project__breadcrumb">
                <Skeleton width="14rem" height="1.125rem" />
              </p>
              <div className="gn-project__title-row">
                <Skeleton className="gn-project__title-skeleton gn-skeleton--title" width="18rem" />
              </div>
            </div>
            <div className="gn-project__header">
              <Skeleton shape="block" className="gn-project__search-slot" width="12.5rem" height="2.75rem" />
              <Skeleton shape="block" className="gn-project__filters" width="5rem" height="2.75rem" />
              <Skeleton shape="block" className="gn-project__create-slot" width="11rem" height="3rem" />
            </div>
          </div>
          <p className="gn-project__scope-row" />
          <div className="gn-segmented gn-project__rail">
            {TAB_SHAPES.map((index) => <Skeleton key={index} shape="block" width="5rem" height="2.75rem" />)}
          </div>
          <ProjectTabBodySkeleton tab={tab} />
        </div>
      </SkeletonRegion>
    </main>
  );
}

export function ListPageShell({ title, rows = 6, wide = false }: { title: string; rows?: number; wide?: boolean }) {
  return (
    <main id="gn-main" className={wide ? 'gn-shell gn-shell--wide gn-shell--skeleton' : 'gn-shell gn-shell--skeleton'} aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label={`Loading ${title}`}>
        <Skeleton className="gn-page-title gn-skeleton--title" width="12rem" />
        <div className="gn-shell__main">
          <Skeleton shape="block" height="3rem" rows={rows} />
        </div>
      </SkeletonRegion>
    </main>
  );
}

/**
 * The global My work page while its segment loads (my-work-global T4): the shell, a title
 * block, then the SAME band and section skeletons the page draws while its reads are out, so
 * the route's wireframe and the page's own pending state are one shape.
 */
export function MyWorkPageShell() {
  return (
    <main id="gn-main" className="gn-shell gn-shell--skeleton" aria-busy="true">
      <AppNavSkeleton />
      <Skeleton className="gn-page-title" width="12rem" height="var(--gn-title-page-size)" />
      <div className="gn-shell__main">
        <AttentionBandSkeleton />
        <MyWorkSkeleton />
      </div>
    </main>
  );
}

export function FormPageShell({ title, centred = false }: { title: string; centred?: boolean }) {
  return (
    <main id="gn-main" className={centred ? 'gn-shell gn-shell--centred gn-shell--skeleton' : 'gn-shell gn-shell--skeleton'} aria-busy="true">
      {centred ? null : <AppNavSkeleton />}
      <SkeletonRegion label={`Loading ${title}`}>
        <Skeleton className="gn-page-title gn-skeleton--title" width="12rem" />
        <Skeleton shape="block" height="18rem" />
      </SkeletonRegion>
    </main>
  );
}

export function NotesPageShell() {
  return (
    <main id="gn-main" className="gn-shell gn-shell--wide gn-notes-page gn-shell--skeleton" aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label="Loading your notes">
        <div className="gn-notes">
          <div className="gn-notes__header">
            <Skeleton className="gn-page-title gn-skeleton--title" width="8rem" />
          </div>
          <div className="gn-notes__body">
            {/* The real CLOSED drawer (notes-page.tsx): at <=60rem the `--drawer` rule hides it and the body is one column, so the
                document does not jump when the page arrives; above 60rem it is the same 18rem column. */}
            <nav aria-label="Notes, loading" className="gn-notes__tree gn-notes__tree--drawer" data-open="false">
              <Skeleton height="1.25rem" rows={8} />
            </nav>
            <section className="gn-notes__document">
              <Skeleton className="gn-skeleton--title" width="60%" />
              <Skeleton shape="block" height="var(--gn-notes-editor-min)" />
            </section>
          </div>
        </div>
      </SkeletonRegion>
    </main>
  );
}
