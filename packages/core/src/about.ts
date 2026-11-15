/**
 * About Chips (ADR 0295): the page under You that says what Chips is, which version of it this
 * device and its computer run, what the release changed, where to read more, and the licences of
 * Chips and of the code it is built on. In core so the phone, the iPad, the Mac and the web say the
 * same words and open the same links, and so chipschat.ai's About page reads the same releases
 * (`RELEASES`). Self-contained, with no imports: the site's build loads this file as it is.
 */

/** One release of Chips, as About's What's new and the site's list of releases say it. */
export interface Release {
  readonly version: string;
  /** The day it came out, in California, as `YYYY-MM-DD`. */
  readonly date: string;
  /** What it brought, in one sentence. */
  readonly line: string;
  /** What changed, a sentence or two each, as What's new lists it. Absent: the line alone. */
  readonly changes?: readonly string[] | undefined;
  /** What in it needs the computer on this release too: "Pause, No cap and See all". */
  readonly needsComputer?: string | undefined;
  /**
   * Whether it lights the update dot (ADR 0296): true for a release that brings something new, left
   * out for one of fixes, which shows in About only. The release session sets it with the entry.
   */
  readonly dot?: boolean | undefined;
}

/**
 * Every release, newest first. The release session adds the new version's entry when it cuts one,
 * with its changes as the App Store's What's New says them (`docs/releasing.md`); `about.test.ts`
 * holds the newest to the repository's version.
 */
export const RELEASES: readonly Release[] = [
  {
    version: "1.3.0",
    date: "2026-11-14",
    line: "Universe has Pages, Media and Files, About Chips says what's new and what needs an update, and Chips for Mac and your computer can update themselves.",
    changes: [
      "Universe has three tabs: Pages, Media and Files. Pages has your space's start page and its documents, Media its pictures by day, and Files every file in the project.",
      "About Chips, under You, shows your version, what's new, and whether your computer needs an update. A gold dot tells you when an update is waiting.",
      "A room's details show what was Sent in chat, and Changes says who last changed the project.",
      "Chips for Mac updates itself, and a computer set up with the install line can update itself at night when its owner turns that on.",
      "Your computer keeps its bridges up to date from Chips's signed list, a few days after each release, and puts one back if it doesn't work.",
      "A phone restored from a backup names the workspace it can't open any more, and shows how to get back in.",
    ],
    needsComputer: "Updates under About and updating at night",
    dot: true,
  },
  {
    version: "1.2.4",
    date: "2026-11-11",
    line: "Pause and Stop moved into an agent's bubble, work nobody picked up is passed on, and Spend per job got No cap.",
    changes: [
      "An agent's working bubble has Pause, Resume and Stop in its menu. A paused agent keeps its place, and a Stop leaves a line saying who stopped it.",
      "When one agent hands work to another that doesn't pick it up, the room says so under the message, and Chips passes it on to the room's lead. A room with two or more agents always has a lead.",
      "Spend per job has No cap, and Other takes up to $1,000. Save stays on the page, and earlier jobs show ten at a time with See all.",
      "A page of your space's project says when its links need the space's program, with Run and Stop on its banner. A link that needs Tailscale or your home network says why it won't open.",
      "The QR code for your phone opens in the iPhone's Camera, and when pairing fails, Chips says whether the phone needs that computer's Wi-Fi or the relay.",
      "Somebody with nothing set up yet is sent to chipschat.ai/setup on their computer, which walks them through it.",
    ],
    needsComputer: "Pause, No cap and See all",
    dot: true,
  },
  {
    version: "1.2.3",
    date: "2026-11-10",
    line: "A page of your space's project says whether its program is running, and asks before a link that needs it.",
  },
  {
    version: "1.2.2",
    date: "2026-11-09",
    line: "The QR code for your phone opens in the iPhone's Camera, and setting up has fewer rough edges.",
  },
  {
    version: "1.2.1",
    date: "2026-11-09",
    line: "Chips finds the agents already on your Mac, and says who makes each one.",
  },
  {
    version: "1.2.0",
    date: "2026-11-09",
    line: "You can answer an agent from one screen and say how long a yes lasts, and the Mac and the web have the iPad's columns.",
    dot: true,
  },
  {
    version: "1.1.0",
    date: "2026-11-04",
    line: "The iPad was redesigned, and the Mac and the web were laid out the way the iPad is.",
    dot: true,
  },
  {
    version: "1.0.3",
    date: "2026-11-04",
    line: "Fixes from a review of Chips by somebody installing it with no help.",
  },
  {
    version: "1.0.2",
    date: "2026-11-03",
    line: "An HTML file of a space's project has Open page at its top, above its source.",
  },
  {
    version: "1.0.1",
    date: "2026-11-02",
    line: "A phone locked while it was connecting connects again, and a link opens Chips when it wasn't running.",
  },
  {
    version: "1.0.0",
    date: "2026-11-01",
    line: "Chips came out, with the Mac app, the iPhone app, the browser, and the install line for a Mac or Linux.",
  },
];

