/**
 * Join requests (ADR 0122): something asks to join Chips, and a person allows it. A harness asks
 * for a key and the room it starts in; a device asks to be paired. No token is copied by hand.
 *
 * Two ways in, one request:
 *
 * - **The requester starts.** It sends `POST /v1/join` with no credential and is answered with a
 *   secret, which only it holds, and a short code, which it shows. An owner or admin compares the
 *   code, says which of what it asks for it may have, and allows it or not. The requester polls
 *   `POST /v1/join/:id/redeem` with the secret and is handed its credential once.
 * - **A person starts.** An owner or admin makes a link, choosing first what the harness may do.
 *   The link is `<address>/j/<secret>`, good once, for fifteen minutes; whoever holds it redeems
 *   it at `POST /v1/join/redeem`, already allowed.
 *
 * The code is for comparing, not a secret: the 128-bit secret is the credential. Every rule a
 * client draws from — how long each lasts, how many may wait — is named here once, so the server,
 * the apps and the SDK cannot disagree.
 */

import { z } from "zod";
import { HARNESS_CAPABILITIES } from "./capabilities.js";
import { pairingCode } from "./pairing.js";
import { id, isoTimestamp, workspaceRole } from "./primitives.js";

/** How long a request a requester started waits for a person: ten minutes. */
export const JOIN_CODE_SECONDS = 600;
/** How long a link a person made waits for its harness: fifteen minutes. */
export const JOIN_LINK_SECONDS = 900;
/** Requests waiting for a person at once, on one server. The sixth is refused. */
export const JOIN_WAITING_MAX = 5;
/** Requests one address may start in a minute. */
export const JOIN_ASKS_PER_MINUTE = 10;
/**
 * How often a requester asks whether it was allowed, in seconds: twenty a minute, under the thirty
 * a relay lets through a tunnel without a credential.
 */
export const JOIN_POLL_SECONDS = 3;

export const joinKind = z
  .enum(["harness", "device", "invite", "pairing"])
  .describe(
    "A harness asking for a key; a device asking to be paired; a person joining by an invite, or a device pairing by a code, that waits for whoever handed it out (ADR 0232).",
  );
export type JoinKind = z.infer<typeof joinKind>;

/** The kinds a link makes, which wait for the one person who handed it out (ADR 0232). */
export const LINK_KINDS: readonly JoinKind[] = ["invite", "pairing"];

/** Whether a request is a link's, asked of one person: an invite's, or a pairing code's. */
export function isLinkKind(kind: JoinKind): boolean {
  return LINK_KINDS.includes(kind);
}

/**
 * The code a link's request shows (ADR 0232): six digits made from the joining device's key, the
 * same on the device and on the Allow sheet, for a person to compare.
 */
export const keyCode = z.string().regex(/^[0-9]{6}$/, "six digits");

/** Six digits as people read them: two groups of three. */
export function keyCodeShown(code: string): string {
  return keyCode.safeParse(code).success ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/**
 * The check a device that asks on the Wi-Fi shows (S-1, ADR 0278). A code the server made and
 * handed over could be handed on unchanged by whoever stands between the phone and the computer,
 * with their own key in the request in place of the phone's: the person typed the code the phone
 * showed, and let them in. So both ends work the code out, from both keys and a nonce from each,
 * the device's committed to before it sees the server's: the SHA-256 of `joinCheckText`, its first
 * thirty bits as six characters of the pairing alphabet. Somebody between them picks their key and
 * nonce before they can know one of the two nonces, so their code matches one time in a billion.
 */
export const joinNonce = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "32 bytes, base64url");

/** The pairing alphabet: no 0, 1, I or O. */
const CHECK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** What a device's commitment is the SHA-256 of: its nonce, labelled. */
export function joinCommitText(nonce: string): string {
  return `chips join commit v1\n${nonce}`;
}

/** What the check is the SHA-256 of: both keys and both nonces, as the wire carries them. */
export function joinCheckText(input: {
  readonly publicKey: string;
  readonly serverKey: string;
  readonly deviceNonce: string;
  readonly serverNonce: string;
}): string {
  return [
    "chips join check v1",
    input.publicKey,
    input.serverKey,
    input.deviceNonce,
    input.serverNonce,
  ].join("\n");
}

