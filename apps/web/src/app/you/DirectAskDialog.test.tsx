/**
 * A guest asks to go direct, on the web and the Mac (ADR 0211, Phase 3): the dialog opens for an
 * owner alone, holds Send until the field holds Tailscale's link, offers to keep it for the next
 * guest once it does, ticked, and says it went.
 */

import type { DirectAsk, Snapshot, Store } from "@chipschat/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DirectAsks } from "./DirectAskDialog.tsx";

const LINK = "https://login.tailscale.com/admin/invite/abc123";
const ASK: DirectAsk = {
  askId: "dra_1",
  participantId: "per_dana",
  state: "asked",
  tripMs: 432,
  link: undefined,
  sharedBy: undefined,
  askedAt: "2026-10-20T16:12:00.000Z",
  sharedAt: undefined,
};
const DIRECTORY = {
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana" },
} as unknown as Snapshot["directory"];
const model = (role: "owner" | "member") =>
  ({ people: { per_arjun: { role } } }) as unknown as Snapshot["model"];

function storeFor(shared: unknown[]) {
  return {
    serverFacts: async () => ({ machine: "Arjun's Mac mini" }),
    shareDirect: async (askId: string, link: string, keep: boolean) => {
      shared.push({ askId, link, keep });
      return { ...ASK, state: "shared", link, sharedBy: "per_arjun" };
    },
  } as unknown as Store;
}

const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

describe("a guest's ask to go direct, on the Mac", () => {
  it("asks an owner for Tailscale's link, sends it kept, and says it went", async () => {
    const shared: unknown[] = [];
    const store = storeFor(shared);
    const draw = (ask: DirectAsk) => (
      <DirectAsks
        store={store}
        asks={new Map([[ask.askId, ask]])}
        kept={undefined}
        model={model("owner")}
        directory={DIRECTORY}
        selfId="per_arjun"
      />
    );
    const { rerender } = render(draw(ASK));
    const dialog = await screen.findByTestId("direct-ask-dialog");
    expect(dialog.textContent).toContain("Dana wants to connect directly");
    expect(dialog.textContent).toContain("432 ms a round trip");
    await act(async () => undefined);
    expect(dialog.textContent).toContain("open Arjun's Mac mini's menu, then Share");
    expect(text("direct-ask-warning")).toContain("but all of it");
    const send = () => screen.getByTestId("direct-ask-send") as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("direct-ask-link"), {
      target: { value: "https://tailscale.evil.io/x" },
    });
    expect(send().disabled).toBe(true);
    expect(screen.queryByTestId("direct-ask-keep")).toBeNull();
    fireEvent.change(screen.getByTestId("direct-ask-link"), { target: { value: ` ${LINK} ` } });
    expect(send().disabled).toBe(false);
    expect((screen.getByTestId("direct-ask-keep") as HTMLInputElement).checked).toBe(true);
    await act(async () => {
      fireEvent.click(send());
    });
    expect(shared).toEqual([{ askId: "dra_1", link: LINK, keep: true }]);
    // The store hears the answer, and the dialog says it went.
    rerender(draw({ ...ASK, state: "shared", link: LINK, sharedBy: "per_arjun" }));
    expect(text("direct-ask-answered")).toContain("Sent to Dana");
  });

  it("fills in the link kept for the next guest, and forgets it when unticked", async () => {
    const shared: unknown[] = [];
    render(
      <DirectAsks
        store={storeFor(shared)}
        asks={new Map([[ASK.askId, ASK]])}
        kept={LINK}
        model={model("owner")}
        directory={DIRECTORY}
        selfId="per_arjun"
      />,
    );
    const field = (await screen.findByTestId("direct-ask-link")) as HTMLInputElement;
    expect(field.value).toBe(LINK);
    fireEvent.click(screen.getByTestId("direct-ask-keep"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("direct-ask-send"));
    });
    expect(shared).toEqual([{ askId: "dra_1", link: LINK, keep: false }]);
  });

  it("asks nobody but an owner", () => {
    render(
      <DirectAsks
        store={storeFor([])}
        asks={new Map([[ASK.askId, ASK]])}
        kept={undefined}
        model={model("member")}
        directory={DIRECTORY}
        selfId="per_arjun"
      />,
    );
    expect(screen.queryByTestId("direct-ask-dialog")).toBeNull();
  });
});
