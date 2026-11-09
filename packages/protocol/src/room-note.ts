/**
 * What an agent is told of the room with each turn (ADR 0092): who is in it, how to reach each of
 * them with an @, and what an @ does.
 *
 * Chips knows the room and its rules; a harness knew only what it had heard. So Chips words the
 * note, once, here, and sends it on `message.new` as `room`: the members, each with the handle
 * that reaches them, and the note itself for each who takes the turn. The server that sends it,
 * the conformance fake that plays the server and the SDK that hands it over read the same words.
 * It no longer says when Chips holds the agents (ADR 0187): the referee's warning says that, when
 * it matters, in the workspace's own numbers.
 *
 * Each agent is listed with the harness it runs on (ADR 0101): "ASCII Art (Jacobian agent,
 * @ASCIIArt)". A brief that said "Jacobian is the lead" left two agents asking "@Jacobian" in a room
 * where Jacobian's agent was called ASCII Art.
 *
 * A room may have a lead (ADR 0104): the agent that hands out the work, and that Chips hands what
 * was nobody's turn once the room goes still. The note says who it is, which of the others have a
 * turn going and how long each has been without one, and, to the one taking the turn, what is
 * news to it: that it has just joined, who joined since it last spoke, or, to the lead, that this
 * message is its because it was nobody's. People in a team see all that for themselves; an agent
 * exists only in its turns, so Chips says it at the top of each. And when older lines of what was
 * said since its last turn were left out of the turn, it says that too (ADR 0105).
 *
 * In a room with other agents, every taker is told it may answer `NO_REPLY` when a message asks
 * nothing of it now, and the lead that a step handed from one agent to another needs no word from
 * it (ADR 0109). ASCII Art's OpenClaw agents, named for a step that was theirs later, said "Ready
 * for J2's updated HTML", and J1, copied on each hand-off, said it again to the next agent.
 */

import { z } from "zod";
import { handleMap, isHandle } from "./mentions.js";
import { NO_REPLY } from "./no-reply.js";
import { namesInWords } from "./project.js";
import { type JobSpend, spendWords } from "./spend.js";

export const roomMember = z.object({
  participant_id: z.string().min(1).max(120),
  kind: z
    .enum(["person", "agent", "harness"])
    .describe(
      "A person, or an agent: one of a harness's, or a harness in the room in its own right, as in a room asked of it it has not claimed. A harness that has not declared `agents` is shown each agent as `harness`, as everywhere else.",
    ),
  name: z.string().min(1).max(120),
  harness: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe(
      "For an agent, the name of the harness it runs on: `Scout`; for a harness waiting in a room asked of it, listed by the first name the room holds for its agent (ADR 0150), its own name. Absent for a person, any other harness in the room in its own right, and an agent named as its harness is.",
    ),
  handle: z
    .string()
    .max(61)
    .optional()
    .describe(
      "What reaches them, with its @: `@Scout2`. Their whole name with its spaces left out, or their first word where only that is a handle. Absent for a name no handle reaches, such as one letter.",
    ),
  lead: z
    .literal(true)
    .optional()
    .describe(
      "The room's lead (ADR 0104): it hands out the work, and Chips hands it what was nobody's turn once the room goes still.",
    ),
  time_zone: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe(
      'For a person, the IANA zone of the phone they registered last (ADR 0157): what "at 10am" means to them, which the note says as their time now. Absent when Chips knows none.',
    ),
});
export type RoomMember = z.infer<typeof roomMember>;

export const roomWork = z.object({
  participant_id: z.string().min(1).max(120),
  minutes: z.int().nonnegative().describe("How long its turn has been going, in whole minutes."),
  step: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("The last step its turn said it was on, when its harness says its steps."),
});
export type RoomWork = z.infer<typeof roomWork>;

export const roomIdle = z.object({
  participant_id: z.string().min(1).max(120),
  minutes: z
    .int()
    .nonnegative()
    .describe("How long since its last turn here ended, in whole minutes."),
});
export type RoomIdle = z.infer<typeof roomIdle>;

