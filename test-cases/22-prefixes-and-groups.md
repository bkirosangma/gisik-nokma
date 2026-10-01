# §22 — Prefixes, project groups and the Create buttons

**Opened 2026-10-02 by the prefixes and groups plan** (`docs/superpowers/plans/2026-10-01-prefixes-groups-create-buttons.md`; spec `docs/superpowers/specs/2026-10-01-prefixes-groups-create-buttons-design.md`, owner-approved, R1–R7). Mirrors `Features.md` §19. Ships on `release/prefix-groups-ux`.
3-DIGIT PADDED `22.001`–`22.999`, blocks per task: T1 22.001–22.019 · T2 22.020–22.039 · T3 22.040–22.059 · T4 22.060–22.079 · T5 22.080–22.089 · T6 22.090–22.119 · T7 22.120–22.149 · T8 22.150–22.159 · T9 22.160–22.179 · T10 22.180–22.199 · T11 22.200–22.219 · T12 22.220–22.239. Unused ids in a block stay free for that task's follow-ups.

## 22.1 Events

*Task 1. Ids `22.003`–`22.019` are unused.*

- ✅ **22.001 — `workspace.prefix_changed` is a registered event filed against the workspace and carries exactly one valid prefix (`{ prefix: "SH" }`);** control: `"sh"`, `"ABCD"`, `""`, `{}`, a stranger key and a non-workspace entity kind are all refused. Mutation: register it with `.passthrough()` or against the project kind → red. (`packages/domain/test/prefix-events.test.ts`; `packages/domain/src/events/membership.ts`, `vocabulary.ts`)
- ✅ **22.002 — `project.updated` may carry only a `prefix`, or only a `groupId` (a string, or `null` to ungroup);** control: `{}`, a malformed prefix (`"sh"`) and an empty `groupId` are refused. Mutation: drop `prefix` from the refine → the prefix-only payload is refused → red. (`packages/domain/test/prefix-events.test.ts`; `projectUpdatedPayload`)
