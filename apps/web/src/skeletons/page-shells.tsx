'use client';
import { Card, Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import type { ProjectTab } from '../use-last-project.js';
import { AppNavSkeleton } from './app-nav-skeleton.js';

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

export function ProjectPageSkeleton({ tab = 'board' }: { tab?: ProjectTab }) {
  return (
    <main id="gn-main" className="gn-shell gn-shell--wide gn-shell--skeleton" aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label="Loading the project">
        <Skeleton width="14rem" height="1rem" />
        <Skeleton className="gn-project__title-skeleton" width="18rem" height="var(--gn-title-page-size)" />
        <div className="gn-project__tabs-skeleton">
          {TAB_SHAPES.map((index) => <Skeleton key={index} shape="block" width="5rem" height="2.25rem" />)}
        </div>
        <Skeleton shape="block" height="2.75rem" />
        {tab === 'board' ? (
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
        ) : tab === 'calendar' ? (
          <Skeleton shape="block" height="32rem" />
        ) : tab === 'timeline' ? (
          <Skeleton shape="block" height="2.5rem" rows={6} />
        ) : (
          <Skeleton shape="block" height="3rem" rows={8} />
        )}
      </SkeletonRegion>
    </main>
  );
}

export function ListPageShell({ title, rows = 6, wide = false }: { title: string; rows?: number; wide?: boolean }) {
  return (
    <main id="gn-main" className={wide ? 'gn-shell gn-shell--wide gn-shell--skeleton' : 'gn-shell gn-shell--skeleton'} aria-busy="true">
      <AppNavSkeleton />
      <SkeletonRegion label={`Loading ${title}`}>
        <Skeleton className="gn-page-title" width="12rem" height="var(--gn-title-page-size)" />
        <div className="gn-shell__main">
          <Skeleton shape="block" height="3rem" rows={rows} />
        </div>
      </SkeletonRegion>
    </main>
  );
}

export function FormPageShell({ title, centred = false }: { title: string; centred?: boolean }) {
  return (
    <main id="gn-main" className={centred ? 'gn-shell gn-shell--centred gn-shell--skeleton' : 'gn-shell gn-shell--skeleton'} aria-busy="true">
      {centred ? null : <AppNavSkeleton />}
      <SkeletonRegion label={`Loading ${title}`}>
        <Skeleton className="gn-page-title" width="12rem" height="var(--gn-title-page-size)" />
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
            <Skeleton className="gn-page-title" width="8rem" height="var(--gn-title-page-size)" />
          </div>
          <div className="gn-notes__body">
            {/* The real CLOSED drawer (notes-page.tsx): at <=60rem the `--drawer` rule hides it and the body is one column, so the
                document does not jump when the page arrives; above 60rem it is the same 18rem column. */}
            <nav aria-label="Notes, loading" className="gn-notes__tree gn-notes__tree--drawer" data-open="false">
              <Skeleton height="1.25rem" rows={8} />
            </nav>
            <section className="gn-notes__document">
              <Skeleton width="60%" height="var(--gn-title-page-size)" />
              <Skeleton shape="block" height="var(--gn-notes-editor-min)" />
            </section>
          </div>
        </div>
      </SkeletonRegion>
    </main>
  );
}
