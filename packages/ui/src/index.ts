export {
  CONTRAST_PAIRS,
  TOKEN_ROLES,
  colorOf,
  cssVariableName,
  primitives,
  radii,
  radiusOf,
  radiusVariableName,
  shadowValueOf,
  shadowVariableName,
  themeStylesheet,
  themes,
  type PrimitiveName,
  type RadiusRole,
  type ShadowRole,
  type StyleName,
  type ThemeName,
  type TokenRole,
} from './tokens.js';
export { AVATAR_TINTS, Avatar, initialsOf, tintIndexOf, type AvatarProps } from './components/avatar.js';
export { Button, type ButtonProps, type ButtonVariant } from './components/button.js';
export { Card, type CardProps } from './components/card.js';
export { Chip, type ChipProps, type ChipTone } from './components/chip.js';
// `NoteBadge` (notes series Plan 5, spec §10.2) — a note named on another
// surface: the ticket's Notes section (Plan 6) and the note's own byline. The
// truncation constant and `truncateNoteTitle` leave with it so a caller that
// needs the rule does not re-spell it.
export {
  NoteBadge,
  NOTE_BADGE_TITLE_MAX,
  truncateNoteTitle,
  type NoteBadgeProps,
} from './components/note-badge.js';
export { Dialog, type DialogProps } from './components/dialog.js';
export { InfoTip, type InfoTipProps } from './components/info-tip.js';
export { Popover, type PopoverProps } from './components/popover.js';
export { Toast, TOAST_DEFAULT_DURATION_MS, type ToastProps, type ToastTone } from './components/toast.js';
export { SegmentedControl } from './components/segmented-control.js';
export type { SegmentedOption, SegmentedControlProps } from './components/segmented-control.js';
export { Sheet, type SheetProps } from './components/sheet.js';
export { Switch, type SwitchProps } from './components/switch.js';
export { Table, type TableColumn, type TableProps } from './components/table.js';
export { Select, type SelectOption, type SelectProps } from './select/select.js';
export { useScrollEdges } from './use-scroll-edges.js';
// ONE glyph, exported on its own terms. `RemoveIcon` is the 12px ✕ the Select's
// own clear control draws, and `apps/web`'s bulk-close cancel needs the same
// one beside the button it cancels (owner request, 2026-09-22). The alternative
// — a second, inline copy of the path data in the page — is the two-spellings
// defect this product keeps recording, and its failure mode is invisible: a
// drifted copy still renders, just not the design system's ✕. The other two
// icons stay internal because nothing outside the Select has asked for them; a
// barrel that exports a family "for symmetry" is a surface nobody chose.
export { RemoveIcon } from './select/select-icons.js';
// The Notes destination's glyph (notes series Plan 5, spec §9.1), exported on
// the same terms and for the same reason as `RemoveIcon` above: the consumer is
// `apps/web`'s nav, which cannot reach into a package's `select/` directory, and
// a second inline copy of the path data is the two-spellings defect with no
// visible symptom. A barrel that exports a family "for symmetry" is a surface
// nobody chose — so this is one glyph, and the other new consumers ask.
export { PageIcon } from './select/select-icons.js';
// The board card's priority badge and epic chip (owner request, 2026-09-23).
// Same precedent as `RemoveIcon`/`PageIcon` immediately above: the real
// consumer, `packages/app-core`'s `board.tsx`, cannot reach into `icons/`
// directly, and a second inline copy of any one of these paths is the
// two-spellings defect this barrel exists to avoid. All four ship together
// because the one consumer needs all four, not "for symmetry".
export { FireIcon, LeafIcon, SnowflakeIcon, FlagIcon } from './icons/priority-icons.js';
// The Create workspace / Create project / Create ticket buttons' `+` (prefixes/groups
// Task 8). Three consumers in two packages (`app-core`'s create-ticket flow, `apps/web`'s
// two pages), none of which can reach into `icons/`; one glyph, exported on the same
// terms as the icons above.
export { PlusIcon } from './icons/plus-icon.js';
// The workspace home's Rename cue (UX fixes Task 10, 23.177): one glyph, same terms as `PlusIcon`.
export { PencilIcon } from './icons/pencil-icon.js';
