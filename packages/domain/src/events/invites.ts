import { z } from 'zod';
import { ulidString } from '../envelope.js';

/**
 * The invitation vocabulary (Plan 4 Task 14, spec §6 "Invites travel as links or
 * QR from an admin").
 *
 * ## Why this vocabulary has to exist at all
 *
 * `membership.granted` names a `userId`, and a person who has never signed in
 * does not have one. Until these three types there was therefore no way to
 * invite a NEW person into a workspace — only to grant a role to somebody who
 * had already arrived by some other means. `invite.sent` names an **address**
 * instead, which is a CLAIM about where to reach somebody, never an assertion
 * about who they are.
 *
 * That distinction is load-bearing and this file's schemas keep it structural:
 * `invite.sent` carries an `address` string and NO user id; `invite.accepted`
 * carries a `userId` and NO address. Nothing in the vocabulary lets an address
 * and a user id appear in one payload, so no event here can be read as "this
 * address IS this person". The binding between the two is made once, by the
 * server, at the moment somebody proves they hold the link — and it is recorded
 * as `invite.accepted`, whose `userId` is the session that opened it.
 *
 * ## The token is not here, deliberately
 *
 * Anyone who can read a workspace's history can read an event id and a payload.
 * The secret that opens an invitation is therefore server-owned state
 * (`invite_tokens`, hashed at rest) and appears in no payload in this file. The
 * ledger records that an invitation was made, to what address, by whom; it does
 * not record the secret that opens it. See `apps/server/src/routes/invites.ts`.
 *
 * ## Schemas here, registrations in `../vocabulary.ts`
 *
 * The house precedent (`membership.ts`, `visibility.ts`): shapes live beside the
 * concept they describe, `domainRegistry.register` calls live in the registry
 * module, so the registry is complete for every importer of `parseEvent` rather
 * than only for importers of the barrel.
 *
 * The plan text sketched hand-written `parseInviteSent(payload: unknown)`
 * functions throwing `Error`. Those are NOT what this repo runs: every other
 * payload in the product is a zod schema bound to a `type@version` in the
 * registry, and `parseEvent` reports a structured `invalid-payload` rather than
 * an exception. A second, parallel parse mechanism for one event family would
 * mean the client replica and the server disagree about what a well-formed
 * invite claim is. So the two refusal SENTENCES the plan pins are preserved
 * verbatim as zod messages, and the mechanism is the one the rest of the product
 * already uses.
 */

/**
 * `owner` is refused BY OMISSION from this enum, and deliberately: an invitation
 * cannot make somebody the owner of a workspace they have not yet entered.
 * Ownership arrives exactly once, at founding, through the bootstrap sequence.
 *
 * Spelled as its own enum rather than reusing `workspaceRoleSchema` for that
 * reason — reuse would admit `owner` and the refusal would have to be bolted on
 * afterwards as a `.refine`, where a later editor "simplifying" the schema drops
 * it without noticing what left with it.
 */
export const INVITE_ROLES = ['admin', 'member', 'guest'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

const inviteRoleSchema = z.enum(INVITE_ROLES, {
  errorMap: () => ({
    message: "requires role 'admin'|'member'|'guest' — an invite cannot confer ownership",
  }),
});

export const INVITE_CHANNELS = ['email', 'phone'] as const;
export type InviteChannel = (typeof INVITE_CHANNELS)[number];

const inviteChannelSchema = z.enum(INVITE_CHANNELS, {
  errorMap: () => ({ message: "requires channel 'email' or 'phone'" }),
});

/**
 * An address is a CLAIM about where to reach somebody, not an identity.
 *
 * It is `.min(1)` plus the blank refusal — the same shape `displayName` in
 * `membership.ts` uses, and for the same reason: `'   '` names nothing while
 * looking like an address everywhere it is displayed. It is deliberately NOT
 * validated as an email or a phone number. The server does not know which
 * spellings a real inbox or a real handset accepts, and a regex that refuses a
 * deliverable address would make the product wrong about a person's own contact
 * details. Delivery is the thing that finds out, and it is Plan 11's errand.
 *
 * It is also NOT normalised (no lowercasing, no trimming). The ledger stores the
 * claim as it was made; quietly rewriting an admin's typed address would put
 * words in their mouth, and the same argument settled `displayName`.
 */
const inviteAddress = z
  .string()
  .min(1)
  .refine((value) => value.trim() !== '', 'must not be blank — an address of only spaces reaches nobody');

/**
 * `projectIds` on a GUEST invite is refused, with the remedy named.
 *
 * The 2026-08-27 membership collapse removed inert project associations: a guest
 * reaches work through `visibility.set` explicit lists and through nothing else,
 * so a project association on a guest invite would promise something membership
 * no longer means. This refusal keeps that removed idea from growing back at the
 * front door — which is exactly where it would grow back, because the invite
 * form is the one place a person picks a role and a set of projects in one
 * gesture.
 *
 * A `superRefine` on the object rather than a per-field check, because the rule
 * is about the PAIR: neither `role` alone nor `projectIds` alone is wrong.
 */
export const inviteSentPayload = z
  .object({
    inviteId: ulidString,
    address: inviteAddress,
    channel: inviteChannelSchema,
    role: inviteRoleSchema,
    projectIds: z.array(ulidString).optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.role === 'guest' && payload.projectIds !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectIds'],
        message: 'cannot put a guest on a project; share tickets with visibility.set instead',
      });
    }
  });
export type InviteSentPayload = z.infer<typeof inviteSentPayload>;

/**
 * The binding: this invitation, that account.
 *
 * A client can never submit one — `checkRolePermission` refuses `invite.accepted`
 * from every client envelope-origin, because acceptance without the token would
 * let anyone who can read an invite id bind it to themselves. The server appends
 * it through the internal door when somebody proves they hold the link.
 */
export const inviteAcceptedPayload = z.object({ inviteId: ulidString, userId: ulidString }).strict();
export type InviteAcceptedPayload = z.infer<typeof inviteAcceptedPayload>;

/** Revocation is a claim like everything else: attributed, dated, in the ledger. */
export const inviteRevokedPayload = z.object({ inviteId: ulidString }).strict();
export type InviteRevokedPayload = z.infer<typeof inviteRevokedPayload>;
