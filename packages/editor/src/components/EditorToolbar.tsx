import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getMarkRange } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { TablePicker } from './TablePicker.js';

/**
 * The formatting strip above the composer — the prototype's `descTools`/
 * `cmtTools` (`design-system/interactive/desktop.dc.html:3670-3695`, drawn
 * at `:1301`), which is six controls and a hint line and has never had a
 * counterpart here.
 *
 * ## Why this needed NO schema change, measured rather than assumed
 *
 * Every button below calls a command the installed extension list ALREADY
 * registers. `buildEditorExtensions` (`schema/extensions.ts`) builds from
 * `StarterKit` plus `Link`, `Placeholder`, `Table`, `TicketImage` and
 * `Mention`; `StarterKit.configure` switches off FOUR things — `document`
 * (replaced by `VersionedDocument`), `link` (reconfigured below it),
 * `underline` (outside the vocabulary) and, since Plan 4 Task 4, `codeBlock`
 * (replaced by `CodeBlockWithCopy`) — so `bold`, `italic`, `code`,
 * `bulletList` and `blockquote` all arrive with it. The six commands
 * were checked against the INSTALLED packages, not the library's docs:
 * `toggleBold` in extension-bold@3.30.5, `toggleItalic` in
 * extension-italic@3.30.5, `toggleCode` in extension-code@3.30.5,
 * `toggleBlockquote` in extension-blockquote@3.30.5, `toggleLink` in
 * extension-link@3.30.5, and `toggleBulletList` in @tiptap/core@3.30.5 itself.
 *
 * ## The prototype's buttons INSERT markdown; these TOGGLE a mark
 *
 * That difference is the whole reason this is a component and not a
 * transcription. The prototype's editor is a `<textarea>` holding markdown, so
 * its buttons splice `**`/`*`/`` ` `` around the selection and the hint line
 * underneath tells the reader what those characters mean. This editor holds
 * ProseMirror JSON and has no markdown syntax to splice — the marks are marks.
 * The set of six is the prototype's; the mechanics are the editor's own chain
 * commands, which is what the dispatch directs. The hint line is still drawn
 * (`MARKDOWN_HINT`), because it is the prototype's and because a reader typing
 * `**bold**` into this composer should be told what the product does with it.
 *
 * ## Active marks are REPORTED, and that is not the prototype's doing
 *
 * The prototype's controls are inserters and have no state to report. These are
 * toggles, so a button that does not say whether the mark is on is a control
 * the reader has to guess about. `isActive` is re-read on every editor
 * TRANSACTION — the `ImageWrapMenu` pattern (`:15-22`), which is this package's
 * established way to follow the editor's state without Tiptap re-rendering the
 * tree. `aria-pressed` carries the same fact to a screen reader — except for
 * the two insert actions (below), which toggle nothing and so report none.
 *
 * ## `Link` is the one control that needs input, and it gets it inline
 *
 * `toggleLink` takes an optional `{href}` (`extension-link@3.30.5`
 * dist/index.d.ts:136-142). Called with nothing it would leave an anchor with
 * no destination — a link to nowhere, and a worse answer than the prototype's,
 * whose `[text](https://)` at least puts the brackets on screen for the reader
 * to fill in. So this control reveals a URL field instead, in the shape
 * `ImageWrapMenu`'s alt input already uses. On a selection that is ALREADY a
 * link, the button removes the mark without asking, which is the one case where
 * there is no destination to supply.
 *
 * ## Restyle, tooltips and the two insert buttons (Unit 4, owner screenshot
 * 2026-09-23: "the editor toolbar needs better styling ... add tool tips to
 * the tools with their names on hover ... I want a button to insert the note
 * and ticket there on the bar")
 *
 * Three additions on top of the six-plus-four strip above:
 *
 * 1. **Grouping.** The eleven controls cluster into three `role="group"`s —
 *    marks (Bold/Italic/Code/Link), blocks (Bullet list/Quote/Task item/Code
 *    block/Collapsible) and insert actions (Insert note/Insert ticket) — with
 *    a thin divider between clusters. DOM order is unchanged from the flat
 *    list (16.85's own order case reads `.ticket-editor__tool` regardless of
 *    its wrapping `<div>`s), so no case that queries by that class needed to
 *    change shape, only its final four names.
 * 2. **Tooltips, not `title=`.** `packages/ui/src/ui.css` records the
 *    product's ruling against `title=` (unreachable by keyboard and touch) —
 *    so `ToolButton` below shows a `role="tooltip"` panel on hover AND on
 *    focus, named by `aria-describedby`, and hides on blur/mouse-leave/
 *    Escape. Its two lines are the tool's name + keyboard shortcut, then a
 *    muted "or type …" line for a markdown trigger — both READ from
 *    `SHORTCUTS`/`markdownFor`, never retyped per button, so a table edit
 *    reaches every consumer.
 * 3. **`[[` is REPLACED**, not kept alongside the two new buttons: "Insert
 *    note" and "Insert ticket" each insert the bare trigger
 *    (`:note `/`:ticket `) at the caret with `.focus()` in the same chain —
 *    the SAME mechanism the old `[[` button used (`insertContent`), which is
 *    what makes it "the same effect as typing it" rather than a second
 *    implementation of either picker. No `@` control exists here and none is
 *    added (owner: "I do not want that").
 *
 * ## KB editor parity (owner ruling 2026-09-24) — six more controls
 *
 * Ported from the knowledge-base app's `MarkdownToolbar.tsx`, NORMAL Tiptap
 * branch only (its `toggleRawSyntax`/`forceExitRawBlock` arms belong to the
 * live-reveal mode this product does not have):
 *
 * - **History** (Undo/Redo) leads the strip in its own group. Disabled when the
 *   history has nothing to give (`can().undo()`), which is state a button must
 *   report, not hide.
 * - **Strike** joins the marks, **Numbered list** and **Horizontal rule** the
 *   blocks.
 * - **Heading** is ONE `<select>` (Paragraph, Heading 1–6) rather than the
 *   reference's six side-by-side buttons: six more icons would push this dense
 *   composer strip onto a second row, and a native select is keyboard, touch
 *   and screen-reader accessible with no menu code of its own. Every level stays
 *   one choice away.
 * - **`selectFullLink`** — a mark toggle pressed inside a link formats the WHOLE
 *   link, not just the caret/partial selection (`MarkdownEditor.tsx:755`).
 */

