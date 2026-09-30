import { formatDate } from '../provenance.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/**
 * The "last active" wording of the devices list (devices plan Task 6, case 6.330): "Active now" under five
 * minutes (the server stamps `lastSeenAt` at most every five, so anything finer would be a lie), then
 * minutes, hours and days, and from seven days the date itself through `formatDate` (the product's one IST
 * clock). A timestamp in the future - clock skew between the browser and the server - reads "Active now",
 * and an unparseable one is returned as given rather than invented.
 */
export function relativeTime(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const age = now.getTime() - at;
  if (age < 5 * MINUTE) return 'Active now';
  if (age < HOUR) return plural(Math.floor(age / MINUTE), 'minute');
  if (age < DAY) return plural(Math.floor(age / HOUR), 'hour');
  if (age < 7 * DAY) return plural(Math.floor(age / DAY), 'day');
  return formatDate(iso);
}
