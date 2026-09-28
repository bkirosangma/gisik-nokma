import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildEditorExtensions, IMAGE_WRAP_MODES } from '@gisik-nokma/editor';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');
const EDITOR_SRC = resolve(TEST_DIR, '../../../packages/editor/src');
const EDITOR_CSS_PATH = resolve(EDITOR_SRC, 'styles/editor.css');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Derives the required class list from the editor's own source, rather than a
 * hand-typed array — the owner's brief asks for a check "driven from the
 * class names the editor source emits ... so a new class without a skin goes
 * red", and a hand-typed list can never redden for a class nobody remembered
 * to add to it (measured: the plan this test came from shipped exactly that
 * kind of list, and it was already stale by 3 classes — the image-wrap
 * modifiers below — before a line of CSS existed).
 *
 * Scope: EVERY `.ts`/`.tsx` file under `packages/editor/src` (recursively,
 * test files excluded), MINUS a documented exclude list
 * (`EXCLUDED_EDITOR_FILES`, below) — a file, not a class name, is what gets
 * excluded, so a class added anywhere else in the package (a new extension,
 * a new node view) is picked up automatically. The excluded files:
 * - `mention-popup.ts` / `ticket-ref-popup.ts` / `wiki-link-popup.ts` — the
 *   suggestion popups, task/editor-polish's scope, already skinned.
 * - `EditorToolbar.tsx` — the main toolbar, task/editor-polish's scope,
 *   already skinned.
 * - `AttachmentListItem.tsx` / `EvidencePicker.tsx` / `UploadChips.tsx` /
 *   `ImageWrapMenu.tsx` — attachment/upload chrome, an unrelated feature
 *   area (some of it deliberately unstyled per
 *   `test/attachment-list-item.test.tsx` — a coverage list that included it
 *   would fight that contract).
 * - `ReadingTOC.tsx` / `reading-meta.ts` — the reading-view table of
 *   contents, unrelated feature.
 * - `TicketEditor.tsx` / `TicketEditorSlot.tsx` — bare `.ticket-editor`/
 *   `.ticket-editor__toolbar`/`.ticket-editor__hint`/footer structural
 *   chrome, not content this lane skins.
 * - `webview/*` — bridge/infra files, not a rendering surface.
 * `escape-suggestion.ts`/`collapsible.ts` are NOT excluded (nothing to
 * exclude them for: escape-suggestion's chip was removed in Unit R and
 * collapsible.ts has zero `class`/`className` sites) — left in the scan so a
 * class added to either later is still caught.
 *
 * Extraction: finds `class`/`className` ASSIGNMENT sites (`class:`,
 * `className =`), reads the bounded expression that follows (stops at the
 * first top-level `;`/`,`/closing bracket, capped at 200 chars — long enough
 * for a ternary or a short template literal, short enough that unrelated
 * later code can't leak in), and pulls every quoted-string class token out of
 * THAT window only. A whole-file string scan was tried first and rejected:
 * this codebase's docblocks quote CSS-looking tokens directly, and a
 * substring/whole-string scan match on `.editor-codeblock` would also match
 * `.editor-codeblock__copy` — this repo's own recorded failure mode
 * (`checks-that-cannot-fail`). Multi-class strings (`'a b'`) are split on
 * whitespace; a template literal's dynamic segment (`` `x-${y}` ``) is
 * dropped from the static token, and any token left ending in `-` (an
 * incomplete prefix, e.g. `language-` from code-block-copy.ts's open-ended,
 * currently-unused syntax-highlight hook) is discarded — it is not a valid
 * CSS class on its own and no finite CSS rule could match every value.
 *
 * One dynamic family IS finite and IS resolved for real, from the package's
 * own exported `IMAGE_WRAP_MODES`, not guessed: `ticket-image.ts` builds
 * `editor-image--${wrap}` and the three wrap modes are enumerable.
 *
 * Residual risk, disclosed rather than claimed away: a class assignment
 * shaped unlike anything above (e.g. a second-level nested ternary, or a
 * class built outside the bounded window) could still slip past this
 * extractor undetected — the general risk of any regex-based source scan.
 */
/**
 * Files EXCLUDED from the scan below, each for a documented reason — the
 * "self-checking exclusion list" the brief asks for is enforced by omitting
 * FILES, not by a second hand-typed list of class names (which is exactly
 * the shape that let this plan's own image-wrap-mode classes go unnoticed
 * the first time around).
 */
const EXCLUDED_EDITOR_FILES = new Set([
  // Suggestion popups — task/editor-polish's scope, already skinned.
  'extensions/mention-popup.ts',
  'extensions/ticket-ref-popup.ts',
  'extensions/wiki-link-popup.ts',
  // The main toolbar — task/editor-polish's scope, already skinned.
  'components/EditorToolbar.tsx',
  // The table size grid opened from the toolbar's "Insert table" tool — toolbar
  // chrome (KB editor parity); its rules live in editor.css and the toolbar
  // test (9.384) proves each class it draws has one.
  'components/TablePicker.tsx',
  // The link editor popover (KB editor parity) — a body-portalled panel; its rules
  // live in editor.css and the popover test (9.397) proves each class it draws has one.
  'components/LinkEditorPopover.tsx',
  // The reading-progress bar (KB editor parity) — a page-level fixed bar, not
  // editor content; its rules are split editor.css (structure) / globals.css
  // (colour, placement, motion) and the note-document test (9.409/9.410)
  // proves the skin half.
  'reading/ReadingProgress.tsx',
  // Attachment/upload chrome — an unrelated feature area; some of it
  // (`.attachment-item--upload`/`__name`) is deliberately UNSTYLED per an
  // existing test (`apps/web/test/attachment-list-item.test.tsx`), and a
  // scan that included it would fight that contract.
  'components/AttachmentListItem.tsx',
  'components/EvidencePicker.tsx',
  'components/ImageWrapMenu.tsx',
  'components/UploadChips.tsx',
  // Bare `.ticket-editor`/`.ticket-editor__toolbar`/`.ticket-editor__hint`
  // structural chrome — not this lane's content skin.
  'components/TicketEditor.tsx',
  'components/TicketEditorSlot.tsx',
  // The reading-view table of contents — unrelated feature.
  'reading/ReadingTOC.tsx',
  'reading/reading-meta.ts',
  // Webview bridge/infra — no content classes, not a rendering surface.
  'webview/bridge.ts',
  'webview/create-editor-bridge.ts',
  'webview/entry.tsx',
]);

/** Recursively lists every `.ts`/`.tsx` source file under `dir`, relative to it. */
function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true }) as string[];
  return entries.filter((rel) => (rel.endsWith('.ts') || rel.endsWith('.tsx')) && !rel.endsWith('.test.ts') && !rel.endsWith('.test.tsx'));
}

