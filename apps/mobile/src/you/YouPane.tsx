/**
 * The page beside You's list on an iPad (ADR 0256), as Settings stands a page beside its own: People,
 * Invite someone, Relay, Media on this iPad and Connection, each the page a phone pushes, under the
 * pane's bar and on the grouped ground. With nothing open the pane says to choose a row. A person
 * opened from People stands in a third column beside it (`youThird`, ADR 0276), and so does every
 * ask so far, opened from the dots on Allowed always.
 *
 * The rows' sheets are pages here too (3 November 2026): your face, Decisions, Quiet hours,
 * Agents, the attachment limits, the messages between agents, Allowed always, Send feedback, Pair a
 * computer and Delete your account. You hands them over drawn, held by the same state as its rows
 * (`useYou`), and each stands on the grouped ground, as it stood on its sheet's. Two stay sheets:
 * Workspace, which Spaces' name opens too, and Connect a harness, which the Agents shelf's last
 * tile opens and whose link is waited on behind it.
 */

import { ASKS_TITLE, type Device, nameOf, type Store } from "@chipschat/core";
import type { ReactNode } from "react";
import { thisDevice } from "../device/word";
import { AskList } from "../harnesses/parts/AskList";
import { Invite } from "../people/Invite";
import { People } from "../people/People";
import { Person } from "../people/Person";
import type { FileService } from "../spaces/files";
import { useSnapshot } from "../store/provider";
import { OnGround } from "../ui/ground";
import type { Opened } from "../ui/opened";
import { Pane, PaneEmpty } from "../ui/Pane";
import { Screen } from "../ui/Screen";
import { ConnectionPage } from "./ConnectionPage";
import { MediaPage } from "./MediaPage";
import { isYouPage, isYouSheet, type YouPages } from "./pages";
import { RelayPage } from "./RelayPage";

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
 * is chosen beside them, or every ask so far, from Allowed always's dots. Its × goes back to the
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
  if (opened["page"] === "always" && opened["third"] === "asks") {
    return (
      <YouAsks store={store} selfId={device.participantId} onClose={() => go({ page: "always" })} />
    );
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

/** Every ask in the workspace, from Allowed always's dots: the list a harness's own dots open. */
function YouAsks({
  store,
  selfId,
  onClose,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly onClose: () => void;
}) {
  const snapshot = useSnapshot(store);
  return (
    <Pane title={ASKS_TITLE} onClose={onClose}>
      <AskList snapshot={snapshot} harnessId={undefined} selfId={selfId} />
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
