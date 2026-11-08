/**
 * The films (ADR 0213). A film is chapters, each the place it opens on, the events it plays, the
 * waits between them, and what You does by when. The first, Watch Chips work, is nine chapters;
 * the ones after it start where it ends (`after`), with the workspace holding everything it
 * played. `pnpm film` renders them into the videos the app plays (ADR 0217), acting as a person
 * does on the app's own controls (`tools/film/acts.json`); the videos' words are the beats files'
 * in `tools/film/beats/`. Here are the words the app shows: what the agents say, and the end
 * card's.
 * They describe what a person can do and what the app shows, and promise nothing an agent does (his
 * rule of 20 October 2026), since when an agent asks is its harness's choice (ADR 0195). No date:
 * "Saturday", never a day of a month.
 *
 * The events are the wire's own, the ones a harness's would be, so the phone, the web and the Mac
 * draw them with the screens they draw any workspace with. A core test plays every chapter through
 * the real fold, and the protocol's schemas parse every event here, so a change to the wire that
 * would break the film breaks a test first.
 *
 * Places, prices and people are made up, and the film says it is a demo.
 */

import { notRight } from "../notRight.js";
import { demoId } from "./device.js";
import {
  AGENTS,
  type AgentKey,
  BIRTHDAY,
  BRIEF,
  CARD,
  type Draft,
  HERALD,
  MILO_INSTRUCTIONS,
  RECEIPTS,
} from "./workspace.js";

/**
 * Where the app opens as a chapter starts: a tab, a room, the lock screen picture over a room, or
 * an agent's page (`agentId`). From there it goes where the person's taps take it.
 */
export type DemoScreen = "spaces" | "room" | "lock" | "agents" | "agent";

/**
 * Something You does on the app's own control, as the store sends it: a message, an answer, an
 * agent's model and effort (`changeAgentModel`), a context file saved (`editContext`, over the
 * version `agentContext` reads), a Compact now (`compactAgent`), a fork into a new room
 * (`forkIntoNewRoom`), a move (`moveAgent`), what a room allows a job (`setSpendCeiling`), and Not
 * right? on a message, by its words (`sendFeedback`, a correction).
 */
export type Act =
  | {
      readonly kind: "send";
      readonly spaceId: string;
      readonly text: string;
      /** Who it is for, as the field picked (`to`, ADR 0229): the agent the slide let go on. */
      readonly to?: readonly string[] | undefined;
    }
  | {
      readonly kind: "approve";
      readonly spaceId: string;
      readonly runId: string;
      readonly approvalId: string;
    }
  | {
      readonly kind: "model";
      readonly agentId: string;
      readonly model: string;
      readonly effort: string;
    }
  | {
      readonly kind: "context";
      readonly agentId: string;
      readonly name: string;
      readonly text: string;
    }
  | { readonly kind: "compact"; readonly agentId: string }
  | { readonly kind: "fork"; readonly agentId: string; readonly title: string }
  | { readonly kind: "move"; readonly agentId: string; readonly spaceId: string }
  | { readonly kind: "spend"; readonly spaceId: string; readonly usd: number }
  | {
      readonly kind: "notRight";
      readonly spaceId: string;
      /** The message it is about, by its words: the newest in the room that says them. */
      readonly said: string;
      readonly text: string;
    };

/** The lock screen chapter 9 draws as a picture: who asks, and the ask it answers. */
export interface LockScreenCue {
  readonly agent: AgentKey;
  readonly question: string;
  readonly spaceId: string;
  readonly runId: string;
  readonly approvalId: string;
}

/** One moment of a chapter, `wait` milliseconds of played time after the one before it. */
export interface Beat {
  readonly wait: number;
  /** Said by the demo's harnesses, through the store's socket. */
  readonly play?: readonly Draft[] | undefined;
  /** Said instead of `play` when You answered the chapter's ask with Deny. */
  readonly ifDenied?: readonly Draft[] | undefined;
  /** The lock screen picture from here, or `null` to take it away. */
  readonly lockScreen?: LockScreenCue | null | undefined;
  /**
   * A harness's connection from here (ADR 0083): the `presence` frame the server sends, and the
   * directory as it reads after.
   */
  readonly presence?: { readonly harnessId: string; readonly connected: boolean } | undefined;
  /**
   * What You does by now, on the app's own control: the render does it a moment before
   * (`tools/film/acts.json`). The player never does it. The server plays it into a demo that
   * starts after this chapter, and the render mode marks it missed when nobody had done it by now.
   */
  readonly act?: Act | undefined;
}

