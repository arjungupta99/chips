/**
 * The receipt: what a harness did, collapsed under its message until somebody asks
 * (blueprint: summary first, receipt on request). Steps, sources, duration and cost; a
 * native disclosure, so it works before any script runs.
 */

import type { SyntheticEvent } from "react";
import { formatCost, formatDuration } from "../../format.js";
import "./receipt.css";

export type ReceiptStepStatus = "started" | "done" | "failed";

export interface ReceiptStep {
  readonly id: string;
  readonly title: string;
  readonly status: ReceiptStepStatus;
  /** Where the information came from: `Drive`, `CRM`, `vendor website`. */
  readonly source?: string;
  readonly durationMs?: number;
  readonly error?: string;
}

export interface ReceiptProps {
  readonly steps: readonly ReceiptStep[];
  readonly durationMs?: number;
  readonly costUsd?: number;
  /** Open by default for supervisors, collapsed for everyone else. */
  readonly open?: boolean;
  readonly onToggle?: (open: boolean) => void;
  readonly className?: string;
  /**
   * The change the run made to the room's project (ADR 0222): "2 files changed", or with
   * "· Undone", ending the line, and what opens it.
   */
  readonly change?: { readonly words: string; readonly onOpen: () => void } | undefined;
}

const MARK: Readonly<Record<ReceiptStepStatus, { glyph: string; word: string }>> = {
  started: { glyph: "…", word: "in progress" },
  done: { glyph: "✓", word: "done" },
  failed: { glyph: "✕", word: "failed" },
};

/**
 * `≈$0.04 · 3 steps · 12s`, with `1 failed` when something did: the cost first, since it is what a
 * reader opens a receipt for (ADR 0282). A run that only answered says `≈$0.03 · 3s`: no `0 steps`
 * in a receipt with nothing under it.
 */
export function receiptSummary(
  steps: readonly ReceiptStep[],
  durationMs?: number,
  costUsd?: number,
): string {
  const parts: string[] = [];
  if (costUsd !== undefined) parts.push(formatCost(costUsd));
  if (steps.length > 0) parts.push(`${steps.length} ${steps.length === 1 ? "step" : "steps"}`);
  const failed = steps.filter((step) => step.status === "failed").length;
  if (failed > 0) parts.push(`${failed} failed`);
  if (durationMs !== undefined) parts.push(formatDuration(durationMs));
  return parts.join(" · ");
}

export function Receipt({
  steps,
  durationMs,
  costUsd,
  open = false,
  onToggle,
  className,
  change,
}: ReceiptProps) {
  const said = receiptSummary(steps, durationMs, costUsd);
  // Pressed, it opens the change rather than the steps.
  const changed = change !== undefined && (
    <>
      {said === "" ? "" : " · "}
      <button
        type="button"
        className="ui-receipt__change"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          change.onOpen();
        }}
        data-testid="receipt-change"
      >
        {change.words}
      </button>
    </>
  );
  const toggled = (event: SyntheticEvent<HTMLDetailsElement>) =>
    onToggle?.(event.currentTarget.open);
  const name = className === undefined ? "ui-receipt" : `ui-receipt ${className}`;

  // A run that only answered has nothing to open: its time and cost on a line, with no marker.
  if (steps.length === 0) {
    return (
      <div className={name}>
        <p className="ui-receipt__summary ui-receipt__summary--alone">
          {said}
          {changed}
        </p>
      </div>
    );
  }

  return (
    <details className={name} open={open} onToggle={toggled}>
      <summary className="ui-receipt__summary">
        {said}
        {changed}
      </summary>
      <ol className="ui-receipt__steps">
        {steps.map((step) => (
          <li className="ui-receipt__step" key={step.id} data-status={step.status}>
            <span className="ui-receipt__mark" role="img" aria-label={MARK[step.status].word}>
              {MARK[step.status].glyph}
            </span>
            <span className="ui-receipt__title">
              {step.title}
              {step.error !== undefined && (
                <span className="ui-receipt__error"> · {step.error}</span>
              )}
            </span>
            {step.durationMs !== undefined && (
              <span className="ui-receipt__duration">{formatDuration(step.durationMs)}</span>
            )}
            {step.source !== undefined && <span className="ui-receipt__source">{step.source}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
