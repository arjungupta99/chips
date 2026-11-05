/**
 * What has to be in place before a screen that animates can be rendered under Node.
 *
 * Gesture handler ships a setup file that mocks its own native side. Its swipeable component is
 * mocked here as well, and deliberately: it pulls in Reanimated, which pulls in
 * `react-native-worklets`, which reaches for a native module that does not exist under Jest and
 * throws while it is still being imported — so a screen holding a card cannot even be required.
 * Reanimated's own `mock` entry does not help, because in 4.x it imports the real index too.
 *
 * What this costs is worth naming: no test in this app can assert that a swipe animates, or
 * that the gesture is recognised at all. That belongs to the Maestro flows, on a device, and
 * they exist for exactly this. What these tests still prove is everything either side of the
 * gesture — the words, the buttons, the call that reaches the store — which is where the bugs
 * have been.
 */

require("react-native-gesture-handler/jestSetup");

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  // Required inside the factory: Jest forbids a mock from closing over anything outside it.
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: ({ children, testID }) => react.createElement(View, { testID }, children),
  };
});

// The system's time wheel is a native view with nothing under Node to draw it. What stands in
// carries its props, so a test turns it by calling `onValueChange` as the wheel would (ADR 0085).
jest.mock("@react-native-community/datetimepicker", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (props) => react.createElement(View, props),
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

// The one file of ours that imports Reanimated, for the same reason and with the same cost: it
// watches the swipe cross the line where letting go decides, and clicks. See `needs/Crossing.tsx`.
jest.mock("./src/needs/Crossing", () => ({ Crossing: () => null }));

// The Connection page's route (`you/ConnectionRoute.tsx`, ADR 0211), drawn and run on Reanimated.
// What stands in says what the route says to a screen reader, which is what a test reads.
jest.mock("./src/you/ConnectionRoute", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    Route: ({ direct, relayHost, machine }) =>
      react.createElement(View, {
        accessibilityLabel: direct
          ? `This phone straight to ${machine}`
          : `This phone through ${relayHost} to ${machine}`,
        testID: "connection-route",
      }),
  };
});

// What a swiped row slides off (`spaces/SwipeDiscs.tsx`, ADR 0178): the discs, and the row's
// edge rounding as it goes, both on Reanimated. The swipeable above never draws its buttons
// here anyway; the acts are reached through the rows' accessibility actions.
jest.mock("./src/spaces/SwipeDiscs", () => {
  const react = require("react");
  // A row going off its edge (ADR 0205's addendum) is off at once.
  function Going({ going, onGone, children }) {
    react.useEffect(() => {
      if (going !== undefined) onGone();
    }, [going]);
    return children;
  }
  return {
    Discs: () => null,
    Going,
    useRowEdge: () => ({ travel: undefined, style: undefined }),
    useTrayFade: () => undefined,
  };
});

// What moves while the Spaces list or the Agents tab picks rows (`spaces/SelectMotion.tsx`, ADRs
// 0181 and 0182): the words
// moving over for a circle, the chevron fading, the bar rising, a row folding away, and the list's
// dust, and a count read away. What stands in draws each row as it is and the bar while it is shown, and a fold lands at
// once, so a test still presses the rows, the acts and the sheets, and sees a row go. The circles
// themselves are not drawn: a row says whether it is picked as a checkbox, which is what is read.
jest.mock("./src/spaces/SelectMotion", () => {
  const react = require("react");
  const { Text, View } = require("react-native");
  function Fold({ folding, onFolded, children }) {
    react.useEffect(() => {
      if (folding) onFolded();
    }, [folding]);
    return children;
  }
  // A row a pin moves (ADR 0240) is simply in its new place.
  function Glide({ children }) {
    return children;
  }
  // A row landing in its new run (ADR 0205's addendum) has landed at once.
  function Land({ from, onLanded, children }) {
    react.useEffect(() => {
      if (from === "left" || from === "right") onLanded?.();
    }, []);
    return children;
  }
  // The rows are drawn for picking at once, as nothing moves here (`ROWS_REDRAWN_MS`).
  const PickMotion = react.createContext(undefined);
  return {
    LEAD: 38,
    PickMotion,
    usePickMotion: () => undefined,
    ROWS_REDRAWN_MS: 0,
    PickRow: ({ style, children }) => react.createElement(View, { style }, children),
    Shifted: ({ style, children }) => react.createElement(View, { style }, children),
    ShiftedText: (props) => react.createElement(Text, props),
    Fade: ({ children }) => children,
    StepBack: ({ back, children }) =>
      react.createElement(View, { pointerEvents: back ? "none" : "auto" }, children),
    Rise: ({ shown, style, children }) =>
      shown ? react.createElement(View, { style, pointerEvents: "box-none" }, children) : null,
    RiseBehind: ({ shown, children }) => (shown ? children : null),
    RiseRoom: ({ shown, height, gap }) =>
      shown
        ? react.createElement(View, { testID: "pick-room", style: { height, marginTop: -gap } })
        : null,
    ActDisc: () => null,
    readWave: () => undefined,
    Counted: ({ count, children }) => (count > 0 ? children(count) : null),
    Fold,
    Glide,
    Land,
    Blink: ({ children }) => children,
    ListDust: () => null,
    Turned: ({ children }) => children,
    // Hidden's and Archived's rooms (ADR 0205) are there the render they are shown, and gone the
    // render they are put away.
    Unfold: ({ shown, children }) => (shown ? children : null),
  };
});