export interface DemoChapter {
  readonly key: string;
  readonly screen: DemoScreen;
  /** The room, when the screen is one. */
  readonly spaceId?: string | undefined;
  /** The agent, when the screen is its page. */
  readonly agentId?: string | undefined;
  readonly beats: readonly Beat[];
  /** Played after the last beat, so what it left can be seen before the next chapter. */
  readonly hold: number;
}

/** What the end card says after a film's video: its heading, and the sentence under it. */
export interface FilmEnd {
  readonly line: string;
  readonly sentence: string;
}

/**
 * A film: its chapters, what to call it, what its end card says, and the film whose end it starts
 * from, whose events the workspace already holds when it begins.
 */
export interface DemoFilm {
  readonly key: string;
  readonly title: string;
  readonly end: FilmEnd;
  readonly after?: string | undefined;
  readonly chapters: readonly DemoChapter[];
}

/** How long a chapter plays: its waits, and its hold. */
export function chapterLength(chapter: DemoChapter): number {
  return chapter.beats.reduce((sum, beat) => sum + beat.wait, chapter.hold);
}

/** The runs the film plays, and the asks in them. */
export const RUNS = {
  gallery: demoId("run", 1),
  dinner: demoId("run", 2),
  card: demoId("run", 3),
  brief: demoId("run", 4),
  /** Milo's second try, after Not right? (Costs and trouble). */
  again: demoId("run", 5),
  /** Theo's answer to the words You sent him alone. */
  notes: demoId("run", 6),
} as const;

export const APPROVALS = {
  deposit: demoId("approval", 1),
  invites: demoId("approval", 2),
} as const;

/** What one agent says in its room, inside one of its runs. */
function speaking(agent: AgentKey, run: string) {
  return (type: string, payload: Readonly<Record<string, unknown>>): Draft => ({
    type,
    by: agent,
    space: AGENTS[agent].room,
    run,
    payload,
  });
}

const felix = speaking("felix", RUNS.gallery);
const milo = speaking("milo", RUNS.dinner);
const theo = speaking("theo", RUNS.card);
const hugo = speaking("hugo", RUNS.brief);
const notes = speaking("theo", RUNS.notes);

const thinking = (words: string) => ({ phase: "thinking", verb_phrase: words });

/**
 * A step of a run, done, as its harness reports it once it has finished: what What the run did
 * lists, with how long each took (ADR 0050).
 */
const done = (stepId: string, title: string, ms: number) => ({
  step_id: stepId,
  status: "done",
  title,
  duration_ms: ms,
});

const ASK = "Find somewhere for Mum's 60th on Saturday. 12 of us, and she loves Italian.";
const STEER = "Somewhere she can walk to, if you can";
const GALLERY_UP = "The gallery page is up. Have a look?";
const PLACES = [
  "Three can seat 12 on Saturday, all a walk from Mum's:",
  "",
  "| Place | Per head | Rating |",
  "|---|---|---|",
  "| **Osteria Verde** | $58 | 4.7 |",
  "| Casa Lucca | $65 | 4.6 |",
  "| Pasta Lane | $72 | 4.5 |",
  "",
  "Osteria Verde has a private room. I'll take that one.",
].join("\n");
const HAND_OFF =
  "@Theo, could you make an invite card? A Tuscan sunset, Saturday 7:30 at Osteria Verde.";
const HERES_THE_CARD = "Here's the card.";
const SENT = "Sent to 11. Ana and Raj have said yes already.";
const LOVE_THE_CARD = "Love the card!";
/** You's words to Theo alone, picked with a slide up the faces (ADR 0229), and his answer. */
const TO_THEO = "Can you keep this design for the thank-you notes?";
const KEPT = "Kept. The thank-you notes will match the card.";
const BRIEF_READY = "Tomorrow's brief is ready: dry until noon, showers after.";

/** Milo's two asks: the deposit (chapter 8, You's turn) and the invites (chapter 9, the lock screen). */
const DEPOSIT = {
  approval_id: APPROVALS.deposit,
  action: {
    kind: "payment.deposit",
    input: { to: "Osteria Verde", amount_usd: 120 },
    external: true,
    money_usd: 120,
  },
  question: "Pay the $120 deposit to book Osteria Verde for 12?",
  effect: "Saturday, 7:30 pm, the private room. Refundable until Thursday.",
  lasts: "once",
  risk: ["financial", "external"],
  expires_in: 172_800,
};

