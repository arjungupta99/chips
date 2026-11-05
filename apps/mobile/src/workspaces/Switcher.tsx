/**
 * The workspaces this phone holds (ADR 0197), switched between from the top of Spaces (his A on
 * the own-Chips mock, 18 October 2026). Spaces is named for the workspace in front, with a ▾ and a
 * dot when something waits in another, and its name opens a sheet. The sheet lists each workspace
 * with its role and what waits there, and a tick on the one in front. It has Rename for an owner,
 * and Join another workspace, the signed-in phone's place to paste an invite or scan one (his
 * words, 18 October 2026: "the workspace name instead of the Spaces title", "rename from the same
 * bottom sheet"; Scan a QR code beside Paste, his B on the mock of 26 October 2026).
 */

import {
  attention,
  type Device,
  isDemo,
  mayRenameWorkspace,
  myRole,
  type Snapshot,
  type Store,
  workspaceLabel,
} from "@chipschat/core";
import { inviteFromLink } from "@chipschat/protocol";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLeave } from "../device/leave";
import { thisDevice } from "../device/word";
import { PasteAction } from "../pairing/PasteAction";
import { ScanSheet } from "../pairing/ScanSheet";
import { NO_INVITE, NOT_AN_INVITE, usePasteInvite } from "../pairing/usePasteInvite";
import { useChips } from "../store/provider";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { PageBack } from "../ui/PageBack";
import { Sheet, SheetCard, SheetPages, SheetRow, SheetTitle } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { guestStandingWords, ROLE_WORDS } from "../you/words";

/** One workspace this phone holds, as the switcher and You list it. */
export interface WorkspaceRow {
  readonly device: Device;
  readonly name: string;
  /** Its role there, "Guest in Japan trip" for a guest, or that it is quiet here. */
  readonly standing: string;
  /** What waits for the person there. */
  readonly waiting: number;
  readonly front: boolean;
  /** The person owns it, so may name it again (ADR 0194); the one in front is renamed here. */
  readonly renames: boolean;
}

/** What a workspace says of the person in it: their role, or for a guest their one space. */
function standingIn(snapshot: Snapshot | undefined, device: Device): string {
  if (snapshot === undefined) return device.muted === true ? "Notifications off here" : "";
  const role = myRole(snapshot.model, device.participantId);
  if (role === undefined) return "";
  if (role === "guest") {
    return guestStandingWords(snapshot.model, snapshot.directory, device.participantId) ?? "Guest";
  }
  return ROLE_WORDS[role];
}

const nothing = () => () => undefined;

/** What a row says of its workspace, without the device it is for. */
type Facts = Omit<WorkspaceRow, "device" | "front">;

/**
 * What the row for the workspace in front says, read from its store as it changes: the same object
 * while it says the same, so whatever reads it is drawn again only when that changes. Read whole,
 * the snapshot drew Spaces, its switcher and You's Workspace row at every word the store heard,
 * at once, behind a room as well (the simulator, 19 October 2026).
 */
function useFrontFacts(store: Store | undefined, device: Device | undefined): Facts | undefined {
  const last = useRef<Facts | undefined>(undefined);
  const read = () => {
    if (store === undefined || device === undefined) return undefined;
    const snapshot = store.getSnapshot();
    const next = factsOf(device, snapshot, waitingIn(snapshot));
    const was = last.current;
    if (was !== undefined && sameFacts(was, next)) return was;
    last.current = next;
    return next;
  };
  return useSyncExternalStore(store?.subscribe ?? nothing, read, read);
}

function sameFacts(a: Facts, b: Facts): boolean {
  return (
    a.name === b.name &&
    a.standing === b.standing &&
    a.waiting === b.waiting &&
    a.renames === b.renames
  );
}

/** Every workspace this phone holds, the one in front first. */
export function useWorkspaceRows(): readonly WorkspaceRow[] {
  const { devices, paired, others } = useChips();
  // The one in front read as it changes; those behind as the provider counts them.
  const facts = useFrontFacts(paired?.store, paired?.device);
  return useMemo(
    () =>
      devices.map((device) => {
        if (device.deviceId === paired?.device.deviceId && facts !== undefined) {
          return { device, ...facts, front: true };
        }
        return rowOf(
          device,
          others.stores.get(device.deviceId)?.getSnapshot(),
          false,
          others.needs[device.deviceId] ?? 0,
        );
      }),
    [devices, paired, others, facts],
  );
}

