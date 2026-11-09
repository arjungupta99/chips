/**
 * An agent's own Permissions page (ADR 0286): what it may do right now, the banner, what its harness
 * lets it do always, and what it has asked. The words and the readers behind the page, so the phone,
 * the web and the Mac say the same thing.
 *
 * An agent is in one space at a time (ADR 0087), so a yes that holds on is one yes. Allowed always
 * stays with the harness, as the policy keeps it, so the page shows the rules that reach this agent
 * and says they are shared.
 */

import { roomOf } from "./agentsTab.js";
import {
  type AlwaysRule,
  type AskHistory,
  agentAskHistory,
  alwaysRules,
  askingOpening,
  asksGoTo,
  holdsWords,
  STILL_ASKS,
} from "./asking.js";
import {
  type AgentBannerRow,
  agentBannerRow,
  type Banners,
  bannerClosed,
  bannerWanted,
  NO_BANNERS,
} from "./banners.js";
import { type Directory, harnessOf, nameOf } from "./events.js";
import { lettingWork, mayTurnDial } from "./model/readers.js";
import type { LetWork, Space, WorkspaceModel } from "./model/types.js";
import { roomName } from "./rooms.js";

export const PERMISSIONS_TITLE = "Permissions";
export const NOT_ASKING_WORDS = "Not asking";
export const BANNER_OFF_WORDS = "Banner off";
export const BANNER_HEADING = "Banner";
export const BANNER_ROW_WORDS = "Show the banner";
export const BANNER_FOOT =
  "This only changes what you see, on all your devices. Anyone else in a shared space keeps their own.";
export const NOTHING_IN_SPACE_WORDS = "Nothing shows in the space.";
export const SHOW_AGAIN_WORDS = "Show again";
export const STOP_WORDS = "Stop";
export const LET_IT_WORK_WORDS = "Let it work…";
export const HARNESS_BANNERS_ROW = "Show banners";
export const HARNESS_BANNERS_FOOT =
  "The gold banner shows in a space while one of these agents works without asking. Turning this on or off applies to every agent, and to any made later.";
export const HARNESS_LINK_LINE = "Its rules, and the banner for all its agents";

export interface AgentPermissions {
  readonly agentId: string;
  readonly name: string;
  readonly harnessId: string;
  readonly harnessName: string;
  /** The open space it is in, when it is in one the reader can see. */
  readonly space: { readonly id: string; readonly name: string } | undefined;
  /** The yes that lets it work without asking there, while one holds. */
  readonly held: LetWork | undefined;
  readonly headline: string;
  readonly sub: string;
  /** Who the art shows the asks going to. */
  readonly to: string;
  /** Let it work is offered: the person whose agent it is, or an owner or an admin. */
  readonly mayLetWork: boolean;
  /** Stop is offered: anybody in the space may bring the asks back to a person. */
  readonly mayStop: boolean;
  /** What Let it work says it will do, before anything changes. */
  readonly confirmWords: string;
  readonly confirmButton: string;
  readonly banner: AgentBannerRow & {
    /** The banner it shows when it shows, as the little picture draws it. */
    readonly preview: string;
    /** Whether the server keeps a person's choices; an older one doesn't. */
    readonly mayChoose: boolean;
    /** Closed for now: where, and when it comes back. Absent while it isn't. */
    readonly closed: { readonly title: string; readonly line: string } | undefined;
  };
  readonly rules: readonly AlwaysRule[];
  readonly rulesFoot: string;
  readonly mayChangeRules: boolean;
  readonly history: AskHistory | undefined;
}

/** What the page reads of the store's snapshot. */
export interface PermissionsInput {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly banners?: Banners | undefined;
  readonly keepsBanners?: boolean | undefined;
  readonly keepsHeldStart?: boolean | undefined;
}

function openSpaceOf(input: PermissionsInput, agentId: string): Space | undefined {
  const agent = input.directory[agentId];
  if (agent === undefined || typeof agent.room !== "string") return undefined;
  const space = input.model.spaces.find((each) => each.id === roomOf(agent));
  return space?.state === "open" ? space : undefined;
}

function heldHere(space: Space | undefined, agentId: string, now: number): LetWork | undefined {
  return space === undefined
    ? undefined
    : lettingWork(space, now).find((held) => held.asker === agentId);
}