function extractDeclaredEditorClasses(): string[] {
  const files = listSourceFiles(EDITOR_SRC).filter((rel) => !EXCLUDED_EDITOR_FILES.has(rel.split(sep).join('/')));
  const assignRe = /\b(?:class|className)\s*[:=]\s*/g;
  const stringRe = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  const dynamicRe = /\$\{[^}]*\}/g;
  const validTokenRe = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

  function extractWindow(text: string, start: number): string {
    let depth = 0;
    const end = Math.min(text.length, start + 200);
    for (let i = start; i < end; i += 1) {
      const c = text[i];
      if (c === '(' || c === '{' || c === '[') depth += 1;
      else if (c === ')' || c === '}' || c === ']') {
        if (depth === 0) return text.slice(start, i);
        depth -= 1;
      } else if ((c === ';' || c === ',') && depth === 0) {
        return text.slice(start, i);
      }
    }
    return text.slice(start, end);
  }

  const found = new Set<string>();
  for (const relPath of files) {
    const text = readFileSync(resolve(EDITOR_SRC, relPath), 'utf8');
    assignRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = assignRe.exec(text))) {
      // A JSX `className="literal"` value starts IMMEDIATELY with a quote —
      // captured as exactly that one string, never a bounded window. JSX
      // attributes are whitespace-separated, not comma/semicolon-terminated,
      // so a window here would bleed into whatever attribute comes next
      // (measured: `className="table-toolbar" role="toolbar" aria-label=
      // "Table"` windowed straight through into the sibling attributes and
      // picked up "Table" as though it were a class). A non-literal start
      // (a ternary/template assigned via `class:`/`className =` in plain
      // TS, never JSX) still needs the wider window.
      let win: string;
      if (/^['"`]/.test(text.slice(assignRe.lastIndex, assignRe.lastIndex + 1))) {
        stringRe.lastIndex = 0;
        const literal = stringRe.exec(text.slice(assignRe.lastIndex));
        win = literal ? literal[0] : '';
      } else {
        win = extractWindow(text, assignRe.lastIndex);
      }
      stringRe.lastIndex = 0;
      let sm: RegExpExecArray | null;
      while ((sm = stringRe.exec(win))) {
        const body = sm[2];
        if (!body) continue;
        if (dynamicRe.test(body)) {
          dynamicRe.lastIndex = 0;
          if (/editor-image--?\$\{/.test(body)) {
            for (const mode of IMAGE_WRAP_MODES) found.add(`editor-image--${mode}`);
          }
          const staticPart = body.replace(dynamicRe, ' ').trim();
          for (const tok of staticPart.split(/\s+/)) {
            if (validTokenRe.test(tok) && !tok.endsWith('-')) found.add(tok);
          }
          continue;
        }
        for (const tok of body.split(/\s+/)) {
          if (validTokenRe.test(tok) && !tok.endsWith('-')) found.add(tok);
        }
      }
    }
  }
  return [...found].sort();
}

