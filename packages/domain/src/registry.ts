import type { z } from 'zod';
import type { EventEnvelope } from './envelope.js';

export type EventTypeRegistration = {
  type: string;              // e.g. 'workspace.created'
  version: number;           // e.g. 1
  payloadSchema: z.ZodTypeAny;
  /**
   * The entity kind this type is about, when it is only ever about one:
   * 'workspace.created' happens to a workspace and to nothing else. Declared
   * here rather than re-checked in each rule module so the binding is stated
   * once, beside the type it belongs to, and enforced for every event type at
   * the door (parseEvent) — coordination doc §11. Optional: a type that
   * genuinely spans kinds simply omits it, and then any kind is admitted.
   */
  entityKind?: EventEnvelope['entity']['kind'];
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
