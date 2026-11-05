/**
 * What a face wears, in the words its Icon row says them (ADR 0174): core's `faceWords`, told which
 * marks this build's library holds, since a mark it has never heard of is drawn as the colour alone
 * (`Avatar`) and so is said as the colour alone too.
 */

import { faceWords as said } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { LIBRARY_MARKS } from "../ui/marks";

export function faceWords(face: SpaceIcon | undefined): string {
  return said(face, (mark) => mark in LIBRARY_MARKS);
}
