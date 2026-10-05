/**
 * The seventeen-name icon vocabulary for ticket types — enough to name the five
 * built-in seeds and the kinds of work a small workspace invents beside them
 * (open question 12: growing it is one entry in the map below).
 *
 * DRAWN HERE RATHER THAN IMPORTED, corrected against the shipped repo. The
 * plan's Task 11 snippet imports sixteen components from `lucide-react`, and
 * its Task 1 package.json snippet (plan line 345) lists `"lucide-react":
 * "^0.542.0"` as an app-core dependency. Neither is true of this repo as it
 * stands: `lucide-react` appears in no package.json in the workspace and
 * `node_modules/lucide-react` does not exist, so the plan's import would not
 * resolve. Adding a runtime dependency to a workspace that carries no icon
 * library at all — for seventeen glyphs rendered at 16px — costs more than it
 * buys, so the vocabulary is stroke-path data and `TypeIcon` renders it. The
 * exported contract is unchanged: `TYPE_ICONS`, `TYPE_ICON_NAMES`,
 * `TypeIcon({ name, size? })`, unknown names falling back to the folder.
 *
 * Nothing outside this module reads `TYPE_ICONS` as React components — the two
 * consumers are `IconPicker` (via `TYPE_ICON_NAMES`) and the list screen (via
 * `TypeIcon`), both in this task — so the shape change reaches no other file.
 * Colour is `currentColor`: the glyph inherits whatever role its container
 * already resolved, so it adds no colour of its own (packages/ui token
 * discipline).
 */
export type IconShape =
  | { readonly kind: 'path'; readonly d: string }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number };

export const TYPE_ICONS = {
  flag: [
    { kind: 'path', d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' },
    { kind: 'path', d: 'M4 22V15' },
  ],
  book: [
    { kind: 'path', d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' },
    { kind: 'path', d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  ],
  check: [{ kind: 'path', d: 'M20 6 9 17l-5-5' }],
  list: [
    { kind: 'path', d: 'M8 6h13' },
    { kind: 'path', d: 'M8 12h13' },
    { kind: 'path', d: 'M8 18h13' },
    { kind: 'path', d: 'M3 6h.01' },
    { kind: 'path', d: 'M3 12h.01' },
    { kind: 'path', d: 'M3 18h.01' },
  ],
  receipt: [
    { kind: 'path', d: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z' },
    { kind: 'path', d: 'M8 8h8' },
    { kind: 'path', d: 'M8 12h8' },
    { kind: 'path', d: 'M8 16h5' },
  ],
  'file-text': [
    { kind: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { kind: 'path', d: 'M14 2v6h6' },
    { kind: 'path', d: 'M8 13h8' },
    { kind: 'path', d: 'M8 17h8' },
  ],
  wrench: [{ kind: 'path', d: 'M15 2a5 5 0 0 0-4.6 7L2 17.4V22h4.6l8.4-8.4A5 5 0 1 0 15 2z' }],
  truck: [
    { kind: 'path', d: 'M1 3h15v13H1z' },
    { kind: 'path', d: 'M16 8h4l3 3v5h-7z' },
    { kind: 'circle', cx: 5.5, cy: 18.5, r: 2.5 },
    { kind: 'circle', cx: 18.5, cy: 18.5, r: 2.5 },
  ],
  phone: [
    {
      kind: 'path',
      d: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z',
    },
  ],
  mail: [
    { kind: 'path', d: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
    { kind: 'path', d: 'm22 6-10 7L2 6' },
  ],
  shield: [{ kind: 'path', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }],
  calendar: [
    { kind: 'path', d: 'M3 4h18v18H3z' },
    { kind: 'path', d: 'M16 2v4' },
    { kind: 'path', d: 'M8 2v4' },
    { kind: 'path', d: 'M3 10h18' },
  ],
  star: [{ kind: 'path', d: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z' }],
  folder: [
    { kind: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
  ],
  users: [
    { kind: 'path', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { kind: 'circle', cx: 9, cy: 7, r: 4 },
    { kind: 'path', d: 'M23 21v-2a4 4 0 0 0-3-3.9' },
    { kind: 'path', d: 'M16 3.1a4 4 0 0 1 0 7.8' },
  ],
  banknote: [
    { kind: 'path', d: 'M2 6h20v12H2z' },
    { kind: 'circle', cx: 12, cy: 12, r: 2 },
    { kind: 'path', d: 'M6 12h.01' },
    { kind: 'path', d: 'M18 12h.01' },
  ],
  // The built-in Decision's glyph (workflow-timeline-graphs DC-1, wtg2 T5).
  diamond: [{ kind: 'path', d: 'M12 2 22 12 12 22 2 12z' }],
} as const satisfies Record<string, readonly IconShape[]>;

export type TypeIconName = keyof typeof TYPE_ICONS;
export const TYPE_ICON_NAMES = Object.keys(TYPE_ICONS) as TypeIconName[];

/** Unknown icon names render the folder — icon strings are data and data never crashes the UI. */
export function TypeIcon(props: { name: string; size?: number }) {
  const shapes: readonly IconShape[] = TYPE_ICONS[props.name as TypeIconName] ?? TYPE_ICONS.folder;
  const size = props.size ?? 16;
  return (
    <svg
      className="type-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
    >
      {shapes.map((shape, at) =>
        shape.kind === 'path' ? (
          <path key={at} d={shape.d} />
        ) : (
          <circle key={at} cx={shape.cx} cy={shape.cy} r={shape.r} />
        ),
      )}
    </svg>
  );
}
