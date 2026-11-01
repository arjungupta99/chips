/** What a new workspace is called (ADR 0194): after the person it is made for. */

import { describe, expect, it } from "vitest";
import { firstWorkspaceName } from "./first-run.js";

describe("firstWorkspaceName", () => {
  it("names the workspace after its first person", () => {
    expect(firstWorkspaceName("Arjun")).toBe("Arjun's workspace");
    expect(firstWorkspaceName("  Ada ")).toBe("Ada's workspace");
  });

  it("is My workspace when there is nobody's name to take", () => {
    expect(firstWorkspaceName("You")).toBe("My workspace");
    expect(firstWorkspaceName("   ")).toBe("My workspace");
  });

  it("is My workspace when the name is too long for the hello to carry with it", () => {
    expect(firstWorkspaceName("x".repeat(108))).toBe(`${"x".repeat(108)}'s workspace`);
    expect(firstWorkspaceName("x".repeat(109))).toBe("My workspace");
  });
});
