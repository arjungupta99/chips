/**
 * What a Chips push is, as the server that sends one and the push relay that sends it on agree.
 *
 * Its words in the clear (ADR 0045) are fixed sentences, the same on every server, saying nothing
 * of who or what. A phone shows them as they are unless it opens what is sealed to it (ADR 0158).
 * They live here, once, because the push relay sends a push on only when its words are one of
 * these pairs (ADR 0246's second addendum). The relay holds the Chips app's Expo token, and anyone
 * who has a phone's push token can post to it; with any words allowed, that was anyone's to put
 * a sentence of their own on a phone's lock screen as Chips. A server says one of these, so a
 * server is never refused for its words; a sentence somebody made up is.
 *
 * And it goes to an Expo push token, which is all the Chips app registers: a server takes no
 * other as a phone's, and the relay answers one that isn't as Expo answers a dead one.
 */

/** An Expo push token, `ExponentPushToken[…]`, as `expo-notifications` hands one to the app. */
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[^\]\s]{1,256}\]$/;

/** Whether `token` is an Expo push token, the only kind a Chips phone registers. */
export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && EXPO_PUSH_TOKEN.test(token);
}

/** One push's words, and the buttons it shows when it has any. */
export interface PushWords {
  readonly title: string;
  readonly body: string;
  /** The phone's registered buttons for it: Approve (with Face ID) and Deny. */
  readonly categoryId?: string;
}

export const PUSH_WORDS = {
  /** An ask of an agent's that waits on a person (ADR 0045). */
  decision: {
    title: "A decision is waiting",
    body: "Approve or deny from here.",
    categoryId: "decision",
  },
  /** A message that @s the person, or was sent to them (ADR 0158). */
  messageForYou: { title: "A message for you", body: "Open Chips to read it." },
  /** A message in a room they hear (ADR 0158). */
  message: { title: "A new message", body: "Open Chips to read it." },
  /** A join request for its maker or an owner (ADR 0122). */
  join: { title: "Something asks to join", body: "Check its code, then allow it or not." },
  /** The referee paused agents talking among themselves (ADR 0097). */
  held: { title: "Chips paused the agents", body: "Open the space to let them carry on." },
  warning: { title: "The agents need a look", body: "They have been talking among themselves." },
  /** A guest's ask to go direct, and its answers (ADR 0211). */
  directAsked: {
    title: "A guest wants to connect directly",
    body: "Share your server with them in Tailscale.",
  },
  directShared: { title: "Your server is shared with you", body: "Open Chips to go direct." },
  directDone: {
    title: "Connected directly",
    body: "A guest you shared your server with is direct now.",
  },
  /** An owner is turning the relay off (ADR 0211, Phase 4). */
  relayOff: { title: "The relay is going off", body: "Go direct to keep reaching the server." },
} as const satisfies Record<string, PushWords>;

const KNOWN = new Set(
  Object.values(PUSH_WORDS).map((words) =>
    JSON.stringify([words.title, words.body, "categoryId" in words ? words.categoryId : null]),
  ),
);

/** Whether a push's title, body and buttons are one of Chips's own, exactly. */
export function isPushWords(push: {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly categoryId?: unknown;
}): boolean {
  return KNOWN.has(JSON.stringify([push.title, push.body, push.categoryId ?? null]));
}
