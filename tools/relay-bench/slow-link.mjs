/**
 * A slow link, for the relay bench: a TCP port that forwards to another at a byte rate each way,
 * with a one-way delay, holding at most a megabyte in flight so the sender feels the bottleneck
 * as it would on a real one (its socket's buffer fills; nothing is dropped).
 *
 * The rate is the link's, shared by everything on one connection, which is how a home uplink
 * behaves for the one socket a server keeps to its relay.
 */

import net from "node:net";

const HIGH_BYTES = 1024 * 1024;
const LOW_BYTES = 256 * 1024;

/** One direction: bytes leave `from` and reach `to` no faster than `rate`, `delayMs` late. */
function carry(from, to, rate, delayMs) {
  const queue = [];
  let free = 0;
  let queued = 0;
  let timer;
  let ended = false;
  /** Everything whose time has come, in order. */
  const deliver = () => {
    const now = performance.now();
    while (queue.length > 0 && queue[0].at <= now + 0.5) {
      const { chunk } = queue.shift();
      if (!to.destroyed) to.write(chunk);
      queued -= chunk.length;
    }
  };
  const pump = () => {
    timer = undefined;
    deliver();
    if (queued < LOW_BYTES && from.isPaused()) from.resume();
    if (queue.length > 0) timer = setTimeout(pump, Math.max(0, queue[0].at - performance.now()));
    else if (ended) to.end();
  };
  from.on("data", (chunk) => {
    const now = performance.now();
    free = Math.max(now, free) + (chunk.length / rate) * 1000;
    queue.push({ chunk, at: free + delayMs });
    queued += chunk.length;
    if (queued > HIGH_BYTES) from.pause();
    timer ??= setTimeout(pump, Math.max(0, queue[0].at - now));
  });
  from.on("end", () => {
    ended = true;
    if (queue.length === 0 && timer === undefined) to.end();
  });
}

/**
 * Listen on `port` and forward each connection to `target` on loopback, at `mbPerSecond`
 * megabytes a second each way and `delayMs` each way. Resolves with the server, to close.
 */
export function slowLink({ port, target, mbPerSecond, delayMs }) {
  const rate = mbPerSecond * 1024 * 1024;
  const server = net.createServer((near) => {
    const far = net.connect(target, "127.0.0.1");
    near.setNoDelay(true);
    far.setNoDelay(true);
    carry(near, far, rate, delayMs);
    carry(far, near, rate, delayMs);
    const both = () => {
      near.destroy();
      far.destroy();
    };
    near.on("error", both).on("close", both);
    far.on("error", both).on("close", both);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
