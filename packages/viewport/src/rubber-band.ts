/**
 * Past a pan limit the surface rubber-bands with power 0.3 and springs back 160 ms after the last input (spec VP-7;
 * the same `RUBBER_POWER = 0.3` and `SETTLE_MS = 160` as the camera in the Knowledge Graph view plan,
 * `docs/superpowers/plans/2026-10-03-knowledge-graph-view.md` on `docs/kg-plans-cd`, its `engine/camera.ts`).
 *
 * The Knowledge Graph applies the power to a zoom RATIO (`lo * (r / lo) ** 0.3`). A pan offset is linear, so the
 * same power is applied to the overshoot as a curve with unit slope at the limit (`rubberOvershoot`): the first
 * pixel past the limit moves one pixel, and each further pixel moves less, up to `extent` of resistance scale.
 */
export const RUBBER_POWER = 0.3;
export const SPRING_BACK_MS = 160;

/** The displayed overshoot for a raw overshoot `over` >= 0. `extent` is the viewport's size along the axis (> 0). */
export function rubberOvershoot(over: number, extent: number): number {
  if (over <= 0) return 0;
  return (extent * (Math.pow(1 + over / extent, RUBBER_POWER) - 1)) / RUBBER_POWER;
}

/** The displayed offset for a raw `offset` and the limits [min, max]: inside is unchanged, outside is resisted. */
export function rubber(offset: number, min: number, max: number, extent: number): number {
  if (offset < min) return min - rubberOvershoot(min - offset, extent);
  if (offset > max) return max + rubberOvershoot(offset - max, extent);
  return offset;
}

/** The nearest offset inside [min, max]: where the spring-back goes. */
export function clampOffset(offset: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, offset));
}