/** A check's digest as the code people compare and type, `ABC-234`: its first thirty bits. */
export function joinCheckCode(digest: Uint8Array): string {
  const bits =
    (((digest[0] ?? 0) << 24) |
      ((digest[1] ?? 0) << 16) |
      ((digest[2] ?? 0) << 8) |
      (digest[3] ?? 0)) >>>
    2;
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    if (i === 3) out += "-";
    out += CHECK_ALPHABET.charAt((bits >>> (25 - 5 * i)) & 31);
  }
  return out;
}

/** A code a request shows: a requester's to compare or type, or a link's six digits. */
const requestCode = z.union([pairingCode, keyCode]);

export const joinState = z
  .enum(["waiting", "allowed", "denied", "expired", "redeemed"])
  .describe(
    "`waiting` for a person; `allowed`, and not yet collected; `denied` by a person, or withdrawn; `expired` before it was collected; `redeemed`, which spends it.",
  );
export type JoinState = z.infer<typeof joinState>;

export const joinStartedBy = z
  .enum(["requester", "person"])
  .describe(
    "Who started it: the requester, with a code to compare, or a person, with a link that is allowed already.",
  );
export type JoinStartedBy = z.infer<typeof joinStartedBy>;

/** What a person may grant a harness: every capability a harness may take (ADR 0046). */
export const GRANTABLE: readonly string[] = Object.values(HARNESS_CAPABILITIES);

const capabilities = z
  .array(z.string().min(1).max(120))
  .max(64)
  .describe("Capability names, as `HARNESS_CAPABILITIES` spells them.");

const words = (most: number) => z.string().min(1).max(most);

/** A request as an owner's or admin's client sees it: never the secret. */
export const joinRequestView = z
  .object({
    request_id: id("join"),
    kind: joinKind,
    state: joinState,
    started_by: joinStartedBy,
    code: requestCode
      .optional()
      .describe(
        "The code the requester shows, to compare. A harness's link has none; an invite's or a pairing code's is six digits from the joining device's key (ADR 0232).",
      ),
    name: words(120)
      .optional()
      .describe("What it calls itself. A link's is known once it is redeemed."),
    software: words(120).optional().describe("Its software and version, as it says."),
    machine: words(120).optional().describe("The machine it runs on, as it says."),
    from_addr: words(120).optional().describe("The address it asked from, as Chips saw it."),
    wants: capabilities.describe("What a harness asked to do. Nothing, for a device."),
    capabilities: capabilities.describe(
      "What a person allowed it, which may be less than it asked for. Empty until allowed.",
    ),
    url: z
      .url({ protocol: /^https?$/ })
      .describe("Where Chips tells the requester to find it: the link's address, or the server's."),
    decided_by: id("person").optional().describe("Who allowed it, refused it or made the link."),
    decided_at: isoTimestamp.optional(),
    created_at: isoTimestamp,
    expires_at: isoTimestamp.describe("When it stops being good, unless it was redeemed."),
    harness_id: id("harness").optional().describe("The harness it made, once redeemed."),
    space_id: id("space")
      .optional()
      .describe(
        "The harness's direct room, once redeemed; for an invite, the room it brings the person into.",
      ),
    device_id: id("device").optional().describe("The device it paired, once redeemed."),
    pair_as: id("person")
      .optional()
      .describe(
        "Whom a device is paired as, when the owner who allowed it chose somebody already here (ADR 0206), or the person a pairing code was made for. Absent: the person who allowed it.",
      ),
    role: workspaceRole.optional().describe("For an invite: the role the person joins with."),
  })
  .describe("A join request, as an owner or admin sees it (ADR 0122).");
export type JoinRequestView = z.infer<typeof joinRequestView>;

