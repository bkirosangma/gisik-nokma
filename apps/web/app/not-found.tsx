import Link from 'next/link';

/**
 * The 404, written the way the rest of this product writes an absence.
 *
 * ## Why this is not "Page not found. Go home."
 *
 * A generic 404 asserts one cause — *this does not exist* — for a situation with
 * several, and asserting the tidy one is exactly the move this product refuses
 * everywhere else. The calendar does not say "no events"; it says **which kind**
 * of empty it is, in four different sentences, because "nothing here" is useless
 * when there are four reasons for it. A rollup does not round 8 down to 6; it
 * says *"5 of 8 done · 2 restricted"*. This page owes the reader the same.
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
 */
export default function NotFound() {
  return (
    <main className="gn-shell gn-notfound">
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

      <p className="gn-notfound__actions">
        <Link className="gn-notfound__link" href="/workspaces">
          Go to your workspaces
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
