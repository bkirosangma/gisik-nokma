/**
 * The word `TicketList`'s summary row renders as "narrowed to {word} — not
 * the whole project" (`ticket-list.tsx`). Two narrowings can be in force at
 * once since the page filter reached the list (exclude-mode spec §3): the
 * server-side "active only" toggle and the client-side filter. Both are
 * named, joined, or neither — `undefined` keeps the unnarrowed count reading
 * as the project's own.
 */
export function listNarrowingWord(activeOnly: boolean, filterNarrows: boolean): string | undefined {
  const words: string[] = [];
  if (activeOnly) words.push('tickets in progress');
  if (filterNarrows) words.push('your filters');
  return words.length === 0 ? undefined : words.join(' and ');
}
