/**
 * The marks the tab bar and the search box wear, as path data.
 *
 * They are transcribed from `packages/ui/src/components/icon/icon.tsx` rather than imported,
 * for the same reason the tokens are: that module is the web's — it imports a stylesheet, and
 * the dependency-cruiser rule forbids the phone from reaching into `@chipschat/ui` at all. The cost
 * of transcribing is drift, so `icons.vitest.ts` reads that file and fails when a path here is
 * no longer the one there.
 *
 * Only the marks the phone actually draws are here. The set on the web is thirty; a tab bar
 * needs five of them, the search box one, the composer's Send, Attach and a chip's clip
 * three more, the attach sheet's library, camera and file another three, the line menu's note
 * and thread two, a voice note's microphone, play, pause and stop four, the media viewer's
 * Close one, and the thinking bubble's strip a glyph for each kind of call (ADR 0147).
 *
 * The media viewer wears marks the design system does not have yet (the media viewer proposal,
 * figures 3, 3b, 7 and 8): each platform's own share and overflow — iOS's square and arrow and
 * `⋯`, Material's three joined dots and `⋮` — the menu's Save, Copy, Go to message, Details and
 * System player, the arrows a pointer pages by, and a video's sound, mute and Picture in Picture;
 * a Spaces row's Archive, Unarchive and Delete; and the padlock standing open on a room's Lock
 * changes (ADR 0156). They are the phone's own, drawn from the mocks, in the same box and the
 * same stroke, and kept apart so the drift test checks only what the web has. When the web's
 * lightbox (Phase 5) takes one into the design system, it moves up into `SYSTEM_ICONS`.
 *
 * The marks a space may wear are not here: they are paper, not lines, and live in `marks.ts`.
 */

/** Every path is drawn in a 24-by-24 box, stroked, never filled. */
export const ICON_BOX = 24;

/**
 * Rounded to two places. Without it `dot(12.4, 14.2)` writes 13.299999999999999 into the path:
 * true of the arithmetic, useless in a file, and a needless difference for the drift test that
 * compares these against the design system's own copies.
 */
const at = (n: number) => Math.round(n * 100) / 100;

/** A dot a stroke can draw: a circle of radius 0.9, which the 1.75 stroke fills to about 3.5. */
const dot = (x: number, y: number) => `M${at(x)} ${at(y - 0.9)}a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z`;

/** A ring of radius `r` about a centre, as a path. */
const ring = (x: number, y: number, r: number) =>
  `M${at(x)} ${at(y - r)}a${r} ${r} 0 1 0 0 ${at(2 * r)}a${r} ${r} 0 1 0 0-${at(2 * r)}z`;

