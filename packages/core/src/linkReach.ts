/**
 * A link on a space's page to an address only some devices can reach: one through Tailscale, or
 * on a private network (ADR 0227's addendum of 10 November 2026). The Health space's page links to
 * its app at `mac-mini.<tailnet>.ts.net:8443`, which Tailscale on the Mac mini passes on to
 * the app. A phone or computer that isn't on the tailnet can't open it. Before this, Chips handed
 * the link to the browser, which said it couldn't find the server, or waited 20 seconds and said
 * the page wasn't answering yet.
 *
 * What a device looks at, before it opens such a link:
 * - the address: a `.ts.net` name or a 100.64.0.0/10 address goes through Tailscale;
 * - the name: only Tailscale finds a `.ts.net` name, so not found means Tailscale is off here or
 *   something is in its way, and found means this device is on the tailnet;
 * - the device's tunnels, to choose the words: a tunnel with a 100.x address is Tailscale's, one
 *   with any other address another VPN's. Wi-Fi and cellular never count, since some carriers give
 *   a phone a 100.x address too;
 * - the page itself, asked for 3 seconds, only when it should be up.
 *
 * A browser can look at none of this, so it opens the link as it would and says, after, what the
 * link needed. The words are here, so the phone, the Mac and the web say the same.
 */

import type { LinkAsk } from "./programBanner.js";
import { isOwnAddress } from "./programBanner.js";

/** Where an address is: through Tailscale, on a private network, the device itself, or the web. */
export type Network = "tailscale" | "private" | "own" | "web";

/** The device a person is looking at, as the words name it. */
export type ReachDevice = "iPhone" | "iPad" | "Mac" | "computer";

/** Where a web address is; nothing for a link that isn't one. */
export function networkOf(url: string): Network | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  if (isOwnAddress(url)) return "own";
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return ipv4Network(host) ?? ipv6Network(host) ?? nameNetwork(host);
}

/** An address given as four numbers: Tailscale's 100.64.0.0/10, a private range, or the web. */
function ipv4Network(host: string): Network | undefined {
  const four = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (four === null) return undefined;
  const a = Number(four[1]);
  const b = Number(four[2]);
  if (a === 100 && b >= 64 && b <= 127) return "tailscale";
  const ten = a === 10;
  const twelve = a === 172 && b >= 16 && b <= 31;
  const sixteen = (a === 192 && b === 168) || (a === 169 && b === 254);
  return ten || twelve || sixteen ? "private" : "web";
}

/** An IPv6 address: Tailscale's own range, a private or link-local one; nothing for a name. */
function ipv6Network(host: string): Network | undefined {
  if (!host.includes(":")) return undefined;
  if (host.startsWith("fd7a:115c:a1e0:")) return "tailscale";
  return /^f[cd][0-9a-f]{2}:/.test(host) || host.startsWith("fe80:") ? "private" : "web";
}

/** A name: a tailnet's, a home network's, or the web's. */
function nameNetwork(host: string): Network {
  if (host.endsWith(".ts.net")) return "tailscale";
  return [".local", ".home.arpa", ".lan"].some((end) => host.endsWith(end)) ? "private" : "web";
}

/** Whether a device has to look before it opens the address: Tailscale's, or a private one. */
export function needsLooking(url: string): boolean {
  const network = networkOf(url);
  return network === "tailscale" || network === "private";
}

/** The name a device looks up for an address; nothing for one given as numbers. */
export function nameToLookUp(url: string): string | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return undefined;
  }
  return /^[\d.]+$/.test(host) || host.includes(":") ? undefined : host;
}

/** The address as the words name it: a tailnet name's machine, else the host. */
export function hostShown(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
  if (host.endsWith(".ts.net")) return host.split(".")[0] ?? host;
  return host;
}

/** What a device saw when it looked. Each is unknown where the device couldn't look. */
export interface LinkSeen {
  /** The address's name was found. Unknown for an address given as numbers. */
  readonly found?: boolean | undefined;
  /** The page answered. Unknown where it wasn't asked, as while the program isn't running. */
  readonly answered?: boolean | undefined;
  /** The device has a tunnel with a Tailscale (100.x) address. */
  readonly tailscale?: boolean | undefined;
  /** The device has a tunnel with any other address: another VPN. */
  readonly otherVpn?: boolean | undefined;
  /** Tailscale is installed, where the device can tell. */
  readonly installed?: boolean | undefined;
  /** The device runs one VPN at a time (an iPhone or iPad), so another VPN turns Tailscale off. */
  readonly oneVpn?: boolean | undefined;
}

/** What stands between the device and the link. */
export type Blocked =
  | "tailscale-off"
  | "other-vpn"
  | "not-installed"
  | "vpn-in-way"
  | "mac-quiet"
  | "their-tailnet"
  | "private";

/**
 * What stands in the way of a link, from what the device saw; nothing when nothing does, or when
 * what it saw doesn't say. For somebody who isn't the workspace's owner, Tailscale's is the
 * owner's network (ADR 0231): a name they can't find is on a tailnet they aren't on.
 */
