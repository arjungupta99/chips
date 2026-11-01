/**
 * Which tier of attention something belongs to: Decide now, Review today, or FYI. A property
 * of the message type, so the badge only ever says what the type already means.
 */

import { TIER, type Tier } from "../../vocabulary/tiers.js";
import { Dot } from "../pill/pill.js";
import "./tier.css";

export interface TierBadgeProps {
  readonly tier: Tier;
  readonly className?: string;
}

export function TierBadge({ tier, className }: TierBadgeProps) {
  const info = TIER[tier];
  return (
    <span
      className={className === undefined ? "ui-tier" : `ui-tier ${className}`}
      data-tier={tier}
      data-tone={info.tone}
      title={info.summary}
    >
      <Dot tone={info.tone} />
      {info.label}
    </span>
  );
}
