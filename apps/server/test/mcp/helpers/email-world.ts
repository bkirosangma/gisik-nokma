import { expect } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../../src/auth/otp-sender.js';
import type { BuildTestAppOverrides } from '../../helpers/app.js';
import type { TestDatabase } from '../../helpers/db.js';
import { buildOAuthApp, hostedToken } from '../../helpers/oauth.js';
import { signInWithEmail, signInWithPhone } from '../../helpers/session.js';
import { event, grantRole, mustCommit, type Actor } from './sweep2.js';

/** Anyone in an email world: `token` is a HOSTED token (for `callTool`), `sessionToken` the app's own (for `mustCommit`). */
export type Person = Actor & { token: string; email?: string };
export type EmailWorld = {
  app: FastifyInstance; db: TestDatabase; otp: LogOtpSender; magic: LogMagicLinkSender;
  owner: Person; member: Person; guest: Person; stranger: Person;
  workspaceId: string; workspaceName: string; projectId: string; projectName: string;
  ticketId: string; ticketKey: string; secondTicketId: string;
  /** A verified email account in no workspace, made the product's way (the magic link). */
  outsider(email: string): Promise<Person>;
};

/**
 * MCP sweep 2 T7: an owner, a member (on the project), a guest, a stranger; one project, two tickets; and the means to make
 * verified email accounts. Copied from `buildDoorWorld` (`door-matrix.ts:37-75`), which cannot return the app's magic-link
 * sender. `tail` is unique per test: the database is shared by a file and a repeated phone number signs the SAME person in.
 */
export async function buildEmailWorld(db: TestDatabase, tail: string, overrides: BuildTestAppOverrides = {}): Promise<EmailWorld> {
  const { app, otp, magic } = buildOAuthApp(db, overrides);
  await app.ready();
  const person = async (u: { userId: string; token: string }, email?: string): Promise<Person> =>
    ({ userId: u.userId, sessionToken: u.token, token: await hostedToken(app, db.pool, u.userId), ...(email === undefined ? {} : { email }) });
  const phone = (n: number) => `+9111000${tail}${n}`;
  const owner = await person(await signInWithPhone(app, otp, phone(1)));
  const member = await person(await signInWithPhone(app, otp, phone(2)));
  const guest = await person(await signInWithPhone(app, otp, phone(3)));
  const stranger = await person(await signInWithPhone(app, otp, phone(4)));
  const workspaceName = 'Email Co';
  const projectName = 'Counter';
  const found = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${owner.sessionToken}` }, payload: { name: workspaceName } });
  const workspaceId = (found.json() as { workspaceId: string }).workspaceId;
  const projectId = newUlid();
  const ticketId = newUlid();
  const secondTicketId = newUlid();
  const ev = (entity: { kind: 'project' | 'ticket' | 'membership'; id: string }, type: string, payload: unknown) => event(workspaceId, owner, entity, type, payload);
  await mustCommit(app, owner, [
    ev({ kind: 'project', id: projectId }, 'project.created', { name: projectName }),
    ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: owner.userId, projectAdmin: true }),
    ev({ kind: 'membership', id: `${workspaceId}:${member.userId}` }, 'membership.granted', { userId: member.userId, role: 'member' }),
    ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: member.userId, projectAdmin: false }),
    ev({ kind: 'ticket', id: ticketId }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: 'Fix login', start: 'backlog' }),
    ev({ kind: 'ticket', id: secondTicketId }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: 'Second ticket', start: 'backlog' }),
  ]);
  await grantRole(app, owner, workspaceId, guest.userId, 'guest');
  const ticketKey = (await app.inject({ method: 'GET', url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}`, headers: { authorization: `Bearer ${owner.sessionToken}` } })).json<{ key: string }>().key;
  expect(ticketKey).toMatch(/-\d+$/);
  return {
    app, db, otp, magic, owner, member, guest, stranger, workspaceId, workspaceName, projectId, projectName, ticketId, ticketKey, secondTicketId,
    outsider: async (email) => person(await signInWithEmail(app, magic, email), email),
  };
}
