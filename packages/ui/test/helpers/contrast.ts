/** WCAG 2.x contrast, and alpha compositing — the one copy the styling-refresh tests share. */
function channel(pair: string): number {
  const srgb = Number.parseInt(pair, 16) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex.slice(1, 3)) + 0.7152 * channel(hex.slice(3, 5)) + 0.0722 * channel(hex.slice(5, 7));
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `src` (#rrggbb or #rrggbbaa) composited over the opaque `dst`. */
export function over(src: string, dst: string): string {
  const byte = (hex: string, i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  const alpha = src.length === 9 ? byte(src, 7) / 255 : 1;
  return `#${[1, 3, 5]
    .map((i) => Math.round(byte(src, i) * alpha + byte(dst, i) * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')}`;
}
