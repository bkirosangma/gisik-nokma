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
| B07 | claimed | 2026-09-21 20:50 | /Users/kiro/my_projects/gisik-nokma-exec4 |
| T-E6-24 | done | 24997d03e767466c7f1b0460674e6e72b445dd03 | replica-deleted-reads.test.ts E6-24 x4 (case 12.399) |
| T-E6-2 | done | f6231926363f3245f98cd5a154fa8b43dcfa2417 | live-ticket.test.ts E6-2 x23 (mutation-witnessed) + soft-deleted-writes.test.ts x13 through POST /v1/events (case 17.121) |
| T-E6-4 | done | 35c414f1910b69843641df43764a283e54e3243b | deleted-hierarchy.test.ts E6-4 x6 + soft-deleted-hierarchy.test.ts x4 through POST /v1/events (cases 17.122-17.123) |
| T-F2-fn | done | ccc22a4a93433fdd468621e4cb370f6fb81c5d1a | prose-only: false warrant withdrawn in soft-delete-background-paths.test.ts (c), Features.md, 16.90(c); citations re-pointed by content |
| T-F4-fn | done | 39167c28d48b5a16e21e8d8d35c323e5e7e926f7 | my-work.test.ts F4 x1 (mutation-witnessed: 1 failed / 24 passed) (case 17.124) |
| T-F5-fn | done | 066f2491d799929b0659175d8d8dd610d7755d03 | replica-deleted-reads.test.ts F5 x2 (mutation-witnessed, one kill each); 16.90 flipped to ✅ (case 17.125) |
