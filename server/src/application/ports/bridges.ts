/**
 * The bridges in this computer's own data folder, which it keeps current itself
 * (`docs/proposals/bridges-keep-current.md`, A). The CLI that started the server holds the hands:
 * it lists them from `<data>/bridges/*`, unpacks a release beside the one running, points
 * `package` at it and starts one service again. The server decides which release and when.
 */

/** How one service's last update went, kept in the package's journal with the service's label. */
export interface BridgeOutcome {
  readonly outcome: "updated" | "put-back" | "refused";
  readonly from: string;
  readonly to: string;
  readonly at: string;
  /**
   * Why it was put back or refused, in a word: see `BridgeRefusal`. Put back, it didn't come back
   * (`no-return`), its service stopped more than three times in its first day (`exits`), or its
   * first turns all failed where the one before the switch hadn't (`turns`).
   */
  readonly reason?: BridgeRefusalReason | "no-return" | "exits" | "turns" | undefined;
  /** For `harness`: the oldest release of the harness behind it that the bridge release works with. */
  readonly needs?: string | undefined;
}

/** A service switched to a release and not yet seen to come back. */
export interface BridgeTrying {
  readonly label: string;
  readonly harnessId: string;
  readonly from: string;
  readonly to: string;
  readonly at: string;
}

/**
 * A service that came back on a release less than a day ago (rule 3): still watched for a service
 * that keeps stopping and for turns that all fail, and put back on `from` if so.
 */
export interface BridgeProving {
  readonly harnessId: string;
  readonly from: string;
  readonly to: string;
  /** When it was switched. */
  readonly since: string;
}

/** One card kept running on a bridge: its service, and the harness it joined as. */
export interface KeptBridge {
  readonly id: string;
  readonly label: string;
  /** From the key it kept when it joined; none when this machine holds no key for it. */
  readonly harnessId: string | undefined;
  /** The release its service was last started on by an update; none before the first. */
  readonly startedOn: string | undefined;
}

export interface LocalBridge {
  readonly package: string;
  /** The major the card naming it speaks; none when no card here names it now. */
  readonly major: number | undefined;
  /** The release `package` points at; none in a folder an older Chips unpacked. */
  readonly inUse: string | undefined;
  /** The release `bridge.json` names, which an older Chips kept in a plain folder. */
  readonly recorded: string;
  readonly previous: string | undefined;
  /** The releases unpacked here. */
  readonly staged: readonly string[];
  /**
   * The checksum each of them was checked against when it was fetched, by version. One unpacked
   * with no checksum kept is not here to switch to until it is fetched and checked again.
   */
  readonly verified: Readonly<Record<string, string>>;
  readonly kept: readonly KeptBridge[];
  /** Releases put back, each skipped until the time it names. */
  readonly skips: Readonly<Record<string, string>>;
  readonly trying: BridgeTrying | undefined;
  /** The services in their first day on a release, by label. */
  readonly proving: Readonly<Record<string, BridgeProving>>;
  /** By label. */
  readonly last: Readonly<Record<string, BridgeOutcome>>;
}

export type BridgeRefusalReason =
  | "node"
  | "room"
  | "permission"
  | "busy"
  | "registry"
  | "checksum"
  | "unlisted"
  | "harness";

/** Why a release couldn't be taken, before anything that runs changed. */
export class BridgeRefusal extends Error {
  override readonly name = "BridgeRefusal";
  constructor(
    readonly reason: BridgeRefusalReason,
    message: string,
    /** For `harness`: the oldest release of the harness the bridge release works with. */
    readonly needs?: string | undefined,
  ) {
    super(message);
  }
}

/**
 * What the journal is told: each field present is written, `trying: null` clears it, and a
 * service's `proving` said as `null` ends its first day.
 */
export interface JournalChange {
  readonly skip?: { readonly version: string; readonly until: string } | undefined;
  readonly trying?: BridgeTrying | null | undefined;
  readonly outcome?: { readonly label: string; readonly said: BridgeOutcome } | undefined;
  readonly proving?: { readonly label: string; readonly said: BridgeProving | null } | undefined;
}

/**
 * What the harness page says of a kept bridge (rule 11). `off`: its owner turned "Keep this
 * bridge up to date" off, and `target` is out.
 */
export interface BridgeUpdateState {
  readonly package: string;
  readonly running: string;
  readonly phase: "current" | "waiting" | "watching" | "refused" | "off";
  /** The release it is waiting to take, being watched on, couldn't take, or would take if on. */
  readonly target?: string | undefined;
  readonly since: string;
  readonly reason?: BridgeRefusalReason | undefined;
  /** For a release refused for its harness: the oldest release of the harness it works with. */
  readonly needs?: string | undefined;
  /** How the last update went. */
  readonly last?: BridgeOutcome | undefined;
}

export interface BridgeHands {
  readonly list: () => Promise<readonly LocalBridge[]>;
  /**
   * The release fetched from npm, its SHA-512 checked against `integrity` (the signed list's) and
   * the registry's both, and unpacked beside the one running. Throws a `BridgeRefusal`.
   */
  readonly stage: (pkg: string, version: string, integrity: string) => Promise<void>;
  /**
   * The release of the harness behind a kept service, as the harness's own command says it
   * (`hermes --version`), for a bridge release that names the oldest it works with (rule 13).
   * None where it can't be told: the harness has no command here, or it didn't answer.
   */
  readonly harnessVersion: (pkg: string, label: string) => Promise<string | undefined>;
  /**
   * How many times this login's service manager has started the service: launchd's `runs`, or
   * systemd's count of its own restarts. One more each time the bridge stops and is started
   * again. None where neither says.
   */
  readonly starts: (label: string) => Promise<number | undefined>;
  /**
   * `package` pointed at a staged release and the one service started again on it, with
   * `trying` written to the journal first. Whether it started.
   */
  readonly switchTo: (
    pkg: string,
    label: string,
    version: string,
    trying: BridgeTrying | null,
  ) => Promise<boolean>;
  readonly note: (pkg: string, change: JournalChange) => Promise<void>;
}

/**
 * The owner's switch on a harness page, "Keep this bridge up to date" (everything in step): on
 * unless an owner turned it off. Off, the computer leaves the bridge on the release it runs.
 */
export interface BridgeSwitches {
  /** The harnesses whose switch is off. */
  readonly off: () => Promise<ReadonlySet<string>>;
  readonly set: (next: {
    readonly harnessId: string;
    readonly workspaceId: string;
    readonly keepCurrent: boolean;
    readonly by: string;
    readonly at: string;
  }) => Promise<void>;
}
