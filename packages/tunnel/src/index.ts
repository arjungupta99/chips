/**
 * `@chipschat/tunnel` — the end-to-end tunnel between a phone and its server (M4.1, ADR 0039): a
 * Noise NK handshake over WebCrypto, requests and sockets carried inside it as messages, and
 * both ends of the relay's conversation. It imports `@chipschat/protocol` for the relay's frames
 * and nothing else, so the server, the web app and the phone can all share it.
 */

export type { Bytes } from "./bytes.js";
export {
  asBytes,
  concat,
  equalBytes,
  fromBase64,
  fromBase64url,
  fromHex,
  randomBytes,
  text,
  toBase64,
  toBase64url,
  toHex,
  utf8,
} from "./bytes.js";
export type { KeyPair, StoredKeyPair, WebCryptoKey, WebCryptoKeyPair } from "./keys.js";
export {
  checkProof,
  dh,
  generateKeyPair,
  generateStoredKeyPair,
  hmacSha256,
  importPublicKey,
  importStoredKeyPair,
  KEY_BYTES,
  KeyError,
  proveKey,
} from "./keys.js";
export type {
  Answerer,
  AnswererHandlers,
  AnswererOptions,
  Caller,
  Channel,
  Header,
  MuxOptions,
  RequestInput,
  ResponseOutput,
  StreamedOutput,
  TunnelSocket,
  Wire,
} from "./mux.js";
export {
  CHUNK_BYTES,
  CLOSE_REFUSED,
  CLOSE_TOO_MANY,
  CLOSE_TUNNEL_GONE,
  createAnswerer,
  createCaller,
  createChannel,
  DEFAULT_MAX_BODY_BYTES,
  decodeFrame,
  encodeFrame,
  readHeader,
} from "./mux.js";
export type { Initiated, Responded, Tunnel } from "./noise.js";
export {
  HANDSHAKE_MESSAGE_BYTES,
  initiateHandshake,
  MAX_MESSAGE_BYTES,
  MAX_PLAINTEXT_BYTES,
  NOISE_PROTOCOL,
  PROLOGUE,
  respondHandshake,
  TAG_BYTES,
  TunnelClosedError,
  TunnelError,
} from "./noise.js";
export type {
  DoorClientOptions,
  RelayClientLink,
  RelayClientOptions,
  RelayFailure,
  RelayServerLink,
  RelayServerOptions,
  RelaySession,
  SocketFactory,
  SocketLike,
} from "./relay.js";
export {
  CLOSE_PEER_GONE,
  connectThroughRelay,
  dialTunnelDoor,
  RelayError,
  relayEndpoint,
  serveThroughRelay,
  sessionPrefix,
} from "./relay.js";
