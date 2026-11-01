/**
 * The referee (ADR 0097): Chips talks before it stops.
 *
 * Agents in a room hand work to each other by @. ADR 0081 held the fifth message agents sent each
 * other without a person, which stopped three agents sharing out an alphabet before the first
 * letter was written (the ASCII Art room, 2 October 2026). So Chips counts the talk between
 * agents since the last reset — anything a person does in the room, or anything new an agent
 * makes — and says what it sees. From `NUDGE_AT` the facts ride each agent's next turn; on a
 * circle, or from `WARN_AT`, the way out rides with them and the people are told; only at
 * `CEILING`, or when a person pauses them, are messages between agents held, and loudly. Those
 * three are the defaults: a workspace sets its own stop and hold, either of them never, and
 * whether circles count (`ExchangeLimits`, ADR 0187).
 *
 * The server that counts, the conformance fake that plays the server and the clients that draw
 * the room read the same rules and the same words, so they live here.
 */

import { z } from "zod";
import { agentId, isoTimestamp } from "./primitives.js";

/** From this many messages between agents since the last reset, the facts ride their turns. */
export const NUDGE_AT = 8;
/** From this many, or on a circle, the note names the way out and the people are told. */
export const WARN_AT = 16;
/** After this many, messages between agents are held until a person acts. */
export const CEILING = 48;

/**
 * When Chips tells a workspace's agents to stop, and when it holds their messages to each other,
 * counted as above; `null` is never, by count. And whether agents going in circles are told to
 * stop then, whatever the count. The workspace's, set by an owner or an admin on You (ADR 0187);
 * 16, 48 and yes until somebody does. The facts ride the agents' turns from half the stop, or from
 * `NUDGE_AT` where there is none.
 */
export interface ExchangeLimits {
  readonly stop: number | null;
  readonly hold: number | null;
  readonly circles: boolean;
}

export const DEFAULT_EXCHANGE_LIMITS: ExchangeLimits = {
  stop: WARN_AT,
  hold: CEILING,
  circles: true,
};

/** What a stop may be, and a hold, in messages: the event refuses anything else. */
export const STOP_RANGE = { least: 4, most: 500 } as const;
export const HOLD_RANGE = { least: 10, most: 1000 } as const;

/** The stops and the holds You offers, beside Other and Never. */
export const STOP_CHOICES: readonly number[] = [8, 16, 32, 64];
export const HOLD_CHOICES: readonly number[] = [24, 48, 100, 200];

/** From how many messages the facts ride the agents' turns: half the stop, or `NUDGE_AT`. */
export function nudgeAt(limits: ExchangeLimits): number {
  return limits.stop === null ? NUDGE_AT : Math.max(2, Math.round(limits.stop / 2));
}

const within = (n: number, range: { readonly least: number; readonly most: number }) =>
  Number.isInteger(n) && n >= range.least && n <= range.most;

/**
 * Why these cannot be a workspace's limits, in the words a person reads, or nothing: each a whole
 * number in its range, and the stop before the hold, or Chips would hold the agents before it
 * told them to stop.
 */
export function limitsProblem(limits: ExchangeLimits): string | undefined {
  if (limits.stop !== null && !within(limits.stop, STOP_RANGE)) {
    return "Chips tells agents to stop after a whole number of messages, from 4 to 500.";
  }
  if (limits.hold !== null && !within(limits.hold, HOLD_RANGE)) {
    return "Chips holds agents after a whole number of messages, from 10 to 1,000.";
  }
  if (limits.stop !== null && limits.hold !== null && limits.stop >= limits.hold) {
    return "Chips would hold the agents before telling them to stop. Make the stop smaller than the hold.";
  }
  return undefined;
}

/** The limits an `exchange.limits_set` carries; what it leaves out is the default's. */
export function exchangeLimitsOf(payload: Readonly<Record<string, unknown>>): ExchangeLimits {
  const count = (name: "stop" | "hold"): number | null => {
    const value = payload[name];
    if (value === null) return null;
    return typeof value === "number" ? value : DEFAULT_EXCHANGE_LIMITS[name];
  };
  const circles = payload["circles"];
  return {
    stop: count("stop"),
    hold: count("hold"),
    circles: typeof circles === "boolean" ? circles : DEFAULT_EXCHANGE_LIMITS.circles,
  };
}

