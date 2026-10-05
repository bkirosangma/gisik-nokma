import { cssVariableName, type TokenRole } from '@gisik-nokma/ui/tokens';
import { PALETTE_ROLES, type ThemePalette } from '../render/palette.js';

/** Below this relative luminance the card fill is a dark theme's (measured: light fills 0.83–0.94, dark 0.018–0.024). */
export const DARK_LUMINANCE = 0.5;

/** WCAG relative luminance of a `#rrggbb` or `#rrggbbaa` value (alpha ignored); NaN for anything else, which reads as light. */
function luminance(value: string): number {
  const m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value);
  if (m === null) return Number.NaN;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Port of `readPalette` (`knowledge-graph-sigma.html:461-463`), over the app's own variables. Sigma takes values, never
 * `var(--…)`. `dark` is read from what is PAINTED: the resolved card fill (`surfaceRaised`) is dark. The mockup read
 * `color-scheme`, which no app stylesheet sets, so every data-theme / OS-dark / data-style combination follows the
 * tokens with no selector copied here (planner ruling 2026-10-04, KV5).
 */
export function readThemePalette(el: Element): ThemePalette {
  const cs = getComputedStyle(el);
  const out = {} as ThemePalette;
  for (const role of PALETTE_ROLES) out[role] = cs.getPropertyValue(cssVariableName(role as TokenRole)).trim();
  out.dark = luminance(out.surfaceRaised) < DARK_LUMINANCE;
  return out;
}

/** A theme change is a `data-theme` / `data-style` flip on <html> OR an OS scheme flip under no `data-theme` (Review Focus 3). */
export function watchTheme(cb: () => void): () => void {
  const mo = new MutationObserver(() => cb());
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-style'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onMq = () => cb();
  mq.addEventListener('change', onMq);
  return () => {
    mo.disconnect();
    mq.removeEventListener('change', onMq);
  };
}
