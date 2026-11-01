/**
 * A pill: a word with a dot, in one of the five status colours. State is always a colour plus
 * a word, never colour alone, and the dot is the colour half. `StatusPill` is the pill for the
 * seven harness states; `Dot` is the dot on its own, for a list that already has words.
 */

import type { ReactNode } from "react";
import {
  type DotKind,
  type HarnessStatus,
  STATUS,
  statusLabel,
  type Tone,
} from "../../vocabulary/status.js";
import "./pill.css";

export interface DotProps {
  readonly tone?: Tone;
  readonly kind?: DotKind;
  readonly className?: string;
}

export function Dot({ tone = "neutral", kind = "solid", className }: DotProps) {
  return (
    <i
      className={className === undefined ? "ui-dot" : `ui-dot ${className}`}
      data-tone={tone}
      data-dot={kind}
      aria-hidden="true"
    />
  );
}

export interface PillProps {
  readonly tone?: Tone;
  /** `none` for a pill that is a label rather than a state. */
  readonly dot?: DotKind | "none";
  readonly children: ReactNode;
  readonly className?: string;
  readonly title?: string;
}

export function Pill({ tone = "neutral", dot = "none", children, className, title }: PillProps) {
  return (
    <span
      className={className === undefined ? "ui-pill" : `ui-pill ${className}`}
      data-tone={tone}
      title={title}
    >
      {dot !== "none" && <Dot tone={tone} kind={dot} />}
      {children}
    </span>
  );
}

export interface StatusPillProps {
  readonly status: HarnessStatus;
  /** What the harness is doing, shown while working: `Drafting the reply…`. */
  readonly verbPhrase?: string;
  readonly className?: string;
}

export function StatusPill({ status, verbPhrase, className }: StatusPillProps) {
  const style = STATUS[status];
  return (
    <span
      className={className === undefined ? "ui-pill" : `ui-pill ${className}`}
      data-tone={style.tone}
      data-status={status}
    >
      <Dot tone={style.tone} kind={style.dot} />
      {statusLabel(status, verbPhrase)}
    </span>
  );
}
