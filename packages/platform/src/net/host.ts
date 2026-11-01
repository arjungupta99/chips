/**
 * What this machine and the account running Chips are called, as a person would say them (ADR
 * 0170): "Arjun's Mac mini", not `Adas-Mac-mini-9.local`, and "Arjun", not `arjungupta`.
 *
 * The welcome says "Chips is running on Arjun's Mac mini", and the first person into a new
 * workspace is named from the account that started it, so that nobody has to type their own name
 * before they have seen anything. Each answer is asked of the system once, by whoever needs it,
 * and a system that won't say gets the plain fallback rather than an error: a name is a courtesy.
 */

import { execFileSync } from "node:child_process";
import { hostname, userInfo } from "node:os";

/** How a command is run, so a test can answer for the system. Throws when it fails. */
export type RunCommand = (command: string, args: readonly string[]) => string;

const run: RunCommand = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    timeout: 2000,
    stdio: ["ignore", "pipe", "ignore"],
  });

function asked(runCommand: RunCommand, command: string, args: readonly string[]): string {
  try {
    return runCommand(command, args).trim();
  } catch {
    return "";
  }
}

/**
 * The machine's name: on a Mac, the computer name from Sharing settings; elsewhere the host name,
 * without the `.local` mDNS adds.
 */
export function machineName(
  platform: string = process.platform,
  runCommand: RunCommand = run,
  host: () => string = hostname,
): string {
  const named = platform === "darwin" ? asked(runCommand, "scutil", ["--get", "ComputerName"]) : "";
  if (named !== "") return named;
  return host().replace(/\.local\.?$/, "") || "this computer";
}

/** The account Chips runs as, by its login name; nothing when the system won't say. */
function accountUser(): string | undefined {
  try {
    return userInfo().username;
  } catch {
    return undefined;
  }
}

/** The account's full name: `id -F` on a Mac, the passwd entry's comment on Linux. */
export function accountName(
  platform: string = process.platform,
  runCommand: RunCommand = run,
  user: string | undefined = accountUser(),
): string | undefined {
  if (platform === "darwin") return asked(runCommand, "id", ["-F"]) || undefined;
  if (user === undefined || user === "") return undefined;
  const entry = asked(runCommand, "getent", ["passwd", user]);
  // name:password:uid:gid:comment:home:shell, and the comment's first field is the full name.
  const comment = entry.split(":")[4]?.split(",")[0]?.trim() ?? "";
  return comment === "" ? undefined : comment;
}

/** What a person is first called: the first word of a full name, or nothing for none. */
export function firstName(full: string | undefined): string | undefined {
  const first = full?.trim().split(/\s+/)[0];
  return first === undefined || first === "" ? undefined : first.slice(0, 60);
}
