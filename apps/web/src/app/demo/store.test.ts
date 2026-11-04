/**
 * Where the Mac finds a workspace's server again (the stranger review, 4 November 2026): the
 * shell's Bonjour look, this workspace's servers only.
 */

import { describe, expect, it, vi } from "vitest";
import type { Desktop, FoundServer } from "../../native.ts";
import { foundAt } from "./store.ts";

const server = (url: string, workspace?: string): FoundServer => ({
  name: "Studio",
  host: "studio.local",
  port: 4431,
  url,
  workspace,
});

const shell = (discover: Desktop["discover"]) =>
  Promise.resolve({ discover } as unknown as Desktop);

describe("finding a moved server from the Mac", () => {
  it("is the addresses Bonjour finds for this workspace, and no other's", async () => {
    const discover = vi.fn(async () => [
      server("http://10.1.2.3:4431", "ws_home"),
      server("http://10.1.2.9:4431", "ws_other"),
      server("http://10.1.2.4:4431"),
    ]);
    expect(await foundAt("ws_home", shell(discover))).toEqual(["http://10.1.2.3:4431"]);
    expect(discover).toHaveBeenCalledOnce();
  });

  it("is nothing in a browser, or when the look fails", async () => {
    expect(await foundAt("ws_home", Promise.resolve(undefined))).toEqual([]);
    const failing = vi.fn(async (): Promise<FoundServer[]> => {
      throw new Error("no multicast");
    });
    expect(await foundAt("ws_home", shell(failing))).toEqual([]);
    expect(await foundAt("ws_home", Promise.reject(new Error("no shell")))).toEqual([]);
  });
});
