import { z } from 'zod';
import { displayName } from '../display-name.js';
import { RANK_KEY_REGEX, isRankKey } from '../rank.js';

/**
 * The project-group vocabulary (prefixes and groups plan Task 6, spec R3/R4/R7).
 *
 * A group is a named folder a workspace owner or admin files projects under. The
 * tree is at most FOUR levels deep: a group's `level` is its parent's level plus
 * one, an L1 group has no parent, and neither the level nor the parent ever
 * changes once the group exists (there is no "move" event — spec §7).
 *
 * The four payloads are schemas only. The door that checks them against the
 * tree (parent exists in this workspace, `level = parent.level + 1`, sibling
 * names unique ignoring case, no delete while in use) is
 * `apps/server/src/permissions/check-permission.ts` `checkGroupRules`, because
 * those are questions about OTHER rows and a schema cannot ask them.
 *
 * `level` rides in the payload rather than being derived so a replay is a pure
 * function of the ledger with no lookup, and so the door can compare the
 * claimed level to the parent's and refuse a mismatch with its own sentence.
 */
export const GROUP_MAX_LEVEL = 4;

const rankKey = z.string().regex(RANK_KEY_REGEX).refine(isRankKey);

export const groupCreatedPayload = z
  .object({
    parentId: z.string().min(1).nullable(),
    level: z.number().int().min(1).max(GROUP_MAX_LEVEL),
    name: displayName,
    rank: rankKey,
  })
  .strict()
  .refine(
    (payload) => (payload.level === 1) === (payload.parentId === null),
    'an L1 group has no parent; every other level has one',
  );
export type GroupCreatedPayload = z.infer<typeof groupCreatedPayload>;

export const groupRenamedPayload = z.object({ name: displayName }).strict();
export type GroupRenamedPayload = z.infer<typeof groupRenamedPayload>;

export const groupReorderedPayload = z.object({ rank: rankKey }).strict();
export type GroupReorderedPayload = z.infer<typeof groupReorderedPayload>;

export const groupDeletedPayload = z.object({}).strict();
export type GroupDeletedPayload = z.infer<typeof groupDeletedPayload>;
