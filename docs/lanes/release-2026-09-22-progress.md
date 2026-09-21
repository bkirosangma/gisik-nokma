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
| B16 | claimed | 2026-09-21 21:18 | /Users/kiro/my_projects/gisik-nokma-exec6 |
| T-E6-13 | done | 6f5d5780e747ef47c82f46e32d2dda8ca7260f2f | verify-projections.test.ts E6-13 x2 (case 3.960; both re-bind orders, RED drift + RED throw → GREEN) |
| T-E6-22 | done | 1ffb32df94bdd9c6687cea11cacfcff5ac1e8a59 | prose only: canSee docblock + Features.md canSee bullet record the divergence and the inert door |
| T-E6-23 | done | 58197f25ba7a1b9e7145ddebee43cda2c76ee81e | schedule.test.ts 13.1200 (planted defect, RED→GREEN) + 13.1201 control |
| T-E6-5 | done | 226645af1bf35e6180851131d27e4f7673404d3e | outbox.test.ts E6-5/12.960 (RED overtake → GREEN due-prefix) + 12.961 control; server half (contest on unknown ticket) needs-owner — see case 12.960 |
| T-E6-17 | done | 1a5967d042ab35baf8cded278f46ab226199340e | check-visibility-permission.test.ts 6.151 (planted defect, RED→GREEN) + 6.152 controls; server package, not domain (brief header discrepancy noted in commit) |
