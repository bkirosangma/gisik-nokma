import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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

import { MARKDOWN_ENTRIES, MARKDOWN_HINT } from '../markdown-hint.js';
export { MARKDOWN_HINT };

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
 * The tools that stay on the bar at ≤40rem, in the owner's order (2026-10-01): undo, redo, bold,
 * italic, link, bullet list, numbered list, task list — and the heading select, rendered after them.
 * Every other tool moves into the "More tools" tray. Above 40rem nothing moves.
 */
export const PHONE_VISIBLE_TOOLS: readonly string[] = ['undo', 'redo', 'bold', 'italic', 'link', 'list', 'orderedList', 'task'];

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
  const trayId = useId();
  const toolbarRef = useRef<HTMLDivElement>(null);
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

  // PHONE (≤40rem, owner 2026-10-01): at most two rows. The tools in PHONE_VISIBLE_TOOLS stay on the
  // bar and the rest move into a tray opened by one "More tools" button. The tray is an in-place
  // disclosure (a `role="group"` of the SAME `ToolButton`s, below the bar) and not a floating menu:
  // `.editor-slot` is `overflow: hidden` and a note comment composer is only ~88px of body, so a
  // popover would be clipped; a text menu would also lose `aria-pressed`, `disabled`, the tooltips
  // and the table picker. Above 40rem nothing moves and there is no More.
  const trayControls = phone ? controls.filter((control) => !PHONE_VISIBLE_TOOLS.includes(control.key)) : [];
  const barControls = phone ? controls.filter((control) => PHONE_VISIBLE_TOOLS.includes(control.key)) : controls;
  const trayOpen = phone && moreOpen;
  if (phone) {
    barControls.push({
      key: 'more',
      label: MORE_ICON,
      name: 'More tools',
      active: null,
      expanded: trayOpen,
      run: () => setMoreOpen((was) => !was),
      group: 'more',
    });
  }
  // Running a tray tool closes the tray; the table button only toggles its size grid, which lives in
  // the tray, so it keeps it open (the grid's own `onSelect` closes both).
  const closeTray = (control: ToolControl): ToolControl =>
    control.key === 'table' ? control : { ...control, run: () => { control.run(); setMoreOpen(false); } };

  const groups: { key: ToolGroup; controls: ToolControl[] }[] = (['history', 'marks', 'blocks', 'insert', 'more'] as ToolGroup[])
    .map((key) => ({ key, controls: barControls.filter((control) => control.group === key) }))
    .filter((group) => group.controls.length > 0);

  const buttonFor = (control: ToolControl) => (
    <ToolButton
      key={control.key}
      control={control}
      isMac={isMac}
      extraProps={
        control.key === 'link'
          ? { 'aria-expanded': linkOpen }
          : control.key === 'more'
            ? { 'aria-controls': trayOpen ? trayId : undefined, 'aria-haspopup': undefined, 'data-tool': 'more' }
            : undefined
      }
    />
  );

  return (
    <div
      className="ticket-editor__toolbar"
      role="toolbar"
      aria-label="Formatting"
      ref={toolbarRef}
      {...(id === undefined ? {} : { id })}
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
      {groups.map((group, index) => (
        <div key={group.key} className="ticket-editor__tool-group" role="group" aria-label={GROUP_LABEL[group.key]}>
          {index > 0 ? <span className="ticket-editor__tool-divider" aria-hidden="true" /> : null}
          {group.key === 'blocks' && !phone ? <HeadingSelect editor={editor} /> : null}
          {group.controls.map(buttonFor)}
          {group.key === 'blocks' && phone ? <HeadingSelect editor={editor} /> : null}
        </div>
      ))}
      {trayOpen ? (
        <div
          id={trayId}
          className="ticket-editor__tray"
          role="group"
          aria-label="More tools"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setMoreOpen(false);
            toolbarRef.current?.querySelector<HTMLElement>('[data-tool="more"]')?.focus();
          }}
        >
          {trayControls.map((control) => buttonFor(closeTray(control)))}
        </div>
      ) : null}
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
}
