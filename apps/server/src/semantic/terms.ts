/** Words with no topic in them. Short on purpose: class-based IDF already sinks words every class uses. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have', 'not', 'but', 'its', 'into',
  'one', 'all', 'any', 'can', 'when', 'then', 'than', 'them', 'they', 'their', 'there', 'what', 'which', 'who', 'will',
  'would', 'should', 'could', 'after', 'before', 'only', 'also', 'does', 'did', 'our', 'out', 'off', 'per', 'via', 'too',
  'very', 'just', 'each', 'every', 'new', 'now', 'how', 'why', 'comment',
]);

export function termsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []).filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/**
 * Class-based TF-IDF (spec D §4.1 step 5): a class is one community's texts. score(t, c) = tf(t, c) ·
 * log(1 + A / f(t)), with tf the term's share of the class's words, A the mean words per class and f(t)
 * the term's count across every class. Ties break alphabetically so the label is deterministic.
 */
export function topTerms(classTexts: readonly (readonly string[])[], n: number): string[][] {
  const classes = classTexts.map((texts) => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const text of texts) {
      for (const word of termsOf(text)) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
        total += 1;
      }
    }
    return { counts, total };
  });
  const corpus = new Map<string, number>();
  let words = 0;
  for (const { counts, total } of classes) {
    words += total;
    for (const [word, count] of counts) corpus.set(word, (corpus.get(word) ?? 0) + count);
  }
  const meanWords = classes.length === 0 ? 0 : words / classes.length;
  return classes.map(({ counts, total }) =>
    [...counts]
      .map(([word, count]) => ({ word, score: (count / Math.max(total, 1)) * Math.log(1 + meanWords / (corpus.get(word) ?? 1)) }))
      .sort((x, y) => y.score - x.score || (x.word < y.word ? -1 : x.word > y.word ? 1 : 0))
      .slice(0, n)
      .map((entry) => entry.word),
  );
}
