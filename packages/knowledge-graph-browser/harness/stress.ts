import { runStress } from '@gisik-nokma/knowledge-graph/stress';
import { MOCKUP_LIGHT } from './mockup-palette.js';
const out = document.getElementById('out')!;
async function go() {
  out.textContent = 'running…';
  const r = await runStress(document.getElementById('sg')!, MOCKUP_LIGHT);
  (window as unknown as { __stress: unknown }).__stress = r;
  out.textContent = `${r.cards} cards, ${r.fog} fog dots, ${r.edges} edges: ${r.fps} frames a second, slowest frame ${r.worstMs} ms\n${r.renderer}\n${navigator.userAgent}`;
}
document.getElementById('run')!.addEventListener('click', () => void go());
if (new URLSearchParams(location.search).has('auto')) void go();
