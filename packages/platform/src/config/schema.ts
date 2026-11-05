/**
 * One typed configuration (technical-plan 6.1). Defaults live here, beside the schema, so
 * the numbers the plan fixes — a twenty second heartbeat, a sixty second idle close, a
 * thousand unacknowledged frames, a ten minute signed URL — have exactly one home.
 */

import { z } from "zod";

export const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof logLevels)[number];

const port = z.coerce.number().int().min(1).max(65_535);

/** The hosts that are this machine, as a URL names them. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * The relay Chips runs (ADR 0245). A server with no `CHIPS_RELAY_URL` has this one behind its
 * owner's relay switch, off until an owner turns it on; `chips up` offers it as an answer.
 */
export const CHIPS_RELAY = "wss://relay.chipschat.ai";

/** Expo's push service, which takes the Chips app's pushes only with the app's access token. */
export const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

/**
 * Where a push service says what became of the pushes it took, by their tickets' ids: beside
 * Expo's `/send`, its `/getReceipts`; beside a push relay's `/v1/push`, its `/v1/push/receipts`.
 */
export function receiptsUrlOf(pushUrl: string): string {
  if (pushUrl.endsWith("/send")) return `${pushUrl.slice(0, -"/send".length)}/getReceipts`;
  return `${pushUrl.replace(/\/+$/, "")}/receipts`;
}

/**
 * The push relay Chips runs (ADR 0246): Chips's relay, sending pushes to the Chips app with the
 * app's access token, for a server that has none.
 */
export const CHIPS_PUSH_RELAY = "https://relay.chipschat.ai/v1/push";

/**
 * Where a server posts its pushes (ADR 0246): `CHIPS_PUSH_URL` when it is set; Expo, when the
 * server has the access token; and the Chips push relay when it has neither.
 */
export function pushUrlOf(push: {
  readonly url?: string | undefined;
  readonly accessToken?: string | undefined;
}): string {
  return push.url ?? (push.accessToken === undefined ? CHIPS_PUSH_RELAY : EXPO_PUSH);
}
const positiveInt = z.coerce.number().int().positive();

/**
 * A boolean that may arrive from the environment as text. `z.coerce.boolean()` is `Boolean(value)`,
 * and `Boolean("false")` is `true`, so it would read `CHIPS_DEV_MODE=false` as dev mode on. This
 * takes a real boolean from a file, or one of the spellings a shell uses — `true`, `1`, `yes`,
 * `on` and `false`, `0`, `no`, `off`, in any case — and refuses anything else.
 */
const flag = z.union([z.boolean(), z.stringbool()]).default(false);

