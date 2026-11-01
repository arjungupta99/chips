/**
 * Where another device reaches this server (ADR 0028).
 *
 * A pairing QR is read by a phone, and one that says `127.0.0.1` names the single machine that
 * is not holding the camera. The address to put in it is therefore never the origin the page
 * was served from — a dev server on another port, the desktop app on another machine — and not
 * always the bound host either, because `0.0.0.0` is every address and none of them. It is a
 * fact about this machine and its networks, so it is worked out here, once, rather than guessed
 * by whichever screen happens to be drawing the QR.
 */

import { networkInterfaces } from "node:os";

/** The addresses that mean "this machine only". */
const LOOPBACK: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** `0.0.0.0` and `::` are every address, so neither is an address to hand anybody. */
const EVERY: ReadonlySet<string> = new Set(["0.0.0.0", "::"]);

/** RFC 1918: what a home router hands out. */
function isPrivateRange(address: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

/**
 * Interfaces that hold a private address no phone is on: the bridges Docker, libvirt, LXD and
 * Podman make for their guests, the veths into them, a cluster's overlay, and a desktop VM's
 * host-only network. On a VPS with a public `eth0`, Docker's `172.17.0.1` passed for the home
 * network's address.
 */
export function isVirtualInterface(name: string): boolean {
  return /^(docker|br-|virbr|lxdbr|lxcbr|veth|cni|flannel|podman|vboxnet|vmnet)/.test(name);
}

/**
 * The first address on this machine another device could actually reach, and nothing when there
 * is no such network.
 *
 * The home network's address before a VPN's: a phone on the same Wi-Fi reaches 192.168.1.20 and
 * not 100.64.0.7, and the QR is for the phone in the room. A phone that is *only* on the
 * tailnet is the other case, and the answer to it is `CHIPS_PUBLIC_URL`: this machine cannot
 * tell which network the camera is on, and the person holding it can.
 */
export function networkUrl(port: number, interfaces = networkInterfaces()): string | undefined {
  const found: string[] = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (isVirtualInterface(name)) continue;
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      found.push(address.address);
    }
  }
  const chosen = found.find(isPrivateRange) ?? found[0];
  return chosen === undefined ? undefined : `http://${chosen}:${port}`;
}

/** The server as this needs it: what was configured, and what it bound. */
export interface ReachableServer {
  /** `server.publicUrl`. What the person running it said, which beats anything worked out here. */
  readonly publicUrl?: string | undefined;
  readonly host: string;
  readonly port: number;
}

/**
 * The address to hand another device, in the order the answers deserve: what the person
 * configured, the host when they bound one address, the network this machine is on when they
 * bound all of them, and loopback when there is nothing better to say.
 *
 * Loopback is the honest answer rather than a useful one — a server bound to `127.0.0.1` is
 * reachable from nowhere else, and a QR that pretends otherwise wastes somebody's afternoon.
 */
export function reachableUrl(server: ReachableServer, interfaces = networkInterfaces()): string {
  const configured = server.publicUrl;
  if (configured !== undefined && configured !== "") return configured.replace(/\/$/, "");
  if (LOOPBACK.has(server.host)) return `http://127.0.0.1:${server.port}`;
  if (!EVERY.has(server.host)) return `http://${server.host}:${server.port}`;
  return networkUrl(server.port, interfaces) ?? `http://127.0.0.1:${server.port}`;
}
