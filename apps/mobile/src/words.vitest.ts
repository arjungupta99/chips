/**
 * The sentences a card and a banner say about an ask. They are pinned exactly, because the
 * phone and the desktop must call the same ask the same thing: a push notification saying one
 * thing and the card behind it saying another is the kind of small lie that costs trust in a
 * product whose whole job is telling you what a machine is about to do.
 */

import type { Directory, NeedsYouItem, Snapshot } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import {
  approvalFor,
  askBody,
  askHeading,
  askTitle,
  laneTrail,
  lapseWords,
  questionFor,
} from "./words";

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  har_scout: { id: "har_scout", kind: "harness", displayName: "Scout" },
  har_ledger: { id: "har_ledger", kind: "harness", displayName: "Ledger" },
};

function item(over: Partial<NeedsYouItem> = {}): NeedsYouItem {
  return {
    kind: "approval",
    tier: "decide",
    id: "apr_1",
    spaceId: "sp_1",
    runId: "run_1",
    harnessId: "har_scout",
    title: "Send an email",
    seq: 12,
    ...over,
  };
}

/** A snapshot with one space, one run, and whatever approvals and questions are given. */
function snapshotWith(
  approvals: readonly { approvalId: string; preview?: string; effect?: string }[] = [],
  questions: readonly { askId: string }[] = [],
): Snapshot {
  return {
    model: { spaces: [{ id: "sp_1", runs: [{ approvals, questions }] }] },
    directory: DIRECTORY,
  } as unknown as Snapshot;
}

describe("the words on a card", () => {
  it("finishes the sentence differently for each kind of thing", () => {
    const kinds: ReadonlyArray<[NeedsYouItem["kind"], string]> = [
      ["approval", "Scout asks"],
      ["question", "Scout has a question"],
      ["summary", "Scout finished"],
      ["failure", "Scout stopped"],
      ["checkpoint", "Scout reached a checkpoint"],
    ];
    for (const [kind, said] of kinds) {
      expect(askHeading(item({ kind }), DIRECTORY)).toBe(said);
    }
  });

  it("gives a banner one line, whichever kind it is", () => {
    expect(askTitle(item(), DIRECTORY)).toBe("Scout needs a decision");
  });

  it("puts the preview after the title, and leaves it out when there is none", () => {
    const withPreview = snapshotWith([{ approvalId: "apr_1", preview: "To dana@northwind.com" }]);
    expect(askBody(item(), withPreview)).toBe("Send an email — To dana@northwind.com");
    expect(askBody(item(), snapshotWith([{ approvalId: "apr_1" }]))).toBe("Send an email");
    // An empty preview is not a preview; an em dash with nothing after it is worse than nothing.
    expect(askBody(item(), snapshotWith([{ approvalId: "apr_1", preview: "" }]))).toBe(
      "Send an email",
    );
  });

  it("puts what a yes does after the question, ahead of the preview (ADR 0142)", () => {
    const said = snapshotWith([
      { approvalId: "apr_1", preview: "connectors/robinhood.yaml", effect: "Its tools go." },
    ]);
    expect(askBody(item({ title: "Turn off Robinhood?" }), said)).toBe(
      "Turn off Robinhood? — Its tools go.",
    );
  });

  it("says when an ask lapses and what lapsing does, in one sentence", () => {
    expect(lapseWords("in 15 min", "deny")).toBe("Denied in 15 min if you don't answer");
    expect(lapseWords("in 2 h", "allow")).toBe("Goes ahead in 2 h if you don't answer");
    expect(lapseWords("expired", "deny")).toBe("Expired");
    // A question has no fallback to name.
    expect(lapseWords("in 5 min", undefined)).toBe("Lapses in 5 min");
  });

  it("names an unknown participant by their id rather than losing them", () => {
    expect(askHeading(item({ harnessId: "har_new" }), DIRECTORY)).toBe("har_new asks");
  });
});

describe("the lane's trail", () => {
  it("ends with the harness doing the asking, which the trail itself does not name", () => {
    const trailed = item({
      harnessId: "har_ledger",
      trail: [{ participantId: "per_arjun" }, { participantId: "har_scout" }],
    });
    expect(laneTrail(trailed, DIRECTORY)).toBe("Arjun → Scout → Ledger");
  });

  it("wears the lane's names for a hop and for the specialist, when it has them", () => {
    // A harness handing a Space of its own down, from that Space's room (13 September 2026): the
    // one harness at every hop but the person, told apart by the rooms and the label.
    const handed = item({
      harnessId: "har_scout",
      laneLabel: "Engineer",
      trail: [{ participantId: "per_arjun" }, { participantId: "har_scout", label: "Chess Game" }],
    });
    expect(laneTrail(handed, DIRECTORY)).toBe("Arjun → Chess Game → Engineer");
  });

  it("is nothing at all when the ask came down no lane", () => {
    expect(laneTrail(item(), DIRECTORY)).toBeUndefined();
    expect(laneTrail(item({ trail: [] }), DIRECTORY)).toBeUndefined();
  });
});

describe("finding what an item stands for", () => {
  it("finds the approval, and only for an item that is one", () => {
    const snapshot = snapshotWith([{ approvalId: "apr_1", preview: "x" }]);
    expect(approvalFor(item(), snapshot)?.approvalId).toBe("apr_1");
    expect(approvalFor(item({ kind: "summary" }), snapshot)).toBeUndefined();
    expect(approvalFor(item({ id: "apr_9" }), snapshot)).toBeUndefined();
  });

  it("finds the question the same way", () => {
    const snapshot = snapshotWith([], [{ askId: "ask_1" }]);
    const asked = item({ kind: "question", id: "ask_1" });
    expect(questionFor(asked, snapshot)?.askId).toBe("ask_1");
    expect(questionFor(item(), snapshot)).toBeUndefined();
  });

  it("finds nothing in a space this phone has not folded", () => {
    expect(
      approvalFor(item({ spaceId: "sp_9" }), snapshotWith([{ approvalId: "apr_1" }])),
    ).toBeUndefined();
  });
});
