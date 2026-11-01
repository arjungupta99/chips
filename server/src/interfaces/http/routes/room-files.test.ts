/**
 * The room's files (ADR 0099) over HTTP: the current version of each name, for anybody in the room;
 * a post that says which version each file was made from, kept on the file; one made from a version
 * no longer current refused `stale_file`, naming the file and who changed it, and nothing of it
 * taken — two at once included.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../../application/index.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

const BASE = "http://chips.local";
const PAGE = "gallery.html";

let ws: TestWorkspace;
let posts = 0;

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

const json = (body: unknown) => JSON.stringify(body);

/** A file uploaded by Scout, by its upload's id. */
async function scoutUploads(filename: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const slot = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ws.scout.headers },
      body: json({ filename, byte_size: bytes.byteLength }),
    }),
  );
  expect(slot.status).toBe(201);
  const { upload_url: target, attachment_id: id } = (await slot.json()) as {
    upload_url: string;
    attachment_id: string;
  };
  const put = await ws.gateway.app.fetch(
    new Request(`${BASE}${target}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", ...ws.scout.headers },
      body: bytes,
    }),
  );
  expect(put.status, await put.clone().text()).toBe(201);
  return id;
}

/** Scout posts files in the room, saying what each was made from when it does. */
async function scoutPosts(
  uploads: readonly string[],
  replaces?: Record<string, string>,
): Promise<Response> {
  posts += 1;
  return await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ws.scout.headers },
      body: json({
        type: "message.post",
        space_id: ws.spaceId,
        text: `Post ${posts}`,
        upload_ids: uploads,
        ...(replaces === undefined ? {} : { replaces }),
        idempotency_key: `scout-post-${posts}`,
      }),
    }),
  );
}

/** A person posts a file in the room, saying nothing of what it was made from, as people do. */
async function personPosts(person: TestPerson, filename: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const slotBody = json({ filename, byte_size: bytes.byteLength });
  const slot = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/uploads`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...person.sign("POST", "/v1/uploads", slotBody),
      },
      body: slotBody,
    }),
  );
  const { upload_url: target, attachment_id: id } = (await slot.json()) as {
    upload_url: string;
    attachment_id: string;
  };
  await ws.gateway.app.fetch(
    new Request(`${BASE}${target}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", ...person.sign("PUT", target, bytes) },
      body: bytes,
    }),
  );
  const principal: Principal = {
    kind: "person",
    participantId: person.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Dana",
    via: "device_key",
  };
  posts += 1;
  const posted = await ws.gateway.deps.submitEvent({
    principal,
    event: {
      type: "message.post",
      space_id: ws.spaceId,
      text: "Mine",
      upload_ids: [id],
      idempotency_key: `person-post-${posts}`,
    },
  });
  expect(posted.ok).toBe(true);
  return id;
}

async function filesAs(headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  const read = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/spaces/${ws.spaceId}/files`, { headers }),
  );
  expect(read.status).toBe(200);
  return ((await read.json()) as { files: Record<string, unknown>[] }).files;
}

/** What the log kept of the newest post: its attachments, and whether the map was kept. */
async function lastPost(): Promise<Record<string, unknown>> {
  const head = await ws.gateway.deps.store.head(ws.workspaceId);
  const page = await ws.gateway.deps.store.since(ws.workspaceId, head - 1, 1);
  return page.events[0]?.payload ?? {};
}

