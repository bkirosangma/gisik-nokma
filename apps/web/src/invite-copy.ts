/** The invite form's strings added by the access plan (Task 8). Pinned literally once in `members-page.test.tsx`. */
export const SEND_INVITATION = 'Send invitation';
export const CREATE_INVITE_LINK = 'Create invite link';
/** The submit button while the mint request is in flight (fix-now batch S3). */
export const SENDING_INVITATION = 'Sending…';
export const CREATING_INVITE_LINK = 'Creating…';
export const INVITE_EMAIL_FAILED = 'The email could not be sent — copy the link below and send it yourself.';
export const inviteEmailedLine = (address: string): string => `Invitation emailed to ${address}.`;
export const hasAccountLine = (name: string): string => `${name} already has an account.`;
export const alreadyMemberLine = (name: string): string => `${name} is already in this workspace.`;
