/**
 * The journeys' test connector (install plan §3.9, ADR 0122): a harness on `@chipschat/harness` that
 * joins by the link a person made, connects, and says hello — about as long as a person's own
 * first connector is. Its key is kept under the journey's home, so a run after a restart asks
 * nothing, and an uninstall takes it with the rest.
 */

import { type Chips, connect, join } from "@chipschat/harness";

export interface Connected {
  readonly chips: Chips;
  readonly harnessId: string;
  readonly spaceId: string;
}

export async function connector(link: string, home: string, hello: boolean): Promise<Connected> {
  const me = await join({
    link,
    name: "Journey agent",
    software: "journey-agent 1.0",
    env: { HOME: home, CHIPS_NO_KEYCHAIN: "true" },
  });
  if (me.spaceId === undefined) throw new Error("Chips gave the agent no room to speak in.");
  const chips = await connect({ ...me, client: { name: "journey-agent", version: "1.0.0" } });
  if (hello) await chips.post({ spaceId: me.spaceId, text: "Hello from the journey agent." });
  return { chips, harnessId: me.harnessId, spaceId: me.spaceId };
}
