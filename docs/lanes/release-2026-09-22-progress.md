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
| B11 | claimed | 2026-09-21 21:46 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E2-45 | done | 856eddc9 | app-nav.test.tsx 17.141–17.143 (E2-45) |
| T-E5-25 | done | 3f359c75 | 13.1157 session-expired write (sheet/board/bulk) + adapter; 13.1158 guard (mutation-witnessed) |
| T-E5-31 | done | a3234e8c | 13.1159 app-nav signed-out arm (RED 2 / GREEN 33) |
| T-E5-32 | done | 093526c9 | 13.1160 sign-in?next= on all five read arms (RED 4 / GREEN 634) |
| T-E5-5 | done | 5c05e994 | 13.1161 Collaborators note (RED 1 / GREEN 635) |
| T-V1 | done | ea000e4c | 13.1162 empty-board copy+glyph gating & shell wiring (RED 2 core / 1 web; 1728 + 636 green) |
| T-V5 | done | ab79978e | 13.1163 contested arm via ticketLocation.locate (RED 2 / GREEN 638) |
| T-E2-38 | done | af14c3f4 | 13.1164 archived chip on the project page (RED 1 / GREEN 640) |
