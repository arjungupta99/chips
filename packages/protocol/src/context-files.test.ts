import { describe, expect, it } from "vitest";
import {
  agentContextPut,
  CONTEXT_FILE_BYTES,
  CONTEXT_FILES_SHOWN,
  contextBytes,
  contextEditAsk,
  contextEditFrame,
  harnessContextPut,
  notShownFile,
} from "./context-files.js";

const file = (name: string, text = "words") => ({
  name,
  title: name.replace(/\.md$/, ""),
  role: "identity" as const,
  text,
  hash: `h-${name}`,
  editable: true,
});

describe("an agent's context, as a harness sends it (ADR 0134)", () => {
  it("takes eight files and names the rest in not_shown", () => {
    const files = Array.from({ length: CONTEXT_FILES_SHOWN }, (_, at) => file(`F${at}.md`));
    const put = agentContextPut.safeParse({
      files,
      not_shown: [{ name: "F8.md", reason: "count" }],
    });
    expect(put.success).toBe(true);
  });

  it("refuses a ninth file, so none is lost in silence", () => {
    const files = Array.from({ length: CONTEXT_FILES_SHOWN + 1 }, (_, at) => file(`F${at}.md`));
    expect(agentContextPut.safeParse({ files }).success).toBe(false);
  });

  it("refuses a text over 64 KB", () => {
    const big = "x".repeat(CONTEXT_FILE_BYTES + 1);
    expect(agentContextPut.safeParse({ files: [file("BIG.md", big)] }).success).toBe(false);
  });

  it("counts bytes, not characters", () => {
    expect(contextBytes("é")).toBe(2);
    const justOver = "é".repeat(CONTEXT_FILE_BYTES / 2 + 1);
    expect(contextEditAsk.safeParse({ name: "A.md", text: justOver, base_hash: "h" }).success).toBe(
      false,
    );
  });

  it("refuses two files of one name", () => {
    expect(agentContextPut.safeParse({ files: [file("A.md"), file("A.md")] }).success).toBe(false);
  });

  it("takes a file with no text only when it names the shared one the agent reads", () => {
    const shared = { name: "CHARTER.md", title: "Who it is", editable: false, shared: "default" };
    expect(agentContextPut.safeParse({ files: [shared] }).success).toBe(true);
    const { shared: _, ...bare } = shared;
    expect(agentContextPut.safeParse({ files: [bare] }).success).toBe(false);
  });

  it("carries an answer, or a refusal with its reason", () => {
    const answer = agentContextPut.safeParse({
      files: [file("A.md")],
      answers: "edt_01JB0000000000000000000000",
    });
    expect(answer.success).toBe(true);
    const refusal = agentContextPut.safeParse({
      files: [file("A.md")],
      refuses: { edit_id: "edt_01JB0000000000000000000000", reason: "changed" },
    });
    expect(refusal.success).toBe(true);
  });
});

describe("a harness's own set", () => {
  it("needs each shared file's text and its own id", () => {
    const shared = { ...file("D.md"), id: "default", used_by: 29, for_new_agents: true };
    expect(harnessContextPut.safeParse({ shared: [shared] }).success).toBe(true);
    const { text: _, ...noText } = shared;
    expect(harnessContextPut.safeParse({ shared: [noText] }).success).toBe(false);
    const twin = { ...shared, name: "E.md" };
    expect(harnessContextPut.safeParse({ shared: [shared, twin] }).success).toBe(false);
  });
});

describe("a person's edit", () => {
  it("names the version it was made from, or null to give the agent its own", () => {
    expect(contextEditAsk.safeParse({ name: "A.md", text: "t", base_hash: "h" }).success).toBe(
      true,
    );
    expect(contextEditAsk.safeParse({ name: "A.md", text: "t", base_hash: null }).success).toBe(
      true,
    );
    expect(contextEditAsk.safeParse({ name: "A.md", text: "t" }).success).toBe(false);
  });
});

describe("a file's name (SEC-14)", () => {
  const written = [
    (name: string) => agentContextPut.safeParse({ files: [file(name)] }).success,
    (name: string) => contextEditAsk.safeParse({ name, text: "t", base_hash: "h" }).success,
    (name: string) =>
      contextEditFrame.safeParse({
        frame: "context.edit",
        edit_id: "edt_01K4ZQPX0000000000000000E1",
        harness_id: "hrn_01K4ZQPX0000000000000000H1",
        name,
        text: "t",
        base_hash: null,
        asked_by: "usr_01K4ZQPX0000000000000000P1",
        asked_at: "2026-10-17T00:00:00.000Z",
      }).success,
  ];

  it("is one segment wherever a file is written under it: no slash, not `.` or `..`", () => {
    for (const parses of written) {
      for (const name of ["PERSONA.md", ".hidden", "notes 2026.md", "日本語.md"]) {
        expect(parses(name), name).toBe(true);
      }
      for (const name of ["../../.ssh/authorized_keys", "a/b.md", "a\\b.md", ".", "..", "a\0b"]) {
        expect(parses(name), JSON.stringify(name)).toBe(false);
      }
    }
  });

  it("may be anything for a file only named as not shown, since nothing is written under it", () => {
    expect(notShownFile.safeParse({ name: "notes/1.md", reason: "count" }).success).toBe(true);
  });
});
