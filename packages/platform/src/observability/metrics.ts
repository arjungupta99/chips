/**
 * Metrics through the OpenTelemetry API from Phase 0 (technical-plan 6.5). The API only:
 * without an SDK registered these are no-ops, which is what "no telemetry by default"
 * (decision 15) means in practice. A Prometheus exporter arrives in Phase 6 and needs no
 * change here.
 *
 * The set is the one a runbook asks for: appends, fan-out latency, pending approvals and
 * their age, sockets, job queue depth.
 */

import { type Counter, type Histogram, metrics, type UpDownCounter } from "@opentelemetry/api";

export const METER_NAME = "chips";

export interface ChipsInstruments {
  /** Events appended to the log. */
  readonly eventsAppended: Counter;
  /** Milliseconds from append to delivery at a subscriber. */
  readonly fanoutLatencyMs: Histogram;
  /** Approvals waiting on a person, in and out. */
  readonly pendingApprovals: UpDownCounter;
  /** How long an approval waited before it was resolved or expired, in seconds. */
  readonly approvalAgeSeconds: Histogram;
  /** Open WebSocket connections. */
  readonly socketsOpen: UpDownCounter;
  /** Jobs waiting on the job port. */
  readonly jobQueueDepth: UpDownCounter;
}

/** Build the instrument set. Callers hold onto it; instruments are cheap but not free. */
export function createInstruments(meterName: string = METER_NAME): ChipsInstruments {
  const meter = metrics.getMeter(meterName);
  return {
    eventsAppended: meter.createCounter("chips.events.appended", {
      description: "Events appended to the workspace event log",
      unit: "{event}",
    }),
    fanoutLatencyMs: meter.createHistogram("chips.fanout.latency", {
      description: "Time from append to delivery at a subscriber",
      unit: "ms",
    }),
    pendingApprovals: meter.createUpDownCounter("chips.approvals.pending", {
      description: "Approvals waiting on a person",
      unit: "{approval}",
    }),
    approvalAgeSeconds: meter.createHistogram("chips.approvals.age", {
      description: "How long an approval waited before it was resolved or expired",
      unit: "s",
    }),
    socketsOpen: meter.createUpDownCounter("chips.sockets.open", {
      description: "Open WebSocket connections",
      unit: "{connection}",
    }),
    jobQueueDepth: meter.createUpDownCounter("chips.jobs.queue_depth", {
      description: "Jobs waiting on the job port",
      unit: "{job}",
    }),
  };
}
