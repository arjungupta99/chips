/**
 * Where a file comes from: a sheet from the bottom with the three places a phone keeps things —
 * the photo library, the camera, and the Files app — opened by the composer's +. Each is a row
 * on the sheet's card, wearing the design system's mark, a name and a line under it saying what
 * it gives; the sheet's X puts it away. The pickers themselves are the platform's.
 *
 * A choice does not close the sheet; the composer does, once the picker has come back. The
 * picker is presented over whatever is in front, and a sheet that was dismissing itself as the
 * picker went up took the picker down with it — the library never appeared (the simulator, 10
 * September 2026). Over a sheet that stays put, it does. `open` is the composer's for the reason
 * `Sheet` gives: the slide out is seen only if the sheet is still mounted to make it.
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { thisDevice } from "../device/word";
import type { IconName } from "../ui/icons";
import { Sheet, SheetCard, SheetRow, SheetTitle } from "../ui/Sheet";
import { hasAudio } from "./audio";
import type { Picked, Source } from "./pick";

// Required, not imported, and only when the row is chosen: the module is evaluated then and not
// before, so a build without `expo-audio`'s native half never loads it.
const VoiceRecorder = lazy(async () => ({
  default: (require("./VoiceRecorder") as typeof import("./VoiceRecorder")).VoiceRecorder,
}));

interface Choice {
  readonly source: Source;
  readonly icon: IconName;
  readonly label: string;
  /** What the row gives, under its name; a screen reader hears it as the hint. */
  readonly hint: string;
}

const SOURCES: readonly Choice[] = [
  {
    source: "library",
    icon: "image",
    label: "Photo library",
    hint: `A photo or video already on ${thisDevice()}`,
  },
  { source: "camera", icon: "camera", label: "Camera", hint: "Take a photo or video now" },
  { source: "files", icon: "doc", label: "Files", hint: "A document, or any other file" },
];

export function AttachSheet({
  open,
  onPick,
  onRecorded,
  onClose,
}: {
  readonly open: boolean;
  readonly onPick: (source: Source) => void;
  /** A voice note was recorded and kept. Absent, the sheet offers none. */
  readonly onRecorded?: ((picked: Picked) => void) | undefined;
  readonly onClose: () => void;
}) {
  const [recording, setRecording] = useState(false);
  // A sheet let go mid-note takes the recorder with it, and opens on the choices next time.
  useEffect(() => {
    if (!open) setRecording(false);
  }, [open]);
  const voice = onRecorded !== undefined && hasAudio();
  return (
    <Sheet open={open} onClose={onClose} testID="attach-sheet">
      {recording && onRecorded !== undefined ? (
        <Suspense fallback={null}>
          <VoiceRecorder onRecorded={onRecorded} />
        </Suspense>
      ) : (
        <>
          <SheetTitle>Add to your message</SheetTitle>
          <SheetCard>
            {SOURCES.map((choice) => (
              <SheetRow
                key={choice.source}
                icon={choice.icon}
                label={choice.label}
                hint={choice.hint}
                testID={`attach-${choice.source}`}
                onPress={() => onPick(choice.source)}
              />
            ))}
            {voice ? (
              <SheetRow
                key="voice"
                icon="mic"
                label="Voice note"
                hint="Say it, and Chips writes it down too"
                testID="attach-voice"
                onPress={() => setRecording(true)}
              />
            ) : null}
          </SheetCard>
        </>
      )}
    </Sheet>
  );
}