const MARKDOWN_ENTRIES: { key: string; markdown: string }[] = [
  { key: 'bold', markdown: '**bold**' },
  { key: 'italic', markdown: '*italic*' },
  { key: 'code', markdown: '`code`' },
  { key: 'quote', markdown: '> quote' },
  { key: 'list', markdown: '- list' },
  { key: 'link', markdown: '[text](url)' },
];
export const MARKDOWN_HINT = `Markdown: ${MARKDOWN_ENTRIES.map((entry) => entry.markdown).join(', ')}`;

/**
 * Per-tool markdown triggers beyond MARKDOWN_HINT's own six — kept OUT of
 * `MARKDOWN_ENTRIES`/`MARKDOWN_HINT` deliberately, since that sentence's
 * rendered text is 16.85's own pinned case and not this unit's to change.
 * Each is read from the INSTALLED extension's `addInputRules()`, not
 * invented (advisor rule, ADDENDUM 3): code block's
 * `/^```([a-z]+)?[\s\n]$/` (`@tiptap/extension-code-block@3.31.3`, inherited
 * unmodified by `CodeBlockWithCopy.extend`), task list's
 * `/^\s*(\[([( |x])?\])\s$/` (`@tiptap/extension-list@3.30.5`), collapsible's
 * `/^<\s$/` (`collapsible.ts`). Insert note/ticket name BOTH their triggers,
 * per ADDENDUM 3's own examples.
 */
const EXTRA_MARKDOWN: Record<string, string> = {
  strike: '~~strike~~',
  orderedList: '1. then space',
  rule: '---',
  codeBlock: '``` then space',
  task: '[ ] ',
  collapsible: '< ',
  insertNote: ':note or [[',
  insertTicket: ':ticket',
};

function markdownFor(key: string): string | null {
  const shared = MARKDOWN_ENTRIES.find((entry) => entry.key === key);
  if (shared) return shared.markdown;
  return EXTRA_MARKDOWN[key] ?? null;
}

/**
 * Real keyboard shortcuts, read from the INSTALLED extensions'
 * `addKeyboardShortcuts()` under each installed `@tiptap/extension-` package's
 * `dist` output, never remembered (advisor rule): bold `Mod-b`/italic `Mod-i`
 * (extension-bold/italic@3.30.5), code `Mod-e` (extension-code@3.30.5),
 * blockquote `Mod-Shift-b` (extension-blockquote@3.30.5), bullet list
 * `Mod-Shift-8` and task list `Mod-Shift-9` (extension-list@3.30.5, both
 * `BulletList` and `TaskList` live there since v3's list consolidation —
 * the `@tiptap/extension-bullet-list`/`-task-list` packages this repo
 * imports are thin re-export shims over it), code block `Mod-Alt-c`
 * (extension-code-block@3.31.3), plus (KB parity) undo `Mod-z`/redo `Shift-Mod-z`
 * (extensions@3.30.5 undo-redo), strike `Mod-Shift-s` (extension-strike@3.30.5) and
 * ordered list `Mod-Shift-7` (extension-list@3.30.5); the horizontal rule binds
 * none. **`link` has NONE** — `extension-
 * link@3.30.5`'s dist defines no `addKeyboardShortcuts` at all — and
 * **`collapsible` has none either** — `Details` only binds `Backspace`/
 * `Enter`, never a toggle. Both show their name alone rather than invent a
 * binding neither extension registers.
 */
const SHORTCUTS: Record<string, string | null> = {
  undo: 'Mod-z',
  redo: 'Mod-Shift-z',
  strike: 'Mod-Shift-s',
  orderedList: 'Mod-Shift-7',
  rule: null,
  table: null,
  bold: 'Mod-b',
  italic: 'Mod-i',
  code: 'Mod-e',
  link: null,
  list: 'Mod-Shift-8',
  quote: 'Mod-Shift-b',
  task: 'Mod-Shift-9',
  codeBlock: 'Mod-Alt-c',
  collapsible: null,
  insertNote: null,
  insertTicket: null,
};

/** `Mod-Alt-c` → `⌘⌥C` (mac, no separators — matches the owner's own
 * example) or `Ctrl+Alt+C` (every other platform, `+`-joined). */
