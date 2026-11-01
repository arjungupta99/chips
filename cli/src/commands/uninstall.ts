/**
 * `chips uninstall`: take an installed Chips off this machine (ADR 0121).
 *
 * It says what it will remove before it removes anything: the login service if `chips up` wrote
 * it, the install and the link on the PATH, and the harnesses' bridges `chips connect` fetched,
 * each stopped by its own `--stop` first (ADR 0218). The workspace is a separate question, asked
 * separately and answered no unless somebody says yes (`--remove-data`), because it holds every
 * message, file and key. A checkout has nothing installed, and is told so. Run through the link
 * Chips for Mac makes, it removes the service and the link but nothing inside the app, which is
 * for the Trash.
 */

import type { Machine } from "@chipschat/platform";
import type { Console } from "../output.js";
import type { Release } from "../release.js";
import {
  type Command,
  mayFail,
  serviceKind,
  servicePath,
  stateOf,
  stopCommands,
} from "../service.js";
import { tilde } from "./up.js";

export interface UninstallFlags {
  readonly yes: boolean;
  readonly removeData: boolean;
}

export interface UninstallDeps {
  readonly machine: Machine;
  readonly uid: number;
  readonly release: Release | undefined;
  /** Where `install.sh` put this release: its directory of versions, and the link to it. */
  readonly install: { readonly lib: string; readonly link: string | undefined } | undefined;
  /** The workspace, its logs, and the CLI's own credentials. */
  readonly data: readonly string[];
  /** The bridges `chips connect` fetched (`<data>/bridges`), and how to stop the ones kept running. */
  readonly bridges?: { readonly dir: string; readonly stop: () => Promise<void> } | undefined;
  readonly readFile: (path: string) => string | undefined;
  readonly exists: (path: string) => boolean;
  readonly remove: (path: string) => void;
  readonly run: (command: Command) => Promise<{ readonly ok: boolean; readonly output: string }>;
}

/** The Mac app this release is carried inside (`Chips.app/Contents/Resources/chips`), or nothing. */
export function appOf(release: Release | undefined): string | undefined {
  return release === undefined
    ? undefined
    : /^(.+\.app)\/Contents\/Resources\/chips\/?$/.exec(release.root)?.[1];
}

/** What uninstalling would remove, in the order it is removed: never a file inside an app. Pure. */
export function uninstallPlan(
  deps: UninstallDeps,
  removeData: boolean,
): {
  readonly service: string | undefined;
  readonly paths: readonly string[];
  readonly data: readonly string[];
} {
  const kind = serviceKind(deps.machine.platform);
  const file = kind === undefined ? undefined : servicePath(kind, deps.machine);
  const ours = file !== undefined && stateOf(deps.readFile(file)) === "ours";
  const install = deps.install;
  const bridges = deps.bridges?.dir;
  const app = appOf(deps.release);
  const paths = [
    ...(bridges !== undefined && deps.exists(bridges) ? [bridges] : []),
    ...(install?.link === undefined ? [] : [install.link]),
    ...(install === undefined ? [] : [install.lib]),
  ].filter((path) => app === undefined || (path !== app && !path.startsWith(`${app}/`)));
  return {
    service: ours ? file : undefined,
    paths,
    data: removeData ? deps.data.filter((path) => deps.exists(path)) : [],
  };
}

export async function uninstall(
  out: Console,
  flags: UninstallFlags,
  deps: UninstallDeps,
): Promise<boolean> {
  if (deps.release === undefined) {
    out.err("  This chips runs from a checkout; there is nothing installed to remove.");
    return false;
  }
  const plan = uninstallPlan(deps, true);
  const answer = await ask(out, flags, deps, plan);
  if (answer === "no") return false;
  const removeData = answer === "everything";

  // The bridges first, while the Node they stop on is still here.
  if (deps.bridges !== undefined && plan.paths.includes(deps.bridges.dir)) {
    await deps.bridges.stop();
  }
  if (plan.service !== undefined) await stopService(out, deps);
  if (plan.service !== undefined) deps.remove(plan.service);
  for (const path of plan.paths) deps.remove(path);
  if (removeData) for (const path of plan.data) deps.remove(path);

  sayDone(out, deps, removeData ? undefined : plan.data[0]);
  return true;
}

/** Done, and what is left: Chips for Mac, for the Trash, and the workspace when it was kept. */
function sayDone(out: Console, deps: UninstallDeps, kept: string | undefined): void {
  const app = appOf(deps.release);
  if (app === undefined) out.out("  ✓ Chips is uninstalled.");
  else {
    out.out("  ✓ Removed.");
    out.out(
      `  Chips for Mac is still at ${tilde(app, deps.machine)}. Drag it to the Trash to remove it.`,
    );
  }
  if (kept !== undefined) out.out(`  Your workspace is still at ${tilde(kept, deps.machine)}.`);
}

type Answer = "no" | "install" | "everything";

/** What to remove: say it, then ask, the install first and the workspace on its own. */
async function ask(
  out: Console,
  flags: UninstallFlags,
  deps: UninstallDeps,
  plan: ReturnType<typeof uninstallPlan>,
): Promise<Answer> {
  const show = (path: string) => `    ${tilde(path, deps.machine)}`;
  out.out("  This removes:");
  for (const path of [...(plan.service === undefined ? [] : [plan.service]), ...plan.paths]) {
    out.out(show(path));
  }
  if (!flags.yes && !(await out.confirm("  Remove Chips?"))) return "no";
  if (flags.removeData) return "everything";
  if (flags.yes || plan.data.length === 0) return "install";
  out.out(
    "  Your workspace is kept unless you say otherwise. It holds every message, file and key:",
  );
  for (const path of plan.data) out.out(show(path));
  return (await out.confirm("  Remove your workspace too?")) ? "everything" : "install";
}

async function stopService(out: Console, deps: UninstallDeps): Promise<void> {
  const kind = serviceKind(deps.machine.platform);
  for (const command of kind === undefined ? [] : stopCommands(kind, deps.uid)) {
    const ran = await deps.run(command);
    if (!ran.ok && !mayFail(command)) out.err(`  \`${command.join(" ")}\` failed; going on.`);
  }
}
