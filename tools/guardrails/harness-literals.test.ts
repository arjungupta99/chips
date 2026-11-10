/**
 * Every `"harness"` left in the clients' source, and why it is still there (ADR 0087, Phase 2).
 *
 * A room holds agents now: the harness is the software behind them, and is in no room once its
 * agents are. So "is this a harness in the room?" is asked through core's `isAgent`, which in
 * Phase 2 alone also says yes to a harness still in a room from before the upgrade, and Phase 7
 * narrows. A `"harness"` literal that asks it any other way would miss every agent. Each one left
 * here is about the harness itself — its card, its token, its capabilities, the + asking it — or is
 * the squircle a harness is drawn in, or the kind the model gives any agent's words until Phase 7
 * renames it. An agent has an outline of its own since ADR 0089, asked for through core's
 * `faceKind`, so the screens that draw an agent no longer say "harness" to do it.
 *
 * A file with more than it is allowed has a new one: ask it through `isAgent`, or add it here with
 * why. A file with fewer lost one: take the count down, so the list stays true.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

const WHERE = ["packages/core/src", "apps/web/src", "apps/mobile/src"];
/** Tests, fixtures and the kitchen sink draw every kind on purpose. */
const NOT_SHIPPED = /\.test\.tsx?$|\.spec\.tsx?$|\.vitest\.tsx?$|\/testing\/|\/kitchen-sink\//;

const SHAPE = "the squircle a harness, or a room that is one agent's, is drawn in";
const OUTLINE =
  "which outline a face is drawn in: a harness's squircle or an agent's own (ADR 0089)";
const WORDS = "the kind the model gives an agent's or a harness's words, until Phase 7";