function formatShortcut(raw: string, isMac: boolean): string {
  const parts = raw.split('-');
  const key = (parts[parts.length - 1] ?? '').toUpperCase();
  const symbols = parts.slice(0, -1).map((mod) => {
    if (mod === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (mod === 'Shift') return isMac ? '⇧' : 'Shift';
    if (mod === 'Alt') return isMac ? '⌥' : 'Alt';
    return mod;
  });
  return isMac ? [...symbols, key].join('') : [...symbols, key].join('+');
}

/** The ARIA-standard spelling for `aria-keyshortcuts` (always word names,
 * always `+`-joined, regardless of platform — `Meta`/`Control`+`Shift`/
 * `Alt`+KEY). */
function ariaKeyshortcuts(raw: string, isMac: boolean): string {
  const parts = raw.split('-');
  const key = (parts[parts.length - 1] ?? '').toUpperCase();
  const mods = parts.slice(0, -1).map((mod) => (mod === 'Mod' ? (isMac ? 'Meta' : 'Control') : mod));
  return [...mods, key].join('+');
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform ?? '';
  const ua = navigator.userAgent ?? '';
  return /Mac|iPhone|iPod|iPad/i.test(platform || ua);
}

/**
 * Every toolbar glyph is an inline 16px stroke SVG (`currentColor`, decorative — the button's
 * `aria-label` is its name), drawn in the common 24-grid outline idiom; no icon package (owner,
 * 2026-10-01: icons instead of word labels, the usual symbol for each tool).
 */
function Icon({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const BOLD_ICON = (
  <Icon>
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </Icon>
);

const ITALIC_ICON = (
  <Icon>
    <path d="M19 4h-9M14 20H5M15 4 9 20" />
  </Icon>
);

const STRIKE_ICON = (
  <Icon>
    <path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />
  </Icon>
);

const CODE_ICON = (
  <Icon>
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
  </Icon>
);

const LINK_ICON = (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
);

const BULLET_LIST_ICON = (
  <Icon>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);

const NUMBERED_LIST_ICON = (
  <Icon>
    <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </Icon>
);

const QUOTE_ICON = (
  <Icon>
    <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
    <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
  </Icon>
);

const TASK_LIST_ICON = (
  <Icon>
    <rect x="3" y="4" width="6" height="6" rx="1" />
    <path d="m4.5 7 1.5 1.5L8 6" />
    <rect x="3" y="14" width="6" height="6" rx="1" />
    <path d="M13 7h8M13 17h8" />
  </Icon>
);

const CODE_BLOCK_ICON = (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m10 9-3 3 3 3M14 9l3 3-3 3" />
  </Icon>
);

const COLLAPSIBLE_ICON = (
  <Icon>
    <path d="m5 7 5 5-5 5M14 8h7M14 16h7" />
  </Icon>
);

const RULE_ICON = (
  <Icon>
    <path d="M3 12h18M5 6h8M5 18h6" />
  </Icon>
);

const MORE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </svg>
);

const NOTE_ICON = (
  <Icon>
    <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v4h4" />
    <path d="M12 11v6M9 14h6" />
  </Icon>
);

const TICKET_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M13 5v2M13 10.5v3M13 17v2" />
  </svg>
);

const TABLE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
  </svg>
);

const UNDO_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

const REDO_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);

/**
 * The phone breakpoint — the SAME string as `PHONE_BOARD_QUERY` (app-core `views/use-phone-board.ts`)
 * and the `@media (max-width: 40rem)` arms in the stylesheets. This package cannot import app-core
 * (the dependency runs the other way), so the string is repeated and pinned by case 21.136.
 */
export const PHONE_TOOLBAR_QUERY = '(max-width: 40rem)';

function subscribePhone(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(PHONE_TOOLBAR_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function phoneSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_TOOLBAR_QUERY).matches;
}

/** True at ≤40rem; false on the server and wherever `matchMedia` is missing (jsdom). */
function usePhoneToolbar(): boolean {
  return useSyncExternalStore(subscribePhone, phoneSnapshot, () => false);
}

/**
 * The tools that stay on the bar at ≤40rem, in the owner's order (G-7, 2026-10-02): bold, italic, bullet list, task
 * list, [the heading select], link, insert ticket, insert note — one row that scrolls sideways, with More pinned at the
 * right edge. Every other tool (undo, redo, numbered list, strikethrough, code, quote, code block, collapsible, rule,
 * table) lives in the More sheet. Above 40rem nothing moves.
 */
/** The room kept between the caret and the docked bar's top edge, in px (G-7 FIX 1, F2). */
const DOCK_CARET_GAP_PX = 8;

export const PHONE_VISIBLE_TOOLS: readonly string[] = ['bold', 'italic', 'list', 'task', 'link', 'insertTicket', 'insertNote'];

/** The phone bar left to right: `PHONE_VISIBLE_TOOLS` with the heading select after the task list. */
const PHONE_BAR_ORDER: readonly string[] = ['bold', 'italic', 'list', 'task', 'heading', 'link', 'insertTicket', 'insertNote'];

/** The More sheet's cells, in the owner's order: every tool the bar does not carry. */
const SHEET_ORDER: readonly string[] = ['undo', 'redo', 'orderedList', 'strike', 'code', 'quote', 'codeBlock', 'collapsible', 'rule', 'table'];

/** How long a finger must rest on a tool before its name shows (the touch stand-in for hover). */
const LONG_PRESS_MS = 500;
/** How long that name stays up after the finger lifts. */
const LONG_PRESS_LINGER_MS = 1500;

type ToolGroup = 'history' | 'marks' | 'blocks' | 'insert' | 'more';

type ToolControl = {
  key: string;
  label: React.ReactNode;
  name: string;
  /** `null` for the two insert actions — they toggle nothing, so no
   * `aria-pressed` is drawn for them (see the file docblock, point 1). */
  active: boolean | null;
  run: () => void;
  group: ToolGroup;
  /** A control that cannot act right now (Undo with nothing to undo). */
  disabled?: boolean;
  /** A popover drawn inside the tool's own wrapper (the table size grid). */
  panel?: React.ReactNode;
  /** `aria-expanded` for a control that opens a panel. */
  expanded?: boolean;
};

const GROUP_LABEL: Record<ToolGroup, string> = {
  history: 'History',
  marks: 'Text formatting',
  blocks: 'Blocks',
  insert: 'Insert',
  more: 'More',
};

/**
 * One toolbar button plus its hover/focus tooltip. A component and not
 * inline JSX because each instance owns its own show/hide state — `useId`
 * gives `aria-describedby` a stable id without a caller-supplied key.
 */
