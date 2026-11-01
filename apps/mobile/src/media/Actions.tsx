/**
 * What can be done with a picture, one press away (the media viewer proposal, rule 8 and figure 8):
 * the `⋯` and a long press on the picture open the app's own sheet — the same one the line's menu
 * uses, so nothing is designed twice — with six rows, and a seventh for a video.
 *
 * - **Share** hands the file as it was sent to the platform's sheet, where AirDrop, or Quick Share on
 *   Android, and every app are.
 * - **Save** puts it into Photos, or the gallery: a row of its own on both platforms, because
 *   Android's share sheet has no *Save Image* (decision 5).
 * - **Copy** puts the picture on the clipboard, to paste anywhere.
 * - **Go to message** closes the viewer onto the line it hangs under, which flashes.
 * - **Details** says the name, the size, the pixels, who sent it and when.
 * - **Open original** swaps the view copy for the file itself; absent while the original is what is
 *   showing, and for a video, which the stage does not draw at any size of its own yet.
 * - **System player**, for a video on the player: the platform's own controls, full screen, where
 *   AirPlay and captions are on iOS, since `expo-video` has no picker for either, and ExoPlayer's
 *   speed and captions are on Android, which has no AirPlay (the emulator, 15 September 2026).
 *
 * The sheet's rows do not act while the sheet is up: each is remembered and done once the sheet has
 * gone (`onGone`). A system sheet presented over a modal that is on its way down is taken down
 * with it on iOS (the attach sheet, 10 September 2026), and Go to message closes the viewer, which
 * must not start under a sheet. Details is the exception: it is this sheet, saying something else.
 */

import type { DeckItem } from "@chipschat/core";
import { formatBytes, formatDuration } from "@chipschat/core";
import { useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Sheet, SheetCard, SheetRow, SheetTitle } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

export type Action = "share" | "save" | "copy" | "go" | "original" | "system";

export function Actions({
  open,
  item,
  who,
  when,
  showingOriginal,
  canSave,
  canSystemPlayer = false,
  onAction,
  onClose,
  onGone,
}: {
  readonly open: boolean;
  readonly item: DeckItem;
  readonly who: string;
  readonly when: string;
  /** The file as it was sent is what is on the stage: nothing larger to open. */
  readonly showingOriginal: boolean;
  /** Whether this platform has a library to save into; a browser has Share's download instead. */
  readonly canSave: boolean;
  /** A video on the player, which the platform's own player can take. */
  readonly canSystemPlayer?: boolean;
  /** Called once the sheet has gone, with the row that was pressed. */
  readonly onAction: (action: Action) => void;
  readonly onClose: () => void;
  readonly onGone: () => void;
}) {
  const [details, setDetails] = useState(false);
  const chosen = useRef<Action | undefined>(undefined);
  const { attachment } = item;
  const choose = (action: Action) => {
    chosen.current = action;
    onClose();
  };
  const gone = () => {
    const action = chosen.current;
    chosen.current = undefined;
    onGone();
    if (action !== undefined) onAction(action);
  };
  return (
    <Sheet open={open} onClose={onClose} onGone={gone} testID="viewer-actions">
      <SheetTitle hint={hintOf(item, who, when)}>{attachment.filename}</SheetTitle>
      {details ? (
        <Details item={item} who={who} when={when} showingOriginal={showingOriginal} />
      ) : (
        <Rows
          item={item}
          canSave={canSave}
          canSystemPlayer={canSystemPlayer}
          showingOriginal={showingOriginal}
          onChoose={choose}
          onDetails={() => setDetails(true)}
        />
      )}
    </Sheet>
  );
}

/**
 * The six rows, less those that do not apply — Save where there is no library, and a photo's own —
 * and System player for a video on the player.
 */
