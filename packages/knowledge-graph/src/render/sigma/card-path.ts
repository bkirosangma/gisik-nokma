/**
 * The edge path that ends a directed edge at its target's CARD border (owner ruling B, 2026-10-05; spec §4.2 trap 10).
 * A straight line, like Sigma's `pathLine`, whose far end is pulled back from the target's centre to the border of the card
 * Sigma draws there, plus `ARROW_GAP_PX`. Sigma's own clamp then never finds the target's dot (the end is outside it), so the
 * arrowhead's tip sits on that point. The card arrives per edge, in screen px, as the variables below (`cardShape`, card-box.ts).
 */
export const ARROW_GAP_PX = 1.5;

const FLOAT = 0x1406; // WebGL2RenderingContext.FLOAT, spelled out: the package also loads under node, which has no WebGL globals
const NAMES = ['kgNodeR', 'kgNodeC', 'kgBoxX', 'kgBoxY', 'kgBoxW', 'kgBoxH', 'kgBoxC'] as const;
export type CardVariable = (typeof NAMES)[number];

const glsl = /* glsl */ `
float kg_box(vec2 p, vec2 h, float r) {
  vec2 d = abs(p) - h + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
// the card, in px around the target's centre (y down): the padded node shape, union the label box
float kg_card(vec2 p) {
  float s = kg_box(p, vec2(v_kgNodeR), v_kgNodeC);
  return v_kgBoxW > 0.0 ? min(s, kg_box(p - vec2(v_kgBoxX, v_kgBoxY), vec2(v_kgBoxW, v_kgBoxH), v_kgBoxC)) : s;
}
vec2 kg_end(vec2 source, vec2 target) {
  vec2 d = source - target;
  float len = length(d);
  if (v_kgNodeR <= 0.0 || len < 1e-9) return target;
  vec2 u = d / len;
  vec2 su = vec2(u.x, -u.y);
  float lo = 0.0, hi = length(abs(vec2(v_kgBoxX, v_kgBoxY)) + vec2(v_kgBoxW, v_kgBoxH)) + 1.5 * v_kgNodeR + 1.0;
  for (int i = 0; i < 16; i++) {
    float mid = (lo + hi) * 0.5;
    if (kg_card(su * mid) < 0.0) lo = mid; else hi = mid;
  }
  // px -> graph units as Sigma converts a node size (GLSL_NODE_SIZE_TO_PIXELS: x 2); a source inside the card collapses the line onto it
  return target + u * min((hi + ${ARROW_GAP_PX.toFixed(2)}) * 2.0 * u_correctionRatio / u_sizeRatio, len);
}
vec2 path_kgcard_position(float t, vec2 source, vec2 target) {
  return mix(source, kg_end(source, target), t);
}
float path_kgcard_length(vec2 source, vec2 target) {
  return length(kg_end(source, target) - source);
}
`;

/** The card variables, declared on the edge program too, so the edge styles may set them. */
export const CARD_VARIABLES = Object.fromEntries(NAMES.map((name) => [name, { type: 'number' as const, default: 0 }])) as Record<CardVariable, { type: 'number'; default: 0 }>;

export function pathToCard() {
  return {
    name: 'kgcard',
    segments: 1,
    minBodyLengthRatio: 0,
    linearParameterization: true,
    glsl,
    uniforms: [],
    attributes: NAMES.map((name) => ({ name, size: 1, type: FLOAT })),
    variables: CARD_VARIABLES,
  };
}
