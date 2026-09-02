/** Longest filename we keep. Display data, so the cap is generosity, not policy. */
const MAX_FILENAME_LENGTH = 160;

/**
 * Everything that could break out of a quoted header value or a rendered name.
 * CR/LF are the header-injection pair; `"` and `\` are the quoted-string
 * delimiters of `Content-Disposition`; `/` is path-shaped; the last two ranges
 * are the C0 controls and DEL.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARS = /[\r\n"\\/\u0000-\u001f\u007f]/g;

/**
 * A stored filename is DISPLAY DATA and nothing else.
 *
 * It never becomes a path: the object key is minted from ULIDs
 * (`w/<workspaceId>/a/<attachmentId>`) and re-validated by
 * `assertValidObjectKey` inside every store, so no filename reaches a
 * filesystem or an S3 key no matter what it says. What it DOES reach is a
 * `Content-Disposition` header (Task 10) and a browser DOM, and that is what
 * the strip list above is sized for.
 *
 * `..` deliberately SURVIVES: with `/` and `\` gone it is an ordinary pair of
 * dots in a display string and can traverse nothing. Stripping it would mangle
 * `report..final.pdf` for no gain, and a sanitizer that mangles honest input is
 * how people learn to distrust the field.
 *
 * The fallback is `'file'` rather than a throw. A name is not a claim the
 * upload rests on — refusing bytes because their label was empty would refuse
 * a real file for a cosmetic reason.
 */
export function sanitizeFilename(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .replace(UNSAFE_FILENAME_CHARS, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  return cleaned === '' ? 'file' : cleaned;
}
