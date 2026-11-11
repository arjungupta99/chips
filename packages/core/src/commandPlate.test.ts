import { describe, expect, it } from "vitest";
import { approveWords, askStanding } from "./asking.js";
import {
  commandPlate,
  type Plate,
  plateCaption,
  plateHeadline,
  plateTakesPreview,
  writesWords,
} from "./commandPlate.js";
import type { Approval } from "./model/types.js";

const ask = (command: unknown, question?: string): Approval =>
  ({
    approvalId: "apr_1",
    runId: "run_1",
    actionKind: "acp.bash",
    askedAt: "2026-11-06T07:09:08.035Z",
    input: { command },
    risk: [],
    sources: [],
    editable: false,
    fallback: "deny",
    approvers: [],
    ...(question === undefined ? {} : { question }),
  }) as Approval;

/** Each line of a plate, its bits as `kind:text`, for reading a test at a glance. */
const lines = (plate: Plate | undefined) =>
  plate?.parts.map(
    (part) => `${part.joint} ${part.bits.map((bit) => `${bit.kind}:${bit.text}`).join(" ")}`,
  );

const IKE =
  "cd /Users/me/Work/Chips/chips-main; ls -la; git log --oneline | wc -l; ls ../chips-notes ../chips-acp; cat package.json 2>/dev/null | head -60";