export function blockedBy(
  network: Network | undefined,
  seen: LinkSeen,
  owner: boolean,
): Blocked | undefined {
  if (seen.answered === true) return undefined;
  if (network === "private") {
    return seen.found === false || seen.answered === false ? "private" : undefined;
  }
  if (network !== "tailscale") return undefined;
  const missing = nameMissing(seen);
  if (!owner) return missing ? "their-tailnet" : undefined;
  if (missing) return whyMissing(seen);
  return seen.answered === false ? "mac-quiet" : undefined;
}

/**
 * The tailnet's name isn't there for this device: not found, or, for an address given as numbers,
 * the page didn't answer and there's no Tailscale tunnel to have carried it.
 */
function nameMissing(seen: LinkSeen): boolean {
  if (seen.found !== undefined) return !seen.found;
  return seen.answered === false && seen.tailscale !== true;
}

/** Why the tailnet's name is missing, as far as the device can tell. */
function whyMissing(seen: LinkSeen): Blocked {
  if (seen.tailscale === true) return "vpn-in-way";
  if (seen.installed === false) return "not-installed";
  if (seen.otherVpn === true && seen.oneVpn === true) return "other-vpn";
  return "tailscale-off";
}

/** Whether the device is now on the way to the link: the name found, or the page answering. */
export function cleared(seen: LinkSeen): boolean {
  return seen.answered === true || seen.found === true;
}

/** Where the sheet is, for a link the device has to reach first. */
export type ReachKind = Blocked | "tailscale-wait" | "reaching";

/** Whether a sheet's kind is one of these. */
export function isReachKind(kind: string): kind is ReachKind {
  return (REACH_KINDS as readonly string[]).includes(kind);
}

const REACH_KINDS = [
  "tailscale-off",
  "other-vpn",
  "not-installed",
  "vpn-in-way",
  "mac-quiet",
  "their-tailnet",
  "private",
  "tailscale-wait",
  "reaching",
] as const;

/** What the sheet's words are said about. */
export interface ReachSaid {
  /** The link's name, as the page says it; "This link" where it says none. */
  readonly name?: string | undefined;
  readonly device: ReachDevice;
  /** The tapped address. */
  readonly url: string;
  /** The person's program isn't running, so even with Tailscale on the page wouldn't answer. */
  readonly stopped?: boolean | undefined;
  /** The workspace's owner, for somebody who isn't. */
  readonly ownerName?: string | undefined;
}

export const OPEN_TAILSCALE = "Open Tailscale";
export const GET_TAILSCALE = "Get Tailscale";
export const TRY_AGAIN = "Try again";

/** How long the page has to answer, once the device should reach it. */
export const REACH_ANSWER_MS = 3000;

/** How long a sheet waits before it shows that it's opening, so a quick answer shows nothing. */
export const REACH_SHOWS_MS = 600;

/** How often a sheet waiting for Tailscale looks again. */
export const REACH_LOOKS_MS = 1500;

/** How long, after Tailscale came on, the page has to answer: the tunnel is new. */
export const REACH_AFTER_MS = 10_000;

/** A phone is tapped; a computer is clicked. */
function verbOf(device: ReachDevice): string {
  return device === "iPhone" || device === "iPad" ? "tap" : "click";
}

