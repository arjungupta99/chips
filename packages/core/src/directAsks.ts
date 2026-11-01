/**
 * Direct asks, as the client holds them (ADR 0211, Phase 3): a guest's ask that the owners share
 * the server's machine with them in Tailscale, and an owner's answer, Tailscale's share link.
 * The wire's shape, the client's, and which ask an owner is shown next.
 */

import { type DirectAskView, FIRST_PERSON_NAME } from "@chipschat/protocol";
import { type Directory, nameOf } from "./events.js";
import { ServerRefused } from "./transport.js";

export type { DirectAskView };
export type DirectAskState = DirectAskView["state"];

/** A guest's own ask, as the guide reads it: where it is, when it was made, who answered. */
export interface AskSeen {
  readonly state: DirectAskState;
  readonly askedAt: string;
  /** The owner who shared, by name. */
  readonly sharer?: string | undefined;
  /** Tailscale's invite, once shared. */
  readonly link?: string | undefined;
}

export interface DirectAsk {
  readonly askId: string;
  /** Who asked. */
  readonly participantId: string;
  readonly state: DirectAskState;
  /** Their round trip through the relay when they asked, in milliseconds. */
  readonly tripMs: number | undefined;
  /** Tailscale's share link, once an owner has answered: the asker's to open, and owners'. */
  readonly link: string | undefined;
  /** The owner who answered. */
  readonly sharedBy: string | undefined;
  readonly askedAt: string;
  readonly sharedAt: string | undefined;
}

export function directAskOf(view: DirectAskView): DirectAsk {
  return {
    askId: view.ask_id,
    participantId: view.participant_id,
    state: view.state,
    tripMs: view.trip_ms ?? undefined,
    link: view.link ?? undefined,
    sharedBy: view.shared_by ?? undefined,
    askedAt: view.asked_at,
    sharedAt: view.shared_at ?? undefined,
  };
}

/** The oldest ask still waiting that this device has not shown yet, for an owner's sheet. */
export function nextDirectAsk(
  asks: ReadonlyMap<string, DirectAsk> | undefined,
  shown: ReadonlySet<string>,
): DirectAsk | undefined {
  return [...(asks?.values() ?? [])]
    .filter((ask) => ask.state === "asked" && !shown.has(ask.askId))
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt))[0];
}

/**
 * The owner who shared, by name, or nothing for one who has not named themselves: a guest should
 * not read "You shared it" of somebody else (JR-17).
 */
export function sharerOf(ask: DirectAsk, directory: Directory): string | undefined {
  if (ask.sharedBy === undefined) return undefined;
  const name = nameOf(directory, ask.sharedBy);
  return name === FIRST_PERSON_NAME ? undefined : name;
}

/** A guest's own ask as their guide reads it, with the owner who shared it by name. */
export function askSeen(ask: DirectAsk | undefined, directory: Directory): AskSeen | undefined {
  if (ask === undefined) return undefined;
  return {
    state: ask.state,
    askedAt: ask.askedAt,
    link: ask.link,
    sharer: sharerOf(ask, directory),
  };
}

/**
 * Why an ask was not taken, in words: a server older than direct asks has no such route and says
 * "No route matches that.", which tells a guest nothing.
 */
export function askRefusedWords(error: unknown): string {
  if (error instanceof ServerRefused && error.status === 404) {
    return "Your server can't take asks yet. Chips on it needs updating first.";
  }
  return error instanceof Error ? error.message : String(error);
}