function Rows({
  item,
  canSave,
  canSystemPlayer,
  showingOriginal,
  onChoose,
  onDetails,
}: {
  readonly item: DeckItem;
  readonly canSave: boolean;
  readonly canSystemPlayer: boolean;
  readonly showingOriginal: boolean;
  readonly onChoose: (action: Action) => void;
  readonly onDetails: () => void;
}) {
  const size = formatBytes(item.attachment.byteSize);
  const android = Platform.OS === "android";
  return (
    <SheetCard>
      <SheetRow
        key="share"
        icon={android ? "shareAndroid" : "share"}
        label="Share"
        hint={
          android
            ? "The share sheet: Quick Share, and every app"
            : "The share sheet: AirDrop, and every app"
        }
        onPress={() => onChoose("share")}
        testID="viewer-action-share"
      />
      {canSave ? (
        <SheetRow
          key="save"
          icon="save"
          label="Save"
          hint={android ? "Into the gallery" : "Into Photos"}
          onPress={() => onChoose("save")}
          testID="viewer-action-save"
        />
      ) : null}
      {item.kind === "photo" ? (
        <SheetRow
          key="copy"
          icon="copy"
          label="Copy"
          hint="The picture, to paste anywhere"
          onPress={() => onChoose("copy")}
          testID="viewer-action-copy"
        />
      ) : null}
      <SheetRow
        key="go"
        icon="goTo"
        label="Go to message"
        hint="Back to the space, on this line"
        onPress={() => onChoose("go")}
        testID="viewer-action-go"
      />
      <SheetRow
        key="details"
        icon="info"
        label="Details"
        hint="The name, the size, who sent it and when"
        onPress={onDetails}
        testID="viewer-action-details"
      />
      {item.kind === "photo" && !showingOriginal ? (
        <SheetRow
          key="original"
          icon="image"
          label="Open original"
          hint={`The file as it was sent, ${size}`}
          onPress={() => onChoose("original")}
          testID="viewer-action-original"
        />
      ) : null}
      {item.kind === "video" && canSystemPlayer ? (
        <SheetRow
          key="system"
          icon="systemPlayer"
          label="System player"
          hint={
            android
              ? "Full screen, with its speed and captions"
              : "Full screen, with AirPlay and captions"
          }
          onPress={() => onChoose("system")}
          testID="viewer-action-system"
        />
      ) : null}
    </SheetCard>
  );
}

/** `3.1 MB · 3024 × 4032 · Arjun · Today 11:26`, under the name. */
function hintOf(item: DeckItem, who: string, when: string): string {
  const { attachment } = item;
  const pixels =
    attachment.width !== undefined && attachment.height !== undefined
      ? ` · ${attachment.width} × ${attachment.height}`
      : "";
  return `${formatBytes(attachment.byteSize)}${pixels} · ${who} · ${when}`;
}

function Details({
  item,
  who,
  when,
  showingOriginal,
}: {
  readonly item: DeckItem;
  readonly who: string;
  readonly when: string;
  readonly showingOriginal: boolean;
}) {
  const palette = usePalette();
  const { attachment } = item;
  const rows: [string, string][] = [
    ["Name", attachment.filename],
    ["Size", formatBytes(attachment.byteSize)],
  ];
  if (attachment.width !== undefined && attachment.height !== undefined) {
    rows.push(["Pixels", `${attachment.width} × ${attachment.height}`]);
  }
  if (attachment.durationMs !== undefined) {
    rows.push(["Length", formatDuration(attachment.durationMs)]);
  }
  rows.push(["From", who], ["When", when]);
  if (item.kind === "photo") {
    rows.push([
      "Showing",
      showingOriginal
        ? "The file as it was sent, drawn at the screen's size, so it is soft when zoomed far"
        : "A copy made for viewing, no longer than 2,048 pixels on its longer side",
    ]);
  }
  return (
    <View
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}
      testID="viewer-details"
    >
      {rows.map(([label, words]) => (
        <View key={label} style={styles.detail}>
          <Text style={[styles.label, { color: palette.ink3 }]}>{label}</Text>
          <Text style={[styles.words, { color: palette.ink }]} selectable>
            {words}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.md, gap: SPACE.md },
  detail: { gap: 2 },
  label: { fontSize: TEXT.xs, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  words: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
});
