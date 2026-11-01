import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AVATAR_HUES, Avatar, avatarHue } from "./avatar.js";

describe("Avatar", () => {
  it("is a circle with initials for a person", () => {
    render(<Avatar name="Priya Raman" />);
    const avatar = screen.getByRole("img", { name: "Priya Raman" });
    expect(avatar.textContent).toBe("PR");
    expect(avatar.getAttribute("data-kind")).toBe("person");
    expect(avatar.hasAttribute("data-ring")).toBe(false);
  });

  it("says a harness's state in its name and wears it as a ring", () => {
    render(<Avatar name="Scout" kind="harness" status="waiting" />);
    const avatar = screen.getByRole("img", { name: "Scout, waiting on you" });
    expect(avatar.getAttribute("data-ring")).toBe("amber");
  });

  it("wears no ring when idle", () => {
    render(<Avatar name="Ledger" kind="harness" status="idle" />);
    const avatar = screen.getByRole("img", { name: "Ledger, idle" });
    expect(avatar.hasAttribute("data-ring")).toBe(false);
  });

  it("draws a kind it has never heard of as a harness (ADR 0088)", () => {
    render(<Avatar name="Tree" kind="something-later" status="working" />);
    const avatar = screen.getByRole("img", { name: "Tree, working" });
    expect(avatar.getAttribute("data-kind")).toBe("harness");
    expect(avatar.getAttribute("data-ring")).not.toBeNull();
  });

  it("is a hash for a channel", () => {
    render(<Avatar name="#procurement" kind="channel" />);
    expect(screen.getByRole("img", { name: "#procurement" }).textContent).toBe("#");
  });

  it("takes a label over the name, and a colour over the hue", () => {
    render(<Avatar name="Scout" kind="harness" label="Scout, the lead" color="var(--gold)" />);
    const avatar = screen.getByRole("img", { name: "Scout, the lead" });
    expect(avatar.getAttribute("style")).toContain("--avatar-color: var(--gold)");
  });

  it("picks the same hue for the same name, from the eight in the tokens", () => {
    expect(avatarHue("Scout")).toBe(avatarHue("Scout"));
    const hues = ["Scout", "Atlas", "Muse", "Ledger", "Priya Raman", "Arjun"].map(avatarHue);
    for (const hue of hues) {
      expect(hue).toBeGreaterThanOrEqual(1);
      expect(hue).toBeLessThanOrEqual(AVATAR_HUES);
    }
    expect(new Set(hues).size).toBeGreaterThan(1);
  });

  it("wears the mark and the ground a person chose", () => {
    render(<Avatar name="Supplier email" kind="channel" icon={{ icon: "rocket", ground: 4 }} />);
    const avatar = screen.getByRole("img", { name: "Supplier email" });
    expect(avatar.getAttribute("style")).toContain("--avatar-color: var(--avatar-5)");
    expect(avatar.querySelector(".ui-face path")).not.toBeNull();
  });

  it("draws a chosen mark as paper on the ground it lit, and a colour alone with the initials", () => {
    render(
      <Avatar name="Chess Game" kind="harness" size="lg" icon={{ icon: "rocket", ground: 0 }} />,
    );
    const face = screen.getByRole("img", { name: "Chess Game" });
    // The lit ground is one gradient, the ground's own two stops, and the cut paint is it too.
    const stops = [...face.querySelectorAll("stop")].map((stop) => stop.getAttribute("style"));
    expect(stops).toEqual(["stop-color: var(--avatar-top);", "stop-color: var(--avatar-foot);"]);
    expect(face.querySelectorAll(".ui-face path").length).toBeGreaterThan(3);
    expect(face.textContent).toBe("");
  });

  it("leaves the halo and the hairlines out of a face at chat size", () => {
    // The moon has a halo; at 24 or 32 pixels it would be a grey smudge, so it is not drawn.
    const { unmount } = render(
      <Avatar name="Night" icon={{ icon: "moon", ground: 1 }} size="lg" />,
    );
    const large = screen.getByRole("img", { name: "Night" }).querySelectorAll("path").length;
    unmount();
    render(<Avatar name="Night" icon={{ icon: "moon", ground: 1 }} size="xs" />);
    const small = screen.getByRole("img", { name: "Night" }).querySelectorAll("path").length;
    expect(small).toBeLessThan(large);
  });

  it("keeps the ground when the mark is one this build does not have", () => {
    // A colour chosen on its own writes an empty mark, and a newer phone can write a name this
    // build has never heard of. Both are the initials — on the colour that was chosen.
    for (const mark of ["", "somethingfromalaterbuild"]) {
      const { unmount } = render(<Avatar name="Priya Raman" icon={{ icon: mark, ground: 9 }} />);
      const avatar = screen.getByRole("img", { name: "Priya Raman" });
      expect(avatar.getAttribute("style")).toContain("--avatar-color: var(--icon-ground-2)");
      expect(avatar.textContent).toBe("PR");
      unmount();
    }
  });

  it("wears the grounds added on 26 September 2026, and none past them", () => {
    const { unmount } = render(<Avatar name="Ink" icon={{ icon: "tent", ground: 26 }} />);
    expect(screen.getByRole("img", { name: "Ink" }).getAttribute("style")).toContain(
      "--avatar-color: var(--icon-ground-19)",
    );
    unmount();
    render(<Avatar name="Later" icon={{ icon: "tent", ground: 40 }} />);
    expect(screen.getByRole("img", { name: "Later" }).getAttribute("style")).toContain(
      "--avatar-color: var(--icon-ground-19)",
    );
  });

  it("comes in three sizes", () => {
    render(<Avatar name="Scout" size="lg" />);
    expect(screen.getByRole("img").getAttribute("data-size")).toBe("lg");
  });
});

