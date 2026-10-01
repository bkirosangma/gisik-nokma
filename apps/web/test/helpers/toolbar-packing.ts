import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRules, ruleExactly, valueOf } from '../../../../packages/ui/test/helpers/css-rules.js';

/**
 * The toolbar packing MODEL shared by 21.137 (the Notes page) and 21.236 / 21.237 (the ticket sheet and the
 * new-ticket dialog). jsdom has no layout, so the row count is a MODEL: the real bar (rendered from the real
 * component) packed greedily by the widths its CSS declares — group by group, wrapping at the toolbar's content
 * box, exactly as a `flex-wrap: wrap` row does. Anchored to browser measurements (21.137): the pre-#875 bar
 * packed this way is the FIVE rows T13 measured at 360; the fixed bar was measured at 2 rows / 106px.
 *
 * A group that is NOT allowed to wrap (the base `.ticket-editor__tool-group` has no `flex-wrap`) and is wider
 * than the row is not broken across lines: it overflows the row, and `.editor-slot { overflow: hidden }`
 * clips it. That is the audit's cut-off row (BRD-08), and `widest > room` is how the model reports it.
 */
export const PHONE = '@media (max-width: 40rem)';
export const EDITOR_CSS_PATH = resolve(__dirname, '../../../../packages/editor/src/styles/editor.css');
export const readEditorCss = (): string => readFileSync(EDITOR_CSS_PATH, 'utf8');

/** Measured in the browser (21.137): the heading `<select>` ("Paragraph") at the phone's font, in every style. */
export const SELECT_WIDTH = 97.5;

export const px = (value: string | null, fallback: number): number => {
  if (value === null) return fallback;
  const rem = /^([\d.]+)rem$/.exec(value.trim());
  if (rem !== null) return Number(rem[1]) * 16;
  const pixels = /^([\d.]+)px$/.exec(value.trim());
  return pixels === null ? fallback : Number(pixels[1]);
};

export interface PackingRules {
  /** The toolbar's own `gap` (between groups). */
  gap: number;
  /** A group's `gap` (between tools). */
  groupGap: number;
  /** Left + right padding of the toolbar. */
  sidePadding: number;
  toolWidth: number;
  /** What a divider costs a group (width + margins + the group gap), 0 when `display: none`. */
  dividerWidth: number;
  /** Whether a group may wrap onto its own further lines. */
  groupWraps: boolean;
}

/** The toolbar's declared box model, read from the sheet. The tool/divider/wrap values come from `source`. */
export function packingRules(css: string, source: { phone: boolean }): PackingRules {
  const at = source.phone ? PHONE : null;
  const toolbar = ruleExactly(css, '.ticket-editor__toolbar');
  const padding = (valueOf(toolbar, 'padding') ?? '').split(/\s+/).map((part) => px(part, 0));
  // The phone arm may narrow the side padding (`padding-left` / `padding-right`), which the base shorthand then yields to.
  const armToolbar = source.phone ? parseRules(css).filter((rule) => rule.atRule === PHONE && rule.selectors.join(', ') === '.ticket-editor__toolbar') : [];
  const side = (property: 'padding-left' | 'padding-right', fallback: number): number =>
    armToolbar.reduce((value, rule) => px(valueOf(rule.body, property), value), fallback);
  const groupGap = px(valueOf(ruleExactly(css, '.ticket-editor__tool-group'), 'gap'), 0);
  const dividerBase = ruleExactly(css, '.ticket-editor__tool-divider');
  const margin = (valueOf(dividerBase, 'margin') ?? '0 0').split(/\s+/).map((part) => px(part, 0));
  const phoneRule = (selector: string): string => (source.phone ? ruleExactly(css, selector, PHONE) : '');
  const toolRule = source.phone ? phoneRule('.ticket-editor__tool') : ruleExactly(css, '.ticket-editor__tool');
  const hidden = source.phone && valueOf(phoneRule('.ticket-editor__tool-divider'), 'display') === 'none';
  const groupRules = parseRules(css).filter((rule) => rule.atRule === at && rule.selectors.includes('.ticket-editor__tool-group'));
  return {
    gap: px(valueOf(toolbar, 'gap'), 0),
    groupGap,
    sidePadding: side('padding-left', padding[1] ?? 0) + side('padding-right', padding[1] ?? 0),
    toolWidth: px(valueOf(toolRule, 'min-width'), 0),
    dividerWidth: hidden ? 0 : px(valueOf(dividerBase, 'width'), 0) + (margin[1] ?? 0) * 2 + groupGap,
    groupWraps: groupRules.some((rule) => valueOf(rule.body, 'flex-wrap') === 'wrap'),
  };
}

export interface Packed {
  rows: number;
  /** The widest row's used width — more than `room` is a clipped row. */
  widest: number;
  room: number;
}

/** Rows the bar packs into at a toolbar of `width` px, from the real DOM's groups and the declared widths. */
export function pack(toolbar: Element, width: number, rules: PackingRules): Packed {
  const room = width - rules.sidePadding;
  const items = [...toolbar.children].filter((child) => child.matches('.ticket-editor__tool-group')).map((group) => {
    const tools = group.querySelectorAll('button.ticket-editor__tool').length;
    const select = group.querySelector('select') === null ? 0 : SELECT_WIDTH;
    const parts = tools + (select === 0 ? 0 : 1);
    const divider = group.querySelector('.ticket-editor__tool-divider') === null ? 0 : rules.dividerWidth;
    return tools * rules.toolWidth + select + Math.max(0, parts - 1) * rules.groupGap + divider;
  });
  let rows = 1;
  let used = 0;
  let widest = 0;
  for (const item of items) {
    const need = used === 0 ? item : used + rules.gap + item;
    if (used !== 0 && need > room) {
      widest = Math.max(widest, used);
      rows += 1;
      used = item;
    } else used = need;
    if (used > room && rules.groupWraps) {
      // A group wider than the row wraps inside itself, so its box is as wide as the row and the next group starts a new one.
      rows += Math.ceil(used / room) - 1;
      used = room;
    }
  }
  widest = Math.max(widest, used);
  return { rows, widest, room };
}
