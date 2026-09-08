/**
 * ⚠️ BOILERPLATE. NOT REVIEWED BY A LAWYER. NOT LEGAL ADVICE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Same status as `privacy/page.tsx`, and the same three preconditions before
 * this product handles one real user's data:
 *
 *   1. A qualified lawyer in [JURISDICTION] must review and rewrite it.
 *   2. Every [BRACKETED PLACEHOLDER] must be replaced with a real value.
 *   3. The limitation-of-liability and warranty sections are the ones most
 *      likely to be UNENFORCEABLE as drafted — they are an engineer's sketch of
 *      the usual shape, not a considered position, and consumer-protection law
 *      in [JURISDICTION] may void parts of them outright.
 *
 * Deliberately in a code comment and not on the rendered page: a live page
 * announcing its own unreliability is worse than useless to a reader, but
 * shipping it unmarked to the next engineer would be worse still.
 *
 * ONE SECTION IS NOT BOILERPLATE and should survive review largely intact: "What
 * this product does not promise". Those statements are true of the shipped
 * build, they are the same ones the README and manual make, and they are the
 * honest disclosure a user actually needs. Do not let a lawyer's cleanup quietly
 * remove them — they are a feature of this product's posture, not an admission
 * to be minimised.
 */
import Link from 'next/link';
import { BackButton } from '../../src/back-button.js';

export default function Terms() {
  return (
    <main className="gn-shell gn-legal">
      <BackButton />
      <h1 className="gn-legal__title">Terms &amp; Conditions</h1>
      <p className="gn-legal__meta">
        Last updated <strong>[DATE]</strong> · An agreement between you and{' '}
        <strong>[ENTITY NAME]</strong> · Governed by the laws of <strong>[JURISDICTION]</strong>
      </p>

      <section className="gn-legal__section">
        <h2>Agreeing to these terms</h2>
        <p>
          By using Gisik Nokma you agree to these terms. If you are using it on behalf of a
          business, you confirm you may agree on its behalf. If you do not agree, do not use the
          product.
        </p>
      </section>

      <section className="gn-legal__section">
        <h2>Your account</h2>
        <p>
          You are responsible for what happens under your account. The product has no passwords —
          access comes from your email, your Google account or a passkey on your device — so
          keeping those secure is what keeps your account secure. Tell us at{' '}
          <strong>[CONTACT EMAIL]</strong> if you believe someone else has access.
        </p>
        <p>
          You must be at least <strong>[MINIMUM AGE]</strong> to use Gisik Nokma.
        </p>
      </section>

      <section className="gn-legal__section">
        <h2>Your content is yours</h2>
        <p>
          The work you record stays yours. You grant <strong>[ENTITY NAME]</strong> only the
          permission needed to store it, show it to the colleagues you have shared it with, and back
          it up. We claim no ownership and we will not use your content to train anything.
        </p>
      </section>

      <section className="gn-legal__section">
        <h2>What you must not do</h2>
        <ul>
          <li>Break the law with it, or use it to harm or harass anyone.</li>
          <li>Try to reach data belonging to workspaces you have not been invited to.</li>
          <li>
            Interfere with the service — no attempts to overwhelm it, and no automated traffic
            beyond ordinary use of the product and its documented interfaces.
          </li>
          <li>Upload malware, or content you have no right to upload.</li>
        </ul>
      </section>

      <section className="gn-legal__section">
        <h2>What this product does not promise</h2>
        <p>
          These are true of the current build, and they are stated here rather than left for you to
          discover:
        </p>
        <ul>
          <li>
            <strong>It does not notify you outside the app.</strong> No email, no text message, no
            push. Notifications appear in the Inbox and nowhere else. Do not rely on it to chase
            anybody.
          </li>
          <li>
            <strong>It does not know whether a linked Google Drive file still exists.</strong> A
            Drive link is always described as unknown, because the product genuinely does not check.
          </li>
          <li>
            <strong>Its day is India&rsquo;s day, for everyone.</strong> Every date and every
            &ldquo;today&rdquo; means the day in India, wherever you are.
          </li>
          <li>
            <strong>Parts of it are not built yet.</strong> The product is honest about this in its
            own documentation rather than in the small print. Read the gaps before you depend on
            anything.
          </li>
        </ul>
      </section>

      <section className="gn-legal__section">
        <h2>Availability</h2>
        <p>
          We aim to keep Gisik Nokma running but do not guarantee it will be uninterrupted or
          error-free, and we may change or withdraw features. Where a change removes something you
          rely on, we will give notice in the product where we reasonably can.
        </p>
      </section>

      <section className="gn-legal__section">
        <h2>Liability</h2>
        <p>
          To the extent the law allows, <strong>[ENTITY NAME]</strong> is not liable for indirect or
          consequential loss, or for lost profits or lost data, arising from your use of Gisik
          Nokma. Nothing here limits liability that cannot lawfully be limited — including for death
          or personal injury caused by negligence, or for fraud.{' '}
          <strong>[LIABILITY CAP]</strong>
        </p>
      </section>

      <section className="gn-legal__section">
        <h2>Ending it</h2>
        <p>
          You may stop using Gisik Nokma at any time. We may suspend or end access if these terms
          are broken, and we will tell you why unless the law prevents us. What happens to your
          recorded work afterwards is described in the{' '}
          <Link href="/privacy">Privacy Policy</Link>, including the honest complication about an
          append-only history.
        </p>
      </section>

      <section className="gn-legal__section">
        <h2>Disputes</h2>
        <p>
          These terms are governed by the laws of <strong>[JURISDICTION]</strong>, and disputes go
          to the courts of <strong>[COURTS/VENUE]</strong>.
        </p>
      </section>

      <p className="gn-legal__footer">
        See also the <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