/**
 * What a person does in a room that starts the count again, and hands over what was held:
 * writing, answering a question, deciding or handing on an approval, adding or taking somebody
 * out, steering or stopping a run, a thumb on what was said — and letting the agents carry on
 * (`exchange.set` with `going`, which is asked of its state). Pausing them is not among them.
 */
export const PERSON_ACTS: ReadonlySet<string> = new Set([
  "message.post",
  "question.answered",
  "approval.resolved",
  "approval.routed",
  "membership.added",
  "membership.removed",
  "run.steer",
  "run.cancel",
  "run.pause",
  "run.resume",
  "feedback",
]);

/** Whether this event, by a person, starts the count again (`PERSON_ACTS`, or carrying on). */
export function resetsTheCount(type: string, payload: Readonly<Record<string, unknown>>): boolean {
  return PERSON_ACTS.has(type) || (type === "exchange.set" && payload["state"] === "going");
}

/** What an agent makes that starts the count again, besides a file new to the room. */
export const WORK_ACTS: ReadonlySet<string> = new Set(["question.ask", "approval.request"]);

export const exchangeStage = z
  .enum(["quiet", "nudge", "warning", "held"])
  .describe(
    "`quiet` under the nudge; `nudge` from it (half the workspace's stop, or 8); `warning` on a circle or from the stop; `held` at the hold or while a person has paused the agents. The stop, the hold and whether circles count are the workspace's (ADR 0187): 16, 48 and yes unless an owner or an admin changed them.",
  );
export type ExchangeStage = z.infer<typeof exchangeStage>;

export const exchangeReset = z
  .object({
    kind: z
      .enum(["person", "work", "start"])
      .describe(
        "`person`: somebody did something in the room. `work`: an agent made something new — a file new to the room, a question to a person, an approval request. `start`: nothing since the room began.",
      ),
    seq: z.int().nonnegative().describe("Where the count starts from, after this."),
    at: isoTimestamp.optional().describe("When. Absent at the start."),
    by: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Who: the person, or the agent that made it."),
    made: z
      .enum(["file", "question", "approval"])
      .optional()
      .describe("For `work`: what the agent made."),
    file: z.string().min(1).max(255).optional().describe("For a file: its name."),
  })
  .describe("The last reset of the count.");
export type ExchangeReset = z.infer<typeof exchangeReset>;

export const exchangeRepeat = z.object({
  message_id: z.string().min(1).max(120),
  by: z.string().min(1).max(120),
  kind: z
    .enum(["file", "words"])
    .describe(
      "`file`: it carried a file already in the room. `words`: its words are much the same as words its sender already sent since the reset.",
    ),
  file: z.string().min(1).max(255).optional(),
});
export type ExchangeRepeat = z.infer<typeof exchangeRepeat>;

export const exchangeFacts = z
  .object({
    count: z
      .int()
      .nonnegative()
      .describe("Messages agents have sent agents in the room since the reset, this one included."),
    since: exchangeReset,
    minutes: z.int().nonnegative().describe("Since the reset."),
    person_looking: z
      .boolean()
      .nullable()
      .describe(
        "Whether somebody has the room open: a person not behind it by a message older than a minute. `null` when Chips cannot say.",
      ),
    person: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Who to tell what is done and what is blocked: the person who last acted here."),
    repeats: z
      .array(exchangeRepeat)
      .max(CEILING)
      .describe("Which of the messages repeat, newest last."),
    circling: z
      .boolean()
      .describe(
        "The same two or three agents taking turns with nothing new: two rounds with a repeat among them.",
      ),
    also_for: z
      .array(agentId)
      .max(64)
      .describe("Who else this message is for, besides whoever it is delivered to."),
    stage: exchangeStage,
    allowance: z
      .int()
      .positive()
      .optional()
      .describe(
        "After how many messages between agents Chips holds them: the workspace's hold (ADR 0187). Absent when it holds them only on a pause.",
      ),
    paused: z
      .boolean()
      .describe(
        "A person paused the agents, or Chips did at the room's spend ceiling (ADR 0118), and nobody has acted since.",
      ),
  })
  .describe("How the agents' talk in the room stands (ADR 0097).");