export const roomNote = z.object({
  members: z
    .array(roomMember)
    .max(500)
    .describe("The room's people, then its agents, each by name, anybody removed left out."),
  notes: z
    .record(z.string().max(120), z.string().max(64_000))
    .describe(
      "The note for each who takes the turn (`for`), by their id: who is here, with handles, and that only those @-mentioned act. A harness puts it at the top of the turn.",
    ),
  rules: z
    .record(z.string().max(120), z.string().max(4000))
    .optional()
    .describe(
      "How the space works, for each who takes the turn, by their id: the words its note ends with (ADR 0250), that everyone here reads what it writes and, beside other agents, what an @ does and when to answer NO_REPLY. They stay the same while the space's agents do, so a harness whose session keeps its earlier turns may say them once, and the note without them after.",
    ),
  working: z
    .array(roomWork)
    .max(500)
    .optional()
    .describe(
      "The room's agents with a turn going as Chips sends this one (ADR 0104), the takers' own included. A turn nothing has been heard from for ten minutes is not counted.",
    ),
  idle: z
    .array(roomIdle)
    .max(500)
    .optional()
    .describe(
      "The room's other agents that have had a turn here: how long since the last one ended (ADR 0104).",
    ),
});
export type RoomNote = z.infer<typeof roomNote>;

/** A member as the server and the fake know them. */
export interface NoteMember {
  readonly id: string;
  readonly kind: "person" | "agent";
  readonly name: string;
  /**
   * For an agent, its harness's name; for a harness waiting under the first name its room holds
   * for its agent, its own (ADR 0150).
   */
  readonly harness?: string | undefined;
  /** The room's lead (ADR 0104). */
  readonly lead?: boolean | undefined;
  /** For a person, the IANA zone of their newest phone (ADR 0157). */
  readonly timeZone?: string | undefined;
}

/** Who has a turn going in the room, and how long the others have been without one (ADR 0104). */
export interface RoomNow {
  readonly working: readonly RoomWork[];
  readonly idle: readonly RoomIdle[];
}

/**
 * What is news to one who takes the turn (ADR 0104), with who did it by name: that it joined the
 * room and has not spoken there since; who joined since it last spoke there; to the lead, that
 * the message is its because it was nobody's turn, who said it, and which person to tell; or that
 * the message is the taker's though nobody @-mentioned it.
 */
export interface TakerNews {
  readonly joined?: {
    readonly minutes: number;
    readonly by?: string | undefined;
    /** Whether the room has files, which the turn lists at their current versions. */
    readonly files: boolean;
  };
  readonly newcomers?: readonly { readonly id: string; readonly by?: string | undefined }[];
  readonly nobodys?: { readonly saidBy: string; readonly tell?: string | undefined };
  /** That the message is the taker's though it has no @ for it, and who sent it (`yoursWithoutAt`). */
  readonly yours?: { readonly saidBy: string };
  /** That the message went to every agent here, and who sent it (`toEveryAgent`, ADR 0249). */
  readonly toAll?: { readonly saidBy: string };
  /**
   * That a person's message went to more than one agent (ADR 0287): who sent it, everyone it is
   * for, and the one who says who does what if it is one piece of work (`severalAsked`).
   */
  readonly several?: {
    readonly saidBy: string;
    readonly asked: readonly string[];
    readonly organiser: string;
  };
  /**
   * How many lines of what was said since its last turn come with this one, when older ones were
   * left out to fit its harness's budget (ADR 0105).
   */
  readonly cut?: { readonly shown: number };
}

/**
 * The handle that reaches a member among these, with its @: the whole name without spaces, else
 * the first word, whichever is a handle a text can hold and names them (ADR 0091). Its own case,
 * so `@OpenClaw2` rather than `@openclaw2`.
 */
export function noteHandle(member: NoteMember, members: readonly NoteMember[]): string | undefined {
  const byHandle = handleMap(members.map((each) => ({ id: each.id, displayName: each.name })));
  const name = member.name.trim();
  const candidates = [name.replace(/\s+/g, ""), name.split(/\s+/)[0] ?? ""];
  const handle = candidates.find(
    (word) => isHandle(word) && byHandle.get(word.toLowerCase()) === member.id,
  );
  return handle === undefined ? undefined : `@${handle}`;
}

