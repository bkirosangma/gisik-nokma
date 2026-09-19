# §16 — the remaining doors

**Opened 2026-09-19 on the owner's ruling.** **`§13` IS CLOSED TO NEW IDS:** its remaining window is
`13.990`–`13.993`, `13.995`–`13.998` and `13.999`, and all of it sits inside executor 2's exhausted
block. **Nothing may be minted there, and nothing may be borrowed from it.**

**Why a new section rather than a wider pattern.** The next id after §13's window is four digits, and this
repo already documents `13.9999` — a user-agent pixel value — as a counting trap that has fooled a count
once before. Widening the id pattern to reach four digits would move that trap inside the guard instead of
leaving it outside, so the section was opened.

## THE BLOCKS — take from yours, never from the tip

| lane | block |
|---|---|
| **exec 1** | `16.1`–`16.30` |
| **exec 2** | `16.31`–`16.60` |

**When your block is empty, STOP AND ASK.** Do not mint from the tip and do not borrow a neighbour's —
that is the rule whose breach made §13 go red twice.

## The id shape is `16.N`, with NO zero padding

`16.1`, `16.2`, … `16.30`. **Do not reintroduce the `{3}` width** that §13 used: that width existed to
stop `13.99` sorting above `13.649`, and ids here are not padded, so importing it would be the truncation
trap in a new costume.

## ⚠ THREE SPELLINGS `check-case-ids` CANNOT SEE — write cases as id LINES

The guard counts **id LINES** and nothing else. All three of the following are invisible to it, each
measured on 2026-09-19:

- a case written as a markdown **table row**;
- a case written under a **`##` heading**, with the id appearing only in prose;
- a **backticked** id inside the bold — ``- ✅ **`13.989` — …`` — which *looks* exactly like a proper id
  line, because the matcher demands a digit after the asterisks and the backtick stops it at the first
  character.

**So write cases as `- **16.N** ✅ …` lines**, and after adding any, **confirm the `check-case-ids` count
moved by exactly the number you added**. A green `ok` is not evidence that the guard saw them: twelve
cases written as a table left the sweep at 2433, unchanged, and reporting `ok`.
