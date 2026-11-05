/**
 * Photos and files dropped onto a space from other apps (ADR 0256, the mock's section 10;
 * `modules/menu-bar`'s `DropView`): staged in its composer, ready to send, as the + stages what it
 * picks. While something is dragged over the room, the room says where it will go.
 *
 * The room is the drop target, and the composer inside it takes what lands (`useDropInto`); a room
 * with no composer that takes files takes no drop. Where there is no module, under Node and on the
 * web, the room is only the room.
 */

import { requireNativeView, requireOptionalNativeModule } from "expo";
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { alpha } from "../ui/glassDial";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import type { Picked } from "./picked";

/** A file as the module hands it over: copied into this app's temporary folder. */
interface Dropped {
  readonly uri: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size?: number;
  readonly width?: number;
  readonly height?: number;
}

interface NativeProps {
  readonly enabled: boolean;
  readonly onDragOver: (event: { readonly nativeEvent: { readonly over: boolean } }) => void;
  readonly onDropFiles: (event: {
    readonly nativeEvent: { readonly files: readonly Dropped[] };
  }) => void;
  readonly style: ViewStyle;
  readonly children: ReactNode;
}

type Into = (files: readonly Picked[]) => void;

const DropInto = createContext<((into: Into | undefined) => void) | null>(null);

let present: boolean | undefined;
let native: ComponentType<NativeProps> | undefined;

function hasModule(): boolean {
  present ??= Platform.OS === "ios" && requireOptionalNativeModule("ChipsMenuBar") !== null;
  return present;
}

/** What the composer of the room it stands in stages a drop with; nothing while it takes no files. */
export function useDropInto(into: Into | undefined): void {
  const set = useContext(DropInto);
  useEffect(() => {
    if (set === null || into === undefined) return undefined;
    set(into);
    return () => set(undefined);
  }, [set, into]);
}

/** A room, as somewhere to drop photos and files. */
export function RoomDrop({ children }: { readonly children: ReactNode }) {
  const into = useRef<Into | undefined>(undefined);
  const [taking, setTaking] = useState(false);
  const [over, setOver] = useState(false);
  const set = useCallback((next: Into | undefined) => {
    into.current = next;
    setTaking(next !== undefined);
  }, []);
  const onDragOver = useCallback<NativeProps["onDragOver"]>(
    (event) => setOver(event.nativeEvent.over),
    [],
  );
  const onDropFiles = useCallback<NativeProps["onDropFiles"]>((event) => {
    setOver(false);
    const files = event.nativeEvent.files.map(pickedOf);
    if (files.length > 0) into.current?.(files);
  }, []);
  if (!hasModule()) {
    return (
      <View style={styles.fill}>
        <DropInto.Provider value={set}>{children}</DropInto.Provider>
      </View>
    );
  }
  native ??= requireNativeView<NativeProps>("ChipsMenuBar");
  const Native = native;
  return (
    <Native style={styles.fill} enabled={taking} onDragOver={onDragOver} onDropFiles={onDropFiles}>
      <DropInto.Provider value={set}>{children}</DropInto.Provider>
      {over ? <Over /> : null}
    </Native>
  );
}

/** Said over the room while something is dragged over it. */
function Over() {
  const palette = usePalette();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.over,
        { borderColor: palette.accent, backgroundColor: alpha(palette.accent, 0.12) },
      ]}
      testID="room-drop"
    >
      <View style={[styles.word, { backgroundColor: palette.surface }]}>
        <Icon name="clip" size={20} color={palette.ink} />
        <Text style={[styles.wordText, { color: palette.ink }]}>Drop to add to your message</Text>
      </View>
    </View>
  );
}

function pickedOf(file: Dropped): Picked {
  return {
    uri: file.uri,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    width: file.width,
    height: file.height,
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  over: {
    position: "absolute",
    top: SPACE.lg,
    left: SPACE.lg,
    right: SPACE.lg,
    bottom: SPACE.lg,
    borderWidth: 3,
    borderStyle: "dashed",
    borderRadius: RADIUS.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  word: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.lg,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  wordText: { fontSize: TEXT.lg, fontWeight: "600" },
});
