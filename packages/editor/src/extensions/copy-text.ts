/**
 * Put `text` on the clipboard and call `done` when it has been written.
 *
 * `navigator.clipboard` is unavailable outside a secure context (the mobile
 * WebView bundle is one) and its write can be REJECTED (a denied permission, a
 * sandboxed frame); `document.execCommand('copy')` through a throw-away
 * textarea is deprecated and still the answer to both. The branch is chosen at
 * CALL time, not at module load, because the same bundle runs in both places.
 * Shared by the code block's Copy button and the heading copy-link so the two
 * cannot disagree about what "the clipboard works" means.
 */
export function copyText(text: string, done: () => void): void {
  const fallback = (): void => {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
    } finally {
      area.remove();
    }
    done();
  };
  if (navigator.clipboard?.writeText !== undefined) {
    navigator.clipboard.writeText(text).then(done, fallback);
    return;
  }
  fallback();
}
