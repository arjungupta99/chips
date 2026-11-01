import { describe, expect, it } from "vitest";
import { serversFrom } from "./found";

describe("serversFrom", () => {
  it("names each by its machine, else by its name without the product's, at its address", () => {
    expect(
      serversFrom([
        {
          name: "Chips on mini",
          host: "192.168.1.20",
          port: 4431,
          machine: "Arjun's Mac mini",
          workspace: "ws_1",
        },
        {
          name: "Chips on vps-fra-1",
          host: "192.168.1.30",
          port: 4431,
          machine: "",
          workspace: "",
        },
      ]),
    ).toEqual([
      { name: "Arjun's Mac mini", url: "http://192.168.1.20:4431", workspaceId: "ws_1" },
      { name: "vps-fra-1", url: "http://192.168.1.30:4431", workspaceId: undefined },
    ]);
  });
});
