#!/usr/bin/env node
/**
 * `chipsd`. Three commands: `migrate`, `serve`, and `upgrade`, which moves what is there onto a
 * new shape by appending events (`upgrade agents`, ADR 0087).
 *
 * This is the interfaces layer: it reads configuration, wires adapters, prints, and shuts down
 * cleanly. Everything it looks like it is doing happens in a use case or an adapter.
 */

import { createLogger, exitOnUncaught, loadConfig } from "@chipschat/platform";
import { describeNames, describeOneRoom, describePlan } from "../src/application/index.js";
import { buildGateway, macAppHere, migrateToLatest, openDatabase } from "../src/index.js";

const COMMANDS = ["migrate", "serve", "upgrade", "help"] as const;
type Command = (typeof COMMANDS)[number];

function usage(): string {
  return [
    "chipsd — the Chips server",
    "",
    "Usage:",
    "  chipsd migrate    bring the database up to date",
    "  chipsd serve      run the gateway",
    "  chipsd upgrade agents [--apply]",
    "  chipsd upgrade one-room [--apply]",
    "  chipsd upgrade names [--apply]",
    "                    give every harness in a space its agent (ADR 0087), settle agents in",
    "                    more than one space, or number agents that share a name (ADR 0091):",
    "                    prints the plan, and appends it only with --apply. Run twice, it adds",
    "                    nothing.",
    "  chipsd help       this message",
    "",
    "Configuration comes from a file and the environment; see packages/platform/src/config.",
  ].join("\n");
}

async function main(): Promise<number> {
  const command = (process.argv[2] ?? "help") as Command;

  if (command === "help" || !COMMANDS.includes(command)) {
    console.log(usage());
    return command === "help" ? 0 : 1;
  }

  const config = loadConfig();
  if (!config.ok) {
    console.error(config.error.message);
    return 1;
  }

  const logger = createLogger({
    level: config.value.log.level,
    pretty: config.value.log.pretty,
    name: "chipsd",
  });
  // A throw nobody caught ends the process after one line saying what, so its service manager
  // starts a clean one (SEC-17).
  exitOnUncaught(logger);
  const connection = openDatabase({ databaseUrl: config.value.data.databaseUrl });

  if (command === "migrate" || command === "upgrade") {
    try {
      return command === "migrate"
        ? await migrate(connection.db, logger)
        : await upgrade(connection.db, config.value, logger);
    } finally {
      await connection.close();
    }
  }

  // `serve` migrates first: a server that starts against a database it cannot read is a worse
  // failure than one that takes a moment longer to come up.
  await migrateToLatest(connection.db);

  const gateway = buildGateway({
    config: config.value,
    db: connection.db,
    logger,
    // Chips for Mac on this machine, opened for the owner's ask when theirs isn't (ADR 0227).
    macApp: macAppHere({ devMode: config.value.devMode, logger }),
  });
  await gateway.listen();

  if (config.value.devMode) {
    // Where another device reaches this server, not the host it bound: `0.0.0.0` is every
    // address and none, and `demo.json` is read by the browser tests and typed into a phone.
    const demo = await gateway.bootstrapDemo(gateway.deps.reachableUrl());
    console.log(
      [
        "",
        "  Dev mode. A demo workspace is ready:",
        "",
        `    space   ${demo.spaceId}`,
        `    harness          ${demo.harness.displayName} (${demo.harness.id})`,
        `    pairing code   ${demo.pairingCode}`,
        `    details        ${demo.path}`,
        "",
        `  Open ${webUrl(gateway.deps.reachableUrl())} and pair with the code above.`,
        "  To talk to a harness, connect one: Add harness in the app, or `pnpm chips connect custom`.",
        "",
      ].join("\n"),
    );
  }

  // The process is safe to kill at any moment because the event log is the truth; draining is
  // a courtesy to whoever is connected, not a correctness requirement.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await gateway.close();
    await connection.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Hold the process open; the server's handles do that on their own.
  return new Promise<number>(() => {});
}

/** `chipsd migrate`: the database brought up to date, and what that took. */
async function migrate(
  db: ReturnType<typeof openDatabase>["db"],
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  const result = await migrateToLatest(db);
  if (result.applied.length === 0) {
    logger.info({ alreadyApplied: result.alreadyApplied.length }, "database is up to date");
  } else {
    logger.info({ applied: result.applied }, "migrations applied");
  }
  return 0;
}

