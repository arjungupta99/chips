/**
 * The first screen, for a phone in no workspace (ADR 0213, point 9; ADR 0217's addendum of 26
 * October): the film, playing, with every way in at its end.
 *
 * At the top, in the middle, the Chips mark and its name. Under them, Watch Chips work and its
 * length, then the film in a frame as tall as the screen allows, playing at once with no sound. A
 * tap on its right goes on a part, on its left back (`FilmFace`); a finger held keeps it waiting.
 * At the foot, Scan a QR code and a gold Skip. When the film ends, or is skipped, That's Chips
 * takes its place: Scan a QR code, Have an invite link?, Have a pairing code?, the other films,
 * Look around and Watch again. Chips found on this Wi-Fi comes up from the foot when it is found
 * (ADR 0172), and the film gets smaller to make room.
 *
 * Scan a QR code opens the camera over the page (`ScanSheet`), which reads an invite, a computer's
 * pairing code, or a new phone's. Have a pairing code? opens this route again on its pairing code
 * page (`?code=1`): the code and the address, typed, with the address because six characters alone
 * say nothing about where the server is. A pairing link that did not work lands on that page with
 * what went wrong (`?problem=`). The demo's Set up my own Chips opens the first screen on That's
 * Chips (`?ways=1`).
 *
 * On an iPad (ADR 0256, the mock's section 9) every way in stands by the film from the start:
 * beside it on its side, the mark and the film's name over them; under it upright, in two columns.
 * Nothing waits for the film to end, so there is no Skip, and where it ends its frame gives way to
 * That's Chips (`WideFilm`).
 */

import { filmOf, lengthWords, workspaceLabel } from "@chipschat/core";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { type Ref, useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EndCard, type EndWays, EndWords, ForAComputer, WaysIn } from "../src/demo/EndCard";
import { Fades } from "../src/demo/FilmMotion";
import { type Film, FilmBar, FilmFace, moreThan, Skip, useFilm } from "../src/demo/FilmPlayer";
import { useLookAround, WAYS_IN } from "../src/demo/home";
import { VIDEOS, videoNamed } from "../src/demo/videos";
import { thisDevice } from "../src/device/word";
import { Big } from "../src/pairing/JoinCard";
import { FinderView, type HeldServer, OnThisWifi, useFinder } from "../src/pairing/OnThisWifi";
import { ScanSheet } from "../src/pairing/ScanSheet";
import { type Join, useJoin } from "../src/pairing/useJoin";
import { useChips } from "../src/store/provider";
import { ChipPulse } from "../src/ui/ChipPulse";
import { Icon } from "../src/ui/Icon";
import { useLayout } from "../src/ui/layout";
import { Screen, useColumn } from "../src/ui/Screen";
import { usePalette } from "../src/ui/theme";
import { LEADING_PHONE, RADIUS, SPACE, TEXT } from "../src/ui/tokens";
import { useReduceMotion } from "../src/ui/useReduceMotion";

export default function PairScreen() {
  const { began, paired } = useChips();
  const lookAround = useLookAround();
  const router = useRouter();
  const { problem, ways, code } = useLocalSearchParams<{
    problem?: string;
    ways?: string;
    code?: string;
  }>();
  const join = useJoin(problem);
  const [scanning, setScanning] = useState(false);
  // A phone in a workspace already is asked before a found server switches it (SEC-8).
  const held =
    paired === undefined
      ? undefined
      : { serverUrl: paired.device.serverUrl, workspace: workspaceLabel(paired.device) };
  const typeCode = () => router.push({ pathname: "/pair", params: { code: "1" } });

  if (code === "1" || problem !== undefined) {
    return (
      <PairingCode
        join={join}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(WAYS_IN))}
      />
    );
  }

  return (
    <>
      <Welcome
        join={join}
        held={held}
        onPaired={(device) => {
          began(device);
          router.replace("/");
        }}
        opensEnded={ways === "1"}
        scanning={scanning}
        onScan={() => setScanning(true)}
        onType={typeCode}
        onLookAround={lookAround}
      />
      <ScanSheet
        visible={scanning}
        reader={join}
        onClose={() => setScanning(false)}
        onType={() => {
          setScanning(false);
          typeCode();
        }}
      />
    </>
  );
}

/** How long the mark's pins take to light once round, as the screen opens. */
const TURN_MS = 1500;

/**
 * The Chips mark and its name, at the top in the middle, or at the start of the ways in beside an
 * iPad's film on its side (`start`); its pins light once as it opens.
 */
function Brand({ start = false }: { readonly start?: boolean }) {
  const palette = usePalette();
  const [turning, setTurning] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTurning(false), TURN_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View
      style={[styles.brand, start ? styles.brandStart : null]}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Chips"
    >
      <Big scale={2}>
        <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} working={turning} />
      </Big>
      <Text style={[styles.brandWord, { color: palette.ink }]}>Chips</Text>
    </View>
  );
}

