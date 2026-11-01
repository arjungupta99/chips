/**
 * The page at `/`: the build when there is one, `index.html` for any path that names no file,
 * a sentence when there is no build, and never a file outside the directory.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@chipschat/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let directory: string;
let ws: TestWorkspace;

/** A build the shape Vite leaves: a page, a hashed asset, and a file beside the site to protect. */
function site(): string {
  directory = mkdtempSync(join(tmpdir(), "chips-web-"));
  const root = join(directory, "site");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html><title>Chips</title><div id=root>");
  writeFileSync(join(root, "assets", "app-8f3a1c.js"), "console.log('chips')");
  writeFileSync(join(directory, "secret.txt"), "not yours");
  return root;
}

async function serving(webDir: string): Promise<void> {
  ws = await createTestWorkspace({
    config: { server: { ...defaultConfig().server, webDir } },
  });
}

async function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return await ws.gateway.app.fetch(new Request(`http://chips.local${path}`, { headers }));
}

afterEach(async () => {
  await ws.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("the web app at /", () => {
  beforeEach(async () => {
    await serving(site());
  });

  it("serves the page, uncached and not to be framed", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // The page runs only what it shipped with, from this origin (Gate 2, condition 2).
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("media-src 'self' blob:");
    // A picture in a message's words comes from where it lives (ADR 0068); a script never does.
    expect(policy).toContain("img-src 'self' data: blob: http: https:");
    expect(policy).toContain("frame-ancestors 'none'");
    // The page door's frame comes from this origin (ADR 0201), and nothing else is framed.
    expect(policy).toContain("frame-src 'self'");
    expect(policy).toContain("object-src blob:;");
    expect(policy).not.toContain("unsafe-eval");
    expect(await response.text()).toContain("<title>Chips</title>");
  });

  it("answers a path into the app with the page, so a link into a space opens it", async () => {
    const response = await get("/spaces/spc_01K4ZK4V8QJ3M2G4E5T6Y7R8S9");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>Chips</title>");
  });

  it("serves a hashed asset with its type, cacheable for a year", async () => {
    const response = await get("/assets/app-8f3a1c.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(await response.text()).toBe("console.log('chips')");
  });

  it("answers a file that is not there with the envelope, not the page", async () => {
    const response = await get("/assets/app-000000.js");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("never serves a file outside the directory, however the path is spelled", async () => {
    for (const path of ["/../secret.txt", "/..%2Fsecret.txt", "/assets/../../secret.txt"]) {
      const response = await get(path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).not.toContain("not yours");
    }
  });

  it("leaves the API alone: an unknown /v1 path is still not_found, with a credential", async () => {
    const response = await get("/v1/nowhere", ws.scout.headers);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
    const health = await get("/v1/health");
    expect(health.headers.get("content-type")).toContain("application/json");
  });
});

describe("with no build to serve", () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "chips-web-"));
    await serving(join(directory, "nowhere"));
  });

  it("says so at /, in a sentence, rather than answering not_found", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const text = await response.text();
    expect(text).toContain("Chips is running");
    expect(text).toContain("pnpm web:build");
  });

  it("still answers a file that is not there with the envelope", async () => {
    const response = await get("/assets/app.js");
    expect(response.status).toBe(404);
  });
});
