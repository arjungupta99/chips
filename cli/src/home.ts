/**
 * Where `chips` keeps its own things, and where the server keeps its.
 *
 * Two different places, deliberately. A workspace — the database, the attachments — belongs to
 * whichever directory you pointed the server at, and is the thing you back up, export and move
 * between machines. The CLI's own credential and the config it writes for a harness belong to
 * the person using this machine, so they live under `~/.config/chips` (or `XDG_CONFIG_HOME`),
 * and they are not part of a workspace export.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { type Environment, processEnvironment } from "@chipschat/platform";

/** `~/.config/chips`, or wherever `XDG_CONFIG_HOME` says. */
export function configHome(environment: Environment = processEnvironment()): string {
  const explicit = environment["CHIPS_CONFIG_HOME"];
  if (explicit !== undefined && explicit !== "") return explicit;
  const xdg = environment["XDG_CONFIG_HOME"];
  if (xdg !== undefined && xdg !== "") return join(xdg, "chips");
  return join(homedir(), ".config", "chips");
}

/** The CLI's own credential: an Ed25519 key it pairs with, like any other device. */
export function devicePath(environment?: Environment): string {
  return join(configHome(environment), "device.json");
}

/** What `chips connect` wrote, so `doctor` can check it and `connect` can rewrite it. */
export function connectionsPath(environment?: Environment): string {
  return join(configHome(environment), "connections.json");
}