interface WelcomeWays {
  readonly join: Join;
  readonly held: HeldServer | undefined;
  readonly onPaired: Parameters<typeof OnThisWifi>[0]["onPaired"];
  /** Opened on That's Chips, as the demo's Set up my own Chips opens it. */
  readonly opensEnded: boolean;
  /** The camera is over the page: the film waits under it. */
  readonly scanning: boolean;
  readonly onScan: () => void;
  readonly onType: () => void;
  readonly onLookAround: () => void;
}

/**
 * How the page stands: a phone's column; or on an iPad the film beside the ways in, on its side,
 * and over them, upright (ADR 0256).
 */
type Shape = "phone" | "side" | "upright";

function useShape(): Shape {
  const { roomy } = useLayout();
  const { width, height } = useWindowDimensions();
  if (!roomy) return "phone";
  return width > height ? "side" : "upright";
}

/** The page: the mark, then the film playing, or the film More walkthroughs chose. */
function Welcome(ways: WelcomeWays) {
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const shape = useShape();
  const side = shape === "side";
  const [key, setKey] = useState(filmOf().key);
  // That's Chips only for the film the page opened on; a film chosen after plays.
  const [opensEnded, setOpensEnded] = useState(ways.opensEnded);
  const video = videoNamed(key) ?? VIDEOS[0];
  return (
    <Screen testID="welcome">
      <View
        style={[
          styles.welcome,
          side
            ? [
                styles.side,
                { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xl },
              ]
            : column,
          side ? null : { paddingTop: insets.top + SPACE.sm },
        ]}
      >
        {side ? null : <Brand />}
        {video === undefined ? null : (
          <WelcomeFilm
            // A film of its own from More walkthroughs: its player is made afresh.
            key={video.key}
            {...ways}
            shape={shape}
            video={video}
            opensEnded={opensEnded}
            onFilm={(next) => {
              setOpensEnded(false);
              setKey(next);
            }}
          />
        )}
      </View>
    </Screen>
  );
}

type Video = NonNullable<ReturnType<typeof videoNamed>>;

