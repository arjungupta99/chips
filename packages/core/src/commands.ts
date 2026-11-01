/**
 * What a person typed into the composer, read as a command when it starts with a slash. The
 * blueprint's placeholder says it: "type / to steer, pause, or hand off". A steer carries how
 * it is meant — steer, follow up, or interrupt (blueprint: steering has dispositions) — and
 * the rest is a message. Pure, so the web and mobile composers agree on what a line means.
 */

import type { SteerMode } from "./model.js";

export type Command =
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "steer"; readonly mode: SteerMode; readonly text: string }
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | { readonly kind: "stop"; readonly reason?: string | undefined }
  /** Leave this space: it stops being one of yours. Nothing in it is deleted. */
  | { readonly kind: "leave" }
  /** Retitle this space (M3.3). */
  | { readonly kind: "title"; readonly title: string }
  /** Close this space: off the list, history kept; and open it again. */
  | { readonly kind: "close" }
  | { readonly kind: "reopen" }
  /** Add somebody to this space, or remove them, by name or @handle. */
  | { readonly kind: "add"; readonly who: string }
  | { readonly kind: "remove"; readonly who: string }
  /** Say what went wrong with the last thing a harness said here (M3.4). */
  | { readonly kind: "wrong"; readonly text: string }
  /** A slash command this build does not know, or one missing what it needs. */
  | { readonly kind: "unknown"; readonly name: string; readonly hint: string };

/** The commands, as the composer's help lists them. */
export const COMMANDS: readonly { readonly name: string; readonly hint: string }[] = [
  { name: "steer", hint: "/steer <what to do instead> — redirect the run now" },
  { name: "followup", hint: "/followup <what to do next> — queue it for after the current step" },
  { name: "interrupt", hint: "/interrupt <what to do> — stop what is happening and do this" },
  { name: "pause", hint: "/pause — hold the run where it is" },
  { name: "resume", hint: "/resume — carry on" },
  { name: "stop", hint: "/stop [why] — end the run as cancelled" },
  { name: "leave", hint: "/leave — take this space off your list; its history stays" },
  { name: "title", hint: "/title <name> — rename this space" },
  {
    name: "archive",
    hint: "/archive — put this space away; its history stays, and it can be unarchived",
  },
  { name: "unarchive", hint: "/unarchive — put this space back on the list" },
  { name: "add", hint: "/add @name — add a person or a harness to this space" },
  { name: "remove", hint: "/remove @name — take somebody out of this space" },
  { name: "wrong", hint: "/wrong <what went wrong> — tell the harness about its last message" },
];

const STEER_MODES: Readonly<Record<string, SteerMode>> = {
  steer: "steer",
  followup: "followup",
  interrupt: "interrupt",
};

/** A line typed in the composer. A leading `//` is how to say a message that starts with a slash. */
export function parseCommand(input: string): Command {
  const text = input.trim();
  if (!text.startsWith("/")) return { kind: "message", text };
  if (text.startsWith("//")) return { kind: "message", text: text.slice(1) };

  const space = text.search(/\s/);
  const name = (space === -1 ? text.slice(1) : text.slice(1, space)).toLowerCase();
  const rest = space === -1 ? "" : text.slice(space).trim();
  return slashCommand(name, rest);
}

function slashCommand(name: string, rest: string): Command {
  const mode = STEER_MODES[name];
  if (mode !== undefined) {
    if (rest !== "") return { kind: "steer", mode, text: rest };
    const hint = COMMANDS.find((command) => command.name === name)?.hint ?? "";
    return { kind: "unknown", name, hint };
  }
  const simple = SIMPLE[name];
  if (simple !== undefined) return simple;
  switch (name) {
    case "stop":
      return { kind: "stop", reason: rest === "" ? undefined : rest };
    case "title":
    case "add":
    case "remove":
    case "wrong":
      return withArgument(name, rest);
    default:
      return {
        kind: "unknown",
        name,
        hint: `Try ${COMMANDS.map((c) => `/${c.name}`).join(", ")}.`,
      };
  }
}

/** The commands that take nothing. */
const SIMPLE: Readonly<Record<string, Command>> = {
  pause: { kind: "pause" },
  resume: { kind: "resume" },
  leave: { kind: "leave" },
  archive: { kind: "close" },
  unarchive: { kind: "reopen" },
  // What they were called before the apps said archive (ADR 0066); a hand that learned them
  // still gets there.
  close: { kind: "close" },
  reopen: { kind: "reopen" },
};

/** A command that needs the rest of the line: a title, a note, or somebody's name with or without `@`. */
function withArgument(name: "title" | "add" | "remove" | "wrong", rest: string): Command {
  if (rest === "") {
    const hint = COMMANDS.find((command) => command.name === name)?.hint ?? "";
    return { kind: "unknown", name, hint };
  }
  if (name === "title") return { kind: "title", title: rest };
  if (name === "wrong") return { kind: "wrong", text: rest };
  return { kind: name, who: rest.replace(/^@/, "") };
}
