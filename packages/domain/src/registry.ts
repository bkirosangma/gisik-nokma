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
   *
   * ## One kind, or an explicit LIST of them — never a bare omission
   *
   * Widened from a single kind by the notes series (Plan 1 of 6, spec §3.2),
   * for exactly ONE type: `comment.added`. A comment on a ticket and a comment
   * on a note are the same claim about different subjects, so the registry
   * names both rather than the type being re-registered (the registry refuses a
   * second registration of the same `type@version`, so a second `comment.added`
   * is not even available) or its binding being dropped.
   *
   * **`undefined` is still not the same statement as a list.** A type that
   * omits `entityKind` is admitted against ANY kind — including kinds that do
   * not exist yet — which is what the `'a registration that declares no entity
   * kind still admits any kind'` case pins. A type that names kinds is refused
   * against every other one. `comment.added` names `['ticket', 'note']` and is
   * therefore still refused against, say, a `project`; the difference is the
   * whole reason this is a union and not a deletion.
   */
  entityKind?: EventEnvelope['entity']['kind'] | readonly EventEnvelope['entity']['kind'][];
};

export type EventTypeRegistry = {
  register(registration: EventTypeRegistration): void;
  get(type: string, version: number): EventTypeRegistration | undefined;
  hasType(type: string): boolean;
  /** Every registration, in registration order: what a census iterates instead of retyping a list. */
  registrations(): readonly EventTypeRegistration[];
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
    registrations() {
      return [...byKey.values()];
    },
  };
}
