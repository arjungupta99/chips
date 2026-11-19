/**
 * What a harness runs on its own (ADR 0299): the first of two gates. Its own settings decide
 * whether it asks at all, and what they let through never reaches Chips as an ask. A harness sends
 * a copy of them (`PUT /v1/harnesses/:id/own-rules`), whole, when it connects and whenever it reads
 * them again; its owner and the workspace's owners and admins read it back
 * (`GET /v1/harnesses/:id/own-rules`) for its Permissions page.
 *
 * It is a report, never policy: Chips decides nothing from it. The apps say it in plain words and
 * name the commands on the never list (`NEVER_STANDING`) it lets through, so a person can make
 * those ask in the harness's own settings, with the line `ask_line` says how to write.
 */

import { z } from "zod";
import { isoTimestamp } from "./primitives.js";

/** The most entries one list carries. */
export const OWN_RULES_MAX = 200;

/** What an entry lets through, for its words on the page. */
export const OWN_KINDS = ["read", "write", "web", "command", "tool"] as const;
export const ownKind = z.enum(OWN_KINDS);
export type OwnKind = z.infer<typeof ownKind>;

export const ownEntry = z
  .object({
    kind: ownKind.describe(
      "What it lets through: reading files, writing them, the web, commands, or another tool.",
    ),
    name: z
      .string()
      .min(1)
      .max(120)
      .describe("The tool or program as the harness names it: `Read`, `WebFetch`, `git`."),
    words: z
      .array(z.string().min(1).max(120))
      .max(8)
      .optional()
      .describe(
        'For a command: the words every command it lets through starts with, `["git"]`. Absent on a command entry: any command.',
      ),
    raw: z
      .string()
      .min(1)
      .max(400)
      .optional()
      .describe("The entry as its settings write it: `Bash(git:*)`."),
  })
  .describe("One thing a harness's own settings let through, ask about, or refuse.");
export type OwnEntry = z.infer<typeof ownEntry>;

const entries = z.array(ownEntry).max(OWN_RULES_MAX);

/** The most modes a harness offers. */
export const OWN_MODES_MAX = 12;

export const ownMode = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .describe(
        "The mode as the harness names it on the wire, what `policy.mode.id` carries: `auto`.",
      ),
    name: z
      .string()
      .min(1)
      .max(80)
      .describe("Its name, as the harness's own picker says it: `Auto`."),
    words: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("What it does, in a plain line, for the row under its name."),
    everything: z
      .boolean()
      .optional()
      .describe(
        "In it the harness never asks: Claude Code's Bypass permissions, Codex's Full access.",
      ),
  })
  .describe("One mode a harness offers to run its sessions in (ADR 0300, 19 November addendum).");
export type OwnMode = z.infer<typeof ownMode>;

export const ownModes = z
  .object({
    base: z
      .string()
      .min(1)
      .max(80)
      .describe("The mode its sessions start in, and go back to when a picked mode's time is up."),
    running: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe(
        "The mode its sessions run in now, which can differ from the one picked: Claude Code runs Auto as Accept edits on a model that can't use it.",
      ),
    offers: z
      .array(ownMode)
      .min(1)
      .max(OWN_MODES_MAX)
      .describe("Each mode it offers, in its order."),
  })
  .describe("The modes a harness offers, and the one it starts in.");
export type OwnModes = z.infer<typeof ownModes>;

export const ownRules = z
  .object({
    read_from: z
      .array(z.string().min(1).max(300))
      .min(1)
      .max(8)
      .describe("Where it read them, in the order they apply: `~/.claude/settings.json`."),
    note: z
      .string()
      .min(1)
      .max(400)
      .optional()
      .describe(
        "A sentence in the harness's own words about them: who else reads the same file, what its mode means.",
      ),
    mode: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe("The mode its sessions run in, as the harness names it: `Default`."),
    everything: z
      .boolean()
      .optional()
      .describe("It runs everything without asking, so nothing it does reaches Chips as an ask."),
    modes: ownModes
      .optional()
      .describe(
        "The modes a person may put its sessions in from Chips (`policy.mode`), and the one they start in. Absent: it can't be switched from Chips.",
      ),
    runs: entries.describe("What it runs without asking."),
    asks: entries.optional().describe("What it always asks about, whatever else it lets through."),
    refuses: entries.optional().describe("What it never does."),
    ask_line: z
      .object({
        entry: z
          .string()
          .min(1)
          .max(200)
          .describe("One entry that asks, with `{words}` where a command's start goes."),
        line: z
          .string()
          .min(1)
          .max(300)
          .describe(
            "The line those entries go in, with `{entries}` where they go, comma-separated.",
          ),
        where: z.string().min(1).max(300).describe("Where the line goes, in words."),
      })
      .optional()
      .describe("How to make a command ask in its own settings, for the page's Copy."),
  })
  .describe("What a harness's own settings let through, in its own terms (ADR 0299).");
export type OwnRules = z.infer<typeof ownRules>;

/** `GET /v1/harnesses/:id/own-rules`: the copy, and when Chips heard it; nothing before one. */
export const ownRulesRead = z
  .object({
    own_rules: ownRules.nullable().describe("The latest copy; `null` before the harness sent one."),
    heard_at: isoTimestamp.nullable().describe("When Chips heard it."),
  })
  .describe("What a harness last said it runs on its own.");
export type OwnRulesRead = z.infer<typeof ownRulesRead>;

/** The line that makes `starts` ask, from the harness's own template; nothing without one. */
export function askLineFor(
  rules: Pick<OwnRules, "ask_line">,
  starts: readonly (readonly string[])[],
): string | undefined {
  const template = rules.ask_line;
  if (template === undefined || starts.length === 0) return undefined;
  const items = starts.map((words) => template.entry.split("{words}").join(words.join(" ")));
  return template.line.split("{entries}").join(items.join(", "));
}