/** What waits for the person in the workspace in front, read from its log. */
const waitingIn = (snapshot: Snapshot | undefined) =>
  snapshot === undefined ? 0 : attention(snapshot.model.needsYou, snapshot.readState).length;

function rowOf(
  device: Device,
  seen: Snapshot | undefined,
  front: boolean,
  waiting: number,
): WorkspaceRow {
  return { device, ...factsOf(device, seen, waiting), front };
}

function factsOf(device: Device, seen: Snapshot | undefined, waiting: number): Facts {
  const role = seen === undefined ? undefined : myRole(seen.model, device.participantId);
  return {
    // As its server last said, which a rename reaches first; until it has, as last stored.
    name: seen?.workspaceName ?? workspaceLabel(device),
    standing: standingIn(seen, device),
    waiting,
    renames: mayRenameWorkspace(role),
  };
}

/** Spaces' name, and what stands beside it. */
export interface WorkspaceTitle {
  /** The workspace in front's name, or the one on its way's. */
  readonly name: string;
  /** Something waits in another. */
  readonly elsewhere: boolean;
  /** Another workspace is on its way to the front, and this one only holds the screen until then. */
  readonly arriving: boolean;
  /** The one in front is the demo's made-up workspace (ADR 0213): its name wears a Demo tag. */
  readonly demo: boolean;
}

/**
 * Spaces' name: the workspace in front's, and whether something waits in another. While a switch
 * hands over, the one on its way's at once, though the one it replaces is still drawn under it.
 */
export function useWorkspaceTitle(): WorkspaceTitle {
  const rows = useWorkspaceRows();
  const { arriving } = useChips();
  if (arriving !== undefined) {
    const coming = rows.find((row) => row.device.deviceId === arriving.deviceId);
    return {
      name: coming?.name ?? workspaceLabel(arriving),
      elsewhere: false,
      arriving: true,
      demo: isDemo(arriving),
    };
  }
  const front = rows.find((row) => row.front);
  return {
    name: front?.name ?? "Spaces",
    elsewhere: rows.some((row) => !row.front && row.waiting > 0),
    arriving: false,
    demo: isDemo(front?.device),
  };
}

/** The sheet's two pages: the workspaces, and the one in front's name. */
type Page = { readonly kind: "list" } | { readonly kind: "name" };

/**
 * The workspaces, Rename for an owner, and Join another workspace. A row switches once the sheet
 * has gone: switching rebuilds the tabs on the store of the one chosen, this sheet's with them.
 * Rename turns to a page with the name in a field; saved, the sheet turns back to the list, which
 * shows it, as Spaces' title does. Scan a QR code opens the camera once the sheet has gone.
 */
export function WorkspacesSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const rows = useWorkspaceRows();
  const { switchTo, paired } = useChips();
  const router = useRouter();
  const leave = useLeave();
  const invites = usePasteInvite();
  const [page, setPage] = useState<Page>({ kind: "list" });
  const [problem, setProblem] = useState<string | undefined>(undefined);
  // The camera, and which time it was opened: each opening reads afresh (`InviteScan`).
  const [scanning, setScanning] = useState(false);
  const [scans, setScans] = useState(0);
  const after = useRef<(() => void) | undefined>(undefined);
  const front = rows.find((row) => row.front);
  const then = (act: () => void) => {
    after.current = act;
    onClose();
  };
  const gone = () => {
    const act = after.current;
    after.current = undefined;
    setProblem(undefined);
    setPage({ kind: "list" });
    act?.();
  };
  // What was pasted, opened on the join route once the sheet has gone; not an invite, said here.
  const take = (text: string) => {
    if (inviteFromLink(text) === undefined) {
      setProblem(NO_INVITE);
      return;
    }
    then(() => invites.pasted(text));
  };
  // The demo's made-up workspace (ADR 0213) is removed here, once the sheet has gone.
  const demo = rows.find((row) => isDemo(row.device));
  const list = () => (
    <ListPage
      rows={rows}
      problem={problem}
      onRow={(row) => (row.front ? onClose() : then(() => void switchTo(row.device.deviceId)))}
      renaming={front?.renames === true && !isDemo(front.device) ? front.name : undefined}
      onRename={() => setPage({ kind: "name" })}
      onPaste={take}
      onScan={() =>
        then(() => {
          setScans((count) => count + 1);
          setScanning(true);
        })
      }
      demoName={demo?.name}
      onRemoveDemo={
        demo === undefined
          ? undefined
          : () =>
              then(() => {
                const shown = demo.front ? paired?.store.getSnapshot() : undefined;
                const spaceIds = (shown?.model.spaces ?? []).map((space) => space.id);
                void leave(demo.device, spaceIds);
              })
      }
      // Offered to everyone, set up or not: the film's video, over the app (ADR 0217).
      onWatchDemo={() => then(() => router.push("/film"))}
    />
  );
  return (
    <>
      <Sheet open={open} onClose={onClose} onGone={gone} keyboard testID="workspaces-sheet">
        <SheetPages
          page={page}
          keyOf={(shown) => shown.kind}
          render={(shown) =>
            shown.kind === "name" && front !== undefined && paired !== undefined ? (
              <NamePage
                name={front.name}
                onBack={() => setPage({ kind: "list" })}
                onSave={(next) => paired.store.renameWorkspace(next)}
              />
            ) : (
              list()
            )
          }
        />
      </Sheet>
      <InviteScan key={scans} visible={scanning} onClose={() => setScanning(false)} />
    </>
  );
}

