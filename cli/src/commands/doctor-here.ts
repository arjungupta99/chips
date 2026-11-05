/**
 * `chips doctor`, about this machine (ADR 0121): which chips this is and what runs it, whether a
 * server answers here, whether it has its page, who else can reach it, through its relay or
 * directly, and whether it can push to a phone (ADR 0244). Beside the checks in `doctor.ts`, which are about this machine's device and its
 * harnesses.
 */

import { basename } from "node:path";
import type { MediaFound } from "@chipschat/server";
import type { Networks } from "../reach.js";
import { type Release, versionLine } from "../release.js";
import type { Finding } from "./finding.js";

const DOCS = "https://chipschat.ai/operate/cli/#chips-doctor";
const MEDIA_DOCS = "https://chipschat.ai/operate/mac-mini/";
const PUSH_DOCS = "https://chipschat.ai/operate/mobile/#what-push-needs";

export interface Here {
  /** The port this machine's server answers on: its service's, else the configuration's. */
  readonly port: number;
  /** Where this machine reaches it: loopback, or the one address it is bound to. */
  readonly local: string;
  readonly release: Release | undefined;
  /** `process.version`, injected. */
  readonly node: string;
  readonly networks: () => Promise<Networks>;
  /**
   * Whether a server runs here: this machine has a Chips service's file, or its device belongs
   * to a server here, or there is no device.
   */
  readonly serverExpectedHere: boolean;
  /** Whether `chips up` has run here: there is a service's file, or the `server.json` it writes. */
  readonly upHasRun: boolean;
  /** What a server here finds for video and voice notes. Absent, not checked. */
  readonly media?: (() => MediaFound) | undefined;
}

/**
 * Video and voice notes, where a server runs here. Both are optional, so a missing tool is a
 * warning that says what a person gets without it: a video kept as it came, location and all, and
 * a voice note with no words. Until now only the server's log said so.
 */
export function mediaChecks(media: MediaFound): Finding[] {
  const video: Finding =
    media.video === undefined
      ? {
          check: "video",
          health: "warn",
          detail:
            "ffmpeg isn't here: a video is kept as it came, with no poster, and with its metadata, location included.",
          fix: "Install ffmpeg (`brew install ffmpeg`, or your system's package), or name it and ffprobe with CHIPS_FFMPEG and CHIPS_FFPROBE.",
          docs: MEDIA_DOCS,
        }
      : { check: "video", health: "ok", detail: `ffmpeg at ${media.video.ffmpeg}.` };
  if (media.video !== undefined && media.voice !== undefined) {
    const heard = `whisper at ${media.voice.cli}, with ${basename(media.voice.model)}.`;
    return [video, { check: "voice notes", health: "ok", detail: heard }];
  }
  const voice: Finding = {
    check: "voice notes",
    health: "warn",
    detail:
      media.voice === undefined
        ? "whisper or a model for it isn't here: a voice note is kept with its length and no words."
        : "whisper needs ffmpeg too: a voice note is kept with its length and no words.",
    fix:
      media.voice === undefined
        ? `Install whisper.cpp (\`brew install whisper-cpp\`) and put a model in ${media.models}, or name them with CHIPS_WHISPER and CHIPS_WHISPER_MODEL.`
        : "Install ffmpeg, as for video.",
    docs: MEDIA_DOCS,
  };
  return [video, voice];
}

/** Everything about this machine: its chips, the server here, and what that server can handle. */
export async function hereChecks(here: Here, call: typeof fetch): Promise<Finding[]> {
  const media =
    here.serverExpectedHere && here.media !== undefined ? mediaChecks(here.media()) : [];
  return [runtimeCheck(here), ...(await serverHereChecks(here, call)), ...media];
}

