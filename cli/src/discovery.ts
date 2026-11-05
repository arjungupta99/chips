/**
 * mDNS: how a desktop app on the same network finds this server without being told an address.
 *
 * The service is `_chips._tcp`, and its TXT record carries what a client needs before it has
 * spoken to anything: the protocol version it will be offered, and the workspace it is for, so
 * a laptop that sees two servers can tell them apart. Nothing secret goes in it — a pairing
 * code is a capability, and mDNS is a broadcast to the whole network segment.
 */

import { Bonjour, type Service } from "bonjour-service";

export const SERVICE_TYPE = "chips";

export interface Advertisement {
  readonly stop: () => Promise<void>;
}

export function advertise(input: {
  readonly name: string;
  readonly port: number;
  readonly workspaceId: string;
  readonly version: string;
  /** What the machine is called, for a phone to list it by (ADR 0172). */
  readonly machine?: string | undefined;
}): Advertisement {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name: input.name,
    type: SERVICE_TYPE,
    port: input.port,
    host: hostFor(input.workspaceId),
    txt: {
      workspace: input.workspaceId,
      version: input.version,
      protocol: "1",
      ...(input.machine === undefined ? {} : { machine: input.machine }),
    },
  });
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        service.stop?.(() => bonjour.destroy(() => resolve()));
      }),
  };
}

/**
 * The name the service's addresses are answered under: the workspace's, never the machine's.
 * `bonjour-service` is a second responder beside the system's, and left to itself it answers the
 * machine's own name with every interface's address — a display's or AirDrop's link-local one
 * too. The system takes that difference for another computer holding its name and renames
 * itself (macOS: "Arjuns-Mac-mini-2.local", then -3, at each start of `chips serve`).
 */
export function hostFor(workspaceId: string): string {
  const label = `chips-${workspaceId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return `${label.slice(0, 63).replace(/-+$/, "")}.local`;
}

export interface FoundServer {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly workspaceId: string | undefined;
  readonly url: string;
}

/** Every Chips server that answers within `timeoutMs`. Used by `doctor` and by the desktop app. */
export function browse(timeoutMs = 1500): Promise<FoundServer[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found = new Map<string, FoundServer>();
    const browser = bonjour.find({ type: SERVICE_TYPE }, (service: Service) => {
      const host = service.referer?.address ?? service.host;
      const server: FoundServer = {
        name: service.name ?? "chips",
        host,
        port: service.port,
        workspaceId: (service.txt as Record<string, string> | undefined)?.["workspace"],
        url: `http://${host}:${service.port}`,
      };
      found.set(server.url, server);
    });
    setTimeout(() => {
      browser.stop();
      bonjour.destroy(() => resolve([...found.values()]));
    }, timeoutMs).unref?.();
  });
}
