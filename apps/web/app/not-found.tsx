import Link from 'next/link';
import { DocumentTitle } from '../src/document-title.js';

/**
 * The 404, written the way the rest of this product writes an absence.
 *
 * ## Why this is not "Page not found. Go home."
 *
 * A generic 404 asserts one cause — *this does not exist* — for a situation with
 * several, and asserting the tidy one is exactly the move this product refuses
 * everywhere else. The calendar does not say "no events"; it says **which kind**
 * of empty it is, and it names the narrowing that emptied it, because "nothing
 * here" is useless when there is more than one reason for it. A rollup does not
 * round 8 down to 6; it says *"5 of 8 done · 2 restricted"*. This page owes the
 * reader the same.
 *
 * ⚠ The sentence above used to name a COUNT — "in four different sentences …
 * four reasons" — and the count was already wrong when it was written (there
 * were three sentences and four doors; case 11.50). It is dropped rather than
 * corrected because a count here was never load-bearing to the argument, and
 * 2026-09-20's ruling took the calendar to **two** sentences, which would have
 * made it wrong a second time in a different way. The argument needs "more than
 * one", and that is what it now says.
 *
 * ## And one of the causes is a SECURITY PROPERTY, not an oversight
 *
 * The API answers **the same 404 for a thing that does not exist and a thing
 * that is not yours** — `routes/notifications.ts` states it plainly (*"a caller
 * who supplies someone else's id learns nothing about whether that id exists"*),
 * and Plan 4's ticket reads chose the same shape. That indistinguishability is
 * deliberate: telling the two apart is precisely what would let somebody probe
 * for which records exist.
 *
 * So this page must NOT guess which one happened, and must not apologise for
 * not guessing. It says the honest thing: here are the causes, one of them is
 * unknowable to you *by design*, and here is the reasoning. A reader who
 * followed a colleague's link to a job they cannot see is better served by "it
 * may exist and not be yours" than by "page not found", which is false in that
 * case and quietly so.
 *
 * ## Voice
 *
 * No apology, no exclamation mark, no cartoon. The product's register is a
 * careful colleague telling you what it knows and what it does not.
 *
 * ## What the refreshed export changed here, and what it did NOT (2026-09-18)
 *
 * `design-system/interactive/desktop.dc.html@6d7b67c0a52c:1844-1862` is the
 * `isNotFound` block. The audit that measured it
 * (`docs/design/prototype-delta-2026-09-18.md`) reached a verdict worth keeping
 * beside the code: **the export is THINNER than this page, not ahead of it.**
 * It draws an icon tile, an h1, one lead, three action rows and one aside; this
 * page carries the three causes and the "why it will not say" panel, neither of
 * which the export has any counterpart for. **The export DOES draw an aside**
 * (`:1859`, "ask them to re-share it from the ticket") — a different sentence
 * in the same structural slot, and an earlier revision of this comment claimed
 * the export had none, which would have handed a reader re-litigating the port
 * a false premise about what was on the other side of it. So exactly three
 * things are ported — the 72px icon tile, a third action link, and the
 * heading's scale/measure — and nothing is removed to make the two look alike.
 *
 * **The copy is deliberately NOT ported.** The export says "This page isn't
 * here" / "Nothing was deleted."; both strings have zero product hits, and the
 * docblock above is the reason: the API answers the same 404 for absent and
 * not-yours by design, so a lead that asserts "nothing was deleted" would
 * answer a question this page exists to refuse. The export's thinner copy is
 * only tenable because its own version omits the third cause.
 *
 * The third link is the manual. The export's own label is "Search the manual"
 * and that is what is used, matching the two links either side of it, which
 * were already transcribed from this block's own wording ("Go to your
 * workspaces" / "Open your inbox"). `/help` is a real route reachable with no
 * session, so this is a bounded addition rather than the wire gap the audit
 * checked it against.
 */
export default function NotFound() {
  return (
    <main className="gn-shell gn-notfound">
      {/* exec1 P12 names the 404 among the routes that all read "Gisik Nokma",
          and it is the one route a reader reaches with no context at all — the
          title is the only thing that says the page was not found before the
          heading is read. `not-found.tsx` may not export Next's `metadata`, so
          this route uses the component even though it is a server component. */}
      <DocumentTitle title="Page not found" />
      {/* The export's 72px rounded tile (`:1847`), glyph paths verbatim. The
          whole tile is `aria-hidden`: it repeats what the h1 says, so a screen
          reader announcing it would be reading the heading twice. That is also
          why it adds nothing to the accessible-names sweep's counts. */}
      <div className="gn-notfound__tile" aria-hidden="true">
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
          <path d="m9.5 11.5 5 5" />
          <path d="m14.5 11.5-5 5" />
        </svg>
      </div>
      <h1 className="gn-notfound__title">This address does not match a page.</h1>

      <p className="gn-notfound__lead">
        That is all this page can tell you for certain. There are three reasons you might be
        here, and Gisik Nokma can rule out only the first two.
      </p>

      <ul className="gn-notfound__causes">
        <li>
          <span className="gn-notfound__cause">The address is mistyped, or the link was
          broken.</span>{' '}
          The commonest case, and the easiest to check — compare it against a link you know works.
        </li>
        <li>
          <span className="gn-notfound__cause">The page moved.</span>{' '}
          Some screens are reached only by their address today. If you had one bookmarked, it may
          have changed.
        </li>
        <li>
          <span className="gn-notfound__cause">The thing exists and is not yours to see.</span>{' '}
          If you followed a link to a specific job, this is a real possibility — and{' '}
          <strong>Gisik Nokma will not tell you which of the three it was.</strong>
        </li>
      </ul>

      <p className="gn-notfound__why">
        <span className="gn-notfound__why-label">Why it will not say.</span> A product that
        answered <em>&ldquo;that exists, but not for you&rdquo;</em> would let anyone discover which
        records exist by trying addresses until the wording changed. So a job you may not see and a
        job that was never created are answered identically, on purpose. It is the same reason a
        sub-job count reads <em>&ldquo;5 of 8 done · 2 restricted&rdquo;</em> rather than
        &ldquo;5 of 6&rdquo;: the shape of what is hidden is itself information.
      </p>

      {/* Three links, in the export's own order (`:1855-1857`). This page had
          two; the manual is the one it omitted, and it is the only one of the
          three that answers "I do not know how this works", which is a real
          cause of landing here that the three-cause list above does not name. */}
      <p className="gn-notfound__actions">
        <Link className="gn-notfound__link" href="/workspaces">
          Go to your workspaces
        </Link>
        <Link className="gn-notfound__link" href="/help">
          Search the manual
        </Link>
        <Link className="gn-notfound__link" href="/inbox">
          Open your inbox
        </Link>
      </p>

      <p className="gn-notfound__aside">
        If you believe you should be able to see this and cannot, the person who administers your
        workspace can check — visibility is set per job, and they can see who a job is shared with.
      </p>
    </main>
  );
}
