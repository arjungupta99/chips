/** Where a Search tab result opens (ADR 0132, ADR 0133); what it lists is core's (`searchResults.test.ts`). */

import type { SearchHit } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { hitHref } from "./items";

const hit: SearchHit = {
  kind: "message",
  spaceId: "sp_1",
  at: "2026-10-06T10:00:00.000Z",
  snippet: "x",
  lineId: "ln_1",
};

describe("where a hit opens", () => {
  it("is its room at its line, or at its run for a step, or its room when it has neither", () => {
    expect(hitHref(hit)).toBe("/spaces/sp_1?at=line%3Aln_1");
    expect(hitHref({ ...hit, kind: "receipt", lineId: undefined, runId: "run_1" })).toBe(
      "/spaces/sp_1?at=run%3Arun_1",
    );
    expect(hitHref({ ...hit, lineId: undefined })).toBe("/spaces/sp_1");
  });

  it("takes the words searched for to a message, to be marked there (ADR 0133)", () => {
    expect(hitHref(hit, " garage door ")).toBe("/spaces/sp_1?at=line%3Aln_1&words=garage%20door");
    expect(hitHref(hit, "  ")).toBe("/spaces/sp_1?at=line%3Aln_1");
  });

  it("takes none to a voice note, whose words were heard, or to a step's run", () => {
    expect(hitHref({ ...hit, snippetFrom: "transcript" }, "garage")).toBe(
      "/spaces/sp_1?at=line%3Aln_1",
    );
    const step = { ...hit, kind: "receipt" as const, lineId: undefined, runId: "run_1" };
    expect(hitHref(step, "garage")).toBe("/spaces/sp_1?at=run%3Arun_1");
  });
});
