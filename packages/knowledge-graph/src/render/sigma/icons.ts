import type { IconSpec } from '../node-attributes.js';
import type { ThemePalette } from '../palette.js';
export { initialsOf } from '../initials.js';

const cache = new Map<string, string>();
const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** One data URI per (icon, palette): a theme change yields NEW URIs, so the texture cache cannot serve a stale theme (Review Focus 3). */
export function iconUri(spec: IconSpec, P: ThemePalette): string {
  const key = `${spec.kind}|${spec.kind === 'person' ? spec.initials : ''}|${P.textMuted}|${P.surfaceSunken}|${P.surfaceRaised}|${P.text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const stroke = `fill="none" stroke="${P.textMuted}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"`;
  const body =
    spec.kind === 'person'
      ? `<circle cx="32" cy="32" r="32" fill="${P.surfaceSunken}"/><text x="32" y="40.5" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Helvetica,sans-serif" font-size="23" font-weight="700" fill="${P.text}">${escapeXml(spec.initials)}</text>`
      : spec.kind === 'note'
        ? `<circle cx="32" cy="32" r="32" fill="${P.surfaceRaised}"/><path d="M20 13h16l10 10v28H20z" ${stroke}/><path d="M36 13v10h10" ${stroke}/>`
        : `<circle cx="32" cy="32" r="32" fill="${P.surfaceSunken}"/><path d="M13 21.5a3 3 0 0 1 3-3h9l3.5 4h19.5a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3z" ${stroke}/>`;
  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${body}</svg>`);
  cache.set(key, uri);
  return uri;
}
