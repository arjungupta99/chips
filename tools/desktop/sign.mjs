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
