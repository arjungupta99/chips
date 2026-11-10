/**
 * An invite, opened (ADR 0164): `chips://join?invite=…&lan=…&relay=…&key=…`, from the web's join
 * page ("Open in Chips"), or a link pasted or scanned on the pairing screen.
 *
 * A phone in no workspace gets the join card, the whole screen. A phone in one gets a sheet over
 * whatever it was showing, which is why this route is a see-through modal (`app/_layout.tsx`):
 * the screen beneath stays in view under the sheet.
 *
 * Which of the two is decided once, when the phone's devices have been read, and held: joining
 * makes the phone paired, and the card must not turn into the sheet on its way out.
 */

import type { Device } from "@chipschat/core";
import { inviteFromLink } from "@chipschat/protocol";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { WAYS_IN } from "../src/demo/home";
import { JoinCard } from "../src/pairing/JoinCard";
import { JoinSheet } from "../src/pairing/JoinSheet";
import { landIn } from "../src/pairing/landing";
import { offerOf } from "../src/pairing/useInvite";
import { useChips } from "../src/store/provider";
import { useLayout } from "../src/ui/layout";

export default function JoinScreen() {
  const { invite, lan, relay, key } = useLocalSearchParams<{
    invite?: string;
    lan?: string;
    relay?: string;
    key?: string;
  }>();
  const { ready, paired, began } = useChips();
  const router = useRouter();
  const { wide } = useLayout();
  const as = useRef<
    { readonly card: true } | { readonly sheet: NonNullable<typeof paired> } | undefined
  >(undefined);
  if (ready && as.current === undefined) {
    as.current = paired === undefined ? { card: true } : { sheet: paired };
  }

  // The params as the link they came in: one reader for every way an invite arrives.
  const offer = useMemo(() => {
    if (invite === undefined) return undefined;
    const fields = new URLSearchParams({ invite });
    if (lan !== undefined) fields.set("lan", lan);
    if (relay !== undefined && key !== undefined) {
      fields.set("relay", relay);
      fields.set("key", key);
    }
    return offerOf(inviteFromLink(`chips://join?${fields.toString()}`));
  }, [invite, lan, relay, key]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(paired === undefined ? WAYS_IN : "/");
  };
  // Back from the sheet, into a space of this workspace when the link named one (ADR 0168). Wide,
  // Spaces opens it beside the list. On a phone the room itself: gone back to when it is under
  // the sheet, so a link to the room on screen never stacks it twice; in its place otherwise.
  const stay = (spaceId: string | undefined) => {
    if (spaceId === undefined) return back();
    if (wide) {
      landIn(spaceId);
      return back();
    }
    router.dismissTo(`/spaces/${spaceId}`);
  };
  const toSpaces = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  };
  // Into the workspace joined. Changing the phone's workspace rebuilds every screen, this one
  // with them if it is still there: the link is remembered as joined by, so that this screen,
  // drawn again, goes to Spaces rather than reading a link that is spent now.
  const into = (device: Device, spaceId?: string) => {
    if (invite !== undefined) JOINED.add(invite);
    // A space's link lands in the space (ADR 0168): Spaces opens it once it is here.
    if (spaceId !== undefined) landIn(spaceId);
    began(device);
    toSpaces();
  };

  const joined = invite !== undefined && JOINED.has(invite);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for a link already joined by
  useEffect(() => {
    if (joined) toSpaces();
  }, [joined]);
  if (joined || as.current === undefined) return null;
  if ("sheet" in as.current) {
    return (
      <JoinSheet
        offer={offer}
        paired={as.current.sheet}
        onDone={(device, spaceId) => (device === undefined ? stay(spaceId) : into(device, spaceId))}
      />
    );
  }
  return <JoinCard offer={offer} onJoined={into} onCancel={back} />;
}

/** The links this phone has joined by since it was opened: each is spent, or one person's. */
const JOINED = new Set<string>();