const INVITES_QUESTION = "Send Theo's invite card to the 11 people in Family?";
const INVITES = {
  approval_id: APPROVALS.invites,
  action: { kind: "message.send", input: { to: "Family", people: 11 }, external: true },
  question: INVITES_QUESTION,
  effect: "Each of them gets the card from you, with the time and the place.",
  lasts: "once",
  risk: ["external_communication"],
  expires_in: 172_800,
};

/**
 * The one answer a message gets once the film is over and You looks around (ADR 0213, point 7),
 * from the agent it was for.
 */
export const CANNED_ANSWER =
  "This workspace is made up, so this is the one answer I have. Set up your own Chips to talk to your own agents.";

/** Why the demo turned something away: a request, an event, a file it does not have. */
export const NOT_IN_DEMO_WORDS = "this isn't in the demo";

/**
 * What a run reports it cost as it completes (ADR 0021), always an estimate: the room's receipt
 * and the room's spend read it (ADR 0117).
 */
const costing = (usd: number) => ({ cost: { usd, estimated: true } });

/** Watch Chips work: what Chips is, in ten chapters, two of them the person's own taps. */
const WATCH: readonly DemoChapter[] = [
  {
    key: "spaces",
    screen: "spaces",
    beats: [
      {
        wait: 300,
        play: [
          felix("run.started", {
            goal: "Can the gallery page show the spring photos first?",
            goal_from: "chips",
          }),
        ],
      },
      { wait: 900, play: [felix("run.status", thinking("Building the gallery page"))] },
    ],
    hold: 4300,
  },
  {
    key: "ask",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      {
        wait: 700,
        play: [
          felix("message.post", { text: GALLERY_UP }),
          felix("run.completed", { summary: GALLERY_UP, ...costing(0.11) }),
        ],
      },
      { wait: 2600, act: { kind: "send", spaceId: BIRTHDAY, text: ASK } },
    ],
    hold: 1500,
  },
  {
    key: "watch",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      { wait: 600, play: [milo("run.started", { goal: ASK, goal_from: "chips" })] },
      {
        wait: 1300,
        play: [
          milo("run.status", thinking("Searching restaurants near Mum's")),
          milo("step.log", {
            step_id: "places",
            status: "started",
            tool: "web_search",
            kind: "search",
            title: "web_search · Italian restaurants near Mum's",
          }),
        ],
      },
      {
        wait: 2300,
        play: [
          milo("step.log", { step_id: "places", status: "done", duration_ms: 2100 }),
          milo("run.status", thinking("Comparing prices, reviews and a table for 12")),
        ],
      },
    ],
    hold: 2600,
  },
  {
    key: "steer",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      // A step's report stands apart from the words after it: the bubble says the newer of the two.
      {
        wait: 600,
        play: [
          milo("step.log", done("compare", "Compared prices, reviews and a table for 12", 3400)),
        ],
      },
      { wait: 1800, act: { kind: "send", spaceId: BIRTHDAY, text: STEER } },
      { wait: 1500, play: [milo("run.status", thinking("Checking which are a walk from Mum's"))] },
    ],
    hold: 2400,
  },
  {
    key: "results",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      {
        wait: 1200,
        play: [milo("step.log", done("walk", "Checked which are a walk from Mum's", 1800))],
      },
      {
        wait: 300,
        play: [
          milo("message.post", { text: PLACES }),
          milo("run.status", thinking("Thinking about an invite for the family")),
        ],
      },
    ],
    hold: 4000,
  },
  {
    key: "teamwork",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      {
        wait: 1300,
        play: [
          milo("message.post", { text: HAND_OFF }),
          milo("run.status", { phase: "waiting", verb_phrase: "Waiting for Theo's card" }),
        ],
      },
      { wait: 1200, play: [theo("run.started", { goal: HAND_OFF, goal_from: "chips" })] },
      { wait: 800, play: [theo("run.status", thinking("Drawing an invite card"))] },
      {
        wait: 2600,
        play: [
          theo("message.post", { text: HERES_THE_CARD, attachments: [CARD] }),
          theo("run.completed", { summary: HERES_THE_CARD, ...costing(0.08) }),
        ],
      },
      {
        wait: 1000,
        play: [
          { type: "message.post", by: "rosa", space: BIRTHDAY, payload: { text: LOVE_THE_CARD } },
        ],
      },
    ],
    // Who is here, and the harness each agent runs on: the room's own sheet, for a moment.
    hold: 4700,
  },
  {
    // You picks Theo alone with a slide up the faces (ADR 0229), and only Theo takes a turn.
    key: "pick",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      {
        wait: 5650,
        act: { kind: "send", spaceId: BIRTHDAY, text: TO_THEO, to: [AGENTS.theo.id] },
      },
      { wait: 600, play: [notes("run.started", { goal: TO_THEO, goal_from: "chips" })] },
      { wait: 600, play: [notes("run.status", thinking("Saving the card as a template"))] },
      {
        wait: 1300,
        play: [
          notes("message.post", { text: KEPT }),
          notes("run.completed", { summary: KEPT, ...costing(0.02) }),
        ],
      },
    ],
    hold: 1600,
  },
  {
    key: "approve",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      {
        wait: 900,
        play: [milo("run.status", thinking("Booking the private room at Osteria Verde"))],
      },
      { wait: 1400, play: [milo("approval.request", DEPOSIT)] },
      {
        wait: 1600,
        act: {
          kind: "approve",
          spaceId: BIRTHDAY,
          runId: RUNS.dinner,
          approvalId: APPROVALS.deposit,
        },
      },
      {
        wait: 1500,
        play: [
          milo("approval.executed", {
            approval_id: APPROVALS.deposit,
            outcome: "executed",
            detail: "Paid the $120 deposit to Osteria Verde.",
          }),
          milo("step.log", done("book", "Booked the private room at Osteria Verde", 900)),
          milo("message.post", { text: "Booked. Want Theo's card sent to the family?" }),
        ],
        ifDenied: [
          milo("message.post", {
            text: "Okay, I won't book it. Want Theo's card sent to the family anyway?",
          }),
        ],
      },
    ],
    hold: 2400,
  },
  {
    key: "lock",
    screen: "lock",
    spaceId: BIRTHDAY,
    beats: [
      {
        wait: 700,
        play: [milo("approval.request", INVITES)],
        lockScreen: {
          agent: "milo",
          question: INVITES_QUESTION,
          spaceId: BIRTHDAY,
          runId: RUNS.dinner,
          approvalId: APPROVALS.invites,
        },
      },
      {
        wait: 2600,
        act: {
          kind: "approve",
          spaceId: BIRTHDAY,
          runId: RUNS.dinner,
          approvalId: APPROVALS.invites,
        },
      },
      { wait: 1200, lockScreen: null },
      {
        wait: 600,
        play: [
          milo("approval.executed", { approval_id: APPROVALS.invites, outcome: "executed" }),
          milo("step.log", done("send", "Sent Theo's card to 11 people", 1100)),
          milo("message.post", { text: SENT }),
          // What the run did, whole: its model and tokens, and what its harness says it cost.
          milo("usage", {
            scope: "run",
            model: "heron-2-mini",
            input_tokens: 30_200,
            output_tokens: 2100,
            ...costing(0.42),
          }),
          milo("run.completed", { summary: SENT, ...costing(0.42) }),
        ],
      },
    ],
    hold: 2600,
  },
  {
    key: "agents",
    screen: "agents",
    beats: [
      {
        wait: 600,
        play: [
          hugo("run.started", { goal: "Put together tomorrow's brief" }),
          hugo("run.status", thinking("Checking tomorrow's weather")),
        ],
      },
      {
        wait: 3000,
        play: [
          hugo("message.post", { text: BRIEF_READY }),
          hugo("run.completed", { summary: BRIEF_READY, ...costing(0.02) }),
        ],
      },
    ],
    hold: 1400,
  },
];

