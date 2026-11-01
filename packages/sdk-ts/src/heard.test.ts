import type { MessageOverheard } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { overheardLine, workingTurnsOf } from "./heard.js";

const said = {
  from: {
    participant_id: "usr_duncan",
    kind: "person",
    display_name: "Duncan",
    workspace_role: "guest",
  },
  text: " The quotes are in. ",
} as unknown as MessageOverheard;

describe("words said in the room while a turn works there (ADR 0105, ADR 0106)", () => {
  it("are who said them, with their standing, and what, as Jacobian tells its turns", () => {
    expect(overheardLine(said)).toBe(
      "Duncan (guest) said in the room, not to you: The quotes are in.",
    );
  });

  it("say what a voice note said and the files by name", () => {
    const files = {
      ...said,
      text: "",
      attachments: [
        { filename: "note.m4a", transcript: "Northwind is lowest" },
        { filename: "quotes.pdf" },
      ],
    } as unknown as MessageOverheard;
    expect(overheardLine(files)).toBe(
      "Duncan (guest) said in the room, not to you: (voice note: Northwind is lowest) (sent note.m4a, quotes.pdf)",
    );
  });

  it("are for the turns Chips names, and none where it names none", () => {
    const named = {
      ...said,
      working_turns: [{ agent_id: "agt_hale", run_id: "run_one" }],
    } as unknown as MessageOverheard;
    expect(workingTurnsOf(named)).toEqual([{ agentId: "agt_hale", runId: "run_one" }]);
    expect(workingTurnsOf(said)).toEqual([]);
  });
});
