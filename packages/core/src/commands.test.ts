import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands.js";

describe("what the composer's line means", () => {
  it("is a message unless it starts with a slash", () => {
    expect(parseCommand("Any news on the PO?")).toEqual({
      kind: "message",
      text: "Any news on the PO?",
    });
    expect(parseCommand("  trimmed  ")).toEqual({ kind: "message", text: "trimmed" });
  });

  it("reads a steer with how it is meant", () => {
    expect(parseCommand("/steer Mention the pallet count.")).toEqual({
      kind: "steer",
      mode: "steer",
      text: "Mention the pallet count.",
    });
    expect(parseCommand("/followup Update the tracker after.")).toMatchObject({
      mode: "followup",
    });
    expect(parseCommand("/INTERRUPT stop and ask Dana")).toMatchObject({
      mode: "interrupt",
      text: "stop and ask Dana",
    });
  });

  it("reads pause, resume and stop, with a reason when there is one", () => {
    expect(parseCommand("/pause")).toEqual({ kind: "pause" });
    expect(parseCommand("/resume")).toEqual({ kind: "resume" });
    expect(parseCommand("/stop")).toEqual({ kind: "stop", reason: undefined });
    expect(parseCommand("/stop the vendor called")).toEqual({
      kind: "stop",
      reason: "the vendor called",
    });
  });

  it("says what it does not understand, and what a steer is missing", () => {
    expect(parseCommand("/dance")).toMatchObject({ kind: "unknown", name: "dance" });
    expect((parseCommand("/dance") as { hint: string }).hint).toContain("/steer");
    expect(parseCommand("/steer")).toMatchObject({ kind: "unknown", name: "steer" });
    expect((parseCommand("/steer") as { hint: string }).hint).toContain("/steer <");
  });

  it("lets a message start with a slash, spelled with two", () => {
    expect(parseCommand("//not a command")).toEqual({ kind: "message", text: "/not a command" });
  });
});

describe("the space commands (M3.3)", () => {
  it("reads a title, a close and a reopen", () => {
    expect(parseCommand("/title Northwind quotes")).toEqual({
      kind: "title",
      title: "Northwind quotes",
    });
    expect(parseCommand("/close")).toEqual({ kind: "close" });
    expect(parseCommand("/reopen")).toEqual({ kind: "reopen" });
  });

  it("reads who to add or remove, with or without the @", () => {
    expect(parseCommand("/add @Ledger")).toEqual({ kind: "add", who: "Ledger" });
    expect(parseCommand("/remove Dana")).toEqual({ kind: "remove", who: "Dana" });
  });

  it("says what a title or a name is missing", () => {
    expect(parseCommand("/title")).toMatchObject({ kind: "unknown", name: "title" });
    expect((parseCommand("/add") as { hint: string }).hint).toContain("/add @name");
  });
});

describe("what went wrong (M3.4)", () => {
  it("reads a note for the harness's last message, and says when it is missing", () => {
    expect(parseCommand("/wrong The 19th, not the 12th.")).toEqual({
      kind: "wrong",
      text: "The 19th, not the 12th.",
    });
    expect(parseCommand("/wrong")).toMatchObject({ kind: "unknown", name: "wrong" });
    expect((parseCommand("/wrong") as { hint: string }).hint).toContain("/wrong <what went wrong>");
  });
});