export type ExchangeFacts = z.infer<typeof exchangeFacts>;

/** The facts as a turn is handed them, with the words a harness puts at the top of the turn. */
export const deliveredExchange = exchangeFacts.extend({
  note: z.string().min(1).max(4000).describe("The facts in plain words, for the top of the turn."),
});
export type DeliveredExchange = z.infer<typeof deliveredExchange>;

/**
 * Where the talk is: held at the hold or on a pause, then a warning at the stop or on a circle,
 * a nudge, or nothing. `circling` is a circle the workspace watches for (`circles`).
 */
export function stageOf(
  count: number,
  circling: boolean,
  paused: boolean,
  limits: ExchangeLimits = DEFAULT_EXCHANGE_LIMITS,
): ExchangeStage {
  if (paused || (limits.hold !== null && count >= limits.hold)) return "held";
  if (circling || (limits.stop !== null && count >= limits.stop)) return "warning";
  return count >= nudgeAt(limits) ? "nudge" : "quiet";
}

/** Whether an agent's next message to an agent is held: after the hold, or on a pause. */
export function holds(exchange: {
  readonly count: number;
  readonly paused: boolean;
  readonly limits?: ExchangeLimits | undefined;
}): boolean {
  const hold = (exchange.limits ?? DEFAULT_EXCHANGE_LIMITS).hold;
  return exchange.paused || (hold !== null && exchange.count >= hold);
}

/** Whether the last `p × rounds` speakers are the same `p` agents taking turns, in order. */
function roundsOf(speakers: readonly string[], p: number, rounds: number): boolean {
  const tail = speakers.slice(-p * rounds);
  if (tail.length < p * rounds) return false;
  const round = tail.slice(0, p);
  if (new Set(round).size !== p) return false;
  return tail.every((speaker, index) => speaker === round[index % p]);
}

/**
 * Whether the talk is going round: the same two or three agents taking turns (A B A B, A B C A B
 * C) for two rounds, with a repeat among them. `repeated` says, for each speaker, whether that
 * message repeated. Nothing new was made by them, or the count would have started again.
 *
 * Taking turns alone is not going round (ADR 0097's addendum of 17 October 2026). ADR 0097 also
 * called three rounds with no repeat a circle, which told two agents working a problem through to
 * stop at their sixth message, and three at their ninth, whatever they were saying.
 */
export function circleIn(speakers: readonly string[], repeated: readonly boolean[]): boolean {
  return [2, 3].some((p) => roundsOf(speakers, p, 2) && repeated.slice(-2 * p).some(Boolean));
}

/** Fewer words than this are never a repeat: "Thanks!" twice is manners. */
const MIN_WORDS = 6;
/** How alike two messages' word trigrams must be to be the same words again. */
const LIKENESS = 0.6;

/** A message's words as a repeat compares them: lower case, no @names, links or punctuation. */
export function wordsFor(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/@[\p{L}\p{N}_.-]+/gu, " ")
      // "Bank's" is one word, so a lone letter is only ever a letter ("F to J").
      .replace(/['’ʼ]/gu, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word !== "")
  );
}

/**
 * The particulars among a message's words: anything with a digit in it (a section, a batch, a
 * commit, a total) and lone letters but "a" and "i" (a range of letters, a column). Work handed
 * on in the same words each time differs in these, and only in these.
 */
function particularsOf(words: readonly string[]): string {
  return [
    ...new Set(
      words.filter((word) => /\p{N}/u.test(word) || (word.length === 1 && !/[ai]/.test(word))),
    ),
  ]
    .sort()
    .join(" ");
}

function trigrams(words: readonly string[]): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i + 2 < words.length; i += 1)
    grams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return grams;
}