/**
 * Bare elements and third-party-injected classes the editor's own source
 * never spells as a string literal — `extractDeclaredEditorClasses` cannot
 * see these, so they are asserted explicitly.
 */
const EXPLICIT_SELECTORS: readonly string[] = [
  'h1',
  'h2',
  'h3',
  'p',
  'blockquote',
  'ul',
  'ol',
  'hr',
  'code',
  'pre',
  'a',
];

/**
 * Table selectors: `table`/`th`/`td` are bare elements, `.tableWrapper` is
 * `@tiptap/extension-table`'s own wrapper div (emitted only because
 * `renderWrapper: true` was added to `Table.configure(...)` — the option
 * defaults to `false` in this repo's installed 3.30.5, measured directly
 * against the dist, not assumed from a different project's install), and
 * `.selectedCell` is prosemirror-tables' own decoration class for a
 * multi-cell selection. Not scoped to `.ticket-editor__content` in the
 * pattern below (unlike `EXPLICIT_SELECTORS`) because the plan's own CSS
 * scopes some of these identically but a bare check here is simpler and this
 * repo has exactly one place tables render.
 */
const TABLE_SELECTORS: readonly string[] = ['table', 'th', 'td', '.selectedCell', '.tableWrapper', '.gn-comment__table-wrap'];

