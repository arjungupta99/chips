/**
 * What `chips connect custom` has to say, because the harness is not here to be configured.
 *
 * A custom harness is whatever somebody wrote, running wherever they run it. The most `connect`
 * can do is register it, mint its token, and say the four things the harness needs — the same
 * four lines `chips conformance custom` prints and the Custom guide reads — once, with the
 * token in them. The token goes to the keychain as well, so `chips doctor` can check it and
 * `--rotate` can replace it; the copy the harness uses is the one in its own environment.
 */

import type { Console } from "../output.js";

export interface HarnessAddress {
  readonly url: string;
  readonly harnessId: string;
  readonly token: string;
  /** The direct space between the person and the harness, when one was opened. */
  readonly spaceId?: string | undefined;
}

/** The environment a harness reads. One line each, in the order the guides name them. */
export function environmentLines(address: HarnessAddress): string[] {
  return [
    `CHIPS_URL=${address.url}`,
    `CHIPS_HARNESS_ID=${address.harnessId}`,
    `CHIPS_HARNESS_TOKEN=${address.token}`,
    ...(address.spaceId === undefined ? [] : [`CHIPS_SPACE_ID=${address.spaceId}`]),
  ];
}

/** The one call that lights the Messages row: a message in the harness's own space. */
export const HELLO_LINES: readonly string[] = [
  'curl -s -X POST "$CHIPS_URL/v1/harnesses/$CHIPS_HARNESS_ID/events" \\',
  '  -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" -H "Content-Type: application/json" \\',
  '  -d "{\\"type\\":\\"message.post\\",\\"space_id\\":\\"$CHIPS_SPACE_ID\\",\\"text\\":\\"Hello from my harness\\",\\"idempotency_key\\":\\"hello-1\\"}"',
];

/** The address and the token, and the one thing to do with them. Printed by `connect` and `--rotate`. */
export function sayCustom(out: Console, address: HarnessAddress): void {
  out.out("\n  Put these in the harness's environment. The token is shown once:\n");
  for (const line of environmentLines(address)) out.out(`      ${line}`);
  out.out("");
  out.out(
    "  `CHIPS_URL` must be an address the harness's machine can reach; 127.0.0.1 is only right",
  );
  out.out("  when it runs beside the server.");
  if (address.spaceId !== undefined) {
    out.out("\n  Say hello from a terminal, and the Messages row on its card lights:");
    for (const line of HELLO_LINES) out.out(`      ${line}`);
  }
  out.out(
    "\n  It takes part in spaces as its agents: one named after it to begin with, and any it",
  );
  out.out("  registers itself (`POST /v1/harnesses/$CHIPS_HARNESS_ID/agents`), all on this token.");
}
