/**
 * What this machine has for video and voice notes, found as the server finds them when it starts
 * (ADRs 0053 and 0054): ffmpeg and ffprobe, and whisper with a model in the workspace's `models`
 * folder. `chips doctor` asks it, so what it says is what the server will find.
 */

import { join } from "node:path";
import type { ChipsConfig } from "@chipschat/platform";
import { findMediaTools, type MediaTools } from "./ffmpeg-videos.js";
import { findWhisper, type Whisper } from "./whisper-sounds.js";

export interface MediaFound {
  readonly video: MediaTools | undefined;
  readonly voice: Whisper | undefined;
  /** Where a model is looked for when none is named. */
  readonly models: string;
}

export function mediaFound(config: ChipsConfig, path: string | undefined): MediaFound {
  const models = join(config.data.dir, "models");
  return {
    video: findMediaTools({
      ffmpegPath: config.media.ffmpegPath,
      ffprobePath: config.media.ffprobePath,
      path,
    }),
    voice: findWhisper({
      whisperPath: config.media.whisperPath,
      modelPath: config.media.whisperModel,
      modelsDirectory: models,
      path,
    }),
    models,
  };
}