describe('9.341 editor skin — declared coverage', () => {
  const bare = stripComments(readFileSync(GLOBALS_CSS_PATH, 'utf8'));
  // A class the editor emits needs a rule SOMEWHERE, not specifically in
  // globals.css: a purely structural, colour-free class (e.g.
  // `.table-toolbar__group`, a bare flex wrapper) is fully and correctly
  // covered by editor.css alone, and requiring a redundant globals.css entry
  // for it would fight editor.css's own "structure only" header rule rather
  // than serve the brief's actual concern (every class gets a rule; colour,
  // when a class needs any, comes only from globals.css — that second
  // constraint is enforced separately, by the colour-scan test over
  // editor.css, not by this one).
  const bareWithStructure = bare + '\n' + stripComments(readFileSync(EDITOR_CSS_PATH, 'utf8'));
  const declaredClasses = extractDeclaredEditorClasses();

  it('the extractor found the classes measured from source at plan-resume time', () => {
    // A positive control matched by MEMBERSHIP, not just count (this repo's
    // recorded lesson: a count alone can be a plausible wrong number just as
    // easily as a right one) — the 12 classes measured from source at
    // plan-resume time must all still be found, whatever else changes.
    const measured = [
      'editor-codeblock',
      'editor-codeblock__copy',
      'editor-details',
      'editor-image',
      'editor-image--block',
      'editor-image--inline-left',
      'editor-image--inline-right',
      'editor-mention',
      'editor-ticketref',
      'editor-ticketref--purged',
      'editor-wikilink',
      'editor-wikilink--missing',
      'editor-wikilink--purged',
      'wikilink-preview',
    ];
    for (const cls of measured) {
      expect(declaredClasses, `expected ${cls} among the extracted classes`).toContain(cls);
    }
  });

  it.each(declaredClasses)('globals.css or editor.css declares a rule matching .%s', (cls) => {
    // Class-boundary match: the selector text contains `.cls` not immediately
    // followed by a class-name character (letter/digit/-/_) — `.editor-
    // codeblock` must not be satisfied by `.editor-codeblock__copy`.
    const pattern = new RegExp(`\\.${cls}(?![\\w-])`);
    expect(pattern.test(bareWithStructure), `no rule selecting .${cls} in globals.css or editor.css`).toBe(true);
  });

  it.each(EXPLICIT_SELECTORS)('globals.css declares a rule for bare element %s (scoped)', (sel) => {
    const pattern = new RegExp(`\\.ticket-editor__content[^{]*\\b${sel}\\b[^{]*\\{`);
    expect(pattern.test(bare), `no .ticket-editor__content-scoped rule for <${sel}> in globals.css`).toBe(true);
  });

  it.each(TABLE_SELECTORS)('globals.css declares a rule matching %s', (sel) => {
    const pattern = new RegExp(`(?:^|[\\s>])${sel.replace('.', '\\.')}(?![\\w-])`);
    expect(pattern.test(bare), `no rule for \`${sel}\` in apps/web/app/globals.css`).toBe(true);
  });

  it.each([
    ['.ticket-editor__content .tableWrapper {', 'the live editor'],
    ['.gn-comment__table-wrap {', 'a comment thread'],
  ])('%s actually scrolls horizontally rather than merely being present (Review Focus #2, %s)', (selector) => {
    // The plan's own Review Focus names these two properties specifically —
    // a rule matching the selector could exist and declare neither, and the
    // declared-coverage loop above would still pass (a review finding: it
    // did, for the live-editor wrapper — the comment-thread one didn't even
    // exist yet).
    const start = bare.indexOf(selector);
    expect(start, `no rule for \`${selector}\``).toBeGreaterThan(-1);
    const body = bare.slice(start, bare.indexOf('}', start));
    expect(body).toContain('overflow-x: auto');
    expect(body).toContain('max-width: 100%');
  });

  it('9.355 .table-toolbar wraps rather than overflowing at phone width (Review Focus #2, the toolbar itself)', () => {
    // 9 buttons + 3 separators at the house 32/34px-button sizing comes to
    // roughly 450px+ — wider than a ~330-375px phone editor. An absolutely
    // positioned child that overflows still adds to its ancestors'
    // scrollable overflow, which is exactly the "never widen the page"
    // failure Review Focus #2 forbids, just from the toolbar's OWN width
    // rather than the table's (a review finding: unmeasured, open risk).
    const editorCss = stripComments(readFileSync(EDITOR_CSS_PATH, 'utf8'));
    const start = editorCss.indexOf('.table-toolbar {');
    expect(start, 'no `.table-toolbar` rule in editor.css').toBeGreaterThan(-1);
    const body = editorCss.slice(start, editorCss.indexOf('}', start));
    expect(body).toContain('flex-wrap: wrap');
    expect(body).toContain('max-width: 100%');
  });
});

const GALLERY_DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H1' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H2' }] },
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'H3' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Body ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      ],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }] },
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }],
    },
    {
      type: 'orderedList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] }],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Todo' }] }],
        },
      ],
    },
    { type: 'horizontalRule' },
    { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
    {
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
        { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
      ],
    },
    { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: 'u1', label: 'ana' } }] },
    {
      type: 'paragraph',
      content: [{ type: 'ticketRef', attrs: { ticketId: 't1', projectId: 'p1', key: 'AB-1', title: 'x' } }],
    },
    { type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Note' } }] },
    { type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'gone', title: 'Missing' } }] },
    { type: 'paragraph', content: [{ type: 'ticketRef', attrs: { ticketId: 'purged', projectId: 'p1', key: 'AB-2', title: 'y' } }] },
    { type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'purged', title: 'Erased' } }] },
    {
      type: 'image',
      attrs: { src: 'https://example.com/a.png', alt: 'a', wrap: 'block', attachmentId: 'att1' },
    },
    {
      type: 'image',
      attrs: { src: 'https://example.com/b.png', alt: 'b', wrap: 'inline-left', attachmentId: 'att2' },
    },
    {
      type: 'image',
      attrs: { src: 'https://example.com/c.png', alt: 'c', wrap: 'inline-right', attachmentId: 'att3' },
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H' }] }] }],
        },
        {
          type: 'tableRow',
          content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] }],
        },
      ],
    },
  ],
};

