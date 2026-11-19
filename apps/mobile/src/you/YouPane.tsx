/**
 * The page beside You's list on an iPad (ADR 0256), as Settings stands a page beside its own: People,
 * Invite someone, Relay, Media on this iPad, Connection, About Chips (ADR 0295) and Permissions (ADR
 * 0299), each the page a phone pushes, under the pane's bar and on the grouped ground. With nothing
 * open the pane says to choose a row. A person opened from People stands in a third column beside
 * it (`youThird`, ADR 0276), and so does New rule for every harness, opened from Permissions.
 *
 * The rows' sheets are pages here too (3 November 2026): your face, Decisions, Quiet hours,
 * Agents, the attachment limits, the messages between agents, Send feedback, Pair a
 * computer and Delete your account. You hands them over drawn, held by the same state as its rows
 * (`useYou`), and each stands on the grouped ground, as it stood on its sheet's. Workspace stays a
 * sheet, as Spaces' name opens it too. Connect a harness is a page here as beside Agents' list,
 * its pages held by its own provider, which follows the link they make (ADR 0284's addendum).
 */

import {
  ABOUT_TITLE,
  type Device,
  EVERY_HARNESS,
  LICENCE_TITLE,
  NEW_RULE_TITLE,
  NOTICES_TITLE,
  nameOf,
  type Store,
  WHATS_NEW_TITLE,
} from "@chipschat/core";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { AboutPage } from "../about/AboutPage";
import { LicencePage } from "../about/LicencePage";
import { NoticesPage } from "../about/NoticesPage";
import { WhatsNewPage } from "../about/WhatsNewPage";
import { thisDevice } from "../device/word";
import { ConnectPane } from "../harnesses/Connect";
import { NewRule } from "../harnesses/permissions/NewRule";
import { Invite } from "../people/Invite";
import { People } from "../people/People";
import { Person } from "../people/Person";
import type { FileService } from "../spaces/files";
import { useSnapshot } from "../store/provider";
import { OnGround } from "../ui/ground";
import type { Opened } from "../ui/opened";
import { Pane, PaneEmpty } from "../ui/Pane";
import { Screen } from "../ui/Screen";
import { SPACE } from "../ui/tokens";
import { ConnectionPage } from "./ConnectionPage";
import { MediaPage } from "./MediaPage";
import { isYouPage, isYouSheet, SheetPage, type YouPages } from "./pages";
import { RelayPage } from "./RelayPage";
import { useYouPermissions } from "./YouPermissions";

/**
 * What says what is open beside You: a page, on People a person's, and what a page opens a level
 * deeper (`YOU_THIRDS`).
 */
export const YOU_OPEN = ["page", "person", "third"] as const;

export function YouPane({
  device,
  store,
  files,
  opened,
  go,
  pages,
}: {
  readonly device: Device;
  readonly store: Store;
  readonly files: FileService;
  readonly opened: Opened;
  readonly go: (next: Opened) => void;
  /** The rows' sheets as pages, from You (`useYou`). */
  readonly pages: YouPages;
}) {
  const page = isYouPage(opened["page"]) ? opened["page"] : undefined;
  // On the grouped ground from the top: a sheet's body reads its ground before the page's own
  // screen says which, as on its sheet it read You's.
  const sheet = isYouSheet(page) ? pages[page] : undefined;
  if (sheet !== undefined) {
    return (
      <OnGround kind="grouped" key={page}>
        {sheet}
      </OnGround>
    );
  }
  const selfId = device.participantId;
  const workspace = device.workspaceName ?? device.workspaceId;
  switch (page) {
    case "people":
      return (
        <Pane title="People" grouped>
          <Screen grouped>
            <People
              store={store}
              selfId={selfId}
              workspace={workspace}
              onOpen={(id) => go({ page, person: id })}
              selected={opened["person"]}
            />
          </Screen>
        </Pane>
      );
    case "invite":
      return (
        <Pane title="Invite someone" grouped>
          <Screen grouped>
            <Invite store={store} selfId={selfId} workspace={workspace} />
          </Screen>
        </Pane>
      );
    case "relay":
      return (
        <Pane title="Relay" grouped>
          <Screen grouped>
            <RelayPage store={store} device={device} />
          </Screen>
        </Pane>
      );
    case "media":
      return (
        <Pane title={`Media on ${thisDevice()}`}>
          <Screen>
            <MediaPage store={store} files={files} selfId={selfId} spaceId={undefined} />
          </Screen>
        </Pane>
      );
    case "connection":
      return (
        <Pane title="Connection" grouped>
          <Screen grouped>
            <ConnectionPage store={store} device={device} />
          </Screen>
        </Pane>
      );
    case "about":
      return (
        <Pane title={ABOUT_TITLE} grouped>
          <Screen grouped>
            <AboutPage store={store} />
          </Screen>
        </Pane>
      );
    case "permissions":
      return <YouPermissionsPage store={store} selfId={selfId} />;
    case "connect":
      return <ConnectPane onClose={() => go({})} />;
    default:
      return (
        <PaneEmpty icon="user" title="Nothing open">
          Choose a row on the left.
        </PaneEmpty>
      );
  }
}

