import { z } from 'zod';
import { DRAFT_NO_OUTSIDERS_REASON, DRAFT_NO_OUTSIDERS_RULE, type SubmittedEvent } from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { confirmOrPreview, type Preview } from './preview.js';
import { postJson, postOutsider, rateLimitedError, resultError, submitOne } from './submit.js';

/**
 * Assigning by email address (MCP sweep 2 §7): the app's own flow (find, show, assign) in two stateless calls. Call 1 looks the
 * address up and answers a preview that names the person; call 2 repeats the call with `confirm_assignee` set to that person's
 * userId, looks the address up AGAIN (nothing is remembered between calls, `directory.ts:10-12`) and writes only if the same
 * userId still comes back. The userId, not the email, is the confirmation: the caller already holds the email, so echoing it proves
 * nothing, while the id exists only in the preview.
 */
export type LookedUpPerson = { userId: string; name: string; email: string; inWorkspace: boolean };
const personSchema = z.object({ userId: z.string().min(1), name: z.string(), email: z.string(), inWorkspace: z.boolean() });

/** The app's two product sentences, COPIED: `packages/app-core/src/people/copy.ts:11-12` and `:18-20`. 14.651 compares them with the app's own exports. */
export const NO_USER_WITH_THAT_EMAIL = 'No user with that email.';
export const THEY_WILL_JOIN_AS_GUEST = 'They will join this workspace as a guest and see only this ticket.';
export const alreadyInThisWorkspace = (name: string): string => `${name} is already in this workspace.`;
/** Owner ruling 11c: said in so many words, and the capitals are in the text so the effect cannot be read past. */
export const willBeAddedAsGuest = (name: string): string => `${name} is not in this workspace and WILL BE ADDED AS A GUEST.`;
export const NO_USER_HINT = 'Someone you can already see in this workspace is assigned with assigneeId (find their userId with list_members).';
const WORKSPACE_GONE = 'workspace not found or not visible to you';

/** The two arguments `assign_ticket` and `create_ticket` share (S2-9: `assignee_email` as the owner wrote it; `confirm_assignee` follows `confirm_name`). */
export const EMAIL_FIELDS = { assignee_email: z.string().min(1).optional(), confirm_assignee: z.string().optional() };

export function guestSentence(person: LookedUpPerson): string {
  return person.inWorkspace ? alreadyInThisWorkspace(person.name) : `${willBeAddedAsGuest(person.name)} ${THEY_WILL_JOIN_AS_GUEST}`;
}

/** `POST …/people-lookup { email }` (`routes/people.ts:126-149`): the one verified account with exactly that address, or `null`. */
async function lookUp(session: Session, workspaceId: string, email: string): Promise<LookedUpPerson | null> {
  try {
    const body = (await postJson(session, `/v1/workspaces/${encodeURIComponent(workspaceId)}/people-lookup`, { email })) as { user?: unknown } | null;
    return body?.user == null ? null : personSchema.parse(body.user);
  } catch (error) {
    if (error instanceof HttpError) {
      const limited = rateLimitedError(error, 'Looking people up by email');
      if (limited !== null) throw limited;
      if (error.status === 404) throw new Error(WORKSPACE_GONE); // a guest, a non-member and a missing workspace are told the same thing
    }
    throw error;
  }
}

export type Resolved = { preview: Preview & { person: LookedUpPerson; joinsAsGuest: boolean } } | { person: LookedUpPerson };

/**
 * Look the address up and either answer the preview of whoever it resolves to NOW, or (when `confirm` is exactly that person's userId)
 * hand the person back to be acted on. `headline` is the tool's own first sentence, built only if a preview is needed.
 *
 * `draft` (create_ticket's `draft: true`, drafts T7): a draft takes nobody from outside (R8), so for an outsider the preview states
 * the server's own refusal, in its rule and sentence (`@gisik-nokma/domain`, one definition), instead of promising a guest that the
 * confirmation would then be refused. Call 2 still goes to the server, which refuses it as before (planner ruling 2026-10-04).
 */
export async function resolveAssignee(
  session: Session,
  workspaceId: string,
  email: string,
  confirm: string | undefined,
  headline: (person: LookedUpPerson) => Promise<string>,
  draft = false,
): Promise<Resolved> {
  const person = await lookUp(session, workspaceId, email);
  if (person === null) throw new Error(`${NO_USER_WITH_THAT_EMAIL} ${NO_USER_HINT}`);
  const refusedAsOutsider = draft && !person.inWorkspace;
  const effect = refusedAsOutsider ? `refused by ${DRAFT_NO_OUTSIDERS_RULE}: ${DRAFT_NO_OUTSIDERS_REASON}` : guestSentence(person);
  const preview = await confirmOrPreview(person.userId, confirm, async () => ({ sentence: `${await headline(person)} ${effect}` }), 'confirm_assignee');
  if (preview !== null) return { preview: { ...preview, person, joinsAsGuest: !person.inWorkspace && !refusedAsOutsider } };
  return { person };
}

/**
 * The claim, through the door that fits the person: an ordinary event for someone in the workspace, `assign-outsider` for someone
 * outside (it grants a guest membership, submits the caller's own claim, and takes the grant back if the claim is refused,
 * `routes/people.ts:151-245`). A refusal is the server's words either way.
 */
export async function submitForAssignee(session: Session, workspaceId: string, person: LookedUpPerson, event: SubmittedEvent): Promise<unknown> {
  if (person.inWorkspace) return submitOne(session, event);
  try {
    const result = await postOutsider(session, workspaceId, person.userId, event);
    const failure = resultError(result);
    if (failure !== null) throw failure;
    return result;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(WORKSPACE_GONE);
    throw error;
  }
}
