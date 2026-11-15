/**
 * What each device and each harness last said it runs, as a port (everything in step, 13 November
 * 2026). Written as a socket says hello, from the `client` it gives; read by the apps to say who is
 * behind, and by the computer to see what its bridges run.
 */

/** One device's or harness's software, as it last said it. */
export interface SoftwareSeen {
  readonly subjectId: string;
  readonly kind: "device" | "harness";
  /** The person a device is theirs, or the harness itself. */
  readonly participantId: string;
  /** `chips-iphone`, `chips-ipad`, `chips-mac`, `chips-web`, `chips-hermes`, … */
  readonly name: string;
  readonly version: string;
  readonly seenAt: string;
  /** When its version, or its name, last changed. */
  readonly changedAt: string;
}

export interface SoftwareRegistry {
  /**
   * A socket said hello with this client. Written when the name or version changed, or when it
   * was last written more than `freshMs` ago, so a phone that reconnects all day writes little.
   */
  readonly heard: (input: {
    readonly workspaceId: string;
    readonly subjectId: string;
    readonly kind: "device" | "harness";
    readonly participantId: string;
    readonly name: string;
    readonly version: string;
    readonly at: string;
  }) => Promise<void>;
  /** Everything heard in a workspace. */
  readonly list: (workspaceId: string) => Promise<readonly SoftwareSeen[]>;
  /** The workspace a device or harness was last heard in. */
  readonly workspaceOf: (subjectId: string) => Promise<string | undefined>;
}

/** How long a hello with nothing new leaves the row as it is. */
export const SOFTWARE_FRESH_MS = 60 * 60_000;
