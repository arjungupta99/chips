/**
 * Whether this build can record and play a voice note (ADR 0054). `expo-audio` has a native half,
 * and a development build made before voice notes does not carry it: loading the module there
 * stops the app on the spot, before a room is drawn. So the attach sheet offers a voice note, and a
 * room plays one in place, only where that half is present — on the web target it is the
 * browser's own — and the two files that import `expo-audio` are loaded only then. An older build
 * still shows a voice note and its words, and opens the sound through the share sheet.
 */

import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

let present: boolean | undefined;

export function hasAudio(): boolean {
  present ??= Platform.OS === "web" || requireOptionalNativeModule("ExpoAudio") !== null;
  return present;
}
