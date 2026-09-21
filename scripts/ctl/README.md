# scripts/ctl — the controller's mechanical work as verbs (owner's order, 2026-09-21)

`scripts/ctl/ctl <verb>` is the only door for: landing a PR, the forced gate, opening a PR, anchoring the controller state, verifying a batch PR, reconciling the ledger, watching lanes, restarting an executor, delivering a message to a pane, rebuilding the dev stack. A PreToolUse hook (`hooks/ctl-scripts-only.py`) refuses the raw forms in every Claude Code session on this machine; `ctl help` lists the verbs, each prints one summary line last (`OK …` / `FAIL …`), exits 0 only when every named condition held, and takes `--dry-run`.

## The marker chain
`ctl check-pr <branch>` (green) writes `.git/ctl/checked-<sha>`; `ctl pr open --require-checked` refuses without it. `ctl gate <sha>` (green) writes `.git/ctl/gate-<sha>`; `ctl land <pr>` refuses without it and re-reads the PR head at the instant of merging. A marker names one sha; a new commit needs a new run.

## The escape hatch
Set `GISIK_CTL_UNLOCK=1` in the environment of the `claude` process you launch (`GISIK_CTL_UNLOCK=1 claude …`) and the hook stands down for that session. A `GISIK_CTL_UNLOCK=1 gh pr merge` typed inside a session does not unlock (the hook's own environment is unchanged — case 32 of the self-test). Your own terminal runs no hook.

## Fresh machine
1. `bash scripts/ctl/hooks/install-hooks.sh` (runs the self-test first; registers the hook in `~/.claude/settings.json`; idempotent).
2. Node 22 at `~/.nvm/versions/node/v22.22.2` (or `GISIK_NODE22_BIN`), `gh` authenticated, `tmux` session `gisik`, the primary checkout at `/Users/kiro/my_projects/gisik-nokma` (or `GISIK_PRIMARY`).
3. `pnpm check:ctl` green.

## Logs
`~/.cache/gisik-ctl/<verb>-<stamp>.log` (override `CTL_LOG_DIR`). Every summary line names its log.
