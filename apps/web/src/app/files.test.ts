/**
 * Where a frame loads an HTML page from (ADR 0201): the Mac shell's own door when there is one,
 * the server's otherwise, and the server's again from a shell built before its door.
 */

import type { Device } from "@chipschat/core";
import { PAGE_HEADER_POLICY } from "@chipschat/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Desktop } from "../native.ts";
import { createFileService } from "./files.ts";

const core = vi.hoisted(() => ({
  fetchAttachment: vi.fn(async () => new Blob(["<p>Bronze</p>"], { type: "text/html" })),
  pageUrl: vi.fn(async () => "/v1/pages/tkt_1"),
}));

vi.mock("@chipschat/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chipschat/core")>()),
  fetchAttachment: core.fetchAttachment,
  pageUrl: core.pageUrl,
}));

const device = { deviceId: "dev_1" } as unknown as Device;

afterEach(() => {
  core.fetchAttachment.mockClear();
  core.pageUrl.mockClear();
});

describe("where a page is loaded from", () => {
  it("hands the shell the page's bytes and the policy, and frames the URL it answers", async () => {
    const holdPage = vi.fn(async () => "chips-page://localhost/abc");
    const files = createFileService(device, Promise.resolve({ holdPage } as unknown as Desktop));
    expect(await files.pageUrl("att_1")).toBe("chips-page://localhost/abc");
    expect(core.fetchAttachment).toHaveBeenCalledWith(device, "att_1");
    expect(holdPage).toHaveBeenCalledWith("<p>Bronze</p>", PAGE_HEADER_POLICY);
    expect(core.pageUrl).not.toHaveBeenCalled();
  });

  it("asks the server's door in a browser, with nothing fetched here", async () => {
    const files = createFileService(device, Promise.resolve(undefined));
    expect(await files.pageUrl("att_1")).toBe("/v1/pages/tkt_1");
    expect(core.pageUrl).toHaveBeenCalledWith(device, "att_1");
    expect(core.fetchAttachment).not.toHaveBeenCalled();
  });

  it("falls back to the server's door from a shell built before its own", async () => {
    const holdPage = vi.fn(async () => {
      throw new Error("Command hold_page not found");
    });
    const files = createFileService(device, Promise.resolve({ holdPage } as unknown as Desktop));
    expect(await files.pageUrl("att_1")).toBe("/v1/pages/tkt_1");
    expect(core.pageUrl).toHaveBeenCalledWith(device, "att_1");
  });
});