const MILO = AGENTS.milo.id;
const INSTRUCTIONS = "INSTRUCTIONS.md";
/** The line the second film adds to Milo's instructions. */
const STEP_FREE = "- Say whether a place has step-free access.";
export const INSTRUCTIONS_SAVED = `${MILO_INSTRUCTIONS}${STEP_FREE}\n`;
/**
 * The room Milo's copy joins: named as the room picker names a copy's new room (core's
 * `forkRoomTitle`), so the room is called what the sheet said it would be.
 */
export const FORK_ROOM = "Milo · fork";

/**
 * Your agents, up close: one agent's page, Milo's, from what it runs on to where it is. Every
 * change goes through the store to the demo's Errand, which answers it, and the page reads it back.
 */
const AGENTS_FILM: readonly DemoChapter[] = [
  {
    key: "page",
    screen: "agent",
    agentId: MILO,
    beats: [],
    hold: 4500,
  },
  {
    key: "model",
    screen: "agent",
    agentId: MILO,
    beats: [
      { wait: 4600, act: { kind: "model", agentId: MILO, model: "heron-2", effort: "deep" } },
    ],
    hold: 3200,
  },
  {
    key: "instructions",
    screen: "agent",
    agentId: MILO,
    // Room for the new line to be typed, a key at a time.
    beats: [
      {
        wait: 4500,
        act: { kind: "context", agentId: MILO, name: INSTRUCTIONS, text: INSTRUCTIONS_SAVED },
      },
    ],
    hold: 2400,
  },
  {
    key: "compact",
    screen: "agent",
    agentId: MILO,
    beats: [{ wait: 4000, act: { kind: "compact", agentId: MILO } }],
    hold: 3500,
  },
  {
    key: "fork",
    screen: "agent",
    agentId: MILO,
    beats: [{ wait: 3500, act: { kind: "fork", agentId: MILO, title: FORK_ROOM } }],
    hold: 3100,
  },
  {
    key: "move",
    screen: "agent",
    agentId: MILO,
    beats: [{ wait: 3100, act: { kind: "move", agentId: MILO, spaceId: RECEIPTS } }],
    hold: 2900,
  },
];

