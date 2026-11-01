/**
 * What the tab bar drawn on an iPhone asks of UIKit (`modules/phone-bar`, ADR 0233).
 *
 * Whether a tab's list is being read: a view at the foot of the list's content finds the list it
 * stands in and watches its offset, and says only when the answer changes, a few times a scroll at
 * most. No offset comes to React. The tabs hand down where to tell it (`ReadingFeed`); outside the
 * tabs, off an iPhone, and in a build without the module there is nothing to tell, and nothing is
 * drawn.
 *
 * And a tab chosen as a finger on UIKit's own bar, hidden under the drawn one, would choose it, so
 * that it comes up in the frame it is pressed (`chooseTab`).
 */

import { requireNativeView, requireOptionalNativeModule } from "expo";
import { type ComponentType, createContext, useCallback, useContext } from "react";
import { Platform, StyleSheet, type ViewStyle } from "react-native";

/** Told whether the list in front is being read: given by the tabs, where the bar shrinks. */
export const ReadingFeed = createContext<((reading: boolean) => void) | null>(null);

/** Whether this list is in the tabs of a bar that shrinks. */
export function useInReadingTabs(): boolean {
  return useContext(ReadingFeed) !== null;
}

interface NativeProps {
  readonly onReading: (event: { readonly nativeEvent: { readonly reading: boolean } }) => void;
  readonly pointerEvents: "none";
  readonly style: ViewStyle;
}

interface NativeModule {
  readonly choose: (title: string) => Promise<boolean>;
}

let bar: NativeModule | null | undefined;
let native: ComponentType<NativeProps> | undefined;

function barModule(): NativeModule | null {
  bar ??= Platform.OS === "ios" ? requireOptionalNativeModule<NativeModule>("ChipsPhoneBar") : null;
  return bar;
}

/**
 * Chooses the tab named `title` as a finger on UIKit's bar would: at once, the navigator told
 * after. Pressed again, its list goes back to the top. Answers false where it could not, and the
 * router is asked instead.
 */
export async function chooseTab(title: string): Promise<boolean> {
  const found = barModule();
  if (found === null) return false;
  return found.choose(title).catch(() => false);
}

/** At the foot of a tab's list: tells the bar whether the list is being read. */
export function ReadingWatch() {
  const feed = useContext(ReadingFeed);
  const onReading = useCallback<NativeProps["onReading"]>(
    (event) => feed?.(event.nativeEvent.reading),
    [feed],
  );
  if (feed === null || barModule() === null) return null;
  native ??= requireNativeView<NativeProps>("ChipsPhoneBar");
  const Native = native;
  return <Native onReading={onReading} pointerEvents="none" style={styles.none} />;
}

const styles = StyleSheet.create({ none: { position: "absolute", width: 0, height: 0 } });
