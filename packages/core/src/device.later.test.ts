/**
 * Forgetting a device once the catalogue has grown past its first level (everything in step): the
 * caches it kept at the levels before go with this level's, so nothing of a workspace it is no
 * longer in is left on a shared browser or the next person's phone (SEC-32). The catalogue's level
 * is a made-up later one, swapped in for the whole file, which is why this is a file of its own.
 */

import { describe, expect, it, vi } from "vitest";
import { cacheKey, earlierCacheKeys } from "./cache.js";
import { type Device, type DeviceStorage, forgetDevice } from "./device.js";

vi.mock("@chipschat/protocol", async (importOriginal) => {
  const real = await importOriginal<typeof import("@chipschat/protocol")>();
  return { ...real, CATALOGUE_LEVEL: 3 };
});

/** A map standing in for IndexedDB. */
function memory(initial: Record<string, unknown>): DeviceStorage {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    entries: async () => [...data.entries()],
    put: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

const work: Device = {
  deviceId: "dev_2",
  participantId: "usr_1",
  workspaceId: "ws_2",
  displayName: "Arjun",
  privateKey: {} as CryptoKey,
  serverUrl: "https://chips.example",
};

describe("forgetting a device at a later catalogue level", () => {
  it("deletes this level's cache and each one kept at a level before it", async () => {
    const storage = memory({ dev_2: work, current: { pointer: "dev_2" } });
    const deleted: string[] = [];
    await forgetDevice("dev_2", storage, { delete: async (key) => void deleted.push(key) });
    expect(deleted).toEqual([
      "ws_2@chips.example~L3",
      "ws_2@chips.example",
      "ws_2@chips.example~L2",
    ]);
    expect(deleted).toEqual([cacheKey(work), ...earlierCacheKeys(work)]);
  });

  it("goes on to the next when one of them will not go", async () => {
    const storage = memory({ dev_2: work, current: { pointer: "dev_2" } });
    const asked: string[] = [];
    const stubborn = {
      delete: async (key: string) => {
        asked.push(key);
        if (key === "ws_2@chips.example") throw new Error("blocked");
      },
    };
    expect(await forgetDevice("dev_2", storage, stubborn)).toBeUndefined();
    expect(asked).toHaveLength(3);
  });
});
