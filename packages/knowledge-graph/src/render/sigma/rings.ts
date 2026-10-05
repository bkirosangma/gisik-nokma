import { radius, type RingConfig } from '../../engine/layout.js';
import type { KgSigma } from './program.js';

const SVG = 'http://www.w3.org/2000/svg';
/** Ring lines ("1 hop", "2 hops") and the soft fog band (`knowledge-graph-sigma.html:868-875`), redrawn in the SAME frame as the canvas from graphToViewport. */
export function drawRings(svg: SVGSVGElement, sigma: KgSigma, cfg: RingConfig, clearHop: number, phone: boolean, hasFog: boolean): void {
  const c = sigma.graphToViewport({ x: 0, y: 0 });
  const R = (h: number) => {
    const [rx, ry] = radius(cfg.R, h);
    return [sigma.graphToViewport({ x: rx, y: 0 }).x - c.x, c.y - sigma.graphToViewport({ x: 0, y: ry }).y] as const;
  };
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (hasFog) {
    const [fx, fy] = R(clearHop + 1);
    const band = document.createElementNS(SVG, 'ellipse');
    Object.entries({ class: 'gn-kg__fog-band', cx: c.x, cy: c.y, rx: fx * 1.08, ry: fy * 1.08 }).forEach(([k, v]) => band.setAttribute(k, String(v)));
    svg.appendChild(band);
  }
  for (let h = clearHop; h >= 1; h -= 1) {
    const [rx, ry] = R(h);
    const ring = document.createElementNS(SVG, 'ellipse');
    Object.entries({ class: 'gn-kg__ring', cx: c.x, cy: c.y, rx, ry }).forEach(([k, v]) => ring.setAttribute(k, String(v)));
    svg.appendChild(ring);
    if (!phone) {
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('class', 'gn-kg__ring-label');
      label.setAttribute('x', (c.x + rx * Math.cos(-0.2)).toFixed(1));
      label.setAttribute('y', (c.y + ry * Math.sin(-0.2) - 8).toFixed(1));
      label.setAttribute('text-anchor', 'end');
      label.textContent = `${h} hop${h > 1 ? 's' : ''}`;
      svg.appendChild(label);
    }
  }
}
