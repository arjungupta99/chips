/**
 * A voice note, playing (ADR 0054): the round button that plays and pauses it, over `expo-audio`'s
 * player, saying how far it has got as it goes. It starts as soon as it has the file, since a tap
 * is what fetched it, and goes back to the start when it ends.
 *
 * In a file of its own, loaded only where `hasAudio()` says the native half is there.
 */

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect } from "react";
import { IconButton } from "../ui/Button";

export function VoicePlayer({
  uri,
  label,
  onTime,
}: {
  readonly uri: string;
  /** What the note is called, for the button's name. */
  readonly label: string;
  /** Where it has got to, in milliseconds, while it plays. */
  readonly onTime: (ms: number) => void;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    // Heard in silent mode too: a note somebody tapped is a note they want to hear.
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
      .catch(() => undefined)
      .then(() => player.play());
  }, [player]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    void player.seekTo(0);
  }, [status.didJustFinish, player]);

  useEffect(() => {
    onTime(Math.round(status.currentTime * 1000));
  }, [status.currentTime, onTime]);

  return (
    <IconButton
      icon={status.playing ? "pause" : "play"}
      label={`${status.playing ? "Pause" : "Play"} ${label}`}
      tone="quiet"
      onPress={() => (status.playing ? player.pause() : player.play())}
      testID="voice-player"
    />
  );
}
