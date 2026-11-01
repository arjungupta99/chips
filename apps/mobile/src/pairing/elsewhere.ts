/**
 * A pairing that names another server than the one this phone holds (SEC-8): a `chips://pair`
 * link with somebody else's address in it, or "Ask to join" on a server found on the Wi-Fi while
 * the phone is in a workspace already. Either would have switched the phone in silence, and a
 * tapped link is exactly how a stranger's server would get a phone to pair with it. So the phone
 * asks first, naming both servers, in the words `ConfirmBody` draws. Pure, so it is tested
 * without a phone.
 */

import type { Asking } from "@chipschat/core";

export interface Elsewhere {
  /** The server the link or the row names. */
  readonly server: string;
  /** What that server calls itself, when the Wi-Fi said; the link says nothing. */
  readonly name?: string | undefined;
  /** The server this phone is paired with; absent for a device paired before there was one. */
  readonly heldServer: string | undefined;
  /** The workspace this phone is in, as its label reads. */
  readonly workspace: string;
  /** "this phone" or "this iPad". */
  readonly device: string;
}

/** `http://Host:4431/anything` → `host:4431`; what is not an address comes back as it is. */
export function hostOf(address: string): string {
  const trimmed = address.trim();
  return (/^https?:\/\/([^/?#]+)/i.exec(trimmed)?.[1] ?? trimmed).toLowerCase();
}

/** Whether a pairing would switch the phone to another server than the one it holds. */
export function isElsewhere(heldServer: string | undefined, server: string): boolean {
  if (heldServer === undefined || heldServer.trim() === "") return false;
  return hostOf(heldServer) !== hostOf(server);
}

/** The question, and what each answer is called. */
export function elsewhereAsking(ask: Elsewhere, by: "link" | "wifi"): Asking {
  const there = ask.name === undefined ? hostOf(ask.server) : `${ask.name} (${hostOf(ask.server)})`;
  const here =
    ask.heldServer === undefined ? ask.workspace : `${ask.workspace} on ${hostOf(ask.heldServer)}`;
  const how = by === "link" ? "This link pairs" : "Asking to join pairs";
  const device = ask.device.charAt(0).toUpperCase() + ask.device.slice(1);
  return {
    title: "Another Chips?",
    body: `${how} ${ask.device} with Chips at ${there}, not with ${here}, where it is now. ${device} would keep ${ask.workspace}, switch to ${there}, and show whatever it says is yours.`,
    note: `A link you didn't expect, or a server you don't know, is a reason to stop here.`,
    confirm: `Switch to ${hostOf(ask.server)}`,
  };
}
