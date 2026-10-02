type Room = { reloads: Set<() => void>; timer: ReturnType<typeof setTimeout> | null };
const rooms = new Map<string, Room>();

function roomOf(workspaceId: string): Room {
  let room = rooms.get(workspaceId);
  if (room === undefined) {
    room = { reloads: new Set(), timer: null };
    rooms.set(workspaceId, room);
  }
  return room;
}

/** Register a hook's reload for the workspace's wave. Returns the unsubscribe. */
export function subscribeReloads(workspaceId: string, reload: () => void): () => void {
  const room = roomOf(workspaceId);
  room.reloads.add(reload);
  return () => {
    room.reloads.delete(reload);
    if (room.reloads.size === 0) {
      if (room.timer !== null) clearTimeout(room.timer);
      // Only the room this closure joined: a later room for the same workspace is not ours to drop.
      if (rooms.get(workspaceId) === room) rooms.delete(workspaceId);
    }
  };
}

/** A frame arrived: ONE timer per workspace, restarted by every frame, fires every registered reload once. */
export function scheduleReload(workspaceId: string, debounceMs: number): void {
  const room = rooms.get(workspaceId);
  if (room === undefined) return; // nobody on this workspace is listening
  if (room.timer !== null) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    room.timer = null;
    for (const reload of [...room.reloads]) reload();
  }, debounceMs);
}
