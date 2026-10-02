export type Preview = {
  preview: true;
  /** One plain sentence of what WOULD change. */
  wouldChange: string;
  /** The counts it affects (ticket keys renamed, tickets migrated, people removed from projects). */
  counts: Record<string, number>;
  nothingChanged: true;
  confirm: string;
};

/**
 * The admin confirmation (spec §5.1, M-E4). `null` = the exact name was given: go ahead. Otherwise a
 * PREVIEW — a successful answer, not an error, so the assistant can show it to the person before acting.
 * Exact comparison: case, inner spaces and a trailing space all count (Review Focus 5). Distinct from
 * `directory.ts`'s throwing `confirmName`, which the workspace and project tools keep (spec §5.1).
 */
export async function confirmOrPreview(
  expected: string,
  given: string | undefined,
  describe: () => Promise<{ sentence: string; counts?: Record<string, number> }>,
): Promise<Preview | null> {
  if (given === expected) return null;
  const { sentence, counts } = await describe();
  return { preview: true, wouldChange: sentence, counts: counts ?? {}, nothingChanged: true, confirm: `confirm_name must be "${expected}"` };
}
