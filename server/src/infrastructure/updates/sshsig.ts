/**
 * An SSH signature (`ssh-keygen -Y sign`, OpenSSH's PROTOCOL.sshsig) checked against one Ed25519
 * key, for the list of bridge releases that may arrive on their own (bridges-keep-current.md, rule
 * 6). The key is Chips's release key, the one `packaging/install.sh` checks a download with
 * (SEC-36); the namespace keeps a signature made for one purpose from passing for another.
 */

import { createHash, createPublicKey, verify } from "node:crypto";

/** The release key, as `install.sh`'s `SIGNER` names it: SSH's wire form in base64. */
export const RELEASE_KEY = "AAAAC3NzaC1lZDI1NTE5AAAAIE4Hjm5JMEWp9mJ6b4ITUf6RFa2kDX5R2C7X5ZaQbNDa";

/** What the bridge list is signed for: `ssh-keygen -Y sign -n chips-bridges`. */
export const BRIDGES_NAMESPACE = "chips-bridges";

const MAGIC = Buffer.from("SSHSIG");

/** SSH's `string`s, read one after another. */
class Reader {
  private at = 0;
  constructor(private readonly bytes: Buffer) {}
  take(length: number): Buffer {
    if (this.at + length > this.bytes.length) throw new Error("short");
    const out = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return out;
  }
  uint32(): number {
    return this.take(4).readUInt32BE(0);
  }
  string(): Buffer {
    return this.take(this.uint32());
  }
  get done(): boolean {
    return this.at === this.bytes.length;
  }
}

function sshString(bytes: Buffer | string): Buffer {
  const body = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

/** The raw 32 bytes of an `ssh-ed25519` key in SSH's wire form. */
function ed25519Of(wire: Buffer): Buffer {
  const read = new Reader(wire);
  if (read.string().toString() !== "ssh-ed25519") throw new Error("not ed25519");
  const key = read.string();
  if (key.length !== 32 || !read.done) throw new Error("bad key");
  return key;
}

/** The blob inside `-----BEGIN SSH SIGNATURE-----`. */
function unarmour(armoured: string): Buffer {
  const found = /-----BEGIN SSH SIGNATURE-----([\s\S]*?)-----END SSH SIGNATURE-----/.exec(armoured);
  if (found?.[1] === undefined) throw new Error("not an SSH signature");
  return Buffer.from(found[1].replace(/\s+/g, ""), "base64");
}

/**
 * Whether `armoured` is a signature over `message` by `key` (SSH wire form, base64) for
 * `namespace`. Anything it can't read is false, never a throw.
 */
export function sshsigVerifies(
  message: Uint8Array,
  armoured: string,
  namespace: string,
  key: string = RELEASE_KEY,
): boolean {
  try {
    const read = new Reader(unarmour(armoured));
    if (!read.take(6).equals(MAGIC) || read.uint32() !== 1) return false;
    const signer = read.string();
    const signedFor = read.string().toString();
    const reserved = read.string();
    const hash = read.string().toString();
    const signature = new Reader(read.string());
    if (!read.done) return false;
    const want = Buffer.from(key, "base64");
    if (!signer.equals(want) || signedFor !== namespace) return false;
    if (hash !== "sha512" && hash !== "sha256") return false;
    if (signature.string().toString() !== "ssh-ed25519") return false;
    const raw = signature.string();
    if (raw.length !== 64 || !signature.done) return false;
    const signed = Buffer.concat([
      MAGIC,
      sshString(namespace),
      sshString(reserved),
      sshString(hash),
      sshString(createHash(hash).update(message).digest()),
    ]);
    const publicKey = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: ed25519Of(want).toString("base64url") },
      format: "jwk",
    });
    return verify(null, signed, publicKey, raw);
  } catch {
    return false;
  }
}
