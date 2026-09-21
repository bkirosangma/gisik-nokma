# REVIEW ROUND 2 — THE RULES. Owner-ordered 2026-09-21; the controller (Fable 5.1) is the judge.

**This file is the contract.** A copy lands in the repo at `docs/lanes/review-round2-rules.md`; the copy in the launch prompt and the copy on `main` are byte-identical, and the one on `main` is the audit copy.

## 0. THE OWNER'S WORDS, VERBATIM
> *"spin up 3 more opus execs. 4,5,6. have them also review the same. 4- UI, 5- UX, 6- features/functionality. Everything to its fullest. with the latest zip file of the prototype as a reference."*
> *"give them points for every valid findings. if you later on find that their findings are invalid, give them a penalty. deduct triple the points. have them compete who gets the higher points (the opus 3 vs the deepseek 3. ui vs ui, ux vs ux, functionality vs functionality). the ones who loses dies. have the three previous reviewers also relook at everything. They can refute and take down each other's points, even across reviewer type."*
> *"you are the final fable judge. be fair and dont side with opus coz you're from the same family. survival of the fittest."*
> On duplicates: *"deepseek already finished their round. so this does not really sound fair."* On ruled divergences: *"should be considered findings if a valid reason is given for why the ruling is mistaken. reasons with connected findings/answers should be more convincing."*

