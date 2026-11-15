/**
 * This phone (ADR 0085): how much it keeps, and the server it is paired with and how it is reaching
 * it. It was About, with a paragraph under it on what Media on this phone is; the page Media opens
 * says that, and the heading now says whose these are (ADR 0085, 20 October 2026). Media comes
 * first, as the one row here that opens something; the facts under it wear the quiet grey marks
 * Devices wears. The build it ended with went to About Chips's page (ADR 0295), where the version
 * is the row's value.
 *
 * The server by its host, whole, since it is the one thing here a person may need to read out or
 * type somewhere else. Then which way the phone is reaching it: straight over the network, or
 * through the relay when the network does not answer. The mark at the top right of every tab
 * (`ui/Connection.tsx`) speaks only when the phone is not connected at all; it wore gold for the
 * relay until the relay went live and a phone away from home wore it for hours. Connected is
 * connected, so which way is said here, where it is looked for, and the row opens Connection
 * (ADR 0211), which draws the way, times it and says what the relay can see.
 *
 * What is kept: every attachment opened here is kept on the phone so a second look costs nothing.
 * This says how much it has come to, measured again each time You comes back into view, and opens
 * Media on this phone (ADR 0159), where it is shown by space and let go of — a space's, some
 * files, or all of it. It all comes back from the server the next time it is opened.
 */

import type { ConnectionState, LinkKind } from "@chipschat/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { thisDevice } from "../device/word";
import { keptBytes } from "../spaces/local";
import { Group, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { AVATAR_HUES } from "../ui/tokens";
import { useOpenPage, usePage } from "./pages";
import { hostOf, sizeWords } from "./words";

/** What the row says of a relay the server names under a key this phone did not pin (SEC-2). */
export const REKEYED_WORDS =
  "The server names a relay under a new key. This phone keeps the key it paired with; pair it again to use the new one.";

/**
 * Which way this phone is reaching its server, as the row says it: a word for the value, and under
 * it, through the relay, which relay — by its host when the device has kept it. Straight over the
 * network needs no line. A relay the server names under another key is said under either, since
 * the phone keeps the key it pinned and only pairing again takes the new one (SEC-2).
 */
export function connectionWords(
  state: ConnectionState,
  link: LinkKind | undefined,
  relayUrl: string | undefined,
  rekeyed = false,
): { readonly value: string; readonly sub?: string } {
  if (state === "connecting") return { value: "Connecting…" };
  if (state !== "open") return { value: "Not connected" };
  const said: { readonly value: string; readonly sub?: string } =
    link !== "relay"
      ? { value: "Direct" }
      : {
          value: "Relay",
          sub: `Encrypted, via ${relayUrl === undefined ? "Chips's relay" : hostOf(relayUrl)}`,
        };
  if (!rekeyed) return said;
  return { ...said, sub: said.sub === undefined ? REKEYED_WORDS : `${said.sub}. ${REKEYED_WORDS}` };
}

export function ThisDevice({
  serverUrl,
  connection,
  link,
  relayUrl,
  rekeyed,
}: {
  readonly serverUrl: string | undefined;
  readonly connection: ConnectionState;
  readonly link: LinkKind | undefined;
  /** The relay the device has kept, when its server named one. */
  readonly relayUrl: string | undefined;
  /** The snapshot's `rekeyed` (SEC-2). */
  readonly rekeyed?: boolean | undefined;
}) {
  const media = usePage("media");
  const connectionPage = usePage("connection");
  // Beside the list on an iPad, Media is let go of with You in view: the page open is said too.
  const open = useOpenPage();
  const [kept, setKept] = useState<number | undefined>(undefined);
  // Again whenever You comes back into view: back from Media on this phone, or from a room whose
  // photos were opened, the row says what is kept now; and when another page opens beside it.
  useFocusEffect(
    // biome-ignore lint/correctness/useExhaustiveDependencies: `open` is when to read again.
    useCallback(() => {
      keptBytes().then(setKept, () => setKept(undefined));
    }, [open]),
  );

  return (
    <>
      <GroupHeading>{thisDevice(true)}</GroupHeading>
      <Group inset={MARKED_INSET} testID="about">
        <GroupRow
          label={`Media on ${thisDevice()}`}
          value={kept === undefined ? "…" : sizeWords(kept)}
          mark={<RowMark icon="image" tint={AVATAR_HUES[6]} ink="#ffffff" />}
          accessibilityHint="What was opened here and is kept, by space, to let go of"
          onPress={media.onPress}
          selected={media.selected}
          testID="about-media"
        />
        <GroupRow
          label="Server"
          sub={hostOf(serverUrl)}
          mark={<RowMark icon="globe" />}
          testID="about-server"
        />
        <GroupRow
          label="Connection"
          {...connectionWords(connection, link, relayUrl, rekeyed)}
          mark={<RowMark icon="pulse" />}
          accessibilityHint="Which way this phone reaches the server, drawn, and how fast"
          onPress={connectionPage.onPress}
          selected={connectionPage.selected}
          testID="about-connection"
        />
      </Group>
    </>
  );
}
