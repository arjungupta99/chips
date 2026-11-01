/**
 * A push service of the people suite's own, in Expo's place (`CHIPS_PUSH_URL`): it answers each
 * message with a ticket as Expo does, and keeps what it was sent, so a spec can say who a message
 * pushed — Natalie for an @ or a pick, nobody for a room she hid or set to None — without a phone.
 *
 *   POST /send    a batch of push messages, as `createExpoPushSender` sends them
 *   GET  /seen    everything sent so far, oldest first, each with when it came
 *   GET  /health  up
 */

import { createServer } from "node:http";

const port = Number(process.env.CHIPS_E2E_PUSH_PORT ?? "5597");
const seen = [];

createServer((request, response) => {
  const answer = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method === "GET" && request.url === "/health") return answer(200, { ok: true });
  if (request.method === "GET" && request.url === "/seen") return answer(200, { seen });
  if (request.method !== "POST" || request.url !== "/send") return answer(404, {});
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    let batch;
    try {
      batch = JSON.parse(raw);
    } catch {
      return answer(400, { errors: [{ message: "not JSON" }] });
    }
    const at = Date.now();
    for (const message of batch) seen.push({ ...message, at });
    return answer(200, { data: batch.map((_, n) => ({ status: "ok", id: `ticket-${at}-${n}` })) });
  });
}).listen(port, "127.0.0.1");