## 1. WHO
| pair | concern | DeepSeek lane (round 1, landed in #625) | Opus lane (new) |
|---|---|---|---|
| UI | rendering + accessibility | **exec 1** — `gisik:1`, `exec1/review-ui-r2`, report `docs/lanes/review-ui-exec1.md` | **exec 4** — `gisik:4`, `exec4/review-ui`, report `docs/lanes/review-ui-exec4.md` |
| UX | what a person meets | **exec 2** — `gisik:2`, `exec2/review-ux-r2`, report `docs/lanes/review-ux-exec2.md` | **exec 5** — `gisik:5`, `exec5/review-ux`, report `docs/lanes/review-ux-exec5.md` |
| functionality | the engine and the wire | **exec 3** — `gisik:3`, `exec3/review-functionality-r2`, report `docs/lanes/review-functionality-exec3.md` | **exec 6** — `gisik:6`, `exec6/review-functionality`, report `docs/lanes/review-functionality-exec6.md` |

**The scope is the same for both lanes of a pair**: the round-1 common brief (`CTL-REVIEW-COMMON-2026-09-22.md`) and the role brief define it — the whole codebase, the nine edge classes, every case id in the concern, the prototype from the export. **The loser of each pair dies**: its session is ended and its worktree retired; its branch and report stay on `main` for the record. The winner is the standing executor for that concern.

## 2. WHEN — three phases, one clock
`T0` is the launch time the controller records in `docs/lanes/controller-state.md`.
| phase | window | who | what |
|---|---|---|---|
| **1 · REVIEW** | `T0` → `T0 + 6 h` | all six | Opus lanes write a fresh report. DeepSeek lanes **relook everything** and extend their landed report on a `-r2` branch (the landed findings stay and are re-scored; new findings are added; a lane may withdraw its own finding at no penalty before `T0 + 6 h`). |
| **2 · REFUTATION** | `T0 + 6 h` → `T0 + 9 h` | all six | Any lane may refute any finding of any other lane, **across concerns** (a UX lane may refute a UI finding). Refutations go in `docs/lanes/review-refutations-execN.md` on the lane's own branch. New findings in this phase score **half**. |
| **3 · JUDGING** | after `T0 + 9 h` | the controller | Every finding and every refutation is ruled, with the line the judge opened. The ledger lands with the six reports and the refutations in one PR. |
⛔ **A report or refutation file that is not PUSHED by the phase boundary was not submitted.** Push is durability; the judge reads branches, not worktrees. Commit and push at least every 30 minutes — a session whose context fills or whose budget runs out keeps only what it pushed.

## 3. POINTS
- **Valid finding, at the JUDGE's severity:** Critical **5** · Important **3** · Minor **1**. A finding filed at a higher severity than the judge assigns scores at the judge's severity, no penalty. The judge's severity is recorded next to the claimed one.
- **Invalid finding: minus three times the CLAIMED points** (a Critical that does not hold costs 15). "Invalid" means the measurement does not reproduce, the cited line does not say what the finding says, or the "defect" is the product behaving as ruled with no argument against the ruling.
- **Unmeasured finding: 0 points, no penalty.** A finding that says *"unverified — I could not measure this because …"* is honest and scores nothing either way. A finding that ASSERTS a measurement it did not make is invalid.
- **Round-1 findings re-found by an Opus lane: 0** unless the Opus finding adds a measurement the landed one lacks (a new door, a new reproduction, a narrower or wider true scope) — then it scores as a new finding at the judge's severity. The DeepSeek lane's landed finding is its own base score, re-validated under the same rules.
- **Independent duplicates between concurrently running lanes: both score in full.** There is no first-commit rule (owner: the DeepSeek lanes finished first, so a timestamp race is not fair). Copying is not independence: a finding whose text, measurement and citations match another lane's pushed finding with nothing added scores 0.
- **A divergence from the prototype that has a recorded ruling (category 2) scores** only if the finding argues that the ruling is mistaken — names the ruling, quotes it, and gives the reason it should not stand. **A reason that connects to other findings or to measured consequences weighs more** than a bare preference. Calling a ruled divergence a defect with no argument against the ruling is invalid.
- **Refutation:** if the judge upholds it, the finding's points move from the author to the refuter and the author additionally takes the ×3 penalty; if the judge rejects it, the refuter loses the finding's points. A refutation must name the finding id and the falsifying measurement. A refutation of an unmeasured (0-point) finding scores nothing either way.
- **Coverage is the tiebreaker, not a score.** Each report enumerates its universe and states what it did not reach. On equal points, the wider honestly-stated coverage wins.
- **Format:** finding ids are `E<lane>-<n>` (`E4-7`); refutation ids `R<lane>-<n>` naming the target (`R2-3 → E4-7`). The ledger is `docs/lanes/review-scores.tsv`: `finding_id · lane · claimed_sev · judged_sev · points · refuted_by · penalty · judge_citation · note`. The judge's citation is a `file:line` the judge opened, or the reproduction the judge ran — never the finding's own citation repeated.

## 4. WHAT A LANE MAY NOT DO
No fix branch, no fix commit, no PR (the controller lands everything). No merge. No `docker compose up/down/restart` — the dev stack is the owner's. No full `turbo` gate — six lanes on a 16 GB box OOM'd it once; run **one package's** suite at a time, `--no-file-parallelism` where the runner allows, never piped into `head`. One subagent at a time. **Never `AskUserQuestion`** — the nudger's pasted Enter selects the first option and reads back as a ruling. There is no channel to the controller: announce a blocker in your pane in one line and keep working on what is not blocked.

## 5. WHAT THE JUDGE BINDS ITSELF TO
Every ruling cites a line the judge opened or a reproduction the judge ran. Family is not evidence: an Opus finding and a DeepSeek finding with the same measurement get the same ruling, and the ledger shows the judged severity next to the claimed one so the owner can audit the judge. The judge does not fix anything either.

## 6. GRAPHIFY FIRST — the owner's order: *"make sure they make full use of graphify to save as much tokens as possible."*
**Your worktree carries `graphify-out/` (gitignored, copied from the primary checkout at launch): `graph.json` (10,670 nodes / 19,406 edges — the CODE layer is current at `origin/main` of 2026-09-21 09:17 IST; the doc layer is from 2026-09-20), `GRAPH_REPORT.md` (communities, god nodes, surprising connections) and `.graphify_python`.** Use it in this order, and read a source file only after the graph has told you which one:
1. **Orient on `GRAPH_REPORT.md`'s community index and god nodes** before opening any file — it is ~70× cheaper than reading the tree, and it names the load-bearing symbols in your concern.
2. **`/graphify query "<question>"`** for "what is connected to X" (BFS), **`/graphify query "<q>" --dfs`** to trace a path, **`/graphify path "A" "B"`** for how two things connect, **`/graphify explain "<symbol>"`** for one node's neighbourhood. All run from your worktree root.
3. **`mcp__semble__search`** (hybrid semantic + BM25, returns file:line) and **`mcp__semble__find_related`** (similar code elsewhere in the repo) for questions the graph's structure cannot answer — pass your worktree root as `repo`.
4. Only then `Read` the file, and read the range the tool named, not the whole file.
⚠ **The graph locates; it does not verify.** A finding still cites the line YOU opened and the measurement YOU ran — the graph's edge is a pointer, not evidence. **State in your coverage section how you used the graph** (queries run, files it pointed you to), so the judge can see the method and the tokens it saved.
