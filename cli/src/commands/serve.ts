/**
 * `chips serve` — the server, and everything a person needs to reach it.
 *
 * Starting the process is `chipsd`'s job and this does not duplicate it: it migrates, listens,
 * and then does the three things M2.1 asks for on top. It makes sure there is a workspace to
 * pair with, which on a clean machine there is not. It prints a pairing code and the same code
 * as a QR, because the pairing screen takes either and a phone camera takes only one of them.
 * And it advertises over mDNS so the desktop app finds this machine without being told where it
 * is.
 *
 * The pairing code is short-lived and single-use (ADR 0006) and is printed rather than written
 * anywhere: it is a capability, and the terminal it was printed in is the one place it belongs.
 */

import { hostname } from "node:os";
import {
  accountName,
  type ChipsConfig,
  createLogger,
  exitOnUncaught,
  fileDestination,
  firstName,
  machineName,
  networkUrl,
} from "@chipschat/platform";
import { FIRST_PERSON_NAME, type PairingOffer, pairingUrl } from "@chipschat/protocol";
import {
  buildGateway,
  type Gateway,
  macAppHere,
  migrateToLatest,
  openDatabase,
} from "@chipschat/server";
import QRCode from "qrcode";
import { loadDevice, newDeviceKey, storeDevice } from "../device.js";
import { advertise as advertiseOverMdns } from "../discovery.js";
import { ensureWorkspace, type FirstRun, firstWorkspaceName } from "../first-run.js";
import { devicePath } from "../home.js";
import { type Console, facts, heading } from "../output.js";

export interface ServeOptions {
  readonly config: ChipsConfig;
  readonly console: Console;
  /** A name for this machine on the network. Defaults to the workspace's. */
  readonly name?: string | undefined;
  /** Print the code and stop, rather than holding the process open. Used by the tests. */
  readonly once?: boolean;
  /**
   * How this server announces itself. An adapter like any other (technical-plan 6.1): the
   * default is mDNS, and a test that is not about discovery passes something that binds no
   * socket, because 5353 is the one thing on the machine every test would be sharing.
   */
  readonly advertise?: typeof advertiseOverMdns;
  /** The address another device could reach this machine at. Injected by the tests. */
  readonly lan?: (port: number) => string | undefined;
  /** Where this machine's own credential lives. Injected by the tests. */
  readonly devicePath?: string;
  /**
   * Print the address, the code and the QR (the default). `chips up` says what it says itself,
   * and asks for codes as it needs them.
   */
  readonly announce?: boolean;
  /** A file for the server's log, instead of this process's stdout. */
  readonly logTo?: string | undefined;
  /** What `/v1/health` says this server is: the release's version. */
  readonly version?: string | undefined;
  /**
   * Whether this server opens Chips for Mac on this machine for the owner's ask when none of
   * theirs is open (ADR 0227's second addendum): `chips serve` and `chips up` say so; the tests
   * don't, so none opens the person's own app.
   */
  readonly opensMacApp?: boolean;
  /**
   * Whether the process ends, after saying why, on a throw nobody caught (SEC-17), so the login
   * service starts a clean one: `chips serve` and `chips up` say so; the tests don't, so a test's
   * stray rejection never ends the run.
   */
  readonly exitsOnUncaught?: boolean;
  /**
   * What a new workspace's first person is called. Absent, the account running Chips names them
   * (`firstName(accountName())`), else "You" (ADR 0170). A workspace that has a person keeps theirs.
   * A new workspace is called after them, "Ada's workspace" (ADR 0194).
   */
  readonly personName?: string | undefined;
}

export interface Serving {
  readonly url: string;
  readonly pairingCode: string;
  /** What the QR says: the address with the code, and the relay and key beside it (M4.1). */
  readonly pairingUrl: string;
  readonly workspaceId: string;
  /** Whether this run made the workspace, on a machine that had none. */
  readonly created: boolean;
  /** The device this machine was paired as, when this run paired it. */
  readonly pairedAs: string | undefined;
  /** The relay and the server's key a QR carries beside a code, when there is a relay. */
  readonly offer: PairingOffer;
  /** Another single-use code for the workspace's first person: the browser's, the phone's. */
  readonly issueCode: () => string | undefined;
  readonly stop: () => Promise<void>;
}

