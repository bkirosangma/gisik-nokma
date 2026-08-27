import type { z } from 'zod';

export type EventTypeRegistration = {
  type: string;              // e.g. 'workspace.created'
  version: number;           // e.g. 1
  payloadSchema: z.ZodTypeAny;
};

export type EventTypeRegistry = {
  register(registration: EventTypeRegistration): void;
  get(type: string, version: number): EventTypeRegistration | undefined;
  hasType(type: string): boolean;
};

export function createEventTypeRegistry(): EventTypeRegistry {
  const byKey = new Map<string, EventTypeRegistration>();
  const types = new Set<string>();
  return {
    register(registration) {
      const key = `${registration.type}@${registration.version}`;
      if (byKey.has(key)) {
        throw new Error(`event type already registered: ${key}`);
      }
      byKey.set(key, registration);
      types.add(registration.type);
    },
    get(type, version) {
      return byKey.get(`${type}@${version}`);
    },
    hasType(type) {
      return types.has(type);
    },
  };
}