/** The release a version is, if Chips has one by that number. */
export function releaseOf(version: string | undefined): Release | undefined {
  return version === undefined ? undefined : RELEASES.find((each) => each.version === version);
}

/** The row's and the page's names. */
export const ABOUT_ROW = "About Chips";
export const ABOUT_TITLE = "About";
export const WHATS_NEW_TITLE = "What's new";
export const LICENCE_TITLE = "Licence";
export const NOTICES_TITLE = "Acknowledgements";

/** What the row under What's new says: its title. */
export function whatsNewRow(version: string): string {
  return `What's new in ${version}`;
}

/**
 * The sentence under the name: the 1.0 notes' first line, with the device in it, as "this
 * iPhone" or "this Mac".
 */
export function aboutBlurb(device: string): string {
  return `Chips is a chat app for you and the AI agents you already run. It runs on your own computer, and ${device} reaches it.`;
}

/** The line at the foot. */
export const MADE_BY = "Made by Arjun Gupta.";
export const NAMED_FOR =
  "Chips is named after the snack, and after the silicon chips inside every computer.";

/** The capsule under the name: the version, the build number where there is one, and the commit. */
export function buildCapsule(version: string, build: string | undefined, commit: string): string {
  return `${version}${build === undefined || build === "" ? "" : ` (${build})`} · ${commit}`;
}

/** What the capsule says for a moment after it is tapped. */
export const BUILD_COPIED = "Copied for a bug report";

/**
 * What tapping the capsule copies: the build as a bug report wants it, the system, and the
 * computer and its version where they are known. "Chips 1.2.4 (202611111859) · b45d368 · iOS 26.1
 * · Mac mini on 1.2.3".
 */
export function bugReportLine(parts: {
  readonly version: string;
  readonly build: string | undefined;
  readonly commit: string;
  readonly system: string;
  readonly computer?: ComputerFacts | undefined;
}): string {
  const computer =
    parts.computer === undefined ? "" : ` · ${parts.computer.machine} on ${parts.computer.version}`;
  return `Chips ${buildCapsule(parts.version, parts.build, parts.commit)} · ${parts.system}${computer}`;
}

/** The computer as `GET /v1/server` names it. */
export interface ComputerFacts {
  readonly machine: string;
  readonly version: string;
}

/** Your computer's heading, its row, and the foot under them. */
export const COMPUTER_HEADING = "Your computer";
export const UPDATE_ROW = "Update your computer";
export const UPDATE_SUB = "The steps, in the docs";
export const COMPUTER_UNREACHED = "Not reached just now";

/** "Chips on Mac mini": the row that says which version the computer runs. */
export function computerRow(machine: string): string {
  return `Chips on ${machine}`;
}

/**
 * Whether the computer runs an older Chips than this device, and if so the foot that says what
 * waits for it: what the release says needs the computer too, else that some of it does. `device`
 * starts the sentence: "This iPhone".
 */
export function computerBehind(
  app: string,
  computer: ComputerFacts,
  device: string,
): string | undefined {
  if (!olderThan(computer.version, app)) return undefined;
  const needs = releaseOf(app)?.needsComputer;
  const what = needs === undefined ? `Some of what's new needs ${app}` : `${needs} need ${app}`;
  return `${device} has ${app}. ${what} on ${computer.machine} too.`;
}

