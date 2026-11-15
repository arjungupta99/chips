/**
 * The binaries Chips for Mac carries, signed as the app is (ADR 0218's addendum), and the words
 * that send a build to Apple to be notarized. Pure, so it is tested
 * (`tools/guardrails/desktop-sign.test.ts`) without a certificate.
 *
 * Why it exists: what the app keeps running (the server's service from `chips up`, a bridge kept by
 * the Connect sheet) runs `Chips.app/Contents/Resources/chips/runtime/node`. A launch agent that
 * names the app (`AssociatedBundleIdentifiers`) is shown under the app's name in the
 * background-item notice and Login Items only when its program is signed by the app's own team.
 * The Node a release carries keeps Node's signature, the Node.js Foundation's team, so macOS named
 * Node. Tauri signs the app and leaves its resources as they are, so this signs the carried Node
 * before Tauri seals the app around it. A build to hand out (`pnpm desktop release`) is notarized,
 * and Apple accepts it only when every binary inside is signed by the Developer ID under the
 * hardened runtime with a timestamp: Node, and the natives beside it (better-sqlite3, sharp and its
 * libvips, esbuild).
 */

import { fileURLToPath } from "node:url";

/** What Node's own signature claims, less a debugger's: `apps/desktop/src-tauri/NodeEntitlements.plist`. */
export const NODE_ENTITLEMENTS = fileURLToPath(
  new URL("../../apps/desktop/src-tauri/NodeEntitlements.plist", import.meta.url),
);

/**
 * `codesign`'s words for one binary the app carries, in place of the signature it came with: under
 * the hardened runtime, as the app is. Node takes its entitlements; a library or helper takes none.
 * A build to hand out asks for a secure timestamp too, which notarization wants on every binary.
 */
export function signArgs(file, identity, { entitlements, timestamp = false } = {}) {
  return [
    "--force",
    "--sign",
    identity,
    ...(timestamp ? ["--timestamp"] : []),
    "--options",
    "runtime",
    ...(entitlements === undefined ? [] : ["--entitlements", entitlements]),
    file,
  ];
}

/** Whether a signing identity is one for handing the app out (`pnpm desktop release`). */
export function isDeveloperId(identity) {
  return identity.startsWith("Developer ID Application: ");
}

/**
 * `xcrun notarytool`'s words for sending `file` to Apple and waiting for the answer, with an App
 * Store Connect API key (`~/.appstoreconnect/chips.json` names it; the `.p8` sits beside it).
 */
export function notarizeArgs(file, { keyPath, keyId, issuerId }) {
  return [
    "notarytool",
    "submit",
    file,
    "--key",
    keyPath,
    "--key-id",
    keyId,
    "--issuer",
    issuerId,
    "--wait",
    "--output-format",
    "json",
  ];
}

/** The team a signature names, from what `codesign -dv` prints; nothing for one signed ad hoc. */
export function teamOf(described) {
  const team = /^TeamIdentifier=(\S+)$/m.exec(described)?.[1];
  return team === undefined || team === "not set" ? undefined : team;
}

/**
 * Chips for Mac's own update (ADR 0298). The app reads `latest.json` from the newest GitHub
 * release, takes the archive it names, and checks it against the updater key's public half in
 * `tauri.conf.json` before anything else. The key's private half is kept on the Mac that makes
 * releases, beside the release key.
 */
export const UPDATE_ARCHIVE = "Chips.app.tar.gz";
export const UPDATE_FEED = "latest.json";
export const RELEASES_URL = "https://github.com/arjungupta99/chips/releases";

/** The archive's address on the release `v<version>`. */
export function updateUrl(version) {
  return `${RELEASES_URL}/download/v${version}/${UPDATE_ARCHIVE}`;
}

/**
 * What `latest.json` says, as Tauri's updater reads it: the version, the archive for Apple
 * silicon and its signature. The DMG is Apple silicon only, and so is this.
 */
export function updateFeed({ version, signature, at }) {
  return {
    version,
    notes: `Chips ${version}`,
    pub_date: at.toISOString(),
    platforms: { "darwin-aarch64": { signature, url: updateUrl(version) } },
  };
}

/**
 * The key a public key or a signature names, as sixteen hex digits: `tauri signer`'s files are
 * minisign's text in base64, whose second line holds two letters for the kind, then the key's
 * eight-byte id. Nothing, for text that isn't one of them.
 */
export function keyIdOf(encoded) {
  const line = Buffer.from(String(encoded).trim(), "base64").toString("utf8").split("\n")[1];
  const bytes = Buffer.from(line ?? "", "base64");
  return bytes.length < 10 ? undefined : bytes.subarray(2, 10).toString("hex");
}

/**
 * Whether a signature was made with the key the app checks every update against (the public
 * half in `tauri.conf.json`). One made with another key would be thrown away by every copy.
 */
export function signedByUpdaterKey(signature, publicKey) {
  const id = keyIdOf(signature);
  return id !== undefined && id === keyIdOf(publicKey);
}

/** The feed the app is built to read: `latest.json` on the newest release. */
export const UPDATE_FEED_URL = `${RELEASES_URL}/latest/download/${UPDATE_FEED}`;

/**
 * `tar`'s words for the archive: the app as its one top folder, as the updater unpacks it, with no
 * AppleDouble files beside (the environment's `COPYFILE_DISABLE`, set by the caller).
 */
export function archiveArgs(archive, app) {
  const at = app.lastIndexOf("/");
  return ["-czf", archive, "-C", app.slice(0, at), app.slice(at + 1)];
}
