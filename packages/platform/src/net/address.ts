/**
 * What one address is, wherever Chips counts by address: the server's limiter on the doors with
 * no credential behind them (ADR 0056), and the relay's sessions for one server from one place
 * (SEC-12). Both count the same way, so a /64 is one place to each.
 */

import { isIPv6 } from "node:net";

/** How an IPv4-mapped IPv6 address begins: `::ffff:0:0/96`, six groups. */
const MAPPED = prefixOf("::ffff:0:0", 6);
/** How Tailscale's IPv6 addresses begin: `fd7a:115c:a1e0::/48`, three groups. */
const TAILSCALE = prefixOf("fd7a:115c:a1e0::", 3);

/**
 * What an address is counted as.
 *
 * - An IPv4 address is itself.
 * - An IPv4-mapped IPv6 address, which is how a dual-stack socket reports an IPv4 peer, is the
 *   IPv4 address it carries.
 * - A Tailscale address is itself. Tailscale hands one to each device, and every device on a
 *   tailnet shares one /64.
 * - Any other IPv6 address is its /64. That is the block a home line or a rented server is
 *   given, and whoever holds one can answer from any of its 2^64 addresses. Counted one by one,
 *   each of those would have an allowance of its own.
 * - Anything else, such as a proxy's word that is not an address, is the words as given.
 */
export function countedAs(address: string): string {
  const groups = ipv6Groups(address);
  if (groups === undefined) return address;
  if (begins(groups, MAPPED)) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  if (begins(groups, TAILSCALE)) return hex(groups);
  return `${hex(groups.slice(0, 4))}::/64`;
}

function prefixOf(address: string, groups: number): readonly number[] {
  return (ipv6Groups(address) ?? []).slice(0, groups);
}

function begins(groups: readonly number[], prefix: readonly number[]): boolean {
  return prefix.every((group, i) => groups[i] === group);
}

/** The eight groups of an IPv6 address; nothing for anything that is not one. */
function ipv6Groups(address: string): number[] | undefined {
  const bare = address.split("%", 1)[0] ?? "";
  if (!isIPv6(bare)) return undefined;
  const [head = "", tail] = withoutDottedTail(bare).split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const gap = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array.from({ length: gap }, () => "0"), ...right].map((group) =>
    Number.parseInt(group, 16),
  );
}

/** `::ffff:192.0.2.1` as `::ffff:c000:201`: a dotted tail is the last two groups written another way. */
function withoutDottedTail(address: string): string {
  const colon = address.lastIndexOf(":");
  const octets = address.slice(colon + 1).split(".");
  if (octets.length !== 4) return address;
  const [a = 0, b = 0, c = 0, d = 0] = octets.map(Number);
  return `${address.slice(0, colon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
}

function hex(groups: readonly number[]): string {
  return groups.map((group) => group.toString(16)).join(":");
}
