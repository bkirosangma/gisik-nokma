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