export async function serve(options: ServeOptions): Promise<Serving> {
  const { config } = options;
  const logger = loggerFor(config, options.logTo);
  if (options.exitsOnUncaught === true) exitOnUncaught(logger);
  const connection = openDatabase({ databaseUrl: config.data.databaseUrl });
  // Migrate before listening: a server that starts against a database it cannot read is a worse
  // failure than one that takes a moment longer to come up.
  await migrateToLatest(connection.db);

  const gateway = buildGateway({
    config,
    db: connection.db,
    logger,
    ...(options.version === undefined ? {} : { version: options.version }),
    macApp:
      options.opensMacApp === true ? macAppHere({ devMode: config.devMode, logger }) : undefined,
  });
  return await started(options, connection, gateway);
}

/** The server is built; make the workspace, listen, pair this machine, and say so. */
async function started(
  options: ServeOptions,
  connection: ReturnType<typeof openDatabase>,
  gateway: Gateway,
): Promise<Serving> {
  const { config, console: out } = options;
  const personName = options.personName ?? firstName(accountName()) ?? FIRST_PERSON_NAME;
  const first = await ensureWorkspace({
    db: connection.db,
    gateway,
    name: firstWorkspaceName(personName),
    personName,
  });
  const { port } = await gateway.listen();
  const host = config.server.host;
  const url = config.server.publicUrl ?? `http://${displayHost(host)}:${port}`;
  // A QR that names an address the server is not listening on is a QR that opens nothing: the
  // network address is offered only when the server is bound to it.
  const lan = isLoopback(host) ? undefined : (options.lan ?? networkUrl)(port);

  const codes = gateway.deps.pairingCodes;
  const code = codes?.issue({
    workspaceId: first.workspaceId,
    participantId: first.participantId,
  });

  const advertised = advertiseUnlessLoopback(options, host, port, first.workspaceId);

  const pairedAs = await pairThisMachine(gateway, first, url, options.devicePath ?? devicePath());
  // What a QR carries beside the code (M4.1, ADR 0038): the relay this server dials out to,
  // and the key a phone asks for it by and authenticates it with.
  const relay = config.relay.url;
  const offer: PairingOffer =
    relay === undefined ? {} : { relay, key: await gateway.deps.relay.publicKey() };
  if (options.announce !== false) {
    await announce(out, {
      first,
      url,
      lan,
      code: code?.code,
      loopback: isLoopback(host),
      pairedAs,
      offer,
    });
  }

  const stop = async () => {
    await advertised?.stop();
    await gateway.close();
    await connection.close();
  };

  if (options.once === true) await stop();
  return {
    url,
    pairingCode: code?.code ?? "",
    pairingUrl: pairingUrl(lan ?? url, code?.code ?? "", offer),
    workspaceId: first.workspaceId,
    created: first.created,
    pairedAs,
    offer,
    issueCode: () =>
      codes?.issue({ workspaceId: first.workspaceId, participantId: first.participantId }).code,
    stop,
  };
}

/** A server only this machine can reach does not tell the network it is there. */
function advertiseUnlessLoopback(
  options: ServeOptions,
  host: string,
  port: number,
  workspaceId: string,
) {
  if (isLoopback(host)) return undefined;
  // By the machine's name, so that two on one network are told apart and a phone lists this one
  // as its owner named it (ADR 0172).
  const machine = machineName();
  return (options.advertise ?? advertiseOverMdns)({
    name: options.name ?? `Chips on ${machine}`,
    port,
    workspaceId,
    version: "1",
    machine,
  });
}