describe("the room's files", () => {
  it("are listed at their current version, newest first, with who posted it and a URL for a harness", async () => {
    await scoutPosts([await scoutUploads(PAGE, "A–E")]);
    await scoutPosts([await scoutUploads("notes.md", "who does what")]);
    const v2 = await personPosts(ws.dana, PAGE, "A–J");

    const forScout = await filesAs(ws.scout.headers);
    expect(
      forScout.map((file) => [
        file["name"],
        file["version"],
        (file["by"] as { name: string }).name,
      ]),
    ).toEqual([
      [PAGE, 2, "Dana"],
      ["notes.md", 1, "Scout"],
    ]);
    expect(forScout[0]).toMatchObject({ attachment_id: v2, mime_type: "text/plain", byte_size: 5 });
    expect(String(forScout[0]?.["url"])).toContain(`/v1/attachments/${v2}?`);

    const target = `/v1/spaces/${ws.spaceId}/files`;
    const forDana = await filesAs(ws.dana.sign("GET", target, ""));
    expect(forDana.map((file) => file["name"])).toEqual([PAGE, "notes.md"]);
    expect(forDana[0]?.["url"]).toBeUndefined();
  });

  it("come with the context a harness reads", async () => {
    await scoutPosts([await scoutUploads(PAGE, "A–E")]);
    const read = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/spaces/${ws.spaceId}/context`, { headers: ws.scout.headers }),
    );
    const context = (await read.json()) as { files: Record<string, unknown>[] };
    expect(context.files.map((file) => [file["name"], file["version"]])).toEqual([[PAGE, 1]]);
    expect(context.files[0]?.["url"]).toEqual(expect.stringContaining("/v1/attachments/"));
  });
});

describe("where a harness is sent for a file", () => {
  it("is the address it asked at on this machine, and the public address from anywhere else", async () => {
    const PUBLIC = "https://mini.tail0000.ts.net";
    await ws.close();
    ws = await createTestWorkspace({ config: { server: { publicUrl: PUBLIC } as never } });
    await scoutPosts([await scoutUploads(PAGE, "A–E")]);
    const urlAt = async (base: string, peer?: string) => {
      const read = await ws.gateway.app.fetch(
        new Request(`${base}/v1/spaces/${ws.spaceId}/files`, { headers: ws.scout.headers }),
        peer === undefined ? undefined : { incoming: { socket: { remoteAddress: peer } } },
      );
      return String(
        ((await read.json()) as { files: Record<string, unknown>[] }).files[0]?.["url"],
      );
    };
    expect(await urlAt("http://127.0.0.1:4431", "127.0.0.1")).toMatch(
      /^http:\/\/127\.0\.0\.1:4431\/v1\/attachments\//,
    );
    expect(await urlAt("http://192.168.1.20:4431", "192.168.1.30")).toMatch(
      /^https:\/\/mini\.tail0000\.ts\.net\/v1\/attachments\//,
    );
    expect(await urlAt(BASE)).toMatch(/^https:\/\/mini\.tail0000\.ts\.net\/v1\/attachments\//);
  });
});

describe("one name's versions (ADR 0100)", () => {
  it("are listed newest first, each with who posted it, its message, and what it was made from", async () => {
    const v1 = await scoutUploads(PAGE, "A–E");
    await scoutPosts([v1]);
    const v2 = await scoutUploads(PAGE, "A–J");
    await scoutPosts([v2], { [v2]: v1 });
    await scoutPosts([await scoutUploads("notes.md", "who does what")]);
    const v3 = await personPosts(ws.dana, PAGE, "A–O");

    const target = `/v1/spaces/${ws.spaceId}/files?name=${encodeURIComponent(PAGE)}`;
    const read = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, { headers: ws.dana.sign("GET", target, "") }),
    );
    expect(read.status).toBe(200);
    const { files } = (await read.json()) as { files: Record<string, unknown>[] };
    expect(
      files.map((file) => [
        file["version"],
        file["attachment_id"],
        (file["by"] as { name: string }).name,
        file["replaces"],
      ]),
    ).toEqual([
      [3, v3, "Dana", undefined],
      [2, v2, "Scout", v1],
      [1, v1, "Scout", undefined],
    ]);
    expect(files[0]).toMatchObject({ name: PAGE, message_id: expect.stringMatching(/^msg_/) });
    expect(files[0]?.["url"]).toBeUndefined();
  });

  it("are none for a name the room never had, and a harness's come with URLs", async () => {
    await scoutPosts([await scoutUploads(PAGE, "A–E")]);
    const none = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/spaces/${ws.spaceId}/files?name=missing.txt`, {
        headers: ws.scout.headers,
      }),
    );
    expect(((await none.json()) as { files: unknown[] }).files).toEqual([]);
    const mine = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/spaces/${ws.spaceId}/files?name=${PAGE}`, {
        headers: ws.scout.headers,
      }),
    );
    const { files } = (await mine.json()) as { files: Record<string, unknown>[] };
    expect(String(files[0]?.["url"])).toContain("/v1/attachments/");
  });
});

describe("a post made from a version", () => {
  it("is taken when made from the current one, and the file keeps what it was made from", async () => {
    const v1 = await scoutUploads(PAGE, "A–E");
    await scoutPosts([v1]);
    const v2 = await scoutUploads(PAGE, "A–J");
    expect((await scoutPosts([v2], { [v2]: v1 })).status).toBe(201);

    const kept = await lastPost();
    expect(kept["replaces"]).toBeUndefined();
    expect(kept["attachments"]).toEqual([
      expect.objectContaining({ attachment_id: v2, replaces: v1 }),
    ]);
    expect((await filesAs(ws.scout.headers))[0]).toMatchObject({ attachment_id: v2, version: 2 });
  });

  it("is refused when made from one no longer current, naming the file and who changed it", async () => {
    const v1 = await scoutUploads(PAGE, "A–E");
    await scoutPosts([v1]);
    await personPosts(ws.dana, PAGE, "A–J");
    const head = await ws.gateway.deps.store.head(ws.workspaceId);

    const late = await scoutUploads(PAGE, "A–E, K–O");
    const answer = await scoutPosts([late], { [late]: v1 });
    expect(answer.status).toBe(409);
    expect(((await answer.json()) as { error: Record<string, unknown> }).error).toMatchObject({
      code: "stale_file",
      message: "gallery.html is now v2, by Dana. Fetch it and redo.",
    });
    expect(await ws.gateway.deps.store.head(ws.workspaceId)).toBe(head);
  });

  it("is taken when what it posts is the current version already", async () => {
    const v1 = await scoutUploads(PAGE, "A–E");
    await scoutPosts([v1]);
    await personPosts(ws.dana, PAGE, "A–J");
    const same = await scoutUploads(PAGE, "A–J");
    expect((await scoutPosts([same], { [same]: v1 })).status).toBe(201);
    expect((await filesAs(ws.scout.headers))[0]).toMatchObject({
      version: 2,
      by: expect.objectContaining({ name: "Dana" }),
    });
  });

  it("of another name is no version of the file, and a key the post does not carry is refused", async () => {
    const notes = await scoutUploads("notes.md", "who does what");
    await scoutPosts([notes]);
    const page = await scoutUploads(PAGE, "A–E");
    expect((await scoutPosts([page], { [page]: notes })).status).toBe(201);
    expect((await lastPost())["attachments"]).toEqual([
      expect.not.objectContaining({ replaces: expect.anything() }),
    ]);

    const other = await scoutUploads(PAGE, "A–J");
    const wrong = await scoutPosts([other], { [notes]: page });
    expect(wrong.status).toBe(422);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toBe(
      `replaces names ${notes}, which this message does not carry`,
    );
  });

  it("two at once from the same version: the second reads the first, and is refused", async () => {
    const v1 = await scoutUploads(PAGE, "A–E");
    await scoutPosts([v1]);
    const mine = await scoutUploads(PAGE, "A–E, F–J");
    const theirs = await scoutUploads(PAGE, "A–E, K–O");
    const answers = await Promise.all([
      scoutPosts([mine], { [mine]: v1 }),
      scoutPosts([theirs], { [theirs]: v1 }),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    expect((await filesAs(ws.scout.headers))[0]).toMatchObject({ version: 2 });
  });
});
