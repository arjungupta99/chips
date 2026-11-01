/**
 * The relay's control frames: every one carries a version, the two that open a path carry a
 * candidate list that is empty in v0, and a frame from a newer peer reads by what this version
 * knows rather than failing (ADR 0038, decision 3).
 */

import { describe, expect, it } from "vitest";
import {
  candidateAddresses,
  parseRelayFrame,
  RELAY_VERSION,
  relayConnectFrame,
  relayServeFrame,
} from "./relay.js";

const KEY = "A".repeat(43);
const SESSION = "0123456789abcdef0123456789abcdef";

describe("the relay frames", () => {
  it("read every frame of the switchboard's conversation", () => {
    const frames = [
      { frame: "challenge", v: 1, nonce: KEY, ephemeral: KEY },
      { frame: "serve", v: 1, key: KEY, proof: KEY, candidates: [] },
      { frame: "serving", v: 1, session_limit: 32 },
      { frame: "connect", v: 1, key: KEY, candidates: [] },
      { frame: "connected", v: 1, session: SESSION },
      { frame: "open", v: 1, session: SESSION, from: "203.0.113.5" },
      { frame: "close", v: 1, session: SESSION, reason: "client_gone" },
      { frame: "error", v: 1, code: "no_such_server", message: "Nobody by that key is here." },
      { frame: "error", v: 1, code: "not_allowed", message: "This relay serves a list." },
    ];
    for (const frame of frames) {
      const read = parseRelayFrame(JSON.stringify(frame));
      expect(read.ok, frame.frame).toBe(true);
      if (read.ok) expect(read.frame.frame).toBe(frame.frame);
    }
  });

  it("carries a version on every frame, and refuses one without", () => {
    expect(RELAY_VERSION).toBe(1);
    const without = parseRelayFrame(JSON.stringify({ frame: "connect", key: KEY }));
    expect(without).toEqual({ ok: false, reason: "bad_frame" });
    const zero = parseRelayFrame(JSON.stringify({ frame: "connect", v: 0, key: KEY }));
    expect(zero).toEqual({ ok: false, reason: "bad_frame" });
  });

  it("fills an absent candidate list as empty, and keeps a newer peer's candidates unread", () => {
    expect(relayConnectFrame.parse({ frame: "connect", v: 1, key: KEY }).candidates).toEqual([]);
    expect(candidateAddresses.parse(undefined)).toEqual([]);
    // A v2 peer that gathered addresses: the frame still reads, and the list is carried whole.
    const newer = relayServeFrame.parse({
      frame: "serve",
      v: 2,
      key: KEY,
      proof: KEY,
      candidates: [{ address: "203.0.113.5:4431", kind: "srflx", priority: 9 }],
      punch: { enabled: true },
    });
    expect(newer.v).toBe(2);
    expect(newer.candidates).toEqual([{ address: "203.0.113.5:4431", kind: "srflx", priority: 9 }]);
    expect("punch" in newer).toBe(false);
  });

  it("refuses what is not JSON, not a frame, or the wrong shape", () => {
    expect(parseRelayFrame("{")).toEqual({ ok: false, reason: "not_json" });
    expect(parseRelayFrame(JSON.stringify({ frame: "dance", v: 1 }))).toEqual({
      ok: false,
      reason: "bad_frame",
    });
    expect(parseRelayFrame(JSON.stringify({ frame: "connect", v: 1, key: "short" }))).toEqual({
      ok: false,
      reason: "bad_frame",
    });
    expect(
      parseRelayFrame(JSON.stringify({ frame: "open", v: 1, session: "nope", from: "x" })),
    ).toEqual({ ok: false, reason: "bad_frame" });
  });

  it("takes a phone's address only as one, or as nothing (SEC-27)", () => {
    const open = (from: string) =>
      parseRelayFrame(JSON.stringify({ frame: "open", v: 1, session: SESSION, from })).ok;
    expect(open("203.0.113.5")).toBe(true);
    expect(open("2001:db8:1:2::9")).toBe(true);
    expect(open("::ffff:203.0.113.5")).toBe(true);
    expect(open("")).toBe(true);
    expect(open("unknown")).toBe(false);
    expect(open("203.0.113.5; drop table")).toBe(false);
    expect(open("x".repeat(64))).toBe(false);
  });
});
