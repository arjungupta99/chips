/**
 * Who a message is for (ADR 0081).
 *
 * Chips decides, once, at ingest, which agents in a space a message is for, and only they take
 * a turn on it; the others overhear it. The server that decides, the conformance fake that plays
 * the server, and the clients that show the answer before a send have to agree, so the rule lives
 * here, with the schemas, as `mentions.ts` does.
 *
 * Who takes a turn is agents only: people read every message. An agent is a harness's (ADR 0087);
 * a harness still in a room from before agents counts as one until the upgrade gives it one. A
 * message can be for a person too (ADR 0204): one the sender @s, or picks in the field's list. No
 * agent takes a turn for them; they are told, as an @ tells them. Natalie's "How's it going?" in
 * Foodie on 19 October 2026 had no way to be for Arjun, and went to the room's agent.
 *
 * An agent's message to agents is held only past the referee's ceiling, or while a person has
 * paused the agents (ADR 0097, which replaced ADR 0081's hold after four).
 */

import { type ExchangeLimits, holds } from "./exchange.js";

/**
 * Whether a participant of this kind takes part in rooms as an agent: an agent (ADR 0087), or a
 * harness in a room from before agents. Anything that is not a person or Chips itself.
 */
export function isAgentKind(kind: string): boolean {
  return kind !== "person" && kind !== "system";
}

export interface AddressInput {
  /** Who sent it. */
  readonly sender: { readonly id: string; readonly kind: string };
  /** The participants the text's @handles name, as ids, people included. */
  readonly mentioned: readonly string[];
  /** Whether the text says `@all`. */
  readonly everyone: boolean;
  /** What the sender chose without typing an @: agent ids and people's, or every agent. */
  readonly to?: readonly string[] | "all" | undefined;
  /** The author of the message this one answers, when it is a reply. */
  readonly replyAuthor?: { readonly id: string; readonly kind: string } | undefined;
  /** The space's agents that have not been removed, in the order they joined. */
  readonly agents: readonly string[];
  /**
   * The space's people that have not been removed (ADR 0204): who besides its agents an @ or a `to`
   * can make a message for. Absent, a `to` names agents only, as before.
   */
  readonly people?: readonly string[] | undefined;
  /**
   * What the sender's previous message in the space was for: its agents, or `all` when it was for
   * every agent there was. Absent before their first.
   */
  readonly last?: readonly string[] | "all" | undefined;
  /**
   * How the agents' talk in the space stands (ADR 0097): the messages agents have sent agents
   * since the last reset, whether a person paused them, and the workspace's limits (ADR 0187),
   * the defaults where absent. Absent, nothing is held.
   */
  readonly exchange?:
    | {
        readonly count: number;
        readonly paused: boolean;
        readonly limits?: ExchangeLimits | undefined;
      }
    | undefined;
}

export interface Address {
  /** The agents the message is for. */
  readonly addressed_to: string[];
  /**
   * Set when the message is for every agent in the space, whoever is there: `@all`, a `to` of
   * `all`, or a person's default of everyone. That person's next message that names nobody goes
   * to every agent there is then, one added since included.
   */
  readonly addressed_to_all?: true;
  /** Set when Chips held an agent's message (ADR 0097): it is shown, and for nobody. */
  readonly held?: true;
  /**
   * The people a person's message is for (ADR 0204): those its @s name, or else those the sender
   * picked in `to`. They are told as an @ tells them; no agent takes a turn for them. Absent for
   * none, and on an agent's message.
   */
  readonly addressed_people?: string[];
}

/** Agent ids, or every agent in the space. */
type Aimed = string[] | "all";

/**
 * The agents a message is for. For a person the first rule that applies decides: an @, the
 * composer's choice, a reply to an agent, the only agent, then where their last message here
 * went (every agent before their first). An agent reaches only the agents it names, chose or
 * answers, and its words are otherwise for the people; past the workspace's hold, or while the
 * agents are paused, it reaches nobody until a person acts.
 */
export function resolveAddress(input: AddressInput): Address {
  const members = input.agents.filter((id) => id !== input.sender.id);
  if (isAgentKind(input.sender.kind)) {
    const picked = named(input, members) ?? aimed(input, members) ?? answered(input, members);
    const address = addressOf(picked ?? [], members);
    const held = input.exchange !== undefined && holds(input.exchange);
    return address.addressed_to.length > 0 && held ? { addressed_to: [], held: true } : address;
  }
  return personAddress(input, members);
}