// The line under a screen's name coming and going (`ui/UnderMotion.tsx`): Select all while a list
// picks, Search's chips. Under Node its room is open from the render it comes in, and shut with
// it, so a test reads the list laid out as it ends up; that it glides is the simulator's to show.
jest.mock("./src/ui/UnderMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    useGlide: (open) => ({ at: undefined, laid: undefined, there: open }),
    UnderRoom: ({ height }) =>
      react.createElement(View, { testID: "under-room", style: { height } }),
    UnderBody: ({ style, children }) =>
      react.createElement(View, { testID: "under-body", style }, children),
    UnderLine: ({ style, children }) => react.createElement(View, { style }, children),
    UnderBand: ({ children }) => children,
    UnderShelf: ({ height, children }) =>
      react.createElement(View, { style: { height } }, children),
  };
});

// Words crossfading in place (`ui/Swap.tsx`): a screen's name, Select and Done. Under Node they are
// the words as they are now.
jest.mock("./src/ui/Swap", () => ({ Swap: ({ children }) => children }));

// How an iPad's tabs move between the capsule and the sidebar (`src/ui/SidebarMotion.tsx`, ADR
// 0276), on Reanimated: under Node each piece simply stands at its frame, and what has faded is
// not drawn.
jest.mock("./src/ui/SidebarMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    Moving: ({ frame, style, pointerEvents, testID, children }) =>
      react.createElement(
        View,
        { pointerEvents, testID, style: [{ position: "absolute" }, style, frame] },
        children,
      ),
    Fading: ({ shown, style, pointerEvents, children }) =>
      shown ? react.createElement(View, { style, pointerEvents }, children) : null,
  };
});

// How the panes beside an iPad's list move (`src/ui/PaneMotion.tsx`, ADR 0276), on Reanimated:
// under Node a box simply stands at its width, and what has gone is gone at once.
jest.mock("./src/ui/PaneMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    Widening: ({ width, style, testID, children }) =>
      react.createElement(View, { style: [style, { width }], testID }, children),
    useKept: (value) => value,
  };
});

// How Spaces moves as the workspace in front changes (`ui/SwitchMotion.tsx`, ADR 0197), on
// Reanimated: under Node a row is simply there, what is being replaced is out of reach of a tap
// while it waits, and the line under the name is a view a test can find.
jest.mock("./src/ui/SwitchMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    RiseIn: ({ children }) => children,
    Settling: ({ busy, style, children }) =>
      react.createElement(View, { style, pointerEvents: busy ? "none" : "auto" }, children),
    Sweep: ({ style, testID }) => react.createElement(View, { style, testID }),
  };
});

// How People, a person's page and Invite someone move (`src/people/PeopleMotion.tsx`, ADR 0209),
// on Reanimated: under Node a face or a row is simply there, a folded face is not drawn at all, the
// filter's ink and a link's glow are not drawn, and the join card is a view a test can find.
jest.mock("./src/people/PeopleMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    PopIn: ({ style, children }) => react.createElement(View, { style }, children),
    Folding: ({ on, children }) => (on ? children : null),
    Glides: ({ children }) => children,
    Thumb: () => null,
    Lit: ({ children }) => children,
    RisesIn: ({ style, testID, children }) =>
      react.createElement(View, { style, testID }, children),
  };
});

// How Search's results come and go (`src/search/ResultsMotion.tsx`, ADR 0189), on Reanimated: under
// Node the list is a plain list, a row is simply there and gone, and a ghost row is still.
jest.mock("./src/search/ResultsMotion", () => {
  const react = require("react");
  const { FlatList, View } = require("react-native");
  return {
    __esModule: true,
    MovingList: (props) => react.createElement(FlatList, props),
    Arriving: ({ children }) => children,
    Breathing: ({ style, children }) => react.createElement(View, { style }, children),
  };
});

// An agent's context window drawn as bars (`agents/window/GaugeBars.tsx`, ADR 0146) is dragged on
// Reanimated and the gesture handler. What stands in carries its props, so a test lets the marker
// go at a limit by calling `onPick`, as letting go would, and taps it quiet with `onQuiet`; it says
// where the marker stands, how many bars are lit, the window's size and its last long turn's words.
// That the drag snaps, and the faint bars past the fill, are the simulator's to show.
jest.mock("./src/agents/window/GaugeBars", () => {
  const react = require("react");
  const { Text, View } = require("react-native");
  return {
    GaugeBars: (props) =>
      react.createElement(
        View,
        { ...props, testID: "window-bars" },
        react.createElement(
          Text,
          { testID: "window-marker" },
          props.marker === undefined ? "no marker" : `${props.marker}%`,
        ),
        react.createElement(Text, { testID: "window-lit" }, `${props.lit} lit`),
        react.createElement(Text, { testID: "window-end" }, props.end),
        props.ghost === undefined
          ? null
          : react.createElement(
              Text,
              { testID: "window-ghost" },
              `${props.ghost.words} ${props.ghost.percent}, ${props.ghost.bars} bars`,
            ),
      ),
  };
});

