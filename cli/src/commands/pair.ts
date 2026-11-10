/**
 * `chips pair --issue` — a pairing code for another device, from this one.
 *
 * `chips serve` prints one code and the first device takes it. The desktop app on a laptop, the
 * CLI on the server itself, a phone: each needs a code of its own, and once this machine is
 * paired it can ask the server for one — for the person it is paired as, since that is who the
 * new device will speak as. It prints the code and the same code as a QR, addressed where the
 * server says it answers, because a QR that says `127.0.0.1` opens on exactly one device.
 *
 * On the machine that runs the server there is a second door (ADR 0048): the server leaves a
 * token beside its database that only its own user can read, and that token issues a code for
 * the workspace's first person whether or not this machine's device is still welcome. So
 * withdrawing the CLI's device from the list — tidying up — does not take the phone's way in
 * with it, and a machine that was never paired as a device can still pair a phone.
 */

import { networkUrl } from "@chipschat/platform";
import { pairingCode, pairingCodeTyped, phonePairingUrl } from "@chipschat/protocol";
import { OPERATOR_HEADER, readOperatorToken } from "@chipschat/server";
import { serverAddress } from "../args.js";
import { type CliDevice, call, loadDevice, PairingError } from "../device.js";
import { type Console, facts, heading } from "../output.js";
import { qr } from "./serve.js";

/** The server this machine runs, when it does: where it answers here, and where its token is. */
export interface OperatorServer {
  readonly serverUrl: string;
  readonly tokenPath: string;
}

export interface IssueOptions {
  readonly console: Console;
  readonly device?: CliDevice | undefined;
  /** The server on this machine, if any: a code when the device cannot ask (ADR 0048). */
  readonly operator?: OperatorServer | undefined;
  /**
   * Ask the server here with its own token before this machine's device. `chips up` does: the
   * code is for the server it just started or found, and the device may be paired to another.
   */
  readonly operatorFirst?: boolean | undefined;
  /** The address another device could reach the server at. Injected by the tests. */
  readonly lan?: (port: number) => string | undefined;
  readonly now?: () => number;
}

export interface IssuedCode {
  readonly code: string;
  readonly expiresAt: string;
  /** The address the QR carries. */
  readonly url: string;
  /** The relay and the server's key beside it, when the server has a relay (M4.1). */
  readonly relay: string | undefined;
  readonly serverKey: string | undefined;
}

