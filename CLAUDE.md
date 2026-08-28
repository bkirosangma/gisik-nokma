# gisik-nokma

Project management software ("the keeper of memory" — Garo: *gisik* mind/memory, *nokma* the custodian who holds things in trust). Based on the convenience-corner project tracker, snapshotted verbatim under `reference/` at upstream commit `24e2240`.

**Status: pre-brainstorm.** No product decisions exist. The first working session runs `superpowers:brainstorming` from `docs/brainstorm-kickoff.md` — do not scaffold apps, pick stacks, or write product code before that design session concludes and its spec is approved.

## Rules

- **Never commit or push to `main`.** `main` is unprotected — this is a free private repo, the same position convenience-corner is in — so nothing on the server will stop a direct push. Every change goes on a branch, through a PR, merged only with the owner's approval — given per-PR, or through the **standing auto-merge authorization** recorded in the coordination doc's autonomous execution protocol (2026-08-28: PRs that passed the full machinery AND an independent CI run green; owner notified after each merge; authorization revocable in a word). Treat the branch rule as the protection GitHub would otherwise enforce: check the current branch before any `git commit` or `git push`, and if it is `main`, branch first.
- **`reference/` is frozen.** Never edit anything under it. The base lives upstream in `convenience-corner`; corrections happen there and get re-snapshotted with a new commit reference recorded in `reference/convenience-corner-tracker/PROVENANCE.md`.
- **Features.md and `test-cases/` stay in sync with reality** per the workspace conventions (`/Users/kiro/my_projects/CLAUDE.md`) — same change set, never a follow-up.
- The base's load-bearing ideas are summarised in the README; treat them as *informed starting points* for the brainstorm, not as decisions already made for the product.

Workspace-level rules in `/Users/kiro/my_projects/CLAUDE.md` apply here. This file takes precedence where they conflict.
