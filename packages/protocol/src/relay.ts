/**
 * The relay's control frames (M4.1, ADR 0038).
 *
 * The relay is a switchboard: a home server dials out to it and says which key it holds; a
 * phone dials in and asks for a server by that key; the relay holds the two connections
 * together and moves bytes between them. The bytes are ciphertext it cannot read — the tunnel
 * inside is `@chipschat/tunnel`'s — and these frames are the only thing it does understand: text
 * frames on the WebSocket, JSON, one `frame` word each. Data travels in binary frames beside
 * them and is never parsed here.
 *
 * Every frame carries a version, and the two that open a path — `serve` and `connect` — carry
 * a list of candidate addresses that is empty in v0 (ADR 0038, decisions 3 and 4). A peer that
 * receives a version it does not know reads the fields it does know and uses the relay,
 * rather than failing: the version is the room left for NAT traversal, and it costs one field.
 */

import { z } from "zod";

/** The relay protocol's version. Bumped when a frame's meaning changes, never for a new field. */
export const RELAY_VERSION = 1;

/** How many bytes name a session in the relay's binary frames, before the ciphertext. */
export const RELAY_SESSION_ID_BYTES = 16;

/**
 * The tunnel door on the server's own network (ADR 0191): a WebSocket at this path, on the same
 * port as `/v1/ws`, where a phone at home opens the same Noise tunnel it opens through the relay
 * when it is away, to the same key. `/v1/health` names it as `tunnel.path`, so a client reads the
 * path rather than knowing it.
 */
export const TUNNEL_DOOR_PATH = "/v1/tunnel";

/** Thirty-two bytes as base64url without padding, which is what every key and nonce here is. */
const bytes32 = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "thirty-two bytes, base64url");

/** A session's name: sixteen random bytes as hex. */
export const relaySessionId = z.string().regex(/^[0-9a-f]{32}$/, "a session id");

const version = z
  .int()
  .positive()
  .describe("The relay protocol version the sender speaks. Unknown fields are ignored.");

/**
 * A way a peer might be reached without the relay. Nothing sends one in v0 and nothing reads
 * one; the shape is loose so that a v1 peer can carry a v2 peer's candidates unread rather
 * than refuse the frame (ADR 0038, decision 3).
 */
export const candidateAddress = z
  .looseObject({
    address: z.string().min(1).max(255).describe("Where, in a form the kind decides."),
  })
  .describe("A candidate address for a direct path. Empty in v0.");

export const candidateAddresses = z
  .array(candidateAddress)
  .max(16)
  .default([])
  .describe("Candidate addresses for a direct path. Always empty in v0.");

/** Relay → server, first: prove you hold the key you are about to claim. */
export const relayChallengeFrame = z.object({
  frame: z.literal("challenge"),
  v: version,
  nonce: bytes32.describe("Fresh for this connection."),
  ephemeral: bytes32.describe("The relay's X25519 ephemeral public key, for the proof."),
});

/** Server → relay: this is my key, and here is the proof. */
export const relayServeFrame = z.object({
  frame: z.literal("serve"),
  v: version,
  key: bytes32.describe("The server's X25519 static public key: what a phone asks for."),
  proof: bytes32.describe(
    "HMAC-SHA256 over the nonce and the key, keyed by X25519(static, ephemeral).",
  ),
  candidates: candidateAddresses,
});

/** Relay → server: registered; phones may ask for you now. */
export const relayServingFrame = z.object({
  frame: z.literal("serving"),
  v: version,
  session_limit: z.int().positive().describe("How many phones this relay holds open for you."),
});

/** Phone → relay: put me through to this server. */
export const relayConnectFrame = z.object({
  frame: z.literal("connect"),
  v: version,
  key: bytes32.describe("The server's key, from the pairing payload."),
  candidates: candidateAddresses,
});

/** Relay → phone: you are through; the binary frames from here on are the tunnel's. */
export const relayConnectedFrame = z.object({
  frame: z.literal("connected"),
  v: version,
  session: relaySessionId,
});

/** Relay → server: a phone is here; its bytes arrive under this session id. */
export const relayOpenFrame = z.object({
  frame: z.literal("open"),
  v: version,
  session: relaySessionId,
  from: z
    .union([z.ipv4(), z.ipv6(), z.literal("")])
    .describe(
      "The phone's address as the relay saw it, for the server's limiter and its join cards: an IP address, or nothing when the relay could not tell (SEC-27).",
    ),
});

/** Either way: a session is over. The relay tells the other side and closes the phone's socket. */
export const relayCloseFrame = z.object({
  frame: z.literal("close"),
  v: version,
  session: relaySessionId,
  reason: z.string().max(120),
});

export const RELAY_ERROR_CODES = [
  "unknown_version",
  "bad_frame",
  "bad_proof",
  "no_such_server",
  "busy",
  "replaced",
  /**
   * A relay that serves a list of servers, and this key is not on it. Its operator adds the key
   * to the list; the server keeps dialling meanwhile, so it is listed the moment that happens.
   */
  "not_allowed",
] as const;
export type RelayErrorCode = (typeof RELAY_ERROR_CODES)[number];

/** Relay → either side: no, and why. The socket closes after it. */
export const relayErrorFrame = z.object({
  frame: z.literal("error"),
  v: version,
  code: z.enum(RELAY_ERROR_CODES),
  message: z.string().max(240),
});

export const relayFrame = z.discriminatedUnion("frame", [
  relayChallengeFrame,
  relayServeFrame,
  relayServingFrame,
  relayConnectFrame,
  relayConnectedFrame,
  relayOpenFrame,
  relayCloseFrame,
  relayErrorFrame,
]);

export type RelayFrame = z.infer<typeof relayFrame>;
export type RelayFrameName = RelayFrame["frame"];
export type CandidateAddress = z.infer<typeof candidateAddress>;

/**
 * Read a text frame. A frame from a newer peer parses by the fields this version knows; the
 * caller can see `v` and say so in its log. Anything else is refused with a reason the relay
 * puts in an `error` frame.
 */
export function parseRelayFrame(
  text: string,
): { ok: true; frame: RelayFrame } | { ok: false; reason: "not_json" | "bad_frame" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not_json" };
  }
  const frame = relayFrame.safeParse(parsed);
  return frame.success ? { ok: true, frame: frame.data } : { ok: false, reason: "bad_frame" };
}
