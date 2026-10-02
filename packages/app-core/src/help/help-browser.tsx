import { SegmentedControl, useScrollEdges } from '@gisik-nokma/ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { HELP_CONTENT } from './content.generated.js';
import {
  HELP_DOCUMENT_LABELS,
  helpGroupTitle,
  helpNav,
  type HelpNavGroup,
} from './groups.js';
import { searchHelp, type HelpMatch, type HelpSearchResult } from './search.js';
import type { HelpBlock, HelpDocument, HelpSpan } from './types.js';

/**
 * The manual and FAQ, drawn for the two apps that are React DOM: `apps/web` and
 * `apps/desktop`.
 *
 * ## One component for two apps, not two that look alike
 *
 * Desktop is Vite + React DOM and web is Next + React DOM, so there is no
 * technical reason for them to have separate help screens — and a very good
 * reason not to: two renderers of the same document drift, and the drift is
 * invisible until somebody compares two machines. `apps/mobile` is React Native
 * and genuinely cannot share this, so it has its own screen over the same parsed
 * content. Two renderers for three apps is the floor, not a compromise.
 *
 * ## It needs no session, no network and no workspace
 *
 * The content is bundled, so this is reachable while signed out, while offline,
 * and on a phone with no signal. That is not incidental — the FAQ's answers to
 * *"why can't I sign in"* and *"what does offline mean"* are worth least at
 * exactly the moment a network-fetched help page would fail to load.
 */

function Span({ span }: { span: HelpSpan }) {
  switch (span.kind) {
    case 'bold':
      return <strong>{span.text}</strong>;
    case 'italic':
      return <em>{span.text}</em>;
    case 'code':
      return <code className="gn-help__code">{span.text}</code>;
    case 'link':
      // Internal links from the source documents point at repository paths that
      // mean nothing in an app, so only real URLs become anchors; the rest
      // render as their own text rather than as a link that goes nowhere.
      return /^https?:\/\//.test(span.href) ? (
        <a className="gn-help__link" href={span.href} target="_blank" rel="noreferrer">
          {span.text}
        </a>
      ) : (
        <>{span.text}</>
      );
    case 'text':
      return <>{span.text}</>;
  }
}