function likeness(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  const either = a.size + b.size - shared;
  return either === 0 ? 0 : shared / either;
}

/**
 * Whether these words are much the same as one of the earlier ones (ADR 0097): their word
 * trigrams at least 60% alike, with @names, links and punctuation left out, so the same words to
 * another agent are the same words, and about the same particulars. Under six words is never a
 * repeat.
 *
 * "Done with section 3 … over to you for section 4" after "Done with section 2 … over to you for
 * section 3" is work handed on in the same words, not the same words again: the particulars
 * differ (ADR 0097's addendum of 17 October 2026).
 */
export function repeatOf(text: string, earlier: readonly string[]): boolean {
  const words = wordsFor(text);
  if (words.length < MIN_WORDS) return false;
  const mine = trigrams(words);
  const particulars = particularsOf(words);
  return earlier.some((other) => {
    const theirs = wordsFor(other);
    return (
      theirs.length >= MIN_WORDS &&
      particularsOf(theirs) === particulars &&
      likeness(mine, trigrams(theirs)) >= LIKENESS
    );
  });
}

/** One message agents sent agents since the reset, as the facts are worked out from it. */
export interface ExchangeMessage {
  readonly message_id: string;
  /** The agent that sent it. */
  readonly by: string;
  readonly text: string;
  /** The names of the files it carried that were in the room before it. */
  readonly filesSeen: readonly string[];
}

/** What the server, or the fake, reads of a room for the facts. */
export interface ExchangeStretch {
  /** Every message agents sent agents since the reset, of which `messages` are the newest. */
  readonly count: number;
  readonly since: ExchangeReset;
  /** Oldest first. As many of the newest as the circle and the repeats need. */
  readonly messages: readonly ExchangeMessage[];
  readonly paused: boolean;
  readonly personLooking: boolean | null;
  /** The person who last acted in the room, whenever that was. */
  readonly person?: string | undefined;
  /** The workspace's limits as of the stretch's end (ADR 0187); the defaults when absent. */
  readonly limits?: ExchangeLimits | undefined;
}

/**
 * The repeats in a stretch, and for each message whether it repeated, as a circle reads it: its
 * words again, or a file already in the room posted again with nothing new said beside it. A
 * reviewer posting the file it is commenting on, with new comments, is at work; the file is still
 * among the repeats, so its next turn is told that posting it again reaches nobody new.
 */
function repeatsIn(messages: readonly ExchangeMessage[]): {
  readonly repeats: ExchangeRepeat[];
  readonly repeated: boolean[];
} {
  const repeats: ExchangeRepeat[] = [];
  const repeated = messages.map((message, index) => {
    const file = message.filesSeen[0];
    const earlier = messages
      .slice(0, index)
      .filter((each) => each.by === message.by)
      .map((each) => each.text);
    const again = repeatOf(message.text, earlier);
    const kind = file !== undefined ? "file" : again ? "words" : undefined;
    if (kind === undefined) return false;
    repeats.push({
      message_id: message.message_id,
      by: message.by,
      kind,
      ...(kind === "file" && file !== undefined ? { file } : {}),
    });
    return again || wordsFor(message.text).length < MIN_WORDS;
  });
  return { repeats, repeated };
}

