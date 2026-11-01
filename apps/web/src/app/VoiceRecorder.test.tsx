/**
 * Recording a voice note in the page (ADR 0055), against a recorder and a microphone that stand in
 * for the browser's: what it asks for, what it hands over, and that the microphone is let go
 * however recording ends. What a real `MediaRecorder` writes, and what the server hears in it, are
 * the Playwright suite's (`e2e/voice.spec.ts`).
 */

import { LONGEST_VOICE_NOTE_MS } from "@chipschat/protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStream, installMicrophone, type Microphone } from "../testing/microphone.ts";
import { canRecord, extensionFor, recordingType, VoiceRecorder, whyNot } from "./VoiceRecorder.tsx";

let microphone: Microphone;

beforeEach(() => {
  microphone = installMicrophone();
});

afterEach(() => {
  vi.useRealTimers();
  microphone.remove();
});

function open() {
  const onRecorded = vi.fn<(file: File) => void>();
  const onCancel = vi.fn();
  const view = render(<VoiceRecorder onRecorded={onRecorded} onCancel={onCancel} />);
  return { onRecorded, onCancel, view };
}

const line = () => screen.getByTestId("voice-line").textContent;

/**
 * Stop and add, once it will actually take a press.
 *
 * The button is drawn from the first render and is disabled until the microphone has answered, and
 * React delivers no click to a disabled button. So waiting only for it to *exist* presses it into
 * nothing: the recording runs on and the note is never kept. That is what a loaded `pnpm check`
 * caught on 15 September 2026 — the failure's DOM showed the recorder still recording, and the
 * `0:01` in it was the clock running through the wait rather than anything the test had done.
 *
 * So the wait is for the state the recorder reports, never for a length of time: how long a
 * microphone takes to answer is the machine's business, and a test that guesses at it is a test
 * that fails when the machine is busy.
 */
async function stopAndAdd(): Promise<HTMLButtonElement> {
  const stop = (await screen.findByRole("button", {
    name: "Stop and add",
  })) as HTMLButtonElement;
  await vi.waitFor(() => expect(stop.disabled).toBe(false));
  return stop;
}

