/**
 * A list and the thing it opens, side by side: the Spaces and the room, the fleet and a
 * profile. Only on a wide screen — the route that renders this decides, from `useLayout`, and
 * on a phone renders the list alone and pushes the thing it opens.
 *
 * The list keeps a fixed width and the detail takes the rest, which is the desktop's own
 * proportion and the one every mail and messages app on an iPad has taught a thumb to expect.
 *
 * Each side says which it is (`useSplitSide`): a screen's name in the list stays at the list's
 * own edge, where a name on a page of its own lines up with the column the page is (`Screen`).
 */

import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet, View } from "react-native";
import { usePalette } from "./theme";

/** The list's width. Enough for a title and a line of preview; the room is what needs the room. */
export const LIST_WIDTH = 360;

type Side = "list" | "detail";

const SideContext = createContext<Side | undefined>(undefined);

/** Which side of a split this is drawn on, or nothing outside one. */
export function useSplitSide(): Side | undefined {
  return useContext(SideContext);
}

export function Split({ list, detail }: { readonly list: ReactNode; readonly detail: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.row} testID="split">
      <View style={[styles.list, { borderColor: palette.line }]}>
        <SideContext.Provider value="list">{list}</SideContext.Provider>
      </View>
      <View style={styles.detail}>
        <SideContext.Provider value="detail">{detail}</SideContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  list: { width: LIST_WIDTH, borderRightWidth: StyleSheet.hairlineWidth },
  detail: { flex: 1 },
});
