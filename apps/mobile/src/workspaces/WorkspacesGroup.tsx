/**
 * You's workspaces (ADR 0197): one row under your name saying which workspace is in front, with a
 * count when something waits in another, that opens the sheet Spaces' name opens — each workspace,
 * Rename for an owner, and Join another workspace (ADR 0085, 20 October 2026). It was a group of its own
 * at the top of You, which said the workspace a third time under your name and its role. Once the
 * phone holds two, Notifications gains a switch for each: a workspace quieted here is not told
 * where this phone is, and keeps no store behind the one in front.
 */

import { type Device, isDemo } from "@chipschat/core";
import { type ReactElement, type ReactNode, useState } from "react";
import { Switch, Text } from "react-native";
import { readSetting, SETTINGS } from "../prefs";
import { refreshRegistration, unregisterToken } from "../push/register";
import { useChips } from "../store/provider";
import { GroupRow, RowMark } from "../ui/Group";
import { usePalette } from "../ui/theme";
import { AVATAR_HUES } from "../ui/tokens";
import { useWorkspaceRows, type WorkspaceRow, WorkspacesSheet } from "./Switcher";

export interface WorkspacesSection {
  /** The row under your name. */
  readonly row: ReactElement;
  /** A switch for each workspace, for Notifications' card; none while there is one. */
  readonly notify: readonly ReactElement[];
  /** The sheet the row opens. */
  readonly overlays: ReactNode;
}

export function useWorkspacesGroup(): WorkspacesSection {
  const palette = usePalette();
  const rows = useWorkspaceRows();
  const [open, setOpen] = useState(false);
  const front = rows.find((row) => row.front);
  const waiting = rows.reduce((sum, row) => sum + (row.front ? 0 : row.waiting), 0);
  const row = (
    <GroupRow
      key="workspace"
      label="Workspace"
      value={front?.name}
      mark={<RowMark icon="chip" tint={palette.gold} ink="#231a00" />}
      trailing={
        waiting === 0 ? undefined : (
          <Text style={{ color: palette.red, fontWeight: "700" }}>{waiting}</Text>
        )
      }
      accessibilityLabel={
        waiting === 0
          ? `Workspace, ${front?.name ?? ""}`
          : `Workspace, ${front?.name ?? ""}, ${waiting} waiting in another`
      }
      accessibilityHint="Lists your workspaces, and joins another with a link"
      onPress={() => setOpen(true)}
      testID="you-workspace"
    />
  );
  const notify = useNotifyEach(rows);
  const overlays = <WorkspacesSheet open={open} onClose={() => setOpen(false)} />;
  return { row, notify, overlays };
}

/**
 * A switch for each workspace: off, and its server stops pushing to this phone and the phone keeps
 * no store for it; on, and it is told again where this phone is, when notifications are on at all.
 */
function useNotifyEach(all: readonly WorkspaceRow[]): readonly ReactElement[] {
  const { mute } = useChips();
  const [busy, setBusy] = useState<string | undefined>(undefined);
  // The demo's made-up workspace (ADR 0213) has nothing to notify from, and no switch.
  const rows = all.filter((row) => !isDemo(row.device));
  if (rows.length < 2) return [];
  const turn = async (device: Device, on: boolean) => {
    setBusy(device.deviceId);
    try {
      await mute(device.deviceId, !on);
      if (on) {
        const chosen = await readSetting(SETTINGS.push).catch(() => undefined);
        await refreshRegistration(device, chosen).catch(() => undefined);
      } else {
        await unregisterToken(device).catch(() => undefined);
      }
    } finally {
      setBusy(undefined);
    }
  };
  return rows.map((row) => (
    <GroupRow
      key={row.device.deviceId}
      label={`From ${row.name}`}
      mark={<RowMark icon="chip" tint={AVATAR_HUES[2]} ink="#ffffff" />}
      trailing={
        <Switch
          testID={`notify-${row.device.deviceId}`}
          accessibilityLabel={`Notify me from ${row.name}`}
          value={row.device.muted !== true}
          disabled={busy === row.device.deviceId}
          onValueChange={(on) => void turn(row.device, on)}
        />
      }
    />
  ));
}
