/**
 * Search's backdrop on the Mac and the web (ADR 0136, ADR 0138): with nothing typed, the faces of
 * your spaces and your agents rise slowly behind the recent searches and the empty page under
 * them, each in a glow of its own colour that breathes. Which spaces and agents, the sixteen places
 * and which face each wears are core's (`searchBackdrop.ts`), the phone's too; here each place is a
 * CSS animation, which the browser runs off the main thread.
 *
 * - **Behind the list.** It lies in the scrolling column, a window high, under the rows that come
 *   after it, so it starts where the field ends. A face's climb is measured in that height
 *   (`cqh`), so nothing is measured from script. Arjun had it start under the last row first, then
 *   asked for the faces under the recent searches as well (7 October 2026).
 * - **Agents with their pins.** An agent is drawn as the lists draw one, its pins inside its box,
 *   and they rest as lit as the mark's here, so they read through the backdrop's faintness.
 * - **Dim, never see-through.** Each face is drawn at its depth's strength over its own silhouette
 *   in the page's colour (an SVG filter), so where faces cross, the nearer hides the farther.
 * - **A breathing glow** behind each face, inside its sway: a round light of the face's colour
 *   swelling and settling, each place at its own point in a breath, as on the phone.
 * - **Behind, never in the way.** Hidden from screen readers, not a target for the pointer, and
 *   drawn at a third of its strength; it thins out to nothing just under the field.
 * - **Gone once you type**, fading as the results come in its place (`leaving`, ADR 0189), and back
 *   when the field is empty. Gone, it is kept out of sight with its faces still (`resting`), as the
 *   phone keeps its own, so it comes back without being drawn afresh: drawn again from nothing, its
 *   faces and their silhouettes held the frames as the field emptied (3 November 2026).
 * - **Still with less motion asked for**: each face and its glow stand where the round begins.
 * - **The faces hold while Search is open.** Which space or agent is in which place is taken when
 *   it first appears, so a room that moves to the top of the list while you watch does not change
 *   every face at once.
 */

import {
  BACKDROP_DEPTHS,
  BACKDROP_GLOW,
  BACKDROP_PLACES,
  BACKDROP_ROUND_MS,
  BACKDROP_SWAY,
  BACKDROP_TIP,
  type BackdropDepth,
  type BackdropLender,
  backdropFill,
  backdropLenders,
  type Directory,
  nameOf,
  spaceFace,
  spaceTitle,
  type WorkspaceModel,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, faceGround } from "@chipschat/ui";
import { type CSSProperties, type ReactNode, useRef } from "react";
import { spaceAvatar } from "./Sidebar.tsx";

/** The list's face is 32 pixels; each depth's is 52, 36 and 28, as on the phone. */
const FACE = 32;
const SCALE: Readonly<Record<BackdropDepth, number>> = { near: 1.625, mid: 1.125, far: 0.875 };

/**
 * How far every face sways and tips, for the stylesheet's one sway, and how its glow breathes: a
 * breath there and back is one of the round's `breaths`, and the animation goes each way in half.
 */
const SWAYING = {
  "--sway-x": `${BACKDROP_SWAY}px`,
  "--tip": `${BACKDROP_TIP}deg`,
  "--glow-across": BACKDROP_GLOW.across,
  "--glow-small": BACKDROP_GLOW.small,
  "--glow-full": BACKDROP_GLOW.full,
  "--glow-faint": BACKDROP_GLOW.faint,
  "--breath": `${BACKDROP_ROUND_MS / BACKDROP_GLOW.breaths / 2}ms`,
} as CSSProperties;

