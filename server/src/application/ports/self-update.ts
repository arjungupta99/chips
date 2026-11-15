/**
 * A computer from the install line bringing itself to the newest release (everything in step,
 * phase 6): `chips update`, started by the server at night when its owner turned the switch on.
 * The CLI that runs the server holds the hands; a computer in Chips for Mac, or from a checkout,
 * has none.
 */

/** What `chips update` last wrote: going, done, already the newest, or why it couldn't. */
export interface SelfUpdateOutcome {
  readonly state: "updating" | "updated" | "current" | "failed";
  readonly from: string;
  readonly to?: string | undefined;
  readonly at: string;
  readonly why?: string | undefined;
}

export interface SelfUpdate {
  /** `chips update`, started apart from the server so it lives through the server it stops. */
  readonly start: () => void;
  readonly last: () => SelfUpdateOutcome | undefined;
}

/** The owner's switch, "Update this computer automatically": off until an owner turns it on. */
export interface ComputerUpdates {
  readonly automatic: boolean;
  readonly setBy: string | null;
  readonly setAt: string | null;
}

export interface ComputerUpdatesRegistry {
  readonly current: () => Promise<ComputerUpdates>;
  readonly set: (next: {
    readonly automatic: boolean;
    readonly by: string;
    readonly workspaceId: string;
    readonly at: string;
  }) => Promise<void>;
}

/**
 * A computer Chips for Mac carries starting again on the release now in the app (everything in
 * step, phase 5; ADR 0298). The app swaps its bundle whole when it updates itself; the computer,
 * still running the release it started on, starts again on the new one when nothing is going on.
 * The CLI that runs the server holds the hands, for a release inside the app and nothing else.
 */
export interface RestartOnto {
  /** The version of the release now in the app, read from its `VERSION` each time it is asked. */
  readonly onDisk: () => string | undefined;
  /** This computer's login service started again, on what is in the app now. */
  readonly restart: () => void;
}
