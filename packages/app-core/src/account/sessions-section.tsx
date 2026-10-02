import { useState } from 'react';
import { Button } from '@gisik-nokma/ui';
import { formatDate } from '../provenance.js';
import { relativeTime } from './relative-time.js';
import type { DeviceSummary } from './sessions-client.js';

export type SessionsSectionProps = {
  devices: DeviceSummary[];
  /** Sign ONE other device out, by its one-way key. Never offered for the current device. */
  onSignOutDevice: (key: string) => void;
  /** Sign every device but this one out. Offered once, and only when there is another device. */
  onSignOutOthers: () => void;
  /**
   * Set when the caller's own sign-out refuses. Ruling E2-24(b): a refusal used to be read and discarded
   * entirely - the list simply failed to shrink, with nothing on screen to say why. Same one-prop shape
   * `PasskeysSection`'s add/remove `error` carries.
   */
  error?: string | null;
  /** The clock the 24-hour split and the relative times read. Injected so a test can pin it. */
  now?: Date;
};

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

const titleOf = (d: DeviceSummary): string =>
  d.legacy ? `Older sign-in (${d.label})` : d.tag === null ? d.label : `${d.label} (${d.tag})`;

/**
 * The `/account` "Sign-in and devices" section, Sessions half - framework-free beyond React itself.
 *
 * **Amended 2026-09-30 by the devices plan (Task 6; owner ruling FD3 = A).** One row per DEVICE, not per
 * session. The list splits in two: "Active in the last 24 hours" (the current device is ALWAYS there, however
 * old its stamp), and a collapsed "Signed in, idle (N)" group for the rest, rendered only when opened. The
 * heading carries the counts - "Sign-in and devices · N signed in · M active" - where N counts devices (not
 * sessions) and M is the size of the active group, so the heading and the list never disagree.
 *
 * A row reads "<browser> on <os> · TAG" (the tag tells two identical browsers apart; a pre-cookie "legacy"
 * group has none and reads "Older sign-in · <label>"), "This device" on the current one, the relative last
 * activity, "First signed in <date>", and "N sign-ins" when more than one session shares the device. Dates go
 * through the domain's one IST clock (`formatDate`), never an ISO slice.
 *
 * The current device renders no sign-out control at all - not a disabled one - and the server refuses its key
 * with 409 besides, so a stale page cannot sign the person out. The per-row action is the quiet ghost button;
 * the prototype's tinted-danger button cannot be built at accessible contrast from this palette (see the
 * `/account` block in `globals.css`), and a column of solid red buttons would break the one-loud-element rule.
 * The accessible name carries the row ("Sign out this device: Chrome on Mac (Q2ZA)") so repeated buttons stay
 * addressable, and two rows with the SAME title are told apart by their last activity and first sign-in (`signOutLabels`).
 *
 * The hedged empty state is on purpose: `/account`'s own effect collapses a FAILED read to `[]`, so an empty
 * list is either "no devices" or "the read did not answer" and this component cannot tell which.
 */
/**
 * The accessible name of each row's sign-out button, unique per row (case 6.348). The base is "Sign out this device: <title>";
 * two rows can share a title (two legacy "Older sign-in · Chrome on Mac" groups carry no tag), and identical names would leave a
 * screen-reader user unable to say which one they mean. Only a row whose base collides gains what differs, widest-first: its
 * last activity ("last active 3 hours ago" / "never active"), then "first signed in <date>"; rows that are STILL
 * indistinguishable get an ordinal ("2 of 2"). A row that is already unique keeps the plain name.
 */