export function SearchBackdrop({
  model,
  directory,
  selfId,
  spaceIcons,
  leaving = false,
  resting = false,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly spaceIcons: ReadonlyMap<string, SpaceIcon>;
  /** Something has been typed: it fades away, the faces it wears held as they were. */
  readonly leaving?: boolean;
  /** Faded away while something is typed: out of sight, its faces still. */
  readonly resting?: boolean;
}) {
  const worn = useHeldLenders(model, directory, selfId);
  if (worn.length === 0) return null;
  return (
    <div
      className="search-backdrop"
      style={SWAYING}
      aria-hidden="true"
      data-leaving={leaving ? "" : undefined}
      data-resting={resting ? "" : undefined}
      data-testid="search-backdrop"
    >
      <Silhouettes />
      {worn.map((lender, at) => {
        const place = BACKDROP_PLACES[at];
        if (place === undefined) return null;
        const { face, ground } = faceOf(lender, directory, selfId, spaceIcons);
        const scale = SCALE[place.depth];
        // A sway there and back is one of the round's `sways`; the animation goes each way in half.
        const sway = BACKDROP_ROUND_MS / place.sways / 2;
        const style = {
          "--across": place.across,
          "--side": `${FACE * scale}px`,
          "--scale": scale,
          "--depth": BACKDROP_DEPTHS[place.depth].opacity,
          "--climb": `${BACKDROP_ROUND_MS / BACKDROP_DEPTHS[place.depth].climbs}ms`,
          "--start": place.start,
          "--sway": `${sway}ms`,
          "--sway-start": place.swayStart,
          "--glow": ground,
          "--breath-start": place.start,
        } as CSSProperties;
        return (
          // A place is its index: the faces move through the places, never the other way.
          // biome-ignore lint/suspicious/noArrayIndexKey: the places are a fixed table
          <span key={at} className="search-drift" style={style} data-testid="backdrop-face">
            <span className="search-drift-sway">
              <span className="search-glow" />
              <span className="search-drift-face">
                {/* The face's own shape in the page's colour, and the face, dim, over it. */}
                <span className="search-drift-silhouette">{face}</span>
                <span className="search-drift-avatar">{face}</span>
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * The filter that turns a face into its silhouette in the page's colour: wherever the face is
 * drawn, solid (its half-lit pins too, by doubling their alpha), in `--bg`. Each face is drawn at
 * its depth's strength over one of these, so a far face is dim but hides what is behind it (ADR
 * 0138's revision).
 */
function Silhouettes() {
  return (
    <svg className="search-silhouettes" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="search-silhouette" colorInterpolationFilters="sRGB">
        <feComponentTransfer in="SourceAlpha" result="solid">
          <feFuncA type="linear" slope={2} />
        </feComponentTransfer>
        <feFlood className="search-silhouette-colour" />
        <feComposite operator="in" in2="solid" />
      </filter>
    </svg>
  );
}

/**
 * A space's face as its row wears it, or an agent's as the lists draw it, and the colour each
 * stands on, which its glow is.
 */
function faceOf(
  lender: BackdropLender,
  directory: Directory,
  selfId: string | undefined,
  spaceIcons: ReadonlyMap<string, SpaceIcon>,
): { readonly face: ReactNode; readonly ground: string } {
  if (lender.kind === "agent") {
    const { name, face } = lender.agent;
    return {
      face: <Avatar name={name} kind="agent" icon={face} />,
      ground: faceGround(name, face),
    };
  }
  const { space } = lender;
  const title = spaceTitle(space, directory, selfId);
  const icon = spaceIcons.get(space.id);
  const named = spaceFace(space, directory);
  // Named after its one agent, it wears that agent's name, and that name's hue, as its row does.
  const name = "harnessId" in named ? nameOf(directory, named.harnessId) : title;
  return { face: spaceAvatar(space, directory, title, icon), ground: faceGround(name, icon) };
}

/**
 * The spaces' and agents' faces in their places as they were when the backdrop appeared. Nothing
 * taken yet, and it takes what there is: the workspace may still be on its way when the page
 * opens.
 */
function useHeldLenders(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string | undefined,
): readonly BackdropLender[] {
  const held = useRef<readonly BackdropLender[]>([]);
  if (held.current.length === 0)
    held.current = backdropFill(backdropLenders(model, directory, selfId ?? ""));
  return held.current;
}