// A job's fourteen days as bars (`harnesses/jobs/DayBars.tsx`, ADR 0252), risen on Reanimated.
// What stands in is a button a day with its words, pressed as a bar is; the rise is the simulator's.
jest.mock("./src/harnesses/jobs/DayBars", () => {
  const react = require("react");
  const { Pressable, Text, View } = require("react-native");
  return {
    DayBars: ({ days, onPick }) =>
      react.createElement(
        View,
        { testID: "job-bars" },
        days.map((day, at) =>
          react.createElement(
            Pressable,
            {
              key: day.at,
              testID: `job-bar-${at}`,
              onPress: day.runs > 0 ? () => onPick(at) : undefined,
            },
            react.createElement(Text, null, `${day.label}: ${day.runs}`),
          ),
        ),
      ),
  };
});

// A table too wide for its bubble (`spaces/WideTable.tsx`, ADR 0186) fades its sides and lights
// its column dots on Reanimated, as it scrolls. What stands in is its scroller and a dot per
// column, so a test still finds the table's words and sees how many dots it was given; the fade
// and the capsule moving are the simulator's to show.
jest.mock("./src/spaces/WideTable", () => {
  const react = require("react");
  const { ScrollView, View } = require("react-native");
  return {
    WideTable: ({ layout, children }) =>
      react.createElement(
        View,
        null,
        react.createElement(
          View,
          { testID: "md-table-dots" },
          layout.columns.map((_, index) =>
            react.createElement(View, { key: index, testID: "md-table-dot" }),
          ),
        ),
        react.createElement(
          ScrollView,
          {
            horizontal: true,
            testID: "md-table-scrolls",
            contentContainerStyle: { width: layout.width },
          },
          children,
        ),
      ),
  };
});

// The mark's room beside Universe or Select's word opens on Reanimated (`ui/MarkBeside.tsx`). What
// stands in is the row it opens in, the mark and what stands beside it; that it opens a frame at a
// time is the simulator's to show, and the launch's e2e measures it on the web.
jest.mock("./src/ui/MarkBeside", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    MarkBeside: ({ mark, style, children }) =>
      children === null
        ? mark
        : react.createElement(
            View,
            { style: [{ flexDirection: "row", alignItems: "center" }, style] },
            mark,
            children,
          ),
  };
});

// Search's Cancel rides in on Reanimated (`ui/SearchCancel.tsx`). What stands in is the Cancel
// itself, there while the field is in use, so a test still presses it; that it slides is the
// simulator's to show.
jest.mock("./src/ui/SearchCancel", () => {
  const react = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    SearchCancel: ({ shown, onPress, testID }) =>
      shown
        ? react.createElement(
            Pressable,
            { accessibilityRole: "button", accessibilityLabel: "Cancel", onPress, testID },
            react.createElement(Text, null, "Cancel"),
          )
        : null,
  };
});

/*
 * The media viewer's stage is the other: the viewer's one Reanimated and gesture handler import
 * (`media/Stage.tsx`), mocked for the same reason and at the same cost. No test here can assert
 * that a swipe pages, a pinch zooms, a drag clears the backdrop or a picture flies back into its
 * tile; the simulator, the emulator and `e2e/maestro/viewer.yaml` are where those are asked. What
 * stands in its place draws the item the viewer is on — its picture over its thumbnail, as the
 * stage would, and for a video what the viewer gives it to draw over the poster (the player, the
 * ring) — and carries the stage's props, so a test can call `onNext`, `onPrevious`, `onDismiss`,
 * `onTap` and `onDragging` as a gesture would; it lands a close at once, as the flight would at
 * its end, and an opening too, unless a test holds it (`holds.opening`) to watch what waits on it;
 * and it says it has drawn whenever it has a picture to draw, as expo-image says it has displayed
 * a source.
 */
jest.mock("./src/media/Stage", () => {
  const react = require("react");
  const { View } = require("react-native");
  const { Image } = require("expo-image");
  const holds = { opening: false };
  function Stage(props) {
    const { items, index, closing, onClosed, onOpened, onDrawn } = props;
    react.useEffect(() => {
      if (closing !== undefined) onClosed();
    }, [closing, onClosed]);
    react.useEffect(() => {
      if (!holds.opening) onOpened?.();
    }, [onOpened]);
    const item = items[index];
    const shown = item?.picture ?? item?.thumb;
    react.useEffect(() => {
      if (shown !== undefined) onDrawn?.();
    }, [shown, onDrawn]);
    return react.createElement(
      View,
      { ...props, testID: "stage" },
      item === undefined || shown === undefined
        ? null
        : react.createElement(Image, {
            source: { uri: shown },
            placeholder: item.thumb === undefined ? undefined : { uri: item.thumb },
            testID: `stage-picture-${item.id}`,
          }),
      props.video ?? null,
    );
  }
  return { __esModule: true, GUTTER: 20, Stage, holds };
});

/*
 * The keyboard controller is a native module and a set of native views, and the library ships
 * the mock for them: the provider and the avoiding view become plain views, the keyboard's
 * animated values sit at zero, and the module's methods are spies. So a test here proves what
 * the room draws around the keyboard, never that the composer rides it — that is the device's
 * to prove, and the Maestro flow beside this file is where it is asked for.
 */
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);