/**
 * Whether version `a` comes before `b`, by their numbers ("1.2.3" before "1.2.4", "1.9.0" before
 * "1.10.0"). Anything after a hyphen is left out; a version that isn't numbers is never older.
 */
export function olderThan(a: string, b: string): boolean {
  const parts = (version: string) => version.split("-")[0]?.split(".").map(Number) ?? [];
  const left = parts(a);
  const right = parts(b);
  if ([...left, ...right].some((each) => !Number.isInteger(each))) return false;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l !== r) return l < r;
  }
  return false;
}

const MONTHS = [
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

/** A release's day as people say it: "11 November 2026". */
export function releaseDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const name = month === undefined ? undefined : MONTHS[month - 1];
  if (year === undefined || name === undefined || day === undefined) return date;
  return `${day} ${name} ${year}`;
}

/** Where About's rows go. */
export const ABOUT_LINKS = {
  website: "https://chipschat.ai/",
  docs: "https://chipschat.ai/start/",
  support: "https://chipschat.ai/support/",
  privacy: "https://chipschat.ai/privacy/",
  updating: "https://chipschat.ai/start/install/#updating",
  releases: "https://github.com/arjungupta99/chips/releases",
  licence: "https://github.com/arjungupta99/chips/blob/main/LICENSE",
  licensing: "https://github.com/arjungupta99/chips/blob/main/LICENSING.md",
  appStore: "https://apps.apple.com/app/id6824148802",
  review: "https://apps.apple.com/app/id6824148802?action=write-review",
} as const;

/** The links' rows, with what a row says beside its name. */
export const ABOUT_LINK_ROWS = {
  website: { label: "Website", value: "chipschat.ai" },
  docs: { label: "Docs" },
  support: { label: "Support" },
  rate: { label: "Rate Chips on the App Store" },
  share: { label: "Share Chips" },
  privacy: { label: "Privacy" },
  licence: { label: LICENCE_TITLE, sub: "Free, and its source is available" },
  notices: { label: NOTICES_TITLE, sub: "The open-source code Chips is built on" },
  releases: { label: "Every release on GitHub" },
  readLicence: { label: "Read the licence" },
  licensing: { label: "Licensing in full", sub: "Which licence covers which part" },
} as const;

/** What Share Chips hands the share sheet. */
export const SHARE_CHIPS = `Chips is a chat app for you and the AI agents you already run: ${ABOUT_LINKS.appStore}`;

/** The groups' headings. */
export const CHIPS_HEADING = "Chips";
export const LEGAL_HEADING = "Legal";

/** Licence, in plain words (ADR 0128). */
export const LICENCE_WORDS: readonly string[] = [
  "Chips is free, and all of its source code is on GitHub for anyone to read.",
  "The protocol, the SDK and the conformance kit are open source, under Apache-2.0.",
  "The server and the apps, this one included, use FSL-1.1. Each release becomes Apache-2.0 two years after it comes out.",
  "Neither licence covers the name Chips or the mark.",
];

/** Acknowledgements' first line, with the app in it: "Chips for iPhone and iPad". */
export function noticesLead(app: string): string {
  return `${app} is built on these open-source projects. Tap one to read its licence.`;
}

/** One package an app ships, as `pnpm notices` writes it (`tools/notices`). */
export interface PackageNotice {
  readonly name: string;
  readonly version: string;
  /** The licence the package's manifest names, as "MIT"; absent where it names none. */
  readonly license?: string | undefined;
  /** Its licence and notice files as its authors ship them, or its README's licence section. */
  readonly texts: readonly { readonly file: string; readonly text: string }[];
}

/** What a package's row says beside its name: its licence, or that it names none. */
export function noticeLicence(notice: PackageNotice): string {
  return notice.license ?? "Not stated";
}

/** A package that ships no licence text, folded open. */
export const NOTICE_NO_TEXT = "This package ships no licence file.";