/**
 * `chipsd upgrade agents [--apply]`: the plan for every workspace, and with `--apply` the events.
 * It writes to the log beside a server that may be running, which is built for one process:
 * restart the server straight after, so every client reads the new events and shape.
 */
async function upgrade(
  db: ReturnType<typeof openDatabase>["db"],
  config: Parameters<typeof buildGateway>[0]["config"],
  logger: ReturnType<typeof createLogger>,
): Promise<number> {
  const what = process.argv[3];
  if (what !== "agents" && what !== "one-room" && what !== "names") {
    console.error(
      "chipsd upgrade: say what to upgrade. `chipsd upgrade agents|one-room|names [--apply]`.",
    );
    return 1;
  }
  const apply = process.argv.includes("--apply");
  await migrateToLatest(db);
  const gateway = buildGateway({ config, db, logger });
  const workspaces = await db.selectFrom("workspaces").select("id").orderBy("id").execute();
  if (what === "one-room") return oneRoom(gateway, workspaces, apply);
  if (what === "names") return names(gateway, workspaces, apply);
  for (const { id } of workspaces) {
    if (apply) {
      const done = await gateway.deps.upgradeAgents.apply(id);
      console.log(
        `Workspace ${id}: appended ${done.appended} events.\n${describePlan(done.plan)}\n`,
      );
    } else {
      const plan = await gateway.deps.upgradeAgents.plan(id);
      console.log(`Workspace ${id} (dry run; nothing appended):\n${describePlan(plan)}\n`);
    }
  }
  if (!apply) console.log("Nothing was changed. Run again with --apply to append these events.");
  else console.log("Done. Restart the server, so every client reads the new events.");
  return 0;
}

/**
 * `chipsd upgrade one-room [--apply]` (ADR 0087, Phase 4): every agent still in an archived room,
 * or in more than one open room, and what settles it. The same caution as `agents`: restart the
 * server straight after an apply.
 */
async function oneRoom(
  gateway: ReturnType<typeof buildGateway>,
  workspaces: readonly { id: string }[],
  apply: boolean,
): Promise<number> {
  for (const { id } of workspaces) {
    if (apply) {
      const done = await gateway.deps.upgradeOneRoom.apply(id);
      console.log(
        `Workspace ${id}: appended ${done.appended} events.\n${describeOneRoom(done.plan)}\n`,
      );
    } else {
      const plan = await gateway.deps.upgradeOneRoom.plan(id);
      console.log(`Workspace ${id} (dry run; nothing appended):\n${describeOneRoom(plan)}\n`);
    }
  }
  if (!apply) console.log("Nothing was changed. Run again with --apply to append these events.");
  else console.log("Done. Restart the server, so every client reads the new events.");
  return 0;
}

/**
 * `chipsd upgrade names [--apply]` (ADR 0091): every agent that shares its name with another agent
 * or a person, and the number it is given. The same caution as `agents`: restart the server
 * straight after an apply, so every socket reads the names again.
 */
async function names(
  gateway: ReturnType<typeof buildGateway>,
  workspaces: readonly { id: string }[],
  apply: boolean,
): Promise<number> {
  for (const { id } of workspaces) {
    if (apply) {
      const done = await gateway.deps.upgradeNames.apply(id);
      console.log(
        `Workspace ${id}: appended ${done.appended} events.\n${describeNames(done.plan)}\n`,
      );
    } else {
      const plan = await gateway.deps.upgradeNames.plan(id);
      console.log(`Workspace ${id} (dry run; nothing appended):\n${describeNames(plan)}\n`);
    }
  }
  if (!apply) console.log("Nothing was changed. Run again with --apply to append these events.");
  else console.log("Done. Restart the server, so every client reads the new names.");
  return 0;
}

/**
 * The dev server sits on 5173 beside chipsd. The host is whichever one another device can
 * reach, so a laptop told to open this line opens something.
 */
function webUrl(serverUrl: string): string {
  try {
    return `http://${new URL(serverUrl).hostname}:5173`;
  } catch {
    return "http://127.0.0.1:5173";
  }
}

process.exitCode = await main();