/*
 * Haptics are a native engine: under Node there is nothing to feel, so the module is spies and
 * its two enums. A test can prove that a screen asked for the right feeling at the right moment
 * — which is the part that goes wrong, a Send that buzzes twice or an approval that is silent —
 * and nothing about what the engine then does, which is the device's and the Maestro flow's.
 */
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
    Soft: "soft",
    Rigid: "rigid",
  },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  AndroidHaptics: {
    Confirm: "confirm",
    Reject: "reject",
    Clock_Tick: "clock-tick",
    Long_Press: "long-press",
    Virtual_Key: "virtual-key",
    Segment_Frequent_Tick: "segment-frequent-tick",
  },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  performAndroidHapticsAsync: jest.fn(async () => undefined),
}));

/*
 * The media modules (M4.4) reach for native views and modules Jest does not have: the pickers,
 * the file system, sharing and the video player. Each is mocked to its shape and nothing
 * happens; a test that wants a picker to give something mocks `spaces/pick` itself.
 */
jest.mock("expo-image-picker", () => ({
  UIImagePickerPreferredAssetRepresentationMode: {
    Automatic: "automatic",
    Compatible: "compatible",
  },
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
// A file or a folder is its URI, a folder's child its URI and its name; a copy goes nowhere, so a
// file that leaves under its sent name (`asSent` in `spaces/local.ts`) is read by where it went.
jest.mock("expo-file-system", () => {
  const uriOf = (where, name) => (name === undefined ? String(where) : `${where.uri}/${name}`);
  return {
    File: class {
      constructor(where, name) {
        this.uri = uriOf(where, name);
      }
      async base64() {
        return `base64 of ${this.uri}`;
      }
      copy() {}
      write() {}
    },
    Directory: class {
      constructor(where, name) {
        this.uri = uriOf(where, name);
        this.exists = false;
      }
      delete() {}
      create() {}
    },
    Paths: { cache: { uri: "file:///cache" } },
  };
});
/*
 * The viewer's three (M4.4, media viewer Phase 1): `expo-image` draws a view that keeps `source`
 * and `placeholder` as props, so a test can read which picture stands in for which; Save and Copy
 * are spies a test reads, and the library's permission is granted unless a test says otherwise.
 */
jest.mock("expo-image", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    Image: (props) => react.createElement(View, props),
  };
});
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Asset: { create: jest.fn(async (uri) => ({ id: `asset of ${uri}` })) },
}));
jest.mock("expo-clipboard", () => {
  const react = jest.requireActual("react");
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    getStringAsync: jest.fn(async () => ""),
    setImageAsync: jest.fn(async () => undefined),
    setStringAsync: jest.fn(async () => undefined),
    // iOS's own Paste button: off unless a test turns it on, and pressed hands over `pasteText`.
    isPasteButtonAvailable: false,
    pasteText: "",
    ClipboardPasteButton: ({ onPress, testID }) =>
      react.createElement(
        Pressable,
        {
          accessibilityRole: "button",
          testID,
          onPress: () =>
            onPress({ type: "text", text: jest.requireMock("expo-clipboard").pasteText }),
        },
        react.createElement(Text, null, "Paste"),
      ),
  };
});
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => undefined),
}));
/*
 * Voice notes (ADR 0054): the build under test carries `expo-audio`'s native half, unless a test
 * says otherwise through `hasAudio`. The recorder is one shared fake a test can read and drive:
 * what it recorded, and how long it has been going.
 */
jest.mock("./src/spaces/audio", () => ({ hasAudio: jest.fn(() => true) }));
/*
 * Pages (ADR 0059): the build under test carries `react-native-webview`'s native half, unless a
 * test says otherwise through `hasPageView`. The web view is a view that keeps its props, so a
 * test reads what it was handed — the document, and the rule every load is put to.
 */
jest.mock("./src/spaces/pages", () => ({
  ...jest.requireActual("./src/spaces/pages"),
  hasPageView: jest.fn(() => true),
}));
jest.mock("react-native-webview", () => {
  const react = require("react");
  const { View } = require("react-native");
  return { WebView: (props) => react.createElement(View, { ...props, testID: props.testID }) };
});
jest.mock("expo-audio", () => {
  const recorder = {
    uri: null,
    durationMillis: 0,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(() => {
      recorder.uri = "file:///cache/recording-1.m4a";
    }),
    stop: jest.fn(async () => undefined),
  };
  const player = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => undefined) };
  return {
    __esModule: true,
    recorder,
    player,
    RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ isRecording: false, durationMillis: recorder.durationMillis }),
    useAudioPlayer: () => player,
    useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, didJustFinish: false }),
  };
});
/*
 * The video player (the media viewer, Phase 2) is a fake a test drives: it keeps what it was given
 * to play, says so through the same events `expo-video`'s player emits — playing, muted, the time
 * — and plays at once when told, with nothing decoded. Every player made is in `players`, newest
 * last, so a test can move its clock or read where it stands. The viewer makes one the first time
 * a video is landed on (`createVideoPlayer`) and releases it as it goes, before its later effects
 * are cleaned up, and a released player throws when it is asked anything. The view keeps its props, and its
 * Picture in Picture and full screen are spies on `view`.
 */
