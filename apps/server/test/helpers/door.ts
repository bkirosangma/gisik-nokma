import { newUlid, type EntityKind } from '@gisik-nokma/domain';
import type { ReadRole, ReadWorld } from './read-app.js';
import { SCENARIO_NOW } from './read-scenario.js';

export type DoorResult = { status: string; rule?: string; reason?: string };

/** One event through `POST /v1/events` as `role`: the real gate, the real engine, the real projections. */
export async function door(
  read: ReadWorld,
  role: ReadRole,
  kind: EntityKind,
  id: string,
  type: string,
  payload: unknown,
): Promise<DoorResult> {
  const res = await read.app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: read.authOf(role),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId: read.world.workspaceId,
          entity: { kind, id },
          type,
          version: 1,
          payload,
          actorId: read.userIds[role],
          origin: 'web',
          clientTime: SCENARIO_NOW.toISOString(),
        },
      ],
    },
  });
  if (res.statusCode !== 200) throw new Error(`POST /v1/events answered ${res.statusCode}: ${res.body}`);
  const result = (res.json() as { results: DoorResult[] }).results[0];
  // Only the three fields a case compares: the event id differs on every call, so two refusals can be `toEqual`.
  return { status: result?.status ?? 'missing', rule: result?.rule, reason: result?.reason };
}

/** Real magic bytes: sixteen bytes of a PNG header are enough for the server's sniffer. */
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

/** `POST /v1/attachments` naming `ticketId`, as `role`. */
export function uploadFile(read: ReadWorld, role: ReadRole, ticketId: string, filename = 'photo.png') {
  const boundary = 'gisik-draft-boundary';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="ticketId"\r\n\r\n${ticketId}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return read.app.inject({
    method: 'POST',
    url: '/v1/attachments',
    payload,
    headers: { ...read.authOf(role), 'content-type': `multipart/form-data; boundary=${boundary}` },
  });
}
