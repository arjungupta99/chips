/**
 * A photo picked and not yet sent, looked at before it goes (the media viewer proposal, Phase 7).
 * The composer's chip opens it: the picture grows out of the chip's thumbnail onto the black stage,
 * zooms and drags away back into the chip as a sent one does, and Send stands where it stood in the
 * composer, so the thumb that checked the picture sends it from the same place.
 *
 * It is the viewer's stage and bars over a deck of one made from the file on this phone, and not
 * the room's viewer (`MediaViewer.tsx`), for two reasons. A staged photo is in no room's deck: it
 * hangs under no line, has no view copy to fetch and nothing to share, save or go to, so the bar
 * has Close and nothing else, and the caption says it is not sent yet. And Send is the composer's:
 * whether it may be pressed changes while the viewer is up, as the upload finishes, which a prop
 * from the composer follows and a request through the room's provider would not.
 *
 * The picture is the file itself, decoded for the stage the first time it is looked at, which on
 * a twelve-megapixel photo is not instant: the flight waits until the modal is up and the stage
 * has drawn it (`held`), the composer hides the chip's thumbnail only then (`onUp`), and the
 * status bar goes with the bars once they have come, as the room's viewer does (23 September 2026).
 *
 * Sending closes it with the shrink-and-fade, since the chip it came from goes with the send;
 * Close, the drag and the platform's back fly it home to the chip.
 */

import type { DeckItem, Rect } from "@chipschat/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Keyboard, Modal, type ModalProps, StyleSheet, View } from "react-native";
import { IconButton } from "../ui/Button";
import { useReduceMotion } from "../ui/useReduceMotion";
import { Chrome } from "./Chrome";
import { CHROME_AFTER_MS, HELD_AT_MOST_MS, useStatusBarHidden } from "./MediaViewer";
import { Stage, type StageItem } from "./Stage";
import { measureView } from "./tiles";
import { ViewerWindow } from "./ViewerWindow";

const ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = ["portrait", "landscape"];
/** Long enough for the keyboard to have gone before Send and the chip are measured. */
const KEYBOARD_WAIT_MS = 400;

/** The picked file, as the viewer needs it: where it is on this phone, and how big. */
export interface StagedPhoto {
  readonly localId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly uri: string;
  /** Bytes, when the picker or the upload said; nothing is said about a size not known. */
  readonly byteSize: number | undefined;
  readonly width: number;
  readonly height: number;
}

/** What a chip's press hands the viewer: the photo, and where the chip and Send are on the glass. */
export interface Looking {
  readonly photo: StagedPhoto;
  readonly from: Rect | undefined;
  readonly send: Rect | undefined;
}

type Measurable = Parameters<typeof measureView>[0];

/**
 * Everything a look needs before the viewer can open: the keyboard down, so Send is measured where
 * it will be; the picture's size, from the picker or from the file; and the two frames.
 */
export async function lookAt(
  photo: Omit<StagedPhoto, "width" | "height"> & {
    readonly width?: number | undefined;
    readonly height?: number | undefined;
  },
  chip: Measurable,
  send: Measurable,
): Promise<Looking | undefined> {
  await keyboardDown();
  const size =
    photo.width !== undefined && photo.height !== undefined && photo.width > 0 && photo.height > 0
      ? { width: photo.width, height: photo.height }
      : await sizeOf(photo.uri);
  if (size === undefined) return undefined;
  const [from, sendFrame] = await Promise.all([measureView(chip), measureView(send)]);
  return { photo: { ...photo, ...size }, from, send: sendFrame };
}

function keyboardDown(): Promise<void> {
  if (!Keyboard.isVisible()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, KEYBOARD_WAIT_MS);
    const listener = Keyboard.addListener("keyboardDidHide", done);
    function done() {
      clearTimeout(timer);
      listener.remove();
      resolve();
    }
    Keyboard.dismiss();
  });
}

function sizeOf(uri: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) =>
    Image.getSize(
      uri,
      (width, height) => resolve(width > 0 && height > 0 ? { width, height } : undefined),
      () => resolve(undefined),
    ),
  );
}

/** The deck item the bars describe: the file's name, its size and its shape, said by nobody yet. */
function itemOf(photo: StagedPhoto): DeckItem {
  return {
    attachment: {
      id: photo.localId,
      filename: photo.name,
      mimeType: photo.mimeType,
      byteSize: photo.byteSize ?? 0,
      width: photo.width,
      height: photo.height,
    },
    lineId: "",
    saidBy: "",
    ts: new Date().toISOString(),
    kind: "photo",
    inMessage: { index: 1, of: 1 },
  };
}