const ALLOWED: Readonly<Record<string, { readonly count: number; readonly why: string }>> = {
  "packages/core/src/agentsTab.ts": {
    count: 1,
    why: "the harnesses the Agents tab shelves over its agents (ADR 0185)",
  },
  "packages/core/src/connect.ts": {
    count: 2,
    why: "the harnesses here already, whose gallery cards say Connected (ADR 0190, setup audit HS-19)",
  },
  "packages/core/src/asks.ts": {
    count: 1,
    why: "the harnesses a person may ask for a new agent in a room (ADR 0108)",
  },
  "packages/core/src/demo/workspace.ts": {
    count: 1,
    why: "the made-up workspace's harnesses, Errand, Studio and Herald: their ids and their rows in the demo's directory (ADR 0213)",
  },
  "packages/core/src/events.ts": {
    count: 10,
    why: "participant kinds, `isAgent` and `faceKind` themselves, the Harnesses list and a harness's first connection",
  },
  "packages/core/src/model/build.ts": { count: 1, why: "a harness's connection checklist" },
  "packages/core/src/model/exchange.ts": {
    count: 1,
    why: `${WORDS}: the referee's line (ADR 0097)`,
  },
  "packages/core/src/model/messages.ts": { count: 2, why: WORDS },
  "packages/core/src/model/origin.ts": { count: 1, why: WORDS },
  "packages/core/src/model/readers.ts": { count: 4, why: `${WORDS}; a space's face` },
  "packages/core/src/model/runs.ts": { count: 4, why: `${WORDS}; who set a run's goal` },
  "packages/core/src/model/spaces.ts": { count: 1, why: `${WORDS}: an agent's move lines` },
  "packages/core/src/model/state.ts": { count: 5, why: `${WORDS}; who set a run's goal` },
  "packages/core/src/model/types.ts": { count: 2, why: `${WORDS}; who set a run's goal` },
  "packages/core/src/putAway.ts": { count: 1, why: "a room a harness opened, which follows it" },
  "packages/core/src/contextEditor.ts": {
    count: 1,
    why: "whose context files an editor saves: an agent's, or its harness's own set (ADR 0135)",
  },
  "packages/core/src/removal.ts": {
    count: 2,
    why: "removing a harness from the workspace, and the harnesses a removed person owned (ADR 0160)",
  },
  "packages/core/src/store.ts": {
    count: 5,
    why: "the wire's kinds, the + asking a harness, and a harness's own context set (ADR 0134)",
  },
  "apps/web/src/app/Harnesses.tsx": {
    count: 4,
    why: `the harness a new agent is asked of (ADR 0190); a file of a harness's own context set (ADR 0135); a harness asking for itself, whose asks are on its own page (ADR 0286); ${SHAPE}`,
  },
  "apps/web/src/app/agent/AgentPermissions.tsx": {
    count: 2,
    why: "the harness's own face, beside the rules that are its own and the row that goes to it (ADR 0286)",
  },
  "apps/web/src/app/harness/HarnessPage.tsx": {
    count: 1,
    why: `a harness's page (ADR 0254, 0266): ${SHAPE}`,
  },
  "apps/web/src/app/harness/HarnessCards.tsx": {
    count: 1,
    why: `every harness's card under View all (ADR 0185, 0266): ${SHAPE}`,
  },
  "apps/web/src/app/HarnessShelf.tsx": {
    count: 1,
    why: `a harness's tile on the Agents page's shelf (ADR 0185); ${SHAPE}`,
  },
  "apps/web/src/app/AsksDialog.tsx": {
    count: 1,
    why: `the harness's own face over every ask of it (ADR 0255); ${SHAPE}`,
  },
  "apps/web/src/app/Asking.tsx": {
    count: 2,
    why: `the harness's own face on When it asks you, on its page, and the workspace's harnesses' faces on You's Allowed always (ADR 0195 and its addendum of 26 October 2026); ${SHAPE}`,
  },
  "apps/web/src/app/NewSpace.tsx": { count: 1, why: SHAPE },
  "apps/web/src/app/room/actions.ts": { count: 1, why: "the kinds a person adds to a room" },
  "apps/web/src/app/room/Adding.tsx": {
    count: 4,
    why: `the kinds a person adds to a room; a harness with no agent yet, added as itself; ${SHAPE}`,
  },
  "apps/web/src/app/room/Who.tsx": {
    count: 1,
    why: "a harness in a room as itself, from before its agents took its place (ADR 0151)",
  },
  "apps/web/src/app/Shell.tsx": { count: 1, why: "the + asking a harness into a room" },
  "apps/web/src/app/Sidebar.tsx": { count: 3, why: SHAPE },
  "apps/web/src/app/SpaceView.tsx": { count: 7, why: `${SHAPE}; ${WORDS}; ${OUTLINE}` },
  "apps/web/src/app/Waits.tsx": { count: 2, why: OUTLINE },
  "apps/web/src/app/you/Notifications.tsx": { count: 1, why: SHAPE },
  "apps/web/src/app/Join.tsx": {
    count: 11,
    why: `a harness asking to join, which has no agent yet (ADR 0122), told from a link's request (ADR 0232), the gallery's ways and the docs' cards (ADR 0171), the same on the empty Agents page (ADR 0261), the harness landing on the arrival (ADR 0190), the harness here already, before a second is made (ADR 0248), and I don't have one yet (ADR 0290); ${SHAPE}`,
  },
  "apps/web/src/app/StartSteps.tsx": {
    count: 3,
    why: `the cards an answer leads to, and I don't have one yet, before any harness is here (ADR 0290); ${SHAPE}`,
  },
  "apps/mobile/src/harnesses/AskingMotion.tsx": {
    count: 2,
    why: `the harness's own face on When it asks you, on its page, and the workspace's harnesses' faces on You's Allowed always (ADR 0195 and its addendum of 26 October 2026); ${SHAPE}`,
  },
  "apps/mobile/src/harnesses/HarnessCard.tsx": { count: 1, why: `a harness's card; ${SHAPE}` },
  "apps/mobile/src/harnesses/Shelf.tsx": {
    count: 2,
    why: `a harness's tile on the Agents tab's shelf, and Connect a harness's beside them (ADR 0185, ADR 0190); ${SHAPE}`,
  },
  "apps/mobile/src/harnesses/Connect.tsx": {
    count: 4,
    why: `Connect a harness on the phone: the gallery's cards and ways, the card being connected, and the harness landing on the arrival, none with an agent yet (ADR 0190); ${SHAPE}`,
  },
  "apps/mobile/src/harnesses/NewAgent.tsx": {
    count: 1,
    why: `the harness a new agent is asked of, at the top of its sheet (ADR 0190); ${SHAPE}`,
  },
  "apps/mobile/src/harnesses/Profile.tsx": {
    count: 4,
    why: `a harness's card, its face on the sheets that ask before Remove and Restart, and its page waiting for the first list (ADR 0166); ${SHAPE}`,
  },
  "apps/mobile/src/agents/Arriving.tsx": {
    count: 2,
    why: `a harness's tile before the first list (ADR 0185), and a harness's page waiting for it (ADR 0166); ${SHAPE}`,
  },
  "apps/mobile/src/context/owner.ts": {
    count: 2,
    why: "whose context files a screen shows: an agent's, or its harness's own set (ADR 0135)",
  },
  "apps/mobile/src/agents/JoinSheet.tsx": {
    count: 3,
    why: `a harness asking to join, which has no agent yet (ADR 0122), told from a link's request (ADR 0232); ${SHAPE}`,
  },
  "apps/mobile/src/newSpace/NewSpace.tsx": { count: 1, why: "the + asking a harness into a room" },
  "apps/mobile/src/newSpace/Pick.tsx": { count: 2, why: SHAPE },
  "apps/mobile/src/newSpace/remembered.ts": { count: 1, why: "the harnesses the + asked last" },
  "apps/mobile/src/agents/face.ts": { count: 1, why: OUTLINE },
  "apps/mobile/src/spaces/LaneChain.tsx": { count: 2, why: OUTLINE },
  "apps/mobile/src/spaces/Line.tsx": { count: 1, why: WORDS },
  "apps/mobile/src/spaces/RowAvatar.tsx": { count: 3, why: SHAPE },
  "apps/mobile/src/spaces/spaces.ts": { count: 4, why: `${SHAPE}; ${WORDS}` },
  "apps/mobile/src/ui/Avatar.tsx": { count: 3, why: SHAPE },
  "apps/mobile/src/you/Notifications.tsx": { count: 1, why: SHAPE },
};

