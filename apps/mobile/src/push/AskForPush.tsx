/**
 * Notifications, asked for when they matter (ADR 0170): the first time an agent asks this person
 * something, with the reason right there on the screen, and not at launch, when the question has
 * nothing behind it. A sheet says why; Turn on brings iOS's own alert, and the sheet's X (ADR 0169)
 * is not now. Asked once on this phone, whatever the answer; You → Notifications turns them on
 * any time after.
 *
 * A guest is asked otherwise (ADR 0198). Their one room is why they came, and an agent seldom
 * asks a guest anything, so they are asked once they are in it: "Hear when someone writes?". Yes
 * turns pushes on and sets that room to every message.
 */

import type { Device, Snapshot, Space, Store } from "@chipschat/core";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { readSetting, SETTINGS, writeSetting } from "../prefs";
import { withLevel } from "../spaces/roomNotify";
import { useSnapshot } from "../store/provider";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { pushIsOn, turnOnPush } from "./turnOn";

type Stage = "idle" | "checking" | "open" | "done";

/** A guest's one room, once they are in it; nothing for anybody else. */
function guestRoom(snapshot: Snapshot, selfId: string): Space | undefined {
  if (snapshot.model.people?.[selfId]?.role !== "guest") return undefined;
  return snapshot.model.spaces?.find((space) => space.members.includes(selfId));
}

/** Pushes on, and for a guest their room set to every message, which is what they said yes to. */
async function turnOn(store: Store, device: Device, room: Space | undefined): Promise<void> {
  const turned = await turnOnPush(device);
  if (room === undefined || turned.kind !== "on") return;
  const settings = await store.loadNotificationSettings().catch(() => store.notificationSettings());
  // Not saved, it is still there to choose on the room's sheet.
  await store.saveNotificationSettings(withLevel(settings, room.id, "all")).catch(() => undefined);
}

/**
 * Whether to ask now: never asked here, pushes not already on (or impossible), and a server that
 * can send them. One that can't (ADR 0244) is not asked about, and not counted as asked: You says
 * why, and this asks once it can.
 */
async function shouldAsk(store: Store): Promise<boolean> {
  const asked = await readSetting(SETTINGS.pushAsked).catch(() => undefined);
  if (asked === "1") return false;
  const facts = await Promise.resolve()
    .then(() => store.serverFacts())
    .catch(() => undefined);
  if (facts?.pushes !== undefined && facts.pushes !== "ready") return false;
  return (await pushIsOn().catch(() => "never" as const)) === false;
}

export function AskForPush({ store, device }: { readonly store: Store; readonly device: Device }) {
  const palette = usePalette();
  const snapshot = useSnapshot(store);
  const room = guestRoom(snapshot, device.participantId);
  const asking = room !== undefined || snapshot.model.needsYou.length > 0;
  const [stage, setStage] = useState<Stage>("idle");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!asking || stage !== "idle") return;
    setStage("checking");
    void shouldAsk(store).then((ask) => setStage(ask ? "open" : "done"));
  }, [asking, stage, store]);
  const close = () => {
    void writeSetting(SETTINGS.pushAsked, "1").catch(() => undefined);
    setStage("done");
  };
  return (
    <Sheet open={stage === "open"} onClose={close} testID="push-ask">
      <View style={styles.body}>
        <View style={[styles.bell, { backgroundColor: palette.goldSoft }]}>
          <Icon name="bell" size={28} color={palette.goldDeep} />
        </View>
        <Text style={[styles.title, { color: palette.ink }]}>
          {room === undefined ? "Hear when an agent needs you?" : "Hear when someone writes?"}
        </Text>
        <Text style={[styles.words, { color: palette.ink3 }]}>
          {room === undefined
            ? "Chips tells you when an agent asks you something, so it isn't left waiting, and when another person writes in one of your spaces. Each space's sheet can change that."
            : `Chips tells you when someone writes in ${room.title ?? "your space"}, and when an agent there needs you.`}
        </Text>
        <View style={styles.actions}>
          <Button
            label="Turn on notifications"
            variant="gold"
            busy={busy}
            onPress={() => {
              setBusy(true);
              void turnOn(store, device, room).finally(() => {
                setBusy(false);
                close();
              });
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.lg,
  },
  bell: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  title: { marginTop: SPACE.xs, fontSize: TEXT.lg + 4, fontWeight: "700", textAlign: "center" },
  words: { fontSize: TEXT.md, textAlign: "center", maxWidth: 300 },
  actions: { alignSelf: "stretch", gap: SPACE.sm, marginTop: SPACE.sm },
});
