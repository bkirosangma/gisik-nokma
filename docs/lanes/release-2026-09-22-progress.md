# Release 2026-09-22 — progress ledger (one line per batch claim and per task; appended by the driver, travels in each batch PR)

Read `docs/lanes/release-2026-09-22-plan.md` §0 first. Statuses: `claimed` (batch), `done`, `skipped`, `blocked`, `needs-owner`. Never rewrite a line; append.

| id | status | when / sha | note |
|---|---|---|---|
| B08 | claimed | 2026-09-21 19:57 | /Users/kiro/my_projects/gisik-nokma-ds3 |
| T-E2-29 | done | 47a411a4 | 3.178 / E2-29 — a rejected ingest during a Move is spoken by the dialog, never as the server's verdict |
| T-E2-46 | done | 33b653d9 | 9.257 / E2-46 — typed link IS offered the escape suggestion; recorded asymmetry was the probe (no RED: no behaviour changed) |
| T-E4-19 | done | 7d83f993 | 3.179-3.181 / E4-19 — History headline narrates; slug kept in .gn-history__slug; mutation kills 3 |
| T-E5-27 | done | 4516e2bf | 3.182 / E5-27 — Move in-flight latch; RED PASS (0) FAIL (1), GREEN PASS (1) FAIL (0), suite 1725 |
| T-E5-28 | done | a59bad07 | 10.90-10.92 / E5-28 — Publish transport+unknown arms, refusal keeps the mapping; RED PASS (0) FAIL (3), suite 1728 |
| T-E5-8 | done | f5e0878a | 3.183-3.184 / E5-8 — census over the domain lists; found attachment.added + claim.contested_resolved; RED PASS (3) FAIL (3), suite 1734 |
| T-F3-ux | done | aaee94cb | F3 — renderCommentBody; RED PASS (6) FAIL (1), GREEN PASS (21), suite 1749, ui 378. BLOCKED: §16 case id OWED — exec 2 block fully spent, reallocation needed |
| T-V4 | done | 976f87be | 17.022 / V4 — three-way comments split (failed outranks pending); RED PASS (9) FAIL (1), suite 1752. Also minted 17.021 for T-F3-ux and discharged the §16 note |
| T-V7 | done | 6dd30946 | 17.023 / V7 — explicit success signal (submit: Promise<boolean>); RED PASS (1) FAIL (1), editor 192, app-core 1752, web 622 |
| T-E4-1 | done | c781f9dc | 17.024 / E4-1 — epic crumb omitted when it is the parent; RED PASS (0) FAIL (1), suite 1753 |
| T-E4-30 | done | e81616af | 17.025 / E4-30 — link crumb ink var(--gn-text-accent); RED 2 failed, suite 1757, ui 378 |
| T-E5-3 | done | a7f169f3 | 17.026 / E5-3 — one-hop contract (server) + restricted arm (client); server 1728, app-core 1758 |
