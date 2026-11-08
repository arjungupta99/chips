/**
 * A lane in the room is its destination (ADR 0050): one quiet row, and nothing the
 * room already says. The route card used to carry the lane's goal, which is the person's message
 * one bubble up, and the lane's summary, which is the specialist's reply one bubble down, so a
 * question read twice and an answer twice (Arjun, 11 September 2026).
 *
 * One object, two views, never a copy, and each says only what its room does not. The route row
 * in the lead's space is the destination face and name, tinted with that source's identity,
 * because that space is elsewhere and going there is what the row is for;
 * the lead is the room. The task caption in the specialist's is the faces alone, over the goal
 * drawn as the person's own bubble, where it is the only copy of what was asked and it is theirs
 * (`Line.tsx`): there the room's title is the last hop and the bubble is the first.
 *
 * Both said every name twice until 11 September 2026 (Arjun), once in a face and once in words,
 * with the arrow drawn twice on the route row to go with them. A screen reader still hears the
 * whole trail either way, because that is what the row is labelled with. A tap crosses to the
 * other end; the separate Details target or a press and hold opens the bounded handoff sheet.
 * The full trail lives there. A lane with no other
 * end — a Space handing work to a part of itself in the one room, *Chess Game → Engineer* (ADR
 * 0032) — answered a tap with nothing, which read as a row that was broken (Arjun, 15 September
 * 2026); its tap opens the details instead, and its hint says so.
 *
 * Its state stands at the right edge and only while there is something to say: the dots while
 * the lane is going, Failed when it ended badly. Done draws nothing — the reply beneath is the
 * proof — and Waiting draws nothing either, because the ask card at the room's foot is the thing
 * to look at then (`laneLive`).
 *
 * The dots, and not the word *Working*, since 12 September 2026 (Arjun): they are the same dots
 * the thinking bubble wears (`ui/Dots.tsx`), and while this row is breathing the bubble at the
 * foot stands down (`SpaceView.tsx`) — one room, one thing at a time saying the work is going.
 *
 * The route row carries the files the lane's answer came back with, under it (12 September 2026).
 * It is the one thing the lead's room does not already say: the summary is a bubble below, but a
 * lane that answered with four photographs handed back a sentence about them and nothing else, so
 * the room read "Here are four menu photos" with no photos in it. The task caption draws none —
 * in the specialist's own room those files are messages a few lines up, and drawing them here
 * would be the copy this whole object exists to avoid.
 *
 * A face in the chain is the room the hop is (22 September 2026): the route row's is the room it
 * crosses to, and the caption's ends are the lead's room and this one, each wearing the face the
 * person chose for it in the Spaces list — so *J → the game of life* is the wafer and the rocket
 * they picked, not two sets of initials. A hop is only drawn as a room when core names it after
 * that room (`LaneHop.spaceId`, `Lane.leadSpaceId`), so a harness working in somebody else's
 * room keeps its own face. With nothing chosen, the face is the initials it always was.
 */

