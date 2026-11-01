/**
 * `chips conformance <adapter>` — walk an adapter through the golden scenario and print the
 * connection checklist, the same rows the Harnesses tab lights (M2.5).
 *
 * The adapters are the manifest's entries with a subject (`harnesses.ts`, ADR 0051). Today that
 * is `custom`, for a harness somebody starts by hand: the command prints where the fake is and
 * the harness's token, waits for the harness to connect, and plays the person from there. The
 * report is the kit's, and the exit code says whether the adapter passed, so a job can gate on
 * it. (The sample harness that CI once walked here was withdrawn, ADR 0188.)
 */

import {
  type ChipsAddress,
  formatReport,
  type Report,
  runConformance,
  type Subject,
} from "@chipschat/conformance";
import {
  adapterFor,
  conformable,
  type HarnessAdapter,
  harnessAdapters,
  type SubjectContext,
} from "../harnesses.js";
import { type Console, heading } from "../output.js";
import { environmentLines } from "./custom.js";

/** An adapter's id, as the manifest names it. */
export type ConformanceAdapter = string;

/** The adapters the command takes, in the manifest's order. */
export function conformanceAdapters(
  adapters: readonly HarnessAdapter[] = harnessAdapters,
): readonly ConformanceAdapter[] {
  return conformable(adapters).map((each) => each.id);
}

export const CONFORMANCE_ADAPTERS: readonly ConformanceAdapter[] = conformanceAdapters();

export interface ConformanceOptions {
  readonly adapter: ConformanceAdapter;
  readonly console: Console;
  /** Print the report as JSON and nothing else, for a script. */
  readonly json?: boolean | undefined;
  /** Where the fake Chips listens. Any free port when absent; a fixed one for `custom`. */
  readonly port?: number | undefined;
  /** Seconds to wait for each thing the harness should do next, and for `custom` to connect. */
  readonly timeoutSeconds?: number | undefined;
  /** Injected by the tests: what each adapter's subject is. */
  readonly subjects?:
    | Partial<Record<ConformanceAdapter, (context: SubjectContext) => Subject>>
    | undefined;
  /** The adapters to read; the manifest's, unless a test hands in its own. */
  readonly adapters?: readonly HarnessAdapter[] | undefined;
  /**
   * What the harness declares, as its registration would (ADR 0046): `--capabilities new_spaces,forks`.
   * The kit then asks it for what those promise (a room, a copy) after the golden scenario.
   */
  readonly capabilities?: readonly string[] | undefined;
}

export interface Conformed {
  readonly report: Report;
  /** Zero when the adapter passed. */
  readonly exitCode: number;
}

/** How long a person is given to start their harness against the address printed. */
const CUSTOM_CONNECT_SECONDS = 120;

/** Where the fake is, for a person to paste into their harness's environment. */
function sayAddress(out: Console, address: ChipsAddress, seconds: number): void {
  out.out("\n  Point your harness at this Chips and let it hear a message:\n");
  for (const line of environmentLines(address)) out.out(`      ${line}`);
  out.out(
    `\n  The scenario plays when it connects, or when it first speaks over HTTP. Waiting up to ${seconds} s.\n`,
  );
}

/** The subject for an adapter: a test's, else the manifest's; an id with neither is refused by name. */
function subjectFor(
  options: ConformanceOptions,
  log: ((line: string) => void) | undefined,
): Subject {
  const adapters = options.adapters ?? harnessAdapters;
  const factory =
    options.subjects?.[options.adapter] ?? adapterFor(options.adapter, adapters)?.subject;
  if (factory === undefined) {
    throw new Error(
      `No such adapter: ${options.adapter}. One of: ${conformanceAdapters(adapters).join(", ")}.`,
    );
  }
  const subject = factory({ log });
  return options.capabilities === undefined
    ? subject
    : { ...subject, capabilities: options.capabilities };
}

/** The report, as a person reads it or as a script does. */
function print(out: Console, report: Report, quiet: boolean): void {
  if (quiet) {
    out.out(JSON.stringify(report, null, 2));
    return;
  }
  out.out("");
  for (const line of formatReport(report)) out.out(line);
  out.out("");
}

export async function conformance(options: ConformanceOptions): Promise<Conformed> {
  const { console: out, adapter } = options;
  const quiet = options.json === true;
  const log = quiet ? undefined : (line: string) => out.out(`  · ${line}`);
  const subject = subjectFor(options, log);
  const seconds = options.timeoutSeconds;

  if (!quiet) out.out(heading(`Conformance · ${adapter}`));
  const report = await runConformance({
    subject,
    port: options.port,
    beatTimeoutMs: seconds === undefined ? undefined : seconds * 1000,
    connectTimeoutMs: (seconds ?? CUSTOM_CONNECT_SECONDS) * 1000,
    onAddress:
      adapter === "custom" && !quiet
        ? (address) => sayAddress(out, address, seconds ?? CUSTOM_CONNECT_SECONDS)
        : undefined,
    log,
  });

  print(out, report, quiet);
  return { report, exitCode: report.passed ? 0 : 1 };
}
