/** The invite form's strings added by the access plan (Task 8). Pinned literally once in `members-page.test.tsx`. */
export const SEND_INVITATION = 'Send invitation';
export const CREATE_INVITE_LINK = 'Create invite link';
export const INVITE_EMAIL_FAILED = 'The email could not be sent — copy the link below and send it yourself.';
export const inviteEmailedLine = (address: string): string => `Invitation emailed to ${address}.`;
export const hasAccountLine = (name: string): string => `${name} already has an account.`;
export const alreadyMemberLine = (name: string): string => `${name} is already in this workspace.`;
