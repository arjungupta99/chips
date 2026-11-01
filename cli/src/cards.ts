/**
 * The cards this Chips carries (ADRs 0171, 0218): the gallery's `connectors.json`, from where the
 * server reads it (`server.connectors`, which a release sets to the copy it ships and
 * `CHIPS_CONNECTORS` overrides). `chips connect <id>` looks a harness up here, and a card with a
 * `package` is one whose bridge it fetches and runs. The ids are the docs', never this code's.
 */

import { readFile } from "node:fs/promises";
import { type Connector, readConnectors } from "@chipschat/protocol";

/** A card whose bridge `chips connect` fetches: one with a `package`. */
export type BridgeCard = Connector & { readonly package: string };

export function isBridgeCard(card: Connector): card is BridgeCard {
  return card.kind === "one-line" && card.package !== undefined;
}

/**
 * The cards at `source`, a file or an `http(s):` URL; none when there is no source. A source that
 * can't be read is said, with where it is.
 */
export async function readCards(
  source: string | undefined,
  fetching: typeof fetch = fetch,
): Promise<readonly Connector[]> {
  if (source === undefined || source.trim() === "") return [];
  try {
    if (/^https?:\/\//i.test(source)) {
      const answer = await fetching(source, { signal: AbortSignal.timeout(10_000) });
      if (!answer.ok) throw new Error(`it answered ${answer.status}`);
      return readConnectors(await answer.json());
    }
    return readConnectors(JSON.parse(await readFile(source, "utf8")));
  } catch (error) {
    throw new Error(`This Chips's cards couldn't be read from ${source}: ${String(error)}`);
  }
}

/** The ids `chips connect` takes: each card with a bridge, then the adapters. */
export function connectIds(cards: readonly Connector[], adapters: readonly string[]): string {
  return [...cards.filter(isBridgeCard).map((card) => card.id), ...adapters].join(", ");
}

/** `chips connect` on its own: what it can connect, a line each, then how. */
export function connectableLines(
  cards: readonly Connector[],
  others: readonly { readonly id: string; readonly name: string; readonly line: string }[],
): string[] {
  const rows = [...cards.filter(isBridgeCard), ...others];
  const width = Math.max(...rows.map((row) => row.id.length));
  const named = Math.max(...rows.map((row) => row.name.length));
  return [
    ...rows.map((row) => `    ${row.id.padEnd(width)}   ${row.name.padEnd(named)}   ${row.line}`),
    "",
    ...(rows.length > others.length
      ? [
          "  CHIPS_JOIN_LINK='<link>' chips connect <id> connects one, with a link made in Chips: Connect a harness, then its card.",
        ]
      : []),
  ];
}
