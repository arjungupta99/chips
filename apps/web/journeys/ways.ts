/**
 * What a harness does on the other ways in (ADR 0122), as the docs tell a person to do it: the four
 * lines `chips join` prints, the hello a harness in any language says with `curl`, and a device
 * that asks to pair with nothing but its public key.
 */

import { generateKeyPairSync } from "node:crypto";

/** The four lines, as a harness finds them in its environment. */
export type FourLines = Record<
  "CHIPS_URL" | "CHIPS_HARNESS_ID" | "CHIPS_HARNESS_TOKEN" | "CHIPS_SPACE_ID",
  string
>;

/** The `export NAME='value'` lines `chips join` printed, read back as a shell would. */
export function exportsOf(printed: string): Record<string, string> {
  const lines: Record<string, string> = {};
  for (const line of printed.split("\n")) {
    const found = /^export ([A-Z_]+)='(.*)'$/.exec(line);
    if (found?.[1] !== undefined) lines[found[1]] = (found[2] ?? "").replaceAll("'\\''", "'");
  }
  return lines;
}

/** What `/v1/join/redeem` answers a harness, as the four lines. */
export function linesOf(answer: Record<string, unknown>): FourLines {
  return {
    CHIPS_URL: String(answer["url"]),
    CHIPS_HARNESS_ID: String(answer["harness_id"]),
    CHIPS_HARNESS_TOKEN: String(answer["token"]),
    CHIPS_SPACE_ID: String(answer["space_id"]),
  };
}

/** "Say hello" from the custom-harness guide, word for word but for what it says. */
export function helloLine(text: string): string {
  return [
    'curl -s -X POST "$CHIPS_URL/v1/harnesses/$CHIPS_HARNESS_ID/events" \\',
    '  -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" -H "Content-Type: application/json" \\',
    `  -d "{\\"type\\":\\"message.post\\",\\"space_id\\":\\"$CHIPS_SPACE_ID\\",\\"text\\":\\"${text}\\",\\"idempotency_key\\":\\"hello-1\\"}"`,
  ].join("\n");
}

/** What a harness may do, as Chips tells the harness itself. */
export async function capabilitiesOf(lines: FourLines): Promise<readonly string[] | null> {
  const answer = await fetch(`${lines.CHIPS_URL}/v1/participants`, {
    headers: { authorization: `Bearer ${lines.CHIPS_HARNESS_TOKEN}` },
  });
  if (answer.status !== 200) throw new Error(`participants answered ${answer.status}`);
  const { participants } = (await answer.json()) as {
    participants: { id: string; capabilities?: string[] | null }[];
  };
  const me = participants.find((each) => each.id === lines.CHIPS_HARNESS_ID);
  if (me === undefined) throw new Error("The harness is not among its own participants.");
  return me.capabilities ?? null;
}

export interface DeviceAsk {
  readonly request_id: string;
  readonly secret: string;
  readonly code: string;
}

/** A device with a key of its own asks to pair, from this machine. */
export async function askAsDevice(url: string, name: string): Promise<DeviceAsk> {
  const { publicKey } = generateKeyPairSync("ed25519");
  const answer = await fetch(`${url}/v1/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "device",
      name,
      public_key: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    }),
  });
  if (answer.status !== 201) {
    throw new Error(`A device's ask was answered ${answer.status}: ${await answer.text()}`);
  }
  return (await answer.json()) as DeviceAsk;
}

/** One poll of a request, as its requester polls it. */
export async function poll(
  url: string,
  ask: Pick<DeviceAsk, "request_id" | "secret">,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await fetch(`${url}/v1/join/${ask.request_id}/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: ask.secret }),
  });
  return { status: answer.status, body: (await answer.json()) as Record<string, unknown> };
}