function signOutLabels(devices: DeviceSummary[], clock: Date): Map<string, string> {
  const base = (d: DeviceSummary) => `Sign out this device: ${titleOf(d)}`;
  const activity = (d: DeviceSummary) => (d.lastSeenAt === null ? 'never active' : `last active ${relativeTime(d.lastSeenAt, clock)}`);
  const first = (d: DeviceSummary) => `first signed in ${formatDate(d.firstSignedInAt)}`;
  const tally = (names: string[]) => names.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map<string, number>());
  let names = devices.map(base);
  let counts = tally(names);
  names = devices.map((d, i) => (counts.get(names[i]!)! > 1 ? `${names[i]}, ${activity(d)}` : names[i]!));
  counts = tally(names);
  names = devices.map((d, i) => (counts.get(names[i]!)! > 1 ? `${names[i]}, ${first(d)}` : names[i]!));
  counts = tally(names);
  const seen = new Map<string, number>();
  names = names.map((n) => {
    const total = counts.get(n)!;
    if (total === 1) return n;
    const ordinal = (seen.get(n) ?? 0) + 1;
    seen.set(n, ordinal);
    return `${n}, ${ordinal} of ${total}`;
  });
  return new Map(devices.map((d, i) => [d.key, names[i]!]));
}

export function SessionsSection({ devices, onSignOutDevice, onSignOutOthers, error = null, now }: SessionsSectionProps) {
  const [idleOpen, setIdleOpen] = useState(false);
  const clock = now ?? new Date();
  const isActive = (d: DeviceSummary): boolean =>
    d.isCurrent || (d.lastSeenAt !== null && clock.getTime() - Date.parse(d.lastSeenAt) < ACTIVE_WINDOW_MS);
  const active = devices.filter(isActive);
  const idle = devices.filter((d) => !isActive(d));
  const signOutName = signOutLabels(devices, clock);

  const row = (d: DeviceSummary) => {
    const title = titleOf(d);
    return (
      <li key={d.key} className="gn-account__session-row">
        <span className="gn-account__row-text">
          <span className="gn-account__device-title">{title}</span>
          <span className="gn-account__row-meta gn-account__device-meta">
            {d.isCurrent ? <span className="gn-account__device-current">This device</span> : null}
            {d.lastSeenAt !== null ? <span>{relativeTime(d.lastSeenAt, clock)}</span> : null}
            <span>{`First signed in ${formatDate(d.firstSignedInAt)}`}</span>
            {d.sessionCount > 1 ? <span>{`${d.sessionCount} sign-ins`}</span> : null}
          </span>
        </span>
        {!d.isCurrent ? (
          <Button
            variant="ghost"
            aria-label={signOutName.get(d.key)}
            onClick={() => onSignOutDevice(d.key)}
          >
            Sign out this device
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <section className="gn-account__section gn-account__sessions">
      <h2 className="gn-account__section-title">
        {devices.length === 0
          ? 'Sign-in and devices'
          : `Sign-in and devices (${devices.length} signed in, ${active.length} active)`}
      </h2>
      {error !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {error}
        </p>
      ) : null}
      {devices.length === 0 ? (
        <p className="gn-account__note">No signed-in devices to show.</p>
      ) : (
        <>
          {active.length > 0 ? (
            <div className="gn-account__device-group">
              <h3 className="gn-account__group-title">Active in the last 24 hours</h3>
              <ul className="gn-account__session-list">{active.map(row)}</ul>
            </div>
          ) : null}
          {idle.length > 0 ? (
            <div className="gn-account__device-group">
              <Button
                variant="ghost"
                className="gn-account__idle-toggle"
                aria-expanded={idleOpen}
                onClick={() => setIdleOpen((open) => !open)}
              >
                <span aria-hidden="true" className="gn-account__chevron" data-open={idleOpen} />
                {`Signed in, idle (${idle.length})`}
              </Button>
              {idleOpen ? <ul className="gn-account__session-list">{idle.map(row)}</ul> : null}
            </div>
          ) : null}
          {devices.length > 1 ? (
            <Button variant="ghost" onClick={onSignOutOthers}>
              Sign out all other devices
            </Button>
          ) : null}
        </>
      )}
      {/* Prototype copy, kept because it is TRUE of this product: history is append-only, so signing a device
          out does not retract what it recorded. */}
      <p className="gn-account__note">
        Signing a device out does not remove what it recorded. Those claims stay, attributed to it.
      </p>
    </section>
  );
}