describe("a face of letters (ADR 0139)", () => {
  it("draws the letters chosen in place of the initials, on the ground chosen", () => {
    render(
      <Avatar name="Arjun Gupta" kind="person" icon={{ icon: "", ground: 4, letters: "Ω" }} />,
    );
    const face = screen.getByRole("img", { name: "Arjun Gupta" });
    expect(face.textContent).toBe("Ω");
    expect(face.getAttribute("style")).toContain("--avatar-color: var(--avatar-5)");
    // Letters stand at the initials' own size.
    expect(face.querySelector(".ui-avatar-letters")?.getAttribute("style")).toBeNull();
  });

  it("sizes emoji to stand inside the face: one larger, two smaller", () => {
    const { unmount } = render(
      <Avatar name="Kitchen" kind="channel" icon={{ icon: "", ground: 2, letters: "🦊" }} />,
    );
    const one = screen.getByRole("img").querySelector(".ui-avatar-letters");
    expect(one?.textContent).toBe("🦊");
    expect(one?.getAttribute("style")).toBe("font-size: 1.25em;");
    unmount();
    render(
      <Avatar name="Kitchen" kind="channel" icon={{ icon: "", ground: 2, letters: "🦊🚀" }} />,
    );
    expect(screen.getByRole("img").querySelector(".ui-avatar-letters")?.getAttribute("style")).toBe(
      "font-size: 0.71em;",
    );
  });

  it("puts an agent's letters in its body, where its initials were", () => {
    render(<Avatar name="Shopping" kind="agent" icon={{ icon: "", ground: 4, letters: "🛒" }} />);
    expect(screen.getByRole("img", { name: "Shopping" }).textContent).toBe("🛒");
  });
});

