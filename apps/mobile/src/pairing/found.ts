/**
 * What a Bonjour browse found, as the pairing screen lists it (ADR 0172): pure, so it is tested
 * without a phone.
 */

export interface FoundServer {
  /** What it is called: the machine its owner named, else the name it advertised. */
  readonly name: string;
  readonly url: string;
  readonly workspaceId: string | undefined;
}

export interface Found {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly machine: string;
  readonly workspace: string;
}

/** What a found service is, as a row says it, by name. */
export function serversFrom(found: readonly Found[]): FoundServer[] {
  return found
    .map((each) => ({
      name: each.machine !== "" ? each.machine : each.name.replace(/^Chips on /, ""),
      url: `http://${each.host}:${each.port}`,
      workspaceId: each.workspace === "" ? undefined : each.workspace,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
