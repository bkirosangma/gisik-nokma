'use client';
import { Skeleton } from '@gisik-nokma/ui';
import { NavBrand } from '../nav-brand.js';

/**
 * The top bar while its content is on the way (smoothness T5, spec S1; amendment S-R1). It IS the real bar: `.gn-nav`, its
 * `.gn-nav__inner` and the shared `NavBrand` paint the box, the brand and the depth in every style, and only the link
 * labels and the avatar are placeholder parts, so nothing here names a container style. No link, no button: a hop in
 * flight offers nothing to press. `.gn-nav__more` and the phone arms hide the link row exactly where the real bar hides it.
 */
export function AppNavSkeleton() {
  return (
    <nav className="gn-nav gn-nav--skeleton" aria-busy="true" aria-label="Main, loading">
      <div className="gn-nav__inner">
        <NavBrand link={false} />
        <div className="gn-nav__links gn-nav__links--member">
          <div className="gn-nav__more">
            <Skeleton width="5.5rem" height="1rem" />
            <Skeleton width="7rem" height="1rem" />
            <Skeleton width="5rem" height="1rem" />
            <Skeleton width="4.5rem" height="1rem" />
          </div>
          <span className="gn-nav__spacer" />
        </div>
        <div className="gn-nav__corner">
          <Skeleton shape="circle" width="2rem" height="2rem" />
        </div>
      </div>
    </nav>
  );
}
