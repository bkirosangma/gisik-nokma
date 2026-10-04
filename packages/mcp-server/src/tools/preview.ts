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
 * The two-call confirmation: first the admin acts (spec §5.1, M-E4, confirmed by name), and since MCP sweep 2
 * a batch size (`confirm_count`) and a resolved person (`confirm_assignee`), named by `param`. `null` = the
 * exact value was given: go ahead. Otherwise a PREVIEW — a successful answer, not an error, so the assistant
 * can show it to the person before acting. Exact comparison: case, inner spaces and a trailing space all
 * count (Review Focus 5). Distinct from `directory.ts`'s throwing `confirmName`, which the workspace and
 * project tools keep (spec §5.1).
 */
export async function confirmOrPreview(
  expected: string,
  given: string | undefined,
  describe: () => Promise<{ sentence: string; counts?: Record<string, number> }>,
  /** The argument the caller must repeat: `confirm_name` (the default), `confirm_assignee`, `confirm_count`. */
  param = 'confirm_name',
): Promise<Preview | null> {
  if (given === expected) return null;
  const { sentence, counts } = await describe();
  return { preview: true, wouldChange: sentence, counts: counts ?? {}, nothingChanged: true, confirm: `${param} must be "${expected}"` };
}