function Spans({ spans }: { spans: readonly HelpSpan[] }) {
  return (
    <>
      {spans.map((span, i) => (
        <Span key={i} span={span} />
      ))}
    </>
  );
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p className="gn-help__p">
          <Spans spans={block.spans} />
        </p>
      );
    case 'quote':
      return (
        <blockquote className="gn-help__quote">
          <Spans spans={block.spans} />
        </blockquote>
      );
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <Spans spans={item} />
        </li>
      ));
      // `ol` and not a styled `ul`: the manual is instructions, and a numbered
      // sequence that renders unnumbered stops telling a reader what order to do
      // things in. The semantics also reach a screen reader, which announces an
      // ordered list as one.
      return block.ordered ? (
        <ol className="gn-help__list">{items}</ol>
      ) : (
        <ul className="gn-help__list">{items}</ul>
      );
    }
    case 'table':
      return (
        <div className="gn-help__table-scroll">
          <table className="gn-help__table">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i}>
                    <Spans spans={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <Spans spans={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Blocks({ blocks }: { blocks: readonly HelpBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}

function DocumentView({ document }: { document: HelpDocument }) {
  const label = HELP_DOCUMENT_LABELS[document.id];
  return (
    <article className="gn-help__doc">
      <Blocks blocks={document.intro} />
      {document.sections.map((section) => {
        const group = helpGroupTitle(document, section.id);
        return (
          <section
            key={section.id}
            className="gn-help__section"
            id={`${document.id}-${section.id}`}
          >
            {/*
              The section eyebrow — `MANUAL · GETTING STARTED`. An ADDITION,
              with no shipped wording to replace, and its job is to say WHERE
              you are once the sidebar's groups exist: a reader who followed a
              deep link or a search result lands mid-document with no other
              signal about which topic they are in.

              It is rendered STATICALLY, once per section, rather than computed
              from scroll position. The prototype can show one because it draws
              a single section at a time; over the full document a scroll-spy
              would be the equivalent, and a per-section eyebrow is both simpler
              and always right. A document that declares no groups (the FAQ)
              shows the label alone rather than an empty separator.
            */}
            <p className="gn-help__section-eyebrow">
              {group === null ? label : `${label}, ${group}`}
            </p>
            <h2 className="gn-help__h2">{section.title}</h2>
            <Blocks blocks={section.intro} />
            {section.entries.map((entry) => (
              <div key={entry.id} className="gn-help__entry" id={`${document.id}-${entry.id}`}>
                <h3 className="gn-help__h3">{entry.title}</h3>
                <Blocks blocks={entry.blocks} />
              </div>
            ))}
          </section>
        );
      })}
    </article>
  );
}

function Results({ matches, query }: { matches: HelpMatch[]; query: string }) {
  return (
    <div className="gn-help__results">
      {/* E4-36 (2026-09-21). `role="status"` — the no-match arm thirty lines
          below (`gn-help__none`) has carried one all along, so the help search
          ANNOUNCED "nothing matches" and stayed silent when it found nine
          things. Measured on `/help` at 1512: after typing `invite`,
          `document.querySelectorAll('[role=status],[aria-live]')` → none, while
          the count paragraph rendered `9 answers for “invite”`. A polite live
          region is the pair this sentence was missing, not a different string:
          the count is the answer to the question a screen-reader user just
          asked by typing, and it is the one thing on the screen that changed.

          Not `aria-live` directly: `role="status"` IS `aria-live="polite"` with
          a name, and it is the idiom the sibling arm already uses. */}
      <p className="gn-help__results-count" role="status">
        {matches.length} {matches.length === 1 ? 'answer' : 'answers'} for “{query}”
      </p>
      <ul className="gn-help__results-list">
        {matches.map((match) => (
          <li key={`${match.document}-${match.entry.id}`} className="gn-help__result">
            <a className="gn-help__result-title" href={`#${match.document}-${match.entry.id}`}>
              {match.entry.title}
            </a>
            <span className="gn-help__result-where">
              {match.documentTitle}, {match.sectionTitle}
            </span>
            {match.excerpt.length > 0 ? (
              <span className="gn-help__result-excerpt">{match.excerpt}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What a search puts on the page: the matches, or the one sentence that says nothing matched, or nothing at all
 * for an empty query.
 *
 * ONE component for two homes (23.235): on desktop it renders in the main reading column, where a long excerpt
 * has room; on a phone it renders inside the floating panel, so a reader halfway down the manual can search and
 * pick an entry without scrolling to the top. `HelpBrowser` renders it in exactly one of the two, never both —
 * a second copy would be a second `role="status"` region announcing the same count twice.
 *
 * `compact` drops the sentence that points at "the list below": inside the panel there is no list below it.
 */
function SearchOutput({
  result,
  query,
  compact,
}: {
  result: HelpSearchResult;
  query: string;
  compact: boolean;
}) {
  // The three states are drawn separately and named, rather than collapsing two of them into an empty list.
  // "You have not searched yet" and "nothing matched that" are different situations, and this product says
  // which kind of nothing it is looking at everywhere else.
  if (result.kind === 'matches') return <Results matches={result.matches} query={query} />;
  if (result.reason.kind !== 'no-match') return null;
  return (
    <p className="gn-help__none" role="status">
      Nothing in the manual or FAQ matches <strong>“{result.reason.query}”</strong>. All{' '}
      {result.reason.searched} entries were searched, so this is a real absence rather than a search that did
      not run. The product may simply not do that thing yet.
      {compact ? '' : ' The list below is everything there is.'}
    </p>
  );
}

/**
 * Which fragment the URL is pointing at, as a piece of React state.
 *
 * This is what marks the active item in the sidebar, and it is deliberately the
 * URL rather than a click handler's own memory of the last thing clicked. Three
 * things set the fragment — a sidebar link, a search result, an external deep
 * link into `#manual-…` — and all three should light up the same sidebar row.
 * A `useState` in the click handler would light it up for one of them and lie
 * about the other two.
 *
 * `window` is read inside the effect, never during render: `/help` is a client
 * component but Next still renders it on the server, where there is no
 * `location`. The first paint therefore marks nothing, and the effect corrects
 * it on mount — which is also the behaviour a test in jsdom sees.
 */
function useUrlFragment(): string {
  const [fragment, setFragment] = useState('');
  useEffect(() => {
    const read = () => {
      setFragment(window.location.hash.replace(/^#/, ''));
    };
    read();
    window.addEventListener('hashchange', read);
    return () => {
      window.removeEventListener('hashchange', read);
    };
  }, []);
  return fragment;
}

/**
 * The section a URL fragment is inside — the section itself if the fragment
 * names one, otherwise the section that OWNS the entry it names.
 *
 * The entry case is the one that matters: every search result links to
 * `#${document}-${entry.id}`, so without the second lookup, using the search
 * would leave the sidebar marking nothing while the reader sat in the middle of
 * a section it could have named.
 */
/**
 * Which section is currently in the reading pane.
 *
 * The whole document is on the page, so "where am I" is a question about SCROLL
 * POSITION and not about the last thing clicked — the owner's instruction was
 * "since it's a single page document, highlight the section that is currently
 * displayed in the reading pane". A reader who scrolls with the wheel never
 * touches a link, and until this existed the sidebar went on marking whatever
 * anchor they last followed, or nothing at all.
 *
 * ## `IntersectionObserver` and not a scroll handler
 *
 * A `scroll` listener fires on every frame of a flick and would have to measure
 * 16 or 29 elements each time. The observer reports only when a boundary is
 * actually crossed, off the main thread's critical path.
 *
 * `rootMargin: '-15% 0px -70% 0px'` narrows the root to a band across the upper
 * quarter of the viewport — the reading position, rather than "anywhere on
 * screen", which on a wide monitor is three sections at once.
 *
 * ## The rule when two sections share the band, stated because it is a choice
 *
 * The EARLIEST in document order wins. So the highlight advances when the
 * outgoing section's tail leaves the band, not the moment the next heading
 * appears in it — which keeps the marked row matching the prose the reader is
 * still in, and makes the transition happen once rather than flickering back
 * and forth across a boundary.
 *
 * ## When the band holds NOTHING, which is the common case at the top
 *
 * The first cut of this kept the last answer, reasoning that "no section" is
 * never true of a document being scrolled through. Both halves of that were
 * wrong, and scrolling a real browser said so:
 *
 * - **At the top, nothing is in the band at all.** The `h1`, the search box and
 *   the document intro fill the upper third of the viewport, so the first
 *   section starts below the band and NO row was marked — where the reference
 *   marks the first one.
 * - **Scrolling back up left a stale mark.** "Keep the last answer" means the
 *   row for §8 stays lit after the reader returns to the top, which is worse
 *   than marking nothing: it is a confident wrong answer.
 *
 * So an empty band falls back to GEOMETRY: the last section whose top edge has
 * already passed the top of the viewport, or the FIRST section when none has —
 * which is the top-of-document case, and the reference's own behaviour. The
 * measurement runs only when the band is empty, which is rare.
 *
 * ## Where there is no `IntersectionObserver` at all
 *
 * jsdom. This returns `null` for good and the caller falls back to the URL
 * fragment. Note the geometric branch above is NOT meaningfully testable there
 * either: jsdom gives every element a zero rect, so `top <= 0` is true of every
 * section and the fallback would pick the last one. That is an artifact of the
 * environment, not this rule, and no test asserts it.
 */
function useVisibleSection(document: HelpDocument | undefined): string | null {
  const [visible, setVisible] = useState<string | null>(null);
  useEffect(() => {
    setVisible(null);
    if (document === undefined || typeof IntersectionObserver === 'undefined') return;
    const prefix = `${document.id}-`;
    const rank = new Map(document.sections.map((section, i) => [`${prefix}${section.id}`, i]));
    const inBand = new Set<string>();
    const ids = [...rank.keys()];
    const resolve = (): string | null => {
      let earliest: string | null = null;
      for (const id of inBand) {
        if (earliest === null || (rank.get(id) ?? 0) < (rank.get(earliest) ?? 0)) earliest = id;
      }
      if (earliest !== null) return earliest;
      // Band empty — see the docblock. The last section already scrolled past
      // the top of the viewport, else the first section (top of the document).
      let passed: string | null = null;
      for (const id of ids) {
        const element = window.document.getElementById(id);
        if (element !== null && element.getBoundingClientRect().top <= 0) passed = id;
      }
      return passed ?? ids[0] ?? null;
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        const found = resolve();
        setVisible(found === null ? null : found.slice(prefix.length));
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    for (const id of rank.keys()) {
      const element = window.document.getElementById(id);
      if (element !== null) observer.observe(element);
    }
    return () => {
      observer.disconnect();
    };
  }, [document]);
  return visible;
}

function sectionOfFragment(document: HelpDocument, fragment: string): string | null {
  const prefix = `${document.id}-`;
  if (fragment === '' || !fragment.startsWith(prefix)) return null;
  const id = fragment.slice(prefix.length);
  const direct = document.sections.find((section) => section.id === id);
  if (direct !== undefined) return direct.id;
  const owner = document.sections.find((section) =>
    section.entries.some((entry) => entry.id === id),
  );
  return owner === undefined ? null : owner.id;
}

function GroupItems({
  group,
  documentId,
  activeSection,
  listId,
}: {
  group: HelpNavGroup;
  documentId: HelpDocument['id'];
  activeSection: string | null;
  listId: string;
}) {
  return (
    <ul className="gn-help__group-items" id={listId}>
      {group.sections.map((section) => (
        <li key={section.id}>
          <a
            className="gn-help__nav-link"
            href={`#${documentId}-${section.id}`}
            // `location`, not `page`: the target is a place WITHIN this page,
            // which is exactly the distinction ARIA draws between the two
            // values. `.gn-settings__sidebar a[aria-current='page']` next door
            // links real routes and is right to use `page`; copying it here
            // would tell a screen reader the reader had changed page.
            aria-current={section.id === activeSection ? 'location' : undefined}
          >
            {section.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The phone breakpoint, spelled exactly as the stylesheet's `@media` arm spells it (`packages/ui/src/ui.css`,
 * the `.gn-help__sidebar` phone arm). Case 23.232 reads both and fails if they drift: a floating button drawn at
 * one width while the CSS turns the sidebar into a panel at another would leave a reader with a button that opens
 * nothing, or a panel with no button.
 */
export const HELP_PHONE_QUERY = '(max-width: 47.9375rem)';

function subscribePhone(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(HELP_PHONE_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function phoneSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(HELP_PHONE_QUERY).matches
    : false;
}

/**
 * Is Help on a phone? Decides where the search RESULTS render (the panel, or the main column) and whether `/`
 * opens the panel; every purely visual phone rule stays in the stylesheet. `false` on the server and wherever
 * `matchMedia` is missing (jsdom), which is the desktop layout every existing suite already drives.
 */
function useHelpPhone(): boolean {
  return useSyncExternalStore(subscribePhone, phoneSnapshot, () => false);
}

/** Is the keystroke going into something the reader is typing in? `/` must not steal it. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select') !== null) return true;
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

/**
 * THE search field — one component, rendered once, in the sidebar's pinned header (23.239). On desktop it is the
 * first thing in that header, above the Manual/FAQ switch; on a phone the same node is the first thing in the
 * floating panel. It is never two fields kept in sync: there is one `query`, one input and one `ref`.
 *
 * The visible label is gone and the accessible name is kept (a visually-hidden `label`): in a pinned header 44px
 * is the budget, and the placeholder says the same thing in the ~226px content width. The `/` hint is drawn only
 * while the field is empty, so it never sits under the browser's own clear button.
 */
function HelpSearch({
  value,
  onChange,
  onKeyDown,
  onFocus,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onFocus: (relatedTarget: EventTarget | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="gn-help__search">
      <label className="gn-visually-hidden" htmlFor="gn-help-search">
        Search the manual and FAQ
      </label>
      <input
        id="gn-help-search"
        ref={inputRef}
        className="gn-help__search-input"
        type="search"
        value={value}
        placeholder="Search help"
        aria-keyshortcuts="/"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(event) => onFocus(event.relatedTarget)}
      />
      {value === '' ? (
        <kbd className="gn-help__search-hint" aria-hidden="true">
          /
        </kbd>
      ) : null}
    </div>
  );
}

/**
 * The topic sidebar: a pinned header (search, then the document tabs) and the topics, and it is also the phone's
 * floating panel.
 *
 * ## One element, two layouts (23.231–23.236)
 *
 * Above the phone breakpoint this is the sticky sidebar: the header is `flex: none` and the topics list is the
 * ONLY part that scrolls, so the Manual/FAQ switch never leaves the viewport. At `≤47.9375rem` the same `<aside>`
 * becomes a fixed bottom-right panel that the floating launcher (a sibling, drawn by `HelpBrowser`) opens. The
 * same DOM nodes serve both, so the order — search, switch, groups — and the single search field come for free.
 * This replaces the in-flow "Contents" disclosure of 23.174.
 *
 * ## It navigates the whole document; it does not replace it
 *
 * The prototype renders ONE SECTION AT A TIME, chosen from this sidebar. That
 * is the one item of its design deliberately not adopted, and the reason is the
 * standing copy rule's own opening clause — *"reject anything that loses
 * information"*. Rendering one section of 16 would cost three things that work
 * today and have no replacement:
 *
 * 1. **Browser find.** `Ctrl-F` reaches any word in all 224 entries across both
 *    documents. With one section drawn it reaches only the open one.
 * 2. **The search results.** Every hit links to `#${document}-${entry.id}`,
 *    which resolves because the target is on the page.
 * 3. **External deep links.** Anything pointing at a `#manual-…` anchor stops
 *    resolving for the same reason.
 *
 * Keeping the full document buys the prototype's information architecture — the
 * groups, the counts, the active row — at none of that cost. The section
 * eyebrow works over a scrolling document unchanged; only the render mode is
 * declined. (The per-section `Next` pager that once sat here was removed by the
 * owner's ruling, 23.230: one continuous page.)
 *
 * ## Groups default to OPEN
 *
 * Collapsed-by-default would put every section behind a click and make the
 * sidebar a strictly worse index than the flat list of section links it
 * replaces. The prototype's own initial state is `helpOpenGroups: {}`, whose
 * meaning depends on a comparison this repo cannot see, so there is no
 * reference answer to port; open is the choice that cannot lose a reader
 * anything. State is per-mount and not persisted — nothing else on this screen
 * persists either, and a remembered collapse is a preference nobody has asked
 * for yet.
 */
function TopicSidebar({
  document,
  documentId,
  onDocument,
  activeSection,
  search,
  panelOpen,
  panelResults,
  onPick,
  asideRef,
}: {
  document: HelpDocument;
  documentId: HelpDocument['id'];
  onDocument: (id: HelpDocument['id']) => void;
  activeSection: string | null;
  search: ReactNode;
  panelOpen: boolean;
  /** The search output, when it belongs in the panel (a phone) and a query is showing; otherwise `null`. */
  panelResults: ReactNode;
  /** A link inside the panel was chosen. */
  onPick: (event: { target: EventTarget | null }) => void;
  asideRef: RefObject<HTMLElement | null>;
}) {
  const [collapsed, setCollapsed] = useState<Readonly<Record<string, true>>>({});
  const nav = useMemo(() => helpNav(document), [document]);
  const edgesRef = useScrollEdges<HTMLElement>('y');

  return (
    <aside
      id="gn-help-panel"
      className="gn-help__sidebar"
      ref={asideRef}
      tabIndex={-1}
      data-panel-open={panelOpen ? 'true' : 'false'}
    >
      {/* The PINNED header: it never scrolls, on desktop (23.231) or in the phone panel (23.233). */}
      <div className="gn-help__sidebar-head">
        {search}
        {/*
          The document switch, MOVED here from above the search box and REBUILT
          on the shared `SegmentedControl` (2026-09-15).

          It was two bordered buttons carrying the documents' full titles, stacked
          into a column because "Gisik Nokma — instruction manual" is 31
          characters and will not sit beside its sibling in 274px. The owner
          lifted the copy ruling that forced that — "forget the ruling on the
          information losing. make the manual/faq switch like in the attached
          file" — so the labels are the reference's own `Manual`/`FAQ` (its
          source: `helpTabs: [{ k: "manual", l: "Manual" }, { k: "faq", l: "FAQ"
          }]`), and with two short words the reference's side-by-side pair fits.

          `SegmentedControl` rather than a local rule, because the reference's
          treatment IS this component's: a 2px tray, `flex: 1` segments, and the
          selected one lifted onto `surfaceRaised` + `shadowRaised`. Measured
          against the prototype's inline styles, the only deliberate divergence
          is the segment height — 44px here against its 36px — and that number is
          load-bearing: `ui.css` records that 40px reddened the tap-target
          ratchet on `/sign-in` the moment anything first rendered the component.

          It also retires a whole local identity. `/account`'s Style and Theme
          controls are already `SegmentedControl`; a fifth hand-rolled segmented
          row on this screen was the thing to avoid.

          `aria-label` carries the same string the `<nav>` wrapper used to, so no
          accessible name is lost. The wrapper itself is gone deliberately: a
          `tablist` is a control, not a navigation landmark, and wrapping one in
          `<nav>` announced a region that was never navigation.
        */}
        <SegmentedControl
          options={HELP_CONTENT.map((doc) => ({
            value: doc.id,
            label: HELP_DOCUMENT_LABELS[doc.id],
          }))}
          value={documentId}
          onChange={onDocument}
          aria-label="Help documents"
        />
      </div>
      {panelResults === null ? null : (
        <div className="gn-help__panel-results" onClick={onPick}>
          {panelResults}
        </div>
      )}
      {/*
        `aria-labelledby` on the landmark rather than an `aria-label` that
        repeats the word: the visible "Topics" is real text, so pointing at it
        names the navigation region without a second copy of the string that
        could drift from it. A heading would also name it, but it would put a
        third `h2` level into a page whose `h2`s are the document's sections.

        The topics list is the ONE scroller of the sidebar (and of the phone panel), so the scroll fade lives
        here and not on the `aside`: a fade mask on the container that also holds the header would fade the
        pinned switch. It is `hidden` while the panel shows search results instead of the topics.
      */}
      <nav
        id="gn-help-nav"
        className="gn-help__nav gn-scroll-fade gn-scroll-fade--y"
        ref={edgesRef}
        aria-labelledby="gn-help-topics"
        hidden={panelResults !== null}
        onClick={onPick}
      >
        <p className="gn-help__eyebrow" id="gn-help-topics">
          Topics
        </p>
        <div className="gn-help__groups">
          {nav.map((group) => {
            const listId = `gn-help-group-${group.id}`;
            if (group.title === null) {
              // An unnamed run: either a document that declares no groups (the
              // FAQ, whose 13 sections are already topic names) or a section
              // that has drifted out of every group. Flat, with no toggle —
              // there is no name to put on the button.
              return (
                <GroupItems
                  key={group.id}
                  group={group}
                  documentId={documentId}
                  activeSection={activeSection}
                  listId={listId}
                />
              );
            }
            const open = collapsed[group.id] !== true;
            return (
              <div key={group.id} className="gn-help__group">
                <button
                  type="button"
                  className="gn-help__group-toggle"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() =>
                    setCollapsed((was) => {
                      const next = { ...was };
                      if (open) next[group.id] = true;
                      else delete next[group.id];
                      return next;
                    })
                  }
                >
                  <span className="gn-help__caret" aria-hidden="true">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                  <span className="gn-help__group-title">{group.title}</span>
                  <span className="gn-help__group-count">{group.sections.length}</span>
                </button>
                {open ? (
                  <GroupItems
                    group={group}
                    documentId={documentId}
                    activeSection={activeSection}
                    listId={listId}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

/**
 * The floating "Contents and search" button (23.232). Drawn only at phone width (the stylesheet hides it above
 * the breakpoint), bottom-right, lifted over the bottom bar by `--gn-bar-lift`. While the panel is open it shows
 * a ✕ where the list glyph was: the same button closes the panel (23.234).
 *
 * The accessible name stays "Contents and search" in both states and `aria-expanded` carries the state — a
 * name that flipped to "Close …" would make a screen reader announce a different control mid-interaction.
 */
function Launcher({
  open,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="gn-toc-launcher__button gn-help__launcher"
      aria-label="Contents and search"
      aria-expanded={open}
      aria-controls="gn-help-panel"
      onClick={onToggle}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h10M4 18h13" />}
      </svg>
    </button>
  );
}

export function HelpBrowser() {
  const [query, setQuery] = useState('');
  const [documentId, setDocumentId] = useState<HelpDocument['id']>('manual');
  const [panelOpen, setPanelOpen] = useState(false);
  const result = useMemo(() => searchHelp(HELP_CONTENT, query), [query]);
  const active = HELP_CONTENT.find((d) => d.id === documentId) ?? HELP_CONTENT[0];
  const fragment = useUrlFragment();
  const visibleSection = useVisibleSection(active);
  const phone = useHelpPhone();
  const asideRef = useRef<HTMLElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  /** Where focus was before the search field took it — what Escape gives focus back to. */
  const cameFrom = useRef<Element | null>(null);
  const jumpFrom = useRef<Element | null>(null);
  /** The `/` shortcut opened the panel and wants the search field, not the panel itself, focused. */
  const wantSearch = useRef(false);
  const savedScroll = useRef<number | null>(null);
  /*
    SCROLL POSITION FIRST, the URL second, and both are needed.

    The scroll spy is the answer to "which section is the reader looking at",
    which is the question the owner asked. But it reports nothing until its
    first callback lands — one frame after mount — and it reports nothing at all
    where `IntersectionObserver` is absent. The fragment covers exactly those
    gaps: a deep link into `#manual-10-…` marks the right row on the FIRST
    paint instead of a frame later, and it is the only one of the two that jsdom
    can exercise, so the fallback is also the testable half.

    They agree once both have an answer: the browser scrolls a fragment target
    into view, so the spy's verdict a frame later is the fragment's section.
  */
  const activeSection =
    visibleSection ?? (active === undefined ? null : sectionOfFragment(active, fragment));

  const searching = result.kind === 'matches' || result.reason.kind === 'no-match';
  const output = (
    <SearchOutput result={result} query={query.trim()} compact={phone} />
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    launcherRef.current?.focus({ preventScroll: true });
  }, []);

  // A link chosen inside the panel closes it, so the article it jumped to is what the reader sees. Only on a
  // phone with the panel open: on desktop the same links are the plain sidebar and must not move focus.
  const onPick = useCallback(
    (event: { target: EventTarget | null }) => {
      if (!panelOpen) return;
      if (event.target instanceof Element && event.target.closest('a') !== null) closePanel();
    },
    [panelOpen, closePanel],
  );

  // Escape and an outside tap close the panel and give focus back to its button (23.234).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closePanel();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (asideRef.current?.contains(target) || launcherRef.current?.contains(target)) return;
      // The browser's own mousedown focus change runs AFTER this handler, so focusing the button now would be
      // undone. Close now; give focus back one task later, and only if the tap left it nowhere (a tap on another
      // control keeps the focus it just took).
      setPanelOpen(false);
      setTimeout(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) launcherRef.current?.focus({ preventScroll: true });
      }, 0);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [panelOpen, closePanel]);

  // Opening: focus moves into the panel (the search field if `/` asked for it) and the current section is
  // scrolled into view inside the topics list (23.233). The list is scrolled by its own `scrollTop` and not with
  // `scrollIntoView`, which would also scroll every ancestor, the page included.
  useEffect(() => {
    if (!panelOpen) return;
    const aside = asideRef.current;
    if (aside === null) return;
    if (wantSearch.current) {
      wantSearch.current = false;
      searchRef.current?.focus();
    } else {
      aside.focus({ preventScroll: true });
    }
    const nav = aside.querySelector<HTMLElement>('.gn-help__nav');
    const current = nav?.querySelector<HTMLElement>('[aria-current="location"]');
    if (nav !== null && nav !== undefined && current !== null && current !== undefined && !nav.hidden) {
      const within = nav.getBoundingClientRect();
      const at = current.getBoundingClientRect();
      nav.scrollTop += at.top - within.top - (within.height - at.height) / 2;
    }
  }, [panelOpen]);

  // `/` focuses the search from anywhere (23.240) — except while the reader is typing somewhere, or holding a
  // modifier (Ctrl+/ and Cmd+/ belong to the browser and the OS).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      jumpFrom.current = window.document.activeElement;
      if (!phone) {
        searchRef.current?.focus();
      } else if (panelOpen) {
        searchRef.current?.focus();
      } else {
        wantSearch.current = true;
        setPanelOpen(true);
      }
    };
    window.document.addEventListener('keydown', onKey);
    return () => window.document.removeEventListener('keydown', onKey);
  }, [phone, panelOpen]);

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;
    if (phone) {
      // A typed query is cleared first; an empty field lets Escape reach the panel, which closes it.
      if (query !== '') {
        event.preventDefault();
        event.stopPropagation();
        setQuery('');
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setQuery('');
    const back = cameFrom.current;
    cameFrom.current = null;
    if (back instanceof HTMLElement && back.isConnected && back !== window.document.body) {
      back.focus();
    } else {
      searchRef.current?.blur();
    }
  };

  const onSearchFocus = (relatedTarget: EventTarget | null) => {
    const from = jumpFrom.current ?? (relatedTarget instanceof Element ? relatedTarget : null);
    jumpFrom.current = null;
    cameFrom.current = from;
  };

  // The reader's place in the document survives a search (23.239): the results are drawn above the document in
  // the column, so the position is saved as the query goes from empty to non-empty and put back when it clears.
  const changeQuery = (next: string) => {
    if (query.trim() === '' && next.trim() !== '' && savedScroll.current === null) {
      savedScroll.current = window.scrollY;
    }
    setQuery(next);
  };
  const wasSearching = useRef(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (wasSearching.current && !searching) {
      const was = savedScroll.current;
      savedScroll.current = null;
      if (was !== null && Math.abs(window.scrollY - was) > 1) window.scrollTo(0, was);
    }
    // The first results of a search made from deep in the document are drawn above the reader: bring them into view,
    // just once (not on later keystrokes) and only when they are not already in view. Focus stays in the field.
    if (!wasSearching.current && searching && !phone) {
      const at = resultsRef.current;
      if (at !== null) {
        const margin = Number.parseFloat(getComputedStyle(at).scrollMarginTop) || 0;
        const top = at.getBoundingClientRect().top;
        if (top < margin - 1 || top > window.innerHeight - 1) at.scrollIntoView({ block: 'start' });
      }
    }
    wasSearching.current = searching;
  }, [searching, phone]);
  // Following a result (or any link) makes the old position stale: clearing afterwards must not yank the reader
  // back from the entry they chose.
  useEffect(() => {
    const forget = () => {
      savedScroll.current = null;
    };
    window.addEventListener('hashchange', forget);
    return () => window.removeEventListener('hashchange', forget);
  }, []);

  const search = (
    <HelpSearch
      value={query}
      onChange={changeQuery}
      onKeyDown={onSearchKeyDown}
      onFocus={onSearchFocus}
      inputRef={searchRef}
    />
  );

  return (
    <div className="gn-help">
      {active === undefined ? null : (
        <TopicSidebar
          document={active}
          documentId={documentId}
          onDocument={setDocumentId}
          activeSection={activeSection}
          search={search}
          panelOpen={panelOpen}
          panelResults={phone && searching ? output : null}
          onPick={onPick}
          asideRef={asideRef}
        />
      )}
      <div className="gn-help__main">
        <div className="gn-help__column">
          {/*
            THE PAGE'S OWN `h1`, and it is an ADDITION rather than a restyle.
            Before this, `/help` had no `h1` at all — measured in a real browser,
            not inferred — so the first heading on the page was an `h2` from the
            document body, and the heading hierarchy started at level 2.

            It lives here and not in `apps/web/app/help/page.tsx` for the reason
            this component exists at all (see the docblock above): web and desktop
            both render it, and a title owned by one shell is a title the other
            silently lacks.

            The desktop prototype opens its Help screen the same way. Adopting it
            is what the standing copy rule asks for — "reject anything that loses
            information or an aria-label; keep shipped wording where it's merely
            different; adopt the additions" (owner, 2026-09-08) — since there is no
            shipped wording here to replace.
          */}
          <h1 className="gn-help__title">Help</h1>
          {phone || !searching ? null : (
            <div ref={resultsRef} className="gn-help__results-anchor">
              {output}
            </div>
          )}

          {/*
            The flat `.gn-help__toc` — a wrapped row of every section link — stood
            here until the sidebar landed, and its removal SUPERSEDES the commit two
            before this one, which flattened it to match the older prototype's own
            treatment. That commit was right about the older reference and is now
            moot: the sidebar is the same index, grouped, always visible, and it
            marks where you are. Two rows of section links would be two of them.

            Nothing is lost with it. Every anchor it pointed at is still rendered
            (`#${document.id}-${section.id}`), still reachable from the sidebar, and
            still reachable from an external deep link.
          */}
          {active === undefined ? null : <DocumentView document={active} />}
        </div>
      </div>
      <Launcher
        open={panelOpen}
        onToggle={() => (panelOpen ? closePanel() : setPanelOpen(true))}
        buttonRef={launcherRef}
      />
    </div>
  );
}