function sources(): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", ...WHERE], { cwd: REPO })
    .toString("utf8")
    .split("\0")
    .filter((path) => /\.tsx?$/.test(path) && !NOT_SHIPPED.test(path));
}

function literalsIn(path: string): number {
  return (readFileSync(`${REPO}${path}`, "utf8").match(/"harness"/g) ?? []).length;
}

describe('the "harness" literals left in the clients (ADR 0087)', () => {
  it("are each about the harness itself, or listed with why", () => {
    const found: Record<string, number> = {};
    for (const path of sources()) {
      const count = literalsIn(path);
      if (count > 0) found[path] = count;
    }
    const wrong = Object.keys({ ...found, ...ALLOWED })
      .filter((path) => (found[path] ?? 0) !== (ALLOWED[path]?.count ?? 0))
      .map((path) => {
        const has = found[path] ?? 0;
        const may = ALLOWED[path]?.count ?? 0;
        return has > may
          ? `${path}: ${has} "harness" where ${may} are allowed — ask whether it is an agent with core's isAgent, or list it here with why`
          : `${path}: ${has} "harness" where ${may} are listed — take the count down`;
      });
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("gives every one a reason", () => {
    for (const [path, entry] of Object.entries(ALLOWED)) {
      expect(entry.why.length, path).toBeGreaterThan(10);
    }
  });
});
