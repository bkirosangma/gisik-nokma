import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { VISIBILITY_MODES, visibilitySetPayload } from '../../src/events/visibility.js';
import { newUlid } from '../../src/ids.js';
import { domainRegistry } from '../../src/vocabulary.js';

function rejectionIssues<Input, Output>(
  result: z.SafeParseReturnType<Input, Output>,
): Array<{ path: (string | number)[]; message: string }> {
  if (result.success) {
    throw new Error('expected safeParse to fail, but it succeeded');
  }
  return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

describe('visibilitySetPayload', () => {
  it('accepts workspace, project, and inherit modes without userIds', () => {
    for (const mode of ['workspace', 'project', 'inherit'] as const) {
      const ticketId = newUlid();
      expect(visibilitySetPayload.parse({ ticketId, mode })).toEqual({ ticketId, mode });
    }
  });

  it('accepts explicit mode with a non-empty userIds list', () => {
    const ticketId = newUlid();
    const userIds = [newUlid(), newUlid()];
    expect(visibilitySetPayload.parse({ ticketId, mode: 'explicit', userIds })).toEqual({
      ticketId,
      mode: 'explicit',
      userIds,
    });
  });

  it('planted defect: refuses explicit mode without userIds — an audience of nobody is not a claim', () => {
    const missing = visibilitySetPayload.safeParse({ ticketId: newUlid(), mode: 'explicit' });
    expect(rejectionIssues(missing)).toContainEqual({
      path: ['userIds'],
      message: 'visibility.set with explicit mode requires a non-empty userIds list',
    });
    const empty = visibilitySetPayload.safeParse({ ticketId: newUlid(), mode: 'explicit', userIds: [] });
    expect(rejectionIssues(empty)).toContainEqual({
      path: ['userIds'],
      message: 'visibility.set with explicit mode requires a non-empty userIds list',
    });
  });

  it('planted defect: refuses userIds on non-explicit modes — a list nobody reads would be a silent lie', () => {
    // Named per mode, so the refusal says which claim was contradicted rather
    // than restating the rule.
    for (const mode of ['workspace', 'project', 'inherit'] as const) {
      const result = visibilitySetPayload.safeParse({ ticketId: newUlid(), mode, userIds: [newUlid()] });
      expect(rejectionIssues(result)).toContainEqual({
        path: ['userIds'],
        message: `visibility.set with mode '${mode}' must not carry userIds`,
      });
    }
  });

  it('planted defect: refuses an unknown mode', () => {
    const result = visibilitySetPayload.safeParse({ ticketId: newUlid(), mode: 'secret' });
    expect(rejectionIssues(result)).toContainEqual({
      path: ['mode'],
      message: "Invalid enum value. Expected 'workspace' | 'project' | 'explicit' | 'inherit', received 'secret'",
    });
  });

  it('planted defect: refuses a missing ticketId', () => {
    expect(rejectionIssues(visibilitySetPayload.safeParse({ mode: 'project' }))).toContainEqual({
      path: ['ticketId'],
      message: 'Required',
    });
  });

  it('planted defect: refuses a readable placeholder ticketId or userId — the door speaks ULIDs', () => {
    expect(rejectionIssues(visibilitySetPayload.safeParse({ ticketId: 'tkt_1', mode: 'project' }))).toContainEqual({
      path: ['ticketId'],
      message: 'must be a ULID',
    });
    const badUser = visibilitySetPayload.safeParse({
      ticketId: newUlid(),
      mode: 'explicit',
      userIds: [newUlid(), 'usr_2'],
    });
    expect(rejectionIssues(badUser)).toContainEqual({ path: ['userIds', 1], message: 'must be a ULID' });
  });

  it('planted defect: refuses an unknown key — the payload is strict', () => {
    const result = visibilitySetPayload.safeParse({ ticketId: newUlid(), mode: 'project', scope: 'workspace' });
    expect(rejectionIssues(result)).toContainEqual({
      path: [],
      message: "Unrecognized key(s) in object: 'scope'",
    });
  });

  it('lists exactly the four modes', () => {
    expect([...VISIBILITY_MODES]).toEqual(['workspace', 'project', 'explicit', 'inherit']);
  });
});

describe('registration in domainRegistry', () => {
  it('binds visibility.set v1 to the TICKET whose audience it changes', () => {
    // Filed against the ticket, not against a visibility entity of its own: a
    // claim on that ticket's history, exactly as comment.added is.
    const registration = domainRegistry.get('visibility.set', 1);
    expect(registration).toBeDefined();
    expect(registration?.entityKind).toBe('ticket');
    expect(registration?.payloadSchema).toBe(visibilitySetPayload);
  });
});
