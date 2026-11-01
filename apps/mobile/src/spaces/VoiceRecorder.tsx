/**
 * A voice note, recording (ADR 0054): what the attach sheet shows once Voice note is chosen. A tap
 * on the microphone asks for it the first time and starts; the elapsed time counts up; a tap on
 * stop keeps the note and stages it like any picked file, and the server writes down what was said
 * before the chip says it is ready. It stops by itself at five minutes, the longest note the
 * server transcribes. The sheet's X throws the recording away: the sheet let go takes this with
 * it, and the recorder with this.
 *
 * One channel of AAC in an M4A at 96 kb/s: a minute is under a megabyte, and whisper hears
 * sixteen kilohertz of it anyway.
 *
 * In a file of its own, loaded only where `hasAudio()` says the native half is there.
 */

import { formatDuration } from "@chipschat/core";
import { LONGEST_VOICE_NOTE_MS } from "@chipschat/protocol";
import {
  type RecordingOptions,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { IconButton } from "../ui/Button";
import { SheetTitle } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { type Picked, voiceNote } from "./picked";

const VOICE: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 96_000,
};

type Stage = "ready" | "starting" | "recording" | "stopping" | { readonly failed: string };

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

function lineFor(stage: Stage): string {
  if (typeof stage === "object") return stage.failed;
  switch (stage) {
    case "ready":
      return `Tap to record. A note stops at ${formatDuration(LONGEST_VOICE_NOTE_MS)}.`;
    case "starting":
      return "Starting…";
    case "recording":
      return "Recording. Tap to stop and add it.";
    default:
      return "Keeping it…";
  }
}

export function VoiceRecorder({ onRecorded }: { readonly onRecorded: (picked: Picked) => void }) {
  const palette = usePalette();
  const recorder = useAudioRecorder(VOICE);
  const state = useAudioRecorderState(recorder, 250);
  const [stage, setStage] = useState<Stage>("ready");

  const start = async () => {
    setStage("starting");
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStage({ failed: "Chips may not use the microphone. Allow it in Settings." });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStage("recording");
    } catch (error) {
      setStage({ failed: `Could not start recording: ${reason(error)}` });
    }
  };

  const finish = useCallback(async () => {
    setStage("stopping");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri === null) throw new Error("the recording was not kept");
      onRecorded(voiceNote(uri, new Date(), Platform.OS === "web"));
    } catch (error) {
      setStage({ failed: `Could not keep the recording: ${reason(error)}` });
    }
  }, [recorder, onRecorded]);

  // Five minutes, and the note is kept as it is.
  useEffect(() => {
    if (stage === "recording" && state.durationMillis >= LONGEST_VOICE_NOTE_MS) void finish();
  }, [stage, state.durationMillis, finish]);

  // The phone goes back to playing through its speaker once the sheet is gone.
  useEffect(
    () => () => {
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    },
    [],
  );

  const recording = stage === "recording";
  const failed = typeof stage === "object";
  return (
    <View testID="voice-recorder">
      <SheetTitle hint="Chips writes down what you say, and sends both.">Voice note</SheetTitle>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
        <Text
          accessibilityLabel={`Recorded ${formatDuration(recording ? state.durationMillis : 0)}`}
          style={[styles.elapsed, { color: recording ? palette.ink : palette.ink3 }]}
          testID="voice-elapsed"
        >
          {formatDuration(recording ? state.durationMillis : 0)}
        </Text>
        <Text
          style={[styles.line, { color: failed ? palette.red : palette.ink3 }]}
          testID="voice-line"
        >
          {lineFor(stage)}
        </Text>
        <IconButton
          icon={recording ? "stop" : "mic"}
          label={recording ? "Stop and add" : "Record"}
          size={64}
          disabled={stage === "starting" || stage === "stopping"}
          onPress={() => void (recording ? finish() : start())}
          testID="voice-record"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.md,
  },
  elapsed: { fontSize: 40, fontWeight: "600", fontVariant: ["tabular-nums"] },
  line: { fontSize: TEXT.sm, textAlign: "center", marginBottom: SPACE.sm },
});
