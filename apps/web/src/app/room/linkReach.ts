/**
 * What Chips for Mac sees when it looks at a link only some devices reach, before it opens one
 * (ADR 0227's addendum of 10 November 2026): whether the name is found, the Mac's tunnels
 * (Tailscale's, or another VPN's), whether Tailscale is installed, and, where the page should be
 * up, whether it answers. The shell's half is `reach.rs`. A browser can look at none of it, and a
 * shell built before it says nothing, so the link opens as it did.
 */

import { type LinkSeen, nameToLookUp } from "@chipschat/core";
import { desktop } from "../../native.ts";
import { answers } from "./answers.ts";

/** What the Mac sees of a link; nothing where it can't look. */
export async function lookOnMac(
  url: string,
  ask: boolean,
  signal: AbortSignal,
): Promise<LinkSeen | undefined> {
  const shell = await desktop();
  const seen = await shell?.linkReach?.(nameToLookUp(url)).catch(() => undefined);
  if (seen === undefined) return undefined;
  const answered = ask && seen.found !== false ? await answers(url, signal) : undefined;
  return { ...seen, answered };
}

/** The Mac's tunnels now; nothing where it can't tell. */
export async function tunnelsOnMac(): Promise<Pick<LinkSeen, "tailscale"> | undefined> {
  const shell = await desktop();
  const seen = await shell?.linkReach?.(undefined).catch(() => undefined);
  return seen === undefined ? undefined : { tailscale: seen.tailscale };
}

/** Tailscale on the Mac, or its download page. */
export function openTailscaleOnMac(get: boolean): void {
  void desktop().then((shell) => shell?.openTailscale?.(get));
}
