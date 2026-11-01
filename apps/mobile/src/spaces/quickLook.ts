/**
 * Quick Look, where this build has it (ADR 0124): the iPhone's own viewer for a PDF, an Office or
 * iWork document and any other file iOS can show. It is a module of the app's own
 * (`modules/quick-look`), and a build made before it does not carry it, so it is asked for and not
 * assumed. Without it — an older build, Android, the web target — a file goes where it always went.
 */

import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export interface QuickLook {
  /** Whether Quick Look can draw this kept file. */
  readonly canPreview: (uri: string) => boolean;
  /** Show it over whatever is in front, under its own name; settles once it is up. */
  readonly preview: (uri: string, title: string) => Promise<void>;
}

let native: QuickLook | null | undefined;

export function quickLook(): QuickLook | undefined {
  native ??=
    Platform.OS === "ios" ? requireOptionalNativeModule<QuickLook>("ChipsQuickLook") : null;
  return native ?? undefined;
}
