/**
 * What a person hears about, wherever they are (ADR 0085): decisions, quiet hours, and a word per
 * agent. These are the person's rather than the phone's — they live on the server, and the desktop
 * reads and writes the same ones — and they stand in Notifications' one card under the switch
 * that is this phone's (`Push.tsx`), which You puts together (ADR 0085, 20 October 2026).
 *
 * Each row says what it is set to and opens a sheet that changes it; what a row is about is its
 * hint, and the sheet's to say. Saving is immediate and
 * optimistic, and a save the server refuses puts the setting back and says so under the card,
 * rather than leaving a screen that disagrees with the server. The settings are read again
 * whenever the app comes back to the front, so a change made on the desktop shows here.
 *
 * Review and FYI, which stood here until ADR 0085, are not: the server pushes a phone decisions
 * and messages, so on a phone they changed nothing at all. The desktop keeps them, where they do.
 * Which messages is each space's word, on its sheet: what other people write there, until the
 * person chooses otherwise (ADR 0216), and the line under the card says so.
 *
 * The sheets stand beside You's scroll, not in it (`You.tsx`).
 */

import type { Store } from "@chipschat/core";
import type { HarnessNotifications, NotificationSettings, QuietHours } from "@chipschat/protocol";
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Switch, Text, View } from "react-native";
import { thisDevice } from "../device/word";
import { platform } from "../push/register";
import { Avatar } from "../ui/Avatar";
import { Group, GroupFoot, GroupRow, RowMark } from "../ui/Group";
import { Icon } from "../ui/Icon";
import { Segmented } from "../ui/Segmented";
import { Sheet, SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { AVATAR_HUES, SPACE, TEXT } from "../ui/tokens";
import { pushNote } from "./Push";
import { QuietTimes } from "./QuietTimes";
import { SheetHead } from "./SheetHead";
import { agentsWords, DECIDE_WORDS, HEAR_WORDS, quietSub, quietWords } from "./words";

type Agent = { readonly id: string; readonly name: string };

/** Quiet hours as they start when first turned on: the night. */
const NIGHT: QuietHours = { from: "22:00", to: "07:00", breakthrough: "decide" };

/**
 * The person's settings: what the store has, then what the server says, again each time the app
 * comes to the front. A save shows at once and is taken back if the server refuses it.
 */
export function useNotificationSettings(store: Store) {
  const [settings, setSettings] = useState<NotificationSettings>(() =>
    store.notificationSettings(),
  );
  const [error, setError] = useState<string | undefined>(undefined);
  // The last the server agreed to, which a refused save goes back to.
  const agreed = useRef(settings);

  useEffect(() => {
    let live = true;
    const load = () => {
      store.loadNotificationSettings().then(
        (loaded) => {
          if (!live) return;
          agreed.current = loaded;
          setSettings(loaded);
        },
        () => undefined,
      );
    };
    load();
    const listening = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      live = false;
      listening.remove();
    };
  }, [store]);

  const save = useCallback(
    (next: NotificationSettings) => {
      setSettings(next);
      setError(undefined);
      store.saveNotificationSettings(next).then(
        () => {
          agreed.current = next;
        },
        (failure: unknown) => {
          setSettings(agreed.current);
          setError(
            `Not saved: ${failure instanceof Error ? failure.message : "the server did not answer"}.`,
          );
        },
      );
    },
    [store],
  );
  return { settings, save, error };
}

type Open = "decide" | "quiet" | "agents" | undefined;

/**
 * What reaches this phone, under the card: decisions, for all but a guest (ADR 0196), messages that
 * @ the person, and what other people write in their spaces, which is where every space starts
 * (ADR 0216) and its sheet changes.
 */
export function reachWords(guest: boolean): string {
  return guest
    ? `Messages that @ you reach ${thisDevice()}, and so does what other people write in your space. The space's sheet sets what it sends, under Notifications.`
    : `Decisions reach ${thisDevice()}, and so do messages that @ you and what other people write in your spaces. Each space's sheet sets what it sends, under Notifications.`;
}

/** What Decisions and Agents are about, for a screen reader: the sheets say it to everyone. */
const DECIDE_SUB = "An approval or question an agent is stopped on";
const AGENTS_SUB = "How much each harness can notify you";

