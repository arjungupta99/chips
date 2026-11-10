/**
 * The server, as the people paired to it see it, and the gallery a person picks an agent from
 * (ADRs 0170, 0171).
 *
 * - **`GET /v1/server`** says which machine Chips runs on ("Arjun's Mac mini"), its version, and
 *   how far it reaches: the welcome and the setup card say it.
 * - **`GET /v1/connectors`** hands out the gallery's cards. They are docs content: each connector
 *   lives with its harness (ADR 0051), and the docs say what each is and how it connects. The
 *   server reads the docs' `connectors.json` from wherever it was told (`CHIPS_CONNECTORS`) and
 *   passes it on. Chips names no harness itself, so with nothing to read the gallery is the two
 *   ways in the apps carry: your own harness, and anything with HTTP.
 *
 * A card's `command` and `sentence` carry `{link}` where a join link (ADR 0122) goes:
 * `fillLink` puts it there. The sentence is what a person pastes into the chat where they already
 * talk to their agent, so that the agent connects itself.
 */

import { z } from "zod";

/** What `{link}` is spelled as in a card's command and sentence. */
export const LINK_SLOT = "{link}";

/** A connector's line or sentence with the link in it. */
export function fillLink(template: string, link: string): string {
  return template.split(LINK_SLOT).join(link);
}

const words = (most: number) => z.string().trim().min(1).max(most);

/** How a connector is brought in, which decides what its card offers. */
export const connectorKind = z
  .enum(["one-line", "sdk", "http", "guide"])
  .describe(
    "`one-line`: a command to run where the harness runs; `sdk`: code on @chipschat/harness; `http`: a key and curl lines; `guide`: a page to follow.",
  );
export type ConnectorKind = z.infer<typeof connectorKind>;

export const connector = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
      .describe("The docs' name for it, lower case."),
    name: words(60).describe("What a person calls it."),
    line: words(120).describe("One line under the name: where it runs, what it needs."),
    needs: words(120)
      .optional()
      .describe(
        'What has to be on the computer first, said after "You need": its harness installed and running as its bridge needs. Chips for Mac says it under Connect.',
      ),
    program: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{0,40}$/)
      .optional()
      .describe(
        "The agent's own command, as a person runs it: Chips for Mac looks for it, to say the agent is on this Mac (ADR 0288).",
      ),
    whose: words(200)
      .optional()
      .describe(
        "Who makes the agent and where what a person sends it goes, in whole sentences, said beside its way in (ADR 0288).",
      ),
    terms: z
      .url({ protocol: /^https?$/ })
      .optional()
      .describe("Its maker's own terms or licence."),
    kind: connectorKind,
    command: words(400)
      .optional()
      .describe("What to run where the harness runs, with `{link}` where the link goes."),
    sentence: words(600)
      .optional()
      .describe("What to say to the agent so it connects itself, with `{link}` in it."),
    package: z
      .string()
      .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d{1,4}$/)
      .optional()
      .describe(
        "The npm package its bridge is published as and the major that speaks this server's protocol, `@chipschat/hermes@1`: `chips connect <id>` fetches the newest release of that major (ADR 0218).",
      ),
    args: z
      .array(z.string().regex(/^[^-\s][^\s]{0,199}$/))
      .max(4)
      .optional()
      .describe(
        "What `chips connect <id>` passes its bridge before the link is used, a config's path for one: `~/Chips/.bridges/acp/codex.json` (ADR 0283).",
      ),
    capabilities: z
      .array(z.string().regex(/^[a-z][a-z_]{0,39}$/))
      .max(16)
      .optional()
      .describe(
        "What its connector needs to do its job (ADR 0046): a link made from the card starts with these on.",
      ),
    docs: z
      .url({ protocol: /^https?$/ })
      .optional()
      .describe("Its page in the docs."),
    published: z
      .boolean()
      .optional()
      .describe("False while its command can't be run by somebody outside yet."),
  })
  .describe("A card in the gallery a person brings an agent from (ADR 0171).");
export type Connector = z.infer<typeof connector>;

/** The most cards the gallery shows: the docs are a list, not a store. */
export const CONNECTORS_MAX = 24;

/**
 * The cards in a `connectors.json`, keeping each that reads and leaving out each that doesn't: a
 * bad entry in the docs costs that card, never the gallery. Nothing that isn't a list is nothing.
 */
export function readConnectors(raw: unknown): Connector[] {
  const list = Array.isArray(raw)
    ? raw
    : raw !== null &&
        typeof raw === "object" &&
        Array.isArray((raw as { connectors?: unknown }).connectors)
      ? (raw as { connectors: unknown[] }).connectors
      : [];
  const kept: Connector[] = [];
  const seen = new Set<string>();
  for (const each of list) {
    const read = connector.safeParse(each);
    if (!read.success || seen.has(read.data.id)) continue;
    seen.add(read.data.id);
    kept.push(read.data);
    if (kept.length === CONNECTORS_MAX) break;
  }
  return kept;
}

export const connectorsAnswer = z
  .object({
    connectors: z.array(connector).max(CONNECTORS_MAX),
    read_at: z
      .string()
      .optional()
      .describe("When the server last read them, as an ISO timestamp. Absent: never."),
  })
  .describe("`GET /v1/connectors`: the gallery's cards, from the docs.");
export type ConnectorsAnswer = z.infer<typeof connectorsAnswer>;

export const serverFacts = z
  .object({
    machine: words(120).describe("The machine Chips runs on, as its owner named it."),
    version: z.string(),
    public_url: z.url({ protocol: /^https?$/ }).describe("Where another device reaches it."),
    relay: z.object({
      url: z.string().nullable(),
      status: z.string().describe("`off`, `connecting`, `connected` …, as `/v1/health` says it."),
    }),
  })
  .describe("`GET /v1/server`: the server, as the people paired to it see it (ADR 0170).");
export type ServerFacts = z.infer<typeof serverFacts>;