jest.mock("expo-video", () => {
  const react = require("react");
  const { View } = require("react-native");
  class FakePlayer {
    constructor() {
      this.listeners = new Map();
      this.released = false;
      this.source = null;
      this.playing = false;
      this.time = 0;
      this.duration = 0;
      this.bufferedPosition = 0;
      this.loop = false;
      this.timeUpdateEventInterval = 0;
      this.quiet = false;
    }
    alive() {
      if (this.released) {
        throw new Error(
          "Unable to find the native shared object associated with given JavaScript object",
        );
      }
    }
    get currentTime() {
      this.alive();
      return this.time;
    }
    set currentTime(value) {
      this.alive();
      this.time = value;
    }
    get muted() {
      return this.quiet;
    }
    set muted(value) {
      this.quiet = value;
      this.emit("mutedChange", { muted: value });
    }
    addListener(name, listener) {
      const here = this.listeners.get(name) ?? new Set();
      here.add(listener);
      this.listeners.set(name, here);
      return { remove: () => here.delete(listener) };
    }
    emit(name, payload) {
      for (const listener of [...(this.listeners.get(name) ?? [])]) listener(payload);
    }
    async replaceAsync(source) {
      this.source = source;
      this.emit("statusChange", { status: "readyToPlay" });
    }
    play() {
      this.alive();
      if (this.playing) return;
      this.playing = true;
      this.emit("playingChange", { isPlaying: true });
    }
    pause() {
      this.alive();
      if (!this.playing) return;
      this.playing = false;
      this.emit("playingChange", { isPlaying: false });
    }
    release() {
      this.released = true;
    }
    // A frame per time asked, as a plain object standing for the native image it would be. As on
    // iOS, a player has nothing to read until its source is loaded (`replaceAsync`): a source given
    // to `createVideoPlayer` is still loading when the call comes, and iOS answers with no frames.
    async generateThumbnailsAsync(times, options) {
      this.alive();
      this.thumbnailsAsked = { times, options };
      if (this.source === null) return [];
      return (Array.isArray(times) ? times : [times]).map((time) => ({
        requestedTime: time,
        actualTime: time,
        width: 240,
        height: 135,
      }));
    }
  }
  const players = [];
  const view = {
    startPictureInPicture: jest.fn(async () => undefined),
    enterFullscreen: jest.fn(async () => undefined),
  };
  return {
    __esModule: true,
    players,
    view,
    isPictureInPictureSupported: () => true,
    createVideoPlayer: () => {
      const made = new FakePlayer();
      players.push(made);
      return made;
    },
    useVideoPlayer: (_source, setup) => {
      const [player] = react.useState(() => {
        const made = new FakePlayer();
        setup?.(made);
        players.push(made);
        return made;
      });
      react.useEffect(
        () => () => {
          player.released = true;
        },
        [player],
      );
      return player;
    },
    VideoView: react.forwardRef((props, ref) => {
      react.useImperativeHandle(ref, () => view);
      return react.createElement(View, props);
    }),
  };
});

// Scroll colours are UI-thread worklets. Native scrolling proves their geometry; component
// tests retain the real FlatList so positioning, anchors and text actions remain covered.
jest.mock("./src/spaces/ScrollColours", () => {
  const react = require("react");
  const { FlatList, View } = require("react-native");
  // The field the room makes for its list, as plain boxes, never measured: one for every room, at
  // the foot until a test says how far up it is (`colourField.scroll.value`).
  const colourField = {
    scroll: { value: 0 },
    layout: { value: 0 },
    viewportTop: { value: 0 },
    viewportHeight: { value: 0 },
    top: { value: 0 },
    still: false,
    list: react.createRef(),
    // The room moves on its own transition (`src/spaces/RoomMotion.tsx`), as it does on a phone.
    moves: true,
    // Up the history as the room's transition says, which a test sets with the scroll.
    far: { value: 0 },
    lifting: { value: 0 },
    goal: { value: 0 },
    home: { value: 0 },
  };
  // Each row is asked whether it has just landed as it is drawn, as the list's own cell asks, and
  // one that has is drawn in a box that says so (`arriving-<its key>`), and how (`arrival`: rises,
  // opens or answers, as `RoomMotion.tsx`'s `Arrival` says). Whether the room has been
  // built is handed on to the list rather than stripped from it, because what it turns off is the
  // transition this mock stands in for: the room's own tests read it off the list. So is whether
  // it is shown, which a room opened on a line holds back while it places the line.
  const ColourList = react.forwardRef(
    ({ field: _field, CellRendererComponentStyle: _over, arrives, renderItem, ...props }, ref) =>
      react.createElement(FlatList, {
        ...props,
        ref,
        renderItem: (info) => {
          const drawn = renderItem(info);
          const arrival = arrives?.(info.item);
          if (arrival === undefined) return drawn;
          const key = props.keyExtractor?.(info.item, info.index) ?? String(info.index);
          return react.createElement(View, { testID: `arriving-${key}`, arrival }, drawn);
        },
      }),
  );
  return {
    ColourList,
    OutgoingColour: () => null,
    FrozenColour: () => null,
    useColourField: () => colourField,
    colourField,
  };
});

