/**
 * Words to the share sheet (ADR 0127). On an iPhone it is the app's own module
 * (`modules/share-sheet`), which holds the share sheet in a page sheet that slides up from the
 * bottom; presented by itself, as React Native's `Share.share` does, iOS 26 grows it out of the
 * row that was pressed. A build made before the module, Android and the web target have
 * `Share.share`, which is right there.
 */

import { requireOptionalNativeModule } from "expo";
import { Platform, Share } from "react-native";

interface ShareSheet {
  /** Show the sheet with these words; settles once it has gone, shared or not. */
  readonly shareText: (text: string) => Promise<void>;
}

let native: ShareSheet | null | undefined;

export async function shareText(text: string): Promise<void> {
  native ??=
    Platform.OS === "ios" ? requireOptionalNativeModule<ShareSheet>("ChipsShareSheet") : null;
  if (native !== null) return native.shareText(text);
  await Share.share({ message: text });
}
