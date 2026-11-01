/**
 * The route card: in the lead's chat, under the message that caused the routing, the lane
 * unfolds to show the specialist's reply (blueprint, Lead and lanes). One object, two views;
 * this is the lead's view. Visual in Phase 1; Phase 3 wires it to a real lane.
 */

import type { ReactNode } from "react";
import { formatCost } from "../../format.js";
import type { HarnessStatus } from "../../vocabulary/status.js";
import { Avatar, type AvatarProps } from "../avatar/avatar.js";
import { StatusPill } from "../pill/pill.js";
import { ContextRing } from "../ring/ring.js";
import "./route.css";

export interface RouteParty {
  readonly name: string;
  readonly color?: string;
  readonly status?: HarnessStatus;
  /**
   * The face it wears in place of initials: an agent's own (ADR 0089), or the one chosen for the
   * room this party is.
   */
  readonly icon?: AvatarProps["icon"];
  /** An agent is drawn in its own outline; absent, the party is drawn as a harness. */
  readonly kind?: "harness" | "agent";
}

export interface RouteCardProps {
  readonly from: RouteParty;
  readonly to: RouteParty;
  /** `Routed to Ledger`, or `Routed to 3 harnesses · 1 done` for a fan-out. */
  readonly title?: string;
  readonly goal: string;
  /** Where the lane got to. */
  readonly status?: HarnessStatus;
  readonly contextPercent?: number;
  readonly costUsd?: number;
  /** The lane's messages, rendered inside the card. */
  readonly children?: ReactNode;
  /** `Reply to Ledger…`: typing inside an open lane goes to the specialist. */
  readonly replyPlaceholder?: string;
  readonly open?: boolean;
  readonly className?: string;
}

/** One end of the route: a harness's squircle, or an agent in its own outline. */
function Party({ party }: { readonly party: RouteParty }) {
  return (
    <Avatar
      name={party.name}
      kind={party.kind ?? "harness"}
      size="xs"
      {...(party.color === undefined ? {} : { color: party.color })}
      {...(party.status === undefined ? {} : { status: party.status })}
      {...(party.icon === undefined ? {} : { icon: party.icon })}
    />
  );
}

export function RouteCard({
  from,
  to,
  title,
  goal,
  status,
  contextPercent,
  costUsd,
  children,
  replyPlaceholder,
  open = true,
  className,
}: RouteCardProps) {
  return (
    <details
      className={className === undefined ? "ui-route" : `ui-route ${className}`}
      open={open}
      data-status={status}
    >
      <summary className="ui-route__head">
        <span className="ui-route__parties">
          <Party party={from} />
          <span className="ui-route__arrow" aria-hidden="true">
            →
          </span>
          <Party party={to} />
        </span>
        <span className="ui-route__title">
          <b>{title ?? `Routed to ${to.name}`}</b>
          <span className="ui-route__goal">{goal}</span>
        </span>
        {status !== undefined && <StatusPill status={status} />}
        {contextPercent !== undefined && (
          <span className="ui-route__context">
            <ContextRing
              percent={contextPercent}
              label={`${to.name}'s context, ${Math.round(contextPercent)}% full`}
            />
            {Math.round(contextPercent)}%
          </span>
        )}
        {costUsd !== undefined && <span className="ui-route__cost">{formatCost(costUsd)}</span>}
      </summary>
      <div className="ui-route__body">
        {children}
        {replyPlaceholder !== undefined && (
          <div className="ui-route__reply" aria-hidden="true">
            {replyPlaceholder}
          </div>
        )}
      </div>
    </details>
  );
}
