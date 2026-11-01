/**
 * Three tiers of attention (blueprint, Supervision). The tier is a property of the message
 * type, never a setting: an approval is always Decide now, a checkpoint always FYI.
 */

import type { Tone } from "./status.js";

export const TIERS = ["decide", "review", "fyi"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierInfo {
  readonly label: string;
  readonly tone: Tone;
  readonly summary: string;
  readonly delivery: string;
}

export const TIER: Readonly<Record<Tier, TierInfo>> = {
  decide: {
    label: "Decide now",
    tone: "amber",
    summary: "Approvals, blocked runs, questions without a default.",
    delivery: "Breaks through. Actionable push. Expires visibly.",
  },
  review: {
    label: "Review today",
    tone: "blue",
    summary: "Finished work, summaries, questions that have a default the harness will take.",
    delivery: "Batched. One notification per hour at most.",
  },
  fyi: {
    label: "FYI",
    tone: "neutral",
    summary: "Checkpoints, status changes, harness-to-harness chatter.",
    delivery: "Silent. Rolled into a daily digest.",
  },
};
