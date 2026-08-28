import { z } from 'zod';
import { ulidString } from '../envelope.js';

/**
 * Who may see one ticket (spec §6). Schema only; the registration binding it to
 * `visibility.set` v1 on entity kind `ticket` lives in `../vocabulary.ts`.
 *
 * Four modes, and `inherit` is the default a ticket is born with: it sees
 * whatever its parent decided. `workspace` and `project` widen or narrow to a
 * standing audience; `explicit` names people one by one, and is how a guest
 * reaches any work at all.
 *
 * `payload.ticketId` restates the entity the event is filed against. That
 * duplication is deliberate — it lets a reader of the payload alone know what
 * the claim is about — and Task 9 refuses the two disagreeing, the same way
 * parse-event.ts refuses a membership filed away from its own (workspace, user).
 */
export const VISIBILITY_MODES = ['workspace', 'project', 'explicit', 'inherit'] as const;
export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

/**
 * The two `userIds` refusals are a matched pair, and each is a lie prevented
 * rather than a shape enforced.
 *
 * `explicit` with no one named is an audience of nobody — it reads as a
 * restriction that hides the ticket from everyone including its author, when
 * what the sender almost certainly meant was a list they forgot to attach. And
 * `userIds` on any other mode is a list NOTHING will ever read: the ticket
 * would be visible to a whole workspace or project while the ledger carried a
 * permanent, untrue record of a hand-picked audience.
 */
export const visibilitySetPayload = z
  .object({
    ticketId: ulidString,
    mode: z.enum(VISIBILITY_MODES),
    userIds: z.array(ulidString).optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.mode === 'explicit') {
      if (payload.userIds === undefined || payload.userIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['userIds'],
          message: 'visibility.set with explicit mode requires a non-empty userIds list',
        });
      }
      return;
    }
    if (payload.userIds !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userIds'],
        message: `visibility.set with mode '${payload.mode}' must not carry userIds`,
      });
    }
  });

export type VisibilitySetPayload = z.infer<typeof visibilitySetPayload>;
