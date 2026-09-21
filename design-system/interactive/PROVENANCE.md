# Prototype provenance

Every file in this directory is UNPACKED from an owner export, never hand-edited. This file records
which export, so the next refresh is one command and one diff.

## ⚠ A NEWER EXPORT EXISTS AND IS NOT THIS COPY — its line numbers are 1 LOWER

The owner's **2026-09-20** export is at `gisik-nokma-lanes/prototype-2026-09-20/Gisik Nokma -
Desktop.dc.html` — **4,049 lines, 316,911 B, sha256
`3d142d464a070b332efe4cf93fa6ca646f8d8941d657d9c361ceb3f086112ae5`**. **It is not what this directory
holds.** `desktop.dc.html` is the **2026-09-18** export's output (blob `6d7b67c0a52c…`, 4,050 lines,
320,109 B, sha256 `2cda054b4320ebb6…`), which is the table under *The current export* below — so a
`:NNN` citation into the committed copy must have **1 subtracted** to find the same text in the
2026-09-20 file.

Measured 2026-09-21 over both files in full, not at sample anchors:

| | |
|---|---|
| lines agreeing under a shift of one (committed line N = export line N−1) | **3,732 of 4,049 — 92.2 %** |
| lines differing in content under that shift | **317** — 222 change the count of `sc-camel-*` (the transfer encoding `support.js` decodes: the committed copy carries 225, the export 0); the other 95 differ otherwise |
| longest unbroken run of differing lines | **11** (`659`–`669`), and agreeing lines resume after it |

**That last row is what makes the shift usable rather than a guess.** A broken mapping would mismatch
*every* line after the break; instead the file re-agrees, so the differences are in-place changes rather
than further shifts. The whole difference is a net **one** line and it is settled inside the first seven
lines — the diff carries **zero insertion hunks** and its **two deletions are both in the first three
hunks** — so the shift is `+1` from `:8` on. Its cause is not the `sc-camel-*` encoding alone: a change in
that count accounts for 222 of the 317, and the remaining 95 are stated above rather than folded into it.

**Why this is recorded rather than fixed.** The files citing this one BY LINE are the affected set, and a
bare `:NNN` is 1 off against the 2026-09-20 export — small enough that a reader checking one value would
not notice. Counted 2026-09-21 rather than asserted, because the size of the set is the whole argument:
`grep -rlE 'desktop\.dc\.html(@[0-9a-f]{6,40})?:[0-9]' apps packages` (minus `node_modules`) returns
**92 files**, and the same command with the `:[0-9]` requirement dropped returns **113** — so the
instrument distinguishes *cites a line* from *mentions the file*, which is the distinction this note
turns on. **That 92 is a reading of today's tree and expires**; re-run it rather than quoting it.
Repointing those files is not this note's to do; the form that survives a refresh already exists and is
documented in `docs/design/prototype-delta-2026-09-18.md`:
**`desktop.dc.html@<blob-sha12>:<line>`**, resolvable with `git show <blob-sha12>`. This is a third
reason to prefer it over a bare line number.

## The current export

| | |
|---|---|
| source file | `~/Downloads/Gisik Nokma Desktop (1).html` |
| snapshot | `gisik-nokma-lanes/refs/2026-09-18-gisik-nokma-desktop-1.bundle.html` (565,271 B) |
| bundle sha256 | `bf64cc446880281f49ccafb885663f387f5a2c60b6f06bbf855e6bd1a2a832f5` |
| export date | 2026-09-18 |
| format | a self-extracting "Bundled Page": an outer shell plus four `<script type="__bundler/…">` blocks (`manifest` `:371`, `ext_resources` `:375`, `page_order` `:379`, `template` `:383`) |

The bundle is **deliberately not committed**. It is a byte-for-byte copy of a file in the owner's
Downloads, and everything in it that matters is written out below.

## The command

```
node design-system/tools/unpack-bundle.mjs \
  --mobile-entry 1 \
  gisik-nokma-lanes/refs/2026-09-18-gisik-nokma-desktop-1.bundle.html