/** The facts of a stretch of talk, as of `nowMs`, for a message also for `alsoFor`. */
export function exchangeFactsOf(
  stretch: ExchangeStretch,
  options: { readonly nowMs: number; readonly alsoFor?: readonly string[] },
): ExchangeFacts {
  const limits = stretch.limits ?? DEFAULT_EXCHANGE_LIMITS;
  const { repeats, repeated } = repeatsIn(stretch.messages);
  // A workspace that switched circles off is never told of one (ADR 0187).
  const circling =
    limits.circles &&
    circleIn(
      stretch.messages.map((message) => message.by),
      repeated,
    );
  const at = stretch.since.at === undefined ? Number.NaN : Date.parse(stretch.since.at);
  return {
    count: stretch.count,
    since: stretch.since,
    minutes: Number.isNaN(at) ? 0 : Math.max(0, Math.floor((options.nowMs - at) / 60_000)),
    person_looking: stretch.personLooking,
    ...(stretch.person === undefined ? {} : { person: stretch.person }),
    // As many as the schema keeps, whatever the hold.
    repeats: repeats.slice(-CEILING),
    circling,
    also_for: [...(options.alsoFor ?? [])],
    stage: stageOf(stretch.count, circling, stretch.paused, limits),
    ...(limits.hold === null ? {} : { allowance: limits.hold }),
    paused: stretch.paused,
  };
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What the count runs from, in words: "Arjun last acted", "ASCII Art posted a.html". */
function sinceWords(since: ExchangeReset, nameOf: (id: string) => string): string {
  const who = since.by === undefined ? undefined : nameOf(since.by);
  if (since.kind === "start") return "this space began";
  if (since.kind === "person") return `${who ?? "a person"} last acted here`;
  if (since.made === "file") return `${who ?? "an agent"} posted ${since.file ?? "a new file"}`;
  if (since.made === "question") return `${who ?? "an agent"} asked a person a question`;
  return `${who ?? "an agent"} asked for an approval`;
}

function agoWords(facts: ExchangeFacts): string {
  if (facts.since.at === undefined) return "";
  return facts.minutes === 0
    ? ", under a minute ago"
    : `, ${plural(facts.minutes, "minute", "minutes")} ago`;
}

function lookingWords(looking: boolean | null): string | undefined {
  if (looking === null) return undefined;
  return looking ? "A person has this space open now." : "No person has this space open now.";
}

function repeatWords(repeats: readonly ExchangeRepeat[], nameOf: (id: string) => string): string[] {
  const files = [
    ...new Set(repeats.flatMap((each) => (each.file === undefined ? [] : [each.file]))),
  ];
  const sayers = [
    ...new Set(repeats.filter((each) => each.kind === "words").map((each) => each.by)),
  ];
  const words: string[] = [];
  if (files.length > 0) {
    const them = files.length === 1 ? "it" : "them";
    words.push(
      `${listed(files)} ${files.length === 1 ? "was" : "were"} posted here before; posting ${them} again reaches nobody new.`,
    );
  }
  if (sayers.length > 0) {
    words.push(
      `${listed(sayers.map(nameOf))} ${sayers.length === 1 ? "has" : "have"} said much the same before.`,
    );
  }
  return words;
}

/**
 * The facts in plain words, as a turn is handed them (ADR 0097). A nudge says what Chips sees; a
 * warning, or a hold, says the way out too:
 *
 * > The agents in this room have sent each other 16 messages since Arjun last acted here, 21
 * > minutes ago. No person has this room open now. ascii-alphabet.html was posted here before;
 * > posting it again reaches nobody new. Stop, and tell Arjun what is done and what is blocked.
 * > Messages between the agents are held after 48.
 */
export function renderExchangeNote(facts: ExchangeFacts, nameOf: (id: string) => string): string {
  const parts = [
    `The agents in this space have sent each other ${plural(facts.count, "message", "messages")} since ${sinceWords(facts.since, nameOf)}${agoWords(facts)}.`,
  ];
  const looking = lookingWords(facts.person_looking);
  if (looking !== undefined) parts.push(looking);
  parts.push(...repeatWords(facts.repeats.slice(-5), nameOf));
  if (facts.also_for.length > 0) {
    parts.push(
      `This message is also for ${listed(facts.also_for.map(nameOf))}, who may answer it too.`,
    );
  }
  if (facts.stage === "quiet" || facts.stage === "nudge") return parts.join(" ");
  if (facts.circling) {
    parts.push(
      "This looks like a circle: the same agents taking turns, and nothing new made since.",
    );
  }
  const person = facts.person === undefined ? "the person" : nameOf(facts.person);
  parts.push(`Stop, and tell ${person} what is done and what is blocked.`);
  if (facts.stage === "held") {
    parts.push("Messages between the agents are held until a person acts.");
  } else if (facts.allowance !== undefined) {
    parts.push(`Messages between the agents are held after ${facts.allowance}.`);
  }
  return parts.join(" ");
}