/**
 * The members as the note lists them, each with its handle: people first, then agents, each by
 * name, numbers in order ("OpenClaw 2" before "OpenClaw 10"). Not the order they joined, which two
 * Chipses can break a tie in differently; this reads the same from both.
 */
export function roomMembers(members: readonly NoteMember[]): RoomMember[] {
  const ordered = [
    ...members.filter((member) => member.kind === "person").sort(byName),
    ...members.filter((member) => member.kind !== "person").sort(byName),
  ];
  return ordered.map((member) => {
    const handle = noteHandle(member, members);
    // "OpenClaw (OpenClaw agent)" says nothing its name does not.
    const harness =
      member.kind === "agent" &&
      member.harness !== undefined &&
      member.harness.trim().toLowerCase() !== member.name.trim().toLowerCase()
        ? member.harness
        : undefined;
    return {
      participant_id: member.id,
      kind: member.kind,
      name: member.name,
      ...(harness === undefined ? {} : { harness }),
      ...(handle === undefined ? {} : { handle }),
      ...(member.lead === true ? { lead: true as const } : {}),
      ...(member.kind === "person" && member.timeZone !== undefined
        ? { time_zone: member.timeZone }
        : {}),
    };
  });
}

/**
 * The note for one who takes the turn:
 *
 * > In this room: Arjun (person, @Arjun), ASCII Art (Jacobian agent, @ASCIIArt), and you,
 * > OpenClaw 2 (OpenClaw agent, @OpenClaw2). ASCII Art leads here: it hands out the work, and what
 * > is nobody's turn goes to it. Working now: O1, 2 minutes in (last step: Editing
 * > ascii-alphabet.html). Not working: ASCII Art for 3 minutes. This job has spent $1.20 of the
 * > $3.00 this room allows a job; at $3.00 Chips holds the agents until a person acts. Everyone
 * > here reads what you write; only those you @-mention act on it. To hand work to an agent or ask
 * > it something, @-mention it. If a message asks nothing of you now, as when it names a step that
 * > is yours later, answer NO_REPLY and nothing else: the room shows nothing, and nobody needs to
 * > hear that you are ready or waiting.
 *
 * What is news to the taker comes first (ADR 0104): the lead's "Nobody has this turn", "You joined
 * this room", "New since your last turn". What the job has spent comes after who is working, when
 * Chips said (ADR 0117), in a room with other agents or none. The note ends with its rules
 * (`roomRules`, ADR 0250), the same from turn to turn: with no other agent in the room, only
 * "Everyone here reads what you write."
 *
 * Given the instant the turn is sent (`at`), each person's time there follows the room's line
 * (ADR 0157): "Arjun's time now: 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00,
 * America/Los_Angeles)." An agent asked for something at 10am, or in 50 minutes, has the date,
 * the clock and the offset to write it with.
 */
export function renderRoomNote(
  members: readonly RoomMember[],
  youId: string,
  now?: RoomNow,
  news?: TakerNews,
  spend?: JobSpend,
  at?: string,
  project?: boolean,
): string {
  const you = members.find((member) => member.participant_id === youId);
  const others = members.filter((member) => member.participant_id !== youId);
  const listed = others.map(listing);
  if (you !== undefined) {
    const about = [you.harness === undefined ? undefined : kindOf(you), you.handle].filter(Boolean);
    const said = `${you.name}${about.length === 0 ? "" : ` (${about.join(", ")})`}`;
    listed.push(others.length === 0 ? `just you, ${said}` : `and you, ${said}`);
  }
  const shared = others.some((member) => member.kind === "agent");
  return [
    ...newsLines(members, youId, news),
    `In this space: ${listed.join(", ")}.`,
    ...clockLines(members, at),
    ...(shared ? [...leadLines(members, youId), ...nowLines(members, youId, now)] : []),
    ...(spend === undefined ? [] : [spendWords(spend)]),
    roomRules(members, youId, project),
  ].join(" ");
}

/**
 * Where people open a space's project (ADR 0227): asked where a file was, an agent sent Arjun to
 * "the space's file list", which shows a page's source, not the page (2 November 2026).
 */
