/**
 * What is new in a workspace behind the one in front (ADR 0197): the newest thing waiting there,
 * once more waits than when it was last read. The banner says it.
 *
 * A store's rooms come in after its hello, and what waits rises while they do: that rise is what
 * was already there, not news. A workspace's first reading is taken once every room the hello
 * listed is in (`awaiting` 0), and for a few seconds after that each reading is the new first one,
 * while older pages of a room still arrive. Only a rise after that is said.
 *
 * A workspace brought forward is read there, so its reading goes, and it is read afresh once it is
 * behind again. Its store is the one it had in front (ADR 0197's addendum, 19 October 2026), loaded
 * already, so nothing else would start it again: what came while it was in front, and was read
 * there, would be said as news the moment another workspace took its place.
 */

import { attention, type Device, type Snapshot, workspaceLabel } from "@chipschat/core";
import type { BackgroundWorkspaces } from "../store/workspaces";

/** How long after its rooms are in a workspace's count is still taken as loading. */
export const SETTLE_MS = 3000;

export interface News {
  readonly deviceId: string;
  readonly workspace: string;
  readonly words: string;
  readonly spaceId: string;
}

/** What was read of each workspace: its count, and when its rooms were all in. */
export type Readings = Record<string, { count: number; readAt: number }>;

/** The newest thing waiting in a snapshot, as the banner says it. */
function newestIn(snapshot: Snapshot, device: Device): News | undefined {
  const newest = attention(snapshot.model.needsYou, snapshot.readState).sort(
    (a, b) => b.seq - a.seq,
  )[0];
  if (newest === undefined) return undefined;
  return {
    deviceId: device.deviceId,
    workspace: snapshot.workspaceName ?? workspaceLabel(device),
    words: newest.title,
    spaceId: newest.spaceId,
  };
}

/**
 * The newest thing waiting in a workspace behind, where more waits than at its last reading;
 * nothing while it loads. `readings` is kept between calls and updated here.
 */
export function whatIsNew(
  others: BackgroundWorkspaces,
  devices: readonly Device[],
  readings: Readings,
  now: number,
): News | undefined {
  let fresh: News | undefined;
  for (const deviceId of Object.keys(readings)) {
    if (others.needs[deviceId] === undefined) delete readings[deviceId];
  }
  for (const [deviceId, count] of Object.entries(others.needs)) {
    const snapshot = others.stores.get(deviceId)?.getSnapshot();
    const device = devices.find((each) => each.deviceId === deviceId);
    if (snapshot === undefined || device === undefined) continue;
    if (rose(snapshot, readings, deviceId, count, now)) {
      fresh = newestIn(snapshot, device) ?? fresh;
    }
  }
  return fresh;
}

/** Whether more waits in a workspace than at its last reading, once it has loaded; reads it. */
function rose(
  snapshot: Snapshot,
  readings: Readings,
  deviceId: string,
  count: number,
  now: number,
): boolean {
  if (snapshot.awaiting !== 0) {
    delete readings[deviceId];
    return false;
  }
  const was = readings[deviceId];
  readings[deviceId] = { count, readAt: was?.readAt ?? now };
  return was !== undefined && now - was.readAt >= SETTLE_MS && count > was.count;
}
