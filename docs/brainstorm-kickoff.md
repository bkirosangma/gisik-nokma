# Brainstorm kickoff — Gisik Nokma

*This is the founding prompt for the product design session. Paste it (or point a fresh session at this file) from `/Users/kiro/my_projects/gisik-nokma`.*

---

Start the product brainstorm for **Gisik Nokma** (Garo: *gisik* mind/memory + *nokma* the village custodian — "the keeper of memory"), a project management software whose founding idea is **a board that structurally cannot lie about the work**. Repo: `github.com/bkirosangma/gisik-nokma`, local at `/Users/kiro/my_projects/gisik-nokma`, currently a pre-brainstorm scaffold.

**First action: invoke `superpowers:brainstorming` and follow it fully** — questions one at a time, approaches with trade-offs, design presented in sections, spec written to `docs/superpowers/specs/` and reviewed before any plan or code. Do not scaffold apps or pick a stack before the spec is approved.

**Read first, in this order:** `README.md` · `reference/design-docs/2026-08-18-project-tracker-design.md` · `reference/convenience-corner-tracker/README.md` · then open `reference/convenience-corner-tracker/tracker.html` in a browser and click through all four views (it runs standalone from a `file:` URL). The calendar design doc and its plan are beside the tracker design doc for depth.

**The base and what it proved.** The reference tracker was built for one repository (convenience-corner, a quick-commerce project) and one user, and its worth is a handful of structural ideas: origins own facts and the board owns only attention (`done` is not a legal board value — completion is recorded where the work lives, so the board cannot claim finished work that isn't); the view is generated and the attention file is authored, with a freshness gate refusing a stale view; honesty is enforced by refusals rather than intentions (unknown ids, flags on done work, a due date past the record's own needed-by claim — all rejected by the generator, all proven against planted defects); and nothing is ever invented — the calendar renders only real dates, an undated item is absent rather than estimated, and deadline markers are labelled as the record's claim, never as "due". Treat these as informed starting points to interrogate, not decisions already made.

**What is genuinely open — the brainstorm's actual work:**

1. **Who is this for?** The base served one technical user who edits JSON. Solo developers? Small teams? The Tura shop-owner class of user who will never open a text editor? The answer drives everything below.
2. **How do "origins" generalise beyond a monorepo?** The base's deepest idea is that task state is *derived from the artifacts that own the work* (checkboxes, records, test catalogues). What is an origin when the work isn't in one git repository — repos, issue trackers, documents, humans asserting things? Is the origins-own-facts guarantee even preservable in a general product, and what honest degradation exists where it isn't?
3. **Storage and hosting** — local files, local app, hosted service, or hybrid; single-player first or collaborative; what the convenience-corner constraint (static page, no server, `file:` URL) was buying and whether the product still wants it.
4. **Editing UX** — the base authors attention by editing JSON with a gate. A product needs editing that ordinary users can do, *without* losing the refusals; what does a "gate" become when there's a UI instead of a generator run?
5. **Scope of v1** — and what the convenience-corner repo itself would need to become the product's first real user (dogfooding target), which is the likeliest proof of generality.
6. **Identity** — the name is decided (Gisik Nokma); wordmark/branding, licensing, and open-vs-closed source are not.

**Constraints that do carry over:** `reference/` is frozen (corrections happen upstream, re-snapshotted with a new commit hash); `Features.md` and `test-cases/` stay in sync with reality in the same change set; checks get proven against planted defects before they are trusted; prose commits that say what was found and why it matters.

**Working style:** one question at a time in the brainstorm; honest trade-offs; spec → plan → TDD after approval; one PR per change on branches off `main`, merged only with explicit approval.