export const UNIVERSE_WORDS =
  "People open the space's project with the Universe button at the top right of the space, so when someone asks where a file is, point them there.";

/**
 * What Universe and Run can and can't do (ADR 0287). The Health space's agents didn't know: a page
 * opened from Universe looked empty beside the running app, its links to the app went nowhere on a
 * phone, and they had a person press Stop and then Run where one press does both.
 */
export const RUNNING_WORDS =
  "Open page shows a copy of the project's files. It can't reach a running program or its data, so a page that needs live data has to be opened at the program's own address. Links to the project's files open in Chips. Web links open in the browser. `localhost` only works on the Mac where the program runs. On a phone it means the phone. To pick up changes in a running program, ask the person to press Run again. It stops the old one and starts the new one.";

/**
 * How an agent gets a file off the person's computer (ADR 0287). In the Health space two agents
 * tried four times to reach a Desktop, and each try hung behind a permission box.
 */
export const FILE_WORDS =
  "To get a file from the person's computer, ask them to attach it to a message here. Don't try to read their Desktop, Documents or Downloads: macOS can block that, and the read can hang.";

/**
 * What reaches a person (ADR 0287): an agent's words push only those it @s, and nine of the Health
 * space's messages asked its person for something while @-ing only another agent.
 */
export const REACH_A_PERSON_WORDS =
  "When you need a person to do or decide something, @-mention them. That is what reaches their phone. Don't @ them for updates.";

/**
 * How the space works, the words a taker's note ends with (ADR 0250): that everyone here reads what
 * it writes, and beside other agents, what an @ does and when to answer NO_REPLY. They stay the same
 * from turn to turn while the space's agents do, and its project once it has one: where people
 * open it (`UNIVERSE_WORDS`) and what a page and a running program can do (`RUNNING_WORDS`). Said
 * with every turn, they were a quarter of what a turn in a busy room carried, and in a session that
 * keeps its turns they piled up, so `message.new` carries them apart too (`room.rules`) for a harness
 * to say once a session. How to get a file from a person holds in every space (`FILE_WORDS`, ADR
 * 0287); how to reach one, beside other agents, whose @s are the room's traffic.
 */
export function roomRules(
  members: readonly RoomMember[],
  youId: string,
  project?: boolean,
): string {
  const shared = members.some(
    (member) => member.participant_id !== youId && member.kind === "agent",
  );
  const universe = project === true ? [UNIVERSE_WORDS, RUNNING_WORDS] : [];
  if (!shared) return ["Everyone here reads what you write.", FILE_WORDS, ...universe].join(" ");
  return [
    "Everyone here reads what you write; only those you @-mention act on it.",
    "To hand work to an agent or ask it something, @-mention it.",
    REACH_A_PERSON_WORDS,
    `If a message asks nothing of you now, as when it names a step that is yours later, answer ${NO_REPLY} and nothing else: the space shows nothing, and nobody needs to hear that you are ready or waiting.`,
    FILE_WORDS,
    ...universe,
  ].join(" ");
}

/**
 * A taker's note without the rules it ends with (ADR 0250), for a turn whose session already holds
 * them: the whole note from a Chips that sent no rules, and nothing for a taker with no note.
 */
export function noteWithoutRules(
  room: Pick<RoomNote, "notes" | "rules"> | undefined,
  taker: string,
): string | undefined {
  const note = room?.notes[taker];
  const rules = room?.rules?.[taker];
  if (note === undefined || rules === undefined || !note.endsWith(rules)) return note;
  return note.slice(0, note.length - rules.length).trimEnd();
}

/** A member as the note lists them: "ASCII Art (Jacobian agent, @ASCIIArt)". */
function listing(member: RoomMember): string {
  return `${member.name} (${[kindOf(member), member.handle].filter(Boolean).join(", ")})`;
}

/**
 * Each person's time now, where Chips knows their zone (ADR 0157): one person by the possessive,
 * several in one line. A zone the runtime can't read is left out rather than guessed.
 */
