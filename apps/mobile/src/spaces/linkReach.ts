/**
 * What this phone sees when it looks at a link only some devices reach, before it opens one (ADR
 * 0227's addendum of 10 November 2026): whether the name is found, its tunnels (Tailscale's, or
 * another VPN's), and, where the page should be up, whether it answers. The native half is
 * `modules/link-reach`; where it isn't (Android, tests), only the page is asked, and what core's
 * `blockedBy` makes of that is said more plainly.
 */

import { type LinkSeen, nameToLookUp } from "@chipschat/core";
import { requireOptionalNativeModule } from "expo";
import { Linking, Platform } from "react-native";
import { answers } from "./answers";

interface NativeReach {
  readonly tunnels: () => { readonly tailscale: boolean; readonly otherVpn: boolean };
  readonly found: (host: string, ms: number) => Promise<boolean | null>;
}

let native: NativeReach | null | undefined;

function reach(): NativeReach | null {
  if (native === undefined) {
    native =
      Platform.OS === "ios" ? requireOptionalNativeModule<NativeReach>("ChipsLinkReach") : null;
  }
  return native;
}

/** How long a lookup may take before it counts as unknown. */
const LOOKUP_MS = 2000;

/** The phone's tunnels now; nothing where it can't tell. */
export function tunnelsNow(): Pick<LinkSeen, "tailscale" | "otherVpn"> {
  const module = reach();
  if (module === null) return {};
  try {
    return module.tunnels();
  } catch {
    return {};
  }
}

/** Whether the phone can tell what its tunnels are, so the banner can say Tailscale is off. */
export function seesTunnels(): boolean {
  return reach() !== null;
}

/**
 * What the phone sees of a link: the name, the tunnels, and, when `ask` says the page should be
 * up, whether it answers. A phone runs one VPN at a time, so another VPN turns Tailscale off.
 */
export async function look(url: string, ask: boolean, signal: AbortSignal): Promise<LinkSeen> {
  const module = reach();
  const host = nameToLookUp(url);
  const found =
    module === null || host === undefined
      ? undefined
      : ((await module.found(host, LOOKUP_MS).catch(() => null)) ?? undefined);
  const answered = ask && found !== false ? await answers(url, signal) : undefined;
  return { found, answered, ...tunnelsNow(), oneVpn: true };
}

/** Tailscale's own link, which opens its app; the App Store's page for it where none answers. */
const TAILSCALE = "tailscale://";
const TAILSCALE_STORE = "https://apps.apple.com/app/tailscale/id1470499037";

/** Tailscale's app, or the App Store where it isn't installed (or doesn't answer its link). */
export function openTailscale(): void {
  Linking.openURL(TAILSCALE).catch(() => Linking.openURL(TAILSCALE_STORE).catch(() => undefined));
}

/** The App Store's page for Tailscale. */
export function getTailscale(): void {
  Linking.openURL(TAILSCALE_STORE).catch(() => undefined);
}
