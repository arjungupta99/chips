/**
 * A voice note, recorded in the page (ADR 0055): what the composer shows once the microphone is
 * pressed. Opening it asks for the microphone and starts; the elapsed time counts up; Stop and add
 * keeps the note and stages it like a chosen file, and the server writes down what was said before
 * the chip says it is ready (ADR 0054). It stops by itself at five minutes, the longest note the
 * server transcribes. Cancel, or Escape, throws the recording away. The microphone is let go the
 * moment it is not recording, so the browser's recording light goes out with it.
 *
 * One channel, at 96 kb/s, in whatever the browser's `MediaRecorder` writes of the types asked for:
 * Opus in a WebM in Chrome, Firefox and Safari (Safari's recorder said so on 13 September 2026),
 * and AAC in an MP4 in a WebKit that writes no WebM. The server sniffs the bytes either way.
 *
 * A browser records only on a secure page: `https://`, or `localhost`. On the plain address the
 * microphone is still offered, and says why it cannot record, rather than being missing without a
 * word.
 */

import { formatDuration, voiceNoteName } from "@chipschat/core";
import { LONGEST_VOICE_NOTE_MS } from "@chipschat/protocol";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { inDesktop } from "../native.ts";

/** What a recorder is asked to write, best first. */
const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

const VOICE_BITS_PER_SECOND = 96_000;

/** Whether this page has a recorder at all. Whether it may use the microphone is asked on Record. */
export const canRecord = (where: typeof globalThis = globalThis): boolean =>
  typeof where.MediaRecorder === "function";

/** The container the recorder is asked for: the first this browser writes, or its own choice. */
export function recordingType(recorder: Pick<typeof MediaRecorder, "isTypeSupported">) {
  return TYPES.find((type) => recorder.isTypeSupported(type));
}