function clockLines(members: readonly RoomMember[], at?: string): string[] {
  if (at === undefined) return [];
  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) return [];
  const clocks = members.flatMap((member) => {
    if (member.kind !== "person" || member.time_zone === undefined) return [];
    const clock = clockIn(instant, member.time_zone);
    return clock === undefined ? [] : [{ name: member.name, clock }];
  });
  const [one] = clocks;
  if (one === undefined) return [];
  if (clocks.length === 1) return [`${one.name}'s time now: ${one.clock}.`];
  return [
    `The time now for each person: ${clocks.map((each) => `${each.name}, ${each.clock}`).join("; ")}.`,
  ];
}

/**
 * An instant as a person reads it in their zone, then as an agent writes it:
 * "9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00, America/Los_Angeles)". The offset is
 * worked out from the wall clock rather than read from the runtime's zone names, which differ
 * between engines.
 */
function clockIn(instant: Date, timeZone: string): string | undefined {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
      weekday: "long",
    }).formatToParts(instant);
  } catch {
    return undefined;
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? "";
  const [year, month, day] = [Number(part("year")), Number(part("month")), Number(part("day"))];
  const [hour, minute, second] = [
    Number(part("hour")),
    Number(part("minute")),
    Number(part("second")),
  ];
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = Math.round((wall - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
  const two = (value: number) => String(value).padStart(2, "0");
  const sign = offset < 0 ? "-" : "+";
  const zone = `${sign}${two(Math.floor(Math.abs(offset) / 60))}:${two(Math.abs(offset) % 60)}`;
  const iso = `${year}-${two(month)}-${two(day)}T${two(hour)}:${two(minute)}${zone}`;
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${two(minute)} ${hour < 12 ? "am" : "pm"}`;
  return `${clock}, ${part("weekday")} ${day} ${MONTHS[month - 1]} ${year} (${iso}, ${timeZone})`;
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** What is news to the taker, first (ADR 0104); last, that older lines were left out (ADR 0105). */
function newsLines(members: readonly RoomMember[], youId: string, news?: TakerNews): string[] {
  if (news === undefined) return [];
  const newcomers = (news.newcomers ?? []).flatMap((newcomer) => {
    const member = members.find((each) => each.participant_id === newcomer.id);
    if (member === undefined || member.participant_id === youId) return [];
    return [`${listing(member)}${newcomer.by === undefined ? "" : `, added by ${newcomer.by}`}`];
  });
  // Said only where the note goes on to say that an @ is what makes a turn: beside another agent.
  const shared = members.some((each) => each.participant_id !== youId && each.kind === "agent");
  return [
    ...nobodysLines(news.nobodys),
    // "It is yours to answer" would say the opposite of "Sanjay says who does what".
    ...(news.yours === undefined || !shared || news.several !== undefined
      ? []
      : [`${news.yours.saidBy} sent this message to you without an @: it is yours to answer.`]),
    ...(news.toAll === undefined || !shared || news.several !== undefined
      ? []
      : [
          `${news.toAll.saidBy} sent this message to every agent here, so each of you has it: answer it yourself, and don't pass it on with an @.`,
        ]),
    ...severalLines(members, youId, news.several),
    ...joinedLines(news.joined),
    ...(newcomers.length === 0 ? [] : [`New since your last turn: ${newcomers.join("; ")}.`]),
    ...cutLines(news.cut),
  ];
}

/**
 * Whether a message is for this taker though it does not @ it (ADR 0081): its sender chose it in
 * the composer, answered its words, or wrote on to it. Not one for every agent, nor one that
 * @-mentions it. Its note says so beside other agents, where it otherwise reads that only those
 * @-mentioned act, and an agent that was not the lead took a person's choice as nobody's turn
 * (ADR 0104 addendum, 15 October 2026).
 */
export function yoursWithoutAt(payload: Readonly<Record<string, unknown>>, taker: string): boolean {
  if (payload["addressed_to_all"] === true) return false;
  const addressed = payload["addressed_to"];
  const mentions = payload["mentions"];
  if (!Array.isArray(addressed) || !addressed.includes(taker)) return false;
  return !(Array.isArray(mentions) && mentions.includes(taker));
}

