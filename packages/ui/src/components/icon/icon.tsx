/**
 * The line icons the mockups use, drawn once here as paths so every surface shares one set.
 * Decorative by default: an icon beside a word is hidden from assistive technology, and an
 * icon that stands alone is given a label and becomes an image.
 */

import "./icon.css";

const PATHS = {
  inbox: ["M3 12l2.5-7h13L21 12v7H3z", "M3 12h5l1.5 3h5L16 12h5"],
  chat: [
    "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4h-.5A1.5 1.5 0 0 1 4 14.5z",
  ],
  chip: ["M6 6h12v12H6z", "M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"],
  hash: ["M9.5 4l-2 16M16.5 4l-2 16M4 9.5h16M4 14.5h16"],
  gear: [
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
    "M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  ],
  cog: [
    "M9.89 5.64L10.17 1.97L13.83 1.97L14.11 5.64L15 6.01L17.8 3.61L20.39 6.2L17.99 9L18.36 9.89L22.03 10.17L22.03 13.83L18.36 14.11L17.99 15L20.39 17.8L17.8 20.39L15 17.99L14.11 18.36L13.83 22.03L10.17 22.03L9.89 18.36L9 17.99L6.2 20.39L3.61 17.8L6.01 15L5.64 14.11L1.97 13.83L1.97 10.17L5.64 9.89L6.01 9L3.61 6.2L6.2 3.61L9 6.01ZM12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2z",
  ],
  search: ["M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z", "M20 20l-4.3-4.3"],
  // The iPad's room buttons (ADR 0284): the list beside, and the details beside.
  sidebar: ["M3.5 5h17v14h-17z", "M9.5 5v14"],
  details: ["M3.5 5h17v14h-17z", "M14.5 5v14"],
  mail: ["M3 5h18v14H3z", "M3 7.5l9 6 9-6"],
  doc: ["M6 3h8l4 4v14H6z", "M14 3v4h4M9 12h6M9 16h6"],
  pause: ["M8 5v14M16 5v14"],
  stop: ["M6 6h12v12H6z"],
  up: ["M12 19V5M6 11l6-6 6 6"],
  down: ["M6 9l6 6 6-6"],
  bolt: ["M13 2L4 14h7l-1 8 9-12h-7z"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5"],
  drive: ["M3 15l4-8h10l4 8-4 4H7z", "M3 15h18"],
  grid: ["M4 4h16v16H4z", "M4 10h16M4 15h16M10 4v16"],
  people: [
    "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5",
    "M16 5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.5 2.4 3.5 5.5",
  ],
  mic: ["M9 3h6v11H9z", "M5 11a7 7 0 0 0 14 0M12 18v3"],
  clip: [
    "M20.5 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.8-8.8a3.3 3.3 0 0 1 4.7 4.7l-8.8 8.8a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8",
  ],
  plus: ["M12 5v14M5 12h14"],
  camera: ["M4 8h3.5l1.5-3h6l1.5 3H20v11H4z", "M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"],
  image: [
    "M4 5h16v14H4z",
    "M4 16.5l4.5-4.5 3.5 3.5 3-3 5 5",
    "M16 10.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z",
  ],
  pen: ["M4 20l1.2-4.4L16.4 4.4a2.1 2.1 0 0 1 3 3L8.2 18.6z", "M14.3 6.5l3 3"],
  check: ["M5 12.5l4.5 4.5L19 7"],
  x: ["M6 6l12 12M18 6L6 18"],
  /** The gold banner a room shows while an agent works without asking (ADR 0286). */
  banner: [
    "M6 7h12a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z",
    "M6.4 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0z",
    "M12 12h5",
  ],
  /** That a banner is off for this agent (ADR 0286). */
  eyeOff: [
    "M3 3l18 18",
    "M10.6 5.2A9.7 9.7 0 0 1 12 5c5 0 8.5 4.4 9.5 6.4.2.4.2.8 0 1.2a15 15 0 0 1-2.5 3.4",
    "M6.2 6.6a15 15 0 0 0-3.7 4.8c-.2.4-.2.8 0 1.2C3.5 14.6 7 19 12 19c1.7 0 3.2-.5 4.6-1.2",
  ],
  play: ["M7 5l12 7-12 7z"],
  /** A call to the web, in a thinking bubble (ADR 0126). */
  globe: [
    "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z",
    "M3 12h18",
    "M12 3c2.6 2.6 2.6 15.4 0 18",
    "M12 3c-2.6 2.6-2.6 15.4 0 18",
  ],
  /** A call to a shell, in a thinking bubble (ADR 0126). */
  terminal: ["M4.5 7l5 5-5 5", "M11.5 17.5h8"],
  /** A call to an agent's memory, on the thinking bubble's strip (ADR 0147). */
  bookmark: ["M7 3.5h10v17l-5-3.6-5 3.6z"],
  /** Work handed to another room: a hand-off on the thinking bubble's strip (ADR 0147). */
  route: ["M5 4v7a4 4 0 0 0 4 4h10M15 11l4 4-4 4"],
  /** Reply to a message (ADR 0219): the arrow turning back, beside a line and in its menu. */
  reply: ["M9.5 14.5 4 9l5.5-5.5", "M4 9h10a6 6 0 0 1 6 6v4"],
  /** A call of a kind nobody has named, on the thinking bubble's strip (ADR 0147). */
  dot: ["M12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4z"],
  /**
   * An agent's context files (ADR 0135), one mark for what each is for, as the mock drew them: who
   * it is a spark, how it works a list, its memory a pair of drawers; and the lock on a file its
   * harness keeps read only. About you wears `user`, any other file `doc`. Past the eighth file,
   * the row naming the rest wears `more`.
   */
  sparkle: [
    "M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6L4.5 11l5.6-1.9z",
    "M19 16.5v4M17 18.5h4",
  ],
  list: [
    "M9.5 6h10M9.5 12h10M9.5 18h10",
    "M5 5.1a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z",
    "M5 11.1a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z",
    "M5 17.1a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z",
  ],
  drawers: ["M4.5 4h15v6.5h-15z", "M4.5 13.5h15V20h-15z", "M10 7.25h4M10 16.75h4"],
  lock: ["M5.5 11h13v9.5h-13z", "M8 11V8a4 4 0 0 1 8 0v3"],
  more: [
    "M5 11.1a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z",
    "M12 11.1a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z",
    "M19 11.1a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z",
  ],
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
   * A room hidden from a person's own list (ADR 0205): the eye shut by its stroke, on Hide, a hidden
   * room's row and the Hidden heading; open, on Unhide.
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
  /** Your folder (ADR 0224): the room's project on the Mac, and Open folder. */
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  /** Open in editor. */
  code: ["M8 7l-5 5 5 5", "M16 7l5 5-5 5"],
  /** Download as zip: the phone's `save`. */
  save: ["M12 4v11M8 11l4 4 4-4M5 19h14"],
  /** Open folder on Mac (ADR 0225): the Mac's screen, from the phone and a browser. */
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
   * The marks on You's rows that the phone wears and the desktop lacked (ADR 0265), drawn as the
   * phone draws them: the bell over banners, the open lock over Allowed always, the i over the
   * version; and the key over passkeys, which the phone has no row for.
   */
  bell: ["M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  unlock: ["M5.5 11h13v9.5h-13z", "M11.5 11V5.5a4 4 0 0 1 8 0v3"],
  info: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", "M12 11v6M12 7.5v.5"],
  key: ["M8 10.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", "M10.9 11.6L19 3.5", "M16 6.5l2.5 2.5"],
} as const;

/**
 * The marks the product draws itself. The marks a space may wear are not lines and are not here:
 * they are paper, in `../face/library.ts`, drawn by `SpaceMark`.
 */
export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as readonly IconName[];

export interface IconProps {
  readonly name: IconName;
  /** Pixels. Sixteen beside text, fourteen inside a small button. */
  readonly size?: number;
  /** Give the icon a name only when it stands alone; beside a word it is decoration. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * The marks drawn as a shape rather than a line. A gear's teeth are its outline, and a wheel with
 * eight spokes stroked at thirteen pixels is a sun — which is what `gear` above is, and what
 * Settings has always worn. Filled, it reads as a gear beside a line of words (ADR 0090). The
 * hole is a second subpath in the same path, cut by the even-odd rule, so it stays a hole.
 */
const FILLED: ReadonlySet<string> = new Set<IconName>(["cog"]);

export function Icon({ name, size = 16, label, className }: IconProps) {
  const named = label !== undefined;
  const filled = FILLED.has(name);
  return (
    <svg
      className={className === undefined ? "ui-icon" : `ui-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      fillRule={filled ? "evenodd" : undefined}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={named ? "img" : undefined}
      aria-label={label}
      aria-hidden={named ? undefined : true}
      focusable="false"
      data-icon={name}
    >
      {PATHS[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