/**
 * `.wikilink-preview` is excluded from the generic loop below: it is not
 * present in a passive render at all — `attachHoverPreview` (wiki-link.ts)
 * appends it to `document.body` only after a real `mouseenter` held past
 * `HOVER_DELAY_MS` (400ms). It still has its own dedicated interaction test
 * further down, mirroring the idiom `wiki-link.test.ts`'s own 9.300 case
 * already uses (fake timers + a real `MouseEvent`) — a querySelector loop
 * against a static gallery could never prove this one honestly.
 */
const HOVER_ONLY_CLASSES = new Set(['wikilink-preview']);

/**
 * `.table-toolbar` and its BEM children are React-COMPONENT-rendered
 * (`TableFloatingToolbar`), not something the bare `@tiptap/core` `Editor`
 * this file mounts ever draws — mounting the real `TicketEditor` tree here
 * would mean pulling React Testing Library into a file that otherwise has no
 * DOM-testing-library dependency, purely to re-prove what
 * `table-floating-toolbar.test.tsx`'s own 9.349 case already proves for real
 * (with an editable mount, a caret inside a table cell, and the actual
 * component tree). Declared coverage only, here.
 */
const COMPONENT_RENDERED_CLASSES = new Set(['table-toolbar', 'table-toolbar__group', 'table-toolbar__sep', 'table-toolbar__btn']);

describe('9.341 editor skin — matched-DOM coverage (paired arm)', () => {
  // A rule can exist and still match nothing the editor actually draws (this
  // repo's own recorded failure, `editor.css:539-551`'s `.editor-details >
  // summary`) — GALLERY_DOC carries one instance of every node/mark/chip this
  // plan skins, and each declared class must match at least one real element.
  const editor = new Editor({
    element: document.createElement('div'),
    // `resolveNoteTitle` distinguishes the live wiki-link ('n1') from the
    // missing one ('gone') the same way the production app's resolver would —
    // without it every wiki-link renders as "live" (wiki-link.ts's own
    // documented default when no resolver is configured at all).
    // `headingLink` switches the heading anchors on (KB editor parity), which is
    // what makes `.editor-heading-link` render at all.
    extensions: buildEditorExtensions({
      resolveNoteTitle: (id) => (id === 'gone' ? null : 'Note'),
      headingLink: (id) => `#${id}`,
      isPurged: (_kind, id) => id === 'purged',
    }),
    content: GALLERY_DOC,
  });
  const root = editor.view.dom;
  const declaredClasses = extractDeclaredEditorClasses().filter(
    (cls) => !HOVER_ONLY_CLASSES.has(cls) && !COMPONENT_RENDERED_CLASSES.has(cls),
  );

  // The heading-link live region is appended to `document.body` (outside the
  // contenteditable, which is the point), so it is looked up there.
  const BODY_RENDERED_CLASSES = new Set(['editor-heading-link__status']);
  it.each(declaredClasses)('.%s matches at least one rendered element', (cls) => {
    const scope = BODY_RENDERED_CLASSES.has(cls) ? document : root;
    expect(scope.querySelector(`.${cls}`), `no element in the gallery matches .${cls}`).not.toBeNull();
  });

  it('table/th/td render in the gallery', () => {
    expect(root.querySelector('table')).not.toBeNull();
    expect(root.querySelector('th')).not.toBeNull();
    expect(root.querySelector('td')).not.toBeNull();
  });

  it('.tableWrapper renders around the table (renderWrapper: true)', () => {
    expect(root.querySelector('.tableWrapper')).not.toBeNull();
    expect(root.querySelector('.tableWrapper table')).not.toBeNull();
  });

  it('a link renders as a real <a> with href', () => {
    const link = root.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com');
  });
});

describe('9.352 a multi-cell selection paints prosemirror-tables’ own .selectedCell', () => {
  it('appears on both cells once a CellSelection spans them', async () => {
    const { CellSelection } = await import('@tiptap/pm/tables');
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: buildEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
                ],
              },
            ],
          },
        ],
      },
    });
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    expect(cells.length).toBe(2);
    const selection = CellSelection.create(editor.state.doc, cells[0]!, cells[1]!);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    const selected = editor.view.dom.querySelectorAll('.selectedCell');
    expect(selected.length).toBe(2);
    editor.destroy();
  });
});