/** What the top of the page says: not in a space, asking, or working without asking. */
function pageWords(
  name: string,
  space: { readonly name: string } | undefined,
  held: LetWork | undefined,
  opening: { readonly headline: string; readonly sub: string },
): { readonly headline: string; readonly sub: string } {
  if (space === undefined) {
    return {
      headline: `${name} isn't in a space right now.`,
      sub: "It has nothing to ask until it is put in one.",
    };
  }
  if (held === undefined) return opening;
  return {
    headline: `${name} is working without asking in ${space.name}.`,
    sub: `${holdsWords(held)}. ${STILL_ASKS}`,
  };
}

/** Let it work is offered while no yes holds, to the agent's person or an owner or an admin. */
function mayLetItWork(
  input: PermissionsInput,
  harnessId: string,
  selfId: string | undefined,
  inSpace: boolean,
): boolean {
  if (!inSpace || input.keepsHeldStart === false || selfId === undefined) return false;
  return input.directory[harnessId]?.ownerId === selfId || mayTurnDial(input.model, selfId);
}

/** The page for one agent, from where the reader stands. */
export function agentPermissions(
  input: PermissionsInput,
  agentId: string,
  selfId: string | undefined,
  now: number = Date.now(),
): AgentPermissions {
  const { model, directory } = input;
  const banners = input.banners ?? NO_BANNERS;
  const name = nameOf(directory, agentId);
  const harnessId = harnessOf(directory, agentId);
  const harnessName = nameOf(directory, harnessId);
  const open = openSpaceOf(input, agentId);
  const spaceName = open === undefined ? undefined : roomName(model, open.id, directory);
  const space = open === undefined ? undefined : { id: open.id, name: spaceName as string };
  const held = heldHere(open, agentId, now);
  const to = asksGoTo(directory, harnessId, selfId);
  const words = pageWords(name, space, held, askingOpening(name, to));
  const closedIn =
    open !== undefined && held !== undefined && bannerClosed(banners, open.id, held)
      ? space
      : undefined;
  const row = agentBannerRow(banners, directory, agentId);
  return {
    agentId,
    name,
    harnessId,
    harnessName,
    space,
    held,
    headline: words.headline,
    sub: words.sub,
    to: to.kind === "you" ? "You" : to.kind === "owner" ? to.name : "A person",
    mayLetWork: held === undefined && mayLetItWork(input, harnessId, selfId, space !== undefined),
    mayStop: held !== undefined,
    confirmWords: `Everything ${name} asks in ${space?.name ?? "its space"} will go ahead without a card until you stop it, commands Chips can't read too. ${STILL_ASKS}`,
    confirmButton: `Let ${name} work`,
    banner: {
      ...row,
      preview: `${name} is working without asking`,
      mayChoose: input.keepsBanners !== false,
      closed:
        closedIn !== undefined && row.shown
          ? { title: `Closed in ${closedIn.name}`, line: `Until ${name} is given a new yes` }
          : undefined,
    },
    rules: alwaysRules(model, directory, harnessId, selfId, now).filter(
      (rule) => rule.spaceId === undefined || rule.spaceId === open?.id,
    ),
    rulesFoot: `These belong to ${harnessName}, so all its agents follow them.`,
    mayChangeRules: mayTurnDial(model, selfId),
    history: agentAskHistory(model, directory, agentId, selfId, now),
  };
}

/** The row on an agent's page: what it says beside the word, and the line under it. */
export function permissionsRow(
  input: PermissionsInput,
  agentId: string,
  now: number = Date.now(),
): { readonly value: string; readonly working: boolean; readonly sub: string | undefined } {
  const banners = input.banners ?? NO_BANNERS;
  const space = openSpaceOf(input, agentId);
  const held = heldHere(space, agentId, now);
  const wanted = bannerWanted(banners, input.directory, agentId);
  const sub = !wanted
    ? BANNER_OFF_WORDS
    : space !== undefined && held !== undefined && bannerClosed(banners, space.id, held)
      ? "Banner closed for now"
      : undefined;
  return {
    value:
      held === undefined
        ? "Asks you"
        : held.until === undefined
          ? NOT_ASKING_WORDS
          : holdsWords(held),
    working: held !== undefined,
    sub,
  };
}
