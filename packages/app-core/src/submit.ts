import { newSubmittedEvent, type SubmittedEvent } from '@gisik-nokma/domain';

export type EnvelopeSeed = Pick<SubmittedEvent, 'workspaceId' | 'entity' | 'type' | 'payload'> & {
  version?: number;
};

export type MakeSubmitted = (seed: EnvelopeSeed) => SubmittedEvent;

/**
 * Every claim the web client makes leaves through this factory: the signed-in
 * actor, the origin this build speaks for, and a clock the caller can inject.
 *
 * It mints NOTHING itself. The ULID and the `clientTime` stamp come from
 * `newSubmittedEvent` in `@gisik-nokma/domain` — the ONE client-side envelope
 * builder, shared with the desktop client and the offline replica. A second
 * builder here would be a second definition of what a claim is, and the two
 * would be free to drift the moment one grew a field; what this factory adds is
 * only the part that is per-session rather than per-claim, so a view can say
 * what it is claiming without repeating who it is every time.
 *
 * `serverTime` and `seq` are absent by construction, inherited from the domain
 * builder: they are the server's to assign at ingest, and a client that
 * invented them would be asserting facts it does not own.
 */
export function makeSubmittedFactory(deps: {
  actorId: string;
  origin: SubmittedEvent['origin'];
  now?: () => Date;
}): MakeSubmitted {
  return (seed) =>
    newSubmittedEvent({
      workspaceId: seed.workspaceId,
      entity: seed.entity,
      type: seed.type,
      payload: seed.payload,
      version: seed.version,
      actorId: deps.actorId,
      origin: deps.origin,
      now: deps.now,
    });
}