/** `m4a` for an MP4 of sound, `ogg` for an Ogg, and `webm` for the rest. */
export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith("audio/mp4") || mimeType.startsWith("video/mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

/** Why the microphone could not be had, in words a person can act on. */
export function whyNot(error: unknown, desktop: boolean): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return desktop
        ? "Chips may not use the microphone. Allow it in System Settings, under Privacy & Security, then Microphone."
        : "This page may not use the microphone. Allow it in the browser's settings for this site, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "There is no microphone to record with.";
    case "NotReadableError":
      return "The microphone could not be opened. Something else may be using it.";
    default:
      return `Could not start recording: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const INSECURE =
  "A browser records only on a secure page, and this one is plain http. Open Chips at its https:// address to record here.";

const EMPTY = "Nothing was recorded. Check the microphone, then try again.";

type Stage = "starting" | "recording" | "stopping" | { readonly failed: string };

function lineFor(stage: Stage): string {
  if (typeof stage === "object") return stage.failed;
  switch (stage) {
    case "starting":
      return "Asking for the microphone…";
    case "recording":
      return `Recording. A note stops at ${formatDuration(LONGEST_VOICE_NOTE_MS)}.`;
    default:
      return "Keeping it…";
  }
}

/** A recording under way: what records it, from which microphone, and whether to keep it. */
interface Take {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  keep: boolean;
}

const release = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop();
};

/** Stop recording, and keep what was said. False when it had already stopped. */
const keep = (take: Take): boolean => {
  if (take.recorder.state === "inactive") return false;
  take.keep = true;
  take.recorder.stop();
  return true;
};

/** Stop recording, and throw it away. */
const discard = (take: Take) => {
  take.keep = false;
  if (take.recorder.state !== "inactive") take.recorder.stop();
  release(take.stream);
};

/** The microphone, or why not: this page may not ask, or the person or the machine said no. */
async function microphone(): Promise<
  { readonly stream: MediaStream } | { readonly failed: string }
> {
  const devices = globalThis.navigator?.mediaDevices;
  if (globalThis.isSecureContext === false || devices?.getUserMedia === undefined) {
    return { failed: INSECURE };
  }
  try {
    const stream = await devices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    return { stream };
  } catch (error) {
    return { failed: whyNot(error, inDesktop()) };
  }
}

/**
 * Start recording `stream`. When it stops, the microphone is let go, and a kept recording is a
 * file for `kept`, or `empty` when nothing came of it.
 */
function record(
  stream: MediaStream,
  kept: (file: File) => void,
  empty: () => void,
): Take | { readonly failed: string } {
  let recorder: MediaRecorder;
  try {
    const type = recordingType(MediaRecorder);
    recorder = new MediaRecorder(stream, {
      ...(type === undefined ? {} : { mimeType: type }),
      audioBitsPerSecond: VOICE_BITS_PER_SECOND,
    });
  } catch (error) {
    release(stream);
    return { failed: whyNot(error, inDesktop()) };
  }
  const take: Take = { recorder, stream, keep: false };
  const pieces: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) pieces.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    release(stream);
    if (!take.keep) return;
    const type = (recorder.mimeType || pieces[0]?.type || "audio/webm").split(";")[0] as string;
    const sound = new Blob(pieces, { type });
    if (sound.size === 0) return empty();
    kept(new File([sound], voiceNoteName(new Date(), extensionFor(type)), { type }));
  });
  recorder.start();
  return take;
}

export function VoiceRecorder(props: {
  readonly onRecorded: (file: File) => void;
  readonly onCancel: () => void;
}) {
  const [stage, setStage] = useState<Stage>("starting");
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const take = useRef<Take | undefined>(undefined);
  const stop = useRef<HTMLButtonElement>(null);
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });

  // Opening is pressing Record: ask, and start. Closing lets the microphone go.
  useEffect(() => {
    let gone = false;
    let limit: ReturnType<typeof setTimeout> | undefined;
    const begin = (stream: MediaStream) => {
      const started = record(
        stream,
        (file) => handlers.current.onRecorded(file),
        () => setStage({ failed: EMPTY }),
      );
      if ("failed" in started) return setStage(started);
      take.current = started;
      const at = Date.now();
      setStartedAt(at);
      setNow(at);
      setStage("recording");
      // Five minutes, and the note is kept as it is.
      limit = setTimeout(() => {
        if (keep(started)) setStage("stopping");
      }, LONGEST_VOICE_NOTE_MS);
    };
    void microphone().then((got) => {
      if ("failed" in got) {
        if (!gone) setStage(got);
      } else if (gone) release(got.stream);
      else begin(got.stream);
    });
    return () => {
      gone = true;
      clearTimeout(limit);
      if (take.current !== undefined) discard(take.current);
    };
  }, []);

  useEffect(() => {
    if (stage !== "recording") return;
    stop.current?.focus();
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [stage]);

  const finish = () => {
    if (take.current !== undefined && keep(take.current)) setStage("stopping");
  };

  const cancel = () => {
    if (take.current !== undefined) discard(take.current);
    handlers.current.onCancel();
  };

  const keyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancel();
  };

  const failed = typeof stage === "object";
  const elapsed = stage === "recording" ? Math.max(0, now - startedAt) : 0;
  return (
    <fieldset
      className="voice-recorder"
      aria-label="Voice note"
      data-testid="voice-recorder"
      data-stage={failed ? "failed" : stage}
      onKeyDown={keyDown}
    >
      <span className="voice-recorder-light" aria-hidden="true" />
      <span className="voice-recorder-elapsed" data-testid="voice-elapsed">
        {formatDuration(elapsed)}
      </span>
      <span
        className="voice-recorder-line"
        data-testid="voice-line"
        role={failed ? "alert" : "status"}
      >
        {lineFor(stage)}
      </span>
      {!failed && (
        <button
          ref={stop}
          type="button"
          className="voice-recorder-stop"
          onClick={finish}
          disabled={stage !== "recording"}
        >
          Stop and add
        </button>
      )}
      <button type="button" className="voice-recorder-cancel" onClick={cancel}>
        {failed ? "Close" : "Cancel"}
      </button>
    </fieldset>
  );
}

/**
 * Voice notes for a composer: the microphone to put in it, where the page has a recorder, and the
 * recorder to show above it while one is being made. A kept note goes to `add`, as a chosen file.
 */
export function useVoiceNotes(add: (files: readonly File[]) => void): {
  readonly recorder: ReactNode;
  readonly composer: { readonly onRecord?: () => void; readonly recording?: boolean };
} {
  const [recording, setRecording] = useState(false);
  const [able] = useState(() => canRecord());
  return {
    recorder: recording ? (
      <VoiceRecorder
        onRecorded={(file) => {
          setRecording(false);
          add([file]);
        }}
        onCancel={() => setRecording(false)}
      />
    ) : null,
    composer: able ? { onRecord: () => setRecording(true), recording } : {},
  };
}
