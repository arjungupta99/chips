/**
 * The program's banner over a page in Universe, and the sheet a link brings up (ADR 0227's
 * addendum of 9 November 2026). A space's start page can link to what its program serves (the
 * Health space's links to its app's address), and those pages answer only while the program runs
 * on the owner's Mac. Arjun, 9 November 2026: "Banner shows up for program. the bottom sheet only
 * shows up if the program is not running", "also show stop button on the banner when the program
 * is running".
 *
 * The banner is the Desktop tab's Run bar (`runBar`) said shorter, over the page: whether the
 * program runs, Run while it doesn't and Stop while it does. A link to a web address tapped while it
 * doesn't run brings up the sheet, which runs it and opens the page once it answers, or opens it
 * anyway. One tapped while it runs opens, as any link does. A link to the phone's own address
 * (localhost) never opens on a phone, so the banner says so instead.
 *
 * The words are here, so every device that draws them says the same; the phone draws them first.
 */

import { opensShown, type ProjectRun } from "@chipschat/protocol";
import type { Directory } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import type { RunBar } from "./projectRun.js";
import { type MacsHeard, unheardWords } from "./yourFolder.js";

/** How the program stands, as the banner draws it. */
export type BannerKind = "off" | "starting" | "running" | "ended";

/** The banner: its words, and its one button. */
export interface ProgramBanner {
  readonly kind: BannerKind;
  readonly title: string;
  /**
   * Under the title; none for a settled run, which is one row. How long it has run isn't said
   * here: beside Stop there is no room for it at a phone's width, and the Desktop tab says it.
   */
  readonly body?: string | undefined;
  /** How the words under it read: plain, changed by somebody else (amber), or trouble. */
  readonly tone: "plain" | "changed" | "bad";
  /** Run, Stop, or nothing (the run file can't be used). */
  readonly press?: "run" | "stop" | undefined;
  /**
   * A run that has just started says its links open now, then folds to one row: the words are
   * there for a moment, not for as long as it runs.
   */
  readonly settles?: boolean | undefined;
}

export const PROGRAM_BANNER = {
  off: "Program isn’t running",
  offBody: "Some links here open only while it runs on your Mac.",
  startingBody: "Some links here open once it’s up.",
  runningBody: "Links here open now.",
  againBody: "Links here open once it runs again.",
  /** For three seconds, after a link to localhost was tapped on a phone. */
  hereOnly: "localhost opens only on your Mac.",
} as const;

/** How long the banner says a localhost link opens only on the Mac. */
export const HERE_ONLY_MS = 3000;

/** How long a run that has just started keeps saying its links open now. */
export const SETTLES_MS = 3000;

/** The run bar's words as one plain sentence. */
function saidText(bar: RunBar): string {
  return bar.said.map((piece) => ("code" in piece ? piece.code : piece.text)).join("");
}

/**
 * The banner for a run, from the run bar the Desktop tab draws for it, so the two never disagree.
 * Somebody else changing the files since the person last ran it (SEC-40) is said over Run, as the
 * bar says it.
 */
export function programBanner(bar: RunBar): ProgramBanner {
  if (bar.kind === "starting") {
    return {
      kind: "starting",
      title: bar.title,
      body: PROGRAM_BANNER.startingBody,
      tone: "plain",
      press: "stop",
    };
  }
  if (bar.kind === "running") return runningBanner(bar);
  if (bar.kind === "ended") return endedBanner(bar);
  return offBanner(bar);
}

/** Running, and what went wrong when something did (ADR 0230): nothing answered, the browser refused. */
function runningBanner(bar: RunBar): ProgramBanner {
  const trouble = bar.tone === "good" || bar.said.length === 0 ? undefined : saidText(bar);
  return {
    kind: "running",
    title: bar.title,
    body: trouble ?? PROGRAM_BANNER.runningBody,
    tone: "plain",
    press: "stop",
    settles: trouble === undefined,
  };
}

/** How it ended, and Run again. */
function endedBanner(bar: RunBar): ProgramBanner {
  const bad = bar.tone === "bad";
  const why = bad && bar.said.length > 0 ? saidText(bar) : PROGRAM_BANNER.againBody;
  return {
    kind: "ended",
    title: bar.title,
    body: bar.changed ?? why,
    tone: toneOf(bar.changed !== undefined, bad),
    press: bar.press === undefined ? undefined : "run",
  };
}