/**
 * Whether a message went to every agent in the room (ADR 0081's All). Its note says so beside other
 * agents (ADR 0249), where it otherwise reads that only those @-mentioned act: in a room of four
 * agents on 30 October 2026 the lead passed a person's question for all of them on with an @ to the
 * three who already had it, one of them had asked the others the same, and each answered twice.
 */
export function toEveryAgent(payload: Readonly<Record<string, unknown>>): boolean {
  return payload["addressed_to_all"] === true;
}

/** The note's order: by name, numbers in order ("OpenClaw 2" before "OpenClaw 10"). */
const byName = (a: NoteMember, b: NoteMember) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

/**
 * Who a person's message for more than one agent is for, and who organises it (ADR 0287): everyone
 * it is for, in the order it named them (by name, for one sent to every agent), and the lead if it
 * is one of them, else the first. Worked out from the message, so that every taker, on whichever
 * harness, is told the same one. Nothing for a message for fewer than two.
 *
 * `current` turns an id the message was sent to into the id that member has now: a harness asked
 * in a room its agent has since claimed (ADR 0087).
 */
export function severalAsked(
  payload: Readonly<Record<string, unknown>>,
  members: readonly NoteMember[],
  current: (id: string) => string = (id) => id,
): { readonly asked: readonly string[]; readonly organiser: string } | undefined {
  const agents = members.filter((member) => member.kind === "agent");
  const addressed = payload["addressed_to"];
  const named = Array.isArray(addressed)
    ? [...new Set((addressed as string[]).map(current))].flatMap((id) => {
        const agent = agents.find((each) => each.id === id);
        return agent === undefined ? [] : [agent];
      })
    : [];
  const asked = toEveryAgent(payload) ? [...agents].sort(byName) : named;
  const [first] = asked;
  if (first === undefined || asked.length < 2) return undefined;
  return {
    asked: asked.map((agent) => agent.id),
    organiser: (asked.find((agent) => agent.lead === true) ?? first).id,
  };
}

/**
 * What a taker is told of a person's message for several agents (ADR 0287). A question gets each
 * agent's own answer. Work the person has divided goes ahead at once. One job left undivided is
 * divided by one agent, because the agents start within seconds of each other: in the Health space
 * two built the same mocks, and one threw its set away. Four deciding together would be four plans.
 */
function severalLines(
  members: readonly RoomMember[],
  youId: string,
  several: TakerNews["several"],
): string[] {
  if (several === undefined || !several.asked.includes(youId)) return [];
  const nameOf = (id: string) => members.find((member) => member.participant_id === id)?.name;
  const others = several.asked.flatMap((id) => {
    const name = id === youId ? undefined : nameOf(id);
    return name === undefined ? [] : [name];
  });
  const organiser = nameOf(several.organiser);
  if (others.length === 0 || organiser === undefined) return [];
  const undivided = "If one thing is to be made and it doesn't say who does what,";
  return [
    `${several.saidBy} sent this to ${namesInWords(["you", ...others])} too, so each of you already has it: don't pass it on with an @.`,
    "Give your own answer to a question without waiting for the others.",
    "If it says who does what, do your part.",
    several.organiser === youId
      ? `${undivided} you say who does what, with an @ for each, before anyone starts.`
      : `${undivided} ${organiser} says who does what: answer ${NO_REPLY} and wait for that.`,
  ];
}

/** To the lead, that the message is its because it was nobody's turn (ADR 0104). */
function nobodysLines(nobodys: TakerNews["nobodys"]): string[] {
  if (nobodys === undefined) return [];
  const tell = nobodys.tell ?? "the people here";
  return [
    `Nobody has this turn: ${nobodys.saidBy} said it with no @, and nobody in the space has worked since.`,
    `It comes to you as the lead: hand the next step on with an @, or, if the work is done or stuck, tell ${tell}.`,
  ];
}

/** To one that joined a room already talking, when, by whom, and to work from its files. */
function joinedLines(joined: TakerNews["joined"]): string[] {
  if (joined === undefined) return [];
  const by = joined.by === undefined ? "" : `, added by ${joined.by}`;
  return [
    `You joined this space ${ago(joined.minutes)}${by}.`,
    ...(joined.files
      ? [
          "The space's files listed with this turn are its current versions: work from them, not from a copy you made in another space.",
        ]
      : []),
  ];
}