/** Which chips this is, on which Node; Node older than 22 is a problem from a checkout. */
export function runtimeCheck(here: Pick<Here, "release" | "node">): Finding {
  const major = Number.parseInt(here.node.replace(/^v/, ""), 10);
  const runtime = here.release === undefined ? `Node ${here.node}` : `its own Node ${here.node}`;
  if (here.release === undefined && major < 22) {
    return {
      check: "chips",
      health: "bad",
      detail: `${versionLine(undefined)} on Node ${here.node}.`,
      fix: "Chips needs Node 22 or newer from a checkout. Install it, or install Chips: curl -fsSL https://chipschat.ai/install | sh",
      docs: DOCS,
    };
  }
  return { check: "chips", health: "ok", detail: `${versionLine(here.release)}, on ${runtime}.` };
}

/** What a server's `GET /v1/health` says of its relay: where, and whether it is dialled in. */
interface RelayHealth {
  readonly url: string | undefined;
  readonly connected: boolean;
}

/** The server here, its page, and who can reach it. */
export async function serverHereChecks(here: Here, call: typeof fetch): Promise<Finding[]> {
  const { local } = here;
  const health = await healthOf(local, call);
  if (health === undefined) {
    if (!here.serverExpectedHere) return [];
    return [
      {
        check: "server here",
        health: "bad",
        detail: `Nothing answers at ${local}.`,
        fix: "Run `chips up` to start Chips on this machine.",
        docs: DOCS,
      },
    ];
  }
  const push = pushCheck(health.pushes);
  return [
    runsThisRelease(local, here.release, health.version),
    await pageCheck(local, call),
    await reachCheck(here, health.relay, call),
    ...(push === undefined ? [] : [push]),
  ];
}

/**
 * The server here, answering, and on this release: an upgrade by the install line puts a new
 * release in place and leaves the server that was running as it was until it starts again (the
 * stranger review, 4 November 2026).
 */
function runsThisRelease(
  local: string,
  release: Release | undefined,
  running: string | undefined,
): Finding {
  if (release === undefined || running === undefined || running === release.version) {
    return { check: "server here", health: "ok", detail: `Answers at ${local}.` };
  }
  return {
    check: "server here",
    health: "warn",
    detail: `Answers at ${local}, on ${running}, while this chips is ${release.version}.`,
    fix: "Run `chips up` to start the server again on this release.",
    docs: DOCS,
  };
}

/** Whether the server can push to a phone, as health says it here; nothing from an older one. */
function pushCheck(pushes: string | undefined): Finding | undefined {
  if (pushes === undefined) return undefined;
  if (pushes === "ready") return { check: "push", health: "ok", detail: "Can push to phones." };
  if (pushes === "failing") {
    return {
      check: "push",
      health: "warn",
      detail: "Its last pushes to phones didn't get through: the push service didn't take them.",
      fix: "Each new push tries again, and phones see what needs them when Chips is open. Its log says why, as `push.not_sent`.",
      docs: PUSH_DOCS,
    };
  }
  const refused = pushes === "refused";
  return {
    check: "push",
    health: "warn",
    detail: refused
      ? "Sends no pushes to phones: the push service refused it."
      : "Sends no pushes to phones: CHIPS_PUSH_URL points at Expo, which takes the Chips app's pushes only with an access token.",
    // Either way the Chips push relay sends them, once nothing points the server elsewhere (ADR 0246).
    // `chips up` carries the service's settings forward, so unsetting one in a shell keeps it: a
    // setting given empty is what takes it out.
    fix: `Phones still see what needs them when Chips is open, and computers raise their banners. To push through the Chips push relay, run ${
      refused
        ? "`CHIPS_PUSH_ACCESS_TOKEN= chips up` to take the token out, or `chips up` with one Expo takes"
        : "`CHIPS_PUSH_URL= chips up` to take CHIPS_PUSH_URL out"
    }.`,
    docs: PUSH_DOCS,
  };
}

/** Chips's health at an address, with what it says of its relay, or nothing when it is not Chips. */
async function healthOf(
  url: string,
  call: typeof fetch,
): Promise<
  | {
      readonly relay: RelayHealth;
      readonly pushes: string | undefined;
      readonly version: string | undefined;
    }
  | undefined