export function useNotificationsGroup({
  store,
  harnesses,
  guest = false,
}: {
  readonly store: Store;
  /** Every harness in the workspace, by id and name, for Agents. */
  readonly harnesses: readonly Agent[];
  /** A guest is never asked to decide anything, so has no Decisions row (ADR 0196). */
  readonly guest?: boolean;
}): {
  /** Decisions, Quiet hours and Agents, for the card under the push switch. */
  readonly rows: readonly ReactElement[];
  /** The line under the card: what reaches this phone, or a save the server refused. */
  readonly foot: ReactNode;
  /** A save was refused: its line stands under the card even when push has trouble of its own. */
  readonly failed: boolean;
  readonly overlays: ReactNode;
} {
  const palette = usePalette();
  const { settings, save, error } = useNotificationSettings(store);
  const [open, setOpen] = useState<Open>(undefined);
  const close = () => setOpen(undefined);
  const rows = [
    guest ? null : (
      <GroupRow
        key="decide"
        label="Decisions"
        accessibilityHint={DECIDE_SUB}
        value={DECIDE_WORDS[settings.decide]}
        mark={<RowMark icon="check" tint={palette.gold} ink="#231a00" />}
        onPress={() => setOpen("decide")}
        testID="decisions-row"
      />
    ),
    <GroupRow
      key="quiet"
      label="Quiet hours"
      accessibilityHint={quietSub(settings.quiet)}
      value={quietWords(settings.quiet)}
      mark={<RowMark icon="moon" tint={AVATAR_HUES[5]} ink="#ffffff" />}
      onPress={() => setOpen("quiet")}
      testID="quiet-row"
    />,
    harnesses.length === 0 ? null : (
      <GroupRow
        key="agents"
        label="Agents"
        accessibilityHint={AGENTS_SUB}
        value={agentsWords(harnesses, settings.harnesses)}
        mark={<RowMark icon="chip" tint={AVATAR_HUES[4]} ink="#ffffff" />}
        onPress={() => setOpen("agents")}
        testID="agents-row"
      />
    ),
  ].filter((row) => row !== null);
  const foot =
    error === undefined ? (
      <GroupFoot testID="notifications-reach">{reachWords(guest)}</GroupFoot>
    ) : (
      <GroupFoot tone={palette.red} testID="notifications-error">
        {error}
      </GroupFoot>
    );
  const overlays = (
    <>
      <DecideSheet
        open={open === "decide"}
        onClose={close}
        chosen={settings.decide}
        onChoose={(decide) => {
          save({ ...settings, decide });
          close();
        }}
      />
      <QuietSheet
        open={open === "quiet"}
        onClose={close}
        quiet={settings.quiet}
        onSave={(quiet) => save({ ...settings, quiet })}
      />
      <AgentsSheet
        open={open === "agents"}
        onClose={close}
        harnesses={harnesses}
        chosen={settings.harnesses}
        onChoose={(id, word) =>
          save({ ...settings, harnesses: { ...settings.harnesses, [id]: word } })
        }
      />
    </>
  );
  return { rows, foot, failed: error !== undefined, overlays };
}

const DECIDE_CHOICES: readonly {
  readonly value: NotificationSettings["decide"];
  readonly sub: string;
}[] = [
  { value: "now", sub: `${thisDevice(true)} buzzes, through quiet hours too if you let them` },
  { value: "off", sub: "Nothing buzzes. They still wait for you in their space" },
];

/** Decisions: right away, or never a buzz. Two rows and a tick; a tap chooses and closes. */
function DecideSheet({
  open,
  onClose,
  chosen,
  onChoose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly chosen: NotificationSettings["decide"];
  readonly onChoose: (decide: NotificationSettings["decide"]) => void;
}) {
  const palette = usePalette();
  return (
    <Sheet open={open} onClose={onClose} testID="decide-sheet">
      <SheetHead title="Decisions" />
      <Group>
        {DECIDE_CHOICES.map((choice) => (
          <GroupRow
            key={choice.value}
            label={DECIDE_WORDS[choice.value]}
            sub={choice.sub}
            accessibilityLabel={DECIDE_WORDS[choice.value]}
            accessibilityHint={choice.sub}
            onPress={() => onChoose(choice.value)}
            trailing={
              choice.value === chosen ? (
                <Icon name="check" size={20} color={palette.accent} />
              ) : null
            }
            testID={`decide-${choice.value}`}
          />
        ))}
      </Group>
      <GroupFoot>
        A decision is an approval, or a question with no default answer: the agent stops until you
        answer it. These are yours on every device: the desktop's banners follow them too.
      </GroupFoot>
      <GroupFoot testID="push-note">{pushNote(platform() ?? "ios")}</GroupFoot>
    </Sheet>
  );
}

