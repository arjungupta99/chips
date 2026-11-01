/**
 * When Chips steps in on agents talking to each other (ADR 0187): the stop, the hold and the
 * circles switch an owner or an admin set for the workspace, folded from `exchange.limits_set`,
 * and the words every client's settings say them with. One event carries all three, so the last
 * one folded is the workspace's word; the audit says who set what.
 */

import {
  DEFAULT_EXCHANGE_LIMITS,
  type ExchangeLimits,
  exchangeLimitsOf,
  HOLD_CHOICES,
  HOLD_RANGE,
  nudgeAt,
  STOP_CHOICES,
  STOP_RANGE,
} from "@chipschat/protocol";
import type { FoldStep } from "./state.js";

export const EXCHANGE_LIMITS_FOLDS: Readonly<Record<string, FoldStep>> = {
  "exchange.limits_set": (state, event) => {
    state.exchangeLimits = exchangeLimitsOf(event);
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "policy",
      who: event.actor.id,
      what: `set when Chips steps in on agents: ${limitsWords(state.exchangeLimits).toLowerCase()}`,
    });
  },
};

/** The setting's row under its name: `Stop after 16 · hold after 48`, and `circles off` when it is. */
export function limitsWords(limits: ExchangeLimits): string {
  const stop =
    limits.stop !== null
      ? `Stop after ${limits.stop}`
      : limits.circles
        ? "Stop on repeats only"
        : "Never told to stop";
  const hold = limits.hold === null ? "never held" : `hold after ${limits.hold}`;
  const circles = limits.stop !== null && !limits.circles ? ["circles off"] : [];
  return [stop, hold, ...circles].join(" · ");
}

/** The settings as one sentence, for a screen with room for it (web, Mac). */
export function limitsSentence(limits: ExchangeLimits): string {
  const stop =
    limits.stop === null
      ? limits.circles
        ? "tells them to stop only when they go in circles"
        : "never tells them to stop"
      : `tells them to stop after ${limits.stop}${limits.circles ? ", or sooner in circles" : ""}`;
  const hold = limits.hold === null ? "never holds them" : `holds them after ${limits.hold}`;
  return `Chips tells agents the count from ${nudgeAt(limits)} messages to each other with nobody acting, ${stop}, and ${hold}.`;
}

/** Why the setting is there, at the top of its sheet. */
export const LIMITS_WHY =
  "Agents in a space can pass work to each other while you're away. Sometimes they keep talking with nothing to show for it, and every turn costs money. These numbers decide when Chips steps in.";

/** What each of the three says, under its name. */
export const LIMITS_SETTINGS = {
  stop: {
    title: "Tell them to stop after",
    words: "Chips asks them to stop and say what's done, and tells you.",
  },
  circles: {
    title: "Stop them when they go in circles",
    words:
      "The same two or three taking turns and saying what they said before. Told to stop then, whatever the number.",
  },
  hold: {
    title: "Hold them after",
    words: "Their messages to each other wait until you act. Nothing is lost.",
  },
} as const;

/** How Chips counts, behind its disclosure. */
export const LIMITS_HOW: readonly string[] = [
  "Only messages agents send each other count. Their messages to you don't.",
  "The count starts again when you do anything in the space, or when an agent makes something new: a file, a question for you, an approval request.",
  "Agents that repeat themselves, the same two or three taking turns and saying what they already said, are told to stop sooner. Going back and forth with something new each time is fine, and the switch above turns this off.",
  "Held messages go to the agents they were for as soon as you act.",
];

/** One step of the ladder the sheet draws: the number on its disc, and what happens there. */
export interface LimitsStep {
  readonly kind: "count" | "stop" | "hold";
  /** The number, `↻` for a stop that comes only in circles, `–` for none. */
  readonly mark: string;
  readonly never: boolean;
  readonly words: string;
}

/** What happens in a room as the agents' messages to each other mount, in order. */
export function limitsLadder(limits: ExchangeLimits): readonly LimitsStep[] {
  const stop: LimitsStep =
    limits.stop === null
      ? {
          kind: "stop",
          mark: limits.circles ? "↻" : "–",
          never: !limits.circles,
          words: limits.circles
            ? "Only when they go in circles: it tells them to stop, and tells you."
            : "Never told to stop.",
        }
      : {
          kind: "stop",
          mark: String(limits.stop),
          never: false,
          words: limits.circles
            ? "It tells them to stop and say what's done, and tells you. Sooner if they go in circles."
            : "It tells them to stop and say what's done, and tells you.",
        };
  return [
    {
      kind: "count",
      mark: String(nudgeAt(limits)),
      never: false,
      words: "Chips tells the agents the count.",
    },
    stop,
    {
      kind: "hold",
      mark: limits.hold === null ? "–" : String(limits.hold),
      never: limits.hold === null,
      words:
        limits.hold === null
          ? "Their messages to each other are never held."
          : "It holds their messages to each other until you act.",
    },
  ];
}

