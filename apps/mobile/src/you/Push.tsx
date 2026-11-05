/**
 * *Notify me on this phone* — the switch that makes a decision buzz (M4.3, ADR 0045), the first row
 * of Notifications' card: it is the one setting there that is this phone's rather than the
 * person's (ADR 0085). It hands You its rows and, when something is wrong, the line under the
 * card, and You puts them in the one card with the rest (ADR 0085, 20 October 2026).
 *
 * Several things can be wrong, and each says which: this build has no EAS project id, no push
 * entitlement on iOS or no Firebase project on Android, so there is no token to be had; the person
 * said no to notifications, which only Settings can undo; iOS or Expo would not issue a token; or
 * the server did not take it. The last two are told apart on purpose — a token refused on the
 * phone once read as the server's fault, which sent the person to the wrong machine. A switch that
 * fails silently is worse than no switch.
 *
 * The server can be what is wrong while the switch is fine (ADR 0244): one with no access token for
 * Expo, which delivers the Chips app's pushes, or one Expo refused, sends nothing. The line under
 * the switch says so, on or off, rather than the switch standing on for pushes that never come.
 *
 * Off is remembered here as well as at the server. Whether the phone allows notifications at all
 * is the system's to say, and it keeps saying yes after the person has turned Chips's own pushes
 * off; read alone, it turned the switch back on the next time You was opened. On is remembered
 * only once the server has taken the token (`pushIsOn`): allowed by the system alone, it stood on
 * for a registration that never reached the server.
 *
 * What a push actually carries (`pushNote`) is said in the Decisions sheet. People are right to be
 * careful about handing a lock screen to a service they have never heard of, and the honest
 * answer — that an approval is waiting, and nothing about it — is short enough to print.
 */

import type { Device, ServerPushes, Store } from "@chipschat/core";
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Linking, Switch } from "react-native";
import { deviceWord, thisDevice } from "../device/word";
import { choosePush, onPushChosen } from "../push/chosen";
import {
  buildTakesPush,
  platform,
  projectId,
  refreshRegistration,
  unregisterToken,
} from "../push/register";
import { pushIsOn, turnOnPush } from "../push/turnOn";
import { GroupFoot, GroupRow, RowMark } from "../ui/Group";
import { usePalette } from "../ui/theme";

/** What the screen is showing: what it knows, and why it cannot do better. */
type State =
  | { readonly kind: "reading" }
  | { readonly kind: "off" }
  | { readonly kind: "on" }
  | { readonly kind: "working" }
  | { readonly kind: "no_project" }
  | { readonly kind: "not_a_phone" }
  | { readonly kind: "refused" }
  | { readonly kind: "no_entitlement" }
  | { readonly kind: "no_firebase" }
  | { readonly kind: "no_token"; readonly why: string }
  | { readonly kind: "failed"; readonly why: string };

const WORDS: Readonly<Record<string, string>> = {
  no_project:
    "This build has no Expo project id, so there is no push token to ask for. `eas init` in apps/mobile adds one.",
  not_a_phone: "Push is for the phone app. In a browser, the desktop app raises the banners.",
  refused: `${thisDevice(true)} is not allowing notifications from Chips. Settings → Notifications → Chips can turn them back on.`,
  no_entitlement:
    "This build cannot receive push: it was signed without the push entitlement, which a free Apple team cannot sign. Build it with a paid Apple team.",
  no_firebase:
    "This build cannot receive push: it was built without a Firebase project, which push on Android goes through. Build it with the project's google-services.json.",
};

/** Why the server sends nothing, when it can't push (ADR 0244). */
const SERVER_WORDS: Readonly<Record<Exclude<ServerPushes, "ready">, string>> = {
  no_access_token:
    "Your server can't send notifications yet. It needs an access token for Expo, which delivers them to the Chips app. Until then, what needs you waits in Chips.",
  refused:
    "Your server can't send notifications: Expo turned down its access token. Until whoever runs it gives it one that works, what needs you waits in Chips.",
  failing:
    "Your server's last notifications didn't get through: the service that delivers them didn't accept them. The next one will try again. Until then, what needs you waits in Chips.",
};

/** What the switch shows before anybody has touched it, and why. */
async function currentState(): Promise<State> {
  if (platform() === undefined) return { kind: "not_a_phone" };
  if (projectId() === undefined) return { kind: "no_project" };
  // Said before the switch is touched: allowed at the system, it stood on for a build that can
  // never be pushed to (the emulator, 16 October 2026).
  if (!buildTakesPush()) return { kind: "no_firebase" };
  // The setup card's tick reads the same.
  return { kind: (await pushIsOn()) === true ? "on" : "off" };
}

/**
 * What the line under the switch says: the trouble, when there is some. The phone's own trouble
 * first, since it is what the switch can't get past; then the server's, whichever way it is set.
 */
