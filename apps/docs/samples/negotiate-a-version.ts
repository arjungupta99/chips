/**
 * Version negotiation, as `hello` does it.
 *
 * Used by: /connect/websocket/ and /reference/frames/
 */

import { strict as assert } from "node:assert";
import { clientHelloFrame, negotiateProtocol, PROTOCOL_VERSION } from "@chipschat/protocol";

const hello = {
  frame: "hello" as const,
  protocol: { min: 1, max: 1 },
  client: { name: "scout", version: "0.1.0" },
};

const parsed = clientHelloFrame.safeParse(hello);
assert.equal(parsed.success, true, "the hello frame in the docs should be valid");

// The server picks the highest version both sides speak.
assert.equal(negotiateProtocol({ min: 1, max: 3 }, { min: 1, max: 2 }), 2);
console.log("a client speaking 1-3 and a server speaking 1-2 agree on 2");

// This build speaks exactly one version, and agrees with itself.
assert.equal(negotiateProtocol({ min: PROTOCOL_VERSION, max: PROTOCOL_VERSION }), PROTOCOL_VERSION);
console.log(`this build speaks Agent Connect v${PROTOCOL_VERSION}`);

// Ranges that do not overlap are refused rather than guessed at.
assert.equal(negotiateProtocol({ min: 4, max: 5 }, { min: 1, max: 2 }), undefined);
console.log("ranges that do not overlap are refused");
