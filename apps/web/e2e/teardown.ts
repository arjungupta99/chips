/**
 * Remove the run's data directory, which held a throwaway database and a demo token for it, and
 * stop anything still listening on the server's port.
 *
 * That second part is `restart.spec.ts`'s doing: it kills the server Playwright started and
 * starts one of its own in its place, deliberately, and leaves it running because the specs
 * after it need a server. Playwright only knows how to stop the process it started, so this is
 * what stops the replacement.
 */

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function teardown(): void {
  const port = process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432";
  try {
    // `-sTCP:LISTEN`: only what is serving the port, never what is talking to it.
    execFileSync(
      "sh",
      ["-c", `pids=$(lsof -ti tcp:${port} -sTCP:LISTEN); [ -n "$pids" ] && kill $pids`],
      { stdio: "ignore" },
    );
  } catch {
    // Nothing was listening, which is the state this wanted.
  }
  const directory = process.env["CHIPS_E2E_DATA_DIR"];
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
}