/** The sheet's words for a link the device has to reach first. */
export function reachAsk(kind: ReachKind, said: ReachSaid): LinkAsk<ReachKind> {
  const Name = said.name ?? "This link";
  const it = said.name ?? "the page";
  const It = said.name ?? "The page";
  const host = hostShown(said.url);
  const device = said.device;
  const owner = said.ownerName ?? "the owner";
  const Owner = said.ownerName ?? "The owner";
  const needs = `${Name} needs Tailscale`;
  switch (kind) {
    case "tailscale-off":
      return {
        kind,
        title: needs,
        body:
          said.stopped === true
            ? `Tailscale is off on this ${device}, and the program isn’t running. Turn Tailscale on first.`
            : `Tailscale is off on this ${device}. Turn it on, and Chips opens ${it}.`,
        tone: "plain",
        go: OPEN_TAILSCALE,
        opens: "tailscale",
        anyway: true,
      };
    case "other-vpn":
      return {
        kind,
        title: needs,
        body: `Another VPN is on. Your ${device} runs one VPN at a time, so turning on Tailscale turns the other one off.`,
        tone: "plain",
        go: OPEN_TAILSCALE,
        opens: "tailscale",
        anyway: true,
      };
    case "not-installed":
      return {
        kind,
        title: needs,
        body: `Tailscale isn’t on this ${device}. Get it, sign in with the account your Mac uses, and ${verbOf(device)} ${said.name ?? "the link"} again.`,
        tone: "plain",
        go: GET_TAILSCALE,
        opens: "get",
        anyway: true,
      };
    case "tailscale-wait":
      return {
        kind,
        title: "Waiting for Tailscale",
        body: `${It} opens once this ${device} is on your tailnet.`,
        tone: "plain",
        go: OPEN_TAILSCALE,
        opens: "tailscale",
        anyway: true,
      };
    case "reaching":
      return {
        kind,
        title: `Opening ${it}`,
        body: "Tailscale is on.",
        tone: "plain",
        go: OPEN_TAILSCALE,
        busy: true,
        anyway: false,
      };
    case "vpn-in-way":
      return {
        kind,
        title: `This ${device} can’t find ${host}`,
        body: "Tailscale is on, but the name isn’t found. Its DNS setting may be off, or another VPN may be in the way.",
        tone: "bad",
        go: TRY_AGAIN,
        opens: "again",
        anyway: true,
      };
    case "mac-quiet":
      return {
        kind,
        title: "Your Mac didn’t answer",
        body: `This ${device} is on Tailscale, but ${host} didn’t answer. Check that Tailscale is on on your Mac.`,
        tone: "bad",
        go: TRY_AGAIN,
        opens: "again",
        anyway: true,
      };
    case "their-tailnet":
      return {
        kind,
        title: `${Name} is on ${owner}’s tailnet`,
        body: `It opens only on devices on ${owner}’s Tailscale network. ${Owner} can share that Mac with you from Tailscale.`,
        tone: "plain",
        anyway: true,
      };
    default:
      return {
        kind: "private",
        title: `${Name} is on a private network`,
        body: `This ${device} can’t reach ${host} from here. It opens on the same Wi-Fi as ${said.ownerName === undefined ? "your" : `${said.ownerName}’s`} Mac.`,
        tone: "plain",
        go: TRY_AGAIN,
        opens: "again",
        anyway: true,
      };
  }
}

/**
 * The banner's line while the page has links through Tailscale and this device isn't on it: said
 * before a tap that couldn't work. Nothing once Tailscale is on.
 */
export function reachLine(running: boolean, device: ReachDevice): string {
  return running
    ? `Links here need Tailscale, which is off on this ${device}.`
    : `Links here need it running, and Tailscale, which is off on this ${device}.`;
}

/** How long a browser says what a link it opened needed. */
export const REACH_NOTE_MS = 8000;

/**
 * What a browser says after it opened a link it couldn't look at first: what the link needed,
 * should it not have opened. Nothing for a link on the web.
 */
export function reachNote(url: string, name: string | undefined): string | undefined {
  const network = networkOf(url);
  const Name = name ?? "This link";
  if (network === "tailscale") {
    return `${Name} goes through Tailscale. If it didn’t open, turn Tailscale on on this computer.`;
  }
  if (network === "private") {
    return `${Name} is on a private network. If it didn’t open, this computer can’t reach ${hostShown(url)} from here.`;
  }
  return undefined;
}

/** The longest a link's name is said in a title; a longer one is "This link". */
const NAME_MOST = 40;

/**
 * A link's name, from the words the page gave it (the page builder's `data-chips-words`): one
 * line, without a trailing arrow, and short enough for a title.
 */
export function linkName(words: string | null | undefined): string | undefined {
  if (typeof words !== "string") return undefined;
  const name = words
    .replace(/\s+/g, " ")
    .replace(/[\s→›»>…:·•|-]+$/u, "")
    .trim();
  if (name === "" || name.length > NAME_MOST) return undefined;
  return name;
}

/** The same address, however it is written: the web view adds a slash a page may leave out. */
function sameAddress(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a === b;
  }
}

/** An attribute's text, as the page builder wrote it. */
function unescaped(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** One attribute of a tag the page builder wrote, double-quoted as it writes them. */
function attrOf(tag: string, name: string): string | undefined {
  const found = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag);
  return found === null || found[1] === undefined ? undefined : unescaped(found[1]);
}

/** The page's links, each with the words the page builder gave it. */
function linksOf(html: string): { readonly href: string; readonly words?: string | undefined }[] {
  const links: { href: string; words?: string | undefined }[] = [];
  for (const tag of html.match(/<a\s[^>]*>/gi) ?? []) {
    const href = attrOf(tag, "href");
    if (href !== undefined) links.push({ href, words: attrOf(tag, "data-chips-words") });
  }
  return links;
}

/**
 * The name of a tapped link, read from the page it was tapped on, where the phone hears only the
 * address: the one name every link to that address has, or nothing where they differ.
 */
export function linkNameIn(html: string, url: string): string | undefined {
  const names = new Set(
    linksOf(html)
      .filter((link) => sameAddress(link.href, url))
      .map((link) => linkName(link.words) ?? ""),
  );
  if (names.size !== 1) return undefined;
  const [name] = names;
  return name === "" ? undefined : name;
}

/** Whether a page links to an address through Tailscale, so its banner can say Tailscale is off. */
export function linksThroughTailscale(html: string): boolean {
  return linksOf(html).some((link) => networkOf(link.href) === "tailscale");
}
