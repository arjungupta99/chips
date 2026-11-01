import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../logging/index.js";
import { exitOnUncaught, LAST_LINE_MS, type ProcessHost } from "./uncaught.js";

/** A process of the test's own: what it was told to exit with, and its two events. */
function host() {
  const events = new EventEmitter();
  const exits: number[] = [];
  const process: ProcessHost = {
    on: (event, listener) => events.on(event, listener),
    exit: (code) => void exits.push(code),
  };
  return { process, events, exits };
}

/** A logger whose lines the test reads. */
function lines() {
  const said: Array<Record<string, unknown>> = [];
  const logger = createLogger({
    destination: { write: (line: string) => void said.push(JSON.parse(line)) },
  });
  return { logger, said };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("exitOnUncaught", () => {
  it("says what nobody caught, then exits 1 for a clean start", () => {
    const { process, events, exits } = host();
    const { logger, said } = lines();
    exitOnUncaught(logger, process);

    events.emit("uncaughtException", new TypeError("Invalid URL"));

    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({
      level: "fatal",
      msg: "uncaught exception, exiting for a clean start",
      err: { type: "TypeError", message: "Invalid URL" },
    });
    expect(exits).toEqual([1]);
  });

  it("ends on a rejection nobody handled too, and only once when a second follows", () => {
    const { process, events, exits } = host();
    const { logger, said } = lines();
    exitOnUncaught(logger, process);

    events.emit("unhandledRejection", new Error("no store"));
    events.emit("uncaughtException", new Error("while ending"));

    expect(said.map((line) => line["msg"])).toEqual([
      "unhandled rejection, exiting for a clean start",
    ]);
    expect(exits).toEqual([1]);
  });

  it("exits even when the last line is never written out", () => {
    vi.useFakeTimers();
    const { process, events, exits } = host();
    const fatal = vi.fn();
    exitOnUncaught({ fatal, flush: () => {} } as never, process);

    events.emit("uncaughtException", new Error("stuck"));
    expect(fatal).toHaveBeenCalledOnce();
    expect(exits).toEqual([]);
    vi.advanceTimersByTime(LAST_LINE_MS);
    expect(exits).toEqual([1]);
  });
});