/**
 * Nothing runs: why a press did nothing (no Mac heard it, the run file can't be used), who changed
 * the files, or what its links need.
 */
function offBanner(bar: RunBar): ProgramBanner {
  const bad = bar.tone === "bad";
  return {
    kind: "off",
    title: PROGRAM_BANNER.off,
    body: bad ? saidText(bar) : (bar.changed ?? PROGRAM_BANNER.offBody),
    tone: bad ? "bad" : toneOf(bar.changed !== undefined, false),
    press: bar.kind === "ready" ? "run" : undefined,
  };
}

/** Somebody else's change first, then trouble, else plain. */
function toneOf(changed: boolean, bad: boolean): ProgramBanner["tone"] {
  if (changed) return "changed";
  return bad ? "bad" : "plain";
}

/**
 * The banner for somebody who isn't the workspace's owner (ADR 0231): the program runs on the
 * owner's Mac, which only they start, and a run is kept per person, so whether it runs isn't theirs
 * to see.
 */
export function memberBanner(owner: string | undefined): ProgramBanner {
  return {
    kind: "off",
    title: owner === undefined ? "Runs on the owner’s Mac" : `Runs on ${owner}’s Mac`,
    body: `Some links here open only while ${owner ?? "the owner"} runs it.`,
    tone: "plain",
  };
}

/** The workspace's owner by name, for the words a member reads. */
export function ownerNameOf(
  model: Pick<WorkspaceModel, "people">,
  directory: Directory,
): string | undefined {
  const owner = Object.values(model.people).find((person) => person.role === "owner");
  if (owner === undefined) return undefined;
  // The directory's name is the current one; past it, the name they joined by, never an id.
  const named = directory[owner.participantId]?.displayName ?? owner.displayName;
  return named.trim() === "" ? undefined : named;
}

/** An address that names the device it is opened on: on a phone, the phone itself. */
export function isOwnAddress(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    host === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(host) ||
    host === "0.0.0.0"
  );
}

/** What a tapped link does in Universe: open it, say it opens only on the Mac, or ask first. */
export type LinkTap = "open" | "here-only" | "ask";

/**
 * What a link tapped on a page of the space does. Only a web address can need the program: mail
 * and the rest open as they do anywhere. One to the phone's own address never opens here. With a
 * program its owner can run and it isn't running, the sheet asks; anybody else, or a running
 * program, opens it at once.
 */
