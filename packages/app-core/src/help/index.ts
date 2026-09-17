/**
 * The in-app manual and FAQ.
 *
 * Exported from the package root rather than a `./help` subpath: `./online` is a
 * subpath because it is the one module allowed to speak HTTP (coordination
 * amendment 11) and that boundary is enforced by a test. Help content speaks to
 * nothing — it is a frozen object and two pure functions — so a second subpath
 * would be a boundary with nothing to keep out.
 */
export { HELP_CONTENT } from './content.generated.js';
export {
  HELP_DOCUMENT_LABELS,
  HELP_GROUPS,
  helpGroupTitle,
  helpNav,
  helpNextSection,
  type HelpGroup,
  type HelpNavGroup,
} from './groups.js';
export { HelpBrowser } from './help-browser.js';
export {
  blockSpans,
  entryText,
  spansToText,
  type HelpBlock,
  type HelpContent,
  type HelpDocument,
  type HelpEntry,
  type HelpSection,
  type HelpSpan,
} from './types.js';
export {
  findHelpEntry,
  helpTerms,
  searchHelp,
  type HelpMatch,
  type HelpSearchResult,
  type NoHelpMatch,
} from './search.js';
