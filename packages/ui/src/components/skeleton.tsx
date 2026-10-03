import type { CSSProperties, ReactNode } from 'react';

export type SkeletonShape = 'line' | 'block' | 'circle' | 'card';
export type SkeletonProps = { shape?: SkeletonShape; width?: string; height?: string; rows?: number; className?: string };

/**
 * One PART of a structural skeleton (spec S1, S3; amendment S-R1, 2026-10-02). A screen's skeleton renders the real component's OWN
 * container classes and fills it with these: `line` for text, `circle` for an avatar, `block` for a pill or a chip. `card` stays only as
 * a fallback for a region with no real component. Decoration only: aria-hidden, never focusable.
 */
export function Skeleton({ shape = 'line', width, height, rows = 1, className }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) (style as Record<string, string>)['--gn-skeleton-w'] = width;
  if (height !== undefined) (style as Record<string, string>)['--gn-skeleton-h'] = height;
  const classes = ['gn-skeleton', `gn-skeleton--${shape}`, className].filter(Boolean).join(' ');
  const one = (key: number) => <span key={key} className={classes} style={style} aria-hidden="true" />;
  if (rows <= 1) return one(0);
  return <span className="gn-skeleton__rows">{Array.from({ length: rows }, (_, index) => one(index))}</span>;
}

export type SkeletonRegionProps = { label: string; children: ReactNode; className?: string; as?: 'div' | 'section' | 'li' };

/** The region a set of skeletons stands in: busy, named once for assistive tech (spec §5). */
export function SkeletonRegion({ label, children, className, as: Tag = 'div' }: SkeletonRegionProps) {
  return (
    <Tag className={['gn-skeleton-region', className].filter(Boolean).join(' ')} aria-busy="true">
      <span className="gn-visually-hidden">{label}</span>
      {children}
    </Tag>
  );
}
