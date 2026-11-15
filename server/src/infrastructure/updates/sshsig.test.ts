/**
 * The bridge list's signature: checked against the release key, as `ssh-keygen -Y sign` makes it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signedByHand as byHand } from "../../testing/sshsig.js";
import { BRIDGES_NAMESPACE, RELEASE_KEY, sshsigVerifies } from "./sshsig.js";

const hasKeygen = existsSync("/usr/bin/ssh-keygen");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-sshsig-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A throwaway key, its public half in SSH's wire form, and a signer for it. */
function keyHere() {
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(dir, "key")]);
  const key = readFileSync(join(dir, "key.pub"), "utf8").split(" ")[1] ?? "";
  const sign = (message: string, namespace = BRIDGES_NAMESPACE) => {
    writeFileSync(join(dir, "message"), message);
    rmSync(join(dir, "message.sig"), { force: true });
    execFileSync("ssh-keygen", [
      "-Y",
      "sign",
      "-q",
      "-f",
      join(dir, "key"),
      "-n",
      namespace,
      join(dir, "message"),
    ]);
    return readFileSync(join(dir, "message.sig"), "utf8");
  };
  return { key, sign };
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe("an SSH signature", () => {
  it.skipIf(!hasKeygen)("verifies what ssh-keygen signed, for its namespace, with its key", () => {
    const { key, sign } = keyHere();
    const signature = sign('{"format":1}');
    expect(sshsigVerifies(bytes('{"format":1}'), signature, BRIDGES_NAMESPACE, key)).toBe(true);
  });

  it.skipIf(!hasKeygen)("refuses another message, namespace or key", () => {
    const { key, sign } = keyHere();
    const signature = sign('{"format":1}');
    expect(sshsigVerifies(bytes('{"format":2}'), signature, BRIDGES_NAMESPACE, key)).toBe(false);
    expect(sshsigVerifies(bytes('{"format":1}'), signature, "chips-release", key)).toBe(false);
    expect(sshsigVerifies(bytes('{"format":1}'), signature, BRIDGES_NAMESPACE)).toBe(false);
    // A signature made for the install line's downloads is no bridge list's.
    const release = sign('{"format":1}', "chips-release");
    expect(sshsigVerifies(bytes('{"format":1}'), release, BRIDGES_NAMESPACE, key)).toBe(false);
  });

  it("is false, never a throw, for anything it can't read", () => {
    expect(sshsigVerifies(bytes("x"), "", BRIDGES_NAMESPACE)).toBe(false);
    expect(
      sshsigVerifies(
        bytes("x"),
        "-----BEGIN SSH SIGNATURE-----\nAAAA\n-----END SSH SIGNATURE-----",
        BRIDGES_NAMESPACE,
      ),
    ).toBe(false);
    expect(sshsigVerifies(bytes("x"), "not a signature", BRIDGES_NAMESPACE, "AAAA")).toBe(false);
  });

  it("checks with the key the install line checks with", () => {
    const install = readFileSync(
      fileURLToPath(new URL("../../../../packaging/install.sh", import.meta.url)),
      "utf8",
    );
    const signer = /^SIGNER='([^']*)'/m.exec(install)?.[1] ?? "";
    expect(signer.split(" ").at(-1)).toBe(RELEASE_KEY);
  });
});

describe("an SSH signature, a field at a time", () => {
  const verifies = (made: { armoured: string; key: string }, message = "the list") =>
    sshsigVerifies(bytes(message), made.armoured, BRIDGES_NAMESPACE, made.key);

  it("verifies one built by hand, hashed either way SSH hashes", () => {
    expect(verifies(byHand("the list"))).toBe(true);
    expect(verifies(byHand("the list", { hash: "sha256" }))).toBe(true);
    expect(verifies(byHand("the list"), "another list")).toBe(false);
  });

  it("refuses another magic or version, and bytes after the end", () => {
    expect(verifies(byHand("the list", { magic: "SSHSIX" }))).toBe(false);
    expect(verifies(byHand("the list", { version: 2 }))).toBe(false);
    expect(verifies(byHand("the list", { after: Buffer.from("more") }))).toBe(false);
  });

  it("refuses a hash it doesn't know, and a signature that isn't Ed25519's 64 bytes", () => {
    expect(verifies(byHand("the list", { hash: "md5" }))).toBe(false);
    expect(verifies(byHand("the list", { signatureType: "ssh-rsa" }))).toBe(false);
    expect(verifies(byHand("the list", { cut: 1 }))).toBe(false);
    expect(verifies(byHand("the list", { afterSignature: Buffer.from("more") }))).toBe(false);
  });

  it("refuses a key that isn't an Ed25519 key of 32 bytes", () => {
    expect(verifies(byHand("the list", { keyType: "ssh-rsa" }))).toBe(false);
    expect(verifies(byHand("the list", { keyBytes: Buffer.alloc(31) }))).toBe(false);
  });

  it("refuses a signature by a key other than the one asked for", () => {
    const made = byHand("the list");
    const other = byHand("the list");
    expect(sshsigVerifies(bytes("the list"), made.armoured, BRIDGES_NAMESPACE, other.key)).toBe(
      false,
    );
  });
});