function WelcomeFilm({
  video,
  shape,
  join,
  held,
  onPaired,
  opensEnded,
  scanning,
  onScan,
  onType,
  onFilm,
  onLookAround,
}: WelcomeWays & {
  readonly video: Video;
  readonly shape: Shape;
  readonly onFilm: (film: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const film = useFilm(video, { ended: opensEnded });
  // Under the camera, or under the pairing code page, the film waits, and plays on after.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const away = scanning || !focused;
  const wasPlaying = useRef(false);
  const { player } = film;
  useEffect(() => {
    if (away) {
      wasPlaying.current = player.playing;
      player.pause();
    } else if (wasPlaying.current) {
      wasPlaying.current = false;
      player.play();
    }
  }, [away, player]);
  const ways = { onScan, onType, onFilm, onLookAround, onWatchAgain: () => film.goTo(0) };
  if (shape !== "phone") {
    return (
      <WideFilm
        film={film}
        side={shape === "side"}
        join={join}
        held={held}
        onPaired={onPaired}
        ways={ways}
      />
    );
  }
  return (
    <>
      <Label video={video} hidden={film.ended} />
      <View style={styles.stage}>
        <Frame film={film} />
        {!film.ended ? null : (
          <Fades reduced={reduced} style={StyleSheet.absoluteFill}>
            <EndCard
              place="page"
              words={filmOf(video.key).end}
              more={moreThan(video)}
              invites={join.invites}
              ways={ways}
            />
          </Fades>
        )}
      </View>
      <View style={styles.wifi}>
        <OnThisWifi foot held={held} onPaired={onPaired} />
      </View>
      {film.ended ? (
        <View style={{ height: insets.bottom }} />
      ) : (
        <View style={[styles.foot, { paddingBottom: insets.bottom + SPACE.xs }]}>
          <Pressable
            accessibilityRole="button"
            onPress={onScan}
            hitSlop={SPACE.sm}
            style={styles.scan}
            testID="welcome-scan"
          >
            <Icon name="qr" size={20} color={palette.accent} weight={2} />
            <Text style={[styles.scanWord, { color: palette.accent }]}>Scan a QR code</Text>
          </Pressable>
          <Skip onPress={film.skip} />
        </View>
      )}
    </>
  );
}

/**
 * The first screen on an iPad (ADR 0256, the mock's section 9): every way in from the start, so
 * nothing waits for the film and there is no Skip. On its side the film stands on the left as tall
 * as the window, and the mark, the film's name and the ways in stand on the right; upright the film
 * stays on top and the ways sit under it in two columns. Where the film ends, That's Chips takes
 * its frame's place; Watch again, by it, plays it again. Chips found on this Wi-Fi joins the ways
 * when it is found: on its side under them, upright over them, where the film gets smaller to make
 * room, as on a phone. Under them, it pushed the ways up as it came, and a tap meant for Look
 * around asked a Mac on the Wi-Fi to let the iPad in (the simulator, 2 November 2026).
 */
function WideFilm({
  film,
  side,
  join,
  held,
  onPaired,
  ways,
}: {
  readonly film: Film;
  readonly side: boolean;
  readonly join: Join;
  readonly held: HeldServer | undefined;
  readonly onPaired: WelcomeWays["onPaired"];
  readonly ways: EndWays;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const { video } = film;
  const stage = (
    <View style={side ? styles.sideStage : styles.stage}>
      <Frame film={film} />
      {!film.ended ? null : (
        <Fades reduced={reduced} style={[StyleSheet.absoluteFill, styles.ended]}>
          <EndWords words={filmOf(video.key).end} />
        </Fades>
      )}
    </View>
  );
  const waysIn = <WaysIn ways={ways} more={moreThan(video)} invites={join.invites} split={!side} />;
  // Held here, over the turn between the two layouts, which draw it in different places.
  const finder = useFinder(held, onPaired);
  const wifi = <FinderView foot finder={finder} held={held} />;
  if (side) {
    return (
      <>
        {stage}
        <ScrollView
          style={styles.sideWays}
          contentContainerStyle={styles.sideWaysBody}
          showsVerticalScrollIndicator={false}
          testID="welcome-ways"
        >
          <Brand start />
          <Label video={video} start />
          {waysIn}
          {wifi}
        </ScrollView>
      </>
    );
  }
  return (
    <>
      <Label video={video} />
      {stage}
      <View style={styles.wifi}>{wifi}</View>
      <View style={styles.upWays} testID="welcome-ways">
        {waysIn}
      </View>
      <View style={{ height: insets.bottom + SPACE.md }} />
    </>
  );
}

/** The film's name and its length, over its frame, or at the start of the ways beside it. */
function Label({
  video,
  hidden = false,
  start = false,
}: {
  readonly video: Video;
  /** That's Chips stands in the film's place on a phone, and says what it is. */
  readonly hidden?: boolean;
  readonly start?: boolean;
}) {
  const palette = usePalette();
  return (
    <Text
      style={[
        styles.label,
        { color: palette.ink2 },
        start ? styles.labelStart : null,
        hidden ? styles.gone : null,
      ]}
      accessibilityElementsHidden={hidden}
    >
      {video.title}
      <Text
        style={[styles.length, { color: palette.ink3 }]}
      >{`  ${lengthWords(video.seconds)}`}</Text>
    </Text>
  );
}

/**
 * The film's frame, playing. Kept while That's Chips stands, hidden: Watch again plays the view it
 * already has.
 */
function Frame({ film }: { readonly film: Film }) {
  const palette = usePalette();
  const reduced = useReduceMotion();
  return (
    <View
      style={[styles.frame, { borderColor: palette.line }, film.ended ? styles.gone : null]}
      pointerEvents={film.ended ? "none" : "auto"}
      accessibilityElementsHidden={film.ended}
      importantForAccessibility={film.ended ? "no-hide-descendants" : "auto"}
      testID="welcome-film"
    >
      <FilmFace film={film} reduced={reduced}>
        <View style={styles.frameBar} pointerEvents="box-none">
          <FilmBar film={film} reduced={reduced} />
        </View>
      </FilmFace>
    </View>
  );
}

/**
 * The pairing code page: where a computer shows its code, and the code and its server's address,
 * typed. The keys' own return goes on to the address, then pairs.
 */
function PairingCode({ join, onBack }: { readonly join: Join; readonly onBack: () => void }) {
  const palette = usePalette();
  const router = useRouter();
  const column = useColumn();
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const addressField = useRef<TextInput>(null);
  const pair = () => join.pair(code, address);
  return (
    <Screen title={`Pair ${thisDevice()}`}>
      {/* The code and the address are the last things on the page, where the keys come up: the
          page scrolls the field being typed into above them, and what follows it (the address, or
          Pair) into sight with it, on Android as on iOS. */}
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.body, column]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={NEXT_IN_SIGHT}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={SPACE.sm}
          style={styles.back}
          testID="welcome-back"
        >
          <Icon name="previous" size={18} color={palette.accent} />
          <Text style={[styles.backWord, { color: palette.accent }]}>Back</Text>
        </Pressable>
        <Text style={[styles.hint, { color: palette.ink3 }]}>
          On your computer, open Chips, then{" "}
          <Text style={[styles.path, { color: palette.ink2 }]}>
            You → Devices → Pair another device
          </Text>
          . Type the code and the address it shows.
        </Text>
        <ForAComputer />
        <View style={styles.form}>
          <Field
            label="Pairing code"
            value={code}
            onChange={setCode}
            placeholder="ABC-234"
            autoCapitalize="characters"
            returnKeyType="next"
            onSubmit={() => addressField.current?.focus()}
          />
          <Field
            label="Server address"
            value={address}
            onChange={setAddress}
            placeholder="http://192.168.1.20:4431"
            autoCapitalize="none"
            returnKeyType="go"
            onSubmit={pair}
            inputRef={addressField}
          />
          <Action label={join.working ? "Pairing…" : "Pair"} onPress={pair} />
        </View>
        {join.failure === undefined ? null : (
          <Text style={[styles.failure, { color: palette.red }]} testID="pair-failure">
            {join.failure}
          </Text>
        )}

        {/* Pairing needs a code from a computer somebody is sitting at; the runtime checks need
            nothing at all. In development the one is reachable without the other. */}
        {__DEV__ ? (
          <Pressable accessibilityRole="button" onPress={() => router.push("/runtime")}>
            <Text style={[styles.toggle, { color: palette.ink3 }]}>Runtime checks</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

/** Between the film and the ways in beside it on an iPad, and how wide they stand. */
const SIDE_GAP = 64;
const SIDE_WAYS = 440;

/** How far above the keys a field being typed into stands: room for the Pair button under it. */
const NEXT_IN_SIGHT = 80;

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize,
  returnKeyType,
  onSubmit,
  inputRef,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder: string;
  readonly autoCapitalize: "none" | "characters";
  readonly returnKeyType: "next" | "go";
  readonly onSubmit: () => void;
  readonly inputRef?: Ref<TextInput>;
}) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[styles.label2, { color: palette.ink3 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        submitBehavior={returnKeyType === "next" ? "submit" : "blurAndSubmit"}
        returnKeyType={returnKeyType}
        ref={inputRef}
        placeholder={placeholder}
        placeholderTextColor={palette.ink3}
        style={[
          styles.input,
          { borderColor: palette.line, color: palette.ink, backgroundColor: palette.surface },
        ]}
        value={value}
      />
    </View>
  );
}

function Action({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, { backgroundColor: palette.gold }]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1 },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 44,
  },
  brandStart: { justifyContent: "flex-start" },
  brandWord: { fontSize: 31, fontWeight: "800", letterSpacing: -0.9 },
  label: {
    textAlign: "center",
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
    fontSize: TEXT.body,
    fontWeight: "600",
  },
  labelStart: { textAlign: "left", marginBottom: SPACE.lg },
  length: { fontSize: TEXT.md, fontWeight: "600", fontVariant: ["tabular-nums"] },
  gone: { opacity: 0 },
  stage: { flex: 1, minHeight: 0, paddingHorizontal: SPACE.xl, alignItems: "center" },
  // As tall as the stage, at the film's own shape: the video fills it.
  frame: {
    height: "100%",
    aspectRatio: 9 / 16,
    maxWidth: "100%",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  frameBar: { position: "absolute", top: 6, left: 12, right: 12 },
  // On an iPad on its side: the film as tall as the window on the left, the ways in on the right.
  side: { flexDirection: "row", justifyContent: "center", gap: SIDE_GAP },
  sideStage: { height: "100%", aspectRatio: 9 / 16 },
  sideWays: { width: SIDE_WAYS, flexGrow: 0 },
  sideWaysBody: { flexGrow: 1, justifyContent: "center", gap: SPACE.sm },
  upWays: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, gap: SPACE.md },
  // That's Chips in the film's place, in its middle.
  ended: { alignItems: "center", justifyContent: "center", paddingHorizontal: SPACE.xl },
  wifi: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.md },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.md,
  },
  scan: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingVertical: SPACE.sm },
  scanWord: { fontSize: TEXT.body - 1, fontWeight: "600" },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  backWord: { fontSize: TEXT.md, fontWeight: "600" },
  body: { padding: SPACE.lg, gap: SPACE.xl },
  hint: { fontSize: TEXT.md, lineHeight: Math.round(TEXT.md * LEADING_PHONE) },
  path: { fontWeight: "600" },
  form: { gap: SPACE.md },
  field: { gap: SPACE.xs },
  label2: { fontSize: TEXT.sm },
  // The one field on the screen: what a person types is body text, whatever the box around it.
  input: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACE.md, fontSize: TEXT.body },
  action: { borderRadius: RADIUS.md, padding: SPACE.md, alignItems: "center" },
  actionLabel: { fontSize: TEXT.body, fontWeight: "600", color: "#14161b" },
  toggle: { fontSize: TEXT.md, textAlign: "center" },
  failure: { fontSize: TEXT.md },
});