const MUM_STAIRS = "Mum can't manage stairs.";
const MISSED = "Missed what I asked";
/** What Not right? sends for the reason and the words, as the page makes it (ADR 0200). */
const CORRECTION = notRight([MISSED], MUM_STAIRS) ?? MUM_STAIRS;
const SORRY =
  "Sorry, I missed that. Osteria Verde's private room is up a flight of stairs; Casa Lucca's is step-free. Shall I move the booking?";
const TOMORROW = "What's on tomorrow?";
const again = speaking("milo", RUNS.again);

/**
 * Costs and trouble: what a job did and cost, what a room allows a job, telling an agent its
 * answer missed, and an agent whose harness is offline.
 */
const TROUBLE: readonly DemoChapter[] = [
  {
    key: "cost",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [],
    hold: 7200,
  },
  {
    key: "spend",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [{ wait: 5600, act: { kind: "spend", spaceId: BIRTHDAY, usd: 5 } }],
    hold: 1500,
  },
  {
    key: "notRight",
    screen: "room",
    spaceId: BIRTHDAY,
    beats: [
      { wait: 5000, act: { kind: "notRight", spaceId: BIRTHDAY, said: PLACES, text: CORRECTION } },
      {
        wait: 850,
        play: [
          again("run.started", { goal: CORRECTION, goal_from: "chips" }),
          again("run.status", thinking("Checking which private rooms are step-free")),
        ],
      },
      {
        wait: 1900,
        play: [
          again("step.log", done("stairs", "Checked the private rooms for stairs", 1400)),
          again("message.post", { text: SORRY }),
          again("run.completed", { summary: SORRY, ...costing(0.06) }),
        ],
      },
    ],
    hold: 2600,
  },
  {
    key: "cantAnswer",
    screen: "room",
    spaceId: BRIEF,
    beats: [
      { wait: 300, presence: { harnessId: HERALD, connected: false } },
      { wait: 1500, act: { kind: "send", spaceId: BRIEF, text: TOMORROW } },
    ],
    hold: 4000,
  },
];

/** What the short films' end cards say under their line. */
const NEXT = "Watch another, or set up your own.";

/**
 * The films, the first first. The two after it, Your agents up close and Costs and trouble, start
 * from its end (`after: "watch"`), offered on its end card under More to see (ADR 0213, point 8).
 */
export const FILMS: readonly DemoFilm[] = [
  {
    key: "watch",
    title: "Watch Chips work",
    end: { line: "That's Chips", sentence: "Set up your own, or join someone who invited you." },
    chapters: WATCH,
  },
  {
    key: "agents",
    title: "Your agents, up close",
    end: { line: "That's an agent, up close", sentence: NEXT },
    after: "watch",
    chapters: AGENTS_FILM,
  },
  {
    key: "trouble",
    title: "Costs and trouble",
    end: { line: "That's costs and trouble", sentence: NEXT },
    after: "watch",
    chapters: TROUBLE,
  },
];

/** A film by its key, or the film itself; the first when none is named. */
export function filmOf(named?: string | DemoFilm): DemoFilm {
  if (typeof named === "object") return named;
  const film = named === undefined ? FILMS[0] : FILMS.find((each) => each.key === named);
  if (film === undefined) throw new Error(`The demo has no film called ${named}.`);
  return film;
}

/** How long a film plays at speed 1, every chapter of it. */
export function filmLength(film: DemoFilm): number {
  return film.chapters.reduce((sum, chapter) => sum + chapterLength(chapter), 0);
}
