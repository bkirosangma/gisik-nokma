import { useEffect, useMemo, useState } from 'react';
import { HELP_CONTENT } from './content.generated.js';
import {
  HELP_DOCUMENT_LABELS,
  helpGroupTitle,
  helpNav,
  helpNextSection,
  type HelpNavGroup,
} from './groups.js';
import { searchHelp, type HelpMatch } from './search.js';
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
        const next = helpNextSection(document, section.id);
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
              {group === null ? label : `${label} · ${group}`}
            </p>
            <h2 className="gn-help__h2">{section.title}</h2>
            <Blocks blocks={section.intro} />
            {section.entries.map((entry) => (
              <div key={entry.id} className="gn-help__entry" id={`${document.id}-${entry.id}`}>
                <h3 className="gn-help__h3">{entry.title}</h3>
                <Blocks blocks={entry.blocks} />
              </div>
            ))}
            {/*
              The `Next` pager. A real anchor to the next section's own id, not
              a state change — so it works with middle-click, with the back
              button, and while JavaScript is still loading, and it leaves a
              fragment in the URL that the sidebar's active marker then reads.

              Drawn per section rather than once at the page foot because the
              document is all on the page: the pager's value here is "you have
              reached the end of THIS topic", which is a per-section fact. The
              last section gets none at all rather than one pointing nowhere.
            */}
            {next === null ? null : (
              <p className="gn-help__pager">
                <span className="gn-help__pager-label">Next</span>
                <a className="gn-help__pager-link" href={`#${document.id}-${next.id}`}>
                  {next.title}
                </a>
              </p>
            )}
          </section>
        );
      })}
    </article>
  );
}

function Results({ matches, query }: { matches: HelpMatch[]; query: string }) {
  return (
    <div className="gn-help__results">
      <p className="gn-help__results-count">
        {matches.length} {matches.length === 1 ? 'answer' : 'answers'} for “{query}”
      </p>
      <ul className="gn-help__results-list">
        {matches.map((match) => (
          <li key={`${match.document}-${match.entry.id}`} className="gn-help__result">
            <a className="gn-help__result-title" href={`#${match.document}-${match.entry.id}`}>
              {match.entry.title}
            </a>
            <span className="gn-help__result-where">
              {match.documentTitle} · {match.sectionTitle}
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
 * The topic sidebar: the document tabs, a `Topics` label, and the groups.
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
 * eyebrow and the `Next` pager work over a scrolling document unchanged; only
 * the render mode is declined.
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
}: {
  document: HelpDocument;
  documentId: HelpDocument['id'];
  onDocument: (id: HelpDocument['id']) => void;
  activeSection: string | null;
}) {
  const [collapsed, setCollapsed] = useState<Readonly<Record<string, true>>>({});
  const nav = useMemo(() => helpNav(document), [document]);

  return (
    <aside className="gn-help__sidebar">
      {/*
        The document tabs, MOVED here from above the search box — the one
        structural move the newer prototype asks for that costs nothing.

        They keep `aria-pressed` and their shipped labels, which are the
        documents' own titles ("Gisik Nokma — instruction manual"). The
        prototype's are shorter; the copy rule keeps shipped wording where the
        prototype's is merely different, so the LAYOUT adapts to the copy rather
        than the other way round — hence a stacked column of full-width
        segments here instead of the prototype's side-by-side pair, which
        thirty-one characters would not fit inside 274px.
      */}
      <nav className="gn-help__tabs" aria-label="Help documents">
        {HELP_CONTENT.map((doc) => (
          <button
            key={doc.id}
            type="button"
            className="gn-help__tab"
            aria-pressed={doc.id === documentId}
            onClick={() => onDocument(doc.id)}
          >
            {doc.title}
          </button>
        ))}
      </nav>

      {/*
        `aria-labelledby` on the landmark rather than an `aria-label` that
        repeats the word: the visible "Topics" is real text, so pointing at it
        names the navigation region without a second copy of the string that
        could drift from it. A heading would also name it, but it would put a
        third `h2` level into a page whose `h2`s are the document's sections.
      */}
      <nav className="gn-help__nav" aria-labelledby="gn-help-topics">
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

export function HelpBrowser() {
  const [query, setQuery] = useState('');
  const [documentId, setDocumentId] = useState<HelpDocument['id']>('manual');
  const result = useMemo(() => searchHelp(HELP_CONTENT, query), [query]);
  const active = HELP_CONTENT.find((d) => d.id === documentId) ?? HELP_CONTENT[0];
  const fragment = useUrlFragment();
  const activeSection = active === undefined ? null : sectionOfFragment(active, fragment);

  return (
    <div className="gn-help">
      {active === undefined ? null : (
        <TopicSidebar
          document={active}
          documentId={documentId}
          onDocument={setDocumentId}
          activeSection={activeSection}
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
          <label className="gn-help__search" htmlFor="gn-help-search">
            <span className="gn-help__search-label">Search the manual and FAQ</span>
            <input
              id="gn-help-search"
              className="gn-help__search-input"
              type="search"
              value={query}
              placeholder="due date, passkey, offline…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          {/*
            The three states are drawn separately and named, rather than collapsing
            two of them into an empty list. "You have not searched yet" and "nothing
            matched that" are different situations, and this product says which kind
            of nothing it is looking at everywhere else.
          */}
          {result.kind === 'matches' ? <Results matches={result.matches} query={query.trim()} /> : null}
          {result.kind === 'none' && result.reason.kind === 'no-match' ? (
            <p className="gn-help__none" role="status">
              Nothing in the manual or FAQ matches <strong>“{result.reason.query}”</strong>. All{' '}
              {result.reason.searched} entries were searched, so this is a real absence rather than a
              search that did not run — the product may simply not do that thing yet. The list below is
              everything there is.
            </p>
          ) : null}

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
    </div>
  );
}
