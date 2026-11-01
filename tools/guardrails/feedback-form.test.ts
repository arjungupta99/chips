/**
 * A feedback prompt is an issue from one form (ADR 0237), and a link fills the form's boxes by
 * their ids: the apps' `feedbackLink()` fills `version`, and chipschat.ai/feedback.md tells an
 * agent to fill the rest by the names `docs/proposals/feedback-prompts.md` lists. A box renamed
 * on one side and not the other opens the form empty, and nothing says so. So the form's ids are
 * held here to the ones the link uses and the plan lists.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEEDBACK_TEMPLATE, feedbackLink } from "../../packages/core/src/feedback.ts";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const FORMS = `${REPO}.github/ISSUE_TEMPLATE/`;

/** The plan's table, less `title`, which is the issue's own and no field of the form. */
const IDS = ["saw", "change", "done", "version", "credit", "grant"];

/** Each field of the form, by its id: its type and whether it must be filled. */
function fieldsOf(yaml: string): { id: string; type: string; required: boolean }[] {
  return yaml
    .split(/^ {2}- type: /m)
    .slice(1)
    .map((block) => ({
      type: block.split("\n")[0]?.trim() ?? "",
      id: /^ {4}id: (\S+)$/m.exec(block)?.[1] ?? "",
      required: /^ +required: true$/m.test(block),
    }));
}

describe("the feedback prompt form", () => {
  const path = `${FORMS}${FEEDBACK_TEMPLATE}`;
  const yaml = existsSync(path) ? readFileSync(path, "utf8") : "";
  const fields = fieldsOf(yaml);

  it("is the file the link names", () => {
    expect(existsSync(path)).toBe(true);
    expect(new URL(feedbackLink("x")).searchParams.get("template")).toBe(FEEDBACK_TEMPLATE);
  });

  it("has the plan's boxes, by the plan's ids", () => {
    expect(fields.map((field) => field.id)).toEqual(IDS);
  });

  it("has a text box for each name the link fills", () => {
    const filled = [...new URL(feedbackLink("x")).searchParams.keys()].filter(
      (name) => name !== "template",
    );
    expect(filled).toEqual(["version"]);
    for (const name of filled) {
      expect(["input", "textarea"]).toContain(fields.find((field) => field.id === name)?.type);
    }
  });

  it("asks for the three parts and the licence line, and leaves the version and credit open", () => {
    expect(fields.filter((field) => field.required).map((field) => field.id)).toEqual([
      "saw",
      "change",
      "done",
      "grant",
    ]);
  });

  it("labels what it opens, and New issue offers nothing blank", () => {
    expect(yaml).toMatch(/^labels: \["feedback-prompt"\]$/m);
    expect(readFileSync(`${FORMS}config.yml`, "utf8")).toMatch(/^blank_issues_enabled: false$/m);
  });
});
