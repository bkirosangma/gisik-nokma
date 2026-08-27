import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEventTypeRegistry } from '../src/registry.js';

describe('event-type registry', () => {
  it('registers and retrieves a type at an exact version', () => {
    const registry = createEventTypeRegistry();
    const registration = { type: 'test.happened', version: 1, payloadSchema: z.object({}) };
    registry.register(registration);
    expect(registry.get('test.happened', 1)).toBe(registration);
    expect(registry.hasType('test.happened')).toBe(true);
  });

  it('returns undefined for an unregistered version of a known type', () => {
    const registry = createEventTypeRegistry();
    registry.register({ type: 'test.happened', version: 1, payloadSchema: z.object({}) });
    expect(registry.get('test.happened', 2)).toBeUndefined();
  });

  it('planted defect: refuses double registration of the same type@version', () => {
    const registry = createEventTypeRegistry();
    registry.register({ type: 'test.happened', version: 1, payloadSchema: z.object({}) });
    expect(() =>
      registry.register({ type: 'test.happened', version: 1, payloadSchema: z.object({}) }),
    ).toThrowError('event type already registered: test.happened@1');
  });
});
