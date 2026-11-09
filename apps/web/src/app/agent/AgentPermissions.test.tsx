/** An agent's Permissions as the web and the Mac draw it (ADR 0286). */

import type { Banners, Directory, WorkspaceModel } from "@chipschat/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Part } from "../harness/Parts.tsx";
import { AgentPermissions } from "./AgentPermissions.tsx";
import type { BannerService } from "./bannerService.ts";

const HARNESS = "har_claude";
const AGENT = "agt_jiro";
const ME = "usr_arjun";
const SPACE = "spc_explain";
const SINCE = "2026-11-06T09:50:00.000Z";

const directory: Directory = {
  [HARNESS]: { id: HARNESS, kind: "harness", displayName: "Claude Code", ownerId: ME },
  [AGENT]: { id: AGENT, kind: "agent", displayName: "Jiro", harnessId: HARNESS, room: SPACE },
  [ME]: { id: ME, kind: "person", displayName: "Arjun", role: "owner" },
  usr_dana: { id: "usr_dana", kind: "person", displayName: "Dana", role: "member" },
};

function modelOf(working: boolean): WorkspaceModel {
  return {
    people: {
      [ME]: { participantId: ME, displayName: "Arjun", role: "owner" },
      usr_dana: { participantId: "usr_dana", displayName: "Dana", role: "member" },
    },
    harnesses: { [HARNESS]: { harnessId: HARNESS, autonomy: 1, rules: [], bySpace: {} } },
    spaces: [
      {
        id: SPACE,
        title: "Chips explain",
        state: "open",
        members: [ME, AGENT],
        lines: [],
        runs: [],
        approvals: [],
        ...(working ? { letWork: [{ asker: AGENT, by: ME, since: SINCE }] } : {}),
      },
    ],
  } as unknown as WorkspaceModel;
}

function mount(
  options: { working?: boolean; banners?: Banners; selfId?: string; keepsBanners?: boolean } = {},
) {
  const service: BannerService = {
    banners: options.banners,
    keepsBanners: options.keepsBanners ?? true,
    keepsHeldStart: true,
    letAgentWork: vi.fn(),
    stopLetWork: vi.fn(),
    closeBanner: vi.fn(async () => undefined),
    reopenBanner: vi.fn(async () => undefined),
    setAgentBanner: vi.fn(async () => undefined),
    setHarnessBanner: vi.fn((harnessId: string) => ({ harnessId, shown: undefined, apart: {} })),
    undoHarnessBanner: vi.fn(async () => undefined),
  };
  const onOpenHarness = vi.fn();
  render(
    <AgentPermissions
      agentId={AGENT}
      model={modelOf(options.working === true)}
      directory={directory}
      selfId={options.selfId ?? ME}
      service={service}
      onSetRules={() => undefined}
      onOpenSpace={() => undefined}
      onOpenHarness={onOpenHarness}
    />,
  );
  return { service, onOpenHarness };
}

describe("an agent's Permissions (ADR 0286)", () => {
  it("opens Let it work in place, and only Let Jiro work gives the yes", () => {
    const { service } = mount();
    expect(screen.getByTestId("permissions-headline").textContent).toBe(
      "Jiro decides when to ask. You decide the answer.",
    );
    fireEvent.click(screen.getByTestId("permissions-let-work"));
    expect(service.letAgentWork).not.toHaveBeenCalled();
    expect(screen.getByTestId("permissions-confirm").textContent).toMatch(/until you stop it/);
    fireEvent.click(screen.getByTestId("permissions-cancel"));
    expect(screen.queryByTestId("permissions-confirm")).toBeNull();
    fireEvent.click(screen.getByTestId("permissions-let-work"));
    fireEvent.click(screen.getByRole("button", { name: "Let Jiro work" }));
    expect(service.letAgentWork).toHaveBeenCalledWith({ spaceId: SPACE, asker: AGENT });
    expect((screen.getByTestId("permissions-let-work") as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers Stop while it isn't asking, and runs the art gold", () => {
    const { service } = mount({ working: true });
    expect(screen.getByTestId("permissions-headline").textContent).toBe(
      "Jiro is working without asking in Chips explain.",
    );
    expect(screen.getByTestId("asking-hero").dataset["working"]).toBe("true");
    fireEvent.click(screen.getByTestId("permissions-stop"));
    expect(service.stopLetWork).toHaveBeenCalledWith({ spaceId: SPACE, asker: AGENT });
  });

  it("doesn't offer Let it work to somebody who may not give that yes", () => {
    mount({ selfId: "usr_dana" });
    expect(screen.queryByTestId("permissions-let-work")).toBeNull();
  });

  it("switches the banner and says what the switch is at", () => {
    const { service } = mount({ working: true });
    expect(screen.getByTestId("permissions-banner-row").textContent).toContain(
      "Same as Claude Code",
    );
    fireEvent.click(screen.getByTestId("permissions-banner-switch"));
    expect(service.setAgentBanner).toHaveBeenCalledWith(AGENT, false);
  });

  it("says when the banner is closed, and Show again opens it", () => {
    const { service } = mount({
      working: true,
      banners: { choices: {}, closed: [{ spaceId: SPACE, asker: AGENT, since: SINCE }] },
    });
    expect(screen.getByTestId("permissions-closed").textContent).toContain(
      "Until Jiro is given a new yes",
    );
    fireEvent.click(screen.getByTestId("permissions-show-again"));
    expect(service.reopenBanner).toHaveBeenCalledWith({ spaceId: SPACE, asker: AGENT });
  });

  it("says nothing shows while the banner is off", () => {
    mount({ working: true, banners: { choices: { [AGENT]: false }, closed: [] } });
    expect(screen.getByTestId("permissions-nothing").textContent).toBe(
      "Nothing shows in the space.",
    );
    expect(screen.getByTestId("permissions-banner-row").textContent).toContain("Off for Jiro only");
  });

  it("offers no banner on a server that keeps no choices", () => {
    mount({ keepsBanners: false });
    expect(screen.queryByTestId("permissions-banner")).toBeNull();
  });

  it("goes on to its harness", () => {
    const { onOpenHarness } = mount();
    fireEvent.click(screen.getByTestId("permissions-harness"));
    expect(onOpenHarness).toHaveBeenCalledWith(HARNESS);
  });

  it("says on a harness's See all who isn't asking and whose banner is off", () => {
    render(
      <Part
        part="agents"
        harnessId={HARNESS}
        model={modelOf(true)}
        directory={directory}
        selfId={ME}
        banners={{ choices: { [AGENT]: false }, closed: [] }}
        onOpenAgent={() => undefined}
        onOpenSpace={() => undefined}
        onOpenFile={() => undefined}
      />,
    );
    const row = screen.getByTestId(`agent-${AGENT}`);
    expect(row.textContent).toContain("Not asking");
    expect(row.querySelector("[title='Banner off']")).not.toBeNull();
  });
});