/*
 * How the room moves (`src/spaces/RoomMotion.tsx`) is Reanimated's layout transitions, which run
 * on the UI thread from the mount: the simulator's to prove. Under Node each piece is the plain
 * view it moves, with what it draws; what goes is gone at once.
 */
/*
 * What grows on the UI thread (`src/ui/growing.tsx`): under Node a capsule that grows is the plain
 * view it is, at its new size at once, and the rows that come into it are simply there.
 */
jest.mock("./src/ui/growing", () => {
  const react = require("react");
  const { View } = require("react-native");
  const { GlassView } = require("expo-glass-effect");
  return {
    __esModule: true,
    GROWS: undefined,
    GROWS_UP: undefined,
    OPENS: undefined,
    CLOSES: undefined,
    Opens: ({ children }) => children,
    GrowingGlass: GlassView,
    GrowingView: View,
    GrowingList: require("react-native").FlatList,
    GroupPlace: View,
    Stands: ({ children }) => children,
    Lands: ({ children }) => children,
    Appearing: ({ style, testID, children }) =>
      react.createElement(View, { style, testID, accessibilityRole: "menu" }, children),
  };
});

/*
 * A lifted message's motion (`src/spaces/LiftedMotion.tsx`, ADR 0200) is Reanimated, and where the
 * bubble is, is asked on the UI thread. Under Node the bubble is wherever `liftedAt` says (a test
 * may move it), in a room that shows lines whole within `liftedSeen`, the backdrop is a button that
 * puts the message down, the copy goes as soon as it is put down, the capsule and the card say
 * their size as they mount, as the phone's layout would, so the menu places them, and the menu's
 * modal says it has gone as soon as it is told to go, which on iOS waits for the system.
 */
jest.mock("./src/spaces/LiftedMotion", () => {
  const react = require("react");
  const { Pressable, View } = require("react-native");
  const liftedAt = { x: 52, y: 420, width: 280, height: 90 };
  const liftedSeen = { top: 103, bottom: 760 };
  const sized = (onLayout, width, height) =>
    onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  return {
    __esModule: true,
    LIFT: 1.035,
    liftedAt,
    liftedSeen,
    useLiftBox: () => ({
      ref: react.createRef(),
      ask: (then) => then({ ...liftedAt }, { ...liftedSeen }),
    }),
    LiftBox: () => null,
    RoomSeen: ({ children }) => react.createElement(react.Fragment, null, children),
    LiftStill: ({ children }) => react.createElement(View, { testID: "lift-still" }, children),
    LiftBackdrop: ({ onPress }) =>
      react.createElement(Pressable, {
        accessibilityRole: "button",
        accessibilityLabel: "Close",
        testID: "lift-backdrop",
        onPress,
      }),
    LiftCopy: ({ open, onGone, children }) => {
      react.useEffect(() => {
        if (!open) onGone();
      }, [open]);
      return react.createElement(View, { testID: "lift-held" }, children);
    },
    LiftPop: ({ style, onLayout, children }) => {
      react.useEffect(() => sized(onLayout, 250, 200), []);
      return react.createElement(View, { style }, children);
    },
  };
});

jest.mock("./src/spaces/RoomMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  const plain = ({ style, testID, onLayout, children }) =>
    react.createElement(View, { style, testID, onLayout }, children);
  return {
    __esModule: true,
    ROOM_SPRING: { stiffness: 130, damping: 19, mass: 1 },
    NEAR: 100,
    BACK: 60,
    RoomTransition: react.createContext(undefined),
    useRoomTransition: () => undefined,
    Moving: plain,
    MovingBubble: ({ corners, style, testID, children }) =>
      react.createElement(View, { style: [style, corners], testID }, children),
    MovingCell: plain,
    Coming: ({ children }) => react.createElement(react.Fragment, null, children),
    Leaving: plain,
    Whole: plain,
    // The reader's own change (a line deleted, or brought back), which a test can see asked for.
    madeHere: jest.fn(),
    // A send's ask for the foot, which a test can see asked for or not.
    homeward: jest.fn(),
    FadingUp: ({ held, children }) =>
      react.createElement(View, { style: { opacity: held ? 0 : 1 } }, children),
  };
});

/*
 * A send's words on their way to their bubble (`src/spaces/SendFlight.tsx`) are Reanimated from
 * end to end, so under Node they are only there while they fly, with what they say. A test lands
 * them when it chooses (`flights.land`), so the bubble the room keeps out of sight meanwhile can be
 * seen kept, and then seen shown.
 */
jest.mock("./src/spaces/SendFlight", () => {
  const react = require("react");
  const { Text } = require("react-native");
  const flights = { land: () => undefined };
  function FlightLayer({ flying, stamp, onLanded }) {
    if (flying === undefined) return null;
    flights.land = () => onLanded(flying.id);
    const words = react.createElement(Text, { testID: "send-flight" }, `${flying.text} · ${stamp}`);
    // The capsule's arrow and faces, flying up to be the route (ADR 0081): who they are for.
    if (flying.route === undefined) return words;
    return react.createElement(
      react.Fragment,
      null,
      words,
      react.createElement(Text, { testID: "send-flight-route" }, flying.route.to.join(" ")),
    );
  }
  return { __esModule: true, FlightLayer, flights };
});

