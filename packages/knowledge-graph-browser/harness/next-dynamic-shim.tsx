import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';

/**
 * `next/dynamic` for the Vite harness (vite.config.ts aliases it here), so a harness can mount the web app's own Home
 * components unchanged: `dynamic(load, { loading })` is `React.lazy` behind a `Suspense` whose fallback is `loading`.
 * `ssr` means nothing in a browser-only page.
 */
export default function dynamic<P extends object>(load: () => Promise<ComponentType<P>>, options: { ssr?: boolean; loading?: () => ReactNode } = {}) {
  const Lazy = lazy(async () => ({ default: await load() }));
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={options.loading?.() ?? null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
