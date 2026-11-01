/**
 * Who can reach Chips directly: the one question `chips up` asks (ADR 0121).
 *
 * A phone away from home reaches Chips through the relay, when the server has one
 * (`CHIPS_RELAY_URL`, ADRs 0144 and 0191), whatever the answer here. Without one, there is a
 * fourth answer (ADR 0245): your devices from anywhere through the Chips relay, which sets
 * `CHIPS_RELAY_URL` to it and is also on this Wi-Fi directly when there is one. It is the first
 * answer on a machine with no tailnet, and after the Wi-Fi on one with. Over Tailscale, when this
 * machine is on a tailnet, reaches your devices at home and away without the relay. On this Wi-Fi
 * reaches a phone in the house. Only this machine reaches nothing else directly, which is the
 * default for anything that cannot be asked. All but the last bind every address when there is a
 * home network, so the server is also on it when Tailscale is chosen, and `chips up` says so
 * rather than implying otherwise. With no home network, Tailscale's answer binds the tailnet
 * address alone: on a VPS, every address includes the public one, over plain HTTP.
 *
 * What a machine has is read here, from what `tailscale ip -4` printed and from the interfaces
 * Node lists, so a test hands both in.
 */

import type { NetworkInterfaceInfo } from "node:os";
import { CHIPS_RELAY, isVirtualInterface } from "@chipschat/platform";

export type Reach = "tailnet" | "lan" | "relay" | "local";
export const REACHES: readonly Reach[] = ["tailnet", "lan", "relay", "local"];

export interface ReachChoice {
  readonly reach: Reach;
  /** What the server binds. */
  readonly host: string;
  /** What a phone is told to dial, and what `CHIPS_PUBLIC_URL` is set to. */
  readonly publicUrl: string | undefined;
  /** The relay this answer sets `CHIPS_RELAY_URL` to: Chips's, for the relay answer. */
  readonly relay?: string | undefined;
  /** The line a person picks from. */
  readonly label: string;
  /** The line `chips up` prints once it is chosen. */
  readonly done: string;
}

/** What this machine is on, as far as reaching it goes. */
export interface Networks {
  /** Its tailnet address, `100.x.y.z`, when Tailscale is up. */
  readonly tailnet: string | undefined;
  /** Its home-network address, an RFC 1918 one, when it has one. */
  readonly lan: string | undefined;
}

/** The tailnet address in what `tailscale ip -4` printed: the CGNAT range Tailscale uses. */
export function tailnetAddress(printed: string): string | undefined {
  for (const line of printed.split("\n")) {
    const address = line.trim();
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(address)) return address;
  }
  return undefined;
}

/** An RFC 1918 address, as a home network hands out. */
export function isHomeAddress(address: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

/**
 * The first home-network address among this machine's interfaces. Not a container's or a VM's
 * bridge: on a VPS with a public `eth0`, Docker's `172.17.0.1` was "this Wi-Fi".
 */
export function lanAddress(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string | undefined {
  for (const [name, addresses] of Object.entries(interfaces)) {
    const home = isVirtualInterface(name) ? undefined : homeAddressIn(addresses ?? []);
    if (home !== undefined) return home;
  }
  return undefined;
}

function homeAddressIn(addresses: readonly NetworkInterfaceInfo[]): string | undefined {
  const home = addresses.find(
    (address) => address.family === "IPv4" && !address.internal && isHomeAddress(address.address),
  );
  return home?.address;
}

/**
 * Where this machine reaches a server bound to `host`: loopback when it is bound to every address
 * or to loopback, and the one address otherwise (the tailnet's, on a machine with no home network).
 */
export function hereUrl(host: string, port: number): string {
  const loopback = ["", "0.0.0.0", "::", "127.0.0.1", "localhost", "::1"].includes(host);
  const named = loopback ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host;
  return `http://${named}:${port}`;
}

/**
 * Your devices from anywhere through Chips's relay, and directly on this Wi-Fi when there is one.
 * Like the Wi-Fi's own answer, it names no address: the Wi-Fi's changes (the new-person sweep's
 * finding 4), and a server bound to every address says the one it has now.
 */
function chipsRelay(networks: Networks, port: number): ReachChoice {
  const host = new URL(CHIPS_RELAY).host;
  const wifi = networks.lan === undefined ? undefined : `http://${networks.lan}:${port}`;
  return {
    reach: "relay",
    host: wifi === undefined ? "127.0.0.1" : "0.0.0.0",
    publicUrl: undefined,
    relay: CHIPS_RELAY,
    label: "Your devices, anywhere, through the Chips relay (encrypted end to end)",
    done:
      wifi === undefined
        ? `Reachable from anywhere through ${host}`
        : `Reachable from anywhere through ${host}, and on this Wi-Fi at ${wifi}`,
  };
}

/**
 * The answers this machine can give, best first: the order the question lists them in. With a
 * relay, only this machine is not all that reaches it: a phone does too, through the relay.
 * Without one, the Chips relay is an answer: first with no tailnet, after the Wi-Fi with one.
 */
export function reachChoices(
  networks: Networks,
  port: number,
  relay?: string | undefined,
): readonly ReachChoice[] {
  const choices: ReachChoice[] = [];
  if (relay === undefined && networks.tailnet === undefined) {
    choices.push(chipsRelay(networks, port));
  }
  if (networks.tailnet !== undefined) {
    const url = `http://${networks.tailnet}:${port}`;
    choices.push({
      reach: "tailnet",
      host: networks.lan === undefined ? networks.tailnet : "0.0.0.0",
      publicUrl: url,
      label: `Your devices, over Tailscale (found: ${networks.tailnet})`,
      done: `Reachable over Tailscale at ${url}${networks.lan === undefined ? "" : ", and on this Wi-Fi"}`,
    });
  }
  if (networks.lan !== undefined) {
    const url = `http://${networks.lan}:${port}`;
    // No CHIPS_PUBLIC_URL: this Wi-Fi's address changes with a new lease or a new network, and a
    // frozen one sent every new code, invite and link to an address nobody holds (the new-person
    // sweep's finding 4). Bound to every address, the server says the home network's it has now.
    choices.push({
      reach: "lan",
      host: "0.0.0.0",
      publicUrl: undefined,
      label: `Devices on this Wi-Fi (${networks.lan})`,
      done: `Reachable on this Wi-Fi at ${url}`,
    });
  }
  if (relay === undefined && networks.tailnet !== undefined) {
    choices.push(chipsRelay(networks, port));
  }
  choices.push({
    reach: "local",
    host: "127.0.0.1",
    publicUrl: undefined,
    label:
      relay === undefined ? "Only this machine" : "Only this machine, and phones through the relay",
    done:
      relay === undefined
        ? "Reachable from this machine only"
        : "Reachable directly from this machine only",
  });
  return choices;
}

/**
 * The answer when nobody is asked: the one a flag named, when this machine can give it; else the
 * safest, this machine only. A flag naming an answer the machine cannot give is an error the
 * caller reports, so `--reach tailnet` on a machine without Tailscale says so.
 */
export function chosenReach(
  choices: readonly ReachChoice[],
  wanted: Reach | undefined,
): ReachChoice | { readonly missing: Reach } {
  if (wanted === undefined) return choices[choices.length - 1] as ReachChoice;
  return choices.find((each) => each.reach === wanted) ?? { missing: wanted };
}

export function isReach(value: string | undefined): value is Reach {
  return value !== undefined && (REACHES as readonly string[]).includes(value);
}