describe("an agent's face (ADR 0089)", () => {
  it("is the mark's bitten body, wearing its initials until a face is chosen for it", () => {
    render(<Avatar name="Shopping" kind="agent" />);
    const face = screen.getByRole("img", { name: "Shopping" });
    expect(face.getAttribute("data-kind")).toBe("agent");
    expect(face.textContent).toBe("S");
    // One body, drawn as a path with the bite in it: the only arc that curves the other way.
    const body = face.querySelector(".ui-face > path")?.getAttribute("d") ?? "";
    expect(body.match(/ 0 0 0 /g)).toHaveLength(1);
    // No ring: its state is in its outline.
    expect(face.hasAttribute("data-ring")).toBe(false);
  });

  it("wears the mark and the ground chosen for it, kept inside the body", () => {
    render(<Avatar name="Shopping" kind="agent" icon={{ icon: "cart", ground: 4 }} />);
    const face = screen.getByRole("img", { name: "Shopping" });
    expect(face.getAttribute("style")).toContain("--avatar-color: var(--avatar-5)");
    expect(face.textContent).toBe("");
    expect(face.querySelector(".ui-face clipPath path")).not.toBeNull();
    expect(face.querySelectorAll(".ui-face g path").length).toBeGreaterThan(2);
  });

  it("wears its ten pins where it is large enough for them, and runs a light round them at work", () => {
    const { unmount } = render(<Avatar name="Shopping" kind="agent" size="lg" />);
    expect(screen.getByRole("img").hasAttribute("data-working")).toBe(false);
    expect(screen.getByTestId("agent-pins").children).toHaveLength(10);
    unmount();

    // The Agents page's rows and a room's head draw it at 32, which is room enough. The pins stand
    // inside the box, so the body stands back from its edges by as far as they stand out.
    const row = render(<Avatar name="Shopping" kind="agent" size="sm" />);
    expect(screen.getByTestId("agent-pins").children).toHaveLength(10);
    const body = row.container.querySelector<HTMLElement>(".ui-avatar-body");
    expect(body?.style.inset).toMatch(/^10\.31/);
    row.unmount();

    render(<Avatar name="Shopping" kind="agent" size="lg" status="working" />);
    const working = screen.getByRole("img", { name: "Shopping, working" });
    expect(working.getAttribute("data-working")).toBe("true");
    expect(screen.getByTestId("agent-pins").children).toHaveLength(10);
    expect(screen.queryByTestId("working-dot")).toBeNull();
  });

  it("rests its pins dim, and a little less dim worn round its body beside a line", () => {
    const { unmount } = render(<Avatar name="Shopping" kind="agent" size="sm" />);
    expect(screen.getByTestId("agent-pins").style.getPropertyValue("--pin-rest")).toBe("0.3");
    unmount();

    // The face beside a line (ADR 0103): pins at 24, round a body that fills the face, kept clear
    // of the bubble by as far as they stand out, and the light round them in place of the dot.
    const line = render(<Avatar name="Shopping" kind="agent" size="xs" status="working" pinsOut />);
    const face = screen.getByRole("img", { name: "Shopping, working" });
    expect(face.getAttribute("data-pins")).toBe("out");
    expect(face.style.margin).toBe("4px");
    expect(screen.getByTestId("agent-pins").children).toHaveLength(10);
    expect(screen.getByTestId("agent-pins").style.getPropertyValue("--pin-rest")).toBe("0.45");
    expect(line.container.querySelector<HTMLElement>(".ui-avatar-body")?.style.inset).toBe("");
    expect(screen.queryByTestId("working-dot")).toBeNull();
  });

  it("says it is working with a dot in the bite where it has no room for pins", () => {
    render(<Avatar name="Shopping" kind="agent" size="xs" status="working" />);
    expect(screen.queryByTestId("agent-pins")).toBeNull();
    expect(screen.getByTestId("working-dot")).not.toBeNull();
  });

  it("wears one dot when it can't answer, and no dot at rest", () => {
    const { unmount } = render(<Avatar name="OpenClaw" kind="agent" status="working" cantAnswer />);
    expect(screen.getByTestId("cant-answer-mark")).not.toBeNull();
    expect(screen.queryByTestId("working-dot")).toBeNull();
    unmount();

    render(<Avatar name="OpenClaw" kind="agent" size="xs" />);
    expect(screen.queryByTestId("agent-pins")).toBeNull();
    expect(screen.queryByTestId("working-dot")).toBeNull();
    expect(screen.queryByTestId("cant-answer-mark")).toBeNull();
  });
});
