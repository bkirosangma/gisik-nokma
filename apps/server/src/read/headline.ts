/**
 * The `ts_headline` window, and it is ONE string in one place.
 *
 * It lived in `routes/search.ts` until the notes search plan needed it: the
 * ticket search's route and `read/note-search.ts` both cut a snippet, and the
 * plan's instruction was "import it, do not retype it". Importing it from
 * `routes/` into `read/` would have been a layering inversion — the read layer
 * does not depend on the route layer — so the constant MOVED here and the route
 * now imports it. That keeps the single definition, which is the whole point;
 * a second copy would drift and the two surfaces would highlight to different
 * widths with nothing to notice.
 *
 * `MaxWords=18, MinWords=6` is the window 18.147 pins: a snippet longer than
 * that is a paragraph, and one shorter is not enough context to know why the
 * note matched.
 */
export const HEADLINE_OPTIONS = 'StartSel=**, StopSel=**, MaxWords=18, MinWords=6';
