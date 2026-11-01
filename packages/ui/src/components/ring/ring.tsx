/**
 * The context ring: how full the harness's context window is. Neutral to 70 percent, amber to
 * 90, red past that. A native meter to assistive technology, drawn as a ring for everyone else.
 */

import type { CSSProperties } from "react";
import { contextLabel, contextTone } from "../../vocabulary/context.js";
import "./ring.css";

export interface ContextRingProps {
  /** 0 to 100. */
  readonly percent: number;
  /** 14 pixels beside a name, 46 in the run panel with the number inside. */
  readonly size?: "sm" | "lg";
  readonly label?: string;
  readonly className?: string;
}

export function ContextRing({ percent, size = "sm", label, className }: ContextRingProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  const name = label ?? contextLabel(value);
  return (
    <span
      className={className === undefined ? "ui-ring" : `ui-ring ${className}`}
      data-tone={contextTone(value)}
      data-size={size}
      style={{ "--p": value } as CSSProperties}
    >
      {/* The meter is the meaning; the ring drawn around it is the picture. */}
      <meter className="ui-visually-hidden" min={0} max={100} value={value} aria-label={name}>
        {name}
      </meter>
      {size === "lg" && (
        <b className="ui-ring__value" aria-hidden="true">
          {value}%
        </b>
      )}
    </span>
  );
}