/*
 * A message breaking into dust (`src/spaces/Dust.tsx`) is Reanimated from end to end. Under Node
 * the eraser is a marker a test can find, and the wipe and the dust are over at once, so the line
 * goes — or, back by Undo, is there — in the same act: what the room does next is what a test reads.
 */
jest.mock("./src/spaces/Dust", () => {
  const react = require("react");
  const { View } = require("react-native");
  function Eraser({ crumbling, onWiped, onDone }) {
    react.useEffect(() => {
      if (!crumbling.backwards) onWiped();
      onDone();
    }, []);
    return react.createElement(View, {
      testID: crumbling.backwards ? "eraser-back" : "eraser",
    });
  }
  const asker = { ask: () => undefined, still: false };
  return {
    __esModule: true,
    Eraser,
    Veil: () => null,
    DustLayer: () => null,
    useDust: () => ({ asks: [], gone: () => undefined, asker }),
  };
});

/*
 * What moves in When it asks you (`src/harnesses/AskingMotion.tsx`, ADR 0195): the ask's flight,
 * the promises' marks and the dots. Under Node the flight is a box that says it is there, the
 * marks are nothing, and each dot is a view with its test id, so the section's words, its list and
 * which dots it draws are what a test reads. That they move is the simulator's to show.
 */
jest.mock("./src/harnesses/AskingMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    Hero: () => react.createElement(View, { testID: "asking-hero" }),
    PromiseMark: () => null,
    useMarks: () => ({ value: 0 }),
    DotRow: ({ dots }) =>
      react.createElement(
        View,
        null,
        dots.map((dot, at) => react.createElement(View, { key: at, testID: `asking-dot-${dot}` })),
      ),
  };
});

/*
 * Undo's capsule (`src/spaces/UndoPill.tsx`) springs on the UI thread; under Node it is there with
 * its words and its button while there is something to undo, and gone at once when there is not.
 */
jest.mock("./src/spaces/UndoPill", () => {
  const react = require("react");
  const { Pressable, Text, View } = require("react-native");
  function UndoPill({ undoing, onUndo, words }) {
    if (undoing === undefined) return null;
    return react.createElement(
      View,
      { testID: "undo-pill" },
      react.createElement(Text, null, words ?? "Deleted for you"),
      react.createElement(
        Pressable,
        {
          accessibilityRole: "button",
          testID: "undo-pill-undo",
          onPress: () => onUndo(undoing.lineId),
        },
        react.createElement(Text, null, "Undo"),
      ),
    );
  }
  return { __esModule: true, UndoPill };
});

/*
 * "Back to your reply" (`src/spaces/BackPill.tsx`, ADR 0219) springs on the UI thread too; under
 * Node it is there with its button while it is shown, and gone at once when it is not.
 */
/*
 * The swipe to reply (`src/spaces/ReplySwipe.tsx`, ADR 0219) is a pan on the UI thread, on the
 * bubble and the files under it; under Node the row and its pieces are drawn as they are, and Reply
 * in the lifted menu is the way a test starts a reply.
 */
jest.mock("./src/spaces/ReplySwipe", () => ({
  __esModule: true,
  ReplySwipe: ({ children }) => children,
  ReplyGrip: ({ children }) => children,
}));

/*
 * The column of faces a finger slides up from the field (`src/spaces/FaceColumn.tsx`, ADR 0229) is
 * a pan on the UI thread; under Node the faces are drawn as they are and there is no column. What
 * the field tells the pan is kept on `global.faceSlide`, so a test slides as the pan would: over a
 * face (`onLit`), and letting go there (`onPick`).
 */
jest.mock("./src/spaces/FaceColumn", () => ({
  __esModule: true,
  useFaceSlide: (told) => {
    global.faceSlide = told;
    return {};
  },
  FaceSlideOn: ({ children }) => children,
  FaceColumn: () => null,
}));

jest.mock("./src/spaces/BackPill", () => {
  const react = require("react");
  const { Pressable, Text, View } = require("react-native");
  function BackPill({ back, onPress }) {
    if (back === undefined) return null;
    return react.createElement(
      View,
      { testID: "back-pill" },
      react.createElement(
        Pressable,
        { accessibilityRole: "button", testID: "back-pill-press", onPress },
        react.createElement(Text, null, back.mine ? "Back to your reply" : "Back to the reply"),
      ),
    );
  }
  return { __esModule: true, BackPill };
});

/*
 * The room's glass (`ui/Glass.tsx`): a blur is a native view sampling what is behind it, and
 * under Node there is neither. The blur becomes a view that keeps its props — so a test can
 * still read what was asked for, and every capsule is still found, pressed and read — and the
 * mask becomes its children, which is what a mask that hides nothing amounts to. What cannot be
 * asked here is the only thing these two do: that the glass carries the room behind it, and that
 * the band fades out rather than stopping at a line. Those are the phone's, and the walk's.
 */
