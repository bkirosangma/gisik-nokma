import { useEffect, useId, useState } from 'react';
import type { Editor } from '@tiptap/react';

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
 * (extension-code-block@3.31.3). **`link` has NONE** — `extension-
 * link@3.30.5`'s dist defines no `addKeyboardShortcuts` at all — and
 * **`collapsible` has none either** — `Details` only binds `Backspace`/
 * `Enter`, never a toggle. Both show their name alone rather than invent a
 * binding neither extension registers.
 */
const SHORTCUTS: Record<string, string | null> = {
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

const NOTE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v4h4" />
    <path d="M8 12h8M8 16h5" />
  </svg>
);

const TICKET_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M13 5v2M13 10.5v3M13 17v2" />
  </svg>
);

type ToolGroup = 'marks' | 'blocks' | 'insert';

type ToolControl = {
  key: string;
  label: React.ReactNode;
  name: string;
  /** `null` for the two insert actions — they toggle nothing, so no
   * `aria-pressed` is drawn for them (see the file docblock, point 1). */
  active: boolean | null;
  run: () => void;
  group: ToolGroup;
};

const GROUP_LABEL: Record<ToolGroup, string> = {
  marks: 'Text formatting',
  blocks: 'Blocks',
  insert: 'Insert',
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
        {...(control.active === null ? {} : { 'aria-pressed': control.active })}
        {...(shortcutAria === undefined ? {} : { 'aria-keyshortcuts': shortcutAria })}
        aria-describedby={show ? tooltipId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && show) {
            event.stopPropagation();
            setHovered(false);
            setFocused(false);
          }
        }}
        onClick={control.run}
        {...extraProps}
      >
        {control.label}
      </button>
      {show ? (
        <span role="tooltip" id={tooltipId} className="ticket-editor__tooltip">
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
};

export function EditorToolbar({ editor, editable, platform }: EditorToolbarProps): React.JSX.Element | null {
  /**
   * The URL field's own state. `null` = closed, which is the ordinary case and
   * what Escape returns to. It is deliberately NOT cleared on a successful
   * apply by anything other than that same reset — see `applyLink`.
   */
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
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
      key: 'bold',
      label: 'B',
      name: 'Bold',
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
      group: 'marks',
    },
    {
      key: 'italic',
      label: 'i',
      name: 'Italic',
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
      group: 'marks',
    },
    {
      key: 'code',
      label: 'code',
      name: 'Code',
      active: editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
      group: 'marks',
    },
    {
      key: 'link',
      label: 'link',
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
      label: 'list',
      name: 'Bullet list',
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
      group: 'blocks',
    },
    {
      key: 'quote',
      label: 'quote',
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
      label: '☐',
      name: 'Task item',
      active: editor.isActive('taskItem'),
      run: () => editor.chain().focus().toggleTaskList().run(),
      group: 'blocks',
    },
    {
      key: 'codeBlock',
      label: '</>',
      name: 'Code block',
      active: editor.isActive('codeBlock'),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
      group: 'blocks',
    },
    {
      key: 'collapsible',
      label: '▸',
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
    // Unit 4 (owner: "I want a button to insert the note and ticket there on
    // the bar"), REPLACING the old `[[` control rather than sitting beside
    // it. Both insert the BARE trigger and let the SAME suggestion plugin
    // that answers a typed trigger take it from there — a second popup
    // implementation here could not see the query the reader types next, the
    // same reason the old `[[` button never opened one of its own either.
    {
      key: 'insertNote',
      label: (
        <>
          {NOTE_ICON}
          <span className="ticket-editor__tool-label">Insert note</span>
        </>
      ),
      name: 'Insert note',
      active: null,
      run: () => editor.chain().focus().insertContent(':note ').run(),
      group: 'insert',
    },
    {
      key: 'insertTicket',
      label: (
        <>
          {TICKET_ICON}
          <span className="ticket-editor__tool-label">Insert ticket</span>
        </>
      ),
      name: 'Insert ticket',
      active: null,
      run: () => editor.chain().focus().insertContent(':ticket ').run(),
      group: 'insert',
    },
  ];

  const groups: { key: ToolGroup; controls: ToolControl[] }[] = (['marks', 'blocks', 'insert'] as ToolGroup[])
    .map((key) => ({ key, controls: controls.filter((control) => control.group === key) }))
    .filter((group) => group.controls.length > 0);

  return (
    <div className="ticket-editor__toolbar" role="toolbar" aria-label="Formatting">
      {groups.map((group, index) => (
        <div key={group.key} className="ticket-editor__tool-group" role="group" aria-label={GROUP_LABEL[group.key]}>
          {index > 0 ? <span className="ticket-editor__tool-divider" aria-hidden="true" /> : null}
          {group.controls.map((control) => (
            <ToolButton
              key={control.key}
              control={control}
              isMac={isMac}
              extraProps={control.key === 'link' ? { 'aria-expanded': linkOpen } : undefined}
            />
          ))}
        </div>
      ))}
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
