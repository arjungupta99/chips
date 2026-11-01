/**
 * A microphone and a `MediaRecorder` for jsdom, which has neither: what the page asks for, what it
 * records, and whether it let the microphone go. A stopped recording is `said`, a moment later, as
 * a browser hands it over.
 */

import { vi } from "vitest";

export class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

export class FakeStream {
  readonly track = new FakeTrack();
  getTracks() {
    return [this.track];
  }
}

export interface Microphone {
  /** What this browser's recorder writes, best first. */
  writes: readonly string[];
  /** What a stopped recording holds: a kilobyte of sound, unless a test says there was none. */
  said: readonly BlobPart[];
  /** How `getUserMedia` answers. */
  answer: () => Promise<FakeStream>;
  readonly asked: MediaStreamConstraints[];
  readonly recorders: FakeRecorder[];
  /** The last microphone handed out. */
  latest: FakeStream | undefined;
  /** Take the stand-ins away again. */
  readonly remove: () => void;
}

export interface FakeRecorder extends EventTarget {
  readonly options: MediaRecorderOptions;
  readonly mimeType: string;
  state: "inactive" | "recording";
}

/** Put a microphone and a recorder where the page looks for them. */
export function installMicrophone(): Microphone {
  const microphone: Microphone = {
    writes: ["audio/webm;codecs=opus", "audio/webm"],
    said: [new Uint8Array(1024)],
    answer: async () => {
      microphone.latest = new FakeStream();
      return microphone.latest;
    },
    asked: [],
    recorders: [],
    latest: undefined,
    remove: () => {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "mediaDevices");
    },
  };

  class Recorder extends EventTarget implements FakeRecorder {
    static isTypeSupported(type: string) {
      return microphone.writes.includes(type);
    }
    state: "inactive" | "recording" = "inactive";
    readonly mimeType: string;
    constructor(
      readonly stream: FakeStream,
      readonly options: MediaRecorderOptions,
    ) {
      super();
      this.mimeType = options.mimeType ?? "";
      microphone.recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    /** As a browser does: the data, then `stop`, a moment after. A second stop is an error. */
    stop() {
      if (this.state === "inactive") throw new DOMException("not recording", "InvalidStateError");
      this.state = "inactive";
      queueMicrotask(() => {
        const data = new Event("dataavailable");
        Object.assign(data, { data: new Blob([...microphone.said], { type: this.mimeType }) });
        this.dispatchEvent(data);
        this.dispatchEvent(new Event("stop"));
      });
    }
  }

  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: (constraints: MediaStreamConstraints) => {
        microphone.asked.push(constraints);
        return microphone.answer();
      },
    },
  });
  return microphone;
}