export function StagedViewer({
  looking,
  sendDisabled,
  onSend,
  chip,
  onUp,
  onGone,
}: {
  readonly looking: Looking;
  /** Send as the composer has it: held while an upload is still going. */
  readonly sendDisabled: boolean;
  readonly onSend: () => void;
  /** Where the chip's thumbnail is now, to fly home to; nothing once the chip has gone. */
  readonly chip: () => Promise<Rect | undefined>;
  /** The viewer is up over the composer and has drawn the picture: the chip may hide its thumbnail. */
  readonly onUp: () => void;
  /** The viewer has closed and is gone: the chip draws its thumbnail again. */
  readonly onGone: () => void;
}) {
  const { photo, from, send } = looking;
  const still = useReduceMotion();
  const [chrome, setChrome] = useState(false);
  const [going, setGoing] = useState(false);
  const [closing, setClosing] = useState<
    { readonly to: Rect | undefined; readonly within: Rect | undefined } | undefined
  >();
  const leaving = useRef(false);
  const item = useMemo(() => itemOf(photo), [photo]);
  // The file is the thumbnail and the picture both: drawn once, with no fade, as the stage draws
  // a thumbnail; `original`, so it is decoded at the screen's size and not in full.
  const items = useMemo<readonly StageItem[]>(
    () => [
      {
        id: photo.localId,
        kind: "photo",
        content: { width: photo.width, height: photo.height },
        thumb: photo.uri,
        picture: undefined,
        original: true,
      },
    ],
    [photo],
  );
  useArrival(setChrome);
  const way = useWay(onUp);
  const statusBarHidden = useStatusBarHidden(chrome, going);

  const leave = useCallback(
    (home: boolean) => {
      if (leaving.current) return;
      leaving.current = true;
      setChrome(false);
      setGoing(true);
      if (still || !home) {
        setClosing({ to: undefined, within: undefined });
        return;
      }
      void chip().then((to) => setClosing({ to, within: undefined }));
    },
    [still, chip],
  );
  const close = useCallback(() => leave(true), [leave]);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={ORIENTATIONS}
      onRequestClose={close}
      onShow={way.shown}
      testID="staged-viewer"
    >
      <ViewerWindow statusBarHidden={statusBarHidden} />
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={close}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Photo, ${photo.name}, not sent yet`}
        >
          <Stage
            items={items}
            index={0}
            from={from}
            within={undefined}
            still={still}
            held={way.held}
            closing={closing}
            onNext={nothing}
            onPrevious={nothing}
            onDismiss={close}
            onOpened={nothing}
            onDrawn={way.drawn}
            onClosed={onGone}
            onChrome={(shown) => setChrome(shown && !leaving.current)}
            onTap={() => {
              if (!leaving.current) setChrome((now) => !now);
            }}
            onMenu={nothing}
          />
        </View>
        <Chrome
          shown={chrome}
          item={item}
          deck={[item]}
          who={YOU}
          when="Not sent yet"
          onClose={close}
          footRoom={send === undefined ? 0 : send.width + SEND_GAP * 2}
        />
        {send === undefined ? null : (
          // Where the composer's Send is, the size it is there, and pressed as it would be there.
          <View
            style={[
              styles.send,
              { left: send.x, top: send.y, width: send.width, height: send.height },
            ]}
            testID="staged-viewer-send-place"
          >
            <IconButton
              icon="up"
              label="Send"
              size={send.width}
              disabled={sendDisabled}
              onPress={() => {
                onSend();
                leave(false);
              }}
              testID="staged-viewer-send"
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const YOU = { name: "You", kind: "person" } as const;
/** The room the caption leaves Send, either side of it. */
const SEND_GAP = 8;

function nothing() {}

/** The bars come in a beat after the picture begins to move, as the room's viewer's do. */
function useArrival(setChrome: (shown: boolean) => void) {
  useEffect(() => {
    const timer = setTimeout(() => setChrome(true), CHROME_AFTER_MS);
    return () => clearTimeout(timer);
  }, [setChrome]);
}

/**
 * Whether the way is clear for the flight: the modal up over the composer and the picture drawn
 * on the stage, both, at which point the composer is told (`onUp`) so the chip can hide its
 * thumbnail under the picture — the room's viewer's rule (`useFollow`), for the same hole. A
 * picture that has not been drawn `HELD_AT_MOST_MS` after the modal is up lets the flight go
 * anyway.
 */
function useWay(onUp: () => void): {
  readonly shown: () => void;
  readonly drawn: () => void;
  readonly held: boolean;
} {
  const [held, setHeld] = useState(true);
  const up = useRef({ shown: false, drawn: false, told: false });
  const latest = useRef(onUp);
  latest.current = onUp;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useMemo(() => {
    const clear = () => {
      if (!up.current.shown || !up.current.drawn || up.current.told) return;
      up.current.told = true;
      setHeld(false);
      latest.current();
    };
    return {
      shown: () => {
        up.current.shown = true;
        clear();
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setHeld(false), HELD_AT_MOST_MS);
      },
      drawn: () => {
        up.current.drawn = true;
        clear();
      },
      held,
    };
  }, [held]);
}

const styles = StyleSheet.create({
  send: { position: "absolute", alignItems: "center", justifyContent: "center" },
});
