import { describe, expect, it } from "vitest";
import {
  deviceGrantOf,
  deviceGrantPath,
  grantUrl,
  signDeviceGrant,
  signGrant,
  verifyDeviceGrant,
  verifyGrant,
} from "./signing.js";

const SECRET = "a-secret-long-enough-for-tests";
const grant = {
  attachmentId: "att_01K4ZQPX000000000000000008",
  tokenId: "tok_1",
  expiresAt: 1_800_000_600,
};

describe("a signed attachment URL", () => {
  it("verifies for the token it was minted for, before it expires", () => {
    const signature = signGrant(grant, SECRET);
    expect(
      verifyGrant({
        grant,
        signature,
        secret: SECRET,
        presentedTokenId: "tok_1",
        nowSeconds: 1_800_000_000,
      }),
    ).toEqual({ ok: true });
  });

  it("is useless to a different token, and to anyone without one", () => {
    const signature = signGrant(grant, SECRET);
    expect(
      verifyGrant({
        grant,
        signature,
        secret: SECRET,
        presentedTokenId: "tok_2",
        nowSeconds: 1_800_000_000,
      }),
    ).toEqual({ ok: false, reason: "wrong_token" });
    expect(
      verifyGrant({
        grant,
        signature,
        secret: SECRET,
        presentedTokenId: undefined,
        nowSeconds: 1_800_000_000,
      }),
    ).toEqual({ ok: false, reason: "wrong_token" });
  });

  it("is useless once it has expired, and when any part of it was changed", () => {
    const signature = signGrant(grant, SECRET);
    expect(
      verifyGrant({
        grant,
        signature,
        secret: SECRET,
        presentedTokenId: "tok_1",
        nowSeconds: 1_800_000_600,
      }),
    ).toEqual({ ok: false, reason: "expired" });
    const later = { ...grant, expiresAt: grant.expiresAt + 3600 };
    expect(
      verifyGrant({
        grant: later,
        signature,
        secret: SECRET,
        presentedTokenId: "tok_1",
        nowSeconds: 1_800_000_000,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
    expect(
      verifyGrant({
        grant,
        signature: "nope",
        secret: SECRET,
        presentedTokenId: "tok_1",
        nowSeconds: 1,
      }),
    ).toEqual({ ok: false, reason: "malformed" });
    expect(
      verifyGrant({
        grant,
        signature,
        secret: "another",
        presentedTokenId: "tok_1",
        nowSeconds: 1,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("puts the grant and its signature in the query of the attachment's own route", () => {
    const url = new URL(grantUrl("http://chips.local", grant, SECRET));
    expect(url.pathname).toBe("/v1/attachments/att_01K4ZQPX000000000000000008");
    expect(url.searchParams.get("tok")).toBe("tok_1");
    expect(url.searchParams.get("exp")).toBe("1800000600");
    expect(url.searchParams.get("sig")).toBe(signGrant(grant, SECRET));
  });
});

describe("a device's grant for a player (ADR 0058)", () => {
  const device = {
    attachmentId: "att_01K4ZQPX000000000000000008",
    variant: "play",
    deviceId: "dev_01K4ZQPX000000000000000001",
    expiresAt: 1_800_000_600,
  };
  const check = (
    signature: string,
    over: Partial<typeof device> = {},
    presentedDeviceId: string | undefined = device.deviceId,
    nowSeconds = 1_800_000_000,
  ) =>
    verifyDeviceGrant({
      grant: { ...device, ...over },
      signature,
      secret: SECRET,
      presentedDeviceId,
      nowSeconds,
    });

  it("is admitted for its device, before it expires", () => {
    expect(check(signDeviceGrant(device, SECRET))).toEqual({ ok: true });
  });

  it("is refused for another device, after its expiry, and for another variant or file", () => {
    const signature = signDeviceGrant(device, SECRET);
    expect(check(signature, {}, "dev_01K4ZQPX000000000000000002")).toEqual({
      ok: false,
      reason: "wrong_device",
    });
    expect(check(signature, { deviceId: "dev_01K4ZQPX000000000000000002" })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(check(signature, {}, device.deviceId, 1_800_000_600)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(check(signature, { variant: "file" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(check(signature, { attachmentId: "att_01K4ZQPX000000000000000009" })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(check(signature, { expiresAt: 1_900_000_000 })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("is never a harness grant's signature, nor one made with another secret", () => {
    const asHarness = signGrant(
      { attachmentId: device.attachmentId, tokenId: device.deviceId, expiresAt: device.expiresAt },
      SECRET,
    );
    expect(check(asHarness)).toEqual({ ok: false, reason: "bad_signature" });
    expect(check(signDeviceGrant(device, "another-secret-long-enough"))).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(check("not-hex")).toEqual({ ok: false, reason: "malformed" });
    expect(check(signDeviceGrant(device, SECRET), { expiresAt: Number.NaN })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("is a path with the grant in its query, which reads back as the same grant", () => {
    const path = deviceGrantPath(device, SECRET);
    expect(path).toMatch(
      /^\/v1\/attachments\/att_01K4ZQPX000000000000000008\?variant=play&dev=dev_01K4ZQPX000000000000000001&exp=1800000600&sig=[a-f0-9]{64}$/,
    );
    const url = new URL(path, "http://chips.local");
    const read = deviceGrantOf(url.pathname, (name) => url.searchParams.get(name) ?? undefined);
    expect(read?.grant).toEqual(device);
    expect(check(read?.signature ?? "")).toEqual({ ok: true });

    const file = new URL(deviceGrantPath({ ...device, variant: "file" }, SECRET), "http://x");
    expect(file.searchParams.has("variant")).toBe(false);
    expect(
      deviceGrantOf(file.pathname, (name) => file.searchParams.get(name) ?? undefined)?.grant
        .variant,
    ).toBe("file");
  });

  it("is nothing on another path, or without a device and a signature", () => {
    const none = () => undefined;
    expect(deviceGrantOf("/v1/uploads/att_1", (name) => (name === "dev" ? "d" : "s"))).toBe(
      undefined,
    );
    expect(deviceGrantOf("/v1/attachments/att_1", none)).toBeUndefined();
    expect(
      deviceGrantOf("/v1/attachments/att_1", (name) => (name === "dev" ? "d" : undefined)),
    ).toBeUndefined();
    const noExpiry = deviceGrantOf("/v1/attachments/att_1", (name) =>
      name === "dev" ? "d" : name === "sig" ? "s" : undefined,
    );
    expect(noExpiry?.grant.expiresAt).toBeNaN();
  });
});
