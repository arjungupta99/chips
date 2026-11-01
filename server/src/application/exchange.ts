/**
 * What an agent is told of the agents' talk with a message for it (ADR 0097): the facts as of
 * that message, once they are worth a word, in the protocol's words.
 *
 * Read from the log as of the message's seq and timed by its own clock, so a replay after a
 * reconnect hands over the same facts. Which stage the talk is at, and how it reads, is the protocol's (`exchangeFactsOf`,
 * `renderExchangeNote`), shared with the conformance fake.
 */

import {
  type DeliveredExchange,
  type ExchangeFacts,
  exchangeFactsOf,
  isAgentKind,
  renderExchangeNote,
} from "@chipschat/protocol";
import type { ReadModels, StoredEvent } from "./ports/index.js";
import type { Lookup } from "./room-context.js";

/** Everybody the facts name, so the words can call each by name. */
function namedIn(facts: ExchangeFacts): string[] {
  return [
    ...(facts.since.by === undefined ? [] : [facts.since.by]),
    ...(facts.person === undefined ? [] : [facts.person]),
    ...facts.repeats.map((repeat) => repeat.by),
    ...facts.also_for,
  ];
}

/** The facts with their words, given who is who. */
export async function withNote(facts: ExchangeFacts, lookup: Lookup): Promise<DeliveredExchange> {
  const names = new Map<string, string>();
  for (const id of new Set(namedIn(facts))) {
    const who = await lookup(id);
    if (who !== undefined) names.set(id, who.name);
  }
  return { ...facts, note: renderExchangeNote(facts, (id) => names.get(id) ?? "someone") };
}

/**
 * The facts for a message an agent sent, for those it is delivered to: nothing for a person's
 * message, which starts the count again, nor below the nudge. `takers` are left out of who else
 * it is for.
 */
export async function exchangeFor(room: {
  readonly readModels: Pick<ReadModels, "exchangeOf">;
  readonly lookup: Lookup;
  readonly event: StoredEvent;
  readonly takers: readonly string[];
}): Promise<DeliveredExchange | undefined> {
  const { event } = room;
  if (event.space_id === null || !isAgentKind(event.actor.kind)) return undefined;
  const nowMs = Date.parse(event.ts);
  const stretch = await room.readModels.exchangeOf(event.workspace_id, event.space_id, {
    uptoSeq: event.seq,
  });
  const addressed = event.payload["addressed_to"];
  const alsoFor = (Array.isArray(addressed) ? (addressed as string[]) : []).filter(
    (id) => !room.takers.includes(id),
  );
  const facts = exchangeFactsOf(stretch, { nowMs, alsoFor });
  return facts.stage === "quiet" ? undefined : await withNote(facts, room.lookup);
}
