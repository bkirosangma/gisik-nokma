import { describe, expect, it } from 'vitest';
import { domainRegistry, projectUpdatedPayload } from '../src/index.js';

describe('13.1600 project.updated payload', () => {
  it('13.1600 accepts name / description / both, refuses empty, unknown, blank, overlong', () => {
    expect(projectUpdatedPayload.safeParse({ name: 'Store ops' }).success).toBe(true); // control
    expect(projectUpdatedPayload.safeParse({ description: 'Daily shop work' }).success).toBe(true);
    expect(projectUpdatedPayload.safeParse({ name: 'A', description: null }).success).toBe(true);
    expect(projectUpdatedPayload.safeParse({ description: null }).success).toBe(true); // 13.1602: null alone is a real edit
    expect(projectUpdatedPayload.safeParse({}).success).toBe(false);
    expect(projectUpdatedPayload.safeParse({ name: 'A', colour: 'red' }).success).toBe(false); // 13.1605: still strict; `prefix` is a real key since 22.002
    expect(projectUpdatedPayload.safeParse({ name: '   ' }).success).toBe(false);
    expect(projectUpdatedPayload.safeParse({ description: 'x'.repeat(501) }).success).toBe(false);
    expect(domainRegistry.get('project.updated', 1)?.entityKind).toBe('project');
  });
});
