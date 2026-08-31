# test-cases — gisik-nokma

Human-readable catalogue of every scenario worth covering, one file per top-level feature bucket, mirroring `Features.md` section numbering.

Status markers: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` consciously out of scope (with reason)

Rules: never renumber existing IDs; flip status in the same commit as the covering test; cross-reference tests by case ID; prose only — no test code here.

Buckets so far: `03-foundation-ledger.md` (Features.md §3), `04-workflow-engine.md` (Features.md §4), `05-tickets-hierarchy.md` (Features.md §5 — opened by Plan 3's keystone and extended by the rest of that plan's lane; its reserved id range is stated in the file), `09-editor-attachments.md` (Features.md §9 — Plan 7's client half; **starts at 9.35 because Plan 7 Task 16 reserves 9.1–9.34 and has not run**, which is why §6/§7/§8 and their buckets are absent rather than missing). Sections 1–2 are reference/spec material and carry no runnable scenarios. (`reference/` is frozen upstream code and carries its own upstream test catalogue; it gets no bucket here.)

Numbering is already reserved, so claim from the table rather than renumbering: `Features.md` §3–§13 and the matching `03-foundation-ledger.md` … `13-deployment-dogfooding.md` buckets are assigned one per implementation plan by `docs/superpowers/plans/2026-08-20-00-series-coordination.md`. (`reference/` is frozen upstream code and carries its own upstream test catalogue; it gets no bucket here.)
