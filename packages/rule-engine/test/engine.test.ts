import { describe, expect, it, vi } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent, type EngineContext, type Refusal, type Verdict } from '../src/engine.js';

function envelope(): EventEnvelope {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'server',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq: 1,
  };
}

function spyContext(): { ctx: EngineContext; calls: () => number } {
  const getEntityState = vi.fn(async () => null);
  const getChildrenStates = vi.fn(async () => []);
  const getWorkflowDef = vi.fn(async () => null);
  return {
    ctx: { getEntityState, getChildrenStates, getWorkflowDef },
    calls: () =>
      getEntityState.mock.calls.length +
      getChildrenStates.mock.calls.length +
      getWorkflowDef.mock.calls.length,
  };
}

describe('evaluateEvent (Plan 1 pass-through)', () => {
  it('accepts every parsed event', async () => {
    const { ctx } = spyContext();
    await expect(evaluateEvent(envelope(), ctx)).resolves.toEqual({ refused: false });
  });

  it('consults nothing — the pass-through must not fake judgement it does not have', async () => {
    const { ctx, calls } = spyContext();
    await evaluateEvent(envelope(), ctx);
    expect(calls()).toBe(0);
  });

  it('a refusal names its rule and gives a plain-language reason', () => {
    const refusal: Refusal = {
      refused: true,
      rule: 'require-comment',
      reason: 'This transition requires a comment (rule require-comment).',
    };
    const verdict: Verdict = refusal;
    if (verdict.refused) {
      expect(verdict.rule).toBe('require-comment');
      expect(verdict.reason).toContain('require-comment');
    } else {
      expect.unreachable('verdict must be a refusal');
    }
  });
});