import type { Directory, Lane } from "@chipschat/core";
import { cantAnswer, nameOf } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Fragment, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { Avatar, type AvatarSize, avatarCorner, avatarSide, faceGround } from "../ui/Avatar";
import { Dots } from "../ui/Dots";
import { Icon } from "../ui/Icon";
import { Pill } from "../ui/Pill";
import { avatarHue, hueColours } from "../ui/sourceColours";
import { usePalette, useScheme } from "../ui/theme";
import { ICON_GROUNDS, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { STATUS } from "../ui/vocabulary";
import { Attachments } from "./Attachments";
import type { FileService } from "./files";
import { LaneDetails } from "./LaneDetails";
import { laneLive } from "./spaces";

/** One face in a trail: a person, a harness or an agent, or the room a hop is. */
export interface Hop {
  readonly name: string;
  readonly kind: "person" | "harness" | "agent";
  /**
   * The face it wears: an agent's own (ADR 0089), or else the one the person chose for the room
   * this hop is, when it is one and they chose.
   */
  readonly icon?: SpaceIcon | undefined;
  /** An agent that can't answer now (ADR 0083), which wears the amber mark. */
  readonly cantAnswer?: true | undefined;
}

/**
 * A step of a trail: one face, or several that went together — a message for everyone in the
 * room goes to each of its harnesses at once, and they are one step (ADR 0081).
 */
export type Step = Hop | readonly Hop[];

/** The face a participant wears in a trail, from the names Chips has. */
export function hopOf(directory: Directory, id: string): Hop {
  return {
    name: nameOf(directory, id),
    ...faceProps(directory, id),
    ...(cantAnswer(directory, id) === undefined ? {} : { cantAnswer: true as const }),
  };
}

/** The step a message went to: one face for one participant, the group for several. */
export function stepOf(directory: Directory, ids: readonly string[]): Step {
  const hops = ids.map((id) => hopOf(directory, id));
  const [only] = hops;
  return hops.length === 1 && only !== undefined ? only : hops;
}

/** The faces a person chose, by space id, as the store carries them. */
export type Faces = ReadonlyMap<string, SpaceIcon>;

function faceOf(faces: Faces | undefined, spaceId: string | undefined): SpaceIcon | undefined {
  return spaceId === undefined ? undefined : faces?.get(spaceId);
}

/**
 * The outline and the face of one end of a lane: the agent's own face when it has one, and the
 * face the person chose for its room when it has none, which is what a lane wore before agents
 * had faces (ADR 0089).
 */
function endOf(
  directory: Directory,
  id: string,
  faces: Faces | undefined,
  spaceId: string | undefined,
): Pick<Hop, "kind" | "icon"> {
  const own = faceProps(directory, id);
  return { kind: own.kind, icon: own.icon ?? faceOf(faces, spaceId) };
}

function specialistName(lane: Lane, directory: Directory): string {
  return lane.label ?? nameOf(directory, lane.specialistId);
}

/**
 * Who a lane went through, in the order it went: the two ends of the hop on a lead's route row,
 * the whole trail with the specialist on the end of it on a specialist's task caption — because
 * a lane's trail names everyone who handled the work except the one being asked to do it.
 *
 * The last hop wears the lane's label when it has one, and the same participant may be in the
 * list twice: a harness that hands a Space of its own down is the lead and the specialist both,
 * and `Arjun → Scout → Shopping` is Scout routing to itself under the name of the child. It is
 * the place in the trail that identifies a hop, never the id. The lead and every hop above it
 * wear the name of the room of the harness's own they worked in, when they have one
 * (`Lane.leadLabel`, 13 September 2026): a Space handing down from its own room is
 * `Chess Game → Engineer`, where the harness's name made it `J → Engineer`.
 */
function hopsOf(
  lane: Lane,
  kind: "route" | "task",
  directory: Directory,
  faces: Faces | undefined,
): Hop[] {
  const last: Hop = {
    name: specialistName(lane, directory),
    ...endOf(directory, lane.specialistId, faces, lane.homeSpaceId),
  };
  if (kind === "route") {
    const lead = lane.leadLabel ?? nameOf(directory, lane.leadId);
    return [{ name: lead, ...endOf(directory, lane.leadId, faces, lane.leadSpaceId) }, last];
  }
  return [
    ...lane.trail.map((hop) => ({
      name: hop.label ?? nameOf(directory, hop.participantId),
      ...endOf(directory, hop.participantId, faces, hop.spaceId),
    })),
    last,
  ];
}

/**
 * The trail as faces and arrows: a circle is a person and a squircle a harness. A step of several
 * faces draws them overlapped, each ringed in the ground they stand on (`Faces`).
 */
export function Trail({
  hops,
  size = "sm",
}: {
  readonly hops: readonly Step[];
  readonly size?: AvatarSize;
}) {
  return (
    <View style={styles.trail}>
      {hops.map((hop, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a hop's place in the trail is its identity, as on the browser's card; a trail never reorders, and one harness may hold a lane twice
        <Fragment key={index}>
          {index === 0 ? null : <Arrow />}
          <Faces step={hop} size={size} />
        </Fragment>
      ))}
    </View>
  );
}

/** The arrow between two steps of a trail, or ahead of the faces a capsule aims at. */
export function Arrow({ glyph = "→" }: { readonly glyph?: string }) {
  const palette = usePalette();
  return (
    <Text style={[styles.arrow, { color: palette.ink4 }]} accessibilityElementsHidden>
      {glyph}
    </Text>
  );
}

/** How far each face of a step of several sits over the one before it. */
const OVERLAP = 4;
/** The ring round an overlapped face, in the colour of what it stands on. */
const RING = 2;
/**
 * A step of more than this many is one mark and how many (ADR 0113). One face each ran past the
 * field at fourteen agents, over the words and Send, and three faces and a count left the words
 * short of "Message Everyone". The desktop's `FaceGroup` draws the same.
 */
const FACES_UP_TO = 3;
/**
 * Everyone is the mark from two (Arjun, 6 November 2026: "I want to show the tile icon even for
 * 2+"). Two or three faces overlapped ran wider than the column's foot, and Everyone looked like
 * a few of them rather than the room.
 */
const EVERYONE_UP_TO = 1;
/** Between the colours of a mark. */
const SEAM = 1.5;

/** Whether `count` faces are drawn as one `Mark`: Everyone from two, any other step from four. */
export function marked(count: number, everyone = false): boolean {
  return count > (everyone ? EVERYONE_UP_TO : FACES_UP_TO);
}

/**
 * One step's faces: a single face, or several overlapped by `OVERLAP` points, each after the first
 * ringed in `ground` so the edge between two reads as two faces rather than one blot — the mock's
 * pair (`docs/proposals/who-a-message-is-for-mocks.html`). From four, or from two where they are
 * Everyone, they are one `Mark`.
 */
export function Faces({
  step,
  size = "sm",
  ground,
  everyone = false,
  counted = true,
}: {
  readonly step: Step;
  readonly size?: AvatarSize;
  /** What the faces stand on: the room's page, unless said. */
  readonly ground?: string | undefined;
  /** The faces are Everyone in the room, which is the mark from two (`marked`). */
  readonly everyone?: boolean | undefined;
  /**
   * A mark says how many beside it, except as a choice: there the words say who, and the number
   * pushed the mark off the line the other choices' faces stand on (Arjun, 6 November 2026).
   */
  readonly counted?: boolean | undefined;
}) {
  const palette = usePalette();
  const hops: readonly Hop[] = isGroup(step) ? step : [step];
  const ring = ground ?? palette.bg;
  if (marked(hops.length, everyone)) return <Mark hops={hops} size={size} counted={counted} />;
  return (
    <View style={styles.faces}>
      {hops.map((hop, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the faces of one step never reorder
          key={index}
          style={
            index === 0
              ? null
              : {
                  marginLeft: -OVERLAP - RING,
                  padding: RING,
                  margin: -RING,
                  borderRadius: avatarCorner(size, hop.kind) + RING,
                  backgroundColor: ring,
                }
          }
        >
          <Avatar
            name={hop.name}
            kind={hop.kind}
            size={size}
            icon={hop.icon}
            cantAnswer={hop.cantAnswer}
            markSide={hops.length > 1 ? "left" : "right"}
            ground={ring}
            testID="trail-face"
            decorative
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Where each colour of a mark sits in its square: two halves side by side, a half and two quarters
 * beside it, or four quarters, as a group's picture is cut in Messages. A square of four with two
 * colours left its foot empty.
 */
function cellsOf(count: number, side: number) {
  const cell = (side - SEAM) / 2;
  const far = cell + SEAM;
  const half = { width: cell, height: side };
  const quarter = { width: cell, height: cell };
  if (count === 2) {
    return [
      { left: 0, top: 0, ...half },
      { left: far, top: 0, ...half },
    ];
  }
  if (count === 3) {
    return [
      { left: 0, top: 0, ...half },
      { left: far, top: 0, ...quarter },
      { left: far, top: far, ...quarter },
    ];
  }
  return [0, 1, 2, 3].map((index) => ({
    left: index % 2 === 0 ? 0 : far,
    top: index < 2 ? 0 : far,
    ...quarter,
  }));
}

/**
 * Several as one face (ADR 0113, Arjun's pick of the mocks' B with a number): the first four's
 * colours in a square (`cellsOf`), in a face's own corner, and how many beside it where `counted`.
 * The faces are in the list the field opens, and on the sheet a route opens.
 */
function Mark({
  hops,
  size,
  counted,
}: {
  readonly hops: readonly Hop[];
  readonly size: AvatarSize;
  readonly counted: boolean;
}) {
  const palette = usePalette();
  const side = avatarSide(size);
  const cells = cellsOf(hops.length, side);
  return (
    <View
      style={styles.mark}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="faces-mark"
    >
      <View
        style={{
          width: side,
          height: side,
          borderRadius: avatarCorner(size, "agent"),
          overflow: "hidden",
        }}
      >
        {hops.slice(0, 4).map((hop, index) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: a colour's place in the mark is its identity; a step never reorders
            key={index}
            style={{
              position: "absolute",
              ...cells[index],
              backgroundColor: faceGround(hop.name, hop.icon),
            }}
            testID="faces-mark-cell"
          />
        ))}
      </View>
      {counted ? (
        <Text
          style={[
            styles.count,
            { color: palette.ink2, fontSize: size === "xs" ? TEXT.md : TEXT.lg },
          ]}
          testID="faces-count"
        >
          {hops.length}
        </Text>
      ) : null}
    </View>
  );
}

function isGroup(step: Step): step is readonly Hop[] {
  return Array.isArray(step);
}

/** What the row says about a lane still going: the dots while it works, the word when it failed. */
function Live({ live }: { readonly live: "working" | "failed" | undefined }) {
  const palette = usePalette();
  if (live === undefined) return null;
  if (live === "working") return <Dots colour={palette.ink3} testID="lane-working" />;
  return (
    <Pill tone={STATUS[live].tone} dot={STATUS[live].dot}>
      {STATUS[live].label}
    </Pill>
  );
}

/**
 * Where a tap on the chain goes: across the lane, to the space at its other end — and nowhere
 * when that end is the room the row is drawn in, which is what `here` says.
 */
function acrossOf(
  lane: Lane,
  kind: "route" | "task",
  here: string | undefined,
): string | undefined {
  const across = kind === "route" ? lane.homeSpaceId : lane.linkedSpaceIds[0];
  return across === here ? undefined : across;
}

export function LaneChain({
  lane,
  kind,
  directory,
  onOpen,
  here,
  files,
  lineId,
  faces,
}: {
  readonly lane: Lane;
  readonly kind: "route" | "task";
  readonly directory: Directory;
  /** The faces the person chose for spaces: a hop that is a room wears its room's. */
  readonly faces?: Faces | undefined;
  /** Opens the space at the lane's other end. Absent, and the row does not offer it. */
  readonly onOpen?: ((spaceId: string) => void) | undefined;
  /** The space the row is drawn in: a lane whose other end is this room has nowhere to cross to. */
  readonly here?: string | undefined;
  /** How a file the lane answered with is fetched and opened on this phone (M4.4). */
  readonly files?: FileService | undefined;
  /** The route line this row draws: the lane's files hang under it in the media viewer's deck. */
  readonly lineId?: string | undefined;
}) {
  const [sheet, setSheet] = useState<"open" | "closing" | "closed">("closed");
  const hops = hopsOf(lane, kind, directory, faces);
  const trail = hops.map((hop) => hop.name).join(" → ");
  const live = laneLive(lane);
  const across = acrossOf(lane, kind, here);
  const open = across === undefined || onOpen === undefined ? undefined : () => onOpen(across);
  const details = () => {
    Keyboard.dismiss();
    setSheet("open");
  };
  const said = live === undefined ? trail : `${trail}, ${STATUS[live].label.toLowerCase()}`;
  return (
    <>
      <ChainRow
        kind={kind}
        name={specialistName(lane, directory)}
        end={hops[hops.length - 1]}
        hops={hops}
        said={said}
        live={live}
        open={open}
        details={details}
      />
      {kind === "route" && lane.attachments !== undefined && lane.attachments.length > 0 ? (
        <View style={styles.files}>
          <Attachments attachments={lane.attachments} files={files} lineId={lineId} />
        </View>
      ) : null}
      {sheet === "closed" ? null : (
        <LaneDetails
          lane={lane}
          name={specialistName(lane, directory)}
          trail={trail}
          open={sheet === "open"}
          onClose={() => setSheet("closing")}
          onGone={() => setSheet("closed")}
        />
      )}
    </>
  );
}

/** The hue a name is written in: its face's chosen ground when it has one, so the two match. */
function hueOf(name: string, icon: SpaceIcon | undefined): string {
  if (icon === undefined) return avatarHue(name);
  return ICON_GROUNDS[icon.ground] ?? avatarHue(name);
}

/** The destination button and Details are siblings, never overlapping nested targets. */
function ChainRow({
  kind,
  name,
  end,
  hops,
  said,
  live,
  open,
  details,
}: {
  readonly kind: "route" | "task";
  readonly name: string;
  /** The far end of the lane: its outline, and the face it wears if one was chosen. */
  readonly end: Hop | undefined;
  readonly hops: readonly Hop[];
  readonly said: string;
  readonly live: "working" | "failed" | undefined;
  readonly open: (() => void) | undefined;
  readonly details: () => void;
}) {
  const palette = usePalette();
  const source = hueColours(hueOf(name, end?.icon), useScheme());
  const route = kind === "route";
  return (
    <View style={route ? styles.route : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={said}
        accessibilityHint={
          open === undefined
            ? "Opens the lane's details"
            : "Opens the space at the other end; press and hold for the lane's details"
        }
        testID={route ? "route-card" : "task-card"}
        onPress={open ?? details}
        onLongPress={details}
        style={({ pressed }) => [
          route ? styles.row : styles.caption,
          { backgroundColor: pressed ? palette.surface2 : "transparent" },
        ]}
      >
        {route ? (
          <>
            <Icon name="route" size={17} color={palette.ink3} />
            <Avatar
              name={name}
              kind={end?.kind ?? "harness"}
              size="sm"
              icon={end?.icon}
              testID="lane-face"
              decorative
            />
            <Text numberOfLines={1} style={[styles.names, { color: source.ink }]}>
              {name}
            </Text>
          </>
        ) : (
          <Trail hops={hops} />
        )}
        <Live live={live} />
        {route ? (
          <Text style={[styles.chevron, { color: palette.ink3 }]} accessibilityElementsHidden>
            {open === undefined ? "Details ›" : "›"}
          </Text>
        ) : null}
      </Pressable>
      {route && open !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Details for ${name}`}
          onPress={details}
          style={styles.detailsButton}
        >
          <Icon name="info" size={20} color={palette.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  route: { flexDirection: "row", alignItems: "center", marginTop: SPACE.sm },
  detailsButton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  // One quiet destination; the source is already the room title.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
  },
  // A caption over the person's bubble, in the specialist's room: the faces, no ground. Which
  // side of the room it stands on is the bubble's business, and the line settles it (`Line.tsx`).
  caption: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingVertical: SPACE.xs },
  trail: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  arrow: { fontSize: TEXT.sm },
  faces: { flexDirection: "row", alignItems: "center" },
  mark: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  count: { fontWeight: "600", fontVariant: ["tabular-nums"], letterSpacing: -0.2 },
  // The space the work went to, on the route row: the one name the lead's room does not say.
  names: { fontSize: TEXT.sm, fontWeight: "600", flex: 1 },
  chevron: { fontSize: TEXT.xs },
  // The lane's own files, under the row that stands for it and clear of the bubble beneath.
  files: { paddingTop: SPACE.sm },
});
