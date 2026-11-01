/**
 * What a face is drawn with for a participant (ADR 0089): its outline, and the face chosen for it —
 * an agent's, chosen by a person, or a person's own (ADR 0139). Spread onto `Avatar`, so every
 * screen that draws somebody by id draws them the same way: an agent the bitten body, a person the
 * circle, each wearing its own face.
 */

import type { Directory } from "@chipschat/core";
import { faceKind, faceOf } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";

export interface FaceProps {
  readonly kind: "person" | "agent" | "harness";
  readonly icon?: SpaceIcon | undefined;
}

export function faceProps(directory: Directory, id: string): FaceProps {
  const kind = faceKind(directory, id);
  // Only an agent's and a person's row carries a face; anybody else's is none.
  const icon = faceOf(directory, id);
  return icon === undefined ? { kind } : { kind, icon };
}
