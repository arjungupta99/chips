/**
 * The operator's token (ADR 0048): how the machine that runs the server proves it is that
 * machine.
 *
 * `chips serve` pairs the machine it runs on by construction — whoever started it can read its
 * database, so a pairing code would prove nothing — and `chips pair --issue` then asks the
 * server for codes with that device. Withdraw the device, as anyone tidying the list might, and
 * the server's own machine could no longer mint a code for a phone, though the person at it could
 * still read every key in the database. This closes that gap the same way the first pairing was
 * justified: a secret made at every start and written owner-only beside the database. Being able
 * to read it is being able to read the workspace, and that is what issuing a code takes.
 *
 * It is a file rather than a socket or a flag because a file is what the database already is:
 * the same directory, the same permissions, the same answer to "who can read this".
 */

import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ChipsConfig } from "@chipschat/platform";

/**
 * The file's name, under the data directory, with the port in it.
 *
 * The port is there because two servers can share one data directory — a scratch `chips serve`
 * started beside the long-running one, which has happened here more than once — and they cannot
 * share a port. One name for both means the second writes its token over the first's, and the
 * first is still answering with a token no longer on disk: its own machine can no longer ask it
 * for a pairing code, for as long as it runs. A name per port cannot collide, because a port
 * cannot be bound twice.
 */
export function operatorTokenFile(port: number): string {
  return `operator.${port}.token`;
}

/** The header the token travels in, on `POST /v1/operator/pairing-code`. */
export const OPERATOR_HEADER = "x-chips-operator";

/** Where a running server leaves its token: beside the database, for the CLI on this machine. */
export function operatorTokenPath(config: Pick<ChipsConfig, "data" | "server">): string {
  return join(config.data.dir, operatorTokenFile(config.server.port));
}

/** Thirty-two random bytes, base64url: the same strength as a device key, made once per start. */
export function newOperatorToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Written owner-only, in a directory that is too, like the CLI's own credential. */
export function writeOperatorToken(path: string, token: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/**
 * Taken away when the server stops — but only when the file still holds the token *this* server
 * wrote. A second, short-lived `chipsd` sharing the data directory (the two-servers-one-directory
 * hazard) must not delete the token a long-running server is still answering with: so a file that
 * says something else, or is already gone, is left exactly as it is. A stale token is harmless
 * anyway — nothing answers the port it names — and orphaning the live one is not.
 */
export function removeOperatorToken(path: string, written: string): void {
  try {
    if (readFileSync(path, "utf8").trim() === written) rmSync(path, { force: true });
  } catch {
    // No file, or one this process cannot read: there is nothing of ours to take away.
  }
}

/** The token a server left here, or nothing — no server of this user's is running from here. */
export function readOperatorToken(path: string): string | undefined {
  try {
    const token = readFileSync(path, "utf8").trim();
    return token === "" ? undefined : token;
  } catch {
    return undefined;
  }
}
