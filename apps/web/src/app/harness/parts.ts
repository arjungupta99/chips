/**
 * The pages a harness's page opens (ADR 0254, 0266): all of its agents, its context files, When it
 * asks you, and its recent runs, each with its name over it as the phone's bar says it; and the
 * desk's own, from its Connection group (ADR 0273): Owner, What it sends, What it may do, Tokens.
 */

export type HarnessPart =
  | "agents"
  | "context"
  | "asks"
  | "runs"
  | "owner"
  | "sends"
  | "may"
  | "tokens";

export const PART_TITLE: Readonly<Record<HarnessPart, string>> = {
  agents: "Agents",
  context: "Context files",
  asks: "When it asks you",
  runs: "Recent runs",
  owner: "Owner",
  sends: "What it sends",
  may: "What it may do",
  tokens: "Tokens",
};