describe("a command on the plate (ADR 0280)", () => {
  it("draws Ike's command a part to a line, lighting what Always would remember", () => {
    const plate = commandPlate(ask(IKE));
    expect(plate?.readable).toBe(true);
    expect(lines(plate)).toEqual([
      "first start:cd word:/Users/me/Work/Chips/chips-main",
      "then start:ls word:-la",
      "then start:git start:log word:--oneline",
      "pipe start:wc start:-l",
      "then start:ls word:../chips-notes word:../chips-acp",
      "then start:cat word:package.json dropped:2>/dev/null",
      "pipe start:head word:-60",
    ]);
    // `ls -la` is lit as `ls`, the start that covers it; the order counts down the plate.
    const orders = plate?.parts.flatMap((part) =>
      part.bits.flatMap((bit) => (bit.kind === "start" ? [bit.order] : [])),
    );
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps words as written, quotes and escapes too, and joins a redirection to its file", () => {
    const plate = commandPlate(
      ask(
        "cd ~/room && cat limits.js && printf 'export const LIMIT = 40;\\n' > limits.js && cat limits.js",
      ),
    );
    expect(plate?.readable).toBe(false);
    expect(plate?.writesTo).toBe("limits.js");
    expect(lines(plate)).toEqual([
      "first start:cd word:~/room",
      "then start:cat word:limits.js",
      "then start:printf word:'export const LIMIT = 40;\\n' writes:> limits.js",
      "then start:cat word:limits.js",
    ]);
    expect(
      lines(commandPlate(ask("ls ~/Library/Application\\ Support 2>&1 | grep -i chip"))),
    ).toEqual([
      "first start:ls word:~/Library/Application\\ Support dropped:2>&1",
      "pipe start:grep start:-i word:chip",
    ]);
  });

  it("marks a part on the never list, and draws a command given as words on one line", () => {
    expect(lines(commandPlate(ask("ls && rm -rf build")))).toEqual([
      "first start:ls",
      "then never:rm never:-rf word:build",
    ]);
    expect(lines(commandPlate(ask(["node", "--check", "game.js"])))).toEqual([
      "first start:node start:--check word:game.js",
    ]);
    expect(commandPlate({ input: { path: "a.md" } })).toBeUndefined();
  });

  it("says why a write keeps no Always, by its file, and still holds for a while (ADR 0281)", () => {
    expect(writesWords("limits.js")).toBe(
      "This writes to `limits.js`, so there is no Always for it.",
    );
    expect(askStanding(ask("printf x > limits.js"))).toEqual({
      kind: "once",
      why: "This writes to `limits.js`, so there is no Always for it.",
      holds: true,
    });
    expect(askStanding(ask("echo $(date)"))).toEqual({
      kind: "once",
      why: "This command does more than Chips can read, so there is no Always for it.",
      holds: true,
    });
  });

  it("heads the plate with the question, without the command it quotes", () => {
    expect(
      plateHeadline(
        ask(
          IKE,
          "Inspect the main Chips repo layout? `cd /Users/me/Work/Chips/chips-main; ls -la; git l…`",
        ),
      ),
    ).toBe("Inspect the main Chips repo layout?");
    expect(plateHeadline(ask("ls", "Look around? `pwd`"))).toBe("Look around? `pwd`");
    expect(plateHeadline(ask("ls", "List the folder?"))).toBe("List the folder?");
  });

  it("says how far Approve reaches", () => {
    expect(approveWords("once")).toBe("Approve once");
    expect(approveWords("hour")).toBe("Approve for an hour");
    expect(approveWords("always")).toBe("Approve always");
  });

  it("says under the plate how many parts Chips read, and that thrown-away output writes nothing", () => {
    const caption = (command: string) => {
      const plate = commandPlate(ask(command));
      return plate === undefined ? undefined : plateCaption(plate);
    };
    expect(caption(IKE)).toBe("7 parts. Chips reads each one, and `2>/dev/null` writes no file.");
    expect(caption("ls && pwd")).toBe("2 parts. Chips reads each one.");
    expect(caption("cat a.md 2>/dev/null")).toBe("`2>/dev/null` writes no file.");
    expect(caption("git status")).toBeUndefined();
    expect(caption("echo hi > out.txt && ls")).toBeUndefined();
  });

  it("takes the place of a preview that is the command again", () => {
    const of = (preview: string | undefined, previewFormat?: Approval["previewFormat"]) =>
      plateTakesPreview({
        input: { command: IKE },
        ...(preview === undefined ? {} : { preview }),
        ...(previewFormat === undefined ? {} : { previewFormat }),
      });
    expect(of(JSON.stringify({ command: IKE, description: "Inspect" }, null, 2), "json")).toBe(
      true,
    );
    expect(of(`Run ${IKE}`)).toBe(true);
    expect(of(undefined)).toBe(true);
    expect(of("Looks around the repo before the build.")).toBe(false);
    expect(plateTakesPreview({ input: { path: "a.md" }, preview: "x" })).toBe(false);
  });

  it("draws a shell's command sent as bare words, and reads it as the command it is (10 November 2026)", () => {
    // Luis's ask: Jacobian sends the command line itself as the input, titled "shell · shell".
    const luis = {
      ...ask(undefined, "Run this command?"),
      actionKind: "jacobian.shell.shell",
      input: "pkill -f old ; sleep 1; rm -rf /tmp/luis; ls -d /tmp/luis 2>&1 | wc -l",
      preview: "pkill -f old ; sleep 1; rm -rf /tmp/luis; ls -d /tmp/luis 2>&1 | wc -l",
      previewFormat: "plain",
      previewTitle: "shell · shell",
    } as Approval;
    const plate = commandPlate(luis);
    expect(lines(plate)).toEqual([
      "first never:pkill never:-f word:old",
      "then start:sleep word:1",
      "then never:rm never:-rf word:/tmp/luis",
      "then start:ls start:-d word:/tmp/luis dropped:2>&1",
      "pipe start:wc start:-l",
    ]);
    // Read as protocol reads it (ADR 0239, addendum of 10 November 2026): it uses pkill and rm, so
    // there is no Always for it; it was an Always for every shell command.
    expect(plate?.readable).toBe(true);
    expect(plate === undefined ? "none" : plateCaption(plate)).toBe(
      "5 parts. Chips reads each one, and `2>&1` writes no file.",
    );
    expect(askStanding(luis)).toEqual({
      kind: "once",
      why: "There is no Always for asks that use pkill.",
      holds: true,
    });
    expect(plateTakesPreview(luis)).toBe(true);
    expect(plateHeadline(luis)).toBe("Run this command?");
    // Bare words from an action that runs no shell stay a preview.
    expect(commandPlate({ ...luis, actionKind: "jacobian.file.read" })).toBeUndefined();
    expect(commandPlate({ ...luis, input: "   " })).toBeUndefined();
  });

  it("offers an Always for a Jacobian command's starts, lit where they stand (10 November 2026)", () => {
    const jacobian = {
      ...ask(undefined, "Run this command?"),
      actionKind: "jacobian.shell.shell",
      input: "git log --oneline | head -20",
    } as Approval;
    expect(lines(commandPlate(jacobian))).toEqual([
      "first start:git start:log word:--oneline",
      "pipe start:head word:-20",
    ]);
    expect(askStanding(jacobian)).toEqual({ kind: "starts", starts: ["git log …", "head …"] });
    // One that writes into a file says so, and keeps no Always.
    const writes = { ...jacobian, input: "git log --oneline > log.txt" } as Approval;
    expect(commandPlate(writes)?.writesTo).toBe("log.txt");
    expect(askStanding(writes)).toEqual({ kind: "once", why: writesWords("log.txt"), holds: true });
    // A file the same agent asks to read is no command: its Always keeps the kind, as before.
    const read = {
      ...jacobian,
      actionKind: "jacobian.filesystem.read",
      input: "/tmp/a.md",
    } as Approval;
    expect(askStanding(read)).toEqual({ kind: "any" });
  });
});
