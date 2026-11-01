/**
 * `packaging/relay/`: the hosted relay's box. `cloud-init.yaml` carries copies of the files beside
 * it, because cloud-init can only write what it holds; this fails when a copy and its file drift
 * apart. And the few things the box's safety rests on, said once each: the relay listens on
 * loopback behind Caddy, its env file refuses to start it until it names a server, the journal
 * is kept seven days, as the relay's terms say, and the day's counts have a place to go.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "@chipschat/platform";
import { describe, expect, it } from "vitest";

const BOX = join(import.meta.dirname, "..", "..", "packaging", "relay");
const read = (name: string) => readFileSync(join(BOX, name), "utf8");

/** Where cloud-init writes each file on the box. */
const PLACES: Record<string, string> = {
  "/etc/systemd/system/chips-relay.service": "chips-relay.service",
  "/etc/chips-relay.env": "chips-relay.env",
  "/etc/chips-relay/Caddyfile": "Caddyfile",
  "/etc/systemd/journald.conf.d/chips-relay.conf": "journald.conf",
};

/** The literal block that starts after line `at`: the lines indented six, less the six. */
function blockAfter(lines: readonly string[], at: number): string {
  const body: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line !== "" && !line.startsWith("      ")) break;
    body.push(line.slice(6));
  }
  while (body.at(-1) === "") body.pop();
  return `${body.join("\n")}\n`;
}

/**
 * Each `write_files` entry's path and content, read as YAML reads a literal block indented six
 * spaces under `content: |`: the lines below it, less the six, up to the first line indented less.
 */
function writtenFiles(yaml: string): Map<string, string> {
  const files = new Map<string, string>();
  const lines = yaml.split("\n");
  let path: string | undefined;
  lines.forEach((line, at) => {
    path = /^ {2}- path: (\S+)$/.exec(line)?.[1] ?? path;
    if (line === "    content: |" && path !== undefined) files.set(path, blockAfter(lines, at));
  });
  return files;
}

/** The unit's `Environment=` lines and its env file, as the relay's configuration reads them. */
function environmentOf(unit: string, env: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  const set = (line: string) => {
    const at = line.indexOf("=");
    if (at > 0) pairs[line.slice(0, at)] = line.slice(at + 1);
  };
  for (const line of unit.split("\n")) {
    if (line.startsWith("Environment=")) set(line.slice("Environment=".length));
  }
  for (const line of env.split("\n")) if (line !== "" && !line.startsWith("#")) set(line);
  return pairs;
}

describe("the relay's box", () => {
  it("writes the files beside cloud-init.yaml, each as it is", () => {
    const written = writtenFiles(read("cloud-init.yaml"));
    for (const [place, name] of Object.entries(PLACES)) {
      expect(written.get(place), `${place} is not ${name}`).toBe(read(name));
    }
  });

  it("will not start the relay until the env file names a server", () => {
    const environment = environmentOf(read("chips-relay.service"), read("chips-relay.env"));
    expect(environment["CHIPS_RELAY_HOST"]).toBe("127.0.0.1");
    const placeholder = loadConfig({ environment });
    expect(placeholder.ok).toBe(false);
    if (!placeholder.ok) expect(placeholder.error.issues[0]?.source).toBe("CHIPS_RELAY_ALLOW_KEYS");

    const named = loadConfig({
      environment: { ...environment, CHIPS_RELAY_ALLOW_KEYS: "k".repeat(43) },
    });
    expect(named.ok).toBe(true);
    if (named.ok) {
      expect(named.value.relay).toMatchObject({ host: "127.0.0.1", allowKeys: ["k".repeat(43)] });
    }
  });

  it("hands Caddy's traffic to the port the relay listens on, and keeps the journal seven days", () => {
    const port = /CHIPS_RELAY_PORT=(\d+)/.exec(read("chips-relay.service"))?.[1];
    expect(read("Caddyfile")).toContain(`reverse_proxy 127.0.0.1:${port}`);
    expect(read("Caddyfile")).not.toMatch(/^\s*log\b/m);
    expect(read("journald.conf")).toMatch(/^MaxRetentionSec=7day$/m);
  });

  it("keeps each day's counts in the one directory the relay may write (ADR 0208)", () => {
    const unit = read("chips-relay.service");
    const environment = environmentOf(unit, read("chips-relay.env"));
    const config = loadConfig({
      environment: { ...environment, CHIPS_RELAY_ALLOW_KEYS: "k".repeat(43) },
    });
    if (!config.ok) throw config.error;
    const directory = /^StateDirectory=(\S+)$/m.exec(unit)?.[1];
    expect(directory).toBe("chips-relay");
    expect(unit).toMatch(/^ProtectSystem=strict$/m);
    expect(config.value.relay.countsFile).toBe(`/var/lib/${directory}/counts.jsonl`);
  });
});