/**
 * What stands in a third column beside the page (ADR 0276): a person opened from People, whose row
 * is chosen beside them, or New rule for every harness, from Permissions. Its × goes back to the
 * page alone, and so does taking a person out. Where no third column fits it has the page's place,
 * with the way back.
 */
export function youThird({
  device,
  store,
  opened,
  go,
}: {
  readonly device: Device;
  readonly store: Store;
  readonly opened: Opened;
  readonly go: (next: Opened) => void;
}): ReactNode {
  const about = aboutThird(opened["third"]);
  if (opened["page"] === "about" && about !== undefined) {
    return (
      <Pane title={about.title} onClose={() => go({ page: "about" })} grouped>
        <Screen grouped>{about.page}</Screen>
      </Pane>
    );
  }
  if (opened["page"] === "permissions" && opened["third"] === "rule") {
    return <EveryRule store={store} onClose={() => go({ page: "permissions" })} />;
  }
  const person = opened["person"];
  if (opened["page"] !== "people" || person === undefined) return undefined;
  return (
    <YouPerson
      device={device}
      store={store}
      personId={person}
      onClose={() => go({ page: "people" })}
    />
  );
}

/** What About opens beside itself (ADR 0295): What's new, Licence or Acknowledgements. */
function aboutThird(
  third: string | undefined,
): { readonly title: string; readonly page: ReactNode } | undefined {
  switch (third) {
    case "whats-new":
      return { title: WHATS_NEW_TITLE, page: <WhatsNewPage /> };
    case "licence":
      return { title: LICENCE_TITLE, page: <LicencePage /> };
    case "notices":
      return { title: NOTICES_TITLE, page: <NoticesPage /> };
    default:
      return undefined;
  }
}

/** You → Permissions beside the list (ADR 0299), its Undo over the page's foot. */
function YouPermissionsPage({ store, selfId }: { readonly store: Store; readonly selfId: string }) {
  const snapshot = useSnapshot(store);
  const page = useYouPermissions({ store, snapshot, selfId });
  return (
    <SheetPage title="Permissions" over={page.over} testID="permissions-page">
      {page.body}
    </SheetPage>
  );
}

/** New rule for every harness (ADR 0299), beside Permissions; saved, back to it alone. */
function EveryRule({ store, onClose }: { readonly store: Store; readonly onClose: () => void }) {
  const snapshot = useSnapshot(store);
  return (
    <Pane title={NEW_RULE_TITLE} onClose={onClose} grouped>
      <Screen grouped testID="every-rule-page">
        <ScrollView contentContainerStyle={styles.rule} keyboardShouldPersistTaps="handled">
          <NewRule store={store} snapshot={snapshot} harnessId={EVERY_HARNESS} onDone={onClose} />
        </ScrollView>
      </Screen>
    </Pane>
  );
}

function YouPerson({
  device,
  store,
  personId,
  onClose,
}: {
  readonly device: Device;
  readonly store: Store;
  readonly personId: string;
  readonly onClose: () => void;
}) {
  const snapshot = useSnapshot(store);
  const workspace = device.workspaceName ?? device.workspaceId;
  return (
    <Pane title={nameOf(snapshot.directory, personId)} onClose={onClose} grouped>
      <Screen grouped>
        <Person
          store={store}
          selfId={device.participantId}
          personId={personId}
          workspace={snapshot.workspaceName ?? workspace}
          serverUrl={device.serverUrl}
          onRemoved={onClose}
        />
      </Screen>
    </Pane>
  );
}

const styles = StyleSheet.create({
  rule: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
});