/**
 * The camera, from Scan a QR code: an invite on the screen of somebody beside you opens its join
 * sheet, as one pasted does, and any other code says it is not one. A new one each time the camera
 * opens, since a code once opened is not opened again by the same reading (`usePasteInvite`), and
 * a join backed out of may be scanned again.
 */
function InviteScan({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const invites = usePasteInvite();
  const [other, setOther] = useState(false);
  return (
    <ScanSheet
      visible={visible}
      reader={{
        working: false,
        failure: other ? NOT_AN_INVITE : invites.problem,
        scanned: (text) => setOther(!invites.scanned(text)),
      }}
      onClose={onClose}
    />
  );
}

/** The first page: each workspace, Rename for an owner, and Join another workspace. */
function ListPage({
  rows,
  problem,
  onRow,
  renaming,
  onRename,
  onPaste,
  onScan,
  onRemoveDemo,
  onWatchDemo,
  demoName,
}: {
  readonly rows: readonly WorkspaceRow[];
  readonly problem: string | undefined;
  readonly onRow: (row: WorkspaceRow) => void;
  /** The one in front's name, for an owner: Rename names it again. */
  readonly renaming: string | undefined;
  readonly onRename: () => void;
  readonly onPaste: (text: string) => void;
  /** Scan a QR code: the camera, once the sheet has gone. */
  readonly onScan: () => void;
  /** The demo's made-up workspace is here (ADR 0213): Remove takes it off this phone. */
  readonly onRemoveDemo?: (() => void) | undefined;
  /**
   * The demo's film again, from the first: once Look around has kept it, the end card that offers
   * them is gone, and this is the way back to them (the demo's walk, 21 October 2026).
   */
  readonly onWatchDemo?: (() => void) | undefined;
  /** What the demo is called in the list: Chips demo. */
  readonly demoName?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <View>
      <SheetTitle>Workspaces</SheetTitle>
      <SheetCard>
        {rows.map((row) => (
          <SheetRow
            key={row.device.deviceId}
            icon="chip"
            label={row.name}
            hint={row.standing === "" ? undefined : row.standing}
            trailing={<Trailing row={row} />}
            testID={`workspace-${row.device.deviceId}`}
            onPress={() => onRow(row)}
          />
        ))}
      </SheetCard>
      {renaming === undefined ? null : (
        <View style={styles.rename}>
          <SheetCard>
            <SheetRow
              icon="pen"
              label={`Rename ${renaming}`}
              hint="Everyone in it sees the new name"
              testID="workspace-rename"
              onPress={onRename}
            />
          </SheetCard>
        </View>
      )}
      {onWatchDemo === undefined && onRemoveDemo === undefined ? null : (
        <View style={styles.rename}>
          <SheetCard>
            {onWatchDemo === undefined ? null : (
              <SheetRow
                icon="play"
                label="Watch Chips work"
                hint="A one-minute film in a made-up workspace"
                testID="workspace-watch-demo"
                onPress={onWatchDemo}
              />
            )}
            {onRemoveDemo === undefined ? null : (
              <SheetRow
                icon="trash"
                label={`Remove ${demoName ?? ""}`}
                hint={`Its made-up spaces go from ${thisDevice()}`}
                testID="workspace-remove-demo"
                onPress={onRemoveDemo}
              />
            )}
          </SheetCard>
        </View>
      )}
      <View style={styles.join}>
        <Text accessibilityRole="header" style={[styles.joinTitle, { color: palette.ink }]}>
          Join another workspace
        </Text>
        <Text style={[styles.joinWords, { color: palette.ink3 }]}>
          Scan the code on the other person's screen, or paste the invite link from the message it
          came in. The workspaces you have stay.
        </Text>
        <View style={styles.ways}>
          <Pressable
            accessibilityRole="button"
            onPress={onScan}
            testID="workspace-scan"
            style={({ pressed }) => [
              styles.scan,
              {
                backgroundColor: pressed ? palette.surface2 : palette.surface,
                borderColor: palette.line2,
              },
            ]}
          >
            <Icon name="qr" size={20} color={palette.accent} weight={2} />
            <Text style={[styles.scanWord, { color: palette.accent }]}>Scan a QR code</Text>
          </Pressable>
          <PasteAction
            beside
            invites={{
              pasted: onPaste,
              paste: () => void Clipboard.getStringAsync().then(onPaste),
            }}
          />
        </View>
        {problem === undefined ? null : (
          <Text style={[styles.joinWords, { color: palette.red }]} testID="workspaces-problem">
            {problem}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * The workspace's name, changed by an owner (ADR 0194) from the switcher: the way back, the name
 * in a field, and Save. A name the server refuses stays in the field with the reason under it.
 */
function NamePage({
  name,
  onBack,
  onSave,
}: {
  readonly name: string;
  readonly onBack: () => void;
  readonly onSave: (name: string) => Promise<void>;
}) {
  const palette = usePalette();
  // Each turn to the page mounts it anew, so it starts from the name as it is then.
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const typed = draft.trim();
  const save = async () => {
    if (typed === "" || busy) return;
    if (typed === name) {
      onBack();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onSave(typed);
      onBack();
    } catch (failure) {
      setError(whyNotRenamed(failure));
      setBusy(false);
    }
  };
  return (
    <View style={styles.page}>
      <PageBack title="Workspace name" onBack={onBack} testID="workspace-name-back" />
      <View style={[styles.field, { backgroundColor: palette.surface, borderColor: palette.line }]}>
        <TextInput
          accessibilityLabel="Workspace name"
          testID="workspace-name-field"
          value={draft}
          onChangeText={(next) => {
            setDraft(next);
            setError(undefined);
          }}
          onSubmitEditing={() => void save()}
          submitBehavior="submit"
          returnKeyType="done"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          selectTextOnFocus
          // A new name more often replaces the old one than edits it: iOS's own clear button.
          clearButtonMode="while-editing"
          maxLength={120}
          placeholder="What everyone here calls it"
          placeholderTextColor={palette.ink3}
          style={[styles.input, { color: palette.ink }]}
        />
      </View>
      <Text
        style={[styles.joinWords, { color: error === undefined ? palette.ink3 : palette.red }]}
        testID={error === undefined ? undefined : "workspace-name-error"}
      >
        {error ?? "Everyone here sees the new name at once, on every device."}
      </Text>
      <Button
        label="Save"
        variant="primary"
        onPress={() => void save()}
        disabled={typed === ""}
        busy={busy}
      />
    </View>
  );
}

/** A tick on the one in front; how many things wait, on one behind. */
function Trailing({ row }: { readonly row: WorkspaceRow }) {
  const palette = usePalette();
  if (row.front) return <Icon name="check" size={20} color={palette.accent} />;
  if (row.waiting === 0) return null;
  return (
    <Text style={[styles.count, { backgroundColor: palette.red }]} testID="workspace-waiting">
      {row.waiting}
    </Text>
  );
}

const styles = StyleSheet.create({
  rename: { marginTop: SPACE.md },
  page: { gap: SPACE.md },
  field: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
  },
  input: { fontSize: TEXT.body, paddingVertical: SPACE.md },
  join: { marginTop: SPACE.lg, gap: SPACE.sm, paddingHorizontal: SPACE.xs },
  joinTitle: { fontSize: TEXT.body, fontWeight: "600" },
  joinWords: { fontSize: TEXT.sm },
  // Scan a QR code and iOS's Paste, half the row each and as tall.
  ways: { flexDirection: "row", gap: SPACE.sm },
  scan: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm - 1,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  scanWord: { fontSize: TEXT.body - 1, fontWeight: "600" },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
    textAlign: "center",
    fontSize: TEXT.sm,
    fontWeight: "700",
    color: "#ffffff",
  },
});

/** Why a rename did not take, in words: a server older than the app has no such route. */
export function whyNotRenamed(failure: unknown): string {
  const said = failure instanceof Error ? failure.message : "";
  if (/404|no route matches/i.test(said)) {
    return "Not saved: this server is older than the app, and can't rename a workspace yet.";
  }
  return said === "" ? "Not saved: the server would not take it." : said;
}