/** What every door that issues a code answers with. */
interface CodeOnTheWire {
  code: string;
  expires_at: string;
  server_url?: string | null;
  relay?: string | null;
  server_key?: string | null;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * A code for another device, printed nowhere: `chips up` asks for one for the browser it opens
 * and one for the phone's QR, and says what it says itself.
 */
export async function requestPairingCode(
  options: Omit<IssueOptions, "console">,
): Promise<IssuedCode & { readonly note: string | undefined }> {
  const first = options.operatorFirst === true ? await fromTheServer(options.operator) : undefined;
  const asked =
    first ??
    (await askForCode(
      options.device === undefined ? loadDevice() : options.device,
      options.operator,
    ));
  const { issued } = asked;
  // The server's own address when it gives one: it knows what it bound and what it was told to
  // advertise, and this machine is only guessing. The guess stays for a server without the field.
  const url = issued.server_url ?? reachable(asked.serverUrl, options.lan ?? networkUrl);
  return {
    code: issued.code,
    expiresAt: issued.expires_at,
    url,
    relay: issued.relay ?? undefined,
    serverKey: issued.server_key ?? undefined,
    note: asked.note,
  };
}

export async function issuePairingCode(options: IssueOptions): Promise<IssuedCode> {
  const { console: out } = options;
  const asked = await requestPairingCode(options);
  const { url, relay, serverKey } = asked;
  const issued = { code: asked.code, expires_at: asked.expiresAt };
  const minutes = Math.max(
    1,
    Math.round((Date.parse(issued.expires_at) - (options.now ?? Date.now)()) / 60_000),
  );

  out.out(heading("Pair another device"));
  out.out(
    facts([
      ["code", issued.code],
      ["good for", `${minutes} minute${minutes === 1 ? "" : "s"}, once`],
      ["server", url],
      ...(relay === undefined ? [] : ([["relay", relay]] as const)),
    ]),
  );
  if (asked.note !== undefined) out.out(`\n  ${asked.note}`);
  if (relay === undefined && isLoopback(url)) {
    // A QR for 127.0.0.1 opens on exactly one device, and it isn't the phone (the onboarding
    // audit, item 29): the code is for another browser or `chips pair` on this machine.
    out.out(
      [
        "",
        "  Only this machine can reach this Chips, so a phone can't use the code. Type it in a",
        "  browser or `chips pair` here, or let a phone in: `chips up --reach lan` for this",
        "  Wi-Fi, or `chips up --reach relay` for anywhere.",
        "",
      ].join("\n"),
    );
  } else {
    out.out(
      "\n  On a phone, scan this with its camera. Or type the code and the address in Chips:\n",
    );
    out.out(await qr(phonePairingUrl(url, issued.code, { relay, key: serverKey })));
    out.out("");
  }
  return { code: issued.code, expiresAt: issued.expires_at, url, relay, serverKey };
}

function isLoopback(url: string): boolean {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The default server for `chips pair`: the one on this machine. */
export const PAIR_DEFAULT_SERVER = "http://127.0.0.1:4431";

/**
 * What `chips pair` was asked: the code, wherever it stands among the words, and the server, from
 * `--server` or a word that is an address. A code is read as `pairingCodeTyped` reads one, so
 * `abc234` is `ABC-234`. Or what was wrong.
 */
export function pairingAsked(
  words: readonly string[],
  server: string | undefined,
): { ok: true; code: string; server: string } | { ok: false; problem: string } {
  const address = words.find((word) => /^https?:\/\//i.test(word));
  const rest = words.filter((word) => word !== address);
  const typed = rest[0];
  if (typed === undefined) {
    return {
      ok: false,
      problem:
        "Give the pairing code: `chips pair ABC-234 --server <address>`, or `chips pair --issue` for one.",
    };
  }
  const code = pairingCodeTyped(typed);
  if (!pairingCode.safeParse(code).success) {
    return {
      ok: false,
      problem: `\`${typed}\` isn't a pairing code. A code is six letters and digits, like ABC-234.`,
    };
  }
  const given = server ?? address ?? PAIR_DEFAULT_SERVER;
  const url = serverAddress(given);
  if (url === undefined) {
    return {
      ok: false,
      problem: `\`${given}\` isn't a server's address, like http://192.168.1.20:4431.`,
    };
  }
  return { ok: true, code, server: url };
}

/** A pairing that failed, in words: the server's own, or that nothing answered. */
export function pairingFailed(failure: unknown, server: string): string {
  if (failure instanceof PairingError) return failure.message;
  if (failure instanceof TypeError) {
    return [
      `Nothing answered at ${server}.`,
      server === PAIR_DEFAULT_SERVER
        ? "Chips isn't running on this machine: `chips up` starts it, or give `--server <address>` for one elsewhere."
        : "Check the address, and that Chips is running there and this machine is on its network.",
    ].join(" ");
  }
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * The code, from whichever door is open: this machine's device first, since that is a person
 * asking as themselves; the server's own token when the device cannot ask — because it was
 * withdrawn, or because this machine never had one — and the server is here to be asked.
 */
async function askForCode(
  device: CliDevice | undefined,
  operator: OperatorServer | undefined,
): Promise<{ issued: CodeOnTheWire; serverUrl: string; note: string | undefined }> {
  const viaDevice = await fromDevice(device);
  if (viaDevice.issued !== undefined) {
    return { issued: viaDevice.issued, serverUrl: viaDevice.serverUrl, note: undefined };
  }
  const token = operator === undefined ? undefined : readOperatorToken(operator.tokenPath);
  if (token === undefined || operator === undefined) {
    // No token to fall back to: pass a refused device's own words on, else say it is not paired.
    if (viaDevice.turnedAway !== undefined) throw new Error(viaDevice.turnedAway);
    throw new Error(
      "This machine is not paired yet. Run `chips up` to start Chips here, or `chips pair <code>` with a code from the Chips you use.",
    );
  }
  const issued = await askTheServerItself(operator, token);
  return {
    issued,
    serverUrl: operator.serverUrl,
    note:
      viaDevice.turnedAway === undefined
        ? "This machine has no device of its own; the code comes from the server itself, which runs here."
        : `This machine's own device was turned away (${viaDevice.turnedAway}), so the code comes from the server itself, which runs here.`,
  };
}

/** The code from the server here, by its own token, when it is here and its token can be read. */
async function fromTheServer(
  operator: OperatorServer | undefined,
): Promise<{ issued: CodeOnTheWire; serverUrl: string; note: undefined } | undefined> {
  const token = operator === undefined ? undefined : readOperatorToken(operator.tokenPath);
  if (operator === undefined || token === undefined) return undefined;
  const issued = await askTheServerItself(operator, token);
  return { issued, serverUrl: operator.serverUrl, note: undefined };
}

/**
 * The code from this machine's own device, when it has one the server still trusts. Otherwise
 * why not: `turnedAway` carries the server's words when the device was refused, and is undefined
 * when there was no device to ask — the caller tells those two apart.
 */
async function fromDevice(
  device: CliDevice | undefined,
): Promise<{ issued?: CodeOnTheWire; serverUrl: string; turnedAway?: string }> {
  if (device === undefined) return { serverUrl: "" };
  try {
    const issued = await call<CodeOnTheWire>(device, "POST", "/v1/pairing-codes");
    return { issued, serverUrl: device.serverUrl };
  } catch (error) {
    return {
      serverUrl: device.serverUrl,
      turnedAway: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The operator's door: the token the server left beside its database, and nothing else. */
async function askTheServerItself(operator: OperatorServer, token: string): Promise<CodeOnTheWire> {
  const response = await fetch(`${operator.serverUrl}/v1/operator/pairing-code`, {
    method: "POST",
    headers: { [OPERATOR_HEADER]: token },
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(
      failure.error?.message ?? `The server at ${operator.serverUrl} answered ${response.status}.`,
    );
  }
  return (await response.json()) as CodeOnTheWire;
}

/**
 * The server as another device would name it, for a server that does not say: this machine's
 * network address, which is right only when the server is this machine.
 */
function reachable(serverUrl: string, lan: (port: number) => string | undefined): string {
  const parsed = new URL(serverUrl);
  if (!LOOPBACK.has(parsed.hostname)) return serverUrl;
  const port = parsed.port === "" ? 80 : Number(parsed.port);
  return lan(port) ?? serverUrl;
}
