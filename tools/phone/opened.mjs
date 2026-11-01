/**
 * Which devices opened a socket, by the server's own log (`~/Library/Logs/chips.serve.log`). Pure,
 * so it is tested (`tools/guardrails/phone-opened.test.ts`) without a server.
 *
 * Why it exists: `pnpm phone` knew a reinstalled app was back only by the device registry's
 * `last_seen_at`, which the server writes at most once a minute. On 12 October 2026 the new build
 * reached 4431 through the relay 50 seconds after the old one had, the phone locked a minute
 * later, and the registry never moved: the tool said the phone "did not reach the server" when it
 * had. A socket's opening is logged every time, with the device that opened it.
 */

/** The terminal's colours, which the launch agent's log keeps. */
const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** One log entry starts with its time: `[08:27:03.778] INFO (chips): socket open`. */
const ENTRY = /\n(?=\[\d{2}:\d{2}:\d{2}\.\d{3}\] )/;

/**
 * The device of every `socket open` in `log`, from pino-pretty's entries (a head line, then a
 * field to an indented line) and from JSON lines. A socket a harness opened names no device and
 * is not counted.
 */
export function devicesThatOpened(log) {
  const plain = log.replace(COLOUR, "");
  return [...plain.split("\n").flatMap(fromJson), ...plain.split(ENTRY).flatMap(fromPretty)];
}

/** A pretty entry's device, when it is a socket opening. */
function fromPretty(entry) {
  const [head = "", ...fields] = entry.split("\n");
  if (!/\): socket open\s*$/.test(head)) return [];
  return fields.flatMap((field) => {
    const said = /^\s+deviceId: "([^"]+)"\s*$/.exec(field);
    return said?.[1] === undefined ? [] : [said[1]];
  });
}

/** A JSON log line's device, when it is a socket opening. */
function fromJson(line) {
  if (!line.trimStart().startsWith("{")) return [];
  try {
    const entry = JSON.parse(line);
    return entry?.msg === "socket open" && typeof entry.deviceId === "string"
      ? [entry.deviceId]
      : [];
  } catch {
    return [];
  }
}
