/**
 * What a person wants of the gold banner (ADR 0286), as a port.
 *
 * Theirs alone: read and written through `/v1/me/banners`, and by nobody else, an owner or an admin
 * included, as the rooms they hid are.
 */

import type { BannersView } from "@chipschat/protocol";

interface Person {
  readonly workspaceId: string;
  readonly participantId: string;
}

export interface BannerRegistry {
  /** Everything this person has said about the banner; empty when they have said nothing. */
  readonly forPerson: (workspaceId: string, participantId: string) => Promise<BannersView>;
  /** Show it or not for one agent, over what its harness says. */
  readonly choose: (
    input: Person & { readonly target: string; readonly shown: boolean; readonly at: string },
  ) => Promise<void>;
  /** Back to what its harness says. Clearing a choice never made is not an error. */
  readonly unchoose: (input: Person & { readonly target: string }) => Promise<void>;
  /** Show it or not for a harness, and for every one of its agents: those set apart are let go. */
  readonly chooseForHarness: (
    input: Person & {
      readonly harnessId: string;
      readonly agentIds: readonly string[];
      readonly shown: boolean;
      readonly at: string;
    },
  ) => Promise<void>;
  /** Closed for now, for the yes given at `since`. */
  readonly close: (
    input: Person & {
      readonly spaceId: string;
      readonly asker: string;
      readonly since: string;
      readonly at: string;
    },
  ) => Promise<void>;
  /** Shown again. Reopening one never closed is not an error. */
  readonly reopen: (
    input: Person & { readonly spaceId: string; readonly asker: string },
  ) => Promise<void>;
}