function ToolButton({ control, isMac, extraProps }: { control: ToolControl; isMac: boolean; extraProps?: Record<string, unknown> }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tooltipId = useId();
  const show = hovered || focused;
  const tooltipRef = useRef<HTMLSpanElement>(null);

  // LONG-PRESS (touch): a phone has no hover and iOS does not focus a tapped button, so the name
  // would never show. A finger resting on the tool for LONG_PRESS_MS shows it; the click that ends
  // that press is swallowed (reading "Bold" must not toggle bold), and the name lingers a moment.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const clearTimers = () => {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  useEffect(
    () => () => {
      clearTimers();
      if (lingerTimer.current !== null) clearTimeout(lingerTimer.current);
    },
    [],
  );

  // Keep the panel inside the composer that clips it. `.editor-slot` is `overflow: hidden`
  // (it owns the corners), so a panel wider than the room to its button's right — a long name on a
  // wrapped row, or the last button — would lose its end to the clip (owner, 2026-09-29: the note
  // editors showed no tooltip at all). The stylesheet opens it below and left-anchored; this only
  // shifts it sideways by the overshoot. A bare `TicketEditor` has no `.editor-slot`, nothing clips
  // it there, and it is left where the stylesheet put it.
  useLayoutEffect(() => {
    const tip = tooltipRef.current;
    if (tip !== null && tip.closest('.ticket-editor__scroll') !== null) {
      // The phone bar (G-7): its scroll area clips a tip drawn inside it, and BELOW the docked bar is the keyboard. So
      // the name is drawn ABOVE the button in fixed coordinates, kept inside the screen sideways.
      const wrap = tip.parentElement?.getBoundingClientRect();
      if (wrap === undefined) return;
      const width = tip.getBoundingClientRect().width;
      tip.style.position = 'fixed';
      tip.style.top = 'auto';
      tip.style.transform = 'none';
      tip.style.bottom = `${Math.round(window.innerHeight - wrap.top + 6)}px`;
      tip.style.left = `${Math.round(Math.max(8, Math.min(wrap.left, window.innerWidth - width - 8)))}px`;
      return;
    }
    const clip = tip?.closest('.editor-slot') ?? null;
    if (tip === null || clip === null) return;
    tip.style.transform = '';
    const t = tip.getBoundingClientRect();
    const c = clip.getBoundingClientRect();
    let shift = t.right > c.right ? c.right - t.right : 0;
    if (t.left + shift < c.left) shift = c.left - t.left;
    if (shift !== 0) tip.style.transform = `translateX(${shift}px)`;
  }, [hovered, focused]);

  const rawShortcut = SHORTCUTS[control.key] ?? null;
  const shortcutDisplay = rawShortcut === null ? null : formatShortcut(rawShortcut, isMac);
  const shortcutAria = rawShortcut === null ? undefined : ariaKeyshortcuts(rawShortcut, isMac);
  const markdown = markdownFor(control.key);

  return (
    <span
      className="ticket-editor__tool-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={control.active === true ? 'ticket-editor__tool ticket-editor__tool--active' : 'ticket-editor__tool'}
        aria-label={control.name}
        disabled={control.disabled === true}
        {...(control.active === null ? {} : { 'aria-pressed': control.active })}
        {...(shortcutAria === undefined ? {} : { 'aria-keyshortcuts': shortcutAria })}
        aria-describedby={show ? tooltipId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch') return;
          longPressed.current = false;
          clearTimers();
          if (lingerTimer.current !== null) clearTimeout(lingerTimer.current);
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setHovered(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={() => {
          clearTimers();
          if (!longPressed.current) return;
          lingerTimer.current = setTimeout(() => setHovered(false), LONG_PRESS_LINGER_MS);
        }}
        onPointerCancel={() => {
          clearTimers();
          if (longPressed.current) setHovered(false);
        }}
        onContextMenu={(event) => {
          // A long-press raises the platform's context menu on some browsers; the name is the answer.
          if (longPressed.current || pressTimer.current !== null) event.preventDefault();
        }}
        onKeyDown={(event) => {
          longPressed.current = false;
          if (event.key === 'Escape' && show) {
            event.stopPropagation();
            setHovered(false);
            setFocused(false);
          }
        }}
        onClick={(event) => {
          if (longPressed.current) {
            longPressed.current = false;
            event.preventDefault();
            return;
          }
          control.run();
        }}
        {...(control.expanded === undefined ? {} : { 'aria-expanded': control.expanded, 'aria-haspopup': 'true' as const })}
        {...extraProps}
      >
        {control.label}
      </button>
      {control.panel}
      {show ? (
        <span role="tooltip" id={tooltipId} ref={tooltipRef} className="ticket-editor__tooltip">
          <span className="ticket-editor__tooltip-line">
            <span className="ticket-editor__tooltip-name">{control.name}</span>
            {shortcutDisplay === null ? null : (
              <span className="ticket-editor__tooltip-shortcut">{shortcutDisplay}</span>
            )}
          </span>
          {markdown === null ? null : (
            <span className="ticket-editor__tooltip-markdown">{`or type ${markdown}`}</span>
          )}
        </span>
      ) : null}
    </span>
  );
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Paragraph / Heading 1–6 as one native select. `value` is the ACTIVE level
 * (or `paragraph`), re-read on every transaction with the rest of the strip.
 * A change applies the level with `.focus()` in the same chain, so the caret
 * returns to the text — a select otherwise keeps focus after it is used.
 */
function HeadingSelect({ editor }: { editor: Editor }): React.JSX.Element {
  const active = HEADING_LEVELS.find((level) => editor.isActive('heading', { level }));
  return (
    <select
      className="ticket-editor__heading-select"
      aria-label="Heading level"
      value={active === undefined ? 'paragraph' : String(active)}
      onChange={(event) => {
        const value = event.target.value;
        const chain = editor.chain().focus();
        if (value === 'paragraph') chain.setParagraph().run();
        else chain.setHeading({ level: Number(value) as (typeof HEADING_LEVELS)[number] }).run();
      }}
    >
      <option value="paragraph">Paragraph</option>
      {HEADING_LEVELS.map((level) => (
        <option key={level} value={String(level)}>{`Heading ${level}`}</option>
      ))}
    </select>
  );
}

/**
 * The phone's "More tools" sheet (G-7): a bottom sheet holding every tool the one-row bar does not carry, as a grid of
 * icon + label cells (the label IS the cell's accessible name, so what is read is what is seen). It copies the CONTRACT
 * of `@gisik-nokma/ui`'s `Sheet` — `role="dialog"`, `aria-modal`, a scrim tap and Escape close it (with the table grid open, Escape
 * closes only the grid), focus moves in on open — and not the component: this package cannot
 * import `ui` (the dependency runs the other way, and the mobile webview bundles this package alone), and `Sheet` is the
 * ticket sheet's RIGHT-hand panel. Portalled to <body>, so the composer's `overflow: hidden` cannot clip it; React
 * events still bubble through the portal to the sheet's React ANCESTORS, so the scrim and the panel stop `click`, and
 * Escape is taken at the window in the capture phase (see `onEscape`) — a press in the sheet must not reach the host's own
 * handlers (the note page focuses its editor on a click; the dialog or sheet around the editor closes on an Escape). The
 * comment Format strip is NOT such a handler: it sits on the toolbar element, and the portal is a sibling of that
 * element, not a child (25.418).
 */
function MoreSheet({
  id,
  controls,
  inTable,
  tablePanelOpen,
  onTableToggle,
  onTableSelect,
  onTableClose,
  onPick,
  onClose,
}: {
  id: string;
  controls: ToolControl[];
  inTable: boolean;
  tablePanelOpen: boolean;
  onTableToggle: () => void;
  onTableSelect: (rows: number, cols: number) => void;
  onTableClose: () => void;
  onPick: (control: ToolControl) => void;
  onClose: () => void;
}): React.JSX.Element {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  // Escape is taken at the WINDOW, in the capture phase, so it runs before anything a host listens with. The new-ticket
  // dialog closes on an unconditional `document` capture listener (`Dialog`, ui), which no handler inside the sheet can
  // outrun — measured on the lane port: one Escape in this sheet closed the sheet AND the dialog. The ticket sheet's own
  // listener (bubble, honours `defaultPrevented`) and an editor ancestor's `onKeyDown` are covered by the same line. The
  // table grid's Escape is handled here too, for the same reason: it closes only the grid and hands focus back to the cell.
  const latest = useRef({ tablePanelOpen, onTableClose, onClose });
  latest.current = { tablePanelOpen, onTableClose, onClose };
  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      if (latest.current.tablePanelOpen) {
        latest.current.onTableClose();
        panelRef.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus();
        return;
      }
      latest.current.onClose();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, []);
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return;
    // `aria-modal` alone does not keep Tab inside: wrap it by hand.
    const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    const at = document.activeElement;
    if (event.shiftKey && (at === first || at === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && at === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      className="ticket-editor__sheet-scrim"
      data-testid="editor-more-scrim"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <section
        ref={panelRef}
        id={id}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="More tools"
        className="ticket-editor__sheet"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="ticket-editor__sheet-grab" aria-hidden="true" />
        <div className="ticket-editor__sheet-grid">
          {controls.map((control) => (
            <button
              key={control.key}
              type="button"
              className={control.active === true ? 'ticket-editor__sheet-cell ticket-editor__sheet-cell--active' : 'ticket-editor__sheet-cell'}
              disabled={control.disabled === true}
              {...(control.active === null ? {} : { 'aria-pressed': control.active })}
              {...(control.key === 'table' ? { 'aria-expanded': tablePanelOpen } : {})}
              onClick={() => (control.key === 'table' ? onTableToggle() : onPick(control))}
            >
              <span className="ticket-editor__sheet-icon" aria-hidden="true">
                {control.label}
              </span>
              <span className="ticket-editor__sheet-label">{control.key === 'table' ? 'Insert table' : control.name}</span>
            </button>
          ))}
        </div>
        {inTable ? <p className="ticket-editor__sheet-note">A table can&apos;t be placed inside another table.</p> : null}
        {tablePanelOpen ? <TablePicker onSelect={onTableSelect} onClose={onTableClose} /> : null}
      </section>
    </div>
  );
}

export type EditorToolbarProps = {
  editor: Editor | null;
  /** The toolbar is chrome for a composer someone may type into; read-only has none. */
  editable: boolean;
  /**
   * Test-only override for the shortcut glyphs (⌘ vs Ctrl) and
   * `aria-keyshortcuts` spelling (`Meta` vs `Control`) — real callers never
   * pass it and get `detectMac()`'s own reading of `navigator`. Exists so
   * both platform arms are reachable from jsdom, which has no real
   * `navigator.platform` to vary (advisor rule, ADDENDUM 3).
   */
  platform?: 'mac' | 'other';
  /** The strip's `id`, so a control elsewhere can name it in `aria-controls` (the comment editors' Format button, G-6). */
  id?: string;
  /**
   * Set by a host that lets the reader hide the strip (G-6): Escape inside the strip that nothing else claimed (the
   * tooltip, the More tray and the link field each take their own first) calls it. Absent, Escape does nothing here.
   */
  onClose?: () => void;
};

export function EditorToolbar({ editor, editable, platform, id, onClose }: EditorToolbarProps): React.JSX.Element | null {
  /**
   * The URL field's own state. `null` = closed, which is the ordinary case and
   * what Escape returns to. It is deliberately NOT cleared on a successful
   * apply by anything other than that same reset — see `applyLink`.
   */
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const phone = usePhoneToolbar();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetId = useId();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measureEdges = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setEdges((was) => (was.start === start && was.end === end ? was : { start, end }));
  }, []);
  // DOCK (G-7): on a phone the bar floats at the bottom of the VISUAL viewport — just above the on-screen keyboard — for as
  // long as focus is anywhere in this editor (its text, the bar, the link field) or the More sheet is open.
  const [focusWithin, setFocusWithin] = useState(false);
  const docked = phone && editable && (focusWithin || moreOpen);
  const [dockBottom, setDockBottom] = useState<number | null>(null);
  // A modal dialog or sheet (`role="dialog"` + `aria-modal`) is drawn over the web app's phone bottom bar, so an editor
  // inside one has no bar to clear: the bar's lift is 0 there (G-7 FIX 1, F3 — measured: the lift left a 56px strip of
  // page showing under the docked bar in the ticket sheet).
  const [onModalLayer, setOnModalLayer] = useState(false);
  useEffect(() => {
    if (!phone || !editor) return;
    const root = toolbarRef.current?.closest('.ticket-editor') ?? null;
    if (root === null) return;
    setFocusWithin(root.contains(document.activeElement));
    const onIn = () => setFocusWithin(true);
    const onOut = (event: Event) => {
      if (!root.contains((event as FocusEvent).relatedTarget as Node | null)) setFocusWithin(false);
    };
    root.addEventListener('focusin', onIn);
    root.addEventListener('focusout', onOut);
    return () => {
      root.removeEventListener('focusin', onIn);
      root.removeEventListener('focusout', onOut);
    };
  }, [phone, editor, editable]);
  useLayoutEffect(() => {
    if (!docked) {
      setDockBottom(null);
      return;
    }
    // `fixed` is laid out against the LAYOUT viewport, which the keyboard does not shrink (iOS) — so the bar's bottom is
    // how far the visual viewport's bottom edge sits above the layout viewport's.
    setOnModalLayer(toolbarRef.current?.closest('[role="dialog"][aria-modal="true"]') != null);
    const vv = window.visualViewport ?? null;
    const measure = () => setDockBottom(vv === null ? 0 : Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height))));
    measure();
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [docked]);
  // CARET (G-7 FIX 1, F2): ProseMirror scrolls a caret into the VISUAL viewport with a 5px margin, and the docked bar covers
  // the bottom of that viewport — so the last visible line put the caret UNDER the bar. While docked, the view's bottom
  // margin AND threshold are the bar's height plus a gap: the caret starts scrolling when it enters the bar's zone and
  // stops a gap above it. The other sides keep ProseMirror's own values (margin 5, threshold 0). Undocking hands back the
  // default by clearing both props (`someProp` then falls through to 5 and 0).
  useEffect(() => {
    if (!docked || !editor || editor.isDestroyed) return;
    const bottom = (toolbarRef.current?.offsetHeight ?? 0) + DOCK_CARET_GAP_PX;
    editor.view.setProps({ scrollMargin: { top: 5, right: 5, bottom, left: 5 }, scrollThreshold: { top: 0, right: 0, bottom, left: 0 } });
    return () => {
      if (!editor.isDestroyed) editor.view.setProps({ scrollMargin: undefined, scrollThreshold: undefined });
    };
  }, [docked, editor]);
  useEffect(() => {
    if (!phone) return;
    measureEdges();
    const el = scrollRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [phone, editor, editable, measureEdges]);
  // The transaction subscription that re-reads `isActive`. Same shape and same
  // reason as `ImageWrapMenu`'s repaint: `useEditor` does not re-render this
  // tree on every transaction, and a toggle button that never updates its own
  // state is the failure this exists to prevent.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const repaint = () => force((n) => n + 1);
    editor.on('transaction', repaint);
    return () => {
      editor.off('transaction', repaint);
    };
  }, [editor]);

  if (!editor || editor.isDestroyed || !editable) return null;

  const isMac = platform === undefined ? detectMac() : platform === 'mac';
  const linkIsActive = editor.isActive('link');
  // The reference disables the picker inside a table (`TableNoNest` refuses the
  // command regardless; this tells the reader BEFORE they press it).
  const inTable = editor.isActive('table');
  const tablePanelOpen = tableOpen && !inTable;

  function applyLink(): void {
    const trimmed = href.trim();
    // An empty box is a cancel, not a link to the empty string. `setLink` would
    // happily write `href: ''`, and the door would store an anchor that goes
    // nowhere — refusing here is the same choice `TicketEditorSlot`'s
    // `uploadOrRefuse` makes about a fabricated upload result.
    if (trimmed === '') {
      setLinkOpen(false);
      setHref('');
      return;
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    setLinkOpen(false);
    setHref('');
  }

  /**
   * Formatting pressed inside a link formats the WHOLE link — ported from the
   * reference's `selectFullLink` (`MarkdownEditor.tsx:755`), minus its rawBlock
   * arm. Returns nothing; it only widens the selection, so the toggle that
   * follows sees the full anchor rather than the caret.
   */
  function selectFullLink(): void {
    if (!editor!.isActive('link')) return;
    const linkType = editor!.schema.marks['link'];
    if (linkType === undefined) return;
    const range = getMarkRange(editor!.state.selection.$from, linkType);
    if (range === undefined) return;
    editor!.chain().setTextSelection({ from: range.from, to: range.to }).run();
  }

  const markToggle = (run: () => boolean) => () => {
    selectFullLink();
    run();
  };

  /**
   * THE CONTROLS IN THE PROTOTYPE'S ORDER — `B i code link list quote` — and the
   * first cut of this file had it WRONG.
   *
   * That version was `B i code list quote` followed by a hand-written `link`
   * button appended after the map, so the strip rendered `B i code list quote
   * link`. **The component's own comment claimed the right order, the case was
   * NAMED for the right order, and its body asserted the wrong one** — a case
   * passing for a reason unrelated to the property its name states, which is this
   * repo's most-repeated defect. An independent reviewer found it by reading the
   * prototype (`desktop.dc.html:3670-3678`: `B, i, code, link, list, quote`) and
   * then the test file, not by running anything: the suite was green.
   *
   * `link` is not special-cased INTO the list to hide its difference — it is
   * called out at the button, which is the one control that asks for input. Its
   * `run` is the whole difference, and it is visible here rather than buried.
   */
  const controls: ToolControl[] = [
    {
      key: 'undo',
      label: UNDO_ICON,
      name: 'Undo',
      active: null,
      disabled: !editor.can().undo(),
      run: () => editor.chain().focus().undo().run(),
      group: 'history',
    },
    {
      key: 'redo',
      label: REDO_ICON,
      name: 'Redo',
      active: null,
      disabled: !editor.can().redo(),
      run: () => editor.chain().focus().redo().run(),
      group: 'history',
    },
    {
      key: 'bold',
      label: BOLD_ICON,
      name: 'Bold',
      active: editor.isActive('bold'),
      run: markToggle(() => editor.chain().focus().toggleBold().run()),
      group: 'marks',
    },
    {
      key: 'italic',
      label: ITALIC_ICON,
      name: 'Italic',
      active: editor.isActive('italic'),
      run: markToggle(() => editor.chain().focus().toggleItalic().run()),
      group: 'marks',
    },
    {
      key: 'strike',
      label: STRIKE_ICON,
      name: 'Strikethrough',
      active: editor.isActive('strike'),
      run: markToggle(() => editor.chain().focus().toggleStrike().run()),
      group: 'marks',
    },
    {
      key: 'code',
      label: CODE_ICON,
      name: 'Code',
      active: editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
      group: 'marks',
    },
    {
      key: 'link',
      label: LINK_ICON,
      name: 'Link',
      active: linkIsActive,
      run: () => {
        // Already a link: remove it, which is the one case with no destination
        // to ask for. Otherwise reveal the URL field.
        if (linkIsActive) {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          setLinkOpen(false);
          setHref('');
          return;
        }
        setLinkOpen((was) => !was);
      },
      group: 'marks',
    },
    {
      key: 'list',
      label: BULLET_LIST_ICON,
      name: 'Bullet list',
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
      group: 'blocks',
    },
    {
      key: 'orderedList',
      label: NUMBERED_LIST_ICON,
      name: 'Numbered list',
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
      group: 'blocks',
    },
    {
      key: 'quote',
      label: QUOTE_ICON,
      name: 'Quote',
      active: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
      group: 'blocks',
    },
    // THE NOTES PORT'S FOUR (Plan 4 Tasks 4 and 5), after the prototype's six
    // rather than inserted among them: the prototype has no counterpart for
    // any of them, so the strip keeps its transcribed order and grows at the
    // end. The commands are `toggleTaskList` (extension-task-list),
    // `toggleCodeBlock` (extension-code-block), `setDetails` +
    // `updateAttributes` (extension-details — see the note at that control,
    // the attrs are NOT free).
    {
      key: 'task',
      label: TASK_LIST_ICON,
      name: 'Task item',
      active: editor.isActive('taskItem'),
      run: () => editor.chain().focus().toggleTaskList().run(),
      group: 'blocks',
    },
    {
      key: 'codeBlock',
      label: CODE_BLOCK_ICON,
      name: 'Code block',
      active: editor.isActive('codeBlock'),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
      group: 'blocks',
    },
    {
      key: 'collapsible',
      label: COLLAPSIBLE_ICON,
      name: 'Collapsible',
      active: editor.isActive('details'),
      // `updateAttributes` IS PART OF THE COMMAND, not a flourish. The Details
      // extension's `setDetails()` inserts NO attrs and `open` defaults to
      // false, so the button on its own produced a FOLDED block while the `< `
      // input rule produced an open one — and since `persist` is on for an
      // editor, the fold was written into the document and hid the body from
      // the reader who had just asked for it. Measured by the plan-close
      // review; 9.274 now asserts the attribute.
      run: () => editor.chain().focus().setDetails().updateAttributes('details', { open: true }).run(),
      group: 'blocks',
    },
    {
      key: 'rule',
      label: RULE_ICON,
      name: 'Horizontal rule',
      active: null,
      run: () => editor.chain().focus().setHorizontalRule().run(),
      group: 'blocks',
    },
    {
      key: 'table',
      label: TABLE_ICON,
      name: inTable ? 'Insert table (not allowed inside a table)' : 'Insert table',
      active: null,
      disabled: inTable,
      expanded: tablePanelOpen,
      run: () => setTableOpen((was) => !was),
      panel: tablePanelOpen ? (
        <TablePicker
          onSelect={(rows, cols) => {
            setTableOpen(false);
            setMoreOpen(false);
            editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
          }}
          onClose={() => setTableOpen(false)}
        />
      ) : null,
      group: 'insert',
    },
    // Unit 4 (owner: "I want a button to insert the note and ticket there on
    // the bar"), REPLACING the old `[[` control rather than sitting beside
    // it. Both insert the BARE trigger and let the SAME suggestion plugin
    // that answers a typed trigger take it from there — a second popup
    // implementation here could not see the query the reader types next, the
    // same reason the old `[[` button never opened one of its own either.
    {
      key: 'insertNote',
      label: NOTE_ICON,
      name: 'Insert note',
      active: null,
      run: () => editor.chain().focus().insertContent(':note ').run(),
      group: 'insert',
    },
    {
      key: 'insertTicket',
      label: TICKET_ICON,
      name: 'Insert ticket',
      active: null,
      run: () => editor.chain().focus().insertContent(':ticket ').run(),
      group: 'insert',
    },
  ];

  // PHONE (≤40rem, G-7 2026-10-02, replacing the owner's 2026-10-01 two-row tray): ONE row. The tools in
  // PHONE_BAR_ORDER scroll sideways inside `.ticket-editor__scroll`; "More tools" is pinned outside that scroll area and
  // opens a bottom sheet (a modal dialog, portalled to <body>) with the rest, as a labelled grid. A sheet and not a
  // floating menu or an in-bar tray: `.editor-slot` clips a popover, a text menu would lose `aria-pressed`, `disabled`
  // and the table picker, and a tray would make the bar a second row. Above 40rem nothing moves and there is no More.
  const byKey = (key: string): ToolControl | undefined => controls.find((control) => control.key === key);
  const sheetControls = phone ? SHEET_ORDER.map(byKey).filter((control): control is ToolControl => control !== undefined) : [];
  const moreControl: ToolControl = {
    key: 'more',
    label: MORE_ICON,
    name: 'More tools',
    active: null,
    expanded: moreOpen,
    run: () => setMoreOpen((was) => !was),
    group: 'more',
  };
  // The sheet closes FIRST, and the focus returns to the editor in the same press (a pick, Escape or the backdrop): the
  // text keeps its selection (ProseMirror holds it in state while blurred) and on iOS the keyboard comes back inside the
  // gesture. `view.focus()` is synchronous; tiptap's own `focus()` command defers to an animation frame.
  const closeSheet = (): void => {
    setMoreOpen(false);
    setTableOpen(false);
    editor.view.focus();
  };

  const groups: { key: ToolGroup; controls: ToolControl[] }[] = (['history', 'marks', 'blocks', 'insert'] as ToolGroup[])
    .map((key) => ({ key, controls: controls.filter((control) => control.group === key) }))
    .filter((group) => group.controls.length > 0);

  // On a phone a bar tool's press must not take focus off the text: a button that takes it blurs the contenteditable,
  // the keyboard closes, the visual viewport grows and the bar jumps mid-tap. (The heading select is not a ToolButton:
  // it has to open its native picker.)
  const keepFocus = phone ? { onMouseDown: (event: React.MouseEvent) => event.preventDefault() } : {};
  const buttonFor = (control: ToolControl) => (
    <ToolButton
      key={control.key}
      control={control}
      isMac={isMac}
      extraProps={
        control.key === 'link'
          ? { ...keepFocus, 'aria-expanded': linkOpen }
          : control.key === 'more'
            ? { ...keepFocus, 'aria-controls': moreOpen ? sheetId : undefined, 'aria-haspopup': 'dialog', 'data-tool': 'more' }
            : phone
              ? keepFocus
              : undefined
      }
    />
  );

  const toolbar = (
    <div
      className={docked ? 'ticket-editor__toolbar ticket-editor__toolbar--docked' : 'ticket-editor__toolbar'}
      role="toolbar"
      aria-label="Formatting"
      ref={toolbarRef}
      {...(id === undefined ? {} : { id })}
      {...(docked && dockBottom !== null
        ? {
            style: {
              '--ticket-editor-dock-bottom': `${dockBottom}px`,
              ...(onModalLayer ? { '--gn-bar-lift': '0px' } : {}),
            } as React.CSSProperties,
          }
        : {})}
      {...(onClose === undefined
        ? {}
        : {
            onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>): void => {
              if (event.key !== 'Escape' || event.defaultPrevented) return;
              event.preventDefault();
              onClose();
            },
          })}
    >
      {phone ? (
        <>
          <div
            className="ticket-editor__scroll"
            ref={scrollRef}
            data-at-start={String(edges.start)}
            data-at-end={String(edges.end)}
            onScroll={measureEdges}
          >
            <div className="ticket-editor__tool-group" role="group" aria-label="Tools">
              {PHONE_BAR_ORDER.map((key) => {
                if (key === 'heading') return <HeadingSelect key="heading" editor={editor} />;
                const control = byKey(key);
                return control === undefined ? null : buttonFor(control);
              })}
            </div>
          </div>
          <div className="ticket-editor__tool-group ticket-editor__more" role="group" aria-label={GROUP_LABEL.more}>
            {buttonFor(moreControl)}
          </div>
        </>
      ) : (
        groups.map((group, index) => (
          <div key={group.key} className="ticket-editor__tool-group" role="group" aria-label={GROUP_LABEL[group.key]}>
            {index > 0 ? <span className="ticket-editor__tool-divider" aria-hidden="true" /> : null}
            {group.key === 'blocks' ? <HeadingSelect editor={editor} /> : null}
            {group.controls.map(buttonFor)}
          </div>
        ))
      )}
      {linkOpen ? (
        <input
          className="ticket-editor__link-url"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the field exists only
          // because the reader just asked for it; leaving focus behind is the
          // `autoFocus` case the rule is written to allow.
          autoFocus
          type="url"
          aria-label="Link URL"
          placeholder="https://"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyLink();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setLinkOpen(false);
              setHref('');
            }
          }}
        />
      ) : null}
    </div>
  );

  if (!phone) return toolbar;
  return (
    <>
      {/* The anchor holds the bar's place while it floats, so docking never moves the text under it (editor.css). */}
      <div className="ticket-editor__toolbar-anchor" data-docked={String(docked)}>
        {toolbar}
      </div>
      {moreOpen
        ? createPortal(
            <MoreSheet
              id={sheetId}
              controls={sheetControls}
              inTable={inTable}
              tablePanelOpen={tablePanelOpen}
              onTableToggle={() => setTableOpen((was) => !was)}
              onTableSelect={(rows, cols) => {
                closeSheet();
                editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
              }}
              onTableClose={() => setTableOpen(false)}
              onPick={(control) => {
                closeSheet();
                control.run();
              }}
              onClose={closeSheet}
            />,
            document.body,
          )
        : null}
    </>
  );
}
