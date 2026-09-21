/**
 * ⚠️ BOILERPLATE. NOT REVIEWED BY A LAWYER. NOT LEGAL ADVICE.
 * ─────────────────────────────────────────────────────────────────────────────
 * This page is a TEMPLATE written by an engineer from what the product
 * technically does. It has had no legal review of any kind. Before Gisik Nokma
 * handles one real user's data:
 *
 *   1. A qualified lawyer in [JURISDICTION] must review and rewrite it.
 *   2. Every [BRACKETED PLACEHOLDER] must be replaced with a real value.
 *   3. The retention, deletion and lawful-basis sections in particular are
 *      ENGINEERING DESCRIPTIONS of current behaviour, not legal commitments,
 *      and some of what they describe may not be lawful in [JURISDICTION]
 *      without changes to the product itself. The append-only ledger is the
 *      one to look at first: see the note in that section.
 *
 * This warning is deliberately in a code comment and NOT on the rendered page.
 * A live page that announced its own unreliability would be worse than useless
 * to a reader — but shipping it without this marker, to whoever next opens this
 * file, would be worse still.
 *
 * The factual claims about product behaviour below were taken from the shipped
 * configuration (`deploy/do/app.yaml`), not invented: region `blr`, object
 * storage `blr1`, and the app's Asia/Kolkata clock are all set there.
 */
import Link from 'next/link';
import { LegalTabs, LegalToc, sectionId, type LegalSection } from '../../src/legal-chrome.js';
import { LegalNav } from '../../src/legal-nav.js';
import { documentTitleFor } from '../../src/page-title.js';

/**
 * exec1 P12 — the route's title, and this page can use Next's own `metadata`
 * because it is a SERVER component. A `'use client'` route cannot: an exported
 * `metadata` there is ignored without a word, which is why the rest of the app
 * uses `<DocumentTitle>`. Both read the format from `documentTitleFor`, so the
 * two mechanisms cannot disagree about what a title looks like.
 */
export const metadata = { title: documentTitleFor('Privacy') };

/**
 * The page's sections, declared ONCE.
 *
 * Both the `<h2>`s and the anchor row are rendered from this array, so the
 * navigation cannot describe a page other than the one below it. `sectionId`
 * derives the anchor from the heading, so a renamed heading moves its own
 * anchor with it. See `legal-chrome.tsx` for why that is a property rather than
 * a style choice.
 *
 * **The prose in `body` is unchanged from the pre-port file, text for text.**
 * It is re-indented by this refactor and nothing else; the placeholders, the
 * entity references and the deliberate line breaks are all as they were, and
 * case 13.251's placeholder counts are the machine-checked half of that claim.
 */
const SECTIONS: readonly LegalSection[] = [
  {
    title: 'Who we are',
    body: (
      <>
        <p>
          Gisik Nokma is a work tracker operated by <strong>[ENTITY NAME]</strong>,
          <strong> [REGISTERED ADDRESS]</strong>. For anything in this policy, write to{' '}
          <strong>[CONTACT EMAIL]</strong>.
        </p>
      </>
    ),
  },
  {
    title: 'What we collect',
    body: (
      <>
        <p>Only what running the product requires.</p>
        <ul>
          <li>
            <strong>Your identity.</strong> An email address, or a Google account, or a passkey
            registered from your device. <strong>We never store a password</strong> — the product
            does not have passwords.
          </li>
          <li>
            <strong>The work you record.</strong> Jobs, stages, comments, dates, and who was
            assigned what. This is the content you and your colleagues put in deliberately.
          </li>
          <li>
            <strong>A record of every change, with two clocks.</strong> Each change stores what
            your device believed the time was <em>and</em> what our server recorded. Both are kept,
            because a disagreement between them is sometimes the useful fact.
          </li>
          <li>
            <strong>Files you attach</strong>, and links to files in Google Drive. For a Drive
            link we store the link, never a copy of the file, and we do not read the file.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Where it is stored',
    body: (
      <>
        <p>
          On servers in <strong>India</strong>, with attachments in object storage in the same
          region. The product&rsquo;s clock is India Standard Time for every user in every country
          — a day boundary means India&rsquo;s day. That is a product decision with a privacy
          consequence worth stating: timestamps we show you are in IST, not your local time.
        </p>
      </>
    ),
  },
  {
    title: 'How long we keep it, and the honest complication',
    body: (
      <>
        <p>
          Gisik Nokma records work as an <strong>append-only history</strong>. Changes are added;
          they are not overwritten. That is the whole point of the product — it is what lets it
          answer &ldquo;who said this, and when&rdquo; a year later.
        </p>
        <p className="gn-legal__flag">
          <span className="gn-legal__flag-label">The complication, stated rather than buried.</span>{' '}
          A history that is never overwritten sits awkwardly with a right to erasure. Deleting your
          account removes your ability to sign in and your personal details; what it does{' '}
          <em>not</em> currently do is remove your name from changes you made to work that your
          colleagues still rely on. <strong>[ENTITY NAME] must decide, with legal advice, how to
          reconcile this before handling real user data</strong> — for example by replacing an
          identity with an anonymous marker while keeping the sequence of events intact.
        </p>
      </>
    ),
  },
  {
    title: 'Who we share it with',
    body: (
      <>
        <p>
          We do not sell your data and we do not use it for advertising. It reaches only the
          providers required to run the service: our hosting and database provider, our object
          storage provider, and the mail provider that sends your sign-in link. If you sign in with
          Google, Google knows you did.
        </p>
        <p>
          <strong>Within your workspace, visibility is set per job</strong>, and colleagues see what
          those settings allow. The product will tell somebody that a job is restricted; it will not
          tell them what is in it.
        </p>
      </>
    ),
  },
  {
    title: 'What we send you',
    body: (
      <>
        <p>
          One thing: your sign-in link. Gisik Nokma sends no notification emails, no text messages
          and no push notifications — notifications appear only inside the product. We do not send
          marketing.
        </p>
      </>
    ),
  },
  {
    title: 'Your rights',
    body: (
      <>
        <p>
          Depending on where you live you may have rights to access, correct, export or erase your
          personal data, and to object to processing. Write to <strong>[CONTACT EMAIL]</strong> and
          we will respond within <strong>[RESPONSE PERIOD]</strong>. If you are not satisfied you
          may complain to <strong>[SUPERVISORY AUTHORITY]</strong>.
        </p>
      </>
    ),
  },
  {
    title: 'Changes to this policy',
    body: (
      <>
        <p>
          If we change it materially we will say so in the product before the change takes effect.
          The date at the top is when this version was published.
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="gn-shell gn-legal">
      <LegalNav />
      <div className="gn-legal__column">
        <div className="gn-legal__head">
          <h1 className="gn-legal__title">Privacy Policy</h1>
          <LegalTabs active="privacy" />
        </div>
        <p className="gn-legal__meta">
          Last updated <strong>[DATE]</strong> · Operated by <strong>[ENTITY NAME]</strong> ·
          Governed by the laws of <strong>[JURISDICTION]</strong>
        </p>
        <LegalToc sections={SECTIONS} />

        {SECTIONS.map((section) => (
          <section key={section.title} className="gn-legal__section">
            <h2 id={sectionId(section.title)}>{section.title}</h2>
            {section.body}
          </section>
        ))}

        <p className="gn-legal__footer">
          See also the <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      </div>
    </main>
  );
}
