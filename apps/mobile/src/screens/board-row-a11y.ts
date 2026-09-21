/**
 * E4-22 / P28: the board's row (`TouchableOpacity`) carried no
 * `accessibilityRole` or `accessibilityLabel`, so VoiceOver/TalkBack read
 * each row as plain text rather than as a button naming the ticket. Pulled
 * out as a pure function so the label text is testable without rendering
 * (this app's `.tsx` files stay thin and untested at this layer — see
 * `vitest.config.ts`).
 */
export function boardRowAccessibilityLabel(item: { title: string; stateId: string }): string {
  return `${item.title}, ${item.stateId}`;
}
