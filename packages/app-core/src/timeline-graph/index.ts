/**
 * The Timeline graph's drawing layer (WTG Part 4 T2): day arithmetic, the draw list, its bucket index and the windowed
 * painter. `attachDriver` is re-exported so the browser harness measures the product's own bridge to Part 1's adapter;
 * `bridge.ts` stays the only file here that imports `@gisik-nokma/viewport`.
 */
export * from './days.js';
export * from './draw-types.js';
export * from './draw-index.js';
export * from './painter.js';
export { attachDriver, type AttachOptions, type Windowed } from './bridge.js';