/** That older lines of what was said since its last turn were left out of this one (ADR 0105). */
function cutLines(cut: TakerNews["cut"]): string[] {
  if (cut === undefined) return [];
  const one = cut.shown === 1;
  return [
    `Only the newest ${one ? "line" : `${cut.shown} lines`} of what was said here since your last turn ${one ? "comes" : "come"} with this one: older lines were left out.`,
  ];
}

/** Who leads, said to the lead as "you" (ADR 0104). Nothing in a room with no lead. */
function leadLines(members: readonly RoomMember[], youId: string): string[] {
  const lead = members.find((member) => member.lead === true && member.kind === "agent");
  if (lead === undefined) return [];
  return lead.participant_id === youId
    ? [
        "You lead here: you hand out the work, and what is nobody's turn comes to you.",
        "A step one agent has handed to another needs no word from you until it comes back to you.",
      ]
    : [`${lead.name} leads here: it hands out the work, and what is nobody's turn goes to it.`];
}

/**
 * Which of the other agents have a turn going, and how long the rest have been without one
 * (ADR 0104). Nothing when Chips did not say; an agent that has never had a turn here is left out
 * of "Not working".
 */
function nowLines(members: readonly RoomMember[], youId: string, now?: RoomNow): string[] {
  if (now === undefined) return [];
  const nameOf = (id: string) =>
    id === youId ? undefined : members.find((member) => member.participant_id === id)?.name;
  const working = now.working.flatMap((turn) => {
    const name = nameOf(turn.participant_id);
    if (name === undefined) return [];
    const step = turn.step === undefined ? "" : ` (last step: ${turn.step})`;
    return [`${name}, ${duration(turn.minutes)} in${step}`];
  });
  const going = new Set(now.working.map((turn) => turn.participant_id));
  const idle = now.idle.flatMap((rest) => {
    const name = going.has(rest.participant_id) ? undefined : nameOf(rest.participant_id);
    return name === undefined ? [] : [`${name} for ${duration(rest.minutes)}`];
  });
  const lines = [`Working now: ${working.length === 0 ? "nobody else" : working.join("; ")}.`];
  if (idle.length > 0) lines.push(`Not working: ${idle.join(", ")}.`);
  return lines;
}

/** A stretch of whole minutes in words: "under a minute", "1 minute", "3 hours", "4 days". */
function duration(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes === 1) return "1 minute";
  if (minutes < 90) return `${minutes} minutes`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / (24 * 60))} days`;
}

/** How long ago, in words: "just now", "4 minutes ago". */
function ago(minutes: number): string {
  return minutes < 1 ? "just now" : `${duration(minutes)} ago`;
}

/** What a member is: a person, an agent, or one of a harness's: `Jacobian agent`. */
function kindOf(member: RoomMember): string {
  return member.harness === undefined ? member.kind : `${member.harness} agent`;
}

/**
 * The room as `message.new` carries it: the members, and a note for each who takes the turn; with
 * who has a turn going when Chips said (ADR 0104), what is news to each taker, what the job has
 * spent (ADR 0117), and each person's time at the instant it is sent (`at`, ADR 0157); and the
 * rules each note ends with (ADR 0250), which say where Universe is in a space with a `project`.
 */
export function roomNoteFor(
  members: readonly NoteMember[],
  takers: readonly string[],
  now?: RoomNow,
  news?: Readonly<Record<string, TakerNews>>,
  spend?: JobSpend,
  at?: string,
  project?: boolean,
): RoomNote {
  const listed = roomMembers(members);
  return {
    members: listed,
    notes: Object.fromEntries(
      takers.map((taker) => [
        taker,
        renderRoomNote(listed, taker, now, news?.[taker], spend, at, project),
      ]),
    ),
    rules: Object.fromEntries(takers.map((taker) => [taker, roomRules(listed, taker, project)])),
    ...(now === undefined ? {} : { working: [...now.working], idle: [...now.idle] }),
  };
}