/** The design system's marks, transcribed; `icons.vitest.ts` checks each against the web's. */
export const SYSTEM_ICONS = {
  inbox: ["M3 12l2.5-7h13L21 12v7H3z", "M3 12h5l1.5 3h5L16 12h5"],
  chat: [
    "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4h-.5A1.5 1.5 0 0 1 4 14.5z",
  ],
  chip: ["M6 6h12v12H6z", "M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5"],
  search: ["M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z", "M20 20l-4.3-4.3"],
  bolt: ["M13 2L4 14h7l-1 8 9-12h-7z"],
  gear: [
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
    "M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  ],
  /** Filled, and a gear rather than the sun `gear` draws (`FILLED`, ADR 0090). */
  cog: [
    "M9.89 5.64L10.17 1.97L13.83 1.97L14.11 5.64L15 6.01L17.8 3.61L20.39 6.2L17.99 9L18.36 9.89L22.03 10.17L22.03 13.83L18.36 14.11L17.99 15L20.39 17.8L17.8 20.39L15 17.99L14.11 18.36L13.83 22.03L10.17 22.03L9.89 18.36L9 17.99L6.2 20.39L3.61 17.8L6.01 15L5.64 14.11L1.97 13.83L1.97 10.17L5.64 9.89L6.01 9L3.61 6.2L6.2 3.61L9 6.01ZM12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2z",
  ],
  check: ["M5 12.5l4.5 4.5L19 7"],
  up: ["M12 19V5M6 11l6-6 6 6"],
  plus: ["M12 5v14M5 12h14"],
  clip: [
    "M20.5 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.8-8.8a3.3 3.3 0 0 1 4.7 4.7l-8.8 8.8a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8",
  ],
  image: [
    "M4 5h16v14H4z",
    "M4 16.5l4.5-4.5 3.5 3.5 3-3 5 5",
    "M16 10.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z",
  ],
  camera: ["M4 8h3.5l1.5-3h6l1.5 3H20v11H4z", "M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"],
  doc: ["M6 3h8l4 4v14H6z", "M14 3v4h4M9 12h6M9 16h6"],
  pen: ["M4 20l1.2-4.4L16.4 4.4a2.1 2.1 0 0 1 3 3L8.2 18.6z", "M14.3 6.5l3 3"],
  mic: ["M9 3h6v11H9z", "M5 11a7 7 0 0 0 14 0M12 18v3"],
  play: ["M7 5l12 7-12 7z"],
  pause: ["M8 5v14M16 5v14"],
  stop: ["M6 6h12v12H6z"],
  x: ["M6 6l12 12M18 6L6 18"],
  /** What opens: the capsule over the field, which opens who a message is for (ADR 0081). */
  down: ["M6 9l6 6 6-6"],
  /** A thinking bubble's calls (ADR 0126): the web's since the Mac's bubble drew them too. */
  globe: [
    ring(12, 12, 9),
    "M3 12h18",
    "M12 3c2.6 2.6 2.6 15.4 0 18",
    "M12 3c-2.6 2.6-2.6 15.4 0 18",
  ],
  terminal: ["M4.5 7l5 5-5 5", "M11.5 17.5h8"],
  /** The thinking bubble's strip (ADR 0147): memory, a hand-off, a call nobody named, an email. */
  bookmark: ["M7 3.5h10v17l-5-3.6-5 3.6z"],
  route: ["M5 4v7a4 4 0 0 0 4 4h10M15 11l4 4-4 4"],
  /** Reply (ADR 0219): the arrow turning back, up and to the left. */
  reply: ["M9.5 14.5 4 9l5.5-5.5", "M4 9h10a6 6 0 0 1 6 6v4"],
  dot: ["M12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4z"],
  mail: ["M3 5h18v14H3z", "M3 7.5l9 6 9-6"],
  /** iOS's overflow, `⋯`; the row naming an agent's files not shown (ADR 0135). */
  more: [dot(5, 12), dot(12, 12), dot(19, 12)],
  /**
   * An agent's context files (ADR 0135), one mark for what each is for, as the mock drew them: who
   * it is a spark, how it works a list, its memory a pair of drawers; and the lock on a file its
   * harness keeps read only. About you wears `user`, any other file `doc`.
   */
  sparkle: [
    "M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6L4.5 11l5.6-1.9z",
    "M19 16.5v4M17 18.5h4",
  ],
  list: ["M9.5 6h10M9.5 12h10M9.5 18h10", dot(5, 6), dot(5, 12), dot(5, 18)],
  drawers: ["M4.5 4h15v6.5h-15z", "M4.5 13.5h15V20h-15z", "M10 7.25h4M10 16.75h4"],
  lock: ["M5.5 11h13v9.5h-13z", "M8 11V8a4 4 0 0 1 8 0v3"],
  /** An agent's heartbeat (ADR 0143): a pulse's trace, on its row and on a check-in's tag. */
  pulse: ["M2.5 12.5h4.2l2.3-5.5 4 11 2.6-7 1.6 1.5h4.3"],
  /**
   * The moon: over quiet hours on You (ADR 0085), and on a harness's job that tends its agents'
   * memory at night, OpenClaw's Dreaming (ADR 0252).
   */
  moon: ["M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"],
  /**
   * An agent's model (ADR 0141): a chip, rounder than the Agents tab's and with longer pins, on the
   * row that says what it runs on and how hard it thinks.
   */
  model: [
    "M9 6h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z",
    "M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9h3.5M2.5 15h3.5M18 9h3.5M18 15h3.5",
  ],
  /**
   * A room hidden from a person's own list (ADR 0205): the eye shut by its stroke on Hide, a hidden
   * room's row and its heading; open on Unhide. The web draws the same, in its rail.
   */
  hide: [
    "M10.4 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7",
    "M6.7 6.8C4 8.5 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.4 9.4 0 0 0 4.6-1.2",
    "M9.9 9.9a3 3 0 0 0 4.2 4.2",
    "M3.5 3.5l17 17",
  ],
  unhide: [
    "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z",
    "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
  ],
  /**
   * The pushpin: Pin on a lifted message's menu (ADR 0200), and a room pinned to the top of a
   * person's own list (ADR 0240), on its row and on Pin; struck through on Unpin.
   */
  pin: ["M9 3.5h6M10 3.5v5.5l-3.5 4.5h11L14 9V3.5", "M12 13.5v7"],
  unpin: ["M9 3.5h6M10 3.5v5.5l-3.5 4.5h11L14 9V3.5", "M12 13.5v7", "M3.5 3.5l17 17"],
  /** The viewer's Save, and Download as zip (ADR 0224): the web's since Download as zip. */
  save: ["M12 4v11M8 11l4 4 4-4M5 19h14"],
  /** Your folder (ADR 0224), the web's, and on the phone since Open folder on Mac. */
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  /** Open folder on Mac (ADR 0225): the Mac's screen. */
  mac: ["M3.5 4.5h17v11h-17z", "M12 15.5v4M8.5 19.5h7"],
  /** A film's parts (ADR 0217's addendum of 26 October): the one before, and the next. */
  previous: ["M15 5l-7 7 7 7"],
  next: ["M9 5l7 7-7 7"],
  /**
   * The arrow turning back: Not right? in a lifted message's menu (ADR 0200), which asks the agent
   * to go back over what it said, and a film's Watch again.
   */
  again: ["M9 14.5l-5-5 5-5", "M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11"],
  /**
   * A padlock standing open (ADR 0156): Lock changes on a room's sheet while anybody may rename,
   * archive or delete the room, its shackle lifted up and to the side as the mock drew it. It
   * closes into the design system's `lock` once the room's changes are locked. The web's You
   * wears it over Allowed always (ADR 0265).
   */
  unlock: ["M5.5 11h13v9.5h-13z", "M11.5 11V5.5a4 4 0 0 1 8 0v3"],
  /**
   * You's settings list (ADR 0085): the bell over notifications (the moon over quiet hours is the
   * design system's now, with the jobs', ADR 0252), as a phone's own Settings marks its rows.
   */
  bell: ["M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  info: [ring(12, 12, 9), "M12 11v6M12 7.5v.5"],
} as const;

/** The phone's own marks, which the design system does not have: the media viewer's. */
export const PHONE_ICONS = {
  /** iOS's share: the square and the arrow out of it. */
  share: ["M12 15V4M8 8l4-4 4 4M5 12v7h14v-7"],
  /** Material's share: three dots joined. */
  shareAndroid: [
    ring(18, 5, 2.6),
    ring(6, 12, 2.6),
    ring(18, 19, 2.6),
    "M8.3 10.7l7.4-4.3M8.3 13.3l7.4 4.3",
  ],
  /** Material's overflow, `⋮`. */
  moreVertical: [dot(12, 5), dot(12, 12), dot(12, 19)],
  copy: ["M9 9h11v11H9z", "M4 15V4h11"],
  /** Go to message: back, into the room. */
  goTo: ["M9 6l-5 5 5 5M4 11h12a4 4 0 0 1 0 8h-3"],
  /** A video's sound, on: the speaker and its waves. */
  sound: ["M4 9v6h4l5 4V5L8 9z", "M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"],
  /** And off: the speaker, crossed out beside it. */
  mute: ["M4 9v6h4l5 4V5L8 9z", "M17 9.5l5 5M22 9.5l-5 5"],
  /** Picture in Picture: the screen, with the small one in its corner. */
  pictureInPicture: ["M3 5h18v14H3z", "M12 12h6v4h-6z"],
  /**
   * A video's transport, as iOS's own player draws it (AVKit): play and pause as shapes, filled
   * (`FILLED`), with their corners eased; and the ten seconds back and on, an arrow round a ring
   * left open at the top, which the viewer writes its `10` inside (`media/Controls.tsx`).
   */
  playFill: ["M7.5 5.2a1 1 0 0 1 1.52-.85l10.2 6.8a1 1 0 0 1 0 1.7l-10.2 6.8a1 1 0 0 1-1.52-.85z"],
  pauseFill: [
    "M6.5 5.5a1 1 0 0 1 1-1H10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1z",
    "M13 5.5a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14a1 1 0 0 1-1-1z",
  ],
  back10: ["M4 13a8 8 0 1 0 8-8", "M14.5 2.5L12 5l2.5 2.5"],
  forward10: ["M20 13a8 8 0 1 1-8-8", "M9.5 2.5L12 5 9.5 7.5"],
  /** The system's player: a screen with a play mark, on its stand. */
  systemPlayer: ["M3 5h18v12H3z", "M8 21h8", "M10 8.5l5 2.5-5 2.5z"],
  /**
   * Something went wrong: the icon sheet's banner when a pick did not save. It was the line
   * library's until the library became paper (22 September 2026), and a banner wants a line.
   */
  alert: ["M12 3.4L21.6 20H2.4z", "M12 9.6v5", dot(12, 17.2)],
  /**
   * What a swipe on a Spaces row uncovers (22 September 2026): the box a room is put away in,
   * the same box with the room coming back out of it, and the bin. Drawn from the mock
   * (`docs/proposals/space-archive-delete-mocks.html`), the lid a band across the top. Each lid
   * is a path of its own, the bin's too, so a swipe's button can move it (ADR 0178).
   */
  archive: ["M3 4h18v4.5H3z", "M5 8.5V20h14V8.5M10 12.5h4"],
  unarchive: ["M3 4h18v4.5H3z", "M5 8.5V20h14V8.5M12 17.5v-6M9.5 14l2.5-2.5 2.5 2.5"],
  trash: ["M4 7h16M9.5 7V4.5h5V7", "M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"],
  /**
   * Read, on the bar of a picked Spaces list (ADR 0181 addendum, 18 October 2026): `chat`'s
   * bubble with a tick in it, the tick a path of its own so it can drop in as the act lights.
   */
  read: [
    "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4h-.5A1.5 1.5 0 0 1 4 14.5z",
    "M8.6 10.2l2.3 2.3 4.5-4.6",
  ],
  /** What a swipe on an agent's row in the room sheet uncovers (ADR 0111): out of the room. */
  remove: [ring(12, 12, 9), "M8 12h8"],
  /**
   * You's settings list (ADR 0085): the kinds of device a person holds a key on — a phone, a
   * computer, a browser, a terminal — beside each in Devices.
   */
  handset: [
    "M8.5 2.5h7A1.5 1.5 0 0 1 17 4v16a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20V4a1.5 1.5 0 0 1 1.5-1.5z",
    "M11 18.5h2",
  ],
  /** An iPad, beside its row in Devices (ADR 0177): the handset's shape, turned square. */
  tablet: [
    "M5.5 2.5h13A1.5 1.5 0 0 1 20 4v16a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20V4a1.5 1.5 0 0 1 1.5-1.5z",
    "M11 18.5h2",
  ],
  laptop: ["M4.5 5.5h15v10h-15z", "M2 18.5h20"],
  /**
   * Search's (ADR 0132): the clock beside a recent search, and the cloud struck through on the
   * line that says messages can't be searched while the server can't be reached.
   */
  clock: [ring(12, 12, 9), "M12 7v5l3.2 2"],
  offline: [
    "M7 18.5h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.7 4.4 4.4 0 0 0 7 18.5z",
    "M3.5 3.5l17 17",
  ],
  /** Scan a QR code (ADR 0217's addendum of 26 October): a viewfinder's corners round a code. */
  qr: [
    "M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3",
    "M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM14 14h2v2h-2z",
  ],
  /** Type a pairing code: a keyboard. */
  keys: [
    "M5 6.5h14A1.5 1.5 0 0 1 20.5 8v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5z",
    "M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8.5 14h7",
  ],
  /** The badge on a room's face at the head of its sheet (ADR 0202): a palette, the face's colours. */
  palette: [
    "M12 3a9 9 0 1 0 0 18c1.3 0 2-.8 2-1.8 0-1.2-1-1.6-1-2.7 0-1 .8-1.8 1.9-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z",
    dot(7.5, 11.2),
    dot(10.6, 7.2),
    dot(15.5, 7.7),
  ],
  /** A room's list put away and back (ADR 0256): a pane on the left. */
  sidebar: ["M3.5 5h17v14h-17z", "M9.5 5v14"],
  /** An iPad's tabs, out of the capsule into the sidebar and back (ADR 0276): three lines. */
  menu: ["M4.5 7h15M4.5 12h15M4.5 17h15"],
  /** A space's details beside its room (ADR 0256): a pane on the right. */
  details: ["M3.5 5h17v14h-17z", "M14.5 5v14"],
  /** A page of Universe full screen: arrows out to two corners, as iOS's own. */
  fullScreen: ["M14 4h6v6", "M20 4l-6.5 6.5", "M10 20H4v-6", "M4 20l6.5-6.5"],
} as const;

export const ICONS = { ...SYSTEM_ICONS, ...PHONE_ICONS } as const;

/** What a mark is called, whether it is the design system's or the phone's own. */
export type IconName = keyof typeof ICONS;

/**
 * The marks drawn as a shape rather than a line, as the design system draws them (its own
 * `FILLED`). A gear's teeth are its outline: stroked at fifteen points an eight-spoked wheel is a
 * sun, which is what `gear` is and what Settings wears. The hole is a second subpath in the same
 * path, cut by the even-odd rule.
 */
export const FILLED: ReadonlySet<string> = new Set<IconName>(["cog", "playFill", "pauseFill"]);
