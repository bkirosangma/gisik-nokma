import { CameraAdapter } from '@gisik-nokma/viewport';

/**
 * The Workflow graph's engine in a real browser: a 2D camera over one transformed layer. 60 world-unit squares on a grid so a
 * test can read where a world point lands on screen. `?reduced=1` forces reduced motion.
 */
const params = new URLSearchParams(location.search);
const view = document.getElementById('view') as HTMLElement;
const layer = document.getElementById('layer') as HTMLElement;
for (let i = 0; i < 60; i += 1) {
  const node = document.createElement('div');
  node.className = 'node';
  node.dataset['world'] = `${(i % 10) * 200},${Math.floor(i / 10) * 120}`;
  node.style.cssText = `position:absolute;left:${(i % 10) * 200}px;top:${Math.floor(i / 10) * 120}px;width:160px;height:80px;background:#2f5f9e`;
  layer.appendChild(node);
}
const camera = new CameraAdapter({
  element: view,
  layer,
  minZoom: 0.25,
  maxZoom: 3,
  start: { x: 0, y: 0, zoom: 1 },
  ...(params.has('reduced') ? { reducedMotion: () => true } : {}),
});
(window as unknown as { __camera: CameraAdapter }).__camera = camera;
