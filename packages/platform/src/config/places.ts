/**
 * Where an installed Chips keeps things on this machine (ADR 0120). A checkout keeps `./.chips`,
 * the schema's default; an installed `chips` passes these as its defaults instead, so a server
 * started from any directory finds the same workspace.
 *
 * Pure: the platform, the home directory and the environment are arguments, so a test asks about
 * Linux on a Mac.
 */

import { join } from "node:path";
import type { Environment } from "./environment.js";

export interface Machine {
  readonly platform: string;
  readonly home: string;
  readonly environment: Environment;
}

const set = (value: string | undefined): value is string => value !== undefined && value !== "";

/** The workspace: the database, attachments, keys and the operator token. */
export function platformDataDir({ platform, home, environment }: Machine): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Chips");
  const xdg = environment["XDG_DATA_HOME"];
  return join(set(xdg) ? xdg : join(home, ".local", "share"), "chips");
}

/** Logs, when the server runs as a service or in the background. */
export function platformLogDir({ platform, home, environment }: Machine): string {
  if (platform === "darwin") return join(home, "Library", "Logs", "Chips");
  const xdg = environment["XDG_STATE_HOME"];
  return join(set(xdg) ? xdg : join(home, ".local", "state"), "chips");
}

/** The database a data directory holds, as the `sqlite:` URL the schema takes. */
export function databaseUrlIn(dataDir: string): string {
  return `sqlite:${join(dataDir, "chips.db")}`;
}