describe("recording a voice note", () => {
  it("asks for one channel, records, and hands over a note named for when it was made", async () => {
    const { onRecorded, onCancel } = open();
    expect(line()).toBe("Asking for the microphone…");
    await screen.findByText("Recording. A note stops at 5:00.");
    expect(microphone.asked).toEqual([
      { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } },
    ]);
    expect(microphone.recorders[0]?.options).toEqual({
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 96_000,
    });
    // Stop takes the focus, so Space or Enter keeps the note. It takes it in an effect, which React
    // runs a scheduler task after the commit that drew "Recording", so the check waits for it.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop and add" })),
    );

    fireEvent.click(await stopAndAdd());
    expect(line()).toBe("Keeping it…");
    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    const file = onRecorded.mock.calls[0]?.[0] as File;
    expect(file.name).toMatch(/^voice-note-\d{4}-\d{4}\.webm$/);
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(1024);
    expect(microphone.latest?.track.stopped).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("writes an M4A where the browser records AAC and no WebM, as an older WebKit does", async () => {
    microphone.writes = ["audio/mp4"];
    const { onRecorded } = open();
    fireEvent.click(await stopAndAdd());
    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    const file = onRecorded.mock.calls[0]?.[0] as File;
    expect(file.name).toMatch(/\.m4a$/);
    expect(file.type).toBe("audio/mp4");
  });

  it("throws the recording away on Cancel or Escape, and lets the microphone go", async () => {
    const first = open();
    await screen.findByText("Recording. A note stops at 5:00.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(first.onCancel).toHaveBeenCalledTimes(1);
    expect(microphone.latest?.track.stopped).toBe(true);
    first.view.unmount();

    const second = open();
    await screen.findByText("Recording. A note stops at 5:00.");
    fireEvent.keyDown(screen.getByRole("button", { name: "Stop and add" }), { key: "Escape" });
    expect(second.onCancel).toHaveBeenCalledTimes(1);
    await act(async () => undefined);
    expect(first.onRecorded).not.toHaveBeenCalled();
    expect(second.onRecorded).not.toHaveBeenCalled();
    expect(microphone.latest?.track.stopped).toBe(true);
  });

  it("lets the microphone go when it is closed while recording, or before the microphone answered", async () => {
    const recording = open();
    await screen.findByText("Recording. A note stops at 5:00.");
    const stream = microphone.latest;
    recording.view.unmount();
    expect(stream?.track.stopped).toBe(true);
    await act(async () => undefined);
    expect(recording.onRecorded).not.toHaveBeenCalled();

    let grant: () => void = () => undefined;
    microphone.answer = () =>
      new Promise((resolve) => {
        grant = () => {
          microphone.latest = new FakeStream();
          resolve(microphone.latest);
        };
      });
    const asking = open();
    asking.view.unmount();
    await act(async () => grant());
    expect(microphone.latest?.track.stopped).toBe(true);
    expect(microphone.recorders).toHaveLength(1);
  });

  it("counts up while it records, and stops itself, keeping the note, at five minutes", async () => {
    vi.useFakeTimers();
    const { onRecorded } = open();
    await act(async () => undefined);
    expect(line()).toBe("Recording. A note stops at 5:00.");
    act(() => vi.advanceTimersByTime(65_000));
    expect(screen.getByTestId("voice-elapsed").textContent).toBe("1:05");
    act(() => vi.advanceTimersByTime(LONGEST_VOICE_NOTE_MS - 65_000));
    await act(async () => undefined);
    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(microphone.latest?.track.stopped).toBe(true);
  });

  it("says so when nothing was recorded, and does not stage an empty note", async () => {
    microphone.said = [];
    const { onRecorded } = open();
    fireEvent.click(await stopAndAdd());
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Nothing was recorded. Check the microphone, then try again.",
    );
    expect(onRecorded).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  it("does not offer Stop until the microphone has answered, so a press is never lost", async () => {
    // The microphone answers when this test says so, rather than when the machine gets round to
    // it: a busy Mac is the same as a slow `getUserMedia`, and this pins what happens meanwhile.
    let grant: () => void = () => undefined;
    microphone.answer = () =>
      new Promise((resolve) => {
        grant = () => {
          microphone.latest = new FakeStream();
          resolve(microphone.latest);
        };
      });
    const { onRecorded } = open();

    // The button is there from the first render, saying what is coming, and takes no press.
    const stop = screen.getByRole("button", { name: "Stop and add" }) as HTMLButtonElement;
    expect(stop.disabled).toBe(true);
    fireEvent.click(stop);
    expect(screen.getByTestId("voice-recorder").dataset["stage"]).toBe("starting");

    await act(async () => grant());
    expect(screen.getByTestId("voice-recorder").dataset["stage"]).toBe("recording");
    expect(onRecorded).not.toHaveBeenCalled();

    // And now the same button keeps the note.
    fireEvent.click(await stopAndAdd());
    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  });

  it("says why it cannot record: a refused microphone, or a page that may not ask", async () => {
    microphone.answer = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    const refused = open();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This page may not use the microphone. Allow it in the browser's settings for this site, then try again.",
    );
    expect(screen.queryByRole("button", { name: "Stop and add" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(refused.onCancel).toHaveBeenCalledTimes(1);
    refused.view.unmount();

    // On plain http the browser offers no microphone at all.
    Reflect.deleteProperty(navigator, "mediaDevices");
    open();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A browser records only on a secure page, and this one is plain http. Open Chips at its https:// address to record here.",
    );
  });
});

describe("what a recorder can do here", () => {
  it("is offered only where there is a MediaRecorder", () => {
    expect(canRecord()).toBe(true);
    expect(canRecord({} as typeof globalThis)).toBe(false);
  });

  it("asks for Opus in a WebM first, then AAC, and names the file for what it got", () => {
    expect(recordingType({ isTypeSupported: () => true })).toBe("audio/webm;codecs=opus");
    expect(recordingType({ isTypeSupported: (type) => type === "audio/mp4" })).toBe("audio/mp4");
    expect(recordingType({ isTypeSupported: () => false })).toBeUndefined();
    expect(extensionFor("audio/webm")).toBe("webm");
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/ogg")).toBe("ogg");
  });

  it("says where to allow the microphone: the browser's site settings, or the Mac's", () => {
    const refused = new DOMException("denied", "NotAllowedError");
    expect(whyNot(refused, true)).toBe(
      "Chips may not use the microphone. Allow it in System Settings, under Privacy & Security, then Microphone.",
    );
    expect(whyNot(new DOMException("none", "NotFoundError"), false)).toBe(
      "There is no microphone to record with.",
    );
    expect(whyNot(new DOMException("busy", "NotReadableError"), false)).toBe(
      "The microphone could not be opened. Something else may be using it.",
    );
    expect(whyNot(new Error("boom"), false)).toBe("Could not start recording: boom");
  });
});