export function linkTap(input: {
  readonly url: string;
  /** The space has a program its run file says how to run. */
  readonly program: boolean;
  /** The person may run it: the workspace's owner (ADR 0231). */
  readonly owner: boolean;
  /** How it stands, as the banner says. */
  readonly kind: BannerKind;
  /**
   * The device it is tapped on is the Mac the program runs on (Chips for Mac), where localhost is
   * that Mac and needs the program as any address does. Anywhere else, localhost is not the Mac.
   */
  readonly onTheMac?: boolean | undefined;
}): LinkTap {
  if (!/^https?:\/\//i.test(input.url)) return "open";
  if (input.onTheMac !== true && isOwnAddress(input.url)) return "here-only";
  if (!input.program || !input.owner || input.kind === "running") return "open";
  return "ask";
}

/**
 * Which links a page's frame hands to its window rather than opening them itself (the page
 * builder's few lines, on the Mac and the web): every address while the person's program isn't
 * running, so the banner can ask; only localhost while it runs in a browser that isn't on the Mac,
 * so the banner can say where it opens; otherwise none, and a link opens as any link does. Nobody
 * but the owner runs it (ADR 0231), so for anybody else a link opens as it would anywhere.
 */
export type FrameAsks = "every" | "own" | "none";

export function frameAsks(input: {
  readonly program: boolean;
  readonly owner: boolean;
  readonly kind: BannerKind;
  readonly onTheMac: boolean;
}): FrameAsks {
  if (!input.program || !input.owner) return "none";
  if (input.kind !== "running") return "every";
  return input.onTheMac ? "none" : "own";
}

/**
 * Where the sheet is: asking, starting the program, opening the page, or why it can't. `ready` is
 * a browser's: it can't ask the page's address whether it answers, and a browser opens a window
 * only on a press, so once the program runs it offers Open. `failed` is the Mac's own, where Run
 * runs it there and nothing has to hear it.
 */
export type AskKind =
  | "ask"
  | "starting"
  | "opening"
  | "ready"
  | "quiet"
  | "unheard"
  | "failed"
  | "stopped";

/** The sheet's words and buttons, for where it is. */
export interface LinkAsk {
  readonly kind: AskKind;
  readonly title: string;
  readonly body?: string | undefined;
  readonly tone: "plain" | "changed" | "bad";
  /** The gold button's word, and whether it waits; none when there is nothing to press. */
  readonly go?: string | undefined;
  readonly busy?: boolean | undefined;
  /** Open anyway, under it. */
  readonly anyway: boolean;
}

/** How long the sheet waits for the page to answer once the program runs. */
export const ANSWER_WAIT_MS = 20_000;

export const RUN_AND_OPEN = "Run and open";
export const OPEN_ANYWAY = "Open anyway";

/**
 * The sheet's words. `said` is what the Mac said when it couldn't (no Mac heard the press, the
 * run stopped), and `changed` who changed the files since the person last ran it (SEC-40), said
 * before they run it again.
 */
export function linkAsk(
  kind: AskKind,
  extra: { readonly said?: string | undefined; readonly changed?: string | undefined } = {},
): LinkAsk {
  switch (kind) {
    case "starting":
      return {
        kind,
        title: "Starting on your Mac",
        body: "The page opens once it answers.",
        tone: "plain",
        go: RUN_AND_OPEN,
        busy: true,
        anyway: false,
      };
    case "opening":
      return {
        kind,
        title: "Opening the page",
        tone: "plain",
        go: RUN_AND_OPEN,
        busy: true,
        anyway: false,
      };
    case "ready":
      return {
        kind,
        title: "Running on your Mac",
        body: "Open the page once it’s up.",
        tone: "plain",
        go: "Open",
        anyway: false,
      };
    case "quiet":
      return {
        kind,
        title: "The page isn’t answering yet",
        body: `The program is running, but nothing answered after ${ANSWER_WAIT_MS / 1000} seconds.`,
        tone: "plain",
        go: OPEN_ANYWAY,
        anyway: false,
      };
    case "unheard":
      return {
        kind,
        title: "Your Mac didn’t hear it",
        body: extra.said,
        tone: "bad",
        go: RUN_AND_OPEN,
        anyway: true,
      };
    case "failed":
      return {
        kind,
        title: "It didn’t start",
        body: extra.said,
        tone: "bad",
        go: RUN_AND_OPEN,
        anyway: true,
      };
    case "stopped":
      return {
        kind,
        title: "The program stopped",
        body: extra.said,
        tone: "bad",
        go: RUN_AND_OPEN,
        anyway: true,
      };
    default:
      return {
        kind: "ask",
        title: "This link needs the program running",
        body:
          extra.changed ?? "It runs on your Mac. Run it, and Chips opens the page once it answers.",
        tone: extra.changed === undefined ? "plain" : "changed",
        go: RUN_AND_OPEN,
        anyway: true,
      };
  }
}

/**
 * What a new word from the Mac moves a waiting sheet to: on to opening the page once it runs, or
 * why it stopped. Nothing while it is still starting.
 */
export function askAfterNews(
  run: Pick<ProjectRun, "state"> | undefined,
  banner: ProgramBanner,
): { readonly kind: AskKind; readonly said?: string | undefined } | undefined {
  if (run?.state === "running") return { kind: "opening" };
  if (run?.state === "failed" || run?.state === "ended" || run?.state === "stopped") {
    return { kind: "stopped", said: banner.kind === "ended" ? banner.body : "It was stopped." };
  }
  return undefined;
}

/** Why Run and open did nothing: the ask failed, or no Mac heard it; nothing when one did. */
export function askUnheard(came: MacsHeard | { readonly failed: string }): string | undefined {
  if ("failed" in came) return came.failed;
  return came.macs === 0 ? unheardWords("ran", came.opened_app) : undefined;
}

/** A tapped address as the sheet shows it: no scheme, and the Mac's own as localhost. */
export function addressShown(url: string): string {
  return opensShown(url);
}
