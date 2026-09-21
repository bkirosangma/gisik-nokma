# Release 2026-09-22 — progress ledger (one line per batch claim and per task; appended by the driver, travels in each batch PR)

Read `docs/lanes/release-2026-09-22-plan.md` §0 first. Statuses: `claimed` (batch), `done`, `skipped`, `blocked`, `needs-owner`. Never rewrite a line; append.

| id | status | when / sha | note |
|---|---|---|---|
| B05 | claimed | 2026-09-21 18:41 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E4-17 | done | 5b94eeff4e11331143cdadb294a111da0ceea985 | select.test.tsx E4-17 x2 |
| T-E4-21 | done | e42e3c7f5bd0fb7ab98a3fad2b0710b022605ca2 | components.test.tsx E4-21 x4 |
| T-P18 | done | 96f6508ac18417d4a0a9ce2efab71320b3de1d6c | route-announcer.test.tsx x5 |
| T-P23 | done | ffadbb08ea1234c2c9eddf41dba71205701b2e08 | select.test.tsx P23 x2 (mutation-witnessed) |
| T-P9 | done | 303720e458759f5361298022f392db5ccebbf298 | components.test.tsx P9 x4 |
| T-P8 | done | cf7ee59ab84197edd42fe884ef168ae5126348de | components.test.tsx P8 x4 |
| B10 | claimed | 2026-09-21 21:23 | /Users/kiro/my_projects/gisik-nokma-ds1 |
| T-E4-11 | done | c268647e6010169708a4a1744729f3244dbc0d28 | nav-phone-disclosure.test.ts (13.1137) + app-nav.test.tsx (13.1138); web 637/637 |
| B10-ids | reserved | 2026-09-21 21:50 | case-id block 13.1139-13.1073 for batch B10 (verified free over all 25 catalogue files) |
| T-E4-13 | done | bda4a02fa2910e8b126d288b1519cdbd91d44445 | new-ticket-dialog.test.tsx (13.1139); app-core 1722/1722 |
| T-E4-14 | done | d94542ed2c1c1b7646cf23aecc0baeeed96b29b9 | components.test.tsx (13.1140); ui 399/399 |
| T-E4-3 | done | 95b63f3cbe2932512d41094c83e67cc507e64bc4 | tap-target-density.test.ts (13.1141); ui 399/399, web 639/639; DENSE_IN_LIST clause (b) UNMET, recorded |
| T-E4-7 | done | feeb1eb0364e039ff1d8a732e8f777693d9b2372 | components.test.tsx (13.1142); ui 402/402; not painted |
| T-P1 | done | e105e218fd5a3885eb4a5c32caaa333ba0d73e48 | bare-control-coverage.test.ts (13.1143) 4/4; editor 188/188, ui 406/406; 4 of 6 fixed, 2 are <a> no-ops (recorded) |
| T-P2 | done | eb7bba1cae6f205908c9500104897bd59c743ab8 | components.test.tsx (13.1144); ui 410/410; Features.md rationale added; not painted |
| T-E4-31 | done | e4dd9c211f8d4820ec46dbbe4ce25008fe202675 | tokens.test.ts (13.1145); accent stepped both themes (#2d5488/#97bdf2); ui 410, web 639, app-core 1722 |
| T-I2 | done | 056260d11d5bfd97783bc9d589654b82ce9c53e6 | roster provenance stamp; typecheck 17/17; no product test (DONE WHEN says none needed) |
| T-P24 | done | 232403d9adbe0eba95abb6dd34395f8f262436c0 | tokens.test.ts (13.1146) sweep 3/3; ui 413, web 639; dangerText option refuted (1.06:1) |
| T-E4-15 | done | 96f943c8980461fd8caead688f61dfc80656f464 | components.test.tsx (13.1147); ui 416, web 639; P35's ask is a subset and is satisfied here |
| T-E4-2 | done | 0c515a8a37b8b129325e39412b7118c0afe33a6b | components.test.tsx (13.1148); ui 420, web 639; sheet-opening sweep half NOT done (recorded) |
| T-E4-25 | done | 3ef6613dd6ee8cbd135ce764d6198ef31e31bf5c | settings-shell-tokens.test.ts (13.1149) 3/3 + 4 mutation plants; web 642 |
| T-P35 | done | 3ef6613dd6ee8cbd135ce764d6198ef31e31bf5c | satisfied by T-E4-15 (13.1147): the same rule, same defect; P35's single-property ask (border: none) is a subset of that commit |
| B10-ids | allocated | 2026-09-21 22:0x | controller (Fable): section-13 case ids are per RELEASE BATCH; B10 owns 13.1137-13.1156. The earlier self-declared reservation 13.1054-13.1073 is SUPERSEDED. |
| B10-ids | renumbered | dbd2d08a528d93bcc5c7abe73d50f2b80b4d49c9 | all 14 section-13 ids this batch had minted, into the allocated block; count unchanged at 2625 |
| T-E4-10 | done | 3d5896e75cbffee1512a7496edb3e415c3b5b5b5 | authoring-routes.test.tsx (13.1150) 9/9; web 643; first green was a FALSE RED from a stale app-core dist |
| T-E4-26 | done | 07d10ccabfd8eb35bd9caa8a9876b3d2bef644ec | ticket-list-css-binding.test.tsx (13.1151) 14/14; ui 420, app-core 1725, web 643; spacer bound + declarationsFor fixed; DENSE_IN_LIST half deferred |
| T-E4-27 | done | 49b1106adfbc727f073ca29050f4ae7e5072cb04 | 13.1152 in authoring-routes + builder-route; ui 420, app-core 1725, web 647 |
| T-E4-35 | done | 14cd0351eb79ce655980510bf954c0992ac61c73 | components.test.tsx (13.1153) 3/3; ui 423, web 647 |
| T-E4-8 | done | 9a221814e44160834e77fc4e39f378c11333eace | editor-toolbar.test.tsx (13.1154) 13/13; editor 191, ui 423, web 647 |
| T-P27 | done | 04fec411582400e34ecb35972ed95f8cb4202f7c | viewport-reflow-320.test.ts (13.1155) 3/3; web 650; typecheck 17/17; phone-320 baselines MISSING (owner named) |
| T-E4-9 | done | febbb3e6c84015fdd44b4bf726a811b6ff2bc682 | builder-route.test.tsx (13.1156) 10/10; ui 423, app-core 1725, web 652; overflow-loop third deferred |
| T-E4-32 | done | 7eab13fb86445fdf38c25d1df3d158ae73b1edbd | tokens.test.ts, second arm of 13.1146 (no new id - the sweep is narrower than the finding); ui 426, web 652 |
| T-P10 | done | 31f501bae4eff4b5ec5ad3bada029e4e1703245c | prose-only per its DONE WHEN; message + counter docblock; typecheck 17/17; web 652 |
| ASK | blocked | 2026-09-21 23:0x | B10's section-13 block 13.1137-13.1156 is FULLY USED (20 ids minted, 13.1137-13.1156). Four tasks remain and each needs a case id: T-E4-24 and T-P17 (heading outline, one shared instrument -> 1 id), T-P36 (duplicate h1/h2 -> 1 id), T-E4-36 (help results count role=status -> 1 id). REQUEST: 3 more section-13 ids for batch B10. Until they arrive the four carry catalogue entries whose case marker names the TASK and says "id pending allocation" - no id has been minted outside the block. |
| T-E4-24 | done | 8371ef241670da406e51b2bada4902ffcd198829 | heading-outline.test.ts + board-narrowing.test.tsx; 7 headings h3->h2; app-core 1728, web 652; CASE ID PENDING ALLOCATION |
| T-P17 | done | 8371ef241670da406e51b2bada4902ffcd198829 | heading-outline.test.ts + board-narrowing.test.tsx; 7 headings h3->h2; app-core 1728, web 652; CASE ID PENDING ALLOCATION |
| T-P36 | done | 4db375f10a7434227dbad06719e0711718cfe8fe | authoring-routes.test.tsx (T-P36 marker); both routes h1 -> Settings; web 654; CASE ID PENDING ALLOCATION (13.1157 minted then withdrawn before commit) |
