import { useMemo, useState } from 'react';
import { HELP_CONTENT } from './content.generated.js';
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
  return (
    <article className="gn-help__doc">
      <Blocks blocks={document.intro} />
      {document.sections.map((section) => (
        <section key={section.id} className="gn-help__section" id={`${document.id}-${section.id}`}>
          <h2 className="gn-help__h2">{section.title}</h2>
          <Blocks blocks={section.intro} />
          {section.entries.map((entry) => (
            <div key={entry.id} className="gn-help__entry" id={`${document.id}-${entry.id}`}>
              <h3 className="gn-help__h3">{entry.title}</h3>
              <Blocks blocks={entry.blocks} />
            </div>
          ))}
        </section>
      ))}
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

export function HelpBrowser() {
  const [query, setQuery] = useState('');
  const [documentId, setDocumentId] = useState<HelpDocument['id']>('manual');
  const result = useMemo(() => searchHelp(HELP_CONTENT, query), [query]);
  const active = HELP_CONTENT.find((d) => d.id === documentId) ?? HELP_CONTENT[0];

  return (
    <div className="gn-help">
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

      <nav className="gn-help__tabs" aria-label="Help documents">
        {HELP_CONTENT.map((doc) => (
          <button
            key={doc.id}
            type="button"
            className="gn-help__tab"
            aria-pressed={doc.id === documentId}
            onClick={() => setDocumentId(doc.id)}
          >
            {doc.title}
          </button>
        ))}
      </nav>

      {active === undefined ? null : (
        <>
          <nav className="gn-help__toc" aria-label={`${active.title} contents`}>
            {active.sections.map((section) => (
              <a key={section.id} className="gn-help__toc-link" href={`#${active.id}-${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
          <DocumentView document={active} />
        </>
      )}
    </div>
  );
}
