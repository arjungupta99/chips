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
 */

import { filmOf, lengthWords, workspaceLabel } from "@chipschat/core";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { type Ref, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EndCard } from "../src/demo/EndCard";
import { Fades } from "../src/demo/FilmMotion";
import { FilmBar, FilmFace, moreThan, Skip, useFilm } from "../src/demo/FilmPlayer";
import { useLookAround } from "../src/demo/home";
import { VIDEOS, videoNamed } from "../src/demo/videos";
import { Big } from "../src/pairing/JoinCard";
import { type HeldServer, OnThisWifi } from "../src/pairing/OnThisWifi";
import { ScanSheet } from "../src/pairing/ScanSheet";
import { type Join, useJoin } from "../src/pairing/useJoin";
import { useChips } from "../src/store/provider";
import { ChipPulse } from "../src/ui/ChipPulse";
import { Icon } from "../src/ui/Icon";
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
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/pair"))}
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

/** The Chips mark and its name, at the top in the middle; its pins light once as it opens. */
function Brand() {
  const palette = usePalette();
  const [turning, setTurning] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTurning(false), TURN_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="Chips">
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

/** The page: the mark, then the film playing, or the film More walkthroughs chose. */
function Welcome(ways: WelcomeWays) {
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const [key, setKey] = useState(filmOf().key);
  // That's Chips only for the film the page opened on; a film chosen after plays.
  const [opensEnded, setOpensEnded] = useState(ways.opensEnded);
  const video = videoNamed(key) ?? VIDEOS[0];
  return (
    <Screen testID="welcome">
      <View style={[styles.welcome, column, { paddingTop: insets.top + SPACE.sm }]}>
        <Brand />
        {video === undefined ? null : (
          <WelcomeFilm
            // A film of its own from More walkthroughs: its player is made afresh.
            key={video.key}
            {...ways}
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

function WelcomeFilm({
  video,
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
  readonly video: NonNullable<ReturnType<typeof videoNamed>>;
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
  return (
    <>
      <Text
        style={[styles.label, { color: palette.ink2 }, film.ended ? styles.gone : null]}
        accessibilityElementsHidden={film.ended}
      >
        {video.title}
        <Text
          style={[styles.length, { color: palette.ink3 }]}
        >{`  ${lengthWords(video.seconds)}`}</Text>
      </Text>
      <View style={styles.stage}>
        {/* Kept while That's Chips stands, hidden: Watch again plays the view it already has. */}
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
        {!film.ended ? null : (
          <Fades reduced={reduced} style={StyleSheet.absoluteFill}>
            <EndCard
              place="page"
              words={filmOf(video.key).end}
              more={moreThan(video)}
              invites={join.invites}
              ways={{ onScan, onType, onFilm, onLookAround, onWatchAgain: () => film.goTo(0) }}
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
    <Screen title="Pair this phone">
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
  brandWord: { fontSize: 31, fontWeight: "800", letterSpacing: -0.9 },
  label: {
    textAlign: "center",
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
    fontSize: TEXT.body,
    fontWeight: "600",
  },
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
