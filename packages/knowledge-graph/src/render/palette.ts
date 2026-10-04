/**
 * Colour VALUES, read from the app's tokens at mount and on a theme change (spec §3.7). Sigma draws in WebGL and reads
 * values, never CSS variables (`knowledge-graph-sigma.html:460`). The keys ARE `packages/ui` token role names, so the
 * reader is `cssVariableName(role)` (Task 7). The twelve graph roles are `packages/ui` roles (27.255).
 */
export const PALETTE_ROLES = [
  'text', 'textMuted', 'textSubtle', 'surfaceRaised', 'surfaceSunken', 'shadow',
  'categoryOpen', 'categoryActive', 'categoryTerminal',
  'edgeStructure', 'edgeBlocks', 'edgeRelates', 'edgeDuplicates', 'edgeAttached', 'edgeReference', 'edgePeople', 'edgeConcept',
  'conceptFill', 'conceptSoft', 'fogDot', 'graphCardLine',
] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];
export type ThemePalette = Record<PaletteRole, string> & { dark: boolean };