/**
 * A person's message: an @, the composer's choice, people chosen (who give no agent a turn, ADR
 * 0204), a reply to an agent, the only agent, then where their last message here went.
 */
function personAddress(input: AddressInput, members: readonly string[]): Address {
  const people = (input.people ?? []).filter((id) => id !== input.sender.id);
  const chosen = chosenPeople(input, people);
  const picked =
    named(input, members) ??
    aimed(input, members) ??
    (chosen.length > 0 ? [] : undefined) ??
    answered(input, members);
  if (picked !== undefined) return withPeople(addressOf(picked, members), chosen);
  // A room with no agent yet: the message is for whoever comes, so their next goes to everyone.
  if (members.length === 0) return addressOf("all", members);
  if (members.length === 1) return { addressed_to: [...members] };
  return addressOf(lastOrEveryone(input.last, members), members);
}

/**
 * The people a person's message is for (ADR 0204): those an @ names, when an @ decides, as it
 * decides for agents; else those the sender picked in `to`. Never the sender.
 */
function chosenPeople(input: AddressInput, people: readonly string[]): string[] {
  if (input.everyone) return [];
  if (input.mentioned.length > 0) return kept(input.mentioned, people);
  return Array.isArray(input.to) ? kept(input.to, people) : [];
}

function withPeople(address: Address, people: readonly string[]): Address {
  return people.length === 0 ? address : { ...address, addressed_people: [...people] };
}

function addressOf(aimed: Aimed, members: readonly string[]): Address {
  return aimed === "all"
    ? { addressed_to: [...members], addressed_to_all: true }
    : { addressed_to: aimed };
}

/** Rule 1: an @ decides, even when it names only people. */
function named(input: AddressInput, members: readonly string[]): Aimed | undefined {
  if (input.everyone) return "all";
  return input.mentioned.length > 0 ? kept(input.mentioned, members) : undefined;
}

/** Rule 2: the composer's choice, when it names a member. */
function aimed(input: AddressInput, members: readonly string[]): Aimed | undefined {
  if (input.to === undefined) return undefined;
  if (input.to === "all") return members.length > 0 ? "all" : undefined;
  const to = kept(input.to, members);
  return to.length > 0 ? to : undefined;
}

/** Rule 3: a reply to an agent that is still here. */
function answered(input: AddressInput, members: readonly string[]): Aimed | undefined {
  if (input.replyAuthor === undefined || !isAgentKind(input.replyAuthor.kind)) return undefined;
  const author = kept([input.replyAuthor.id], members);
  return author.length > 0 ? author : undefined;
}

/**
 * Rule 5: where the sender's last message went. Everyone stays everyone, an agent added since
 * included. Agents are kept to those still here, and it is everyone before their first message
 * and when none of those they addressed is left. A last message for no agent (it named only
 * people) keeps the next one for nobody.
 */
function lastOrEveryone(
  last: readonly string[] | "all" | undefined,
  members: readonly string[],
): Aimed {
  if (last === undefined || last === "all") return "all";
  const still = kept(last, members);
  return last.length > 0 && still.length === 0 ? "all" : still;
}

/** The ids that are members, each once, in the order given. */
function kept(ids: readonly string[], members: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => members.includes(id));
}

/**
 * Who of one connection takes a turn on a message (ADR 0081, ADR 0087): what `message.new`
 * carries as `for`. The ids the connection answers to among those the message is for: its
 * agents, and the harness itself where the harness is the member addressed, which it is in a
 * room asked of it from the + until it claims the room. On a message from before Chips said who
 * a message is for, every one of the connection's own in the room.
 *
 * The harness's own id used to be left out, so the first words in a room asked of a harness
 * arrived for nobody (`for: []`) and an adapter that read the list as final took no turn (agents
 * review, finding 31). A `message.new` now always names somebody.
 *
 * Never the one who said it (`saidBy`): one of the connection's agents is a turn for another of
 * them it is for, but not for itself (ADR 0101). Its own words from before Chips said who a
 * message is for are nobody's turn, as all its own words were before that ADR.
 */
export function takersOf(
  addressedTo: readonly string[] | undefined,
  selves: ReadonlySet<string>,
  ownInRoom: readonly string[],
  saidBy?: string,
): string[] {
  const own = saidBy !== undefined && selves.has(saidBy);
  if (addressedTo === undefined) return own ? [] : [...ownInRoom];
  return addressedTo.filter((id) => selves.has(id) && id !== saidBy);
}