/** `POST /v1/join`: what a requester sends. */
export const joinAsk = z
  .object({
    kind: joinKind.default("harness"),
    name: words(120).describe("What it calls itself: the harness's or the device's name."),
    software: words(120).optional(),
    machine: words(120).optional(),
    wants: capabilities.optional().describe("For a harness: what it asks to be allowed."),
    public_key: z
      .string()
      .regex(/^[A-Za-z0-9+/]{40,64}={0,2}$/)
      .optional()
      .describe("For a device: the public half of its Ed25519 key, SPKI DER, base64."),
    commit: joinNonce
      .optional()
      .describe(
        "For a device (S-1, ADR 0278): the SHA-256 of `joinCommitText` of a nonce it keeps, base64url. It sends the nonce with its first poll, once it holds the server's, and both ends work the code out.",
      ),
  })
  .describe("A request to join.");
export type JoinAsk = z.input<typeof joinAsk>;

/** The answer to `POST /v1/join`. */
export const joinAsked = z.object({
  request_id: id("join"),
  secret: z.string().min(16).max(200).describe("The requester's alone: it polls with it."),
  code: requestCode
    .optional()
    .describe("The code to show. Absent for a device that sent `commit`: it works its own out."),
  server_key: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe(
      "For a device that sent `commit`: the server's tunnel key, which the code is worked out from and the device pins once it is allowed (ADR 0191, 0278).",
    ),
  nonce: joinNonce
    .optional()
    .describe("For a device that sent `commit`: the server's nonce, for the code (ADR 0278)."),
  expires_in: z.int().positive().describe("Seconds until it expires."),
  interval: z.int().positive().describe("Seconds between polls."),
});
export type JoinAsked = z.infer<typeof joinAsked>;

/**
 * What `POST /v1/invites/redeem` and `POST /v1/pair` answer, `202`, for a link that asks (ADR
 * 0232): a request that waits for the person who handed the link out, polled as a device's is.
 */
export const linkWaiting = joinAsked
  .extend({ state: z.literal("waiting"), code: keyCode })
  .describe("A link's request, waiting for the person who handed it out (ADR 0232).");
export type LinkWaiting = z.infer<typeof linkWaiting>;

/** What a harness is handed once, when its request is redeemed. */
export const joinedHarness = z.object({
  kind: z.literal("harness"),
  url: z.url({ protocol: /^https?$/ }),
  harness_id: id("harness"),
  token: z.string().min(16).max(400).describe("Shown once. Chips keeps its digest."),
  space_id: id("space").optional().describe("The room it speaks in first, with the person."),
  capabilities,
});
export type JoinedHarness = z.infer<typeof joinedHarness>;

/** What a device is handed once, when its request is redeemed. */
export const joinedDevice = z.object({
  kind: z.literal("device"),
  url: z.url({ protocol: /^https?$/ }),
  device_id: id("device"),
  participant_id: id("person"),
  workspace_id: id("workspace"),
  display_name: words(120),
  workspace_name: words(120).optional(),
  server_key: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe(
      "The server's tunnel key, base64url (ADR 0191): what the device pins, so from here on it reaches the server through the tunnel door on this network and through the relay, and never a plain address again.",
    ),
  role: workspaceRole.optional().describe("For an invite: the role the person joined with."),
  space_id: id("space").optional().describe("For an invite: the room it put the person in."),
});
export type JoinedDevice = z.infer<typeof joinedDevice>;

/** A poll's answer while the request still waits for a person: ask again in `interval`. */
export const joinPending = z.object({
  state: z.literal("waiting"),
  interval: z.int().positive(),
});

/** The secret a link carries: URL-safe, at least 128 bits. */
const SECRET = /^[A-Za-z0-9_-]{22,120}$/;

/** A link a person hands a harness: the server's address, then `/j/`, then the secret. */
export function joinLink(base: string, secret: string): string {
  return `${base.replace(/\/$/, "")}/j/${secret}`;
}

/** A link taken apart: where Chips is, and the secret. Nothing when it is not a join link. */
export function parseJoinLink(link: string): { url: string; secret: string } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(link.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  const match = /^(.*)\/j\/([^/]+)\/?$/.exec(parsed.pathname);
  const secret = match?.[2];
  if (match === null || secret === undefined || !SECRET.test(secret)) return undefined;
  return { url: `${parsed.origin}${match[1] ?? ""}`, secret };
}
