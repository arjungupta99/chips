/**
 * First names held for the agents of a room asked from the + (ADR 0150).
 *
 * A room asked of a harness holds a first name for the agent the harness will make there on the
 * person's first message, and the room calls the waiting harness by it: "Milo and Theo are here
 * and wait for your first message". The agent takes the name when it takes the harness's place, so
 * nothing on screen changes name. The device proposes the names as it makes the room, so the room
 * is drawn with them at once; the server keeps them when nobody has them.
 *
 * A room's screens read names through `roomDirectory`, the workspace's directory with the room's
 * held names over its waiting harnesses, so every name the room draws, its @ handles among them,
 * is the held one without each place asking.
 */

import { clashKey, pickAgentName } from "@chipschat/protocol";
import { type Directory, nameOf, type Participant, participantKind } from "./events.js";
import type { Space } from "./model/index.js";
import type { Snapshot } from "./store.js";

const overlays = new WeakMap<Directory, WeakMap<Space, Directory>>();
const roomSnapshots = new WeakMap<Snapshot, Map<string, Snapshot>>();

/**
 * The snapshot as a room's screens read it: its directory the room's (`roomDirectory`). The same
 * snapshot for a room that holds no names, and the same copy for as long as the snapshot is the
 * same, so what is memoised on it holds.
 */
export function roomSnapshot(snapshot: Snapshot, spaceId: string): Snapshot {
  const space = snapshot.model.spaces.find((each) => each.id === spaceId);
  const directory = roomDirectory(space, snapshot.directory);
  if (directory === snapshot.directory) return snapshot;
  let byRoom = roomSnapshots.get(snapshot);
  if (byRoom === undefined) {
    byRoom = new Map();
    roomSnapshots.set(snapshot, byRoom);
  }
  const known = byRoom.get(spaceId);
  if (known !== undefined) return known;
  const room = { ...snapshot, directory };
  byRoom.set(spaceId, room);
  return room;
}

/**
 * The directory as a room reads it: each harness waiting there under the first name held for its
 * agent, with its own name kept as `harnessName`. The same directory for a room that holds none,
 * and the same overlay for as long as the room and the directory are the same, so a memo on it
 * holds.
 */
export function roomDirectory(space: Space | undefined, directory: Directory): Directory {
  const held = space?.held;
  if (space === undefined || held === undefined || Object.keys(held).length === 0) {
    return directory;
  }
  let byRoom = overlays.get(directory);
  if (byRoom === undefined) {
    byRoom = new WeakMap();
    overlays.set(directory, byRoom);
  }
  const known = byRoom.get(space);
  if (known !== undefined) return known;
  const over: Record<string, Participant> = { ...directory };
  for (const [harnessId, name] of Object.entries(held)) {
    const own = directory[harnessId];
    over[harnessId] = {
      // A harness the directory does not have yet is read by its id, as any face is.
      ...(own ?? { id: harnessId, kind: participantKind(directory, harnessId) }),
      displayName: name,
      harnessName: own?.displayName ?? nameOf(directory, harnessId),
    };
  }
  byRoom.set(space, over);
  return over;
}

/**
 * The harness behind a name in a room, to say under it: a waiting harness's own name, or an
 * agent's harness's. Nothing for a person, or for a name that already says it ("OpenClaw 3").
 */
export function harnessUnder(directory: Directory, id: string): string | undefined {
  const entry = directory[id];
  if (entry === undefined || entry.kind === "person") return undefined;
  const harness =
    entry.harnessName ??
    (entry.harnessId === undefined ? undefined : directory[entry.harnessId]?.displayName);
  if (harness === undefined) return undefined;
  return clashKey(entry.displayName).startsWith(clashKey(harness)) ? undefined : harness;
}

/**
 * The first names a device proposes for the harnesses a new room is asked of, in order (ADR
 * 0150): none anybody in the workspace has, nor any room holds, and each a letter apart from the
 * names already picked for the room. `beside` is who else is in it: the person making it.
 */
export function heldNamesFor(
  harnessIds: readonly string[],
  directory: Directory,
  spaces: readonly Space[],
  beside: readonly string[] = [],
  random: () => number = Math.random,
): Record<string, string> {
  const taken = takenIn(directory, spaces);
  const names: Record<string, string> = {};
  const here = [...beside];
  for (const harnessId of harnessIds) {
    const name = pickAgentName(taken, here, random);
    names[harnessId] = name;
    taken.add(clashKey(name));
    here.push(name);
  }
  return names;
}

/**
 * The names nobody may be given, as clash keys, as the server counts them (ADR 0091, ADR 0150):
 * the people's, the active agents', and the names open rooms hold.
 */
function takenIn(directory: Directory, spaces: readonly Space[]): Set<string> {
  const counts = (each: Participant) =>
    each.removedAt === undefined &&
    (each.kind === "person" || (each.kind === "agent" && each.archived !== true));
  const taken = new Set(
    Object.values(directory)
      .filter(counts)
      .map((each) => clashKey(each.displayName)),
  );
  const held = spaces
    .filter((space) => space.state === "open")
    .flatMap((space) => Object.values(space.held ?? {}));
  for (const name of held) taken.add(clashKey(name));
  return taken;
}
