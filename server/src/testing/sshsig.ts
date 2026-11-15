/**
 * An SSH signature (`ssh-keygen -Y sign`'s format) built by hand with a throwaway Ed25519 key, a
 * field at a time, so a test can make each thing the reader refuses: `ssh-keygen` only ever writes
 * a good one, and isn't on every machine the tests run on.
 */

import {
  createHash,
  generateKeyPairSync,
  type KeyPairKeyObjectResult,
  sign as signWith,
} from "node:crypto";

const wire = (bytes: Buffer | string): Buffer => {
  const body = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
};

export interface SignedByHand {
  readonly magic: string;
  readonly version: number;
  readonly keyType: string;
  /** The key's raw bytes; the throwaway key's own unless a test says. */
  readonly keyBytes: Buffer;
  readonly namespace: string;
  readonly hash: string;
  readonly signatureType: string;
  /** Bytes cut off the end of the signature. */
  readonly cut: number;
  /** Bytes put after the signature, inside its field. */
  readonly afterSignature: Buffer;
  /** Bytes put after everything. */
  readonly after: Buffer;
}

export interface Signed {
  readonly armoured: string;
  /** The signer's public key, in SSH's wire form, base64: what the reader is given to check with. */
  readonly key: string;
}

/** `message` signed for `chips-bridges` unless `change` says otherwise, by a key of its own. */
export function signedByHand(
  message: string | Uint8Array,
  change: Partial<SignedByHand> = {},
): Signed {
  return signerByHand()(message, change);
}

/** One throwaway key that signs any number of messages, as the release key signs each list. */
export function signerByHand(): (
  message: string | Uint8Array,
  change?: Partial<SignedByHand>,
) => Signed {
  const pair = generateKeyPairSync("ed25519");
  return (message, change = {}) => signedWith(pair, message, change);
}

function signedWith(
  pair: KeyPairKeyObjectResult,
  message: string | Uint8Array,
  change: Partial<SignedByHand>,
): Signed {
  const made: SignedByHand = {
    magic: "SSHSIG",
    version: 1,
    keyType: "ssh-ed25519",
    keyBytes: Buffer.from(pair.publicKey.export({ format: "jwk" }).x ?? "", "base64url"),
    namespace: "chips-bridges",
    hash: "sha512",
    signatureType: "ssh-ed25519",
    cut: 0,
    afterSignature: Buffer.alloc(0),
    after: Buffer.alloc(0),
    ...change,
  };
  const key = Buffer.concat([wire(made.keyType), wire(made.keyBytes)]);
  const digest = createHash(made.hash === "sha256" ? "sha256" : "sha512")
    .update(message)
    .digest();
  const signed = Buffer.concat([
    Buffer.from("SSHSIG"),
    wire(made.namespace),
    wire(""),
    wire(made.hash),
    wire(digest),
  ]);
  const signature = signWith(null, signed, pair.privateKey);
  const version = Buffer.alloc(4);
  version.writeUInt32BE(made.version, 0);
  const blob = Buffer.concat([
    Buffer.from(made.magic),
    version,
    wire(key),
    wire(made.namespace),
    wire(""),
    wire(made.hash),
    wire(
      Buffer.concat([
        wire(made.signatureType),
        wire(signature.subarray(0, signature.length - made.cut)),
        made.afterSignature,
      ]),
    ),
    made.after,
  ]);
  return {
    armoured: `-----BEGIN SSH SIGNATURE-----\n${blob.toString("base64")}\n-----END SSH SIGNATURE-----\n`,
    key: key.toString("base64"),
  };
}