describe('9.341 the wiki-link hover preview renders .wikilink-preview after 400ms', () => {
  it('appears on document.body after a sustained hover, styled by the same rule', async () => {
    vi.useFakeTimers();
    try {
      const editor = new Editor({
        element: document.createElement('div'),
        extensions: buildEditorExtensions({
          resolveNoteTitle: () => 'Note',
          previewNote: async () => 'Preview text',
        }),
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Note' } }] }],
        },
      });
      const link = editor.view.dom.querySelector('a.editor-wikilink');
      expect(link).not.toBeNull();
      link!.dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(401);
      expect(document.querySelector('.wikilink-preview')).not.toBeNull();
      editor.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * 9.344 — the copy button stays in the tab order at rest: its hidden state
 * must be opacity, never `display`/`visibility` (a keyboard user tabbing into
 * the block must still be able to reach it before hovering).
 */
describe('9.344 the code-block copy button hides via opacity, not display/visibility', () => {
  const bare = stripComments(readFileSync(GLOBALS_CSS_PATH, 'utf8'));

  function ruleBody(css: string, selector: string): string {
    const start = css.indexOf(`${selector} {`);
    expect(start, `no rule for \`${selector}\``).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  }

  it('the base rule sets opacity: 0 and no display/visibility', () => {
    const body = ruleBody(bare, '.ticket-editor__content .editor-codeblock__copy');
    expect(body).toContain('opacity: 0');
    expect(body).not.toMatch(/display\s*:\s*none/);
    expect(body).not.toMatch(/visibility\s*:\s*hidden/);
  });

  it('a hover/focus-within/focus-visible rule restores opacity: 1', () => {
    expect(bare).toMatch(/\.editor-codeblock:hover \.editor-codeblock__copy,[\s\S]{0,300}opacity:\s*1/);
  });
});

/**
 * Chips must not be distinguished by colour alone (house rule, and WCAG
 * 1.4.1 for the live wiki-link specifically, which has no border or fill of
 * its own the way the mention/ticketref chips do). Pinned here because each
 * was a real, silent gap this plan's own first draft shipped with.
 */
describe('9.354 editor skin — colour-alone and token-collision regressions', () => {
  const bare = stripComments(readFileSync(GLOBALS_CSS_PATH, 'utf8'));

  function ruleBody(css: string, selector: string): string {
    const start = css.indexOf(`${selector} {`);
    expect(start, `no rule for \`${selector}\``).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  }

  it('a LIVE wiki-link is underlined at rest (not colour alone) and loses the underline only on hover', () => {
    const rest = ruleBody(bare, '.ticket-editor__content .editor-wikilink');
    expect(rest).toMatch(/text-decoration:\s*underline(?!\s+wavy)/);
    const hover = ruleBody(bare, '.ticket-editor__content .editor-wikilink:not(.editor-wikilink--missing):hover');
    expect(hover).toContain('text-decoration: none');
  });

  it('the missing wiki-link keeps its wavy underline even though the live rule sets a solid one', () => {
    const missing = ruleBody(bare, '.ticket-editor__content .editor-wikilink--missing');
    expect(missing).toMatch(/text-decoration:\s*underline\s+wavy/);
  });

  it('a ticketRef chip with a real href does not also wear the UA default link underline', () => {
    const body = ruleBody(bare, '.ticket-editor__content .editor-ticketref');
    expect(body).toContain('text-decoration: none');
  });

  it('.selectedCell uses a DIFFERENT fill token than th, so a selected header cell reads as selected', () => {
    const th = ruleBody(bare, '.ticket-editor__content th,\n.gn-comment__table th');
    const selected = ruleBody(bare, '.ticket-editor__content .selectedCell');
    const thToken = /background:\s*var\((--gn-[\w-]+)\)/.exec(th)?.[1];
    const selectedToken = /background:\s*var\((--gn-[\w-]+)\)/.exec(selected)?.[1];
    expect(thToken).toBeDefined();
    expect(selectedToken).toBeDefined();
    expect(selectedToken).not.toBe(thToken);
  });

  it('the code block copy button stays reachable when a long line scrolls (overflow on pre, not the block)', () => {
    const block = ruleBody(bare, '.ticket-editor__content .editor-codeblock');
    expect(block).not.toMatch(/overflow-x/);
    const pre = ruleBody(bare, '.ticket-editor__content .editor-codeblock pre');
    expect(pre).toContain('overflow-x: auto');
  });
});