jest.mock("expo-blur", () => {
  const react = require("react");
  const { View } = require("react-native");
  return { BlurView: (props) => react.createElement(View, props) };
});
// The system's glass, the same way, and present: the phone these tests stand for is on iOS 26 or
// later, so the capsules they press are the ones drawn in it (`useLiquid`).
jest.mock("expo-glass-effect", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    GlassView: (props) => react.createElement(View, props),
    isLiquidGlassAvailable: () => true,
    isGlassEffectAPIAvailable: () => true,
  };
});
jest.mock("@react-native-masked-view/masked-view", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: ({ children, maskElement: _mask, ...props }) =>
      react.createElement(View, props, children),
  };
});

/*
 * The room's frame holds its foot clear of the keyboard with a Reanimated padding, and the
 * controller's mock keyboard never moves, so under Node it is a plain view that keeps its props:
 * the room is still found by its `testID` and everything in it is still drawn. The arithmetic is
 * `spaces/roomKeyboard.vitest.ts`, and the ride is `e2e/maestro/keyboard.yaml`, on a device.
 */
jest.mock("./src/spaces/KeyboardRoom", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    KeyboardRoom: ({ children, testID }) =>
      react.createElement(View, { style: { flex: 1 }, testID }, children),
  };
});

/*
 * The new space's window (`src/newSpace/Window.tsx`) is Reanimated from end to end — the pour out
 * of the + and the fill — so under Node it is what it holds, the words and the field
 * (`Words.tsx`), with its stages run at once: a fold ends, a send covers the screen and dissolves
 * into the room once the room has drawn (`drawn`), a lift ends. A send waits to cover the screen
 * when a test holds it (`holds.covering`), until it calls `holds.cover`, so what is made only then
 * can be seen not made before; and once covered it waits to dissolve into the room when a test
 * holds that (`holds.revealing`), until it calls `holds.reveal`. The springs themselves are the
 * simulator's and the film's to judge.
 */
jest.mock("./src/newSpace/Window", () => {
  const react = require("react");
  const { View } = require("react-native");
  const { Head, Field } = require("./src/newSpace/Words");
  const holds = {
    covering: false,
    revealing: false,
    cover: () => undefined,
    reveal: () => undefined,
  };
  function Window(props) {
    const input = react.useRef(null);
    const { stage, onCovered, onRevealed, onDone, drawn } = props;
    const kind = stage.kind;
    holds.cover = onCovered;
    holds.reveal = onRevealed;
    react.useEffect(() => {
      if (kind === "closing" || kind === "lifting") onDone();
      if (kind === "sending" && !holds.covering) onCovered();
    }, [kind, onCovered, onDone]);
    react.useEffect(() => {
      if (kind === "sending" && drawn && !holds.revealing) onRevealed();
    }, [kind, drawn, onRevealed]);
    return react.createElement(
      View,
      { testID: "new-space-window" },
      react.createElement(Head, props),
      react.createElement(Field, { ...props, asked: props.picked[0], input }),
    );
  }
  return { __esModule: true, Window, holds };
});

// The watch kept on a bubble of yours while a send's words fly to it is Reanimated's, measured
// on the UI thread every frame (`src/spaces/BubbleWatch.tsx`); here it is only there, where it is
// drawn, and what it tells is plain boxes where the room keeps shared values.
jest.mock("./src/spaces/BubbleWatch", () => {
  const react = require("react");
  const { View } = require("react-native");
  function useTold() {
    const told = react.useRef({ aim: { value: undefined }, settled: { value: 0 } });
    return told.current;
  }
  return {
    BubbleWatch: ({ told }) =>
      told === undefined ? null : react.createElement(View, { testID: "bubble-watch" }),
    useTold,
  };
});

// The film's chapter bar and what fades over it (`src/demo/FilmMotion.tsx`, ADR 0217) move on
// Reanimated. Under Node a segment is a plain track, and what fades is simply there.
jest.mock("./src/demo/FilmMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    SegmentFill: () => react.createElement(View),
    Fades: ({ style, children }) => react.createElement(View, { style }, children),
    // The side a tap went to, as which way it went, so a test can tell on from back.
    Flash: ({ side, icon, at }) =>
      at === 0 ? null : react.createElement(View, { testID: `film-flash-${side}-${icon}` }),
  };
});

// Chips found on this Wi-Fi (`src/pairing/WelcomeMotion.tsx`, ADR 0172) slides up from the first
// screen's foot on Reanimated. Under Node it is simply there.
jest.mock("./src/pairing/WelcomeMotion", () => {
  const react = require("react");
  const { View } = require("react-native");
  return { SlideUp: ({ style, children }) => react.createElement(View, { style }, children) };
});

/*
 * How Universe's Desktop tab moves (`src/spaces/MacMotion.tsx`): under Node what opens and moves is
 * simply where it is, and a row's button is the press it is.
 */
jest.mock("./src/spaces/MacMotion", () => {
  const react = require("react");
  const { Pressable, View } = require("react-native");
  const plain = ({ style, testID, children }) =>
    react.createElement(View, { style, testID }, children);
  return {
    __esModule: true,
    Moves: plain,
    Opening: plain,
    Squeeze: ({ children, ...press }) => react.createElement(Pressable, press, children),
  };
});