/**
 * Quiet hours: a switch, the window, and whether a decision still gets through. What is changed
 * here is held until the sheet goes, and saved once then, rather than once for every notch the
 * wheel turns past.
 */
function QuietSheet({
  open,
  onClose,
  quiet,
  onSave,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly quiet: QuietHours | undefined;
  readonly onSave: (quiet: QuietHours | undefined) => void;
}) {
  const [draft, setDraft] = useState(quiet);
  // Each opening starts from what is saved, which may have changed on another device since.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read on opening, not on every save
  useEffect(() => {
    if (open) setDraft(quiet);
  }, [open]);
  const finish = () => {
    if (JSON.stringify(draft) !== JSON.stringify(quiet)) onSave(draft);
    onClose();
  };
  return (
    <Sheet open={open} onClose={finish} testID="quiet-sheet">
      <SheetHead title="Quiet hours" />
      <Group>
        <GroupRow
          label="Use quiet hours"
          trailing={
            <Switch
              testID="quiet-switch"
              accessibilityLabel="Use quiet hours"
              value={draft !== undefined}
              onValueChange={(on) => setDraft(on ? (quiet ?? NIGHT) : undefined)}
            />
          }
        />
      </Group>
      {draft === undefined ? (
        <GroupFoot>Nothing buzzes while they last, except what you let through.</GroupFoot>
      ) : (
        <View style={styles.window}>
          <QuietTimes
            from={draft.from}
            to={draft.to}
            onChange={(times) => setDraft({ ...draft, ...times })}
          />
          <Group>
            <GroupRow
              label="Let decisions through"
              trailing={
                <Switch
                  testID="quiet-through"
                  accessibilityLabel="Let decisions through"
                  value={draft.breakthrough === "decide"}
                  onValueChange={(on) =>
                    setDraft({ ...draft, breakthrough: on ? "decide" : "none" })
                  }
                />
              }
            />
          </Group>
          <GroupFoot>
            {draft.breakthrough === "decide"
              ? "An approval still buzzes: it expires, and a run waits on it. Nothing else does until it's over."
              : "Nothing buzzes until it's over, not even an approval. It waits in its space."}{" "}
            It can run across midnight.
          </GroupFoot>
        </View>
      )}
    </Sheet>
  );
}

const PER_AGENT: readonly { readonly value: HarnessNotifications; readonly label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "decide", label: "Decisions" },
  { value: "none", label: "Nothing" },
];

/**
 * A word per harness: its face and name, three choices under them, and under those what the
 * chosen one lets through. The row says Agents, but the word is the harness's, and it covers
 * every agent that harness runs — so the sheet says so before the list.
 */
function AgentsSheet({
  open,
  onClose,
  harnesses,
  chosen,
  onChoose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly harnesses: readonly Agent[];
  readonly chosen: NotificationSettings["harnesses"];
  readonly onChoose: (id: string, word: HarnessNotifications) => void;
}) {
  const palette = usePalette();
  return (
    <Sheet open={open} onClose={onClose} sizing="bounded" cap={0.8} testID="agents-sheet">
      <SheetHead title="Agents" />
      <Text style={[styles.lead, { color: palette.ink3 }]}>
        One choice per harness. It covers every agent that harness runs.
      </Text>
      <SheetScroll style={styles.shrink} contentContainerStyle={styles.agents}>
        {harnesses.map((harness) => (
          <View key={harness.id} style={styles.agent}>
            <View style={styles.agentName}>
              <Avatar name={harness.name} kind="harness" size="sm" decorative />
              <Text style={[styles.agentWords, { color: palette.ink }]}>{harness.name}</Text>
            </View>
            <Segmented
              label={`Hear from ${harness.name}`}
              options={PER_AGENT}
              chosen={chosen[harness.id] ?? "all"}
              onChoose={(value) => onChoose(harness.id, value as HarnessNotifications)}
            />
            <Text style={[styles.hear, { color: palette.ink3 }]}>
              {HEAR_WORDS[chosen[harness.id] ?? "all"]}
            </Text>
          </View>
        ))}
      </SheetScroll>
      <GroupFoot>Whatever you choose, its spaces still show everything it says.</GroupFoot>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  window: { gap: SPACE.md, paddingTop: SPACE.md },
  shrink: { flexShrink: 1 },
  agents: { gap: SPACE.lg, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm },
  agent: { gap: SPACE.sm },
  agentName: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  agentWords: { fontSize: TEXT.body, fontWeight: "600" },
  lead: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.md,
  },
  hear: { fontSize: TEXT.sm },
});