export const configSchema = z.object({
  /** Solo mode is SQLite and local files; team mode arrives in Phase 6. */
  mode: z.enum(["solo", "team"]).default("solo"),

  /**
   * Development conveniences: a demo workspace bootstrapped on start, and its credentials
   * written beside the database. Off by default, and never on in anything but a laptop.
   */
  devMode: flag,

  server: z
    .object({
      host: z.string().min(1).default("127.0.0.1"),
      port: port.default(4431),
      /** How clients and harnesses reach this server from outside. */
      publicUrl: z.url().optional(),
      /**
       * The built web app, served at `/`. Absent, the server looks for the repository's own
       * build beside itself; a release sets this to wherever its pages were unpacked.
       */
      webDir: z.string().min(1).optional(),
      /**
       * The gallery of connectors the apps show when a person brings an agent (ADR 0171): a file,
       * or an `https:` URL, holding the docs' `connectors.json`. Absent, the apps show only the
       * generic ways in. Chips names no harness itself; it passes on what the docs say.
       */
      connectors: z.string().min(1).optional(),
    })
    .prefault({}),

  data: z
    .object({
      /** Where the database, attachments and logs live. */
      dir: z.string().min(1).default("./.chips"),
      /** A `sqlite:` URL in solo mode, a `postgres:` URL in team mode (Phase 6). */
      databaseUrl: z.string().min(1).default("sqlite:./.chips/chips.db"),
    })
    .prefault({}),

  log: z
    .object({
      level: z.enum(logLevels).default("info"),
      /** Human-readable logs for a terminal. Machines get JSON. */
      pretty: flag,
    })
    .prefault({}),

  realtime: z
    .object({
      /** Decision 5: heartbeats every twenty seconds. */
      heartbeatSeconds: positiveInt.default(20),
      /** Decision 5: the server closes a silent socket at sixty. */
      idleTimeoutSeconds: positiveInt.default(60),
      /** A consumer this far behind is dropped and resumes with `since`. */
      maxUnackedFrames: positiveInt.default(1000),
      /**
       * How often Chips looks for approvals past their expiry and questions past their timeout,
       * and resolves them by the fallback (M1.4). Seconds.
       */
      sweepSeconds: positiveInt.default(15),
    })
    .prefault({}),

  attachments: z
    .object({
      /**
       * Signs the URLs a harness gets for an attachment (decision 10). Absent, the server makes
       * one at start, so a URL outlives the process it was minted in only when this is set.
       */
      secret: z.string().min(16).optional(),
      /** How long an upload slot waits for its bytes. */
      slotTtlSeconds: positiveInt.default(900),
      /** The longer side of a thumbnail, in pixels. */
      thumbnailEdge: positiveInt.default(512),
      /** The longer side of the copy of a photo a viewer shows, in pixels (ADR 0058). */
      viewEdge: positiveInt.default(2048),
    })
    .prefault({}),

  media: z
    .object({
      /**
       * The `ffmpeg` that makes a video's poster and a copy that plays everywhere (ADR 0053).
       * Absent, the server looks on its `PATH`, then in `/opt/homebrew/bin` and `/usr/local/bin`;
       * found nowhere, a video is kept as it came.
       */
      ffmpegPath: z.string().min(1).optional(),
      /** The `ffprobe` that measures a video, looked for the same way. */
      ffprobePath: z.string().min(1).optional(),
      /**
       * The `whisper-cli` that writes down what was said in a voice note (ADR 0054), looked for
       * the same way. Found nowhere, or with no model, a voice note is kept with no transcript.
       */
      whisperPath: z.string().min(1).optional(),
      /**
       * The whisper model, a `ggml-*.bin` file. Absent, the best known one in the data
       * directory's `models` folder: `ggml-large-v3-turbo-q5_0.bin` first.
       */
      whisperModel: z.string().min(1).optional(),
    })
    .prefault({}),

  auth: z
    .object({
      /**
       * The origins a passkey may be registered from and used at, besides the server's own
       * public address and loopback (ADR 0034): the desktop app's, a dev server's. A comma
       * separates them in the environment.
       */
      passkeyOrigins: z
        .preprocess(
          (value) =>
            typeof value === "string"
              ? value
                  .split(",")
                  .map((origin) => origin.trim())
                  .filter((origin) => origin !== "")
              : value,
          z.array(z.url()),
        )
        .default([]),
    })
    .prefault({}),

  relay: z
    .object({
      /**
       * The relay this server dials out to, so a phone away from the network reaches it
       * (M4.1, ADR 0038): `wss://relay.example`, or `ws://` to a relay on this machine. Absent,
       * the server has Chips's own (`CHIPS_RELAY`) behind its owner's switch, off until an owner
       * turns it on (ADR 0245), and is reachable only on the network it is on until then. A
       * relay elsewhere is reached over `wss://` only (SEC-27): the server never authenticates
       * the relay, and over `ws://` whoever is on the way could be it.
       */
      url: z
        .url({ protocol: /^wss?$/ })
        .refine((url) => !url.startsWith("ws:") || LOOPBACK_HOSTS.has(new URL(url).hostname), {
          message:
            "a relay on another machine is reached over wss://; ws:// is for one on this machine",
        })
        .optional(),
      /** Where `chips-relay` itself listens, when this configuration is the relay's. */
      host: z.string().min(1).default("127.0.0.1"),
      port: port.default(4440),
      /** How many phones the relay holds open for one server at once. */
      maxSessionsPerServer: positiveInt.default(32),
      /**
       * The servers the relay lists, by their relay key (a server's `GET /v1/health` names it as
       * `relay.key`); any other is refused. A comma separates them in the environment. Absent,
       * the relay lists any server that proves its key.
       */
      allowKeys: z
        .preprocess(
          (value) =>
            typeof value === "string"
              ? value
                  .split(",")
                  .map((key) => key.trim())
                  .filter((key) => key !== "")
              : value,
          z
            .array(
              z
                .string()
                .regex(/^[A-Za-z0-9_-]{43}$/, "a server's relay key: 43 characters of base64url"),
            )
            .min(1, "name at least one server's key, or leave it unset for any server"),
        )
        .optional(),
      /**
       * Where `chips-relay` appends each day's counts, a line of JSON each: how many servers and
       * sessions, never which (ADR 0208). Absent, the day is only logged.
       */
      countsFile: z.string().min(1).optional(),
    })
    .prefault({}),

  push: z
    .object({
      /**
       * Where a push to a phone is posted (M4.3, ADR 0045). Absent, Expo's service with the
       * access token, and Chips's push relay without it (`pushUrlOf`, ADR 0246). Expo holds the
       * APNs and FCM credentials so this server does not, and what it is handed is a token, two
       * fixed words and a pair of ids — never the ask itself. A test points this at a stub; a
       * deployment that wants APNs directly writes another `PushSender`. On a relay, where the
       * push door sends on to: Expo's, absent.
       */
      url: z.url().optional(),
      /**
       * The Chips app's Expo access token: its project has "enhanced security" on, so Expo takes
       * its pushes only with this (ADR 0244). A server with it posts to Expo itself; a relay with
       * it opens its push door, and sends pushes for servers that have none (ADR 0246).
       */
      accessToken: z.string().min(1).optional(),
    })
    .prefault({}),

  limits: z
    .object({
      maxMessageBytes: positiveInt.default(65_536),
      maxAttachmentBytes: positiveInt.default(104_857_600),
      /**
       * The most a room's project may hold on disk, its history included (ADR 0220). A push that
       * would take it past this is refused, as one with a file over the workspace's cap for files is.
       */
      maxProjectBytes: positiveInt.default(1_073_741_824),
      /**
       * The most any request body but an upload's may hold, and the most one socket frame may
       * (SEC-11): a harness's copy of an agent's context files is the largest honest one, at
       * eight files of 64 KB. Read before the credential is, so one request from a stranger
       * cannot fill memory; a request with no credential at all gets a smaller, fixed budget.
       */
      maxBodyBytes: positiveInt.default(4_194_304),
      maxPendingApprovalsPerHarness: positiveInt.default(50),
      /** Decision 10: signed URLs expire in ten minutes. */
      signedUrlTtlSeconds: positiveInt.default(600),
    })
    .prefault({}),
});

export type ChipsConfig = z.infer<typeof configSchema>;

/** The configuration you get with no file and no environment. */
export function defaultConfig(): ChipsConfig {
  return configSchema.parse({});
}
