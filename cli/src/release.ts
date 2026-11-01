/**
 * Whether this `chips` is a release or a checkout, and what a release defaults to (ADRs 0119 and
 * 0120).
 *
 * A release's bundle is built with `__CHIPS_RELEASE__` set to its version
 * (`tools/release/release.mjs`); a checkout run through tsx has no such global. A release keeps
 * its workspace in the platform's place, serves the web app unpacked beside it, and reads the
 * gallery's cards from the copy it carries (ADR 0218). A checkout keeps `./.chips` and the
 * repository's own build, as it always has, and reads the cards the docs publish.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Environment,
  type Machine,
  platformDataDir,
  platformLogDir,
} from "@chipschat/platform";

declare const __CHIPS_RELEASE__: string | undefined;

export interface Release {
  readonly version: string;
  /** The install: `bin/`, `lib/`, `runtime/` and `web/` are inside it. */
  readonly root: string;
}

/** This process's release, or undefined when it runs from a checkout. */
export function thisRelease(): Release | undefined {
  const version = typeof __CHIPS_RELEASE__ === "string" ? __CHIPS_RELEASE__ : undefined;
  if (version === undefined) return undefined;
  // The bundle is `<root>/lib/chips.mjs`, and this module is inside it.
  return { version, root: dirname(dirname(fileURLToPath(import.meta.url))) };
}

/**
 * Why a release will not run in dev mode (SEC-4), or nothing when it may run. Dev mode's routes
 * mint credentials with no credential and its bootstrap writes a demo workspace's keys beside the
 * database: a checkout's conveniences, and a release has no checkout to be convenient for.
 */
export function devModeRefusal(
  release: Release | undefined,
  config: { readonly devMode: boolean },
): string | undefined {
  if (release === undefined || !config.devMode) return undefined;
  return `chips ${release.version} is a release, and a release does not run in dev mode. Unset CHIPS_DEV_MODE.`;
}

/** `chips 0.2.0`, or `chips 0.0.0 (from a checkout)`. */
export function versionLine(release: Release | undefined, checkoutVersion = "0.0.0"): string {
  return release === undefined
    ? `chips ${checkoutVersion} (from a checkout)`
    : `chips ${release.version}`;
}

/**
 * What a release starts from, under whatever the environment says: the workspace in the
 * platform's place (its database follows, ADR 0120), the pages unpacked beside the bundle, and the
 * gallery's cards it carries (HS-1). `CHIPS_CONNECTORS` still wins, as every setting here does.
 */
export function releaseDefaults(
  release: Release,
  machine: Machine,
): { data: { dir: string }; server: { webDir: string; connectors: string } } {
  return {
    data: { dir: platformDataDir(machine) },
    server: {
      webDir: join(release.root, "web"),
      connectors: join(release.root, "connectors", "connectors.json"),
    },
  };
}

/**
 * What a checkout starts from: the gallery's cards as the docs publish them, so `chips serve` and
 * `chips connect` offer the same harnesses a release does. `CHIPS_CONNECTORS` still wins.
 */
export function checkoutDefaults(): { server: { connectors: string } } {
  const docs = new URL("../../apps/docs/public/connectors.json", import.meta.url);
  return { server: { connectors: fileURLToPath(docs) } };
}

/** Where a server started in the background by `chips up` writes its log. */
export function logFile(machine: Machine): string {
  return join(platformLogDir(machine), "chips.log");
}

/** This machine, as the places above read it. */
export function thisMachine(environment: Environment): Machine {
  return { platform: process.platform, home: homedir(), environment };
}