/** Logs to stdout as configured, or to a file when `chips up` runs the server. */
function loggerFor(config: ChipsConfig, logTo: string | undefined) {
  return createLogger({
    level: config.log.level,
    pretty: config.log.pretty,
    name: "chips",
    ...(logTo === undefined ? {} : { destination: fileDestination(logTo) }),
  });
}

/**
 * The machine that runs the server is paired by construction. Whoever started it can read its
 * database, so a code would prove nothing; and this is the machine `chips connect` and
 * `chips pair --issue` are about to be run on. A device that is already here — paired with this
 * server or with another — is left exactly as it is.
 */
async function pairThisMachine(
  gateway: Gateway,
  first: FirstRun,
  serverUrl: string,
  path: string,
): Promise<string | undefined> {
  if (loadDevice(path) !== undefined) return undefined;
  const { pairingCodes, pairDevice } = gateway.deps;
  if (pairingCodes === undefined || pairDevice === undefined) return undefined;
  const key = newDeviceKey();
  const code = pairingCodes.issue({
    workspaceId: first.workspaceId,
    participantId: first.participantId,
    ttlSeconds: 60,
  });
  const paired = await pairDevice({
    code: code.code,
    publicKey: key.publicKey,
    name: `chips CLI on ${hostname().replace(/\.local$/, "")}`,
  });
  // The code is the operator's, asked of nobody, so it pairs at once (ADR 0232).
  if (!paired.ok || "waiting" in paired.value) return undefined;
  storeDevice(
    {
      deviceId: paired.value.deviceId,
      participantId: paired.value.participantId,
      workspaceId: paired.value.workspaceId,
      displayName: paired.value.displayName,
      serverUrl,
      privateKey: key.privateKey,
    },
    path,
  );
  return paired.value.deviceId;
}

/** What a person needs at the terminal: where it is, who they are, and how to pair. */
async function announce(
  out: Console,
  said: {
    readonly first: FirstRun;
    readonly url: string;
    readonly lan: string | undefined;
    readonly code: string | undefined;
    readonly loopback: boolean;
    readonly pairedAs: string | undefined;
    readonly offer: PairingOffer;
  },
): Promise<void> {
  const { first, url, lan, code, offer } = said;
  out.out(heading(first.created ? "A new workspace is ready" : "Chips is running"));
  out.out(
    facts([
      ["address", url],
      ...(lan === undefined ? [] : ([["on this network", lan]] as const)),
      ["workspace", first.workspaceId],
      ["you", `${first.displayName} (${first.participantId})`],
      [
        "this machine",
        said.pairedAs === undefined
          ? "has its device key already"
          : `paired now, as ${first.displayName}; \`chips connect\` works here`,
      ],
      [
        "discovery",
        said.loopback ? "not advertised: nothing else can reach it" : "advertised as _chips._tcp",
      ],
      ...(offer.relay === undefined
        ? []
        : ([
            ["relay", `${offer.relay} — a phone away from this network reaches it there`],
          ] as const)),
    ]),
  );
  if (code !== undefined) {
    out.out(`\n  Pair a device with this code, or scan it:\n\n    ${code}\n`);
    out.out(await qr(pairingUrl(lan ?? url, code, offer)));
  } else {
    out.out("\n  This server issues no pairing codes, so nothing new can join it.\n");
  }
  if (said.loopback) {
    out.out(
      "\n  Only this machine can reach it. To pair a phone or another computer, start it with",
    );
    out.out("  CHIPS_HOST=0.0.0.0 — see https://chipschat.ai/operate/mac-mini/.\n");
  }
}

const LOOPBACK: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1"]);

/** Bound to loopback, the server can be reached from this machine and nowhere else. */
function isLoopback(host: string): boolean {
  return LOOPBACK.has(host);
}

/** `0.0.0.0` is every address; the one to open in a browser on this machine is loopback. */
function displayHost(host: string): string {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

/** The code as a QR, indented to sit under the heading like everything else. */
export async function qr(text: string): Promise<string> {
  const drawn = await QRCode.toString(text, { type: "terminal", small: true, margin: 1 });
  return drawn
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}
