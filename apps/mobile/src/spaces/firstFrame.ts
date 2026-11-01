/**
 * A picked video's first frame, read from the file on the phone by the platform's own reader:
 * `AVAssetImageGenerator` on iOS, `MediaMetadataRetriever` on Android (expo-video's
 * `generateThumbnailsAsync`). A staged photo's chip shows the photo the moment it is picked, and a
 * video's showed a paperclip (AN-29). Nothing until the frame is read, and nothing where it cannot
 * be, so the chip shows its mark instead. The player made to read it is let go once it has.
 *
 * The file is loaded before the frame is asked for (`replaceAsync`). A player made with its source
 * loads it on another thread on iOS, and asked at once it has no item yet and answers with no
 * frames, which is no error: on the iPhone simulator the chip kept its paperclip for good (17
 * October 2026). Android reads the file itself, so it had worked there.
 */

import { createVideoPlayer, type VideoThumbnail } from "expo-video";
import { useEffect, useState } from "react";

/**
 * The longest side asked for, in pixels: a forty-point chip on a 3x screen is 120, and a 16:9
 * frame no longer than 240 is 135 tall, so it covers the square without being enlarged.
 */
const LONGEST = 240;

export function useFirstFrame(uri: string | undefined): VideoThumbnail | undefined {
  const [read, setRead] = useState<{ readonly for: string; readonly frame: VideoThumbnail }>();
  useEffect(() => {
    if (uri === undefined) return;
    let live = true;
    const player = createVideoPlayer(null);
    player
      .replaceAsync(uri)
      .then(() => player.generateThumbnailsAsync(0, { maxWidth: LONGEST, maxHeight: LONGEST }))
      .then(
        ([first]) => {
          if (live && first !== undefined) setRead({ for: uri, frame: first });
        },
        () => undefined,
      )
      .finally(() => player.release());
    return () => {
      live = false;
    };
  }, [uri]);
  return read !== undefined && read.for === uri ? read.frame : undefined;
}
