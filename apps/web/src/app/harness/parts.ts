/**
 * The pages a harness's page opens (ADR 0254, 0266): all of its agents, its context files, its
 * Permissions (ADR 0299, once When it asks you) and New rule beside them, and its recent runs, each with its name over it as the phone's bar says it; and the
 * desk's own, from its Connection group (ADR 0273): Owner, What it sends, What it may do, Tokens.
 */

export type HarnessPart =
  | "agents"
  | "context"
  | "asks"
  | "settings"
  | "chips"
  | "rule"
  | "runs"
  | "owner"
  | "sends"
  | "may"
  | "tokens";

export const PART_TITLE: Readonly<Record<HarnessPart, string>> = {
  agents: "Agents",
  context: "Context files",
  asks: "Permissions",
  settings: "Its settings",
  chips: "Chips's rules",
  rule: "New rule",
  runs: "Recent runs",
  owner: "Owner",
  sends: "What it sends",
  may: "What it may do",
  tokens: "Tokens",
};

/** A page's name in its bar: its own settings are named for the harness (ADR 0300). */
export function partTitle(part: HarnessPart, harnessName: string): string {
  return part === "settings" ? `${harnessName}'s settings` : PART_TITLE[part];
}