> {
  try {
    const response = await call(`${url}/v1/health`, { signal: AbortSignal.timeout(2000) });
    const body = (await response.json()) as {
      name?: unknown;
      version?: unknown;
      relay?: { url?: unknown; status?: unknown } | null;
      pushes?: unknown;
    };
    if (!response.ok || body.name !== "chipsd") return undefined;
    const relayUrl = body.relay?.url;
    return {
      relay: {
        url: typeof relayUrl === "string" && relayUrl !== "" ? relayUrl : undefined,
        connected: body.relay?.status === "connected",
      },
      pushes: typeof body.pushes === "string" ? body.pushes : undefined,
      version: typeof body.version === "string" ? body.version : undefined,
    };
  } catch {
    return undefined;
  }
}

async function isChips(url: string, call: typeof fetch): Promise<boolean> {
  return (await healthOf(url, call)) !== undefined;
}

/** A relay as a person reads it: `relay.chipschat.ai` rather than `wss://relay.chipschat.ai`. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function pageCheck(local: string, call: typeof fetch): Promise<Finding> {
  try {
    const page = await (await call(`${local}/`, { signal: AbortSignal.timeout(2000) })).text();
    if (!page.includes("The web app is not built")) {
      return { check: "web app", health: "ok", detail: "Served." };
    }
  } catch {
    // Said below.
  }
  return {
    check: "web app",
    health: "bad",
    detail: "The server answers, but has no page to show.",
    fix: "From a checkout, run `pnpm web:build`. An installed chips carries its own: reinstall it.",
    docs: DOCS,
  };
}

/**
 * Whether a phone could reach the server: through the relay from anywhere, when the server is
 * dialled in to one (ADR 0121's addendum), and directly on the tailnet or the Wi-Fi. A relay the
 * server is set to use but is not connected to is worth a warning however else it is reached:
 * a phone away from home has no other way in.
 */
async function reachCheck(here: Here, relay: RelayHealth, call: typeof fetch): Promise<Finding> {
  const networks = await here.networks();
  const direct = await directly(here.port, networks, call);
  if (relay.url !== undefined) return relayReach(relay.url, relay.connected, direct);
  if (direct !== undefined) return { check: "reach", health: "ok", detail: `${direct}.` };
  const { tailnet, lan } = networks;
  const reach = tailnet !== undefined ? "tailnet" : lan !== undefined ? "lan" : undefined;
  const relayFix =
    "Turn on the relay in You → Relay, or run `chips up --reach relay` (https://chipschat.ai/operate/relay/)";
  return {
    check: "reach",
    health: "warn",
    detail: "Only this machine can reach Chips, so no phone can.",
    fix:
      reach === undefined ? `${relayFix}.` : `${relayFix}, or run \`chips up --reach ${reach}\`.`,
    docs: DOCS,
  };
}

/** How the server is reached directly, on the tailnet and the Wi-Fi, or nothing when neither. */
async function directly(
  port: number,
  { tailnet, lan }: Networks,
  call: typeof fetch,
): Promise<string | undefined> {
  const on: string[] = [];
  if (tailnet !== undefined && (await isChips(`http://${tailnet}:${port}`, call))) {
    on.push(`Tailscale (${tailnet})`);
  }
  if (lan !== undefined && (await isChips(`http://${lan}:${port}`, call))) {
    on.push(`this Wi-Fi (${lan})`);
  }
  return on.length > 0 ? `Reachable over ${on.join(" and ")}` : undefined;
}

/** The reach of a server set to use a relay: from anywhere when it is connected, else a warning. */
function relayReach(url: string, connected: boolean, direct: string | undefined): Finding {
  const relay = `the relay at ${hostOf(url)}`;
  if (connected) {
    return {
      check: "reach",
      health: "ok",
      detail:
        direct === undefined
          ? `Reachable from anywhere through ${relay}. Directly, only from this machine.`
          : `${direct}, and from anywhere through ${relay}.`,
    };
  }
  return {
    check: "reach",
    health: "warn",
    detail: `${direct ?? "Only this machine can reach Chips"}, and not through ${relay}: the server is not connected to it.`,
    fix: "The server's log says why, and so does You → Relay. A relay turns a server away as `busy` when it already lists as many servers from that internet address as it takes. A relay that serves a list turns away a server not on it, and the log names the key to add.",
    docs: DOCS,
  };
}
