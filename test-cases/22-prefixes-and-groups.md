# §22 — Prefixes, project groups and the Create buttons

**Opened 2026-10-02 by the prefixes and groups plan** (`docs/superpowers/plans/2026-10-01-prefixes-groups-create-buttons.md`; spec `docs/superpowers/specs/2026-10-01-prefixes-groups-create-buttons-design.md`, owner-approved, R1–R7). Mirrors `Features.md` §19. Ships on `release/prefix-groups-ux`.
3-DIGIT PADDED `22.001`–`22.999`, blocks per task: T1 22.001–22.019 · T2 22.020–22.039 · T3 22.040–22.059 · T4 22.060–22.079 · T5 22.080–22.089 · T6 22.090–22.119 · T7 22.120–22.149 · T8 22.150–22.159 · T9 22.160–22.179 · T10 22.180–22.199 · T11 22.200–22.219 · T12 22.220–22.239. Unused ids in a block stay free for that task's follow-ups.

## 22.1 Events

*Task 1. Ids `22.003`–`22.019` are unused.*

- ✅ **22.001 — `workspace.prefix_changed` is a registered event filed against the workspace and carries exactly one valid prefix (`{ prefix: "SH" }`);** control: `"sh"`, `"ABCD"`, `""`, `{}`, a stranger key and a non-workspace entity kind are all refused. Mutation: register it with `.passthrough()` or against the project kind → red. (`packages/domain/test/prefix-events.test.ts`; `packages/domain/src/events/membership.ts`, `vocabulary.ts`)
- ✅ **22.002 — `project.updated` may carry only a `prefix`, or only a `groupId` (a string, or `null` to ungroup);** control: `{}`, a malformed prefix (`"sh"`) and an empty `groupId` are refused. Mutation: drop `prefix` from the refine → the prefix-only payload is refused → red. (`packages/domain/test/prefix-events.test.ts`; `projectUpdatedPayload`)

## 22.2 The group tree — events, projection, door, read route

*Task 6. Ids `22.108`–`22.119` are unused.*

- ✅ **22.090 — `group.created` carries a level that agrees with its parent being present (L1 has none, L2–L4 have one); `group.renamed` takes a name, `group.reordered` a rank, `group.deleted` nothing;** control: L1 with a parent, L2 without, L5, a stranger key and a non-group entity are refused. Mutation: drop the level/parent refine → the L1-with-a-parent payload parses → red. (`packages/domain/test/group-events.test.ts`; `packages/domain/src/events/groups.ts`)
- ✅ **22.091 — the tree is served with levels, parents and counts to a member;** control: another workspace's owner sees none of these rows. (`apps/server/test/groups/groups.test.ts`; `routes/groups.ts`)
- ✅ **22.092 — an L2 under an L2 is refused `group.level-mismatch`;** control: the L3 under it commits. Mutation: skip the level check → red. (`groups.test.ts`; `checkGroupRules`)
- ✅ **22.093 — a parent from another workspace is refused `group.unknown`, like a fabricated one;** control: the same name under a real parent commits. (`groups.test.ts`)
- ✅ **22.094 — `retail` beside `Retail` is refused `group.name-taken` naming the existing one;** control: the same name under a different parent commits. Mutation: compare names case-sensitively → red. (`groups.test.ts`)
- ✅ **22.095 — renaming onto a sibling (any case) is refused; renaming to a free name, or to its own name in another letter case, commits.** Same mutation as 22.094 → red. (`groups.test.ts`)
- ✅ **22.096 — deleting a group a project is filed under is refused `group.in-use`, naming the project;** control: after the project moves out the delete commits. Mutation: skip the in-use check → red. (`groups.test.ts`)
- ✅ **22.097 — deleting a group with children is refused `group.has-children`;** control: the child itself deletes. (`groups.test.ts`)
- ✅ **22.098 — an unused leaf deletes and the route no longer lists it;** control: its sibling stays. (`groups.test.ts`)
- ✅ **22.099 — a project filed under a group from another workspace, a deleted one or a fabricated one is refused `project.group-unknown`;** control: a live group commits. (`groups.test.ts`)
- ✅ **22.100 — every group event by a member is refused `permission.role`, an admin commits; a member may read, a guest and an outsider get 404.** Mutation: drop the four types from `ADMIN_ONLY_TYPES` → red. (`groups.test.ts`)
- ✅ **22.101 — create, rename, reorder, assign and delete leave `verifyProjections` clean (in a ledger-only database);** control: a group row edited behind the ledger is reported on `proj_groups`. (`groups.test.ts`)
- ✅ **22.102 — the `/v1/me/workspaces` mapper requires `groupId` on every project row:** a string and `null` map through, a missing key is refused naming `projects[0].groupId`; control: a number is refused. (`packages/app-core/test/online/mappers.test.ts`; `mappers.ts`)
- ✅ **22.103 — siblings are served in rank order and a `group.reordered` moves the group; `projectCount` is that group's own:** A, B, C list A, B, C, reordering C to the front lists C, A, B, and one project in A counts 1 for A and 0 for B and C. Mutations: drop `rank` from the route's `ORDER BY`, make the projection's reorder UPDATE write nothing, count `p.group_id IS NOT NULL` → red. (`apps/server/test/groups/groups.test.ts`; `routes/groups.ts`, `projections/proj-groups.ts`)
- ✅ **22.104 — `GET /v1/me/workspaces` serves each project's `groupId`:** after filing, the row carries the group's id, after ungrouping it reads `null`; control: a never-filed project reads `null` throughout. Mutation: `groupId: null` in `read/visible-projects.ts` → red. (`groups.test.ts`)
- ✅ **22.105 — group events are withheld from replica streams:** the owner and a member receive no `group.created` or `group.renamed`; control: the `project.updated {groupId}` committed in the same run IS served. Mutation: `audienceClassOf('group')` returning `'workspace'` → red. (`apps/server/test/visibility/visible-events-for.test.ts`)
- ✅ **22.106 — reorder and delete of a group that does not exist are refused `group.unknown`:** a re-delivered delete and a reorder of a fabricated id; control: the live group's reorder commits. Mutations: drop the `readGroup` null check in the `group.reordered` arm, or in the `group.deleted` arm → red. (`groups.test.ts`; `checkGroupRules`)
- ✅ **22.107 — a TRASHED project still blocks its group's delete (`group.in-use`);** control: after `project.undeleted` and an ungroup the delete commits. Mutation: add `AND deleted_at IS NULL` to the in-use query → red. (`groups.test.ts`)
