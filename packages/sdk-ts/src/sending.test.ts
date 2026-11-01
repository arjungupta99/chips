/**
 * The files an answer sends: its `MEDIA:` lines taken out of the words, each file read only from
 * the agent's own folders, and what could not go said in the post.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessageNew } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Uploaded, UploadInput } from "./files.js";
import {
  filesNamedIn,
  MOST_FILES,
  promptFor,
  readSendable,
  SENDING_FILES,
  sendAnswer,
  sendingFiles,
} from "./index.js";

let root: string;
let folder: string;
let uploads: UploadInput[];

/** An upload as the server answers one, or its refusal for a file called `refused.bin`. */
async function upload(input: UploadInput): Promise<Uploaded> {
  if (input.filename === "refused.bin")
    throw new Error("The file is larger than this workspace takes.");
  uploads.push(input);
  return {
    attachmentId: `att_${uploads.length}`,
    filename: input.filename,
    mimeType: "text/html",
    byteSize: input.bytes.byteLength,
    sha256: "x",
    kind: "file",
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "chips-sending-"));
  folder = join(root, "agent");
  mkdirSync(join(folder, "game"), { recursive: true });
  writeFileSync(join(folder, "game", "tic-tac-toe.html"), "<p>play</p>");
  writeFileSync(join(folder, "notes.md"), "# notes");
  writeFileSync(join(root, "secret.txt"), "not yours");
  uploads = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the files an answer names", () => {
  it("takes its MEDIA: lines out of the words, and leaves a line that only mentions one", () => {
    expect(
      filesNamedIn("Ready.\n\nMEDIA:/a/game.html\n  MEDIA: notes.md  \nI use MEDIA:<path> lines."),
    ).toEqual({
      words: "Ready.\n\nI use MEDIA:<path> lines.",
      named: ["/a/game.html", "notes.md"],
    });
  });

  it("reads a file inside the agent's folder by its whole path or one from the folder", async () => {
    const whole = await readSendable(join(folder, "game", "tic-tac-toe.html"), [folder]);
    expect(whole).toMatchObject({ kind: "file", filename: "tic-tac-toe.html" });
    expect(await readSendable("notes.md", [folder])).toMatchObject({
      kind: "file",
      filename: "notes.md",
    });
    expect(await readSendable(`file://${join(folder, "notes.md")}`, [folder])).toMatchObject({
      kind: "file",
    });
  });

  it("refuses a file outside the folder, however the path gets there", async () => {
    symlinkSync(join(root, "secret.txt"), join(folder, "link.txt"));
    for (const reference of [
      join(root, "secret.txt"),
      "../secret.txt",
      "link.txt",
      "~/.ssh/id_ed25519",
    ]) {
      const read = await readSendable(reference, [folder]);
      expect(read.kind, reference).toBe("refused");
    }
    expect(await readSendable("../secret.txt", [folder])).toEqual({
      kind: "refused",
      name: "secret.txt",
      why: "it is outside the agent's folder",
    });
  });

  it("refuses a folder, a missing file and an empty one, and a bridge with no folder", async () => {
    writeFileSync(join(folder, "empty.txt"), "");
    expect(await readSendable("game", [folder])).toMatchObject({ why: "it is not a file" });
    expect(await readSendable("missing.html", [folder])).toMatchObject({ why: "it is not there" });
    expect(await readSendable("empty.txt", [folder])).toMatchObject({ why: "it is empty" });
    expect(await readSendable("notes.md", [])).toMatchObject({
      why: "this agent has no folder its files are sent from",
    });
  });

  it("gives a web address back to the words", async () => {
    expect(await readSendable("https://example.com/cat.png", [folder])).toEqual({
      kind: "link",
      url: "https://example.com/cat.png",
    });
  });
});

describe("an answer sent with its files", () => {
  it("posts the words without the lines, and the files as uploads", async () => {
    const sent = await sendAnswer(
      `Here it is.\n\nMEDIA:${join(folder, "game", "tic-tac-toe.html")}`,
      { folders: [folder], upload },
    );
    expect(sent).toEqual({
      text: "Here it is.",
      uploadIds: ["att_1"],
      sent: ["tic-tac-toe.html"],
      summary: "Here it is.",
    });
    expect(new TextDecoder().decode(uploads[0]?.bytes)).toBe("<p>play</p>");
  });

  it("says in the post what could not go, so the room is never told of a file it did not get", async () => {
    writeFileSync(join(folder, "refused.bin"), "x");
    const sent = await sendAnswer(
      "Three files.\nMEDIA:../secret.txt\nMEDIA:https://example.com/a.png\nMEDIA:refused.bin",
      {
        folders: [folder],
        upload,
      },
    );
    expect(sent.uploadIds).toEqual([]);
    expect(sent.text).toBe(
      [
        "Three files.",
        "(secret.txt was not attached: it is outside the agent's folder.)",
        "https://example.com/a.png",
        "(refused.bin was not attached: Chips refused it: The file is larger than this workspace takes.)",
      ].join("\n\n"),
    );
  });

  it("says what it sent when the answer has no words", async () => {
    expect(await sendAnswer("MEDIA:notes.md", { folders: [folder], upload })).toMatchObject({
      text: "",
      uploadIds: ["att_1"],
      summary: "Sent notes.md.",
    });
  });

  it("sends as many files as a post takes", async () => {
    const names = Array.from({ length: MOST_FILES + 1 }, (_, i) => `f${i}.txt`);
    for (const name of names) writeFileSync(join(folder, name), name);
    const sent = await sendAnswer(names.map((name) => `MEDIA:${name}`).join("\n"), {
      folders: [folder],
      upload,
    });
    expect(sent.uploadIds).toHaveLength(MOST_FILES);
    expect(sent.text).toBe(
      `(f${MOST_FILES}.txt was not attached: a message takes ${MOST_FILES} files.)`,
    );
  });

  it("leaves an answer that names no file as it was", async () => {
    expect(await sendAnswer("Just words.", { folders: [folder], upload })).toEqual({
      text: "Just words.",
      uploadIds: [],
      sent: [],
      summary: "Just words.",
    });
  });
});

describe("a turn's words, for a bridge that sends files", () => {
  const message = {
    from: { display_name: "Arjun" },
    text: "Build a game",
    for: ["agt_1"],
    room: { notes: { agt_1: "You are in Plans." } },
  } as unknown as MessageNew;

  it("says how a file reaches the room after the room's note, only when asked", () => {
    expect(promptFor(message, { sendsFiles: true })).toBe(
      `You are in Plans.\n\n${SENDING_FILES}\n\nArjun: Build a game`,
    );
    expect(promptFor(message)).toBe("You are in Plans.\n\nArjun: Build a game");
  });

  it("says, with the room's project, that only a file outside it needs sending (AP-9)", () => {
    const project = {
      folder: "/agents/hale/room",
      files: 3,
      changed: [],
      by: [],
      clashes: [],
      clashedWith: [],
      keys: [],
      markdown: false,
    };
    const said = promptFor(message, { sendsFiles: true, project });
    expect(said).toContain(
      "A file that isn't in the space's project reaches this space only when you send it: put MEDIA:<path>",
    );
    expect(said).not.toContain(SENDING_FILES);
    expect(sendingFiles()).toBe(SENDING_FILES);
  });
});