function problemOf(state: State, server: ServerPushes | undefined): string | undefined {
  if (state.kind === "failed") return `The server did not take it: ${state.why}`;
  if (state.kind === "no_token")
    return `${thisDevice(true)} could not get a push token: ${state.why}`;
  const phone = WORDS[state.kind];
  if (phone !== undefined) return phone;
  if ((state.kind === "on" || state.kind === "off") && server !== undefined && server !== "ready") {
    return SERVER_WORDS[server];
  }
  return undefined;
}

/**
 * Disabled while it is thinking, and where flipping it cannot help: a build with no project id or
 * no push entitlement, and a browser, are not things the person can fix from here. A refusal is:
 * they go to Settings, allow notifications, come back and try again, and the switch has to still
 * work. So is a token that did not come, which may be a dropped network.
 */
function stuckIn(state: State): boolean {
  return (
    state.kind === "reading" ||
    state.kind === "working" ||
    state.kind === "no_project" ||
    state.kind === "no_entitlement" ||
    state.kind === "no_firebase" ||
    state.kind === "not_a_phone"
  );
}

function usePush(device: Device, others: readonly Device[], store: ServerFactsOf | undefined) {
  const [state, setState] = useState<State>({ kind: "reading" });
  const [server, setServer] = useState<ServerPushes | undefined>(undefined);
  const turning = useRef(false);

  useEffect(() => {
    let live = true;
    void currentState().then((next) => {
      if (live) setState(next);
    });
    void store
      ?.serverFacts()
      .then((facts) => {
        if (live) setServer(facts.pushes);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store]);

  // Turned on elsewhere, by the ask at an agent's first question or the setup card, while this is
  // on screen (an iPad shows You beside the rest): read again, unless this switch is the one at it.
  useEffect(
    () =>
      onPushChosen(() => {
        if (turning.current) return;
        void currentState().then((next) => {
          if (!turning.current) setState(next);
        });
      }),
    [],
  );

  const turn = useCallback(
    async (on: boolean) => {
      setState({ kind: "working" });
      turning.current = true;
      try {
        if (!on) {
          await unregisterToken(device);
          // Every workspace this phone holds is told (ADR 0197); one behind that can't be reached
          // keeps a token its own Devices page lists.
          await Promise.all(others.map((each) => unregisterToken(each).catch(() => undefined)));
          await choosePush("off");
          setState({ kind: "off" });
          return;
        }
        const turned = await turnOnPush(device);
        if (turned.kind === "on") {
          await Promise.all(
            others.map((each) => refreshRegistration(each, "on").catch(() => undefined)),
          );
        }
        setState(turned);
      } catch (error) {
        setState({ kind: "failed", why: error instanceof Error ? error.message : "no answer" });
      } finally {
        turning.current = false;
      }
    },
    [device, others],
  );
  return { state, server, turn };
}

/** Where the switch reads whether the server can push. */
type ServerFactsOf = Pick<Store, "serverFacts">;

const NONE: readonly Device[] = [];

/** What a push carries, said before anybody flips the switch: a decision's, and an agent's @ (ADR 0158). */
export function pushNote(os: string): string {
  const approve =
    os === "android"
      ? `Approve opens the ask once the ${deviceWord()} is unlocked.`
      : "Approve asks for Face ID.";
  const mention =
    os === "android"
      ? "When an agent @s you, a push says a message is waiting."
      : `When an agent @s you, a push shows what it said, sealed so only ${thisDevice()} can read it.`;
  return `A push says an approval is waiting, and carries no words about the ask: not the action, not the agent, not the space. ${approve} ${mention}`;
}

/**
 * The switch's rows, for Notifications' card: the switch, and Open Settings under it while the
 * phone refuses notifications. Then the trouble, when there is some, for under the card.
 */
export function usePushRows({
  device,
  others = NONE,
  store,
}: {
  readonly device: Device;
  /** The workspaces behind the one in front, but those muted here: told too (ADR 0197). */
  readonly others?: readonly Device[];
  /** The store of the workspace in front, which says whether its server can push (ADR 0244). */
  readonly store?: ServerFactsOf | undefined;
}): { readonly rows: readonly ReactElement[]; readonly problem: ReactNode } {
  const palette = usePalette();
  const { state, server, turn } = usePush(device, others, store);
  const problem = problemOf(state, server);
  const rows = [
    <GroupRow
      key="push"
      label={`Notify me on ${thisDevice()}`}
      mark={<RowMark icon="bell" tint={palette.red} ink="#ffffff" />}
      trailing={
        <Switch
          testID="push-switch"
          accessibilityLabel={`Notify me on ${thisDevice()}`}
          value={state.kind === "on"}
          disabled={stuckIn(state)}
          onValueChange={(on) => void turn(on)}
        />
      }
      testID="push"
    />,
  ];
  if (state.kind === "refused") {
    rows.push(
      <GroupRow
        key="settings"
        label="Open Settings"
        tone="accent"
        mark={<RowMark icon="gear" tint={palette.goldSoft} ink={palette.accent} />}
        onPress={() => void Linking.openSettings()}
      />,
    );
  }
  return {
    rows,
    problem:
      problem === undefined ? null : (
        <GroupFoot tone={palette.amberInk} testID="push-problem">
          {problem}
        </GroupFoot>
      ),
  };
}