```

Deterministic: the same bundle produces the same bytes. The tool refuses to run on a file whose three
required blocks are absent, and fails rather than guessing if the template references an asset it was
not given a name for.

## What it wrote

| file | bytes | sha256 |
|---|---|---|
| `desktop.dc.html` | 320,109 | `2cda054b4320ebb6b379d290a6e8dba69ac45cd1eabe0da100b5425e45b6d90c` |
| `support.js` | 69,150 | `8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe` |
| `mobile.dc.html` | 227,232 | `7316062b5bb328915ed1a4193b1007a54e39fc4dd5a6d350f020b641de76378d` |

The uuid → filename map is one entry, because the template references exactly one asset:

| uuid | mime | filename |
|---|---|---|
| `804d1df5-cae0-4483-857f-de1a51133762` | `text/javascript` | `support.js` |

`support.js` is the `<x-dc>` runtime. The template referenced it as a bare uuid; the unpack rewrites
that reference to `./support.js`. **The committed prototype was previously un-runnable**: its template
also asked for `./support.js`, and this directory has never contained that file. This export supplies
it, so `desktop.dc.html` now loads on its own.

## The mobile entry — #1, CHOSEN EXPLICITLY, not defaulted

`ext_resources` names **two** entries under the SAME id, `./Gisik%20Nokma%20-%20Mobile.dc.html`:

| entry | uuid | bytes | sha256 (first 12) |
|---|---|---|---|
| **#1 — WRITTEN** | `51ec53b9-8aa9-403e-82f9-3d40ef0e29ba` | 227,232 | `7316062b5bb3` |
| #2 — not written | `835a206c-44fb-4b8c-8092-b2ba3410d90f` | 226,533 | `14ca5b8d89ab` |

**Entry #1 is what `mobile.dc.html` now holds**, and it is here because it was NAMED — `--mobile-entry
1` — not because the tool preferred it. The tool still refuses to choose: with no flag it prints both
entries and holds, which is the behaviour this refresh was originally filed under. The flag exists so
that naming one is an act somebody performs and PROVENANCE records, rather than a silent default.

**Why #1, and what that reason is worth.** The two differ at line 153 and nowhere else: entry #1
inlines the Google mark as an `<svg>`, entry #2 points at `<img src="./apps/web/public/google-mark.svg">`
— a path the bundle does not carry, so #2's copy is only complete beside a file this export does not
supply. The 2026-09-18 DESKTOP template made the same change to its own `isSignIn` screen, so #1 is the
mobile entry consistent with the rest of this export. **That is a coherence argument, not a
determination:** which export is NEWER is still not derivable from the bundle (`page_order` is empty,
no timestamps), so if the two ever need to be told apart by date rather than by content, the question
is still open. The scratch copies of both are left on disk under the run's temp directory.

## Other files in the manifest, deliberately not written

`react` and `react-dom` 18.3.1 UMD are present as unpkg URLs. They were **measured**, not assumed: no
uuid reference to either survives the rewrite in either written file, so writing them would add two
files nothing loads. If a future export does reference them, the tool writes them automatically.

## Before this refresh

The previous `desktop.dc.html` was the 3,773-line export unpacked by hand. It is not byte-comparable
to this one: the 2026-09-18 export was emitted by a newer bundler whose runtime spells raw HTML
elements as `<sc-raw-*>` and event attributes as `sc-camel-on-*`. **The List screen's design is
unchanged by this refresh** — same tokens, same strings, same `LIST_COLS` set — but every line number
moved, and not by a constant. See the Step 2 PR body for the delta.

**Line citations: every `desktop.dc.html:<line>` citation written before 2026-09-18 refers to the
PRE-refresh file**, readable at `git show b6d76a90:design-system/interactive/desktop.dc.html`;
historical plans and anchors are NOT rewritten, and a live citation is re-measured by whoever next
touches its line.