/** A pick in the sheet: a choice's number as text, `other` for a typed one, `never` for none. */
export type LimitsPick = string;

/** The sheet's settings as they are being picked, before Save. */
export interface LimitsDraft {
  readonly stop: LimitsPick;
  readonly hold: LimitsPick;
  readonly circles: boolean;
  /** What is typed in each Other field, kept while another choice is picked. */
  readonly typed: { readonly stop: string; readonly hold: string };
}

/** The choices each number offers, before Other and Never. */
export const LIMITS_CHOICES = { stop: STOP_CHOICES, hold: HOLD_CHOICES } as const;
export const LIMITS_RANGES = { stop: STOP_RANGE, hold: HOLD_RANGE } as const;

/** The saved settings as the sheet opens on them: a number off the choices is an Other. */
export function limitsDraft(limits: ExchangeLimits): LimitsDraft {
  const pick = (kind: "stop" | "hold") => {
    const value = limits[kind];
    if (value === null) return { pick: "never", typed: "" };
    return LIMITS_CHOICES[kind].includes(value)
      ? { pick: String(value), typed: "" }
      : { pick: "other", typed: String(value) };
  };
  const stop = pick("stop");
  const hold = pick("hold");
  return {
    stop: stop.pick,
    hold: hold.pick,
    circles: limits.circles,
    typed: { stop: stop.typed, hold: hold.typed },
  };
}

/** A number's pick as a count: a number, null for Never, undefined for an Other not yet whole. */
export function pickedOf(draft: LimitsDraft, kind: "stop" | "hold"): number | null | undefined {
  const pick = draft[kind];
  if (pick === "never") return null;
  if (pick !== "other") return Number(pick);
  const typed = draft.typed[kind].trim();
  const range = LIMITS_RANGES[kind];
  if (!/^\d+$/.test(typed)) return undefined;
  const value = Number(typed);
  return value >= range.least && value <= range.most ? value : undefined;
}

/** The draft as settings, or the reason it is not one yet. */
export function limitsFromDraft(
  draft: LimitsDraft,
): { readonly limits: ExchangeLimits } | { readonly error: string } {
  const stop = pickedOf(draft, "stop");
  const hold = pickedOf(draft, "hold");
  if (stop === undefined) return { error: "Tell them to stop after a whole number from 4 to 500." };
  if (hold === undefined) return { error: "Hold them after a whole number from 10 to 1,000." };
  if (stop !== null && hold !== null && stop >= hold) {
    return {
      error: "Chips would hold them before telling them to stop. Pick a stop under the hold.",
    };
  }
  return { limits: { stop, hold, circles: draft.circles } };
}

/**
 * A new pick in the draft. A hold picked at or under the stop takes the stop down to the next
 * choice under it, so the two never cross; `moved` says when it did, for the chip to show it. A
 * stop is never moved for being picked: the choices over the hold can't be (`stopFits`), and an
 * Other typed over it says why it can't be saved (`limitsFromDraft`).
 */
export function pickLimit(
  draft: LimitsDraft,
  kind: "stop" | "hold",
  pick: LimitsPick,
): { readonly draft: LimitsDraft; readonly moved: boolean } {
  const next: LimitsDraft = { ...draft, [kind]: pick };
  if (kind === "stop") return { draft: next, moved: false };
  const stop = pickedOf(next, "stop");
  const hold = pickedOf(next, "hold");
  if (typeof stop !== "number" || typeof hold !== "number" || stop < hold) {
    return { draft: next, moved: false };
  }
  const under = STOP_CHOICES.filter((value) => value < hold).at(-1) ?? STOP_CHOICES[0];
  return { draft: { ...next, stop: String(under) }, moved: true };
}

/** Whether a stop choice can be picked under the hold picked now. */
export function stopFits(draft: LimitsDraft, value: number): boolean {
  const hold = pickedOf(draft, "hold");
  return typeof hold !== "number" || value < hold;
}

/** Whether the draft says what is saved already, so Save has nothing to do. */
export function sameLimits(a: ExchangeLimits, b: ExchangeLimits): boolean {
  return a.stop === b.stop && a.hold === b.hold && a.circles === b.circles;
}

/** The line under the sheet: the problem, the warning a hold of Never needs, or whose numbers. */
export function limitsFoot(draft: LimitsDraft): { readonly text: string; readonly warn: boolean } {
  const read = limitsFromDraft(draft);
  if ("error" in read) return { text: read.error, warn: true };
  if (read.limits.hold === null) {
    return {
      text: "The space's Spend per job still pauses them, but only for harnesses that report what a run cost. Others go on until you stop them.",
      warn: true,
    };
  }
  return sameLimits(read.limits, DEFAULT_EXCHANGE_LIMITS)
    ? { text: "Chips's own numbers.", warn: false }
    : { text: "For every space in the workspace.", warn: false };
}
